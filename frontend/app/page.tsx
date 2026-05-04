"use client";

import { useState, useRef, useEffect, FormEvent } from "react";

type Message = {
  id: string;
  text: string;
  isUser: boolean;
  isTyping?: boolean;
};

type TaxData = {
  is_taxable: boolean;
  reason?: string;
  revenue?: number;
  tax_gtgt?: number;
  tax_tncn?: number;
  total_tax?: number;
  explanation?: string;
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
  const [category, setCategory] = useState("hoat_dong_khac");
  const [taxData, setTaxData] = useState<TaxData | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const chatWindowRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const handleSendMessage = async (text: string, forceRevenue = 0, forceCat = "") => {
    if (!text.trim()) return;

    const newMessages = [...messages, { id: Date.now().toString(), text, isUser: true }];
    setMessages(newMessages);
    setInputMessage("");

    const typingId = "typing-" + Date.now();
    setMessages((prev) => [
      ...prev,
      { id: typingId, text: "Đang suy nghĩ...", isUser: false, isTyping: true },
    ]);

    const formData = new FormData();
    formData.append("message", text);
    formData.append("revenue", forceRevenue.toString() || "0");
    formData.append("category", forceCat || "hoat_dong_khac");
    if (selectedFile) {
      formData.append("file", selectedFile);
    }

    try {
      const response = await fetch("http://localhost:5000/api/chat", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      setMessages((prev) => prev.filter((m) => m.id !== typingId));
      setSelectedFile(null); // Clear file sau khi gửi

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
      hoat_dong_khac: "Hoạt động kinh doanh khác"
    };
    
    const catText = categories[category];
    const msg = `Tính thuế cho tôi. Doanh thu: ${formatVND(Number(revenue))}, Ngành nghề: ${catText}. Hãy giải thích chi tiết bảng tính thuế này.`;
    handleSendMessage(msg, Number(revenue), category);
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
    <div className="app-container">
      <header className="app-header">
        <div className="header-content">
          <h1>
            <i className="fa-solid fa-robot"></i> AI Trợ lý Khai báo Thuế
          </h1>
          <p>Dành cho Hộ Kinh doanh Nhỏ - Tư duy Trí tuệ Nhân tạo</p>
        </div>
      </header>

      <main className="main-content">
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
                <label>Doanh thu năm (VNĐ):</label>
                <input
                  type="number"
                  value={revenue}
                  onChange={(e) => setRevenue(e.target.value)}
                  placeholder="VD: 600000000"
                  required
                />
              </div>
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
                      <span>Doanh thu tính thuế (vượt 500tr):</span>
                      <strong>{formatVND((taxData as any).taxable_revenue || 0)}</strong>
                    </div>
                    <div className="tax-item">
                      <span>Thuế GTGT:</span>
                      <span>{formatVND(taxData.tax_gtgt || 0)}</span>
                    </div>
                    <div className="tax-item">
                      <span>Thuế TNCN:</span>
                      <span>{formatVND(taxData.tax_tncn || 0)}</span>
                    </div>
                    <div className="tax-item tax-total">
                      <span>Tổng thuế phải nộp:</span>
                      <span>{formatVND(taxData.total_tax || 0)}</span>
                    </div>
                    <div style={{ marginTop: "10px", fontSize: "0.85rem", color: "#166534" }}>
                      {taxData.explanation}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
