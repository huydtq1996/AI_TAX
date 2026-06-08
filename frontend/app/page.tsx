"use client";

import { useState, useRef, useEffect, FormEvent, ChangeEvent } from "react";
import { supabase } from '../utils/supabase';
import { marked } from "marked";

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
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [userToken, setUserToken] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [chatSessions, setChatSessions] = useState<any[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [showFiles, setShowFiles] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<any[]>([]);

  // State xác thực người dùng
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authView, setAuthView] = useState<'login' | 'signup' | 'forgot_password' | 'reset_password'>('login');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);

  const chatWindowRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Lắng nghe sự thay đổi trạng thái đăng nhập
  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        setUserToken(session.access_token);
        setUserEmail(session.user.email || null);
        loadChatSessions(session.access_token);
      }
    };
    checkAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        setAuthView('reset_password');
        setUserToken(session?.access_token || null);
        setUserEmail(session?.user?.email || null);
      } else if (session) {
        setUserToken(session.access_token);
        setUserEmail(session.user.email || null);
        loadChatSessions(session.access_token);
      } else {
        setUserToken(null);
        setUserEmail(null);
        setChatSessions([]);
        setCurrentSessionId(null);
        setTaxData(null);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // Tải danh sách các phiên chat từ backend proxy
  const loadChatSessions = async (token: string) => {
    try {
      const response = await fetch(`/api/sessions?supabase_token=${token}`);
      if (response.ok) {
        const sessions = await response.json();
        if (sessions && sessions.length > 0) {
          setChatSessions(sessions);
          // Tự động load phiên gần nhất
          loadSession(sessions[0].id, token);
        } else {
          setMessages([{ id: "1", text: "Xin chào! Tôi là AI Trợ lý Thuế. Hãy cung cấp doanh thu và ngành nghề, hoặc đính kèm ảnh tờ khai/hóa đơn để tôi tư vấn.", isUser: false }]);
        }
      }
    } catch (err) {
      console.error("Lỗi tải danh sách cuộc trò chuyện:", err);
    }
  };

  // Tải và giải mã nội dung của 1 phiên chat từ backend proxy
  const loadSession = async (sessionId: string, token: string | null = userToken) => {
    if (!token) return;
    setCurrentSessionId(sessionId);
    try {
      const response = await fetch(`/api/sessions/${sessionId}/messages?supabase_token=${token}`);
      if (response.ok) {
        const msgs = await response.json();
        if (msgs && msgs.length > 0) {
          setMessages(msgs.map((m: any) => ({
            id: m.id,
            text: m.content,
            isUser: m.role === 'user',
            fileName: m.file_name,
            fileType: m.file_type,
            sources: m.tax_result_snapshot?.sources || m.sources
          })));

          // Bản sao mảng để tránh đảo ngược mảng chính
          const reverseMsgs = [...msgs].reverse();
          const lastBotMsg = reverseMsgs.find((m: any) => {
            if (m.role !== 'assistant' || !m.tax_result_snapshot) return false;
            const snapshot = m.tax_result_snapshot;
            return snapshot.tax_snapshot !== undefined || snapshot.is_taxable !== undefined;
          });
          if (lastBotMsg) {
            const snapshot = lastBotMsg.tax_result_snapshot;
            setTaxData(snapshot.tax_snapshot || snapshot);
          } else {
            setTaxData(null);
          }
        } else {
          setMessages([{ id: "1", text: "Xin chào! Bạn cần tư vấn về vấn đề gì?", isUser: false }]);
        }
      }
    } catch (err) {
      console.error("Lỗi tải nội dung cuộc trò chuyện:", err);
    }
  };

  const createNewSession = () => {
    setCurrentSessionId(null);
    setMessages([{ id: "1", text: "Xin chào! Bạn cần tư vấn về vấn đề gì?", isUser: false }]);
    setTaxData(null);
  };

  // Xóa phiên chat thông qua backend proxy
  const deleteSession = async (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    if (!window.confirm('Bạn có chắc chắn muốn xóa cuộc trò chuyện này?')) return;
    if (!userToken) return;

    try {
      const response = await fetch(`/api/sessions/${sessionId}?supabase_token=${userToken}`, {
        method: 'DELETE'
      });
      if (response.ok) {
        const newSessions = chatSessions.filter(s => s.id !== sessionId);
        setChatSessions(newSessions);

        if (currentSessionId === sessionId) {
          if (newSessions.length > 0) {
            loadSession(newSessions[0].id, userToken);
          } else {
            createNewSession();
          }
        }
      }
    } catch (err) {
      console.error("Lỗi xóa cuộc trò chuyện:", err);
    }
  };

  // Các hàm xác thực bằng email/password qua Supabase Auth
  const handleSignUp = async (e: FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError(null);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: authEmail,
        password: authPassword,
        options: {
          emailRedirectTo: window.location.origin
        }
      });
      if (error) throw error;
      alert("Đăng ký thành công! Vui lòng đăng nhập hoặc kiểm tra email xác nhận nếu có.");
      setAuthView('login');
    } catch (err: any) {
      setAuthError(err.message || "Lỗi đăng ký");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSignIn = async (e: FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError(null);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: authEmail,
        password: authPassword
      });
      if (error) throw error;
    } catch (err: any) {
      setAuthError(err.message || "Đăng nhập thất bại. Vui lòng kiểm tra lại tài khoản/mật khẩu.");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleForgotPassword = async (e: FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError(null);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(authEmail, {
        redirectTo: window.location.origin
      });
      if (error) throw error;
      alert("Yêu cầu đã gửi! Vui lòng kiểm tra hòm thư Email để nhận liên kết đặt lại mật khẩu.");
      setAuthView('login');
    } catch (err: any) {
      setAuthError(err.message || "Lỗi gửi yêu cầu khôi phục mật khẩu");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleResetPassword = async (e: FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError(null);
    try {
      const { error } = await supabase.auth.updateUser({
        password: authPassword
      });
      if (error) throw error;
      alert("Đặt lại mật khẩu thành công! Bạn có thể sử dụng mật khẩu mới để đăng nhập.");
      await supabase.auth.signOut();
      setAuthView('login');
    } catch (err: any) {
      setAuthError(err.message || "Lỗi đặt lại mật khẩu");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSignOut = async () => {
    if (window.confirm("Bạn có chắc chắn muốn đăng xuất?")) {
      await supabase.auth.signOut();
    }
  };

  useEffect(() => {
    if (chatWindowRef.current) {
      chatWindowRef.current.scrollTop = chatWindowRef.current.scrollHeight;
    }
  }, [messages]);



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
      const response = await fetch("/api/chat", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      // Cập nhật session_id nếu backend tạo mới
      if (data.session_id && data.session_id !== currentSessionId) {
        setCurrentSessionId(data.session_id);
        // Refresh danh sách bên trái (giả lập)
        if (!chatSessions.find(s => s.id === data.session_id)) {
          setChatSessions([{ id: data.session_id, title: text.substring(0, 30) + '...' }, ...chatSessions]);
        }
      }

      if (data.error) {
        const errorText = data.error.includes("Tin nhắn bị từ chối") ? data.error : `Lỗi: ${data.error}`;
        setMessages((prev) => {
          if (prev.some((m) => m.id === typingId)) {
            return prev.map((m) =>
              m.id === typingId
                ? { ...m, text: errorText, isTyping: false }
                : m
            );
          } else {
            return [
              ...prev,
              { id: Date.now().toString(), text: errorText, isUser: false },
            ];
          }
        });
      } else {
        setMessages((prev) => {
          if (prev.some((m) => m.id === typingId)) {
            return prev.map((m) =>
              m.id === typingId
                ? { ...m, text: data.text, isTyping: false, sources: data.sources }
                : m
            );
          } else {
            return [
              ...prev,
              { id: Date.now().toString(), text: data.text, isUser: false, sources: data.sources },
            ];
          }
        });

        if (data.tax_table) {
          setTaxData(data.tax_table);
        }
        
        // Nếu vừa gửi file xong, cập nhật lại danh sách file trong kho lưu trữ
        if (currentFileName) {
          fetchFiles();
        }
      }
    } catch (error) {
      setMessages((prev) => {
        if (prev.some((m) => m.id === typingId)) {
          return prev.map((m) =>
            m.id === typingId
              ? { ...m, text: "Xin lỗi, đã có lỗi kết nối đến máy chủ API.", isTyping: false }
              : m
          );
        } else {
          return [
            ...prev,
            { id: Date.now().toString(), text: "Xin lỗi, đã có lỗi kết nối đến máy chủ API.", isUser: false },
          ];
        }
      });
    }
  };

  const fetchFiles = async () => {
    if (!userToken) return;
    try {
      const response = await fetch(`/api/files?supabase_token=${userToken}`);
      const data = await response.json();
      setUploadedFiles(data);
    } catch (error) {
      console.error("Error fetching files:", error);
    }
  };

  const handleDownload = (filename: string) => {
    if (!userToken) return;
    window.open(`/api/files/${filename}?supabase_token=${userToken}`, "_blank");
  };

  const handleDeleteFile = async (filename: string) => {
    if (!window.confirm(`Bạn có chắc chắn muốn xóa file ${filename}?`)) return;
    if (!userToken) return;
    try {
      const response = await fetch(`/api/files/${filename}?supabase_token=${userToken}`, {
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

  const onFastTaxSubmit = async () => {
    if (!revenue || Number(revenue) <= 0) {
      alert("Vui lòng nhập doanh thu hợp lệ lớn hơn 0");
      return;
    }
    
    try {
      const formData = new FormData();
      formData.append("revenue", revenue);
      formData.append("category", category);
      formData.append("method", method);
      formData.append("expenses", expenses || "0");
      
      const response = await fetch("/api/calculate-tax", {
        method: "POST",
        body: formData,
      });
      
      const data = await response.json();
      if (data.error) {
        alert(data.error);
      } else if (data.tax_table) {
        setTaxData(data.tax_table);
      }
    } catch (err) {
      alert("Lỗi kết nối đến máy chủ.");
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

    // Parse markdown using marked library
    try {
      html = marked.parse(html, { breaks: true, gfm: true, async: false }) as string;
    } catch (err) {
      console.error("Lỗi parse markdown bằng marked:", err);
    }

    // 2. Tự động bao bọc tất cả các thẻ <table> bằng container cuộn ngang (.table-container) để hỗ trợ responsive tốt hơn
    html = html.replace(/<table([^>]*)>([\s\S]*?)<\/table>/gi, '<div class="table-container"><table$1>$2</table></div>');

    return <div className="formatted-content" dangerouslySetInnerHTML={{ __html: html }} />;
  };

  if (!userToken || authView === 'reset_password') {
    return (
      <div className="auth-container">
        <div className="auth-card">
          <h2>
            <i className="fa-solid fa-robot"></i>{' '}
            {authView === 'signup' && 'Đăng ký tài khoản'}
            {authView === 'login' && 'Đăng nhập hệ thống'}
            {authView === 'forgot_password' && 'Khôi phục mật khẩu'}
            {authView === 'reset_password' && 'Đặt lại mật khẩu mới'}
          </h2>
          <p>
            {authView === 'forgot_password'
              ? 'Nhập email để nhận liên kết khôi phục mật khẩu'
              : authView === 'reset_password'
              ? 'Nhập mật khẩu mới cho tài khoản của bạn'
              : 'Hệ thống hỗ trợ AI khai báo & lập kế hoạch thuế'}
          </p>

          {authError && (
            <div className="auth-error-alert">
              <i className="fa-solid fa-triangle-exclamation"></i> {authError}
            </div>
          )}

          {authView === 'forgot_password' && (
            <form onSubmit={handleForgotPassword} className="auth-form">
              <div className="form-group">
                <label>Địa chỉ Email</label>
                <input
                  type="email"
                  placeholder="email@example.com"
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  required
                />
              </div>
              <button type="submit" className="auth-submit-btn" disabled={authLoading}>
                {authLoading ? 'Đang gửi...' : 'Gửi liên kết khôi phục'}
              </button>
              <div className="auth-toggle" style={{ marginTop: '1rem', textAlign: 'center' }}>
                <button type="button" onClick={() => { setAuthView('login'); setAuthError(null); }}>
                  Quay lại đăng nhập
                </button>
              </div>
            </form>
          )}

          {authView === 'reset_password' && (
            <form onSubmit={handleResetPassword} className="auth-form">
              <div className="form-group">
                <label>Mật khẩu mới</label>
                <input
                  type="password"
                  placeholder="Mật khẩu mới (tối thiểu 6 ký tự)"
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  required
                />
              </div>
              <button type="submit" className="auth-submit-btn" disabled={authLoading}>
                {authLoading ? 'Đang lưu...' : 'Đặt lại mật khẩu'}
              </button>
            </form>
          )}

          {(authView === 'login' || authView === 'signup') && (
            <form onSubmit={authView === 'signup' ? handleSignUp : handleSignIn} className="auth-form">
              <div className="form-group">
                <label>Địa chỉ Email</label>
                <input
                  type="email"
                  placeholder="email@example.com"
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label>Mật khẩu</label>
                <input
                  type="password"
                  placeholder="••••••••"
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  required
                />
              </div>

              <button type="submit" className="auth-submit-btn" disabled={authLoading}>
                {authLoading ? 'Đang xử lý...' : authView === 'signup' ? 'Đăng ký' : 'Đăng nhập'}
              </button>

              {authView === 'login' && (
                <div style={{ textAlign: 'right', marginTop: '-5px' }}>
                  <button
                    type="button"
                    onClick={() => { setAuthView('forgot_password'); setAuthError(null); }}
                    style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '0.8rem', cursor: 'pointer', textDecoration: 'underline' }}
                  >
                    Quên mật khẩu?
                  </button>
                </div>
              )}
            </form>
          )}

          {(authView === 'login' || authView === 'signup') && (
            <div className="auth-toggle">
              {authView === 'signup' ? (
                <>
                  Đã có tài khoản?
                  <button type="button" onClick={() => { setAuthView('login'); setAuthError(null); }}>
                    Đăng nhập ngay
                  </button>
                </>
              ) : (
                <>
                  Chưa có tài khoản?
                  <button type="button" onClick={() => { setAuthView('signup'); setAuthError(null); }}>
                    Đăng ký ngay
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

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

        {/* Phần cuối Sidebar: Quản lý tệp & User Profile */}
        <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '10px', borderTop: '1px solid #e0e0e0', paddingTop: '15px' }}>
          <button
            onClick={() => { setShowFiles(true); fetchFiles(); }}
            style={{ width: '100%', padding: '10px 12px', border: 'none', borderRadius: '8px', backgroundColor: 'transparent', display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', color: '#444', transition: 'background 0.2s' }}
          >
            <i className="fa-solid fa-folder-open" style={{ fontSize: '16px', color: '#5f6368' }}></i>
            <span style={{ fontSize: '13px', fontWeight: 500 }}>Quản lý tệp tin</span>
          </button>

          {/* User Profile Card */}
          <div className="user-profile-card">
            {/* Avatar */}
            <div className="user-avatar">
              {userEmail ? userEmail[0] : 'U'}
            </div>
            
            {/* Email */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="user-email-text" title={userEmail || ""}>
                {userEmail}
              </div>
            </div>
            
            {/* Logout button */}
            <button
              onClick={handleSignOut}
              title="Đăng xuất"
              className="user-logout-btn"
            >
              <i className="fa-solid fa-right-from-bracket" style={{ fontSize: '14px' }}></i>
            </button>
          </div>
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
                  placeholder="Nhập câu hỏi hoặc gửi ảnh tờ khai/hóa đơn..."
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
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button type="submit" className="secondary-button" style={{ flex: 1 }}>
                    <i className="fa-solid fa-robot"></i> AI Tư Vấn
                  </button>
                  <button type="button" onClick={onFastTaxSubmit} className="secondary-button" style={{ flex: 1, backgroundColor: '#10b981', color: 'white', border: 'none' }}>
                    <i className="fa-solid fa-bolt"></i> Tính Nhanh
                  </button>
                </div>
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
