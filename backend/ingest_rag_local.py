import os
import sys
import json
import argparse
import requests
import re
import io
import pdfplumber
from sentence_transformers import SentenceTransformer
from dotenv import load_dotenv

# Đảm bảo stdout hỗ trợ UTF-8 để in tiếng Việt và emoji trên Windows
if sys.stdout.encoding != 'utf-8':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

# Tải các biến môi trường
load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY") or os.getenv("SUPABASE_ANON_KEY")

# ==========================================
# KHỞI TẠO HỆ THỐNG
# ==========================================
print("="*60)
print("🚀 ĐANG KHỞI TẠO HỆ THỐNG STRUCTURAL RAG...")
print("="*60)

# Khởi tạo Embedding Model
print("📦 Đang nạp model Embedding (vietnamese-sbert)...")
embed_model = SentenceTransformer('keepitreal/vietnamese-sbert')

# ==========================================
# 1. TIỀN XỬ LÝ VÀ CHUNKING THEO CẤU TRÚC
# ==========================================

def clean_text(text):
    """Làm sạch văn bản: bỏ khoảng trắng thừa, dòng trống rác"""
    text = re.sub(r'\n\s*\n', '\n\n', text)
    text = "\n".join([line.strip() for line in text.split('\n')])
    return text

def structural_chunking(text, doc_title="Tài liệu luật"):
    """
    Chiến lược Chunking theo cấu trúc Điều/Khoản
    """
    print(f"\n🔍 Đang phân tích cấu trúc văn bản: {doc_title}")
    
    # 1. Tách theo "Điều X."
    article_pattern = r'(Điều\s+\d+[\.\:]?)'
    parts = re.split(article_pattern, text)
    
    chunks = []
    
    # parts: [text_truoc_dieu_1, "Điều 1", noi_dung_dieu_1, "Điều 2", noi_dung_dieu_2...]
    for i in range(1, len(parts), 2):
        article_name = parts[i].strip()
        article_body = parts[i+1].strip() if (i+1) < len(parts) else ""
        
        # Lấy tiêu đề Điều (thường là dòng đầu tiên của body)
        body_lines = article_body.split('\n')
        article_topic = body_lines[0].strip() if body_lines else ""
        
        full_article_text = f"{article_name} {article_body}"
        
        # Ngưỡng tách: ~800 tokens (khoảng 3500 ký tự)
        if len(full_article_text) < 3500:
            context_header = f"Trích {article_name}, {doc_title} (Về {article_topic}):\n"
            chunks.append({
                "title": f"{doc_title} - {article_name}",
                "content": context_header + full_article_text,
                "metadata": {"doc_title": doc_title, "article": article_name, "topic": article_topic}
            })
        else:
            # Điều quá dài: Tách tiếp theo "Khoản X."
            print(f"  [!] {article_name} quá dài, đang tách theo Khoản...")
            clause_pattern = r'(\n\d+\.\s)' # Tìm "1. ", "2. " ở đầu dòng
            clauses = re.split(clause_pattern, article_body)
            
            for j in range(1, len(clauses), 2):
                clause_num = clauses[j].strip()
                clause_body = clauses[j+1].strip() if (j+1) < len(clauses) else ""
                
                context_header = f"Trích Khoản {clause_num} {article_name}, {doc_title} (Về {article_topic}):\n"
                chunks.append({
                    "title": f"{doc_title} - {article_name} (Khoản {clause_num})",
                    "content": context_header + clause_body,
                    "metadata": {"doc_title": doc_title, "article": article_name, "clause": clause_num, "topic": article_topic}
                })

    if not chunks:
        print("  [!] Không tìm thấy cấu trúc Điều/Khoản, dùng phân đoạn theo độ dài.")
        return simple_chunking(text, doc_title)

    print(f"✅ Đã trích xuất thành công {len(chunks)} đoạn luật theo cấu trúc!")
    return chunks

