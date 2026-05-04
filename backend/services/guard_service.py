import re

class GuardService:
    def __init__(self):
        # 1. Danh sách từ khóa cấm (Prompt Leakage & Jailbreak)
        # Chặn các nỗ lực bắt AI quên thân phận, đóng vai hoặc tiết lộ System Prompt
        self.forbidden_keywords = [
            "ignore previous", "bỏ qua", "quên đi", "quên hết", 
            "system prompt", "hướng dẫn hệ thống", "câu lệnh ban đầu",
            "you are now", "bạn bây giờ là", "đóng vai", "hoá thân",
            "từ bây giờ", "hãy làm ngơ", "hủy bỏ chỉ thị",
            "dan", "do anything now", "developer mode", "chế độ nhà phát triển",
            "viết mã độc", "hack", "exploit", "lỗ hổng", "payload"
        ]
        
        # 2. Regex phát hiện các mẫu chèn mã độc hoặc lệnh hệ thống (Code Injection)
        self.malicious_patterns = [
            re.compile(r"```(bash|sh|python|js|javascript|cmd|powershell)"), # Cố tình ép AI xuất/chạy code độc
            re.compile(r"\{\{.*\}\}"), # Jinja/Template injection
            re.compile(r"\b(exec|eval|os\.system|subprocess)\b", re.IGNORECASE) # Các hàm thực thi mã
        ]

        # 3. Giới hạn độ dài đầu vào (Tránh DOS / Token exhaustion)
        # 3000 ký tự là quá đủ cho một câu hỏi luật thuế thông thường.
        self.max_length = 3000

    def check_input(self, user_input: str) -> bool:
        """
        Bộ lọc bảo mật đa lớp (Multi-layer WAF for LLM).
        Trả về True nếu an toàn, False nếu có dấu hiệu tấn công.
        """
        if not user_input or not user_input.strip():
            return True

        # Lớp 1: Kiểm tra độ dài (Ngăn chặn tấn công nhồi nhét / tràn bộ nhớ)
        if len(user_input) > self.max_length:
            print("[Guard] BỊ CHẶN: Đầu vào quá dài (Vượt quá giới hạn ký tự).")
            return False

        lower_input = user_input.lower()

        # Lớp 2: Quét từ khóa thao túng tâm lý AI (Jailbreak / Leakage)
        for keyword in self.forbidden_keywords:
            if keyword in lower_input:
                print(f"[Guard] BỊ CHẶN: Phát hiện từ khóa thao túng '{keyword}'")
                return False

        # Lớp 3: Quét cú pháp mã độc bằng Biểu thức chính quy (Regex)
        for pattern in self.malicious_patterns:
            if pattern.search(user_input):
                print("[Guard] BỊ CHẶN: Phát hiện cú pháp chứa mã độc (Regex).")
                return False
                
        # Lớp 4: Phát hiện bất thường (Ký tự rác)
        # Hackers hay dùng ký tự rác (!!!###$$$%%%) để làm rối Tokenizer của AI
        special_chars = sum(1 for c in user_input if not c.isalnum() and not c.isspace())
        special_char_ratio = special_chars / len(user_input)
        
        # Nếu hơn 40% là ký tự đặc biệt, có thể là mã độc hoặc dữ liệu rác
        if special_char_ratio > 0.4 and len(user_input) > 20:
             print("[Guard] BỊ CHẶN: Văn bản chứa quá nhiều ký tự đặc biệt (Có thể là tấn công Tokenizer).")
             return False

        return True
