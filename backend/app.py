import os
from dotenv import load_dotenv
from flask import Flask, request, jsonify
from flask_cors import CORS

from services.gemini_service import GeminiService
from services.supabase_service import SupabaseService
from services.tax_calculator import TaxCalculator
from services.guard_service import GuardService

# Load environment variables
load_dotenv()

app = Flask(__name__)
CORS(app)

# Initialize services
gemini_service = GeminiService()
supabase_service = SupabaseService()
tax_calculator = TaxCalculator()
guard_service = GuardService()

@app.route('/api/health', methods=['GET'])
def health_check():
    return jsonify({"status": "ok", "message": "AI Tax Assistant Backend is running!"})

@app.route('/api/chat', methods=['POST'])
def chat():
    # Nhận dữ liệu dạng Form Data (Hỗ trợ File)
    user_message = request.form.get('message', '')
    revenue_str = request.form.get('revenue', '0')
    revenue = float(revenue_str) if revenue_str else 0
    category = request.form.get('category', 'hoat_dong_khac')
    
    user_token = request.form.get('supabase_token')
    session_id = request.form.get('session_id')
    
    file = request.files.get('file')
    
    if not user_message and not file:
        return jsonify({"error": "Message is required"}), 400
        
    # 1. Guard Service - Chống Prompt Injection
    if not guard_service.check_input(user_message):
        return jsonify({
            "error": "Câu hỏi của bạn chứa nội dung không hợp lệ hoặc vi phạm chính sách."
        }), 403
        
    # Tạo Session nếu chưa có
    if user_token and not session_id:
        title = user_message[:40] + "..." if user_message else "Kế hoạch Thuế"
        session_id = supabase_service.create_session(title, user_token)
        
    # 2. Xử lý File Upload
    file_path = None
    file_name = None
    file_type = None
    if file:
        os.makedirs("uploads", exist_ok=True)
        file_name = file.filename
        file_type = file_name.split('.')[-1].upper() if '.' in file_name else "FILE"
        file_path = os.path.join("uploads", file_name)
        file.save(file_path)

    # 3. Lưu tin nhắn của User
    if user_token and session_id:
        supabase_service.save_message(session_id, 'user', user_message, user_token, file_name=file_name, file_type=file_type)
        
    # 2. RAG - Lấy ngữ cảnh luật thuế
    # Chuyển đổi câu hỏi của user thành Vector
    query_vector = gemini_service.embed_text(user_message)
    legal_context = supabase_service.search_tax_laws(query_vector)
    
    # 3. Tax Calculator - Tính thuế nếu có dữ liệu doanh thu
    tax_result = None
    if revenue > 0:
        method = request.form.get('method', 'doanh_thu')
        expenses_str = request.form.get('expenses', '0')
        expenses = float(expenses_str) if expenses_str else 0
        
        tax_result = tax_calculator.calculate_tax(float(revenue), category, method, expenses)
        legal_context += f"\n\nKết quả tính thuế sơ bộ: {tax_result}"
        
    # 4. Gemini API - Tư vấn (Đưa file vào phân tích nếu có)
    ai_response = gemini_service.generate_response(user_message, context=legal_context, file_path=file_path)
    
    # Dọn dẹp file tạm
    if file_path and os.path.exists(file_path):
        os.remove(file_path)
        
    # Lưu tin nhắn của AI
    if user_token and session_id:
        supabase_service.save_message(session_id, 'assistant', ai_response, user_token, tax_snapshot=tax_result)
    
    response = {
        "text": ai_response,
        "tax_table": tax_result,
        "session_id": session_id,
        "sources": ["Luật số: 48/2024/QH15","Luật số: 109/2025/QH15","Nghị định 141/2026/NĐ-CP","Nghị định 68/2026/NĐ-CP","Thông tư 18/2026/TT-BTC","Nghị định 117/2025/NĐ-CP"] if legal_context else []
    }
    
    return jsonify(response)

if __name__ == '__main__':
    app.run(debug=True, port=5000)
