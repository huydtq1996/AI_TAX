import os
import sys
import io
from google import genai
from dotenv import load_dotenv

if sys.stdout.encoding != 'utf-8':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

load_dotenv("backend/.env")
client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

def extract_pdf(pdf_path):
    print(f"=== Extracting {pdf_path} ===")
    uploaded_file = client.files.upload(file=pdf_path)
    response = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=[uploaded_file, "Hãy trích xuất tất cả các quy định về cách tính thuế, tỷ lệ thuế (GTGT, TNCN, v.v.), đối tượng áp dụng và bất kỳ công thức nào được đề cập trong Nghị định này. Trả lời bằng tiếng Việt, liệt kê rõ ràng các con số và nhóm ngành."]
    )
    print(response.text)
    print("="*40)

extract_pdf("documents/68_2026_ND-CP.pdf")
extract_pdf("documents/141_2026_ND-CP.pdf")
