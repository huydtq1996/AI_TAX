import os
import io
import pandas as pd
from google import genai
from google.genai import types
import time
from services.encryption_service import EncryptionService

class GeminiService:
    def __init__(self):
        # Khởi tạo Gemini LLM
        api_key = os.getenv("GEMINI_API_KEY")
        self.encryption_service = EncryptionService()
        if api_key:
            self.client = genai.Client(api_key=api_key)
            self.model_name = 'gemini-2.5-flash'
        else:
            self.client = None
            print("Warning: GEMINI_API_KEY is not set.")

    def generate_response(self, prompt, context="", file_path=None):
        if not self.client:
            return "Lỗi: Chưa cấu hình GEMINI_API_KEY."

        # Sanitize prompt to prevent XML injection
        safe_prompt = prompt.replace("<", "&lt;").replace(">", "&gt;") if prompt else ""
        
        # Bảng tỷ lệ thuế suất mặc định bổ sung vào ngữ cảnh của AI
        tax_rates_context = """
        === BẢNG TỶ LỆ THUẾ SUẤT TRÊN DOANH THU ĐỐI VỚI HỘ/CÁ NHÂN KINH DOANH (Theo Luật 48/2024/QH15 & Nghị định 68/2026/NĐ-CP):
        1. Phân phối, cung cấp hàng hóa (Bán buôn, bán lẻ...): GTGT 1%, TNCN 0.5%
        2. Dịch vụ, xây dựng không bao thầu nguyên vật liệu (Spa, nhà hàng, quán ăn, cafe, tư vấn, sửa chữa...): GTGT 5%, TNCN 2%
        3. Sản xuất, vận tải, dịch vụ có gắn hàng hóa (Gia công, vận tải, xây dựng có bao thầu...): GTGT 3%, TNCN 1.5%
        4. Hoạt động kinh doanh khác: GTGT 2%, TNCN 1%
        5. Cho thuê tài sản, đại lý bảo hiểm, xổ số, dịch vụ nội dung số: GTGT 5%, TNCN 5%
        """

        full_prompt = f"""
        Ngữ cảnh pháp lý (Cơ sở tri thức):
        {context}
        
        {tax_rates_context}
        
        Bạn là một chuyên gia tư vấn thuế tại Việt Nam. Hãy trả lời câu hỏi của người dùng nằm bên trong thẻ <user_input> dưới đây theo các nguyên tắc nghiêm ngặt sau:
        
        <user_input>
        {safe_prompt}
        </user_input>
        
        CÁC NGUYÊN TẮC BẮT BUỘC:
        0. Nếu câu hỏi không liên quan đến luật/nghị định/thông tư về thuế, kế toán hoặc doanh nghiệp, hãy từ chối lịch sự: "Đây là chatbot về thuế!".
        1. Tuyệt đối KHÔNG tự suy diễn hoặc bịa đặt nội dung ngoài những gì được cung cấp. Chỉ trả lời dựa trên 'Ngữ cảnh pháp lý' và 'Bảng tỷ lệ thuế suất trên doanh thu' được cung cấp ở trên.
        2. QUY TẮC ÁP DỤNG LUẬT MỚI (ƯU TIÊN VĂN BẢN MỚI NHẤT): Văn bản nào ban hành SAU (năm lớn hơn, hoặc ngày mới hơn) sẽ có giá trị áp dụng ưu tiên nhất, BẤT KỂ loại văn bản là gì (Luật, Nghị định, Thông tư...). Tuyệt đối KHÔNG tự động lập luận rằng 'Luật có giá trị pháp lý cao hơn Nghị định/Thông tư' để bỏ qua văn bản mới hơn. Nếu Nghị định/Nghị quyết có năm/ngày ban hành MỚI HƠN quy định khác với Luật gốc, bạn BẮT BUỘC phải áp dụng số liệu của văn bản mới hơn đó.
        3. QUY TẮC SỬA ĐỔI/BỔ SUNG (QUAN TRỌNG): Nếu trong ngữ cảnh có phần "THÔNG TIN SỬA ĐỔI/BỔ SUNG", bạn BẮT BUỘC phải đối chiếu Điều/Khoản tương ứng giữa văn bản gốc và văn bản sửa đổi. Hãy trình bày một cách vô cùng ngắn gọn các điểm mới nhất đang được áp dụng. (Ví dụ: nếu Điều 2 Nghị định 126 sửa đổi Điều 6 Nghị định 139 thì phải áp dụng quy định tại Điều 2 NĐ 126 cho nội dung liên quan đến Điều 6 NĐ 139)
        4. Nếu người dùng đính kèm file (hóa đơn, tờ khai, bảng tính), hãy đọc kỹ file, đối chiếu với luật và tư vấn dựa trên số liệu đó. Không tự bịa ra số liệu tính toán.
        5. Luôn trích dẫn nguồn luật (Tên Luật/Nghị định/Thông tư, Điều, Khoản) ở cuối câu trả lời hoặc ngay cạnh luận điểm để tăng độ tin cậy.
        6. Nếu không xác định được ngành nghề kinh doanh hoặc người dùng không cung cấp ngành nghề cụ thể, bạn BẮT BUỘC phải mặc định áp dụng mức thuế suất của 'Hoạt động kinh doanh khác' (GTGT 2%, TNCN 1%) để thực hiện tính toán. Khi đó, bạn PHẢI thông báo rõ ràng cho người dùng biết hệ thống đang tạm tính theo nhóm 'Hoạt động kinh doanh khác' do thiếu thông tin ngành nghề và khuyến khích họ bổ sung ngành nghề cụ thể để có kết quả chính xác hơn.
        7. Trình bày câu trả lời chuyên nghiệp, rành mạch bằng định dạng Markdown. BẮT BUỘC sử dụng Bảng (Table) Markdown để so sánh nếu có sự thay đổi giữa luật cũ và luật mới hoặc để trình bày các số liệu tính toán chi tiết. Không dùng ký tự gạch nối để vẽ bảng giả.
        8. ĐẶC BIỆT: Luôn dùng tool TaxCalculator để tính thuế. Nếu trong ngữ cảnh có cung cấp "Kết quả tính thuế sơ bộ" (do hệ thống tự tính), bạn chỉ cần giải thích ý nghĩa của các con số đó một cách ngắn gọn, súc tích và dễ hiểu nhất (khoảng 2-3 câu). Tuyệt đối không giải thích dài dòng hay chép lại toàn bộ công thức.
        """
        
        for attempt in range(3):
            try:
                contents = []
                if file_path and os.path.exists(file_path):
                    ext = os.path.splitext(file_path)[1].lower()
                    if ext in ['.xlsx', '.xls', '.csv']:
                        try:
                            # Decrypt in-memory
                            decrypted_data = self.encryption_service.decrypt_file(file_path)
                            df = pd.read_csv(io.BytesIO(decrypted_data)) if ext == '.csv' else pd.read_excel(io.BytesIO(decrypted_data))
                            csv_data = df.to_csv(index=False)
                            full_prompt += f"\n\n--- DỮ LIỆU TỪ FILE {ext.upper()} ---\n{csv_data}\n--- HẾT DỮ LIỆU FILE ---"
                        except Exception as e:
                            print(f"Lỗi đọc file Excel/CSV đã giải mã: {e}")
                    else:
                        temp_path = file_path + ".decrypted"
                        try:
                            decrypted_data = self.encryption_service.decrypt_file(file_path)
                            with open(temp_path, "wb") as temp_file:
                                temp_file.write(decrypted_data)
                            
                            sample_file = self.client.files.upload(file=temp_path)
                            contents.append(sample_file)
                        except Exception as e:
                            print(f"Lỗi tải file giải mã lên Gemini: {e}")
                        finally:
                            if os.path.exists(temp_path):
                                try:
                                    os.remove(temp_path)
                                except Exception as clean_err:
                                    print(f"Không thể xóa file tạm: {clean_err}")

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
