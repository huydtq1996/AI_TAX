import os
import sys
import json
import argparse
import requests
import re
from google import genai
from google.genai import types
from dotenv import load_dotenv

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
    """Biến đổi văn bản thành Vector đa ngôn ngữ (768 chiều)"""
    try:
        kwargs = {
            "model": "text-embedding-004",
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
        print(f"Lỗi nhúng văn bản: {e}")
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
# 2. AI TRÍCH XUẤT VÀ CHIA ĐOẠN (CHUNKING)
# ==========================================
def extract_and_chunk_with_gemini(content_parts):
    print("\n⏳ Đang nhờ AI Gemini bóc tách tài liệu (Auto-Chunking)...")
    model_name = "gemini-2.5-flash"
    
    prompt = """
    Bạn là một chuyên gia Pháp lý và Thuế. Hãy đọc tài liệu đính kèm và trích xuất các điều luật, quy định quan trọng.
    Chia tài liệu thành các đoạn (chunk) nhỏ có ý nghĩa (khoảng 100-300 chữ mỗi đoạn) để làm dữ liệu tìm kiếm Vector.
    Tuyệt đối loại bỏ các thông tin rác, mục lục, lời mở đầu. Chỉ giữ nội dung cốt lõi của luật.
    
    YÊU CẦU: CHỈ TRẢ VỀ ĐÚNG MỘT MẢNG JSON, không kèm bất kỳ đoạn hội thoại, không bọc bằng markdown, bắt đầu bằng '[' và kết thúc bằng ']'. Format chuẩn:
    [
      {
        "title": "Tên văn bản hoặc Chương (VD: Thông tư 40/2021)",
        "content": "Nội dung chi tiết của điều luật hoặc quy định...",
        "metadata": {"topic": "từ_khóa_1, từ_khóa_2"}
      }
    ]
    """
    
    try:
        parts = content_parts if isinstance(content_parts, list) else [content_parts]
        parts.append(prompt)
        
        response = client.models.generate_content(
            model=model_name,
            contents=parts
        )
        
        # Xử lý text để chắc chắn là JSON hợp lệ
        text_resp = response.text.strip()
        if text_resp.startswith('```json'):
            text_resp = text_resp[7:-3].strip()
        elif text_resp.startswith('```'):
            text_resp = text_resp[3:-3].strip()
            
        chunks = json.loads(text_resp)
        print(f"✅ AI đã trích xuất thành công {len(chunks)} đoạn luật!")
        return chunks
    except Exception as e:
        print(f"❌ Lỗi khi AI phân tích tài liệu: {e}")
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

def process_pdf(pdf_path):
    print(f"📄 Đang tải file PDF [{pdf_path}] lên Google Cloud AI...")
    try:
        # File API của Gemini xử lý PDF native cực mạnh mà không cần dùng PyPDF2
        uploaded_file = client.files.upload(file=pdf_path)
        print("Đã tải lên hệ thống Gemini. Sẵn sàng xử lý!")
        return [uploaded_file]
    except Exception as e:
        print(f"Lỗi đọc file PDF: {e}")
        sys.exit(1)

def main():
    print("="*60)
    print("🚀 AI TAX - HỆ THỐNG NẠP CƠ SỞ TRI THỨC (AUTO-RAG)")
    print("="*60)
    
    parser = argparse.ArgumentParser(description="Công cụ nhúng dữ liệu vào Supabase bằng AI")
    parser.add_argument('--url', type=str, help='Link bài viết website')
    parser.add_argument('--pdf', type=str, help='Đường dẫn file PDF')
    parser.add_argument('--text', type=str, help='Câu text trực tiếp')
    args = parser.parse_args()

    if not GEMINI_API_KEY or not SUPABASE_URL:
        print("Lỗi: Thiếu cấu hình GEMINI_API_KEY hoặc SUPABASE_URL trong .env")
        return

    content_parts = None
    if args.url:
        content_parts = process_url(args.url)
    elif args.pdf:
        content_parts = process_pdf(args.pdf)
    elif args.text:
        content_parts = args.text
    else:
        print("Vui lòng cung cấp NGUỒN TÀI LIỆU bằng 1 trong các lệnh sau:")
        print("  python ingest_rag.py --url \"https://thuvienphapluat.vn/...\"")
        print("  python ingest_rag.py --pdf \"LuatThuTuc2025.pdf\"")
        print("  python ingest_rag.py --text \"Nhập nội dung luật vào đây...\"")
        return

    # 1. AI bóc tách
    chunks = extract_and_chunk_with_gemini(content_parts)
    
    if not chunks:
        print("Không có dữ liệu nào được bóc tách. Quá trình thất bại.")
        return

    # 2. Nhúng Vector và Lưu DB
    print("\n🗄️ Đang lưu từng đoạn vào cơ sở dữ liệu Supabase...")
    for idx, item in enumerate(chunks):
        print(f"  > Đang nhúng Vector ({idx+1}/{len(chunks)})...")
        vector = embed_text(item["content"], item.get("title"))
        if vector:
            row = {
                "title": item.get("title", "Tài liệu luật"),
                "content": item.get("content", ""),
                "metadata": item.get("metadata", {}),
                "embedding": vector
            }
            insert_to_supabase(row)

    print("\n🎉 HOÀN TẤT NẠP TÀI LIỆU VÀO CƠ SỞ TRI THỨC!")

if __name__ == "__main__":
    main()
