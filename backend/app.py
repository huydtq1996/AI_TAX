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
    
    file = request.files.get('file')
    
    if not user_message and not file:
        return jsonify({"error": "Message is required"}), 400
        
    # 1. Guard Service - Chống Prompt Injection
    if not guard_service.check_input(user_message):
        return jsonify({
            "error": "Câu hỏi của bạn chứa nội dung không hợp lệ hoặc vi phạm chính sách."
        }), 403
        
    # 2. RAG - Lấy ngữ cảnh luật thuế
    # Trong thực tế, bạn sẽ embedding user_message và search trong Supabase
    legal_context = supabase_service.search_tax_laws(None)
    
    # 3. Tax Calculator - Tính thuế nếu có dữ liệu doanh thu
    tax_result = None
    if revenue > 0:
        tax_result = tax_calculator.calculate_tax(float(revenue), category)
        legal_context += f"\n\nKết quả tính thuế sơ bộ: {tax_result}"
        
    # Xử lý File Upload
    file_path = None
    if file:
        os.makedirs("uploads", exist_ok=True)
        file_path = os.path.join("uploads", file.filename)
        file.save(file_path)
        
    # 4. Gemini API - Tư vấn (Đưa file vào phân tích nếu có)
    ai_response = gemini_service.generate_response(user_message, context=legal_context, file_path=file_path)
    
    # Dọn dẹp file tạm
    if file_path and os.path.exists(file_path):
        os.remove(file_path)
    
    response = {
        "text": ai_response,
        "tax_table": tax_result,
        "sources": ["Luật Thuế GTGT 2024","Nghị định 141/2026/NĐ-CP","Nghị định 68/2026/NĐ-CP","Thông tư 18/2026/TT-BTC","Nghị định 117/2025/NĐ-CP"] if legal_context else []
    }
    
    return jsonify(response)

if __name__ == '__main__':
    app.run(debug=True, port=5000)
