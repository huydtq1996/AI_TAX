import os
import requests
import re

class SupabaseService:
    def __init__(self):
        self.url = os.getenv("SUPABASE_URL")
        self.key = os.getenv("SUPABASE_ANON_KEY")
        if not self.url or not self.key:
            print("Warning: SUPABASE_URL or SUPABASE_ANON_KEY is not set.")

    def search_tax_laws(self, query_vector):
        if not self.url or not self.key or not query_vector:
            return "Thiếu cấu hình Supabase hoặc Vector.", []
        
        headers = {"apikey": self.key, "Authorization": f"Bearer {self.key}", "Content-Type": "application/json"}
        response = requests.post(
            f"{self.url}/rest/v1/rpc/match_tax_documents", 
            headers=headers, 
            json={'query_embedding': query_vector, 'match_threshold': 0.1, 'match_count': 100}
        )
        
        if response.status_code == 200:
            results = response.json()
            if results:
                # 1. Lọc Top các đoạn có độ tương đồng (semantic similarity) cao nhất
                # Kết quả từ RPC trả về đã được sắp xếp theo độ tương đồng giảm dần.
                # Lấy các đoạn liên quan nhất và giới hạn tối đa 5 đoạn/văn bản để tránh loãng context.
                filtered_results, doc_counts = [], {}
                for r in results:
                    base_title = r.get('title', 'Tài liệu').split(' - ')[0]
                    doc_counts[base_title] = doc_counts.get(base_title, 0) + 1
                    if doc_counts[base_title] <= 5:
                        filtered_results.append(r)
                    if len(filtered_results) >= 15: break

                # 2. Kiểm tra cập nhật/sửa đổi chính xác cho các đoạn đã được chọn lọc
                filtered_results = self._check_for_updates(filtered_results)

                # 3. Sắp xếp đa tầng các đoạn đã chọn: Năm > Số hiệu > Ngày ban hành
                # Đảm bảo LLM đọc các quy định mới nhất trước trong số các đoạn có độ liên quan cao.
                def get_sort_key(item):
                    title = item.get('title', '')
                    doc_id = self._parse_doc_id(title) or self._parse_doc_id(item.get('content', ''))
                    issue_date = item.get('issue_date') or '0000-00-00'
                    if doc_id:
                        return (doc_id['year'], doc_id['number'], issue_date)
                    return (issue_date[:4], 0, issue_date)

                filtered_results.sort(key=get_sort_key, reverse=True)

                context = "LƯU Ý QUAN TRỌNG: Ưu tiên số liệu của VĂN BẢN [1] vì đây là văn bản mới nhất. Nếu có cảnh báo 'ĐÃ ĐƯỢC SỬA ĐỔI', hãy tuyệt đối tuân theo văn bản mới hơn.\n\n"
                sources = []
                for idx, row in enumerate(filtered_results):
                    title = row.get('title', 'Quy định thuế')
                    if title not in sources: sources.append(title)
                    date_str = f" (Ngày: {row.get('issue_date')})" if row.get('issue_date') else ""
                    
                    # Thêm thông tin cảnh báo nếu văn bản đã bị sửa đổi
                    amended_info = ""
                    if row.get('amended_by'):
                        amended_info = f"\n⚠️ CẢNH BÁO: Văn bản này ĐÃ ĐƯỢC SỬA ĐỔI/BỔ SUNG bởi: {row['amended_by']}. Hãy ưu tiên nội dung của văn bản mới này."
                    
                    context += f"--- VĂN BẢN [{idx+1}] ---\nTiêu đề: {title}{date_str}\nNội dung: {row.get('content', '')}{amended_info}\n\n"
                return context, sources
        
        return "Không tìm thấy dữ liệu liên quan.", []

    def create_session(self, title, token):
        if not all([self.url, self.key, token]): return None
        headers = {"apikey": self.key, "Authorization": f"Bearer {token}", "Content-Type": "application/json", "Prefer": "return=representation"}
        res = requests.post(f"{self.url}/rest/v1/chat_sessions", headers=headers, json={"title": title})
        return res.json()[0]["id"] if res.status_code in [200, 201] else None

    def save_message(self, session_id, role, content, token, **kwargs):
        if not all([self.url, self.key, token]): return
        headers = {"apikey": self.key, "Authorization": f"Bearer {token}", "Content-Type": "application/json"}
        data = {"session_id": session_id, "role": role, "content": content}
        
        # Áp dụng các trường mở rộng
        field_mapping = {"tax_snapshot": "tax_result_snapshot", "file_name": "file_name", "file_type": "file_type", "sources": "sources"}
        for key, value in kwargs.items():
            if key in field_mapping and value:
                data[field_mapping[key]] = value
            
        requests.post(f"{self.url}/rest/v1/chat_messages", headers=headers, json=data)

    def _parse_doc_id(self, text):
        if not text: return None
        # Định dạng: Số: number/year/type (Ví dụ: 68/2026/NĐ-CP)
        match = re.search(r'(\d+)/(\d{4})/([\w-]+)', text)
        if match:
            return {
                'number': int(match.group(1)),
                'year': match.group(2),
                'type': match.group(3),
                'full': f"{match.group(1)}/{match.group(2)}/{match.group(3)}"
            }
        return None

    def _check_for_updates(self, results):
        if not results: return results
        headers = {"apikey": self.key, "Authorization": f"Bearer {self.key}"}
        type_year_cache = {}
        checked_ids = {}

        for row in results:
            doc_info = self._parse_doc_id(row.get('title')) or self._parse_doc_id(row.get('content'))
            if not doc_info: continue
            
            full_id = doc_info['full']
            if full_id in checked_ids:
                row['amended_by'] = checked_ids[full_id]
                continue
            
            key = (doc_info['year'], doc_info['type'])
            if key not in type_year_cache:
                # Query các văn bản cùng năm và loại để kiểm tra sự tồn tại của bản sửa đổi
                url = f"{self.url}/rest/v1/tax_documents?title=ilike.*{doc_info['year']}/{doc_info['type']}*&select=title,content"
                try:
                    resp = requests.get(url, headers=headers, timeout=5)
                    if resp.status_code == 200:
                        # Nhóm nội dung theo tiêu đề văn bản gốc (bỏ Điều/Khoản)
                        grouped = {}
                        for item in resp.json():
                            base = item.get('title', '').split(' - ')[0]
                            if base not in grouped: grouped[base] = []
                            grouped[base].append(item.get('content', ''))
                        type_year_cache[key] = grouped
                    else: type_year_cache[key] = {}
                except: type_year_cache[key] = {}
            
            # Tìm văn bản có số hiệu lớn hơn và nội dung xác nhận việc sửa đổi văn bản hiện tại
            amender = None
            for base_title, contents in type_year_cache[key].items():
                p_info = self._parse_doc_id(base_title)
                if p_info and p_info['number'] > doc_info['number']:
                    combined_content = " ".join(contents).lower()
                    # Kiểm tra xem văn bản mới có nhắc đến mã số của văn bản cũ kèm từ khóa pháp lý
                    keywords = ["sửa đổi", "bổ sung", "thay thế", "bãi bỏ"]
                    if full_id in combined_content and any(kw in combined_content for kw in keywords):
                        amender = base_title
                        break
            
            checked_ids[full_id] = amender
            row['amended_by'] = amender
        return results
