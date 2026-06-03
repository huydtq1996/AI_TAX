import os
import time
import io
import math
import pandas as pd
from collections import defaultdict
from functools import wraps
from dotenv import load_dotenv
from flask import Flask, request, jsonify
from flask_cors import CORS

from services.gemini_service import GeminiService
from services.supabase_service import SupabaseService
from services.tax_calculator import TaxCalculator
from services.guard_service import GuardService
from services.encryption_service import EncryptionService

# Tải các biến môi trường
load_dotenv()

app = Flask(__name__)
CORS(app)

# Lưu trữ lịch sử giới hạn tần suất yêu cầu trong bộ nhớ (RAM): { ip: [mốc_thời_gian1, mốc_thời_gian2, ...] }
rate_limit_records = defaultdict(list)

def get_client_ip():
    if request.headers.getlist("X-Forwarded-For"):
        return request.headers.getlist("X-Forwarded-For")[0]
    return request.remote_addr

def limit_requests(max_requests=20, window_seconds=60):
    def decorator(f):
        @wraps(f)
        def wrapped(*args, **kwargs):
            ip = get_client_ip()
            # Sử dụng key kết hợp IP và tên hàm để giới hạn riêng biệt cho từng API
            rate_limit_key = f"{ip}:{f.__name__}"
            now = time.time()
            
            # Loại bỏ các mốc thời gian cũ nằm ngoài khoảng thời gian giới hạn (window)
            timestamps = rate_limit_records[rate_limit_key]
            timestamps = [t for t in timestamps if now - t < window_seconds]
            rate_limit_records[rate_limit_key] = timestamps
            
            if len(timestamps) >= max_requests:
                wait_time = math.ceil(window_seconds - (now - timestamps[0]))
                if wait_time <= 0:
                    wait_time = 1
                return jsonify({
                    "error": f"Too many requests. Vui lòng thử lại sau {wait_time} giây."
                }), 429
                
            rate_limit_records[rate_limit_key].append(now)
            return f(*args, **kwargs)
        return wrapped
    return decorator

# Khởi tạo các dịch vụ
gemini_service = GeminiService()
supabase_service = SupabaseService()
tax_calculator = TaxCalculator()
guard_service = GuardService()
encryption_service = EncryptionService()

# Đảm bảo thư mục uploads tồn tại
os.makedirs("uploads", exist_ok=True)

@app.route('/api/health', methods=['GET'])
def health_check():
    return jsonify({"status": "ok", "message": "AI Tax Assistant Backend is running!"})