def simple_chunking(text, doc_title, chunk_size=1500, overlap=300):
    chunks = []
    start = 0
    while start < len(text):
        end = start + chunk_size
        chunk_content = text[start:end]
        chunks.append({
            "title": f"{doc_title} (Trích đoạn)",
            "content": f"Trích từ {doc_title}:\n...{chunk_content}...",
            "metadata": {"doc_title": doc_title, "type": "manual_chunk"}
        })
        start += (chunk_size - overlap)
    return chunks

# ==========================================
# 2. TƯƠNG TÁC SUPABASE
# ==========================================

def insert_to_supabase(data):
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json"
    }
    response = requests.post(f"{SUPABASE_URL}/rest/v1/tax_documents_for_local", headers=headers, json=data)
    if response.status_code in [200, 201]:
        print(f"  [+] Đã lưu: {data['title']}")
    else:
        print(f"  [-] Lỗi lưu DB ({response.status_code}): {response.text}")

# ==========================================
# 3. XỬ LÝ ĐẦU VÀO
# ==========================================

def process_url(url):
    print(f"🌐 Đang tải dữ liệu từ URL: {url}")
    try:
        headers = {'User-Agent': 'Mozilla/5.0'}
        res = requests.get(url, headers=headers, timeout=15)
        res.raise_for_status()
        cleanr = re.compile('<.*?>')
        text = re.sub(cleanr, ' ', res.text)
        return ' '.join(text.split())
    except Exception as e:
        print(f"❌ Lỗi tải URL: {e}")
        sys.exit(1)

def process_pdf(pdf_path):
    print(f"📄 Đang đọc file PDF local: {pdf_path}")
    try:
        full_text = ""
        with pdfplumber.open(pdf_path) as pdf:
            for page in pdf.pages:
                text = page.extract_text()
                if text:
                    full_text += text + "\n"
        return full_text
    except Exception as e:
        print(f"❌ Lỗi đọc PDF: {e}")
        sys.exit(1)

# ==========================================
# CHƯƠNG TRÌNH CHÍNH
# ==========================================

def main():
    parser = argparse.ArgumentParser(description="Công cụ RAG Local - Structural Chunking")
    parser.add_argument('--url', type=str)
    parser.add_argument('--pdf', type=str)
    parser.add_argument('--text', type=str)
    parser.add_argument('--title', type=str, required=True, help="Tên văn bản (VD: Thông tư số: 18/2026/TT-BTC)")
    args = parser.parse_args()

    if not SUPABASE_URL or not SUPABASE_KEY:
        print("❌ Lỗi: Thiếu SUPABASE_URL hoặc SUPABASE_KEY trong .env")
        return

    raw_text = ""
    if args.url:
        raw_text = process_url(args.url)
    elif args.pdf:
        raw_text = process_pdf(args.pdf)
    elif args.text:
        raw_text = args.text
    else:
        print("Vui lòng cung cấp nguồn dữ liệu (--pdf, --url, hoặc --text)")
        return

    if not raw_text:
        print("❌ Không có nội dung để xử lý.")
        return

    clean_raw_text = clean_text(raw_text)
    chunks = structural_chunking(clean_raw_text, args.title)
    
    print(f"\n🗄️ Đang tạo Vector và lưu vào Supabase (Tổng {len(chunks)} đoạn)...")
    for idx, item in enumerate(chunks):
        print(f"  > [{idx+1}/{len(chunks)}] Đang nhúng vector...")
        try:
            vector = embed_model.encode(item["content"]).tolist()
            row = {
                "title": item["title"],
                "content": item["content"],
                "issue_date": None,
                "embedding": vector,
                "metadata": item["metadata"]
            }
            insert_to_supabase(row)
        except Exception as e:
            print(f"  [!] Lỗi tại đoạn {idx+1}: {e}")

    print("\n🎉 HOÀN TẤT NẠP TÀI LIỆU VỚI CHIẾN LƯỢC CHIA CẤU TRÚC (ĐIỀU > KHOẢN > ĐIỂM > ...)!")

if __name__ == "__main__":
    main()
