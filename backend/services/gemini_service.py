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

    def generate_response(self, prompt, context=""):
        if not self.model:
            return "Lỗi: Chưa cấu hình GEMINI_API_KEY."
            
        full_prompt = f"""
        Ngữ cảnh pháp lý (Cơ sở tri thức):
        {context}
        
        Câu hỏi của người dùng:
        {prompt}
        
        Yêu cầu:
        1. Trả lời chính xác, dựa vào 'Ngữ cảnh pháp lý' nếu có.
        2. Nếu có tính toán thuế, hãy sử dụng kết quả tính toán được cung cấp, không tự bịa ra số liệu.
        3. Văn phong đơn giản, dễ hiểu cho chủ hộ kinh doanh, không dùng từ ngữ quá hàn lâm.
        4. Trích dẫn điều luật (Thông tư, Nghị định) từ ngữ cảnh nếu có.
        """
        
        try:
            response = self.model.generate_content(full_prompt)
            return response.text
        except Exception as e:
            return f"Lỗi khi gọi Gemini API: {str(e)}"