@app.route('/api/chat', methods=['POST'])
@limit_requests(15, 60)
def chat():
    # Nhận dữ liệu dạng Form Data (Hỗ trợ File)
    user_message = request.form.get('message', '')
    revenue_str = request.form.get('revenue', '0')
    revenue = float(revenue_str) if revenue_str else 0
    category = request.form.get('category', 'hoat_dong_khac')
    
    user_token = request.form.get('supabase_token')
    session_id = request.form.get('session_id')
    
    file = request.files.get('file')
    
    if file:
        file.seek(0, os.SEEK_END)
        file_size = file.tell()
        file.seek(0)  # reset file pointer
        max_size = 5 * 1024 * 1024  # 5MB
        if file_size > max_size:
            return jsonify({"error": "Kích thước tệp tin không được vượt quá 5MB."}), 400
            
    if not user_message and not file:
        return jsonify({"error": "Message is required"}), 400
        
    # 1. Guard Service - Chống Prompt Injection
    if not guard_service.check_input(user_message):
        return jsonify({
            "error": "Tin nhắn bị từ chối: Phát hiện nội dung không hợp lệ"
        }), 403
        
    # 1.1 Kiểm tra sự liên quan của câu hỏi (AI Check 0) trước khi chạy RAG
    # Bỏ qua từ chối nếu người dùng có tải lên file đi kèm
    is_relevant = True
    if user_message and not file:
        relevance = guard_service.check_relevance(user_message, gemini_service)
        if relevance == "GREETING":
            is_relevant = False

    # Tạo Session nếu chưa có
    if user_token and not session_id:
        if user_message:
            import re
            clean_title = re.sub(r'[#\*_\`\-]', '', user_message).strip()
            title = clean_title[:40] + "..." if clean_title else "Kế hoạch Thuế"
        else:
            title = "Kế hoạch Thuế"
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
        # Mã hóa tệp tin ngay lập tức trên đĩa
        encryption_service.encrypt_file(file_path)

    # 3. Lưu tin nhắn của User
    if user_token and session_id:
        supabase_service.save_message(session_id, 'user', user_message, user_token, file_name=file_name, file_type=file_type)
        
    # 2. RAG - Lấy ngữ cảnh luật thuế
    legal_context = ""
    sources = []
    if is_relevant and guard_service.needs_rag(user_message):
        # Chuyển đổi câu hỏi của user thành Vector
        query_vector = gemini_service.embed_text(user_message)
        legal_context, sources = supabase_service.search_tax_laws(query_vector)
    
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
    
    # Nếu lỗi API hoặc từ chối trả lời thì ẩn nguồn tham chiếu
    is_error = ai_response.startswith("Lỗi") or "Hết quota" in ai_response
    is_refusal = "Đây là chatbot về thuế!" in ai_response
    if is_error or is_refusal:
        sources = []
    else:
        # 4.1 Guard Service - Kiểm tra phản hồi (Bảo mật & Phòng thủ)
        if not guard_service.check_response(ai_response):
            ai_response = "Xin lỗi, yêu cầu của bạn không thể thực hiện được vì lý do bảo mật hệ thống."
            sources = []
        
    # Lưu tin nhắn của AI
    if user_token and session_id:
        supabase_service.save_message(session_id, 'assistant', ai_response, user_token, tax_snapshot=tax_result, sources=sources)
    
    response = {
        "text": ai_response,
        "tax_table": tax_result,
        "session_id": session_id,
        "sources": sources
    }
    
    return jsonify(response)

@app.route('/api/files', methods=['GET'])
@limit_requests(20, 60)
def list_files():
    user_token = request.headers.get('Authorization')
    if not user_token:
        user_token = request.args.get('supabase_token')
    else:
        if user_token.startswith("Bearer "):
            user_token = user_token[7:]
            
    if not user_token:
        return jsonify({"error": "Unauthorized"}), 401
        
    user_files = supabase_service.get_user_files(user_token)
    allowed_filenames = {f.get('file_name') for f in user_files if f.get('file_name')}
    
    upload_dir = "uploads"
    if not os.path.exists(upload_dir):
        return jsonify([])
    
    files = []
    for filename in os.listdir(upload_dir):
        if filename not in allowed_filenames:
            continue
        file_path = os.path.join(upload_dir, filename)
        if os.path.isfile(file_path):
            stats = os.stat(file_path)
            files.append({
                "name": filename,
                "size": stats.st_size,
                "ctime": stats.st_ctime,
                "type": filename.split('.')[-1].upper() if '.' in filename else "FILE"
            })
    # Sắp xếp theo thời gian tạo mới nhất
    files.sort(key=lambda x: x['ctime'], reverse=True)
    return jsonify(files)

@app.route('/api/files/<filename>', methods=['GET'])
@limit_requests(20, 60)
def download_file(filename):
    user_token = request.headers.get('Authorization')
    if not user_token:
        user_token = request.args.get('supabase_token')
    else:
        if user_token.startswith("Bearer "):
            user_token = user_token[7:]
            
    if not user_token:
        return jsonify({"error": "Unauthorized"}), 401
        
    user_files = supabase_service.get_user_files(user_token)
    allowed_filenames = {f.get('file_name') for f in user_files if f.get('file_name')}
    
    if filename not in allowed_filenames:
        return jsonify({"error": "Forbidden: Bạn không có quyền truy cập tệp tin này"}), 403
        
    from flask import send_file
    import io
    import mimetypes
    
    file_path = os.path.join("uploads", filename)
    if not os.path.exists(file_path):
        return jsonify({"error": "File not found"}), 404
        
    try:
        decrypted_bytes = encryption_service.decrypt_file(file_path)
        
        mime_type, _ = mimetypes.guess_type(filename)
        if not mime_type:
            mime_type = "application/octet-stream"
            
        return send_file(
            io.BytesIO(decrypted_bytes),
            mimetype=mime_type,
            as_attachment=True,
            download_name=filename
        )
    except Exception as e:
        print(f"Lỗi giải mã file tải về: {e}")
        return jsonify({"error": "Không thể giải mã tệp tin"}), 500

