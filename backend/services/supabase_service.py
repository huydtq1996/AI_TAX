import os
from supabase import create_client, Client

class SupabaseService:
    def __init__(self):
        url: str = os.getenv("SUPABASE_URL")
        key: str = os.getenv("SUPABASE_ANON_KEY")
        if url and key:
            self.supabase: Client = create_client(url, key)
        else:
            self.supabase = None
            print("Warning: SUPABASE_URL or SUPABASE_ANON_KEY is not set.")

    def search_tax_laws(self, query_vector):
        # Giả lập tìm kiếm RAG từ Supabase pgvector
        if not self.supabase:
            return "Chưa kết nối Supabase."
        
        # Hàm RPC gọi pgvector trên Supabase (cần setup database trước)
        # response = self.supabase.rpc('match_tax_laws', {'query_embedding': query_vector, 'match_threshold': 0.7, 'match_count': 3}).execute()
        # return response.data
        return "Thông tư 40/2021/TT-BTC: Hộ kinh doanh có doanh thu trên 100 triệu/năm mới phải nộp thuế GTGT và TNCN."
