# AI Trợ lý Khai báo Thuế & Quản lý Kế hoạch

Dự án được xây dựng dựa trên sơ đồ quy trình, sử dụng AI (Gemini 2.5 Flash, Gemini Embedding 2) và RAG (Retrieval-Augmented Generation), kết hợp với công thức tính thuế cứng để đảm bảo tính minh bạch, công bằng và đáng tin cậy cho Hộ kinh doanh.

## Tính năng
- **Tra cứu luật thuế:** Cơ chế RAG tìm kiếm thông tin luật thuế sử dụng Supabase Vector DB (độ dài vector 768 chiều từ `gemini-embedding-2`).
- **Tính thuế Hộ Kinh Doanh:** Tính toán tự động theo công thức cứng quy định tại Thông tư 40/2021/TT-BTC cho nhiều nhóm ngành nghề khác nhau.
- **Tư vấn thuế tự động qua Chat:** Hỗ trợ giải đáp các thắc mắc về thuế bằng mô hình ngôn ngữ lớn `gemini-2.5-flash`.
- **Hỗ trợ tải lên & Phân tích tệp tin:** Hỗ trợ đính kèm tệp Excel, CSV, PDF hoặc hình ảnh hóa đơn/tờ khai trực tiếp trong cuộc hội thoại để AI phân tích.
- **Bảo mật dữ liệu tối đa:** Tệp tin tải lên được mã hóa tự động trên đĩa của máy chủ bằng khóa bảo mật động và lưu trữ an toàn. Lịch sử chat được lưu trữ bảo mật qua Supabase Auth & DB.
- **Chống Prompt Injection:** Tích hợp Guard Service để kiểm duyệt đầu vào chống tấn công prompt injection cũng như rò rỉ dữ liệu nhạy cảm đầu ra.
- **Giao diện hiện đại:** Xây dựng bằng Next.js 14 với phong cách thiết kế Vanilla CSS mượt mà, tối ưu hóa giao diện người dùng theo chuẩn responsive.

## Cấu trúc Dự án
```
AI_TAX/
├── backend/              # Python Flask API
│   ├── app.py            # Server chính
│   ├── services/         # Logic xử lý (Gemini, Supabase, Tax)
│   └── requirements.txt  # Dependencies của Python
├── frontend/             # Next.js Application
│   ├── app/              # Trang và Components
│   ├── public/           # Assets tĩnh
│   └── package.json      # Dependencies của Node.js
├── documents/            # Tài liệu luật thuế (PDF)
├── uploads/              # Thư mục chứa dữ liệu do người dùng tải lên
└── README.md             # Hướng dẫn này
```

## Hướng dẫn cài đặt và chạy thử nghiệm
### Yêu cầu cài đặt trước
- Node.js (24.15.0)
- Python (3.14.4)
- Ngrok

### 1. Chạy Backend (Python Flask)
1. Mở Terminal và di chuyển vào thư mục backend:
   ```cmd
   cd backend
   ```
2. Cài đặt các thư viện cần thiết:
   ```cmd
   pip install -r requirements.txt
   ```
3. Tạo file `.env` từ `.env.example` và điền các khóa API cần thiết:
   - `GEMINI_API_KEY`: API key của Google AI Studio.
   - `SUPABASE_URL` & `SUPABASE_SERVICE_ROLE_KEY`: Cấu hình kết nối Supabase.
   - `ENCRYPTION_KEY`: Khóa mã hóa tệp tin.
4. Chạy server Flask (mặc định chạy tại cổng 5000):
   ```cmd
   python app.py
   ```
   *Lưu ý: Backend chỉ cần chạy nội bộ (localhost:5000).*

### 2. Chạy Frontend (Next.js)
1. Mở một Terminal mới và di chuyển vào thư mục frontend:
   ```cmd
   cd frontend
   ```
2. Cài đặt các gói phụ thuộc (dependencies):
   ```cmd
   npm install
   ```
3. Chạy chế độ phát triển (mặc định tại cổng 3000):
   ```cmd
   npm run dev
   ```

### 3. Cấu hình Proxy và chạy thử nghiệm an toàn bằng Ngrok
Hệ thống sử dụng Next.js Reverse Proxy để chuyển hướng mọi yêu cầu `/api/*` từ Frontend tự động sang Flask Backend ở cổng `5000`. Điều này cho phép bạn chia sẻ ứng dụng qua Ngrok mà chỉ cần công khai cổng `3000`:

1. Khởi chạy Ngrok trỏ tới cổng Next.js:
   ```cmd
   ngrok http 3000
   ```
2. Khi chia sẻ đường dẫn HTTPS từ Ngrok (ví dụ: `https://xxxx.ngrok-free.dev`), Next.js đã được cấu hình tự động cho phép kết nối chéo qua cấu hình `allowedDevOrigins` trong `next.config.mjs` nhằm đảm bảo tính năng Hot Reload và WebSocket hoạt động trơn tru.

## Lưu ý về Bảo mật
- Tuyệt đối không commit file `.env` của backend hoặc `.env.local` lên GitHub.
- Các API Keys và khóa mã hóa cần được lưu trữ an toàn trong các biến môi trường của môi trường deploy thực tế.