@app.route('/api/sessions', methods=['GET'])
@limit_requests(30, 60)
def get_sessions():
    user_token = request.headers.get('Authorization')
    if not user_token:
        user_token = request.args.get('supabase_token')
    else:
        if user_token.startswith("Bearer "):
            user_token = user_token[7:]
            
    if not user_token:
        return jsonify({"error": "Unauthorized"}), 401
        
    sessions = supabase_service.get_sessions(user_token)
    return jsonify(sessions)

@app.route('/api/sessions/<session_id>/messages', methods=['GET'])
@limit_requests(30, 60)
def get_messages(session_id):
    user_token = request.headers.get('Authorization')
    if not user_token:
        user_token = request.args.get('supabase_token')
    else:
        if user_token.startswith("Bearer "):
            user_token = user_token[7:]
            
    if not user_token:
        return jsonify({"error": "Unauthorized"}), 401
        
    messages = supabase_service.get_messages(session_id, user_token)
    return jsonify(messages)

@app.route('/api/sessions/<session_id>', methods=['DELETE'])
@limit_requests(30, 60)
def delete_session(session_id):
    user_token = request.headers.get('Authorization')
    if not user_token:
        user_token = request.args.get('supabase_token')
    else:
        if user_token.startswith("Bearer "):
            user_token = user_token[7:]
            
    if not user_token:
        return jsonify({"error": "Unauthorized"}), 401
        
    success = supabase_service.delete_session(session_id, user_token)
    if success:
        return jsonify({"message": "Session deleted successfully"})
    else:
        return jsonify({"error": "Failed to delete session"}), 500

@app.route('/api/files/<filename>', methods=['DELETE'])
@limit_requests(20, 60)
def delete_file(filename):
    user_token = request.headers.get('Authorization')
    if not user_token:
        user_token = request.args.get('supabase_token')
    else:
        if user_token.startswith("Bearer "):
            user_token = user_token[7:]
            
    if not user_token:
        return jsonify({"error": "Unauthorized"}), 401
        
    user_files = supabase_service.get_user_files(user_token)
    allowed_filenames = {f.get('file_name') for f in user_files if f.get('file_name')}
    
    if filename not in allowed_filenames:
        return jsonify({"error": "Forbidden: Bạn không có quyền xóa tệp tin này"}), 403
        
    file_path = os.path.join("uploads", filename)
    if os.path.exists(file_path):
        os.remove(file_path)
        return jsonify({"message": f"Deleted {filename}"})
    return jsonify({"error": "File not found"}), 404

@app.route('/api/business-settings', methods=['GET'])
@limit_requests(30, 60)
def get_business_settings():
    user_token = request.headers.get('Authorization')
    if not user_token:
        user_token = request.args.get('supabase_token')
    else:
        if user_token.startswith("Bearer "):
            user_token = user_token[7:]
            
    if not user_token:
        return jsonify({"error": "Unauthorized"}), 401
        
    settings = supabase_service.get_business_settings(user_token)
    return jsonify(settings)

@app.route('/api/business-settings', methods=['POST'])
@limit_requests(30, 60)
def update_business_settings():
    user_token = request.headers.get('Authorization')
    if not user_token:
        user_token = request.json.get('supabase_token') if (request.is_json and request.json) else request.form.get('supabase_token')
    else:
        if user_token.startswith("Bearer "):
            user_token = user_token[7:]
            
    if not user_token:
        return jsonify({"error": "Unauthorized"}), 401
        
    if request.is_json:
        data = request.json
    else:
        data = request.form
        
    business_name = data.get('business_name')
    business_category = data.get('business_category')
    declaration_type = data.get('declaration_type', 'quy')
    
    if not business_name or not business_category:
        return jsonify({"error": "business_name and business_category are required"}), 400
        
    success = supabase_service.update_business_settings(user_token, business_name, business_category, declaration_type)
    if success:
        return jsonify({"message": "Business settings updated successfully"})
    else:
        return jsonify({"error": "Failed to update business settings"}), 500

