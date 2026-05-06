import os
import pandas as pd
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
        
        Bạn là một trợ lý hữu ích, hãy trả lời câu hỏi của người dùng theo các yêu cầu sau:
        1. Trả lời chính xác, dựa vào 'Ngữ cảnh pháp lý' nếu có.
        2. Nếu người dùng đính kèm file (hóa đơn, tờ khai, bảng tính), hãy đọc kỹ file, trích xuất số liệu và tư vấn dựa trên đó.
        3. Nếu có tính toán thuế, hãy sử dụng kết quả tính toán được cung cấp, không tự bịa ra số liệu.
        4. Nếu được yêu cầu tư vấn tính thuế theo doanh thu, hoặc (hay) tính thuế theo thu nhập tính thuế, hãy sử dụng kết quả tính toán được cung cấp, không tự bịa ra số liệu.
        5. Trích dẫn điều luật từ ngữ cảnh nếu có. Ưu tiên áp dụng Thông tư, Nghị định có ngày ban hành mới nhất.
        6. Nếu được yêu cầu lập kế hoạch kinh doanh, hãy ước tính Doanh thu, Chi phí, Lợi nhuận và đưa ra lời khuyên.
        7. Nếu không xác định được ngành nghề kinh doanh từ câu hỏi hay file đính kèm, hãy mặc định sử dụng mức thuế suất của 'Hoạt động kinh doanh khác' để tư vấn.
        8. Nếu một câu hỏi không có ý nghĩa hoặc không hợp lý về mặt thông tin, hãy giải thích tại sao thay vì trả lời một điều gì đó không chính xác.
        9. Nếu bạn không biết câu trả lời cho một câu hỏi, hãy trả lời là bạn không biết và vui lòng không chia sẻ thông tin sai lệch.
        """
        
        try:
            contents = []
            if file_path and os.path.exists(file_path):
                ext = os.path.splitext(file_path)[1].lower()
                # Gemini File API chưa hỗ trợ trực tiếp .xlsx, .xls
                if ext in ['.xlsx', '.xls', '.csv']:
                    try:
                        if ext == '.csv':
                            df = pd.read_csv(file_path)
                        else:
                            df = pd.read_excel(file_path)
                        csv_data = df.to_csv(index=False)
                        full_prompt += f"\n\n--- DỮ LIỆU TỪ FILE {ext.upper()} ---\n{csv_data}\n--- HẾT DỮ LIỆU FILE ---"
                    except Exception as e:
                        print(f"Lỗi đọc file Excel/CSV: {e}")
                        # Vẫn tiếp tục với prompt gốc
                else:
                    print(f"Uploading file to Gemini: {file_path}")
                    sample_file = self.client.files.upload(file=file_path)
                    contents.append(sample_file)

            contents.append(full_prompt)

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
