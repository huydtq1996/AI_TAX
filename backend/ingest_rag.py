import os
import sys
import json
import argparse
import requests
import re
import io
import time
from google import genai
from google.genai import types
from dotenv import load_dotenv

# Đảm bảo stdout hỗ trợ UTF-8 để in tiếng Việt và emoji trên Windows
if sys.stdout.encoding != 'utf-8':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

# Tải các biến môi trường
load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY") or os.getenv("SUPABASE_ANON_KEY")

client = genai.Client(api_key=GEMINI_API_KEY)

# ==========================================
# 1. TƯƠNG TÁC SUPABASE VECTOR DB
# ==========================================
def embed_text(text, title=None):
    """Biến đổi văn bản thành Vector bằng Gemini Embedding 2 (768 chiều) với cơ chế thử lại"""
    for attempt in range(3):
        try:
            kwargs = {
                "model": "gemini-embedding-2",
                "contents": text,
                "config": types.EmbedContentConfig(
                    task_type="RETRIEVAL_DOCUMENT",
                    output_dimensionality=768
                )
            }
            if title:
                kwargs["config"].title = title
                
            result = client.models.embed_content(**kwargs)
            return result.embeddings[0].values
        except Exception as e:
            if "503" in str(e) or "overloaded" in str(e).lower():
                wait_time = (attempt + 1) * 2
                print(f"      [!] Server quá tải (503), đang thử lại sau {wait_time}s...")
                time.sleep(wait_time)
            else:
                print(f"Lỗi nhúng văn bản: {e}")
                return None
    return None

def insert_to_supabase(data):
    """Lưu Vector vào bảng tax_documents"""
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json"
    }
    response = requests.post(f"{SUPABASE_URL}/rest/v1/tax_documents", headers=headers, json=data)
    if response.status_code in [200, 201]:
        print(f"  [+] Đã lưu: {data['title']} - {data['content'][:40]}...")
    else:
        print(f"  [-] Lỗi lưu DB ({response.status_code}): {response.text}")

# ==========================================
# 2. AI TRÍCH XUẤT VÀ CHIA ĐOẠN (STRUCTURAL CHUNKING)
# ==========================================
def extract_and_chunk_with_gemini(content_parts):
    print("\n⏳ Đang nhờ AI Gemini bóc tách tài liệu theo cấu trúc pháp luật (Điều > Khoản > Điểm)...")
    model_name = "gemini-2.5-flash" 
    
    prompt = """
    Bạn là một chuyên gia Pháp luật cấp cao. Hãy đọc tài liệu đính kèm và bóc tách nội dung theo cấu trúc pháp luật Việt Nam.
    
    NHIỆM VỤ CỦA BẠN:
    1. Trích xuất chính xác ngày ban hành (issue_date) của văn bản.
    2. Chia nhỏ văn bản thành các đoạn (chunks) dựa trên cấu trúc: Điều > Khoản > Điểm.
    3. Mỗi chunk tương ứng với một đơn vị nội dung hoàn chỉnh (thường là một Khoản hoặc một Điều nếu điều đó ngắn).
    4. Tiêu đề (title) của mỗi chunk phải ghi rõ: [Tên văn bản] - [Điều X] - [Khoản Y].
    5. Nội dung (content) phải giữ nguyên văn, không tóm tắt, bao gồm cả bối cảnh của Điều đó nếu đoạn đó là một Khoản.
    
    YÊU CẦU ĐỊNH DẠNG JSON:
    Trả về duy nhất một mảng JSON:
    [
      {
        "title": "Thông tư số: 18/2026/TT-BTC - Điều 4 - Khoản 1",
        "content": "Nội dung đầy đủ của khoản 1 điều 4...",
        "issue_date": "YYYY-MM-DD",
        "metadata": {
            "law_name": "Thông tư số: 18/2026/TT-BTC",
            "article": "4",
            "section": "1",
            "type": "Thông tư"
        }
      }
    ]
    LƯU Ý: Tuyệt đối không thêm văn bản ngoài JSON. Nếu không rõ ngày ban hành, để null cho issue_date.
    """
    
    for attempt in range(3):
        try:
            # Chuẩn hóa đầu vào
            contents = content_parts if isinstance(content_parts, list) else [content_parts]
            contents.append(prompt)
            
            response = client.models.generate_content(
                model=model_name,
                contents=contents,
                config=types.GenerateContentConfig(response_mime_type="application/json")
            )
            
            # Làm sạch JSON (xử lý cả trường hợp AI bọc trong ```json)
            text_resp = response.text.strip()
            text_resp = re.sub(r'```json\n|```json|```', '', text_resp).strip()
                
            chunks = json.loads(text_resp)
            print(f"✅ Thành công! Đã bóc tách {len(chunks)} đoạn luật.")
            return chunks
        except Exception as e:
            if "503" in str(e) or "overloaded" in str(e).lower():
                wait_time = (attempt + 1) * 5
                print(f"  [!] Server quá tải (503). Đang thử lại sau {wait_time}s...")
                time.sleep(wait_time)
            else:
                print(f"❌ Lỗi AI: {e}")
                break
    return []

