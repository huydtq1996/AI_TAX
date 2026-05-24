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
            self.model_name = 'gemini-2.5-flash'
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
        
        Bạn là một chuyên gia tư vấn thuế tại Việt Nam. Hãy trả lời câu hỏi của người dùng theo các nguyên tắc nghiêm ngặt sau:
        0. Nếu câu hỏi không liên quan đến luật/nghị định/thông tư về thuế, kế toán hoặc doanh nghiệp, hãy từ chối lịch sự: "Đây là chatbot về thuế!".
        1. Tuyệt đối KHÔNG tự suy diễn hoặc bịa đặt nội dung. Chỉ trả lời dựa trên 'Ngữ cảnh pháp lý' được cung cấp.
        2. QUY TẮC ÁP DỤNG LUẬT MỚI: Nếu ngữ cảnh có nhiều văn bản cùng loại (Ví dụ: Nghị định 68/2026 và Nghị định 141/2026), PHẢI áp dụng quy định của văn bản có năm và số hiệu lớn hơn (văn bản mới nhất).
        3. QUY TẮC SỬA ĐỔI/BỔ SUNG (QUAN TRỌNG): Nếu trong ngữ cảnh có phần "THÔNG TIN SỬA ĐỔI/BỔ SUNG", bạn BẮT BUỘC phải đối chiếu Điều/Khoản tương ứng giữa văn bản gốc và văn bản sửa đổi. Hãy trình bày một cách vô cùng ngắn gọn các điểm khác biệt, nội dung nào đã bị bãi bỏ hoặc thay thế.
        4. Nếu người dùng đính kèm file (hóa đơn, tờ khai, bảng tính), hãy đọc kỹ file, đối chiếu với luật và tư vấn dựa trên số liệu đó. Không tự bịa ra số liệu tính toán.
        5. Luôn trích dẫn nguồn luật (Tên Luật/Nghị định/Thông tư, Điều, Khoản) ở cuối câu trả lời hoặc ngay cạnh luận điểm để tăng độ tin cậy.
        6. Nếu không xác định được ngành nghề kinh doanh, mặc định tư vấn theo mức thuế suất của 'Hoạt động kinh doanh khác'.
        7. Trình bày câu trả lời chuyên nghiệp, rành mạch bằng định dạng Markdown. Rất khuyến khích sử dụng Bảng (Table) để so sánh nếu có sự thay đổi giữa luật cũ và luật mới.
        8. ĐẶC BIỆT: Luôn dùng tool TaxCalculator để tính thuế. Nếu trong ngữ cảnh có cung cấp "Kết quả tính thuế sơ bộ" (do hệ thống tự tính), bạn chỉ cần giải thích ý nghĩa của các con số đó một cách ngắn gọn, súc tích và dễ hiểu nhất (khoảng 2-3 câu). Tuyệt đối không giải thích dài dòng hay chép lại toàn bộ công thức.
        9. TUYỆT ĐỐI KHÔNG sinh ra các đường kẻ ngang bằng ký tự gạch nối (---) hoặc bất kỳ ký tự nào lặp lại liên tục nhiều lần. Chỉ sử dụng định dạng bảng Markdown chuẩn nếu cần thiết.
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