@app.route('/api/transactions', methods=['GET'])
@limit_requests(30, 60)
def get_transactions():
    user_token = request.headers.get('Authorization')
    if not user_token:
        user_token = request.args.get('supabase_token')
    else:
        if user_token.startswith("Bearer "):
            user_token = user_token[7:]
            
    if not user_token:
        return jsonify({"error": "Unauthorized"}), 401
        
    transactions = supabase_service.get_transactions(user_token)
    return jsonify(transactions)

@app.route('/api/transactions', methods=['POST'])
@limit_requests(30, 60)
def add_transaction():
    user_token = request.headers.get('Authorization')
    if not user_token:
        user_token = request.json.get('supabase_token') if (request.is_json and request.json) else request.form.get('supabase_token')
    else:
        if user_token.startswith("Bearer "):
            user_token = user_token[7:]
            
    if not user_token:
        return jsonify({"error": "Unauthorized"}), 401
        
    if request.is_json:
        data = request.json
    else:
        data = request.form
        
    date = data.get('date')
    amount_val = data.get('amount')
    description = data.get('description', '')
    
    if not date or amount_val is None:
        return jsonify({"error": "date and amount are required"}), 400
        
    try:
        amount = float(amount_val)
    except ValueError:
        return jsonify({"error": "amount must be a number"}), 400
        
    transaction = supabase_service.add_transaction(user_token, date, amount, description)
    if transaction:
        return jsonify(transaction)
    else:
        return jsonify({"error": "Failed to add transaction"}), 500

@app.route('/api/transactions/<transaction_id>', methods=['PUT'])
@limit_requests(30, 60)
def update_transaction(transaction_id):
    user_token = request.headers.get('Authorization')
    if not user_token:
        user_token = request.json.get('supabase_token') if (request.is_json and request.json) else request.form.get('supabase_token')
    else:
        if user_token.startswith("Bearer "):
            user_token = user_token[7:]
            
    if not user_token:
        return jsonify({"error": "Unauthorized"}), 401
        
    if request.is_json:
        data = request.json
    else:
        data = request.form
        
    date = data.get('date')
    amount_val = data.get('amount')
    description = data.get('description', '')
    
    if not date or amount_val is None:
        return jsonify({"error": "date and amount are required"}), 400
        
    try:
        amount = float(amount_val)
    except ValueError:
        return jsonify({"error": "amount must be a number"}), 400
        
    success = supabase_service.update_transaction(user_token, transaction_id, date, amount, description)
    if success:
        return jsonify({"message": "Transaction updated successfully"})
    else:
        return jsonify({"error": "Failed to update transaction"}), 500

@app.route('/api/transactions/<transaction_id>', methods=['DELETE'])
@limit_requests(30, 60)
def delete_transaction(transaction_id):
    user_token = request.headers.get('Authorization')
    if not user_token:
        user_token = request.args.get('supabase_token')
    else:
        if user_token.startswith("Bearer "):
            user_token = user_token[7:]
            
    if not user_token:
        return jsonify({"error": "Unauthorized"}), 401
        
    success = supabase_service.delete_transaction(user_token, transaction_id)
    if success:
        return jsonify({"message": "Transaction deleted successfully"})
    else:
        return jsonify({"error": "Failed to delete transaction"}), 500

@app.route('/api/transactions/template', methods=['GET'])
@limit_requests(100, 60)
def download_transaction_template():
    try:
        # Tạo dữ liệu mẫu cho template
        data = {
            "Ngay (DD/MM/YYYY)": ["01/06/2026", "01/06/2026"],
            "Loai (Thu/Chi)": ["Thu", "Chi"],
            "SoTien": [57600000, 12850000],
            "DienGiai": ["Doanh thu ban le tap hoa", "Mua tui dung va bao bi"]
        }
        df = pd.DataFrame(data)
        
        # Ghi vào BytesIO dưới dạng file xlsx
        output = io.BytesIO()
        with pd.ExcelWriter(output, engine='openpyxl') as writer:
            df.to_excel(writer, index=False, sheet_name='Sheet1')
        output.seek(0)
        
        from flask import send_file
        return send_file(
            output,
            mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            as_attachment=True,
            download_name="mau_so_tay_giao_dich.xlsx"
        )
    except Exception as e:
        print(f"Lỗi khi tạo file mẫu xlsx: {e}")
        return jsonify({"error": f"Lỗi hệ thống khi tạo tệp tin mẫu: {str(e)}"}), 500

