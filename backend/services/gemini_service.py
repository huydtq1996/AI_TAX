import os
import pandas as pd
from google import genai
from google.genai import types

import time

class GeminiService:
    def __init__(self):
        # Khởi tạo Gemini LLM
        api_key = os.getenv("GEMINI_API_KEY")
        if api_key:
            self.client = genai.Client(api_key=api_key)
            self.model_name = 'gemini-2.0-flash'
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
        0. Nếu câu hỏi không liên quan đến luật/nghị định/thông tư về thuế, hãy trả lời "Đây là chatbot về thuế!".
        1. Nếu câu hỏi quá ngắn hoặc thiếu ngữ cảnh cụ thể dẫn đến không rõ ràng, hãy lịch sự yêu cầu người dùng cung cấp thêm thông tin. Tuyệt đối không tự suy diễn hoặc bịa đặt nội dung câu trả lời.
        2. Trả lời chính xác, dựa vào 'Ngữ cảnh pháp lý' được cung cấp.
        3. Số văn bản có định dạng "Số: number/year/text" (Ví dụ: "Số: 68/2026/NĐ-CP"). QUY TẮC ƯU TIÊN: Ngữ cảnh đã được sắp xếp theo thứ tự ưu tiên: "year" > "number" (nếu cùng loại văn bản). Bạn PHẢI ưu tiên áp dụng quy định từ văn bản nằm ở phía trên (VĂN BẢN [1], [2],...) vì đó là các quy định mới nhất. Nếu phát hiện sự mâu thuẫn giữa các văn bản, hãy nêu rõ bạn đang ưu tiên áp dụng văn bản mới hơn để người dùng nắm rõ.
        4. Nếu người dùng đính kèm file (hóa đơn, tờ khai, bảng tính), hãy đọc kỹ file, trích xuất số liệu và tư vấn dựa trên đó.
        5. Nếu có tính toán thuế, hãy sử dụng kết quả tính toán được cung cấp, không tự bịa ra số liệu.
        6. Trích dẫn điều luật từ ngữ cảnh nếu có. Nêu rõ tên Nghị định/Thông tư và Ngày ban hành để người dùng tin tưởng.
        7. Nếu được yêu cầu lập kế hoạch kinh doanh, hãy dựa vào kiến thức chuyên môn về quản trị kinh doanh và thị trường để ước tính Doanh thu, Chi phí, Lợi nhuận và đưa ra lời khuyên.
        8. Nếu không xác định được ngành nghề kinh doanh từ câu hỏi hay file đính kèm, hãy mặc định sử dụng mức thuế suất của 'Hoạt động kinh doanh khác' để tư vấn.
        9. Trình bày câu trả lời ngắn gọn, rành mạch bằng Markdown, sử dụng bảng nếu cần so sánh.
        """
        
        for attempt in range(3):
            try:
                contents = []
                if file_path and os.path.exists(file_path):
                    ext = os.path.splitext(file_path)[1].lower()
                    if ext in ['.xlsx', '.xls', '.csv']:
                        try:
                            df = pd.read_csv(file_path) if ext == '.csv' else pd.read_excel(file_path)
                            csv_data = df.to_csv(index=False)
                            full_prompt += f"\n\n--- DỮ LIỆU TỪ FILE {ext.upper()} ---\n{csv_data}\n--- HẾT DỮ LIỆU FILE ---"
                        except Exception as e:
                            print(f"Lỗi đọc file Excel/CSV: {e}")
                    else:
                        sample_file = self.client.files.upload(file=file_path)
                        contents.append(sample_file)

                contents.append(full_prompt)
                response = self.client.models.generate_content(model=self.model_name, contents=contents)
                return response.text
            except Exception as e:
                error_msg = str(e)
                if "429" in error_msg or "RESOURCE_EXHAUSTED" in error_msg:
                    return "Hết quota rồi sếp ơi, chờ xíu nha ☹️"
                if "503" in error_msg or "overloaded" in error_msg.lower():
                    time.sleep((attempt + 1) * 2)
                    continue
                return f"Lỗi khi gọi Gemini API: {error_msg}"
        return "Lỗi: Server Gemini đang quá tải, vui lòng thử lại sau giây lát."
            
    def embed_text(self, text):
        """
        Sử dụng Gemini Embedding 2 để tạo vector (768 chiều) với cơ chế thử lại.
        """
        if not self.client or not text:
            return None
        for attempt in range(3):
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
                if "503" in str(e) or "overloaded" in str(e).lower():
                    time.sleep((attempt + 1) * 2)
                    continue
                print(f"Lỗi khi nhúng văn bản (Gemini API): {str(e)}")
                return None
        return None
