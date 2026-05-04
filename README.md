# AI Trợ lý Khai báo Thuế & Quản lý Kế hoạch

Dự án được xây dựng dựa trên sơ đồ quy trình, sử dụng AI (Gemini 2.0 Flash) và RAG, kết hợp với công thức tính thuế cứng để đảm bảo tính minh bạch, công bằng và đáng tin cậy cho Hộ kinh doanh.

## Tính năng
- Tra cứu luật thuế (RAG mô phỏng với Supabase)
- Tính thuế Hộ Kinh Doanh (công thức cứng theo thông tư 40/2021/TT-BTC)
- Tư vấn thuế tự động qua Chat (Gemini)
- Chống Prompt Injection (Guard Service)
- Hỗ trợ nhập liệu bằng giọng nói (Voice Input)

## Cấu trúc
```
AI_TAX/
├── backend/
│   ├── app.py                # Server Flask chính
│   ├── requirements.txt      # Các thư viện Python cần thiết
│   ├── .env.example          # File mẫu cấu hình API keys
│   ├── services/
│   │   ├── gemini_service.py # Gọi Google Gemini API
│   │   ├── supabase_service.py # Kết nối Supabase (Vector DB/RAG)
│   │   ├── guard_service.py  # Kiểm duyệt prompt
│   │   └── tax_calculator.py # Tính toán thuế bằng công thức cứng
│   ├── templates/
│   │   └── index.html        # Giao diện Frontend
│   └── static/
│       ├── style.css         # CSS làm đẹp giao diện
│       └── script.js         # JavaScript xử lý Chat, Gọi API, Voice Input
```

## Hướng dẫn cài đặt và chạy (Backend & Giao diện)

1. Mở Terminal (Command Prompt hoặc PowerShell)
2. Di chuyển vào thư mục backend:
   ```cmd
   cd d:\Softwares\AI_TAX\backend
   ```
3. Cài đặt các thư viện Python:
   ```cmd
   pip install -r requirements.txt
   ```
4. Đổi tên file `.env.example` thành `.env` và điền API keys của bạn:
   - `GEMINI_API_KEY`: Key của Google AI Studio (Gemini)
   - `SUPABASE_URL`: Đường dẫn Supabase Project
   - `SUPABASE_ANON_KEY`: Key API của Supabase
5. Chạy ứng dụng:
   ```cmd
   python app.py
   ```
6. Mở trình duyệt web và truy cập: `http://localhost:5000`

## Về Next.js (Lưu ý)
Do máy bạn hiện chưa cài đặt Node.js (`npx` không hoạt động), mình đã triển khai Frontend bằng Vanilla HTML/JS/CSS siêu đẹp và mượt mà, được serve trực tiếp từ Flask để bạn có thể test ngay lập tức mà không cần cài thêm Node.js. 
Khi bạn đã cài đặt Node.js, chúng ta có thể dễ dàng chuyển đổi frontend này sang Next.js bằng cách sử dụng các components của React.
