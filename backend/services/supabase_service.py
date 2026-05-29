import os
import requests
import re
from services.encryption_service import EncryptionService

class SupabaseService:
    def __init__(self):
        self.url = os.getenv("SUPABASE_URL")
        self.key = os.getenv("SUPABASE_ANON_KEY")
        self.encryption_service = EncryptionService()
        if not self.url or not self.key:
            print("Warning: SUPABASE_URL or SUPABASE_ANON_KEY is not set.")

    def create_session(self, title, user_token):
        if not self.url or not self.key or not user_token:
            return None
        
        headers = {
            "apikey": self.key, 
            "Authorization": f"Bearer {user_token}", 
            "Content-Type": "application/json",
            "Prefer": "return=representation"
        }
        
        data = {"title": title}
        
        try:
            response = requests.post(
                f"{self.url}/rest/v1/chat_sessions", 
                headers=headers, 
                json=data
            )
            if response.status_code in (200, 201):
                result = response.json()
                if result and len(result) > 0:
                    return result[0].get('id')
            else:
                print(f"Error creating session: {response.text}")
        except Exception as e:
            print(f"Exception creating session: {e}")
            
        return None

    def save_message(self, session_id, role, content, user_token, file_name=None, file_type=None, tax_snapshot=None, sources=None):
        if not self.url or not self.key or not session_id or not user_token:
            return False
            
        headers = {
            "apikey": self.key, 
            "Authorization": f"Bearer {user_token}", 
            "Content-Type": "application/json"
        }
        
        data = {
            "session_id": session_id,
            "role": role,
            "content": self.encryption_service.encrypt_text(content)
        }
        
        if file_name:
            data["file_name"] = file_name
        if file_type:
            data["file_type"] = file_type
            
        # Kết hợp tax_snapshot và sources thành đối tượng JSONB nếu cần
        tax_result_data = {}
        if tax_snapshot:
            tax_result_data["tax_snapshot"] = tax_snapshot
        if sources:
            tax_result_data["sources"] = sources
            
        if tax_result_data:
            data["tax_result_snapshot"] = tax_result_data
            
        try:
            response = requests.post(
                f"{self.url}/rest/v1/chat_messages", 
                headers=headers, 
                json=data
            )
            if response.status_code in (200, 201):
                return True
            else:
                print(f"Error saving message: {response.text}")
        except Exception as e:
            print(f"Exception saving message: {e}")
            
        return False

    def search_tax_laws(self, query_vector):
        if not self.url or not self.key or not query_vector:
            return "Thiếu cấu hình Supabase hoặc Vector.", []
        
        headers = {"apikey": self.key, "Authorization": f"Bearer {self.key}", "Content-Type": "application/json"}
        # Yêu cầu RPC trả về cả trường metadata
        response = requests.post(
            f"{self.url}/rest/v1/rpc/match_tax_documents", 
            headers=headers, 
            json={'query_embedding': query_vector, 'match_threshold': 0.1, 'match_count': 100}
        )
        
        if response.status_code == 200:
            results = response.json()
            if results:
                # (1). Lọc kết quả với chiến thuật Đa dạng hóa (Round-Robin)
                from collections import defaultdict

                grouped_results = defaultdict(list)
                for r in results:
                    meta = r.get('metadata', {})
                    law_name = meta.get('law_name', r.get('title', 'Tài liệu').split(' - ')[0])
                    # Lưu trữ các đoạn vào danh sách riêng của từng văn bản
                    # (Vì DB đã ORDER BY ASC, các đoạn trong list này đã được sắp xếp từ giống nhất đến ít giống nhất)
                    grouped_results[law_name].append(r)

                filtered_results = []
                max_total_chunks = 15
                max_per_doc = 5 # Vẫn giữ luật không quá 5 đoạn/văn bản để tránh loãng
                
                doc_pull_counts = defaultdict(int)

                # Bắt đầu chia bài: Lấy xoay vòng mỗi văn bản 1 đoạn tốt nhất
                while len(filtered_results) < max_total_chunks:
                    added_in_this_round = False
                    
                    # grouped_results giữ nguyên thứ tự xuất hiện ban đầu (văn bản có điểm cao nhất xếp trước)
                    for law_name, chunks in list(grouped_results.items()):
                        # Nếu văn bản này vẫn còn đoạn chưa lấy VÀ chưa lấy quá 5 đoạn
                        if chunks and doc_pull_counts[law_name] < max_per_doc:
                            filtered_results.append(chunks.pop(0))
                            doc_pull_counts[law_name] += 1
                            added_in_this_round = True
                            
                        if len(filtered_results) >= max_total_chunks:
                            break
                            
                    # Nếu đi hết 1 vòng mà không nhặt được thêm đoạn nào (hết dữ liệu), thì dừng
                    if not added_in_this_round:
                        break

                # (2) & (3). Tìm văn bản mới hơn và trích xuất các đoạn sửa đổi/bổ sung
                filtered_results, amendment_docs = self._check_for_updates(filtered_results)

                # Sắp xếp đa tầng: Năm > Ngày ban hành > Số hiệu
                def get_sort_key(item):
                    meta = item.get('metadata', {})
                    law_name = meta.get('law_name', item.get('title', ''))
                    doc_id = self._parse_doc_id(law_name)
                    issue_date = item.get('issue_date') or '0000-00-00'
                    
                    if doc_id:
                        # Đưa issue_date lên trước number để fix lỗi cross-type
                        return (doc_id['year'], issue_date, doc_id['number'])
                        
                    # Fallback nếu văn bản không có chuẩn số hiệu
                    year_from_date = int(issue_date[:4]) if issue_date != '0000-00-00' else 0
                    return (year_from_date, issue_date, 0)

                filtered_results.sort(key=get_sort_key, reverse=True)

                # --- XÂY DỰNG CONTEXT CHO AI ---
                context = "Dưới đây là cơ sở dữ liệu pháp luật (Ngữ cảnh pháp lý) được trích xuất từ hệ thống:\n\n"
                
                sources = []
                # Đưa các đoạn gốc vào Context
                context += "=== CÁC QUY ĐỊNH GỐC TÌM ĐƯỢC ===\n"
                for idx, row in enumerate(filtered_results):
                    meta = row.get('metadata', {})
                    law_name = meta.get('law_name', row.get('title', 'Quy định thuế'))
                    article = meta.get('article', 'N/A')
                    section = meta.get('section', 'N/A')
                    
                    source_parts = []
                    if article and article != 'N/A':
                        source_parts.append(f"Điều {article}")
                    if section and section != 'N/A':
                        source_parts.append(f"Khoản {section}")
                    
                    source_label = law_name
                    if source_parts:
                        source_label += f" ({', '.join(source_parts)})"
                    
                    if source_label not in sources: 
                        sources.append(source_label)
                    
                    amended_info = ""
                    if row.get('amended_by'):
                        amended_info = f"\n⚠️ CẢNH BÁO: Điều/Khoản này có thể ĐÃ BỊ SỬA ĐỔI/BÃI BỎ bởi: {row['amended_by']}."
                    
                    context += f"--- [{law_name}] (Điều: {article}, Khoản: {section}) ---\nNội dung: {row.get('content', '')}{amended_info}\n\n"

                # Đưa các đoạn sửa đổi (từ bước 3) vào Context để AI so sánh
                if amendment_docs:
                    context += "=== THÔNG TIN SỬA ĐỔI/BỔ SUNG (DÙNG ĐỂ ĐỐI CHIẾU) ===\n"
                    for am_doc in amendment_docs:
                        meta = am_doc.get('metadata', {})
                        law_name = meta.get('law_name', 'Văn bản mới')
                        article = meta.get('article', 'N/A')
                        section = meta.get('section', 'N/A')
                        
                        source_parts = []
                        if article and article != 'N/A':
                            source_parts.append(f"Điều {article}")
                        if section and section != 'N/A':
                            source_parts.append(f"Khoản {section}")
                        
                        source_label = law_name
                        if source_parts:
                            source_label += f" ({', '.join(source_parts)})"
                        
                        if source_label not in sources: 
                            sources.append(source_label)
                        context += f"--- [{law_name}] (Điều: {meta.get('article', 'N/A')}, Khoản: {meta.get('section', 'N/A')}) ---\n"
                        context += f"Nội dung sửa đổi: {am_doc.get('content', '')}\n\n"

                return context, sources
        
        return "Không tìm thấy dữ liệu liên quan.", []

    def _parse_doc_id(self, text):
        """Trích xuất Number, Year, Type từ chuỗi (VD: Nghị định số: 68/2026/NĐ-CP)"""
        if not text: return None
        match = re.search(r'(\d+)/(\d{4})/([\w-]+)', text)
        if match:
            return {
                'number': int(match.group(1)),
                'year': int(match.group(2)),
                'type': match.group(3),
                'full': match.group(0) # VD: 68/2026/NĐ-CP
            }
        return None

    def _check_for_updates(self, results):
        """
        Thực hiện Step (2) và (3):
        Tìm các văn bản mới hơn (bất kể loại văn bản), kiểm tra xem có sửa đổi/cập nhật văn bản gốc không.
        """
        if not results: return results, []
        
        headers = {"apikey": self.key, "Authorization": f"Bearer {self.key}"}
        checked_law_names = {} 
        amendment_docs = [] 
        
        for row in results:
            meta = row.get('metadata', {})
            law_name = meta.get('law_name')
            
            if not law_name: continue
            
            doc_info = self._parse_doc_id(law_name)
            if not doc_info: continue

            if law_name in checked_law_names:
                row['amended_by'] = checked_law_names[law_name]
                continue

            # TÌM CROSS-TYPE: Tìm MỌI văn bản mà nội dung có chứa số hiệu của văn bản cũ (VD: "109/2025/QH15")
            # Sử dụng parameter truyền vào để an toàn với ký tự "/" trong số hiệu
            params = {
                "select": "content,metadata,issue_date",
                "content": f"ilike.*{doc_info['full']}*"
            }
            url = f"{self.url}/rest/v1/tax_documents"
            
            try:
                resp = requests.get(url, headers=headers, params=params, timeout=5)
                if resp.status_code != 200: continue
                
                amender_law_name = None
                
                for item in resp.json():
                    item_meta = item.get('metadata', {})
                    item_law_name = item_meta.get('law_name')
                    item_info = self._parse_doc_id(item_law_name)
                    
                    if not item_info: continue
                    
                    # LOGIC SO SÁNH THỜI GIAN ĐA DẠNG:
                    is_newer = False
                    
                    # 1. So sánh Năm
                    if item_info['year'] > doc_info['year']:
                        is_newer = True
                    # 2. Nếu cùng Năm
                    elif item_info['year'] == doc_info['year']:
                        item_date = item.get('issue_date', '0000-00-00')
                        doc_date = row.get('issue_date', '0000-00-00')
                        
                        # So sánh ngày ban hành (nếu DB có dữ liệu issue_date chuẩn)
                        if item_date != '0000-00-00' and doc_date != '0000-00-00':
                            if item_date > doc_date:
                                is_newer = True
                        # Nếu không có ngày ban hành cụ thể, mà CÙNG LOẠI văn bản thì so sánh số hiệu
                        elif item_info['type'] == doc_info['type'] and item_info['number'] > doc_info['number']:
                            is_newer = True
                            
                    if is_newer:
                        content = item.get('content', '').lower()
                        keywords = ["sửa đổi", "bổ sung", "bãi bỏ", "thay thế", "áp dụng", "điều chỉnh"]
                        
                        # Kiểm tra xem văn bản mới có thực sự chứa từ khóa tác động lên văn bản cũ không
                        if any(kw in content for kw in keywords):
                            amender_law_name = item_law_name
                            amendment_docs.append(item)
                
                if amender_law_name:
                    checked_law_names[law_name] = amender_law_name
                    row['amended_by'] = amender_law_name
                else:
                    checked_law_names[law_name] = None
                    
            except Exception as e:
                print(f"Error checking DB for cross-updates: {e}")
                
        return results, amendment_docs

    def get_sessions(self, user_token):
        if not self.url or not self.key or not user_token:
            return []
        headers = {
            "apikey": self.key, 
            "Authorization": f"Bearer {user_token}", 
            "Content-Type": "application/json"
        }
        try:
            response = requests.get(
                f"{self.url}/rest/v1/chat_sessions?order=created_at.desc", 
                headers=headers
            )
            if response.status_code == 200:
                return response.json()
            else:
                print(f"Error fetching sessions: {response.text}")
        except Exception as e:
            print(f"Exception fetching sessions: {e}")
        return []

    def get_messages(self, session_id, user_token):
        if not self.url or not self.key or not session_id or not user_token:
            return []
        headers = {
            "apikey": self.key, 
            "Authorization": f"Bearer {user_token}", 
            "Content-Type": "application/json"
        }
        try:
            response = requests.get(
                f"{self.url}/rest/v1/chat_messages?session_id=eq.{session_id}&order=created_at.asc", 
                headers=headers
            )
            if response.status_code == 200:
                messages = response.json()
                for m in messages:
                    if "content" in m:
                        m["content"] = self.encryption_service.decrypt_text(m["content"])
                return messages
            else:
                print(f"Error fetching messages: {response.text}")
        except Exception as e:
            print(f"Exception fetching messages: {e}")
        return []

    def delete_session(self, session_id, user_token):
        if not self.url or not self.key or not session_id or not user_token:
            return False
        headers = {
            "apikey": self.key, 
            "Authorization": f"Bearer {user_token}", 
            "Content-Type": "application/json"
        }
        try:
            response = requests.delete(
                f"{self.url}/rest/v1/chat_sessions?id=eq.{session_id}", 
                headers=headers
            )
            if response.status_code in (200, 204):
                return True
            else:
                print(f"Error deleting session: {response.text}")
        except Exception as e:
            print(f"Exception deleting session: {e}")
        return False

    def get_user_files(self, user_token):
        if not self.url or not self.key or not user_token:
            return []
        headers = {
            "apikey": self.key, 
            "Authorization": f"Bearer {user_token}", 
            "Content-Type": "application/json"
        }
        try:
            response = requests.get(
                f"{self.url}/rest/v1/chat_messages?file_name=not.is.null&select=file_name,file_type,created_at", 
                headers=headers
            )
            if response.status_code == 200:
                return response.json()
            else:
                print(f"Error fetching user files: {response.text}")
        except Exception as e:
            print(f"Exception fetching user files: {e}")
        return []