# ==========================================
# 3. TIẾP NHẬN ĐẦU VÀO (FILE / URL)
# ==========================================
def clean_html(raw_html):
    # Loại bỏ thẻ HTML thô sơ để đưa vào Gemini (Gemini vẫn đọc tốt HTML, nhưng loại bỏ bớt sẽ nhanh hơn)
    cleanr = re.compile('<.*?>')
    cleantext = re.sub(cleanr, ' ', raw_html)
    return ' '.join(cleantext.split())

def process_url(url):
    print(f"🌐 Đang tải dữ liệu từ URL: {url}")
    try:
        # Fake User-Agent để tránh bị block bởi một số trang web
        headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}
        res = requests.get(url, headers=headers, timeout=15)
        res.raise_for_status()
        text = clean_html(res.text)
        return text[:50000] # Giới hạn độ dài để xử lý tối ưu
    except Exception as e:
        print(f"Lỗi tải URL: {e}")
        sys.exit(1)

def process_file(file_path):
    if not os.path.exists(file_path):
        print(f"Lỗi: Không tìm thấy tệp tin [{file_path}]")
        sys.exit(1)
        
    ext = os.path.splitext(file_path)[1].lower()
    supported_extensions = ['.pdf', '.docx', '.doc', '.txt']
    
    if ext not in supported_extensions:
        print(f"Lỗi: Định dạng file '{ext}' không được hỗ trợ. Chỉ nhận: {', '.join(supported_extensions)}")
        sys.exit(1)
        
    if ext == '.txt':
        print(f"📝 Đang đọc tệp văn bản [{file_path}]...")
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                return f.read()
        except Exception as e:
            print(f"Lỗi đọc tệp văn bản: {e}")
            sys.exit(1)
            
    print(f"📄 Đang tải tệp tin [{file_path}] lên Google Cloud AI...")
    try:
        uploaded_file = client.files.upload(file=file_path)
        print("Đã tải lên hệ thống Gemini. Sẵn sàng xử lý!")
        return [uploaded_file]
    except Exception as e:
        print(f"Lỗi đọc/tải tệp tin: {e}")
        sys.exit(1)

def ingest_content(content_parts, source_name):
    # 1. AI bóc tách
    chunks = extract_and_chunk_with_gemini(content_parts)
    
    if not chunks:
        print(f"❌ Không có dữ liệu nào được bóc tách từ {source_name}. Bỏ qua.")
        return

    # 2. Nhúng Vector và Lưu DB
    print(f"\n🗄️ Đang lưu từng đoạn từ {source_name} vào cơ sở dữ liệu Supabase...")
    for idx, item in enumerate(chunks):
        print(f"  > Đang nhúng Vector ({idx+1}/{len(chunks)})...")
        vector = embed_text(item["content"], item.get("title"))
        if vector:
            row = {
                "title": item.get("title", f"Tài liệu {source_name}"),
                "content": item.get("content", ""),
                "metadata": item.get("metadata", {}),
                "issue_date": item.get("issue_date", None),
                "embedding": vector
            }
            insert_to_supabase(row)

