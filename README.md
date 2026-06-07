# 🚀 Tax_AI Trust Blueprint
**Trợ lý AI tin cậy cho 5,1 triệu hộ kinh doanh Việt Nam**

Tax_AI Trust Blueprint là hệ thống hỗ trợ khai báo thuế và quản lý kế hoạch tài chính dành riêng cho hộ kinh doanh cá thể. Dự án kết hợp sức mạnh của LLM (Gemini 2.5 Flash) và cơ chế RAG (Retrieval-Augmented Generation) để đảm bảo tính chính xác về pháp lý và bảo mật dữ liệu tuyệt đối.

> *"AI tốt không chỉ là AI chính xác — mà là AI mà con người có thể tin tưởng, hiểu được và kiểm soát được."*
> 
> — **Nhóm G12**

---

## ✨ Tính năng cốt lõi (Beyond Accuracy)

- 📚 **Tra cứu Luật Thuế Chính xác:** Sử dụng RAG với cơ sở dữ liệu từ Thông tư 40/2021/TT-BTC và mới nhất là Nghị định 141/2026/NĐ-CP (ngưỡng miễn thuế 1 tỷ VNĐ).
- 🧮 **Tính thuế Deterministic:** Thuế suất được lập trình cứng (hard-coded) để loại bỏ hoàn toàn hiện tượng "ảo giác" toán học của AI, đảm bảo chính xác 100% về con số.
- 🛡️ **Bảo mật Đa lớp (GuardService):** Tích hợp WAF riêng cho LLM để chặn 100% các cuộc tấn công Prompt Injection, Jailbreak và rò rỉ dữ liệu.
- 🔒 **Mã hóa Dữ liệu Nhạy cảm:** Toàn bộ hóa đơn tải lên được mã hóa đối xứng bằng Fernet AES-128. Dữ liệu chỉ được giải mã trong bộ nhớ RAM và xóa sạch sau khi xử lý.
- 🖼️ **Phân tích Đa phương thức:** Hỗ trợ đọc hiểu hóa đơn qua ảnh chụp, PDF, Excel và CSV nhờ khả năng multimodal của Gemini.

---

## 🛠️ Công nghệ sử dụng (Tech Stack)

| Thành phần | Công nghệ |
| :--- | :--- |
| **Frontend** | Next.js 14.2 (TypeScript), Vanilla CSS |
| **Backend** | Flask 3.1 (Python 3.10) |
| **LLM Engine** | Gemini 2.5 Flash |
| **Vector DB** | Supabase (PostgreSQL + pgvector) |
| **Embedding** | Gemini-Embedding-2 (768 dimensions) |

---

## 🏗️ Cấu trúc dự án

```text
AI_TAX/
├── backend/            # Flask API & Business Logic (GuardService, TaxCalculator)
|   └── uploads/            # Thư mục lưu trữ hóa đơn tạm thời (đã mã hóa)
├── frontend/           # Giao diện người dùng Next.js
└── documents/          # Thư viện văn bản pháp luật (PDF/Markdown) cho RAG
```

---

## 💻 Hướng dẫn cài đặt

### 1. Yêu cầu hệ thống
- **Node.js:** Phiên bản 24.x hoặc mới hơn.
- **Python:** Phiên bản 3.14 (Để đảm bảo tính ổn định của các thư viện mã hóa).

### 2. Triển khai Backend
```bash
cd backend
pip install -r requirements.txt

# Tạo file .env và cấu hình: GEMINI_API_KEY, SUPABASE_URL, ENCRYPTION_KEY
python app.py
```

### 3. Triển khai Frontend
```bash
cd frontend
npm install
npm run dev
```
> **Lưu ý:** Hệ thống đã cấu hình Reverse Proxy tự động chuyển hướng các yêu cầu `/api/*` sang cổng 5000.

---

## ⚖️ Cam kết AI có trách nhiệm (Responsible AI)

Hệ thống được thiết kế dựa trên 5 trụ cột đạo đức:

1. **Reliability:** Khả năng tự phục hồi với cơ chế Retry logic và tính toán tất định.
2. **Bias Control:** Thuật toán tính thuế trung lập, không phân biệt vùng miền, giới tính.
3. **Robustness:** Kháng lỗi mạnh mẽ với lớp bảo vệ GuardService.
4. **Explainability:** Mọi câu trả lời đều có trích dẫn Điều/Khoản/Điểm từ nguồn luật chính thống.
5. **Privacy:** Mã hóa dữ liệu ngay khi nhận và không lưu trữ dữ liệu thô.

---

## 👥 Đội ngũ thực hiện (Nhóm G12)

- Nguyễn Thái Tú
- Đỗ Quốc Thắng
- Quách Văn Ngọc
- Dương Trần Quang Huy

**Giảng viên hướng dẫn:** Phan Thế Duy

*Dự án thuộc khuôn khổ môn học: AI002.F21.CN1.TTNT – Tư Duy Trí Tuệ Nhân Tạo.*
