class GuardService:
    def __init__(self):
        self.forbidden_keywords = [
            "ignore previous instructions",
            "bỏ qua các hướng dẫn",
            "system prompt",
            "bạn là ai",
            "viết mã độc",
            "hack"
        ]

    def check_input(self, user_input: str) -> bool:
        """
        Kiểm tra xem đầu vào của người dùng có chứa dấu hiệu prompt injection không.
        Trả về True nếu an toàn, False nếu bị chặn.
        """
        lower_input = user_input.lower()
        for keyword in self.forbidden_keywords:
            if keyword in lower_input:
                return False
        return True