def process_directory(dir_path):
    if not os.path.exists(dir_path):
        print(f"Lỗi: Thư mục không tồn tại [{dir_path}]")
        return
        
    if not os.path.isdir(dir_path):
        print(f"Lỗi: [{dir_path}] không phải là một thư mục.")
        return
        
    print(f"📂 Đang quét thư mục [{dir_path}]...")
    supported_extensions = ['.pdf', '.docx', '.doc', '.txt']
    files_to_ingest = []
    
    for root, dirs, files in os.walk(dir_path):
        for f in files:
            ext = os.path.splitext(f)[1].lower()
            if ext in supported_extensions:
                files_to_ingest.append(os.path.join(root, f))
                
    if not files_to_ingest:
        print("Không tìm thấy file nào có định dạng được hỗ trợ (.pdf, .docx, .doc, .txt) trong thư mục.")
        return
        
    print(f"Tìm thấy {len(files_to_ingest)} file phù hợp. Bắt đầu nạp dữ liệu...")
    for idx, file_path in enumerate(files_to_ingest):
        print(f"\n[{idx+1}/{len(files_to_ingest)}] Đang xử lý file: {os.path.basename(file_path)}")
        content_parts = process_file(file_path)
        ingest_content(content_parts, os.path.basename(file_path))

def main():
    print("="*60)
    print("🚀 AI TAX - HỆ THỐNG NẠP CƠ SỞ TRI THỨC (AUTO-RAG)")
    print("="*60)
    
    parser = argparse.ArgumentParser(description="Công cụ nhúng dữ liệu vào Supabase bằng AI")
    parser.add_argument('--url', type=str, help='Link bài viết website')
    parser.add_argument('--pdf', type=str, help='Đường dẫn file PDF (Đã cũ, khuyên dùng --file)')
    parser.add_argument('--file', type=str, help='Đường dẫn file hoặc thư mục tài liệu (.pdf, .docx, .doc, .txt)')
    parser.add_argument('--text', type=str, help='Câu text trực tiếp')
    args = parser.parse_args()

    if not GEMINI_API_KEY or not SUPABASE_URL:
        print("Lỗi: Thiếu cấu hình GEMINI_API_KEY hoặc SUPABASE_URL trong .env")
        return

    # Nếu chạy không đối số thì kích hoạt giao diện tương tác
    if not (args.url or args.file or args.pdf or args.text):
        print("Vui lòng chọn nguồn dữ liệu nạp tri thức:")
        print("1. Đường dẫn website")
        print("2. File văn bản luật (pdf/doc/docx/txt)")
        print("3. Thư mục chứa văn bản luật")
        
        try:
            choice = input("Nhập lựa chọn của bạn (1-3): ").strip()
            
            if choice == '1':
                url = input("Vui lòng nhập đường dẫn tới website: ").strip()
                url = url.strip('\'"')
                if not url:
                    print("Lỗi: Đường dẫn không được để trống.")
                    return
                content_parts = process_url(url)
                ingest_content(content_parts, url)
                
            elif choice == '2':
                file_path = input("Vui lòng nhập đường dẫn file: ").strip()
                file_path = file_path.strip('\'"')  # Hỗ trợ kéo thả tệp tin trên Windows
                if not file_path:
                    print("Lỗi: Đường dẫn file không được để trống.")
                    return
                content_parts = process_file(file_path)
                ingest_content(content_parts, os.path.basename(file_path))
                
            elif choice == '3':
                dir_path = input("Vui lòng nhập đường dẫn thư mục: ").strip()
                dir_path = dir_path.strip('\'"')  # Hỗ trợ kéo thả thư mục trên Windows
                if not dir_path:
                    print("Lỗi: Đường dẫn thư mục không được để trống.")
                    return
                process_directory(dir_path)
                
            else:
                print("Lỗi: Lựa chọn không hợp lệ.")
                return
                
        except KeyboardInterrupt:
            print("\nĐã hủy quá trình bởi người dùng.")
            return
            
        print("\n🎉 HOÀN TẤT NẠP TÀI LIỆU VÀO CƠ SỞ TRI THỨC!")
        return

    # Nếu chạy qua Command Line đối số
    if args.url:
        content_parts = process_url(args.url)
        ingest_content(content_parts, args.url)
    elif args.text:
        ingest_content(args.text, "Văn bản trực tiếp")
    elif args.file or args.pdf:
        path_to_process = args.file or args.pdf
        if not os.path.exists(path_to_process):
            print(f"Lỗi: Đường dẫn không tồn tại [{path_to_process}]")
            return
            
        if os.path.isdir(path_to_process):
            process_directory(path_to_process)
        else:
            content_parts = process_file(path_to_process)
            ingest_content(content_parts, os.path.basename(path_to_process))

    print("\n🎉 HOÀN TẤT NẠP TÀI LIỆU VÀO CƠ SỞ TRI THỨC!")

if __name__ == "__main__":
    main()
