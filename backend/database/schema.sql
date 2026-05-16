-- Kích hoạt extension pgvector để hỗ trợ tính năng RAG (Tìm kiếm theo độ tương đồng)
CREATE EXTENSION IF NOT EXISTS vector;

-- ==============================================================================
-- BẢNG 1: QUẢN LÝ PHIÊN CHAT (Giống cột bên trái của Gemini/ChatGPT)
-- ==============================================================================
CREATE TABLE chat_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(), -- Tự động gán bằng ID của người dùng gọi API
    title TEXT NOT NULL DEFAULT 'Cuộc trò chuyện mới',        -- Tên cuộc trò chuyện (AI có thể tự tạo tên dựa vào câu hỏi đầu tiên)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Index để truy vấn danh sách chat của user nhanh hơn
CREATE INDEX idx_chat_sessions_user_id ON chat_sessions(user_id);

-- ==============================================================================
-- BẢNG 2: LƯU TRỮ LỊCH SỬ TIN NHẮN 
-- ==============================================================================
CREATE TABLE chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID REFERENCES chat_sessions(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')), -- Phân biệt ai là người gửi
    content TEXT NOT NULL,                                              -- Nội dung chat
    attached_file_url TEXT,                                             -- Đường dẫn file/ảnh (Lưu trên Supabase Storage)
    file_name TEXT,                                                     -- Tên tệp tin (để hiển thị icon)
    file_type TEXT,                                                     -- Loại tệp tin (PDF, XLSX, ...)
    tax_result_snapshot JSONB,                                          -- Lưu lại bảng tính thuế (nếu có) để khi mở lại chat vẫn còn số liệu
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Index để load tin nhắn trong 1 phiên chat cực nhanh
CREATE INDEX idx_chat_messages_session_id ON chat_messages(session_id);
CREATE INDEX idx_chat_messages_created_at ON chat_messages(created_at);

-- ==============================================================================
-- BẢNG 3: CƠ SỞ TRI THỨC RAG (Lưu luật thuế, văn bản hướng dẫn)
-- ==============================================================================
CREATE TABLE tax_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT,                            -- Tên nghị định, thông tư (Ví dụ: Thông tư 40/2021)
    content TEXT NOT NULL,                 -- Nội dung chi tiết của điều luật (Chunk)
    metadata JSONB,                        -- Thông tin thêm (Chương, mục, điều mấy...)
    issue_date DATE,                       -- Ngày ban hành để ưu tiên luật mới nhất
    embedding vector(768) NOT NULL,        -- Dữ liệu số (Vector) sinh ra từ Google Gemini Embedding API
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Tạo Index để tối ưu hóa việc tìm kiếm Vector siêu tốc (HNSW Index)
CREATE INDEX idx_tax_documents_embedding ON tax_documents USING hnsw (embedding vector_cosine_ops);

-- ==============================================================================
-- HÀM TÌM KIẾM RAG (RPC Function cho Frontend/Backend gọi tới)
-- ==============================================================================
CREATE OR REPLACE FUNCTION match_tax_documents (
  query_embedding vector(768),
  match_threshold float,
  match_count int
)
RETURNS TABLE (
  id uuid,
  title text,
  content text,
  metadata jsonb,
  issue_date date,
  similarity float
)
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    t.id,
    t.title,
    t.content,
    t.metadata,
    t.issue_date,
    1 - (t.embedding <=> query_embedding) AS similarity
  FROM tax_documents t
  -- Khoảng cách Cosine < (1 - threshold) tương đương với similarity > threshold
  WHERE t.embedding <=> query_embedding < 1 - match_threshold
  -- Sắp xếp chuẩn của pgvector để ăn được Index: Khoảng cách càng nhỏ càng xếp trên
  ORDER BY t.embedding <=> query_embedding ASC
  LIMIT match_count;
END;
$$;

-- ==============================================================================
-- POLICIES (Row Level Security - RLS)
-- ==============================================================================
ALTER TABLE chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE tax_documents ENABLE ROW LEVEL SECURITY;

-- 1. Policies cho tax_documents (Cơ sở tri thức RAG)
-- Ai cũng có thể đọc (SELECT) luật thuế để tra cứu
CREATE POLICY "Anyone can read tax documents"
ON tax_documents FOR SELECT
USING (true);
-- Lưu ý: Không tạo Policy INSERT/UPDATE cho user thường. Việc thêm luật thuế sẽ do Admin/Backend làm bằng Service Key.

-- 2. Policies cho chat_sessions (Phiên chat)

CREATE POLICY "Users can view their own chat sessions"
ON chat_sessions FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own chat sessions"
ON chat_sessions FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own chat sessions"
ON chat_sessions FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own chat sessions"
ON chat_sessions FOR DELETE
USING (auth.uid() = user_id);

CREATE POLICY "Users can view messages in their sessions"
ON chat_messages FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM chat_sessions 
    WHERE chat_sessions.id = chat_messages.session_id 
    AND chat_sessions.user_id = auth.uid()
  )
);

CREATE POLICY "Users can insert messages in their sessions"
ON chat_messages FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM chat_sessions 
    WHERE chat_sessions.id = chat_messages.session_id 
    AND chat_sessions.user_id = auth.uid()
  )
);
