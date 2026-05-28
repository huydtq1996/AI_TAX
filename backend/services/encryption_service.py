import os
from cryptography.fernet import Fernet

class EncryptionService:
    def __init__(self):
        self.key = self._get_or_create_key()
        self.cipher = Fernet(self.key)

    def _get_or_create_key(self) -> bytes:
        # Tải từ biến môi trường trước
        key_str = os.getenv("ENCRYPTION_KEY")
        if key_str:
            return key_str.encode()

        # Nếu chưa có, kiểm tra thủ công file .env để tải hoặc tự động tạo mới
        env_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env")
        
        # Nếu file .env tồn tại, phân tích thủ công
        if os.path.exists(env_path):
            with open(env_path, "r", encoding="utf-8") as f:
                lines = f.readlines()
            for line in lines:
                if line.startswith("ENCRYPTION_KEY="):
                    val = line.split("=", 1)[1].strip()
                    if val:
                        # Thiết lập cả vào biến môi trường hệ thống
                        os.environ["ENCRYPTION_KEY"] = val
                        return val.encode()

        # Tạo một khóa mới nếu không tìm thấy
        new_key = Fernet.generate_key()
        new_key_str = new_key.decode()

        # Ghi thêm vào cuối file .env
        try:
            with open(env_path, "a", encoding="utf-8") as f:
                # Thêm dòng mới nếu cần thiết
                f.write(f"\nENCRYPTION_KEY={new_key_str}\n")
            print(f"Generated new ENCRYPTION_KEY and saved to {env_path}")
        except Exception as e:
            print(f"Warning: Could not save ENCRYPTION_KEY to .env: {e}")

        # Thiết lập vào biến môi trường
        os.environ["ENCRYPTION_KEY"] = new_key_str
        return new_key

    def encrypt_text(self, text: str) -> str:
        if not text:
            return ""
        return self.cipher.encrypt(text.encode("utf-8")).decode("utf-8")

    def decrypt_text(self, encrypted_text: str) -> str:
        if not encrypted_text:
            return ""
        try:
            return self.cipher.decrypt(encrypted_text.encode("utf-8")).decode("utf-8")
        except Exception as e:
            print(f"Decryption error: {e}")
            return "[Lỗi giải mã nội dung]"

    def encrypt_file(self, file_path: str):
        if not os.path.exists(file_path):
            return
        
        with open(file_path, "rb") as f:
            data = f.read()
            
        # Mã hóa dữ liệu
        encrypted_data = self.cipher.encrypt(data)
        
        with open(file_path, "wb") as f:
            f.write(encrypted_data)

    def decrypt_file(self, file_path: str) -> bytes:
        if not os.path.exists(file_path):
            return b""
            
        with open(file_path, "rb") as f:
            encrypted_data = f.read()
            
        try:
            return self.cipher.decrypt(encrypted_data)
        except Exception as e:
            print(f"File decryption error for {file_path}: {e}")
            # Nếu giải mã thất bại, tệp tin có thể đã được giải mã sẵn hoặc bị hỏng. Trả về rỗng.
            return b""
