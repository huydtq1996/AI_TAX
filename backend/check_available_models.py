import os
from google import genai
from dotenv import load_dotenv

load_dotenv()
api_key = os.getenv("GEMINI_API_KEY")

if not api_key:
    print("Lỗi: GEMINI_API_KEY không tồn tại trong file .env")
    exit()

client = genai.Client(api_key=api_key)

print(f"{'--- DANH SÁCH MODELS KHẢ DỤNG ---':^60}")
print(f"{'Tên Model':<40} | {'Phương thức hỗ trợ'}")
print("-" * 70)

try:
    for m in client.models.list():
        # Lấy tên model
        name = m.name if m.name else "Unknown"
        
        # Xử lý an toàn cho description để tránh lỗi NoneType
        desc = m.description if m.description else "Không có mô tả."
        
        # Lấy danh sách phương thức hỗ trợ (thay đổi tùy theo version SDK thực tế)
        # Thông thường là m.supported_methods hoặc m.supported_generation_methods
        methods = ""
        if hasattr(m, 'supported_methods') and m.supported_methods:
            methods = ", ".join(m.supported_methods)
        elif hasattr(m, 'supported_generation_methods') and m.supported_generation_methods:
            methods = ", ".join(m.supported_generation_methods)
        else:
            methods = "N/A"

        print(f"{name:<40} | {methods}")
        # In thêm một phần mô tả ngắn gọn bên dưới nếu cần
        if m.description:
            print(f"   └─ {desc[:70]}...")
            
except Exception as e:
    print(f"\n[!] Có lỗi xảy ra trong quá trình quét: {e}")