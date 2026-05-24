"use client";

import { useState, useRef, useEffect, FormEvent, ChangeEvent } from "react";
import { supabase } from '../utils/supabase';

type Message = {
  id: string;
  text: string;
  isUser: boolean;
  isTyping?: boolean;
  fileName?: string;
  fileType?: string;
  sources?: string[];
};

type TaxData = {
  is_taxable: boolean;
  reason?: string;
  revenue?: number;
  tax_gtgt?: number;
  tax_tncn?: number;
  total_tax?: number;
  explanation?: string;
  taxable_revenue_gtgt?: number;
  taxable_revenue_tncn?: number;
  taxable_income?: number;
};

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "init",
      text: "Xin chào! Tôi là AI Trợ lý Khai báo Thuế. Tôi có thể giúp bạn tra cứu luật thuế, tính thuế hoặc lập kế hoạch kinh doanh.",
      isUser: false,
    },
  ]);
  const [inputMessage, setInputMessage] = useState("");
  const [revenue, setRevenue] = useState("");
  const [displayRevenue, setDisplayRevenue] = useState("");
  const [method, setMethod] = useState("doanh_thu");
  const [expenses, setExpenses] = useState("");
  const [displayExpenses, setDisplayExpenses] = useState("");
  const [category, setCategory] = useState("hoat_dong_khac");
  const [taxData, setTaxData] = useState<TaxData | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [userToken, setUserToken] = useState<string | null>(null);
  const [chatSessions, setChatSessions] = useState<any[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [showFiles, setShowFiles] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<any[]>([]);

  const chatWindowRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Đăng nhập ẩn danh và tải danh sách chat
  useEffect(() => {
    const initAuth = async () => {
      let token = null;
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        token = session.access_token;
      } else {
        const { data } = await supabase.auth.signInAnonymously();
        if (data?.session) token = data.session.access_token;
      }

      setUserToken(token);

      // Load lịch sử chat
      const { data: sessions } = await supabase
        .from('chat_sessions')
        .select('*')
        .order('created_at', { ascending: false });

      if (sessions && sessions.length > 0) {
        setChatSessions(sessions);
        loadSession(sessions[0].id); // Tự động load phiên gần nhất
      } else {
        setMessages([{ id: "1", text: "Xin chào! Tôi là AI Trợ lý Thuế. Hãy cung cấp doanh thu và ngành nghề, hoặc đính kèm ảnh tờ khai/hóa đơn để tôi tư vấn.", isUser: false }]);
      }
    };
    initAuth();
  }, []);

  // Tải nội dung của 1 phiên chat cụ thể
  const loadSession = async (sessionId: string) => {
    setCurrentSessionId(sessionId);
    const { data: msgs } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true });

    if (msgs && msgs.length > 0) {
      setMessages(msgs.map((m: any) => ({
        id: m.id,
        text: m.content,
        isUser: m.role === 'user',
        fileName: m.file_name,
        fileType: m.file_type,
        sources: m.sources
      })));

      // Nếu có bảng tính thuế từ tin nhắn cuối cùng, hiển thị lại
      const lastBotMsg = msgs.reverse().find((m: any) => m.role === 'assistant' && m.tax_result_snapshot);
      if (lastBotMsg) setTaxData(lastBotMsg.tax_result_snapshot);
      else setTaxData(null);
    } else {
      setMessages([{ id: "1", text: "Xin chào! Hãy bắt đầu hỏi đáp về thuế.", isUser: false }]);
    }
  };

  const createNewSession = () => {
    setCurrentSessionId(null);
    setMessages([{ id: "1", text: "Xin chào! Bạn cần tư vấn về vấn đề gì?", isUser: false }]);
    setTaxData(null);
  };

  const deleteSession = async (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    if (!window.confirm('Bạn có chắc chắn muốn xóa cuộc trò chuyện này?')) return;

    // Xóa từ Database
    await supabase.from('chat_sessions').delete().eq('id', sessionId);

    // Xóa khỏi UI
    const newSessions = chatSessions.filter(s => s.id !== sessionId);
    setChatSessions(newSessions);

    if (currentSessionId === sessionId) {
      if (newSessions.length > 0) {
        loadSession(newSessions[0].id);
      } else {
        createNewSession();
      }
    }
  };

  useEffect(() => {
    if (chatWindowRef.current) {
      chatWindowRef.current.scrollTop = chatWindowRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.lang = "vi-VN";
        recognition.continuous = false;
        recognition.interimResults = false;

        recognition.onresult = (event: any) => {
          const transcript = event.results[0][0].transcript;
          setInputMessage(transcript);
        };

        recognition.onend = () => {
          setIsRecording(false);
        };

        recognitionRef.current = recognition;
      } else {
        console.warn("Trình duyệt không hỗ trợ Web Speech API");
      }
    }
  }, []);

  const formatVND = (amount: number) => {
    return new Intl.NumberFormat("vi-VN", {
      style: "currency",
      currency: "VND",
    }).format(amount);
  };

  const handleNumberChange = (
    e: ChangeEvent<HTMLInputElement>,
    setVal: (val: string) => void,
    setDisplayVal: (val: string) => void
  ) => {
    const input = e.target;
    const oldVal = input.value;
    const selectionStart = input.selectionStart || 0;

    // Đếm số lượng chữ số đứng trước vị trí con trỏ trong chuỗi nhập vào
    let digitsBeforeCursor = 0;
    for (let i = 0; i < selectionStart; i++) {
      if (/\d/.test(oldVal[i])) {
        digitsBeforeCursor++;
      }
    }

    const raw = oldVal.replace(/\D/g, "");
    setVal(raw);

    const formatted = raw.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    setDisplayVal(formatted);

    // Phục hồi vị trí con trỏ sau khi React cập nhật DOM
    setTimeout(() => {
      let newCursorPos = 0;
      let digitsSeen = 0;
      for (let i = 0; i < formatted.length; i++) {
        if (digitsSeen === digitsBeforeCursor) {
          break;
        }
        if (/\d/.test(formatted[i])) {
          digitsSeen++;
        }
        newCursorPos++;
      }
      input.setSelectionRange(newCursorPos, newCursorPos);
    }, 0);
  };

  const handleSendMessage = async (text: string, forceRevenue = 0, forceCat = "", forceMethod = "", forceExpenses = 0) => {
    if (!text.trim() && !selectedFile) return;

    const currentFileName = selectedFile ? selectedFile.name : undefined;
    const currentFileType = selectedFile ? selectedFile.name.split('.').pop()?.toUpperCase() : undefined;

    const newMessages = [...messages, {
      id: Date.now().toString(),
      text,
      isUser: true,
      fileName: currentFileName,
      fileType: currentFileType
    }];
    setMessages(newMessages);
    setInputMessage("");
    setSelectedFile(null); // Clear file after adding to messages state

    const typingId = "typing-" + Date.now();
    setMessages((prev) => [
      ...prev,
      { id: typingId, text: "Đang suy nghĩ", isUser: false, isTyping: true },
    ]);

    const formData = new FormData();
    formData.append("message", text);
    formData.append("revenue", forceRevenue.toString() || "0");
    formData.append("category", forceCat || "hoat_dong_khac");
    formData.append("method", forceMethod || "doanh_thu");
    formData.append("expenses", forceExpenses.toString() || "0");
    if (selectedFile) formData.append("file", selectedFile);
    if (userToken) formData.append("supabase_token", userToken);
    if (currentSessionId) formData.append("session_id", currentSessionId);

    try {
      const response = await fetch("http://localhost:5000/api/chat", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      setMessages((prev) => prev.filter((m) => m.id !== typingId));

      // Cập nhật session_id nếu backend tạo mới
      if (data.session_id && data.session_id !== currentSessionId) {
        setCurrentSessionId(data.session_id);
        // Refresh danh sách bên trái (giả lập)
        if (!chatSessions.find(s => s.id === data.session_id)) {
          setChatSessions([{ id: data.session_id, title: text.substring(0, 30) + '...' }, ...chatSessions]);
        }
      }

      if (data.error) {
        setMessages((prev) => [
          ...prev,
          { id: Date.now().toString(), text: `Lỗi: ${data.error}`, isUser: false },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          { id: Date.now().toString(), text: data.text, isUser: false, sources: data.sources },
        ]);

        if (data.tax_table) {
          setTaxData(data.tax_table);
        }
        
        // Nếu vừa gửi file xong, cập nhật lại danh sách file trong kho lưu trữ
        if (currentFileName) {
          fetchFiles();
        }
      }
    } catch (error) {
      setMessages((prev) => prev.filter((m) => m.id !== typingId));
      setMessages((prev) => [
        ...prev,
        { id: Date.now().toString(), text: "Xin lỗi, đã có lỗi kết nối đến máy chủ API.", isUser: false },
      ]);
    }
  };

  const fetchFiles = async () => {
    try {
      const response = await fetch("http://localhost:5000/api/files");
      const data = await response.json();
      setUploadedFiles(data);
    } catch (error) {
      console.error("Error fetching files:", error);
    }
  };

  const handleDownload = (filename: string) => {
    window.open(`http://localhost:5000/api/files/${filename}`, "_blank");
  };

  const handleDeleteFile = async (filename: string) => {
    if (!window.confirm(`Bạn có chắc chắn muốn xóa file ${filename}?`)) return;
    try {
      const response = await fetch(`http://localhost:5000/api/files/${filename}`, {
        method: "DELETE",
      });
      if (response.ok) {
        fetchFiles();
      }
    } catch (error) {
      console.error("Error deleting file:", error);
    }
  };

  const onChatSubmit = (e: FormEvent) => {
    e.preventDefault();
    handleSendMessage(inputMessage);
  };

  const onTaxSubmit = (e: FormEvent) => {
    e.preventDefault();
    const categories: any = {
      ban_buon_ban_le: "Bán buôn, bán lẻ hàng hóa (tạp hóa, siêu thị mini, v.v.)",
      ban_le_thuoc_my_pham: "Bán lẻ thuốc, dụng cụ y tế, mỹ phẩm",
      phan_phoi_cung_cap_hang_hoa: "Phân phối, cung cấp hàng hóa khác",
      nha_hang_quan_an_cafe: "Dịch vụ lưu trú, nhà hàng, quán ăn, quán cafe",
      dich_vu_lam_dep_spa: "Dịch vụ làm đẹp, cắt tóc, gội đầu, spa, massage",
      dich_vu_sua_chua: "Dịch vụ sửa chữa (máy tính, đồ gia dụng, xe máy)",
      dich_vu_tu_van: "Dịch vụ tư vấn, thiết kế, pháp luật, kế toán",
      xay_dung_khong_bao_thau: "Xây dựng, lắp đặt không bao thầu nguyên vật liệu",
      san_xuat_gia_cong: "Sản xuất, gia công hàng hóa",
      van_tai_hang_hoa_hanh_khach: "Vận tải hàng hóa, vận tải hành khách",
      xay_dung_co_bao_thau: "Xây dựng, lắp đặt có bao thầu nguyên vật liệu",
      san_xuat_van_tai_dich_vu_co_hang_hoa: "Sản xuất, vận tải, dịch vụ có gắn hàng hóa khác",
      khai_thac_khoang_san: "Khai thác tài nguyên, khoáng sản",
      san_xuat_ttdb: "Sản xuất hàng chịu thuế Tiêu thụ đặc biệt",
      hoat_dong_khac: "Hoạt động kinh doanh khác",
      cho_thue_tai_san_dai_ly: "Cho thuê tài sản, đại lý bảo hiểm, xổ số",
      dich_vu_noi_dung_so: "Dịch vụ nội dung thông tin số, quảng cáo số"
    };

    const catText = categories[category];
    const msgParts = [
      `### ⌨️ Tính thuế cho tôi theo phương pháp ${method === 'doanh_thu' ? 'Doanh thu' : 'Thu nhập tính thuế'}:`,
      `*   **Doanh thu**: ${formatVND(Number(revenue))}`
    ];

    if (method === 'thu_nhap') {
      msgParts.push(`*   **Chi phí hợp lý**: ${formatVND(Number(expenses))}`);
    }

    msgParts.push(`*   **Ngành nghề**: ${catText}`);
    msgParts.push(`👉 *Hãy giải thích chi tiết bảng tính thuế này.*`);

    const msg = msgParts.join('\n');
    handleSendMessage(msg, Number(revenue), category, method, Number(expenses));
  };

  const toggleVoice = () => {
    if (!recognitionRef.current) return;

    if (isRecording) {
      recognitionRef.current.stop();
    } else {
      recognitionRef.current.start();
      setIsRecording(true);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setSelectedFile(e.target.files[0]);
    }
    e.target.value = '';
  };

  const handleAttachClick = () => {
    fileInputRef.current?.click();
  };

  const renderFormattedText = (text: string) => {
    if (!text) return null;

    let html = text.trim();

    // 1. Loại bỏ các ký tự code block markdown ```html hoặc ``` nếu AI bao quanh câu trả lời HTML
    const htmlBlockRegex = /^```html\s*([\s\S]*?)\s*```$/i;
    const genericBlockRegex = /^```(?:xml|html)?\s*([\s\S]*?)\s*```$/i;
    
    if (htmlBlockRegex.test(html)) {
      html = html.replace(htmlBlockRegex, '$1');
    } else if (genericBlockRegex.test(html)) {
      html = html.replace(genericBlockRegex, '$1');
    }
    
    html = html.trim();

    // Hỗ trợ parse các thẻ Markdown cơ bản sang HTML
    const parseMarkdown = (txt: string): string => {
      let temp = txt;
      
      // Convert headings
      temp = temp.replace(/^### (.*?)$/gm, '<h3>$1</h3>');
      temp = temp.replace(/^## (.*?)$/gm, '<h2>$1</h2>');
      temp = temp.replace(/^# (.*?)$/gm, '<h1>$1</h1>');
      
      // Convert list items
      const lines = temp.split('\n');
      let inList = false;
      const processedLines: string[] = [];
      for (const line of lines) {
        const listMatch = line.match(/^(\s*)[\*\-]\s+(.*)$/);
        if (listMatch) {
          if (!inList) {
            processedLines.push('<ul>');
            inList = true;
          }
          processedLines.push(`<li>${listMatch[2]}</li>`);
        } else {
          if (inList) {
            processedLines.push('</ul>');
            inList = false;
          }
          processedLines.push(line);
        }
      }
      if (inList) {
        processedLines.push('</ul>');
      }
      temp = processedLines.join('\n');

      // Convert bold
      temp = temp.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
      
      // Convert italic
      temp = temp.replace(/\*(.*?)\*/g, '<em>$1</em>');
      
      return temp;
    };

    html = parseMarkdown(html);

    // 2. Tự động bao bọc tất cả các thẻ <table> bằng container cuộn ngang (.table-container) để hỗ trợ responsive tốt hơn
    html = html.replace(/<table([^>]*)>([\s\S]*?)<\/table>/gi, '<div class="table-container"><table$1>$2</table></div>');

    // 3. Xử lý ký tự xuống dòng (\n) tránh sinh ra thẻ <br> lỗi trong các khối HTML như table, list
    let cleanedHtml = html.replace(/\n/g, "<br>");
    
    cleanedHtml = cleanedHtml
      // Xóa <br> ngay sau thẻ mở block
      .replace(/<(table|thead|tbody|tfoot|tr|th|td|ul|ol|li|div|p|h1|h2|h3|h4|h5|h6)([^>]*)><br>/gi, "<$1$2>")
      // Xóa <br> ngay trước thẻ đóng block
      .replace(/<br><\/(table|thead|tbody|tfoot|tr|th|td|ul|ol|li|div|p|h1|h2|h3|h4|h5|h6)>/gi, "</$1>")
      // Xóa <br> giữa thẻ đóng và thẻ tiếp theo
      .replace(/(<\/tr>|<\/td>|<\/th>|<\/thead>|<\/tbody>|<\/tfoot>|<\/table>|<\/ul>|<\/ol>|<\/li>|<\/p>|<\/div>)<br>/gi, "$1")
      // Xóa <br> trước các thẻ mở block
      .replace(/<br>(<table|<div|<tr|<td|<th|<thead|<tbody|<tfoot|<ul|<ol|<li|<p|<h1|<h2|<h3|<h4|<h5|<h6)/gi, "$1")
      // Rút gọn các thẻ <br> liên tiếp quá nhiều
      .replace(/(<br>\s*){3,}/g, "<br><br>");

    return <div className="formatted-content" dangerouslySetInnerHTML={{ __html: cleanedHtml }} />;
  };

  return (
    <div className="layout" style={{ display: 'flex', height: '100vh', width: '100vw', overflow: 'hidden' }}>
      {/* SIDEBAR TƯƠNG TỰ GEMINI */}
      <div className="sidebar" style={{ width: '280px', backgroundColor: '#f0f4f9', padding: '15px', display: 'flex', flexDirection: 'column', borderRight: '1px solid #e0e0e0', overflowY: 'hidden' }}>
        <button
          onClick={createNewSession}
          style={{ backgroundColor: '#fff', border: 'none', borderRadius: '20px', padding: '15px', display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', fontWeight: 'bold', fontSize: '14px' }}>
          <i className="fa-solid fa-plus"></i> Cuộc trò chuyện mới
        </button>

        <div style={{ marginTop: '20px', flex: 1, overflowY: 'auto' }}>
          <h4 style={{ fontSize: '12px', color: '#666', textTransform: 'uppercase', marginBottom: '10px', marginLeft: '5px' }}>Lịch sử trò chuyện</h4>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '5px' }}>
            {chatSessions.map((session) => (
              <li key={session.id} style={{ display: 'flex', alignItems: 'center', backgroundColor: currentSessionId === session.id ? '#d3e3fd' : 'transparent', borderRadius: '8px' }}>
                <button
                  onClick={() => loadSession(session.id)}
                  style={{ flex: 1, textAlign: 'left', padding: '12px 10px', border: 'none', backgroundColor: 'transparent', color: currentSessionId === session.id ? '#041e49' : '#444', cursor: 'pointer', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: '13px' }}>
                  <i className="fa-regular fa-message" style={{ marginRight: '8px' }}></i> {session.title}
                </button>
                <button
                  onClick={(e) => deleteSession(e, session.id)}
                  title="Xóa cuộc trò chuyện"
                  style={{ padding: '8px', border: 'none', backgroundColor: 'transparent', color: '#888', cursor: 'pointer', borderRadius: '50%' }}>
                  <i className="fa-solid fa-trash-can"></i>
                </button>
              </li>
            ))}
          </ul>
        </div>

        {/* Nút quản lý file ở cuối sidebar */}
        <div style={{ marginTop: 'auto', padding: '10px 0', borderTop: '1px solid #e0e0e0' }}>
          <button
            onClick={() => { setShowFiles(true); fetchFiles(); }}
            style={{ width: '100%', padding: '12px', border: 'none', borderRadius: '8px', backgroundColor: 'transparent', display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', color: '#444', transition: 'background 0.2s' }}
          >
            <i className="fa-solid fa-folder-open" style={{ fontSize: '18px', color: '#5f6368' }}></i>
            <span style={{ fontSize: '14px', fontWeight: 500 }}>Quản lý tệp tin</span>
          </button>
        </div>
      </div>

      <main className="main-content" style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%' }}>
        <header className="app-header" style={{ padding: '15px 30px', backgroundColor: '#fff', borderBottom: '1px solid #eee' }}>
          <div className="header-content">
            <h1 style={{ fontSize: '1.2rem', margin: 0 }}>
              <i className="fa-solid fa-robot"></i> AI Trợ lý Khai báo Thuế
            </h1>
          </div>
        </header>

        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          <div className="chat-section">
            <div className="chat-window" ref={chatWindowRef}>
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`message ${msg.isUser ? "user-message" : "ai-message"}`}
                >
                  <div className="message-avatar">
                    <i className={`fa-solid ${msg.isUser ? "fa-user" : "fa-robot"}`}></i>
                  </div>
                  <div className="message-bubble">
                    {msg.fileName && (
                      <div className="file-attachment">
                        <div className="file-info-container">
                          <div className="file-icon-box">
                            <i className={`fa-solid ${msg.fileType === 'PDF' ? 'fa-file-pdf' :
                                (['JPG', 'PNG', 'JPEG', 'WEBP'].includes(msg.fileType || '') ? 'fa-file-image' :
                                  (['XLS', 'XLSX', 'CSV'].includes(msg.fileType || '') ? 'fa-file-excel' : 'fa-file-lines'))
                              }`}></i>
                          </div>
                          <div className="file-details">
                            <span className="file-name-text">{msg.fileName}</span>
                            <span className="file-type-badge">{msg.fileType}</span>
                          </div>
                        </div>
                      </div>
                    )}
                    {msg.isTyping ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>{msg.text}</span>
                        <div className="typing-indicator" style={{ transform: 'translateY(2px)' }}>
                          <span className="typing-dot"></span>
                          <span className="typing-dot"></span>
                          <span className="typing-dot"></span>
                        </div>
                      </div>
                    ) : (
                      <>
                        {renderFormattedText(msg.text)}

                        {msg.sources && msg.sources.length > 0 && (
                          <div className="sources-wrapper" style={{
                            marginTop: '12px',
                            paddingTop: '12px',
                            borderTop: '1px solid var(--border-color)',
                          }}>
                            <details style={{ cursor: 'pointer' }}>
                              <summary style={{
                                listStyle: 'none',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                fontSize: '0.75rem',
                                fontWeight: '700',
                                color: 'var(--primary)',
                                textTransform: 'uppercase',
                                letterSpacing: '0.03em',
                                outline: 'none'
                              }}>
                                <i className="fa-solid fa-circle-info"></i>
                                Nguồn tham chiếu ({msg.sources.length})
                                <i className="fa-solid fa-chevron-down" style={{ fontSize: '0.6rem', marginLeft: 'auto', transition: 'transform 0.3s' }}></i>
                              </summary>

                              <div className="sources-list" style={{
                                marginTop: '10px',
                                display: 'flex',
                                flexWrap: 'wrap',
                                gap: '6px',
                                animation: 'slideDown 0.2s ease-out'
                              }}>
                                {msg.sources.map((source, idx) => (
                                  <span key={idx} style={{
                                    fontSize: '0.7rem',
                                    padding: '3px 10px',
                                    backgroundColor: 'rgba(79, 70, 229, 0.08)',
                                    borderRadius: '100px',
                                    border: '1px solid rgba(79, 70, 229, 0.15)',
                                    color: '#4f46e5',
                                    fontWeight: '500',
                                    display: 'inline-block'
                                  }}>
                                    {source}
                                  </span>
                                ))}
                              </div>
                            </details>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="input-area">
              {selectedFile && (
                <div className="file-preview">
                  <i className="fa-solid fa-file-invoice"></i> Đã đính kèm: {selectedFile.name}
                  <button onClick={() => setSelectedFile(null)}><i className="fa-solid fa-xmark"></i></button>
                </div>
              )}
              <form onSubmit={onChatSubmit} className="chat-form">
                <button
                  type="button"
                  className="icon-button voice-btn"
                  onClick={toggleVoice}
                  title="Nhập bằng giọng nói"
                  style={{ color: isRecording ? "red" : undefined }}
                >
                  <i className={`fa-solid ${isRecording ? "fa-stop" : "fa-microphone"}`}></i>
                </button>

                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  style={{ display: "none" }}
                  accept=".xlsx,.xls,.csv,.pdf,image/*"
                />
                <button type="button" className="icon-button file-btn" onClick={handleAttachClick} title="Đính kèm Excel/PDF/Ảnh hóa đơn">
                  <i className="fa-solid fa-paperclip"></i>
                </button>

                <input
                  type="text"
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  placeholder={isRecording ? "Đang nghe..." : "Nhập câu hỏi hoặc gửi ảnh tờ khai/hóa đơn..."}
                  autoComplete="off"
                />
                <button type="submit" className="primary-button send-btn" disabled={!inputMessage.trim() && !selectedFile}>
                  <i className="fa-solid fa-paper-plane"></i> Gửi
                </button>
              </form>
            </div>
          </div>

          <div className="side-panel">
            <div className="card tax-calc-card">
              <h3>
                <i className="fa-solid fa-calculator"></i> Tính thuế nhanh
              </h3>
              <form onSubmit={onTaxSubmit} className="tax-form">
                <div className="form-group">
                  <label>Phương pháp tính thuế:</label>
                  <select value={method} onChange={(e) => setMethod(e.target.value)}>
                    <option value="doanh_thu">Tính theo Doanh thu</option>
                    <option value="thu_nhap">Tính theo Thu nhập tính thuế (DT - Chi phí)</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Doanh thu năm (VNĐ):</label>
                  <input
                    type="text"
                    value={displayRevenue}
                    onChange={(e) => handleNumberChange(e, setRevenue, setDisplayRevenue)}
                    onBlur={() => {
                      if (revenue) {
                        setDisplayRevenue(revenue.replace(/\B(?=(\d{3})+(?!\d))/g, ".") + ",00");
                      }
                    }}
                    onFocus={() => {
                      if (revenue) {
                        setDisplayRevenue(revenue.replace(/\B(?=(\d{3})+(?!\d))/g, "."));
                      }
                    }}
                    placeholder="VD: 600.000.000,00"
                    required
                  />
                </div>
                {method === "thu_nhap" && (
                  <div className="form-group">
                    <label>Chi phí hợp lý (VNĐ):</label>
                    <input
                      type="text"
                      value={displayExpenses}
                      onChange={(e) => handleNumberChange(e, setExpenses, setDisplayExpenses)}
                      onBlur={() => {
                        if (expenses) {
                          setDisplayExpenses(expenses.replace(/\B(?=(\d{3})+(?!\d))/g, ".") + ",00");
                        }
                      }}
                      onFocus={() => {
                        if (expenses) {
                          setDisplayExpenses(expenses.replace(/\B(?=(\d{3})+(?!\d))/g, "."));
                        }
                      }}
                      placeholder="VD: 100.000.000,00"
                      required
                    />
                  </div>
                )}
                <div className="form-group">
                  <label>Ngành nghề:</label>
                  <select value={category} onChange={(e) => setCategory(e.target.value)}>
                    <optgroup label="1. Phân phối, cung cấp hàng hóa (1.5%)">
                      <option value="ban_buon_ban_le">Bán buôn, bán lẻ hàng hóa (tạp hóa, siêu thị mini...)</option>
                      <option value="ban_le_thuoc_my_pham">Bán lẻ thuốc, dụng cụ y tế, mỹ phẩm</option>
                      <option value="phan_phoi_cung_cap_hang_hoa">Phân phối, cung cấp hàng hóa khác</option>
                    </optgroup>
                    <optgroup label="2. Dịch vụ, XD không bao thầu (7%)">
                      <option value="nha_hang_quan_an_cafe">Dịch vụ lưu trú, nhà hàng, quán ăn, quán cafe</option>
                      <option value="dich_vu_lam_dep_spa">Dịch vụ làm đẹp, cắt tóc, gội đầu, spa, massage</option>
                      <option value="dich_vu_sua_chua">Dịch vụ sửa chữa (máy tính, đồ gia dụng, xe máy)</option>
                      <option value="dich_vu_tu_van">Dịch vụ tư vấn, thiết kế, pháp luật, kế toán</option>
                      <option value="xay_dung_khong_bao_thau">Xây dựng, lắp đặt không bao thầu nguyên vật liệu</option>
                      <option value="cho_thue_tai_san_dai_ly">Cho thuê tài sản, đại lý bảo hiểm, xổ số (5%)</option>
                    </optgroup>
                    <optgroup label="3. Sản xuất, vận tải, XD có bao thầu (4.5%)">
                      <option value="san_xuat_gia_cong">Sản xuất, gia công hàng hóa</option>
                      <option value="van_tai_hang_hoa_hanh_khach">Vận tải hàng hóa, vận tải hành khách</option>
                      <option value="xay_dung_co_bao_thau">Xây dựng, lắp đặt có bao thầu nguyên vật liệu</option>
                      <option value="san_xuat_van_tai_dich_vu_co_hang_hoa">Sản xuất, vận tải, dịch vụ có gắn hàng hóa khác</option>
                    </optgroup>
                    <optgroup label="4. Hoạt động kinh doanh khác (3%)">
                      <option value="khai_thac_khoang_san">Khai thác tài nguyên, khoáng sản</option>
                      <option value="san_xuat_ttdb">Sản xuất hàng chịu thuế Tiêu thụ đặc biệt</option>
                      <option value="hoat_dong_khac">Hoạt động kinh doanh khác</option>
                      <option value="dich_vu_noi_dung_so">Dịch vụ nội dung số, quảng cáo số (5%)</option>
                    </optgroup>
                  </select>
                </div>
                <button type="submit" className="secondary-button">
                  Tính Thuế & Tư Vấn
                </button>
              </form>
            </div>

            {taxData && (
              <div className="card result-card" style={{ display: "block" }}>
                <h3>Kết quả Tính Thuế</h3>
                <div>
                  {!taxData.is_taxable ? (
                    <>
                      <div className="tax-item">
                        <span>Trạng thái:</span>
                        <strong>Được miễn thuế</strong>
                      </div>
                      <div className="tax-item">
                        <span>Lý do:</span>
                        <span>{taxData.reason}</span>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="tax-item">
                        <span>Doanh thu:</span>
                        <strong>{formatVND(taxData.revenue || 0)}</strong>
                      </div>
                      <div className="tax-item">
                        <span>DT tính thuế GTGT (toàn bộ):</span>
                        <strong>{formatVND(taxData.taxable_revenue_gtgt || 0)}</strong>
                      </div>
                      {taxData.taxable_revenue_tncn !== undefined && (
                        <div className="tax-item">
                          <span>DT tính thuế TNCN (vượt 1 tỷ):</span>
                          <strong>{formatVND(taxData.taxable_revenue_tncn || 0)}</strong>
                        </div>
                      )}
                      {taxData.taxable_income !== undefined && (
                        <div className="tax-item">
                          <span>Thu nhập tính thuế:</span>
                          <strong>{formatVND(taxData.taxable_income || 0)}</strong>
                        </div>
                      )}
                      <div className="tax-item">
                        <span>Thuế GTGT:</span>
                        <span>{formatVND(taxData.tax_gtgt || 0)}</span>
                      </div>
                      <div className="tax-item">
                        <span>Thuế TNCN:</span>
                        <span>{formatVND(taxData.tax_tncn || 0)}</span>
                      </div>
                      <div className="tax-item tax-total" style={{ alignItems: "center" }}>
                        <span style={{ fontSize: "1.1rem", fontWeight: "bold" }}>Tổng thuế phải nộp:</span>
                        <span style={{ fontSize: "1.2rem", fontWeight: "bold", color: "#15803d" }}>{formatVND(taxData.total_tax || 0)}</span>
                      </div>
                      <div style={{
                        marginTop: "15px",
                        padding: "12px",
                        backgroundColor: "#f0fdf4",
                        border: "1px solid #bbf7d0",
                        borderRadius: "8px",
                        fontSize: "0.85rem",
                        color: "#166534",
                        lineHeight: "1.6",
                        whiteSpace: "pre-wrap"
                      }}>
                        <strong><i className="fa-solid fa-circle-info"></i> Giải thích:</strong><br />
                        {taxData.explanation}
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Modal quản lý file */}
      {showFiles && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
          <div style={{ backgroundColor: 'white', borderRadius: '12px', width: '90%', maxWidth: '600px', maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: '0 8px 30px rgba(0,0,0,0.2)' }}>
            <div style={{ padding: '20px', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '10px', fontSize: '1.2rem', color: '#1a1a1a' }}>
                <i className="fa-solid fa-folder-open" style={{ color: '#5f6368' }}></i> Danh sách tệp đã tải lên
              </h3>
              <button onClick={() => setShowFiles(false)} style={{ border: 'none', background: 'none', fontSize: '20px', cursor: 'pointer', color: '#888' }}>
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '15px' }}>
              {uploadedFiles.length === 0 ? (
                <div style={{ padding: '40px', textAlign: 'center', color: '#888' }}>
                  <i className="fa-solid fa-file-circle-exclamation" style={{ fontSize: '48px', marginBottom: '10px', display: 'block', opacity: 0.5 }}></i>
                  Chưa có tệp tin nào được tải lên.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {uploadedFiles.map((file) => (
                    <div key={file.name} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', borderRadius: '10px', border: '1px solid #eee', backgroundColor: '#fafafa' }}>
                      <div style={{ width: '40px', height: '40px', borderRadius: '8px', backgroundColor: '#fff', border: '1px solid #eee', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#5f6368' }}>
                        <i className={`fa-solid ${file.type === 'PDF' ? 'fa-file-pdf' : (['JPG', 'PNG', 'JPEG', 'WEBP'].includes(file.type) ? 'fa-file-image' : (['XLS', 'XLSX', 'CSV'].includes(file.type) ? 'fa-file-excel' : 'fa-file-lines'))}`} style={{ fontSize: '18px' }}></i>
                      </div>
                      <div style={{ flex: 1, overflow: 'hidden' }}>
                        <div style={{ fontSize: '14px', fontWeight: 600, color: '#333', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{file.name}</div>
                        <div style={{ fontSize: '12px', color: '#888' }}>{(file.size / 1024).toFixed(1)} KB • {new Date(file.ctime * 1000).toLocaleDateString('vi-VN')}</div>
                      </div>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button onClick={() => handleDownload(file.name)} title="Tải xuống" style={{ width: '36px', height: '36px', border: 'none', borderRadius: '8px', backgroundColor: '#e8f0fe', color: '#1a73e8', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <i className="fa-solid fa-download"></i>
                        </button>
                        <button onClick={() => handleDeleteFile(file.name)} title="Xóa" style={{ width: '36px', height: '36px', border: 'none', borderRadius: '8px', backgroundColor: '#fce8e6', color: '#d93025', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <i className="fa-solid fa-trash"></i>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div style={{ padding: '15px', borderTop: '1px solid #eee', display: 'flex', justifyContent: 'center' }}>
              <button onClick={() => setShowFiles(false)} className="primary-button" style={{ padding: '10px 24px', fontSize: '14px' }}>Đóng</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
