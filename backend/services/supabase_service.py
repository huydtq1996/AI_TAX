import os
import requests

class SupabaseService:
    def __init__(self):
        self.url = os.getenv("SUPABASE_URL")
        self.key = os.getenv("SUPABASE_ANON_KEY")
        if not self.url or not self.key:
            print("Warning: SUPABASE_URL or SUPABASE_ANON_KEY is not set.")

    def search_tax_laws(self, query_vector):
        # Giả lập tìm kiếm RAG từ Supabase pgvector
        if not self.url or not self.key:
            return "Chưa kết nối Supabase."
        
        # Nếu muốn gọi RPC thật qua REST API:
        # headers = {"apikey": self.key, "Authorization": f"Bearer {self.key}", "Content-Type": "application/json"}
        # response = requests.post(f"{self.url}/rest/v1/rpc/match_tax_laws", headers=headers, json={'query_embedding': query_vector, 'match_threshold': 0.7, 'match_count': 3})
        # return response.json()
        
        return "Thông tư 40/2021/TT-BTC: Hộ kinh doanh có doanh thu trên 100 triệu/năm mới phải nộp thuế GTGT và TNCN."
