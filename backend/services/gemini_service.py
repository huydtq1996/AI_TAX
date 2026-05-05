import os
from google import genai
from google.genai import types

class GeminiService:
    def __init__(self):
        api_key = os.getenv("GEMINI_API_KEY")
        if api_key:
            self.client = genai.Client(api_key=api_key)
            self.model_name = 'gemini-flash-latest'
        else:
            self.client = None
            print("Warning: GEMINI_API_KEY is not set.")

    def generate_response(self, prompt, context="", file_path=None):
        if not self.client:
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
        4. Trích dẫn điều luật từ ngữ cảnh nếu có. Ưu tiên áp dụng Nghị định 141/2026/NĐ-CP (nâng ngưỡng doanh thu miễn thuế lên 1 tỷ đồng) thay thế cho quy định 500 triệu đồng ở Nghị định 68/2026/NĐ-CP.
        5. Nếu được yêu cầu lập kế hoạch kinh doanh, hãy ước tính Doanh thu, Chi phí, Lợi nhuận và đưa ra lời khuyên.
        6. Nếu một câu hỏi không có ý nghĩa hoặc không hợp lý về mặt thông tin, hãy giải thích tại sao thay vì trả lời một điều gì đó không chính xác.
        7. Nếu bạn không biết câu trả lời cho một câu hỏi, hãy trả lời là bạn không biết và vui lòng không chia sẻ thông tin sai lệch.
        """
        
        try:
            contents = [full_prompt]
            if file_path and os.path.exists(file_path):
                print(f"Uploading file to Gemini: {file_path}")
                sample_file = self.client.files.upload(file=file_path)
                contents.insert(0, sample_file)

            response = self.client.models.generate_content(
                model=self.model_name,
                contents=contents
            )
            return response.text
        except Exception as e:
            return f"Lỗi khi gọi Gemini API: {str(e)}"
            
    def embed_text(self, text):
        if not self.client or not text:
            return None
        try:
            result = self.client.models.embed_content(
                model="gemini-embedding-2",
                contents=text,
                config=types.EmbedContentConfig(
                    task_type="RETRIEVAL_QUERY",
                    output_dimensionality=768
                )
            )
            return result.embeddings[0].values
        except Exception as e:
            print(f"Lỗi khi nhúng văn bản: {str(e)}")
            return None