@app.route('/api/transactions/ocr', methods=['POST'])
@limit_requests(15, 60)
def upload_ocr_transaction():
    user_token = request.headers.get('Authorization')
    if not user_token:
        user_token = request.form.get('supabase_token')
    else:
        if user_token.startswith("Bearer "):
            user_token = user_token[7:]
            
    if not user_token:
        return jsonify({"error": "Unauthorized"}), 401
        
    file = request.files.get('file')
    if not file:
        return jsonify({"error": "Không tìm thấy tệp tin được tải lên."}), 400
        
    # 1. Kiểm tra kích thước tệp tin (tối đa 5MB)
    file.seek(0, os.SEEK_END)
    file_size = file.tell()
    file.seek(0)
    max_size = 5 * 1024 * 1024  # 5MB
    if file_size > max_size:
        return jsonify({"error": "Kích thước tệp tin không được vượt quá 5MB."}), 400
        
    # Lưu tệp tin tạm thời
    file_name = file.filename
    ext = os.path.splitext(file_name)[1].lower()
    temp_filename = f"ocr_{int(time.time())}_{file_name}"
    os.makedirs("uploads", exist_ok=True)
    file_path = os.path.join("uploads", temp_filename)
    
    file.save(file_path)
    encryption_service.encrypt_file(file_path)
    
    saved_transactions = []
    
    try:
        # Xử lý tệp Excel/CSV mẫu trực tiếp (Zero API Cost)
        if ext in ['.csv', '.xlsx', '.xls']:
            # Giải mã trước khi đọc
            decrypted_data = encryption_service.decrypt_file(file_path)
            
            if ext == '.csv':
                df = pd.read_csv(io.BytesIO(decrypted_data))
            else:
                df = pd.read_excel(io.BytesIO(decrypted_data))
                
            # Chuẩn hóa tên cột để kiểm tra
            expected_cols = ['ngay(dd/mm/yyyy)', 'loai(thu/chi)', 'sotien', 'diengiai']
            actual_cols = [str(c).strip().lower().replace(" ", "") for c in df.columns]
            
            if not all(col in actual_cols for col in expected_cols):
                return jsonify({
                    "error": "Cấu trúc file không đúng mẫu. File Excel/CSV phải chứa chính xác các cột: Ngay (DD/MM/YYYY), Loai (Thu/Chi), SoTien, DienGiai."
                }), 400
                
            col_map = {actual_cols[i]: df.columns[i] for i in range(len(actual_cols))}
            
            for index, row in df.head(500).iterrows():
                raw_date = str(row[col_map['ngay(dd/mm/yyyy)']]).strip()
                type_val = str(row[col_map['loai(thu/chi)']]).strip().lower()
                amount_val = row[col_map['sotien']]
                desc_val = str(row[col_map['diengiai']]).strip()
                
                # Bỏ qua các hàng trống
                if raw_date == 'nan' or not raw_date:
                    continue
                    
                # Chuyển đổi định dạng ngày từ DD/MM/YYYY sang YYYY-MM-DD
                date_val = raw_date
                try:
                    if ' ' in raw_date:
                        date_part = raw_date.split(' ')[0]
                    else:
                        date_part = raw_date
                        
                    if '/' in date_part:
                        parts = date_part.split('/')
                        if len(parts) == 3:
                            date_val = f"{int(parts[2]):04d}-{int(parts[1]):02d}-{int(parts[0]):02d}"
                    elif '-' in date_part:
                        parts = date_part.split('-')
                        if len(parts) == 3:
                            if len(parts[0]) == 4:
                                date_val = f"{int(parts[0]):04d}-{int(parts[1]):02d}-{int(parts[2]):02d}"
                            else:
                                date_val = f"{int(parts[2]):04d}-{int(parts[1]):02d}-{int(parts[0]):02d}"
                except Exception:
                    pass
                    
                try:
                    amount = float(amount_val)
                except ValueError:
                    continue
                    
                if 'chi' in type_val:
                    amount = -abs(amount)
                else:
                    amount = abs(amount)
                    
                new_tx = supabase_service.add_transaction(user_token, date_val, amount, desc_val)
                if new_tx:
                    saved_transactions.append(new_tx)
                    
            return jsonify({
                "message": f"Nhập thành công {len(saved_transactions)} giao dịch từ tệp Excel/CSV mẫu!",
                "transactions": saved_transactions
            })
            
        elif ext in ['.pdf', '.png', '.jpg', '.jpeg', '.webp']:
            # Gọi Gemini trích xuất hóa đơn bằng AI
            extracted_data = gemini_service.extract_transactions_from_file(file_path)
            
            if not extracted_data or 'transactions' not in extracted_data:
                return jsonify({"error": "Không thể trích xuất giao dịch từ hóa đơn này bằng AI."}), 500
                
            for tx_data in extracted_data['transactions']:
                date_val = tx_data.get('date')
                amount_val = tx_data.get('amount', 0)
                desc_val = tx_data.get('description', '')
                
                new_tx = supabase_service.add_transaction(user_token, date_val, amount_val, desc_val)
                if new_tx:
                    saved_transactions.append(new_tx)
                    
            return jsonify({
                "message": f"AI trích xuất thành công {len(saved_transactions)} giao dịch từ hóa đơn!",
                "transactions": saved_transactions
            })
            
        else:
            return jsonify({"error": "Định dạng tệp không được hỗ trợ. Vui lòng tải lên Excel, CSV, PDF hoặc hình ảnh hóa đơn."}), 400
            
    except Exception as e:
        print(f"Lỗi xử lý file upload giao dịch: {e}")
        return jsonify({"error": f"Lỗi hệ thống khi xử lý tệp tin: {str(e)}"}), 500
        
    finally:
        # Xóa file đã tải lên ngay lập tức để tiết kiệm ổ đĩa và bảo vệ riêng tư
        if os.path.exists(file_path):
            try:
                os.remove(file_path)
            except Exception as clean_err:
                print(f"Không thể xóa file tạm sau xử lý: {clean_err}")

