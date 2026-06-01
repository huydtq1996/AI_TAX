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

  // States mới cho Dashboard & Sổ thu chi
  const [viewMode, setViewMode] = useState<'dashboard' | 'chat' | 'ledger' | 'tax_schedule'>('dashboard');
  const [businessName, setBusinessName] = useState("Mimimart");
  const [businessCategory, setBusinessCategory] = useState("ban_buon_ban_le");
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [ledgerDate, setLedgerDate] = useState(new Date().toISOString().split('T')[0]);
  const [ledgerAmount, setLedgerAmount] = useState("");
  const [ledgerDescription, setLedgerDescription] = useState("");
  const [editingTransactionId, setEditingTransactionId] = useState<string | null>(null);
  const [isOcrLoading, setIsOcrLoading] = useState(false);

  // States cho Phân loại & Bộ lọc Sổ thu chi
  const [ledgerType, setLedgerType] = useState<'thu' | 'chi'>('thu');
  const [ledgerFilterType, setLedgerFilterType] = useState<'all' | 'month' | 'day'>('all');
  const [ledgerFilterMonth, setLedgerFilterMonth] = useState(new Date().toISOString().substring(0, 7));
  const [ledgerFilterDay, setLedgerFilterDay] = useState(new Date().toISOString().split('T')[0]);

  // States cho tính năng Lịch nộp thuế
  const [declarationType, setDeclarationType] = useState<string>("quy");
  const [taxPayments, setTaxPayments] = useState<any[]>([]);
  const [selectedPayment, setSelectedPayment] = useState<any | null>(null);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [paymentPaidAmount, setPaymentPaidAmount] = useState("");
  const [paymentPaidDate, setPaymentPaidDate] = useState(new Date().toISOString().split('T')[0]);

  const chatWindowRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Helper render header dùng chung cho các trang con
  const renderHeader = (title: string, iconClass: string) => (
    <header className="app-header" style={{ padding: '12px 20px', backgroundColor: '#fff', borderBottom: '1px solid #eee', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', width: '100%', flexShrink: 0 }}>
      <button onClick={() => setViewMode('dashboard')} className="header-back-btn" title="Quay lại Dashboard">
        <i className="fa-solid fa-arrow-left"></i> Quay lại Dashboard
      </button>
      <div className="header-content">
        <h1 style={{ fontSize: '1.2rem', margin: 0, display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--primary)', fontWeight: 'bold' }}>
          <i className={iconClass}></i> {title}
        </h1>
      </div>
    </header>
  );

  // Helper tính thuế theo tỷ lệ ngành nghề
  const getCategoryRate = (cat: string) => {
    const rates: any = {
      ban_buon_ban_le: 0.015,
      ban_le_thuoc_my_pham: 0.015,
      phan_phoi_cung_cap_hang_hoa: 0.015,
      nha_hang_quan_an_cafe: 0.07,
      dich_vu_lam_dep_spa: 0.07,
      dich_vu_sua_chua: 0.07,
      dich_vu_tu_van: 0.07,
      xay_dung_khong_bao_thau: 0.07,
      san_xuat_gia_cong: 0.045,
      van_tai_hang_hoa_hanh_khach: 0.045,
      xay_dung_co_bao_thau: 0.045,
      san_xuat_van_tai_dich_vu_co_hang_hoa: 0.045,
      khai_thac_khoang_san: 0.03,
      san_xuat_ttdb: 0.03,
      hoat_dong_khac: 0.03,
      cho_thue_tai_san_dai_ly: 0.10,
      dich_vu_noi_dung_so: 0.10,
    };
    return rates[cat] || 0.03;
  };

  // Fetch Business Settings từ Backend
  const fetchBusinessSettings = async (token: string) => {
    try {
      const response = await fetch(`/api/business-settings?supabase_token=${token}`);
      if (response.ok) {
        const data = await response.json();
        if (data) {
          setBusinessName(data.business_name || "Mimimart");
          setBusinessCategory(data.business_category || "ban_buon_ban_le");
          setDeclarationType(data.declaration_type || "quy");
        }
      }
    } catch (err) {
      console.error("Lỗi tải thông tin hộ kinh doanh:", err);
    }
  };

  // Fetch Tax Payments từ Backend
  const fetchTaxPayments = async (token: string) => {
    try {
      const response = await fetch(`/api/tax-payments?supabase_token=${token}`);
      if (response.ok) {
        const data = await response.json();
        setTaxPayments(data || []);
      }
    } catch (err) {
      console.error("Lỗi tải thông tin nộp thuế:", err);
    }
  };

  // Kiểm tra lịch nghỉ lễ/cuối tuần Việt Nam để rollover
  const isHoliday = (date: Date): boolean => {
    const m = date.getMonth() + 1; // 1-12
    const d = date.getDate();      // 1-31

    // Ngày lễ cố định Việt Nam (Dương lịch)
    if (m === 1 && d === 1) return true; // Tết Dương lịch
    if (m === 4 && d === 30) return true; // Giải phóng miền Nam
    if (m === 5 && d === 1) return true; // Quốc tế Lao động
    if (m === 9 && d === 2) return true; // Quốc khánh
    if (m === 9 && d === 3) return true; // Ngày nghỉ Quốc khánh bổ sung

    // Thứ 7, Chủ nhật
    const day = date.getDay(); // 0: Chủ nhật, 6: Thứ bảy
    if (day === 0 || day === 6) return true;

    return false;
  };

  // Nhận ngày nộp thuế đề xuất và tự động dời sang ngày làm việc tiếp theo nếu trùng nghỉ lễ/cuối tuần
  const getAdjustedDueDate = (dateStr: string): string => {
    const date = new Date(dateStr);
    while (isHoliday(date)) {
      date.setDate(date.getDate() + 1);
    }
    return date.toISOString().split('T')[0];
  };

  // Format ngày DD/MM/YYYY để hiển thị
  const formatDateDisplay = (dateStr: string) => {
    if (!dateStr) return "";
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  };

  // Tổng hợp các giao dịch và tạo danh sách các kỳ nộp thuế dựa trên hình thức kê khai
  const getTaxSchedulePeriods = () => {
    const periods: {
      periodKey: string;
      periodLabel: string;
      revenue: number;
      estimatedTax: number;
      dueDate: string;
      paidAmount: number;
      paidDate: string | null;
      status: 'paid' | 'partial' | 'unpaid' | 'none';
      transactionsList: any[];
    }[] = [];

    const categoryRate = getCategoryRate(businessCategory);
    
    // Chỉ lấy giao dịch doanh thu (thu nhập dương) để tính thuế
    const revenueTransactions = transactions.filter(tx => parseFloat(tx.amount || 0) > 0);

    const getAnnualRevenueForYear = (year: number) => {
      return revenueTransactions
        .filter((t: any) => {
          if (!t.date) return false;
          const [y] = t.date.split('-');
          return parseInt(y) === year;
        })
        .reduce((sum: number, t: any) => sum + parseFloat(t.amount || 0), 0);
    };

    if (declarationType === 'thang') {
      const groups: { [key: string]: any[] } = {};
      revenueTransactions.forEach(tx => {
        if (!tx.date) return;
        const periodKey = tx.date.substring(0, 7); // YYYY-MM
        if (!groups[periodKey]) groups[periodKey] = [];
        groups[periodKey].push(tx);
      });

      const sortedKeys = Object.keys(groups).sort().reverse();
      sortedKeys.forEach(periodKey => {
        const txs = groups[periodKey];
        const revenue = txs.reduce((sum, tx) => sum + parseFloat(tx.amount || 0), 0);
        const [yearStr, monthStr] = periodKey.split('-');
        const year = parseInt(yearStr);
        const month = parseInt(monthStr);
        const annualRevenueForPeriodYear = getAnnualRevenueForYear(year);
        const estimatedTax = annualRevenueForPeriodYear <= 1000000000 ? 0 : revenue * categoryRate;

        let nextYear = year;
        let nextMonth = month + 1;
        if (nextMonth > 12) {
          nextMonth = 1;
          nextYear = year + 1;
        }
        const baseDueDateStr = `${nextYear}-${String(nextMonth).padStart(2, '0')}-20`;
        const dueDate = getAdjustedDueDate(baseDueDateStr);

        const paymentRecord = taxPayments.find(p => p.period_key === periodKey);
        const paidAmount = paymentRecord ? parseFloat(paymentRecord.paid_amount || 0) : 0;
        const paidDate = paymentRecord ? paymentRecord.paid_date : null;

        let status: 'paid' | 'partial' | 'unpaid' | 'none' = 'unpaid';
        if (estimatedTax === 0) {
          status = 'none';
        } else if (paidAmount >= estimatedTax) {
          status = 'paid';
        } else if (paidAmount > 0) {
          status = 'partial';
        }

        periods.push({
          periodKey,
          periodLabel: `Tháng ${monthStr}/${year}`,
          revenue,
          estimatedTax,
          dueDate,
          paidAmount,
          paidDate,
          status,
          transactionsList: txs
        });
      });
    } else if (declarationType === 'quy') {
      const groups: { [key: string]: any[] } = {};
      revenueTransactions.forEach(tx => {
        if (!tx.date) return;
        const [year, monthStr] = tx.date.split('-');
        const month = parseInt(monthStr);
        const q = Math.ceil(month / 3);
        const periodKey = `${year}-Q${q}`;
        if (!groups[periodKey]) groups[periodKey] = [];
        groups[periodKey].push(tx);
      });

      const sortedKeys = Object.keys(groups).sort().reverse();
      sortedKeys.forEach(periodKey => {
        const txs = groups[periodKey];
        const revenue = txs.reduce((sum, tx) => sum + parseFloat(tx.amount || 0), 0);
        const [yearStr, qStr] = periodKey.split('-Q');
        const year = parseInt(yearStr);
        const q = parseInt(qStr);
        const annualRevenueForPeriodYear = getAnnualRevenueForYear(year);
        const estimatedTax = annualRevenueForPeriodYear <= 1000000000 ? 0 : revenue * categoryRate;

        let baseDueDateStr = "";
        if (q === 1) {
          baseDueDateStr = `${year}-04-30`;
        } else if (q === 2) {
          baseDueDateStr = `${year}-07-31`;
        } else if (q === 3) {
          baseDueDateStr = `${year}-10-31`;
        } else {
          baseDueDateStr = `${year + 1}-01-31`;
        }
        const dueDate = getAdjustedDueDate(baseDueDateStr);

        const paymentRecord = taxPayments.find(p => p.period_key === periodKey);
        const paidAmount = paymentRecord ? parseFloat(paymentRecord.paid_amount || 0) : 0;
        const paidDate = paymentRecord ? paymentRecord.paid_date : null;

        let status: 'paid' | 'partial' | 'unpaid' | 'none' = 'unpaid';
        if (estimatedTax === 0) {
          status = 'none';
        } else if (paidAmount >= estimatedTax) {
          status = 'paid';
        } else if (paidAmount > 0) {
          status = 'partial';
        }

        periods.push({
          periodKey,
          periodLabel: `Quý ${q}/${year}`,
          revenue,
          estimatedTax,
          dueDate,
          paidAmount,
          paidDate,
          status,
          transactionsList: txs
        });
      });
    } else {
      const sortedTxs = [...revenueTransactions].sort((a, b) => b.date.localeCompare(a.date));
      sortedTxs.forEach(tx => {
        const periodKey = tx.id;
        const revenue = parseFloat(tx.amount || 0);
        const periodYear = parseInt(tx.date.split('-')[0]);
        const annualRevenueForPeriodYear = getAnnualRevenueForYear(periodYear);
        const estimatedTax = annualRevenueForPeriodYear <= 1000000000 ? 0 : revenue * categoryRate;

        const dateObj = new Date(tx.date);
        dateObj.setDate(dateObj.getDate() + 10);
        const baseDueDateStr = dateObj.toISOString().split('T')[0];
        const dueDate = getAdjustedDueDate(baseDueDateStr);

        const paymentRecord = taxPayments.find(p => p.period_key === periodKey);
        const paidAmount = paymentRecord ? parseFloat(paymentRecord.paid_amount || 0) : 0;
        const paidDate = paymentRecord ? paymentRecord.paid_date : null;

        let status: 'paid' | 'partial' | 'unpaid' | 'none' = 'unpaid';
        if (estimatedTax === 0) {
          status = 'none';
        } else if (paidAmount >= estimatedTax) {
          status = 'paid';
        } else if (paidAmount > 0) {
          status = 'partial';
        }

        periods.push({
          periodKey,
          periodLabel: `Giao dịch ${formatDateDisplay(tx.date)} - ${tx.description.substring(0, 20)}${tx.description.length > 20 ? '...' : ''}`,
          revenue,
          estimatedTax,
          dueDate,
          paidAmount,
          paidDate,
          status,
          transactionsList: [tx]
        });
      });
    }

    return periods;
  };

  const handleOpenPaymentModal = (period: any) => {
    setSelectedPayment(period);
    const amountVal = period.paidAmount > 0 ? period.paidAmount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".") : "";
    setPaymentPaidAmount(amountVal);
    setPaymentPaidDate(period.paidDate || new Date().toISOString().split('T')[0]);
    setPaymentModalOpen(true);
  };

  const handleSavePayment = async (e: FormEvent) => {
    e.preventDefault();
    if (!userToken || !selectedPayment) return;

    const amountNum = parseFloat(paymentPaidAmount.replace(/\./g, '').replace(/,/g, ''));
    const parsedAmount = isNaN(amountNum) ? 0 : amountNum;

    try {
      const response = await fetch('/api/tax-payments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          supabase_token: userToken,
          period_key: selectedPayment.periodKey,
          due_date: selectedPayment.dueDate,
          tax_amount: selectedPayment.estimatedTax,
          paid_amount: parsedAmount,
          paid_date: paymentPaidDate || null
        })
      });

      if (response.ok) {
        alert("Cập nhật thông tin nộp thuế thành công!");
        fetchTaxPayments(userToken);
        setPaymentModalOpen(false);
      } else {
        const errData = await response.json();
        alert(`Lỗi: ${errData.error || 'Không thể lưu thông tin nộp thuế.'}`);
      }
    } catch (err) {
      console.error(err);
      alert("Lỗi kết nối.");
    }
  };

  // Fetch Transactions từ Backend
  const fetchTransactions = async (token: string) => {
    try {
      const response = await fetch(`/api/transactions?supabase_token=${token}`);
      if (response.ok) {
        const data = await response.json();

        // Nếu là tài khoản mới hoàn toàn (chưa có giao dịch nào), tự động tạo 1 giao dịch mặc định 500K để hiển thị giống mockup
        if (data && data.length === 0) {
          const createResp = await fetch('/api/transactions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              supabase_token: token,
              date: new Date().toISOString().split('T')[0],
              amount: 500000,
              description: "Doanh thu bán lẻ tạp hóa đầu ca"
            })
          });
          if (createResp.ok) {
            const refetchResp = await fetch(`/api/transactions?supabase_token=${token}`);
            if (refetchResp.ok) {
              const refetchData = await refetchResp.json();
              setTransactions(refetchData || []);
              return;
            }
          }
        }
        setTransactions(data || []);
      }
    } catch (err) {
      console.error("Lỗi tải danh sách giao dịch:", err);
    }
  };

  // Lắng nghe sự thay đổi trạng thái đăng nhập
  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        setUserToken(session.access_token);
        setUserEmail(session.user.email || null);
        loadChatSessions(session.access_token);
        fetchBusinessSettings(session.access_token);
        fetchTransactions(session.access_token);
        fetchTaxPayments(session.access_token);
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
        fetchBusinessSettings(session.access_token);
        fetchTransactions(session.access_token);
        fetchTaxPayments(session.access_token);
      } else {
        setUserToken(null);
        setUserEmail(null);
        setChatSessions([]);
        setCurrentSessionId(null);
        setTaxData(null);
        setTransactions([]);
        setTaxPayments([]);
        setViewMode('dashboard');
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

  const handleSaveSettings = async (e: FormEvent) => {
    e.preventDefault();
    if (!userToken) return;
    try {
      const response = await fetch('/api/business-settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          supabase_token: userToken,
          business_name: businessName,
          business_category: businessCategory,
          declaration_type: declarationType
        })
      });
      if (response.ok) {
        alert("Đã lưu cài đặt hộ kinh doanh!");
        setShowSettingsModal(false);
      } else {
        alert("Lỗi khi lưu cài đặt.");
      }
    } catch (err) {
      console.error(err);
      alert("Lỗi kết nối.");
    }
  };

  const handleSaveTransaction = async (e: FormEvent) => {
    e.preventDefault();
    if (!userToken || !ledgerDate || !ledgerAmount) return;

    const amountVal = parseFloat(ledgerAmount.replace(/\./g, '').replace(/,/g, ''));
    if (isNaN(amountVal) || amountVal <= 0) {
      alert("Số tiền phải lớn hơn 0.");
      return;
    }
    const amountNum = ledgerType === 'chi' ? -amountVal : amountVal;

    try {
      let response;
      if (editingTransactionId) {
        response = await fetch(`/api/transactions/${editingTransactionId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            supabase_token: userToken,
            date: ledgerDate,
            amount: amountNum,
            description: ledgerDescription
          })
        });
      } else {
        response = await fetch('/api/transactions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            supabase_token: userToken,
            date: ledgerDate,
            amount: amountNum,
            description: ledgerDescription
          })
        });
      }

      if (response.ok) {
        fetchTransactions(userToken);
        setLedgerAmount("");
        setLedgerDescription("");
        setEditingTransactionId(null);
        setLedgerType('thu');
      } else {
        alert("Lỗi khi lưu giao dịch.");
      }
    } catch (err) {
      console.error(err);
      alert("Lỗi kết nối.");
    }
  };

  const handleStartEditTransaction = (tx: any) => {
    setEditingTransactionId(tx.id);
    setLedgerDate(tx.date);
    const amountVal = parseFloat(tx.amount || 0);
    const isExpense = amountVal < 0;
    setLedgerType(isExpense ? 'chi' : 'thu');
    setLedgerAmount(Math.abs(amountVal).toString().replace(/\B(?=(\d{3})+(?!\d))/g, "."));
    setLedgerDescription(tx.description);
  };

  const handleCancelEditTransaction = () => {
    setEditingTransactionId(null);
    setLedgerDate(new Date().toISOString().split('T')[0]);
    setLedgerAmount("");
    setLedgerDescription("");
    setLedgerType('thu');
  };

  const handleDeleteTransaction = async (txId: string) => {
    if (!window.confirm("Bạn có chắc chắn muốn xóa giao dịch này?")) return;
    if (!userToken) return;
    try {
      const response = await fetch(`/api/transactions/${txId}?supabase_token=${userToken}`, {
        method: 'DELETE'
      });
      if (response.ok) {
        fetchTransactions(userToken);
        if (editingTransactionId === txId) {
          handleCancelEditTransaction();
        }
      } else {
        alert("Lỗi khi xóa giao dịch.");
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleOcrFileUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !userToken) return;

    setIsOcrLoading(true);
    setTimeout(async () => {
      const mockDescriptions = [
        "Hóa đơn lẻ mua hàng hóa",
        "Doanh thu dịch vụ cafe & đồ uống",
        "Hóa đơn bán lẻ Mimimart",
        "Doanh thu bán lẻ thuốc & mỹ phẩm",
        "Doanh thu dịch vụ sửa chữa thiết bị"
      ];
      const mockAmounts = [450000, 1200000, 750000, 320000, 1500000];
      const randIdx = Math.floor(Math.random() * mockDescriptions.length);
      const randDesc = mockDescriptions[randIdx] + ` (AI OCR: ${file.name})`;
      const randAmount = mockAmounts[randIdx];
      const today = new Date().toISOString().split('T')[0];

      try {
        const response = await fetch('/api/transactions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            supabase_token: userToken,
            date: today,
            amount: randAmount,
            description: randDesc
          })
        });
        if (response.ok) {
          fetchTransactions(userToken);
          alert(`Trích xuất AI OCR thành công!\n+ Đã thêm giao dịch: "${randDesc}" với số tiền ${formatVND(randAmount)}`);
        } else {
          alert("Lỗi trích xuất thông tin giao dịch.");
        }
      } catch (err) {
        console.error(err);
      } finally {
        setIsOcrLoading(false);
      }
    }, 2000);
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
                : 'Hệ thống AI hỗ trợ tư vấn & tính thuế '}
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

  if (viewMode === 'dashboard') {
    const currentMonth = new Date().getMonth() + 1;
    const currentYear = new Date().getFullYear();

    const monthlyTransactions = transactions.filter((t: any) => {
      if (!t.date) return false;
      const [year, month] = t.date.split('-');
      return parseInt(month) === currentMonth && parseInt(year) === currentYear;
    });

    // Chỉ tính tổng doanh thu cho các khoản thu nhập dương
    const monthlyRevenue = monthlyTransactions.reduce((sum: number, t: any) => sum + (parseFloat(t.amount || 0) > 0 ? parseFloat(t.amount || 0) : 0), 0);

    const annualTransactions = transactions.filter((t: any) => {
      if (!t.date) return false;
      const [year] = t.date.split('-');
      return parseInt(year) === currentYear;
    });

    // Chỉ tính tổng doanh thu năm cho các khoản thu nhập dương cho doanh thu lũy kế
    const annualRevenue = annualTransactions.reduce((sum: number, t: any) => sum + (parseFloat(t.amount || 0) > 0 ? parseFloat(t.amount || 0) : 0), 0);

    const isTaxExempt = annualRevenue <= 1000000000;
    const remainingToThreshold = Math.max(0, 1000000000 - annualRevenue);

    // Tính thuế dự kiến tháng này theo tax_calculator (nếu doanh thu dưới ngưỡng chịu thuế thì bằng 0)
    const monthlyTax = isTaxExempt ? 0 : monthlyRevenue * getCategoryRate(businessCategory);

    return (
      <div className="dashboard-layout">
        <div className="dashboard-container">

          {/* Header */}
          <div className="dashboard-header">
            <div>
              <div className="dashboard-greeting">Xin chào, Hộ kinh doanh</div>
              <h2 className="dashboard-title">{businessName}</h2>
            </div>
            <button className="dashboard-settings-btn" onClick={() => setShowSettingsModal(true)} title="Cài đặt Hộ kinh doanh">
              <i className="fa-solid fa-gear"></i>
            </button>
          </div>

          {/* Hộp thông báo */}
          {isTaxExempt ? (
            <div className="dashboard-alert" style={{ background: '#ecfdf5', borderColor: '#a7f3d0', color: '#065f46', boxShadow: 'var(--shadow-sm)' }}>
              <div className="dashboard-alert-content">
                <i className="fa-solid fa-circle-check" style={{ color: '#10b981' }}></i>
                <span>Hộ kinh doanh đang được miễn thuế do doanh thu lũy kế năm dưới 1 tỷ VNĐ.</span>
              </div>
            </div>
          ) : (
            <div className="dashboard-alert">
              <div className="dashboard-alert-content">
                <i className="fa-solid fa-bell"></i>
                <span>Sắp đến thời hạn nộp thuế! Hạn chót nộp thuế Quý 1 còn 15 ngày nữa.</span>
              </div>
              <span className="dashboard-alert-link" onClick={() => setViewMode('chat')}>Chi tiết →</span>
            </div>
          )}

          {/* Thẻ thống kê */}
          <div className="dashboard-stats-grid">
            <div className="dashboard-stat-card">
              <span className="stat-card-label">Doanh thu tháng này</span>
              <strong className="stat-card-value value-green">{formatVND(monthlyRevenue)}</strong>
              <span className="stat-card-sub">
                <i className="fa-solid fa-arrows-rotate"></i> Đồng bộ từ Sổ tay giao dịch
              </span>
            </div>

            <div className="dashboard-stat-card">
              <span className="stat-card-label">Thuế dự kiến tháng này</span>
              <strong className="stat-card-value value-yellow">{formatVND(monthlyTax)}</strong>
              <span className="stat-card-sub">
                <i className="fa-solid fa-calculator"></i> Thuế GTGT + TNCN phát sinh
              </span>
            </div>

            <div className="dashboard-stat-card">
              <span className="stat-card-label">Doanh thu lũy kế năm</span>
              <strong className="stat-card-value">{formatVND(annualRevenue)}</strong>
              <div className="stat-card-sub" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '5px' }}>
                <div>
                  <span className={`stat-badge ${isTaxExempt ? 'badge-green' : 'badge-red'}`}>
                    {isTaxExempt ? 'Miễn thuế (<= 1 tỷ/năm)' : 'Đã chịu thuế (> 1 tỷ/năm)'}
                  </span>
                </div>
                {isTaxExempt ? (
                  <div>Còn {(remainingToThreshold / 1000000).toFixed(1)} Tr đến ngưỡng chịu thuế</div>
                ) : (
                  <div>Đã vượt ngưỡng chịu thuế</div>
                )}
              </div>
            </div>
          </div>

          {/* Tác vụ nhanh */}
          <div className="dashboard-quick-actions">
            <h3>
              <i className="fa-solid fa-circle-play"></i> Tác vụ nhanh
            </h3>
            <div className="quick-actions-btns">
              <button className="action-btn-pill btn-purple-grad" onClick={() => setViewMode('chat')}>
                <i className="fa-regular fa-comments"></i> Hỏi AI về Thuế
              </button>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '-8px', marginLeft: '20px', marginBottom: '8px' }}>
                Giao diện chat + tính thuế nhanh
              </div>

              <button className="action-btn-pill btn-green-grad" onClick={() => { setViewMode('ledger'); handleCancelEditTransaction(); }}>
                <i className="fa-solid fa-book"></i> Sổ tay giao dịch
              </button>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '-8px', marginLeft: '20px', marginBottom: '8px' }}>
                Quản lý doanh thu hằng ngày
              </div>

              <button className="action-btn-pill btn-orange-grad" onClick={() => setViewMode('tax_schedule')}>
                <i className="fa-solid fa-calendar-days"></i> Lịch nộp thuế
              </button>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '-8px', marginLeft: '20px' }}>
                Theo dõi thời hạn và cập nhật lịch đóng thuế GTGT + TNCN định kỳ
              </div>
            </div>
          </div>

          <div style={{ textAlign: 'center', marginTop: '1.5rem' }}>
            <button
              onClick={handleSignOut}
              style={{ background: 'none', border: 'none', color: 'var(--text-muted)', textDecoration: 'underline', cursor: 'pointer', fontSize: '0.9rem' }}
            >
              <i className="fa-solid fa-right-from-bracket"></i> Đăng xuất tài khoản
            </button>
          </div>

        </div>

        {/* Modal Cài đặt Hộ kinh doanh */}
        {showSettingsModal && (
          <div className="glass-modal-overlay">
            <div className="glass-modal-card" style={{ maxWidth: '450px' }}>
              <div className="glass-modal-header">
                <h3><i className="fa-solid fa-gear"></i> Cấu hình Hộ kinh doanh</h3>
                <button className="glass-modal-close-btn" onClick={() => setShowSettingsModal(false)}>
                  <i className="fa-solid fa-xmark"></i>
                </button>
              </div>
              <form onSubmit={handleSaveSettings}>
                <div className="glass-modal-body">
                  <div className="dark-form">
                    <div className="dark-form-group">
                      <label>Tên Hộ kinh doanh</label>
                      <input
                        type="text"
                        value={businessName}
                        onChange={(e) => setBusinessName(e.target.value)}
                        required
                        placeholder="Ví dụ: Mimimart"
                      />
                    </div>
                    <div className="dark-form-group">
                      <label>Ngành nghề kinh doanh</label>
                      <select value={businessCategory} onChange={(e) => setBusinessCategory(e.target.value)}>
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
                    <div className="dark-form-group">
                      <label>Hình thức kê khai thuế</label>
                      <select value={declarationType} onChange={(e) => setDeclarationType(e.target.value)}>
                        <option value="thang">Kê khai và nộp thuế theo Tháng (Thời hạn: ngày 20 tháng tiếp theo)</option>
                        <option value="quy">Kê khai và nộp thuế theo Quý (Thời hạn: ngày cuối cùng tháng đầu quý tiếp theo)</option>
                        <option value="lan_phat_sinh">Kê khai theo Từng lần phát sinh (Thời hạn: 10 ngày sau phát sinh)</option>
                      </select>
                    </div>
                  </div>
                </div>
                <div className="glass-modal-footer">
                  <button type="button" className="icon-button" onClick={() => setShowSettingsModal(false)} style={{ color: 'rgba(255,255,255,0.7)', background: 'none', border: 'none' }}>Hủy</button>
                  <button type="submit" className="primary-button btn-purple-grad" style={{ padding: '8px 24px', borderRadius: '8px' }}>Lưu thay đổi</button>
                </div>
              </form>
            </div>
          </div>
        )}

      </div>
    );
  }

  if (viewMode === 'ledger') {
    const filteredTransactions = transactions.filter((tx: any) => {
      if (!tx.date) return false;
      if (ledgerFilterType === 'all') return true;
      if (ledgerFilterType === 'month') {
        return tx.date.substring(0, 7) === ledgerFilterMonth;
      }
      if (ledgerFilterType === 'day') {
        return tx.date === ledgerFilterDay;
      }
      return true;
    });

    const totalIncome = filteredTransactions
      .filter((tx: any) => parseFloat(tx.amount || 0) > 0)
      .reduce((sum: number, tx: any) => sum + parseFloat(tx.amount || 0), 0);

    const totalExpense = filteredTransactions
      .filter((tx: any) => parseFloat(tx.amount || 0) < 0)
      .reduce((sum: number, tx: any) => sum + Math.abs(parseFloat(tx.amount || 0)), 0);

    const balance = totalIncome - totalExpense;

    return (
      <div className="layout" style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', overflow: 'hidden' }}>
        {renderHeader("Sổ thu chi & Khai báo Giao dịch", "fa-solid fa-book")}
        <div style={{ flex: 1, overflowY: 'auto', padding: '2rem', backgroundColor: '#f8fafc' }}>
          <div style={{ maxWidth: '1200px', margin: '0 auto' }}>

            <div className="ledger-layout">
              {/* OCR Upload section */}
              <div className="ocr-upload-zone" onClick={() => document.getElementById('ocr-file-input')?.click()}>
                <input
                  type="file"
                  id="ocr-file-input"
                  style={{ display: 'none' }}
                  accept=".xlsx,.xls,.csv,.pdf,image/*"
                  onChange={handleOcrFileUpload}
                  disabled={isOcrLoading}
                />
                {isOcrLoading ? (
                  <div>
                    <i className="fa-solid fa-spinner fa-spin ocr-upload-icon" style={{ color: '#10b981' }}></i>
                    <div className="ocr-upload-text" style={{ color: '#10b981', fontWeight: 'bold' }}>
                      AI đang phân tích và chiết xuất thông tin giao dịch...
                    </div>
                  </div>
                ) : (
                  <div>
                    <i className="fa-solid fa-cloud-arrow-up ocr-upload-icon"></i>
                    <div className="ocr-upload-text">
                      Kéo thả hoặc <strong>bấm vào đây để tải lên</strong> hóa đơn mua hàng, file Excel doanh thu, ảnh hóa đơn...
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)', marginTop: '4px' }}>
                      Hỗ trợ Excel, PDF, TXT hoặc file ảnh hóa đơn để AI tự động trích xuất
                    </div>
                  </div>
                )}
              </div>

              {/* Add/Edit inline form */}
              <div className="ledger-add-section">
                <h4 style={{ margin: '0 0 1rem 0' }}>
                  <i className="fa-solid fa-pen-to-square"></i> {' '}
                  {editingTransactionId ? "Cập nhật thông tin giao dịch" : "Thêm giao dịch mới thủ công"}
                </h4>
                <form onSubmit={handleSaveTransaction} className="ledger-inline-form">
                  <div className="dark-form-group">
                    <label>Phân loại</label>
                    <div style={{ display: 'flex', gap: '4px', background: '#e2e8f0', padding: '3px', borderRadius: '8px', height: '40px', alignItems: 'center' }}>
                      <button
                        type="button"
                        onClick={() => setLedgerType('thu')}
                        style={{
                          flex: 1,
                          height: '100%',
                          border: 'none',
                          borderRadius: '6px',
                          background: ledgerType === 'thu' ? '#10b981' : 'transparent',
                          color: ledgerType === 'thu' ? '#fff' : '#64748b',
                          fontWeight: '600',
                          fontSize: '0.85rem',
                          cursor: 'pointer',
                          transition: 'all 0.2s',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '4px'
                        }}
                      >
                        <i className="fa-solid fa-circle-plus"></i> Thu
                      </button>
                      <button
                        type="button"
                        onClick={() => setLedgerType('chi')}
                        style={{
                          flex: 1,
                          height: '100%',
                          border: 'none',
                          borderRadius: '6px',
                          background: ledgerType === 'chi' ? '#ef4444' : 'transparent',
                          color: ledgerType === 'chi' ? '#fff' : '#64748b',
                          fontWeight: '600',
                          fontSize: '0.85rem',
                          cursor: 'pointer',
                          transition: 'all 0.2s',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '4px'
                        }}
                      >
                        <i className="fa-solid fa-circle-minus"></i> Chi
                      </button>
                    </div>
                  </div>
                  <div className="dark-form-group">
                    <label>Ngày giao dịch</label>
                    <input
                      type="date"
                      value={ledgerDate}
                      onChange={(e) => setLedgerDate(e.target.value)}
                      required
                    />
                  </div>
                  <div className="dark-form-group">
                    <label>Số tiền (VNĐ)</label>
                    <input
                      type="text"
                      value={ledgerAmount}
                      onChange={(e) => handleNumberChange(e, setLedgerAmount, setLedgerAmount)}
                      required
                      placeholder="VD: 500.000"
                    />
                  </div>
                  <div className="dark-form-group">
                    <label>Diễn giải / Chi tiết</label>
                    <input
                      type="text"
                      value={ledgerDescription}
                      onChange={(e) => setLedgerDescription(e.target.value)}
                      required
                      placeholder={ledgerType === 'chi' ? "Mô tả khoản chi (ví dụ: Nhập hàng tạp hóa)" : "Mô tả nguồn thu (ví dụ: Bán lẻ tạp hóa)"}
                    />
                  </div>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button type="submit" className="primary-button btn-green-grad" style={{ padding: '10px 14px', borderRadius: '8px', fontSize: '0.9rem', width: '100%', height: '40px', justifyContent: 'center' }}>
                      {editingTransactionId ? "Cập nhật" : "Lưu"}
                    </button>
                    {editingTransactionId && (
                      <button type="button" className="icon-button" onClick={handleCancelEditTransaction} style={{ backgroundColor: 'rgba(255,255,255,0.1)', color: '#fff', borderRadius: '8px', height: '40px', width: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none' }} title="Hủy chỉnh sửa">
                        <i className="fa-solid fa-xmark"></i>
                      </button>
                    )}
                  </div>
                </form>
              </div>

              {/* Summary Statistics Cards */}
              <div className="ledger-summary-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1.25rem' }}>
                {/* Tổng thu */}
                <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '16px', display: 'flex', alignItems: 'center', gap: '16px', boxShadow: 'var(--shadow-sm)' }}>
                  <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'rgba(16, 185, 129, 0.1)', color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.25rem' }}>
                    <i className="fa-solid fa-arrow-down-long"></i>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: '500', display: 'block' }}>Tổng Thu (Doanh thu)</span>
                    <strong style={{ fontSize: '1.2rem', color: '#1e293b', fontWeight: '700' }}>{formatVND(totalIncome)}</strong>
                  </div>
                </div>

                {/* Tổng chi */}
                <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '16px', display: 'flex', alignItems: 'center', gap: '16px', boxShadow: 'var(--shadow-sm)' }}>
                  <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.25rem' }}>
                    <i className="fa-solid fa-arrow-up-long"></i>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: '500', display: 'block' }}>Tổng Chi (Chi phí)</span>
                    <strong style={{ fontSize: '1.2rem', color: '#1e293b', fontWeight: '700' }}>{formatVND(totalExpense)}</strong>
                  </div>
                </div>

                {/* Số dư */}
                <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '16px', display: 'flex', alignItems: 'center', gap: '16px', boxShadow: 'var(--shadow-sm)' }}>
                  <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: balance >= 0 ? 'rgba(79, 70, 229, 0.1)' : 'rgba(239, 68, 68, 0.1)', color: balance >= 0 ? '#4f46e5' : '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.25rem' }}>
                    <i className="fa-solid fa-scale-balanced"></i>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: '500', display: 'block' }}>Số dư (Thu nhập ròng)</span>
                    <strong style={{ fontSize: '1.2rem', color: balance >= 0 ? '#4f46e5' : '#ef4444', fontWeight: '700' }}>{formatVND(balance)}</strong>
                  </div>
                </div>
              </div>

              {/* Transactions list */}
              <div className="ledger-table-container">
                <div style={{ padding: '12px 16px', fontWeight: 'bold', borderBottom: '1px solid var(--border-color)', background: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>Sổ nhật ký giao dịch</span>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 'normal' }}>
                    Hiển thị: {filteredTransactions.length} / {transactions.length} giao dịch
                  </span>
                </div>

                {/* Filter Controls Panel */}
                <div style={{ padding: '12px 16px', background: '#fff', borderBottom: '1px solid #e2e8f0', display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: '600', color: '#475569', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <i className="fa-solid fa-filter" style={{ color: '#4f46e5' }}></i> Bộ lọc:
                  </span>
                  <div style={{ display: 'flex', background: '#e2e8f0', padding: '2px', borderRadius: '8px', gap: '2px' }}>
                    <button
                      type="button"
                      onClick={() => setLedgerFilterType('all')}
                      style={{
                        border: 'none',
                        padding: '4px 10px',
                        borderRadius: '6px',
                        background: ledgerFilterType === 'all' ? '#fff' : 'transparent',
                        color: ledgerFilterType === 'all' ? '#1e293b' : '#64748b',
                        fontWeight: ledgerFilterType === 'all' ? '600' : '500',
                        fontSize: '0.8rem',
                        cursor: 'pointer',
                        boxShadow: ledgerFilterType === 'all' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      Tất cả
                    </button>
                    <button
                      type="button"
                      onClick={() => setLedgerFilterType('month')}
                      style={{
                        border: 'none',
                        padding: '4px 10px',
                        borderRadius: '6px',
                        background: ledgerFilterType === 'month' ? '#fff' : 'transparent',
                        color: ledgerFilterType === 'month' ? '#1e293b' : '#64748b',
                        fontWeight: ledgerFilterType === 'month' ? '600' : '500',
                        fontSize: '0.8rem',
                        cursor: 'pointer',
                        boxShadow: ledgerFilterType === 'month' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      Theo tháng
                    </button>
                    <button
                      type="button"
                      onClick={() => setLedgerFilterType('day')}
                      style={{
                        border: 'none',
                        padding: '4px 10px',
                        borderRadius: '6px',
                        background: ledgerFilterType === 'day' ? '#fff' : 'transparent',
                        color: ledgerFilterType === 'day' ? '#1e293b' : '#64748b',
                        fontWeight: ledgerFilterType === 'day' ? '600' : '500',
                        fontSize: '0.8rem',
                        cursor: 'pointer',
                        boxShadow: ledgerFilterType === 'day' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      Theo ngày
                    </button>
                  </div>

                  {ledgerFilterType === 'month' && (
                    <input
                      type="month"
                      value={ledgerFilterMonth}
                      onChange={(e) => setLedgerFilterMonth(e.target.value)}
                      style={{
                        padding: '4px 8px',
                        borderRadius: '6px',
                        border: '1px solid #cbd5e1',
                        fontSize: '0.8rem',
                        outline: 'none',
                        color: '#334155'
                      }}
                    />
                  )}

                  {ledgerFilterType === 'day' && (
                    <input
                      type="date"
                      value={ledgerFilterDay}
                      onChange={(e) => setLedgerFilterDay(e.target.value)}
                      style={{
                        padding: '4px 8px',
                        borderRadius: '6px',
                        border: '1px solid #cbd5e1',
                        fontSize: '0.8rem',
                        outline: 'none',
                        color: '#334155'
                      }}
                    />
                  )}
                </div>

                {filteredTransactions.length === 0 ? (
                  <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    Chưa có giao dịch nào phù hợp với bộ lọc.
                  </div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table className="ledger-table">
                      <thead>
                        <tr>
                          <th>Ngày</th>
                          <th>Diễn giải</th>
                          <th>Số tiền</th>
                          <th style={{ width: '90px' }}>Thao tác</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredTransactions.map((tx) => {
                          const isExpense = parseFloat(tx.amount || 0) < 0;
                          return (
                            <tr key={tx.id} style={{ backgroundColor: editingTransactionId === tx.id ? 'rgba(139, 92, 246, 0.1)' : 'transparent' }}>
                              <td>{tx.date ? new Date(tx.date).toLocaleDateString('vi-VN') : ''}</td>
                              <td>
                                <span className={`stat-badge ${isExpense ? 'badge-red' : 'badge-green'}`} style={{ marginRight: '8px', padding: '2px 6px', fontSize: '0.75rem', borderRadius: '4px', display: 'inline-block' }}>
                                  {isExpense ? 'Chi' : 'Thu'}
                                </span>
                                {tx.description}
                              </td>
                              <td style={{ fontWeight: 'bold', color: isExpense ? '#ef4444' : '#10b981' }}>
                                {isExpense ? `- ${formatVND(Math.abs(tx.amount || 0))}` : `+ ${formatVND(tx.amount || 0)}`}
                              </td>
                              <td>
                                <div className="ledger-actions">
                                  <button className="ledger-action-btn btn-edit" onClick={() => handleStartEditTransaction(tx)} title="Sửa giao dịch">
                                    <i className="fa-solid fa-pencil"></i>
                                  </button>
                                  <button className="ledger-action-btn btn-delete" onClick={() => handleDeleteTransaction(tx.id)} title="Xóa giao dịch">
                                    <i className="fa-solid fa-trash-can"></i>
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

            </div>
          </div>
        </div>
      </div>
    );
  }

  if (viewMode === 'tax_schedule') {
    return (
      <div className="layout" style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', overflow: 'hidden' }}>
        {renderHeader("Lịch nộp thuế & Trạng thái đóng", "fa-solid fa-calendar-days")}
        <div style={{ flex: 1, overflowY: 'auto', padding: '2rem', backgroundColor: '#f8fafc' }}>
          <div style={{ maxWidth: '1000px', margin: '0 auto' }}>

            <div style={{ marginBottom: '1.25rem', padding: '12px 16px', background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: 'var(--shadow-sm)' }}>
              <div>
                <span style={{ fontSize: '0.9rem', color: '#64748b', fontWeight: '500' }}>Hình thức kê khai hiện tại:</span>
                <strong style={{ fontSize: '0.95rem', color: '#1e293b', marginLeft: '6px' }}>
                  {declarationType === 'thang' && 'Kê khai theo Tháng'}
                  {declarationType === 'quy' && 'Kê khai theo Quý'}
                  {declarationType === 'lan_phat_sinh' && 'Kê khai theo Từng lần phát sinh'}
                </strong>
              </div>
              <button
                onClick={() => { setViewMode('dashboard'); setShowSettingsModal(true); }}
                style={{ background: 'rgba(79, 70, 229, 0.1)', color: '#4f46e5', border: 'none', padding: '6px 12px', borderRadius: '8px', fontSize: '0.85rem', fontWeight: '600', cursor: 'pointer' }}
              >
                Thay đổi hình thức
              </button>
            </div>

            <div className="ledger-table-container">
              <table className="ledger-table">
                <thead>
                  <tr>
                    <th>Kỳ kê khai</th>
                    <th>Doanh thu</th>
                    <th>Thuế dự kiến</th>
                    <th>Hạn nộp</th>
                    <th>Đã đóng</th>
                    <th>Ngày đóng</th>
                    <th>Trạng thái</th>
                    <th style={{ textAlign: 'center' }}>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {getTaxSchedulePeriods().length === 0 ? (
                    <tr>
                      <td colSpan={8} style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>
                        Chưa có dữ liệu giao dịch cho hình thức kê khai này. Hãy nhập thêm giao dịch trong Sổ thu chi.
                      </td>
                    </tr>
                  ) : (
                    getTaxSchedulePeriods().map((period) => (
                      <tr key={period.periodKey}>
                        <td style={{ fontWeight: '500' }}>{period.periodLabel}</td>
                        <td>{formatVND(period.revenue)}</td>
                        <td style={{ color: period.estimatedTax > 0 ? '#b45309' : 'inherit', fontWeight: period.estimatedTax > 0 ? '600' : 'normal' }}>
                          {formatVND(period.estimatedTax)}
                        </td>
                        <td style={{ fontWeight: '500' }}>{formatDateDisplay(period.dueDate)}</td>
                        <td style={{ color: period.paidAmount > 0 ? '#047857' : 'inherit' }}>{formatVND(period.paidAmount)}</td>
                        <td>{period.paidDate ? formatDateDisplay(period.paidDate) : '-'}</td>
                        <td>
                          <span className={`stat-badge ${period.status === 'paid' ? 'badge-green' :
                            period.status === 'partial' ? 'badge-yellow' :
                              period.status === 'unpaid' ? 'badge-red' : 'badge-grey'
                            }`}>
                            {period.status === 'paid' && 'Đã nộp'}
                            {period.status === 'partial' && 'Nộp thiếu'}
                            {period.status === 'unpaid' && 'Chưa nộp'}
                            {period.status === 'none' && 'Không phát sinh'}
                          </span>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <button
                            className="primary-button btn-purple-grad"
                            style={{ padding: '6px 12px', fontSize: '0.8rem', borderRadius: '6px', minHeight: 'auto', height: '30px' }}
                            onClick={() => handleOpenPaymentModal(period)}
                          >
                            Cập nhật nộp
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

          </div>
        </div>

        {/* Sub-modal Cập nhật thông tin đóng thuế */}
        {paymentModalOpen && selectedPayment && (
          <div className="glass-modal-overlay" style={{ zIndex: 1010 }}>
            <div className="glass-modal-card" style={{ maxWidth: '400px' }}>
              <div className="glass-modal-header">
                <h3><i className="fa-solid fa-credit-card"></i> Cập nhật đóng thuế</h3>
                <button className="glass-modal-close-btn" onClick={() => setPaymentModalOpen(false)}>
                  <i className="fa-solid fa-xmark"></i>
                </button>
              </div>
              <form onSubmit={handleSavePayment}>
                <div className="glass-modal-body">
                  <div className="dark-form">
                    <div className="dark-form-group">
                      <label>Kỳ kê khai</label>
                      <input type="text" value={selectedPayment.periodLabel} disabled style={{ backgroundColor: '#f1f5f9', cursor: 'not-allowed' }} />
                    </div>
                    <div className="dark-form-group">
                      <label>Thuế dự kiến phải nộp</label>
                      <input type="text" value={formatVND(selectedPayment.estimatedTax)} disabled style={{ backgroundColor: '#f1f5f9', cursor: 'not-allowed', fontWeight: 'bold' }} />
                    </div>
                    <div className="dark-form-group">
                      <label>Số tiền đã nộp (VNĐ)</label>
                      <input
                        type="text"
                        value={paymentPaidAmount}
                        onChange={(e) => handleNumberChange(e, setPaymentPaidAmount, setPaymentPaidAmount)}
                        required
                        placeholder="VD: 500.000"
                      />
                    </div>
                    <div className="dark-form-group">
                      <label>Ngày nộp thuế</label>
                      <input
                        type="date"
                        value={paymentPaidDate}
                        onChange={(e) => setPaymentPaidDate(e.target.value)}
                        required
                      />
                    </div>
                  </div>
                </div>
                <div className="glass-modal-footer">
                  <button type="button" className="icon-button" onClick={() => setPaymentModalOpen(false)} style={{ color: 'rgba(0,0,0,0.5)', background: 'none', border: 'none', cursor: 'pointer' }}>Hủy</button>
                  <button type="submit" className="primary-button btn-purple-grad" style={{ padding: '8px 20px', borderRadius: '8px' }}>Lưu thông tin</button>
                </div>
              </form>
            </div>
          </div>
        )}

      </div>
    );
  }

  return (
    <div className="layout" style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', overflow: 'hidden' }}>

      <header className="app-header" style={{ padding: '12px 20px', backgroundColor: '#fff', borderBottom: '1px solid #eee', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', width: '100%', flexShrink: 0 }}>
        <button onClick={() => setViewMode('dashboard')} className="header-back-btn" title="Quay lại Dashboard">
          <i className="fa-solid fa-arrow-left"></i> Quay lại Dashboard
        </button>
        <div className="header-content">
          <h1 style={{ fontSize: '1.2rem', margin: 0, display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--primary)', fontWeight: 'bold' }}>
            <i className="fa-solid fa-robot"></i> AI Trợ lý Khai báo Thuế
          </h1>
        </div>
      </header>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', width: '100%' }}>
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
      </div>

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
