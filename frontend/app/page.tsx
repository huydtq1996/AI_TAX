"use client";

import { useState, useRef, useEffect, FormEvent } from "react";
import { supabase } from '../utils/supabase';

type Message = {
  id: string;
  text: string;
  isUser: boolean;
  isTyping?: boolean;
  fileName?: string;
  fileType?: string;
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
        fileType: m.file_type
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
    if (typeof window !== "undefined" && "webkitSpeechRecognition" in window) {
      const SpeechRecognition = (window as any).webkitSpeechRecognition;
      const recognition = new SpeechRecognition();
      recognition.lang = "vi-VN";
      recognition.continuous = false;
      recognition.interimResults = false;

      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setInputMessage(transcript);
        handleSendMessage(transcript);
      };

      recognition.onend = () => {
        setIsRecording(false);
      };

      recognitionRef.current = recognition;
    }
  }, []);

  const formatVND = (amount: number) => {
    return new Intl.NumberFormat("vi-VN", {
      style: "currency",
      currency: "VND",
    }).format(amount);
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
      { id: typingId, text: "Đang suy nghĩ...", isUser: false, isTyping: true },
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
          { id: Date.now().toString(), text: data.text, isUser: false },
        ]);

        if (data.tax_table) {
          setTaxData(data.tax_table);
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
    const msg = `Tính thuế cho tôi theo phương pháp ${method === 'doanh_thu' ? 'Doanh thu' : 'Thu nhập tính thuế'}. Doanh thu: ${formatVND(Number(revenue))}${method === 'thu_nhap' ? `, Chi phí hợp lý: ${formatVND(Number(expenses))}` : ''}, Ngành nghề: ${catText}. Hãy giải thích chi tiết bảng tính thuế này.`;
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
  };

  const handleAttachClick = () => {
    fileInputRef.current?.click();
  };

  const renderFormattedText = (text: string) => {
    // Basic Markdown parser for the simple responses we get
    let html = text
      .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.*?)\*/g, "<em>$1</em>")
      .replace(/\n/g, "<br>");
    return <p dangerouslySetInnerHTML={{ __html: html }} />;
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
          <div className="chat-section" style={{ flex: 1 }}>
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
                            <i className={`fa-solid ${
                              msg.fileType === 'PDF' ? 'fa-file-pdf' : 
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
                      <p>
                        <i className="fa-solid fa-ellipsis fa-fade"></i> {msg.text}
                      </p>
                    ) : (
                      renderFormattedText(msg.text)
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
                    onChange={(e) => {
                      const raw = e.target.value.replace(/\D/g, "");
                      setRevenue(raw);
                      setDisplayRevenue(raw.replace(/\B(?=(\d{3})+(?!\d))/g, "."));
                    }}
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
                      onChange={(e) => {
                        const raw = e.target.value.replace(/\D/g, "");
                        setExpenses(raw);
                        setDisplayExpenses(raw.replace(/\B(?=(\d{3})+(?!\d))/g, "."));
                      }}
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
                      <div className="tax-item tax-total" style={{ marginTop: "15px", paddingTop: "12px", borderTop: "2px dashed #bbf7d0", alignItems: "center" }}>
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
                        <strong><i className="fa-solid fa-circle-info"></i> Giải thích:</strong><br/>
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
    </div>
  );
}
