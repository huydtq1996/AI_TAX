import os
import requests

class SupabaseService:
    def __init__(self):
        self.url = os.getenv("SUPABASE_URL")
        self.key = os.getenv("SUPABASE_ANON_KEY")
        if not self.url or not self.key:
            print("Warning: SUPABASE_URL or SUPABASE_ANON_KEY is not set.")

    def search_tax_laws(self, query_vector):
        if not self.url or not self.key or not query_vector:
            return "Chưa kết nối Supabase hoặc thiếu Vector."
        
        headers = {"apikey": self.key, "Authorization": f"Bearer {self.key}", "Content-Type": "application/json"}
        response = requests.post(
            f"{self.url}/rest/v1/rpc/match_tax_documents", 
            headers=headers, 
            json={'query_embedding': query_vector, 'match_threshold': 0.6, 'match_count': 3}
        )
        
        if response.status_code == 200:
            results = response.json()
            if results and len(results) > 0:
                context = ""
                for idx, row in enumerate(results):
                    context += f"[{idx+1}] {row['title']}: {row['content']}\n"
                return context
        
        return "Không tìm thấy luật thuế liên quan trong cơ sở tri thức."

    def create_session(self, title, token):
        if not self.url or not self.key or not token: return None
        headers = {
            "apikey": self.key, 
            "Authorization": f"Bearer {token}", 
            "Content-Type": "application/json",
            "Prefer": "return=representation"
        }
        res = requests.post(f"{self.url}/rest/v1/chat_sessions", headers=headers, json={"title": title})
        if res.status_code in [200, 201]:
            return res.json()[0]["id"]
        return None

    def save_message(self, session_id, role, content, token, tax_snapshot=None):
        if not self.url or not self.key or not token: return
        headers = {
            "apikey": self.key, 
            "Authorization": f"Bearer {token}", 
            "Content-Type": "application/json"
        }
        data = {
            "session_id": session_id,
            "role": role,
            "content": content
        }
        if tax_snapshot:
            data["tax_result_snapshot"] = tax_snapshot
            
        requests.post(f"{self.url}/rest/v1/chat_messages", headers=headers, json=data)
