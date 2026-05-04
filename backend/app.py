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
    data = request.json
    user_message = data.get('message', '')
    revenue = data.get('revenue', 0)
    category = data.get('category', 'hoat_dong_khac')
    
    if not user_message:
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
        
    # 4. Gemini API - Tư vấn
    ai_response = gemini_service.generate_response(user_message, context=legal_context)
    
    response = {
        "text": ai_response,
        "tax_table": tax_result,
        "sources": ["Thông tư 40/2021/TT-BTC"]
    }
    
    return jsonify(response)

if __name__ == '__main__':
    app.run(debug=True, port=5000)
