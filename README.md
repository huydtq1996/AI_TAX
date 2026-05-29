# AI Trợ lý Khai báo Thuế & Quản lý Kế hoạch

Dự án được xây dựng dựa trên sơ đồ quy trình, sử dụng AI (Gemini 2.0 Flash) và RAG, kết hợp với công thức tính thuế cứng để đảm bảo tính minh bạch, công bằng và đáng tin cậy cho Hộ kinh doanh.

## Tính năng
- Tra cứu luật thuế (RAG với Supabase Vector DB)
- Tính thuế Hộ Kinh Doanh (công thức cứng theo thông tư 40/2021/TT-BTC)
- Tư vấn thuế tự động qua Chat (Gemini 3.0 Flash)
- Chống Prompt Injection (Guard Service)
- Giao diện hiện đại với Next.js & Tailwind CSS

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
└── README.md             # Hướng dẫn này
```

## Hướng dẫn cài đặt và chạy

### 1. Chạy Backend (Python Flask)
1. Mở Terminal và di chuyển vào thư mục backend:
   ```cmd
   cd backend
   ```
2. Cài đặt các thư viện:
   ```cmd
   pip install -r requirements.txt
   ```
3. Tạo file `.env` từ `.env.example` và điền API keys (Gemini, Supabase).
4. Chạy server:
   ```cmd
   python app.py
   ```
   *Backend sẽ chạy tại: http://localhost:5000*

### 2. Chạy Frontend (Next.js)
1. Mở một Terminal mới và di chuyển vào thư mục frontend:
   ```cmd
   cd frontend
   ```
2. Cài đặt dependencies (nếu chưa có Node.js thì cần cài đặt trước):
   ```cmd
   npm install
   ```
3. Chạy chế độ phát triển:
   ```cmd
   npm run dev
   ```
   *Frontend sẽ chạy tại: http://localhost:3000*

## Lưu ý về Bảo mật
- Không bao giờ commit file `.env` hoặc `.env.local` lên GitHub.
- Các API Key phải được quản lý cẩn thận trong các biến môi trường.
