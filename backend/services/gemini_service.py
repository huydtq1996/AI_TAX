import os
import google.generativeai as genai

class GeminiService:
    def __init__(self):
        api_key = os.getenv("GEMINI_API_KEY")
        if api_key:
            genai.configure(api_key=api_key)
            self.model = genai.GenerativeModel('gemini-2.5-flash')
        else:
            self.model = None
            print("Warning: GEMINI_API_KEY is not set.")

    def generate_response(self, prompt, context="", file_path=None):
        if not self.model:
            return "Lỗi: Chưa cấu hình GEMINI_API_KEY."
            
        full_prompt = f"""
        Ngữ cảnh pháp lý (Cơ sở tri thức):
        {context}
        
        Câu hỏi của người dùng:
        {prompt}
        
        Yêu cầu:
        1. Trả lời chính xác, dựa vào 'Ngữ cảnh pháp lý' nếu có.
        2. Nếu người dùng đính kèm file (hóa đơn, tờ khai, bảng tính), hãy đọc kỹ file, trích xuất số liệu và tư vấn dựa trên đó.
        3. Nếu có tính toán thuế, hãy sử dụng kết quả tính toán được cung cấp, không tự bịa ra số liệu.
        4. Trích dẫn điều luật từ ngữ cảnh nếu có.
        5. Nếu được yêu cầu lập kế hoạch kinh doanh, hãy ước tính Doanh thu, Chi phí, Lợi nhuận và đưa ra lời khuyên.
        """
        
        try:
            contents = [full_prompt]
            if file_path and os.path.exists(file_path):
                print(f"Uploading file to Gemini: {file_path}")
                sample_file = genai.upload_file(path=file_path)
                contents.insert(0, sample_file)

            response = self.model.generate_content(contents)
            return response.text
        except Exception as e:
            return f"Lỗi khi gọi Gemini API: {str(e)}"
            
    def embed_text(self, text):
        if not self.model or not text:
            return None
        try:
            result = genai.embed_content(
                model="models/text-multilingual-embedding-002",
                content=text,
                task_type="retrieval_query"
            )
            return result['embedding']
        except Exception as e:
            print(f"Lỗi khi nhúng văn bản: {str(e)}")
            return None
