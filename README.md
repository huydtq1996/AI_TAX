# AI Trợ lý Khai báo Thuế & Quản lý Kế hoạch

Dự án được xây dựng dựa trên sơ đồ quy trình, sử dụng AI (Gemini 2.5 Flash, Gemini Embedding 2) và RAG (Retrieval-Augmented Generation), kết hợp với công thức tính thuế cứng để đảm bảo tính minh bạch, công bằng và đáng tin cậy cho Hộ kinh doanh.

## Tính năng Nổi Bật
- **Tra cứu luật thuế chính xác:** Cơ chế RAG tìm kiếm thông tin luật thuế sử dụng Supabase Vector DB (độ dài vector 768 chiều từ `gemini-embedding-2`).
- **Tính thuế Hộ Kinh Doanh:** Tính toán tự động, chuẩn xác tuyệt đối theo các quy định mới nhất: Luật Thuế GTGT 48/2024/QH15, Luật Thuế TNCN 109/2025/QH15, và các Nghị định 141/2026/NĐ-CP, 68/2026/NĐ-CP. Hỗ trợ nhiều nhóm ngành nghề và phương pháp tính.
- **Tư vấn thuế tự động qua Chat:** Hỗ trợ giải đáp các thắc mắc về thuế bằng mô hình ngôn ngữ lớn `gemini-2.5-flash`, kết hợp với bộ phân loại ngữ cảnh thông minh (Context Classifier).
- **Phân tích tệp tin nâng cao:** Hỗ trợ tải lên tệp Excel, CSV, PDF hoặc hình ảnh hóa đơn/biên lai trực tiếp trong cuộc hội thoại để AI trích xuất giao dịch (Thu/Chi) và phân tích số liệu.
- **Bảo mật dữ liệu tối đa:** Tệp tin tải lên được mã hóa tự động trên đĩa của máy chủ bằng khóa bảo mật động và lưu trữ an toàn. Dữ liệu chỉ được giải mã in-memory khi AI cần xử lý.
- **Chống Tấn Công LLM (Multi-layer WAF):** Tích hợp Guard Service để kiểm duyệt đầu vào (chống XML/Template/Prompt Injection, Tokenizer DOS) và bảo vệ đầu ra (chống rò rỉ System Prompt).
- **Giao diện hiện đại:** Xây dựng bằng Next.js 14 với phong cách thiết kế Vanilla CSS mượt mà, tối ưu hóa giao diện người dùng theo chuẩn responsive.

## Đánh Giá Hệ Thống Theo 5 Trục (5-Axis Evaluation)

Dự án được thiết kế và xây dựng dựa trên 5 tiêu chuẩn khắt khe dành cho AI trong lĩnh vực tài chính/pháp lý:

1. **Reliability (Tính Đáng Tin Cậy)**
   - Sử dụng phương pháp **Hybrid**: Kết hợp AI (đọc hiểu, trích xuất) với **Toán học tất định (Deterministic Logic)** thông qua class `TaxCalculator` được hardcode công thức thuế. Hạn chế hoàn toàn việc giao LLM tự làm toán để tránh "ảo giác" (hallucination).
   - Cơ chế RAG thông minh (Scoring system) chỉ kích hoạt khi câu hỏi đạt đủ "trọng số chuyên môn", kết hợp với Exponential Backoff tự động retry khi API quá tải.

2. **Bias (Giảm Thiểu Định Kiến)**
   - Công thức thuế khách quan, không phân biệt quy mô doanh nghiệp.
   - System Prompt khóa chặt AI vào luật lệ Việt Nam, ngăn LLM mang định kiến từ tập dữ liệu huấn luyện quốc tế vào việc tư vấn.
   - Khi người dùng thiếu thông tin ngành nghề, AI sẽ tự động chọn "Hoạt động kinh doanh khác" nhưng **bắt buộc minh bạch** báo cho người dùng biết về sự giả định này.

3. **Robustness (Tính Vững Chắc & Kháng Lỗi)**
   - **Bảo vệ nhiều lớp (Guard Service):** Sanitization thẻ XML, chặn câu hỏi quá nhiều ký tự đặc biệt (chống tấn công DOS tokenizer), danh sách đen từ khóa Jailbreak (như "ignore previous", "dan"), và Regex chặn mã độc.
   - **Mã hóa đầu cuối:** Bảo vệ file nhạy cảm (hóa đơn, chứng từ) của người dùng bằng cách mã hóa ngay khi lưu xuống đĩa.
   - **Data Leakage Prevention:** Ngăn chặn AI vô tình làm lộ chỉ thị hệ thống (system prompt) ở đầu ra.

4. **Social Impact (Tác Động Xã Hội Tích Cực)**
   - **Dân chủ hóa pháp lý:** Giúp các hộ kinh doanh cá thể, tiểu thương dễ dàng tiếp cận và hiểu các nghị định thuế phức tạp mà không cần tốn chi phí thuê chuyên gia tư vấn.
   - **Thúc đẩy tính tuân thủ:** Giúp người dân tự giác khai báo và nộp thuế đúng pháp luật, đóng góp vào ngân sách nhà nước.

5. **Explainability (Tính Có Thể Giải Thích)**
   - Kết quả tính thuế luôn đi kèm phần giải thích chi tiết bằng ngôn ngữ tự nhiên: Tại sao ra số tiền này? Áp dụng trên phần doanh thu nào?
   - Yêu cầu AI **luôn trích dẫn rõ nguồn luật** (Tên Luật/Nghị định, Điều, Khoản) ở cuối câu trả lời để người dùng có thể tự đối chiếu và kiểm chứng với cơ quan thuế.

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