if __name__ == '__main__':
    app.run(debug=True, port=5000)

@app.route('/api/tax-payments', methods=['GET'])
@limit_requests(30, 60)
def get_tax_payments():
    user_token = request.headers.get('Authorization')
    if not user_token:
        user_token = request.args.get('supabase_token')
    else:
        if user_token.startswith("Bearer "):
            user_token = user_token[7:]
            
    if not user_token:
        return jsonify({"error": "Unauthorized"}), 401
        
    payments = supabase_service.get_tax_payments(user_token)
    return jsonify(payments)

@app.route('/api/tax-payments', methods=['POST'])
@limit_requests(30, 60)
def update_tax_payment():
    user_token = request.headers.get('Authorization')
    if not user_token:
        user_token = request.json.get('supabase_token') if (request.is_json and request.json) else request.form.get('supabase_token')
    else:
        if user_token.startswith("Bearer "):
            user_token = user_token[7:]
            
    if not user_token:
        return jsonify({"error": "Unauthorized"}), 401
        
    if request.is_json:
        data = request.json
    else:
        data = request.form
        
    period_key = data.get('period_key')
    due_date = data.get('due_date')
    tax_amount = data.get('tax_amount', 0)
    paid_amount = data.get('paid_amount', 0)
    paid_date = data.get('paid_date')
    
    if not period_key or not due_date:
        return jsonify({"error": "period_key and due_date are required"}), 400
        
    success = supabase_service.update_tax_payment(user_token, period_key, due_date, float(tax_amount), float(paid_amount), paid_date)
    if success:
        return jsonify({"message": "Tax payment updated successfully"})
    else:
        return jsonify({"error": "Failed to update tax payment"}), 500

