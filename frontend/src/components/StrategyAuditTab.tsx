import { useState, useEffect } from 'react';
import axios from 'axios';
import { getApiBaseUrl } from '../config';
import {
  BrainCircuit,
  Sparkles,
  Award,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Send,
  Sliders,
  Calendar,
  Layers,
  Bot
} from 'lucide-react';

interface AuditRecord {
  id: number;
  created_at: string;
  timeframe_days: number;
  bot_id: string;
  symbol: string;
  total_trades: number;
  win_rate: number;
  profit_factor: number;
  total_pnl_usd: number;
  total_pnl_pips: number;
  total_wins: number;
  total_losses: number;
  provider: string;
  model: string;
  executive_summary: string;
  report_markdown: string;
  recommended_params_json: string;
  applied_status: number;
}

interface StrategyAuditTabProps {
  isGuest?: boolean;
}

export default function StrategyAuditTab({ isGuest = false }: StrategyAuditTabProps) {
  const [timeframeDays, setTimeframeDays] = useState<number>(7);
  const [selectedBot, setSelectedBot] = useState<string>('ALL');
  const [selectedSymbol, setSelectedSymbol] = useState<string>('ALL');
  const [availableBots, setAvailableBots] = useState<any[]>([]);

  // Performance summary stats state
  const [summaryData, setSummaryData] = useState<any>(null);
  const [isLoadingSummary, setIsLoadingSummary] = useState<boolean>(true);

  // Audit Generation State
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [currentAudit, setCurrentAudit] = useState<any>(null);
  const [auditHistory, setAuditHistory] = useState<AuditRecord[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState<boolean>(false);

  // Action status state
  const [isApplying, setIsApplying] = useState<boolean>(false);
  const [isSendingTelegram, setIsSendingTelegram] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const showBanner = (type: 'success' | 'error', text: string) => {
    setStatusMessage({ type, text });
    setTimeout(() => setStatusMessage(null), 6000);
  };

  // Fetch summary & history
  const fetchSummary = async () => {
    setIsLoadingSummary(true);
    try {
      const res = await axios.get(
        `${getApiBaseUrl()}/api/audit/summary?days=${timeframeDays}&bot_id=${selectedBot}&symbol=${selectedSymbol}`,
        { withCredentials: true }
      );
      setSummaryData(res.data);
      if (res.data?.configured_bots) {
        setAvailableBots(res.data.configured_bots);
      }
    } catch (err: any) {
      console.error('Failed to fetch audit summary:', err);
    } finally {
      setIsLoadingSummary(false);
    }
  };

  const fetchHistory = async () => {
    setIsLoadingHistory(true);
    try {
      const res = await axios.get(`${getApiBaseUrl()}/api/audit/history?limit=15`, { withCredentials: true });
      if (res.data?.audits) {
        setAuditHistory(res.data.audits);
        if (!currentAudit && res.data.audits.length > 0) {
          const latest = res.data.audits[0];
          let recParams = {};
          try {
            recParams = JSON.parse(latest.recommended_params_json || '{}');
          } catch (_) {}
          setCurrentAudit({
            ...latest,
            audit_id: latest.id,
            recommended_params: recParams
          });
        }
      }
    } catch (err: any) {
      console.error('Failed to fetch audit history:', err);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  useEffect(() => {
    fetchSummary();
    fetchHistory();
  }, [timeframeDays, selectedBot, selectedSymbol]);

  // Handle Trigger AI Audit Generation
  const handleGenerateAudit = async () => {
    if (isGuest) {
      showBanner('error', 'Chế độ Guest chỉ xem (View-Only). Vui lòng đăng nhập Admin để chạy đánh giá AI.');
      return;
    }
    setIsGenerating(true);
    setStatusMessage(null);
    try {
      const res = await axios.post(
        `${getApiBaseUrl()}/api/audit/generate`,
        {
          timeframe_days: timeframeDays,
          bot_id: selectedBot,
          symbol: selectedSymbol
        },
        { withCredentials: true }
      );

      if (res.data) {
        setCurrentAudit(res.data);
        showBanner('success', `Đã tạo Báo cáo Đánh giá Chiến lược AI #${res.data.audit_id} thành công!`);
        fetchHistory();
      }
    } catch (err: any) {
      const msg = err.response?.data?.detail || err.message || 'Lỗi khi khởi tạo đánh giá chiến lược AI';
      showBanner('error', typeof msg === 'string' ? msg : JSON.stringify(msg));
    } finally {
      setIsGenerating(false);
    }
  };

  // Handle Apply Parameters to Bot
  const handleApplyParameters = async (auditId: number) => {
    if (isGuest) {
      showBanner('error', 'Chế độ Guest chỉ xem. Không thể thay đổi tham số bot.');
      return;
    }
    setIsApplying(true);
    try {
      const res = await axios.post(
        `${getApiBaseUrl()}/api/audit/${auditId}/apply`,
        {},
        { withCredentials: true }
      );
      if (res.data?.status === 'success') {
        showBanner('success', `Đã cập nhật bộ tham số tối ưu vào ${res.data.applied_bots?.length || 0} bot thành công!`);
        if (currentAudit && currentAudit.audit_id === auditId) {
          setCurrentAudit({ ...currentAudit, applied_status: 1 });
        }
        fetchHistory();
      }
    } catch (err: any) {
      const msg = err.response?.data?.detail || err.message || 'Lỗi khi áp dụng tham số';
      showBanner('error', typeof msg === 'string' ? msg : JSON.stringify(msg));
    } finally {
      setIsApplying(false);
    }
  };

  // Handle Send to Telegram
  const handleSendTelegram = async (auditId: number) => {
    if (isGuest) {
      showBanner('error', 'Chế độ Guest chỉ xem.');
      return;
    }
    setIsSendingTelegram(true);
    try {
      const res = await axios.post(
        `${getApiBaseUrl()}/api/audit/${auditId}/telegram`,
        {},
        { withCredentials: true }
      );
      if (res.data?.status === 'success') {
        showBanner('success', 'Đã gửi Báo cáo Đánh giá Chiến lược lên nhóm Telegram thành công!');
      }
    } catch (err: any) {
      const msg = err.response?.data?.detail || err.message || 'Lỗi khi gửi báo cáo Telegram';
      showBanner('error', typeof msg === 'string' ? msg : JSON.stringify(msg));
    } finally {
      setIsSendingTelegram(false);
    }
  };

  const parseRecParams = (audit: any) => {
    if (audit.recommended_params) return audit.recommended_params;
    try {
      return JSON.parse(audit.recommended_params_json || '{}');
    } catch (_) {
      return {};
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', paddingBottom: '2rem' }}>
      {/* Header Title & Description */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#f8fafc', margin: '0 0 0.35rem 0', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <BrainCircuit size={24} color="#38bdf8" /> AI Quantitative Strategy Reviewer & Auto-Tuning
          </h2>
          <p style={{ fontSize: '0.85rem', color: '#94a3b8', margin: 0 }}>
            Hệ thống AI tự động phân tích nhật ký giao dịch thực tế cuối ngày / cuối tuần, mổ xẻ nguyên nhân lệnh thua, và đề xuất bộ tham số tối ưu (SL/TP, DCA, Session) cho từng bot & symbol.
          </p>
        </div>

        {/* Global Action Banner */}
        {statusMessage && (
          <div
            style={{
              padding: '0.6rem 1.2rem',
              borderRadius: '8px',
              fontSize: '0.85rem',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              background: statusMessage.type === 'success' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
              border: `1px solid ${statusMessage.type === 'success' ? '#10b981' : '#ef4444'}`,
              color: statusMessage.type === 'success' ? '#34d399' : '#f87171',
              boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
            }}
          >
            {statusMessage.type === 'success' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
            {statusMessage.text}
          </div>
        )}
      </div>

      {/* Filter Toolbar & Controls */}
      <div
        style={{
          background: 'rgba(15, 23, 42, 0.65)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '12px',
          padding: '1rem 1.25rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem',
          backdropFilter: 'blur(10px)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          {/* Timeframe selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <span style={{ fontSize: '0.78rem', color: '#94a3b8', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Calendar size={14} color="#38bdf8" /> Khung Thời Gian:
            </span>
            <select
              value={timeframeDays}
              onChange={(e) => setTimeframeDays(Number(e.target.value))}
              style={{
                background: '#090d16',
                border: '1px solid #334155',
                color: '#f8fafc',
                padding: '0.35rem 0.75rem',
                borderRadius: '6px',
                fontSize: '0.8rem',
                outline: 'none',
                cursor: 'pointer'
              }}
            >
              <option value={1}>Hôm nay (24 giờ qua)</option>
              <option value={3}>3 ngày qua</option>
              <option value={7}>Tuần qua (7 ngày)</option>
              <option value={14}>2 tuần qua (14 ngày)</option>
              <option value={30}>Tháng qua (30 ngày)</option>
            </select>
          </div>

          {/* Bot selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <span style={{ fontSize: '0.78rem', color: '#94a3b8', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Bot size={14} color="#a855f7" /> Bot:
            </span>
            <select
              value={selectedBot}
              onChange={(e) => setSelectedBot(e.target.value)}
              style={{
                background: '#090d16',
                border: '1px solid #334155',
                color: '#f8fafc',
                padding: '0.35rem 0.75rem',
                borderRadius: '6px',
                fontSize: '0.8rem',
                outline: 'none',
                cursor: 'pointer'
              }}
            >
              <option value="ALL">Toàn Bộ Bot Fleet (Tất Cả)</option>
              {availableBots.map((b) => (
                <option key={b.id} value={String(b.id)}>
                  #{b.id} - {b.name} ({b.symbol})
                </option>
              ))}
            </select>
          </div>

          {/* Symbol selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <span style={{ fontSize: '0.78rem', color: '#94a3b8', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Layers size={14} color="#f59e0b" /> Symbol:
            </span>
            <select
              value={selectedSymbol}
              onChange={(e) => setSelectedSymbol(e.target.value)}
              style={{
                background: '#090d16',
                border: '1px solid #334155',
                color: '#f8fafc',
                padding: '0.35rem 0.75rem',
                borderRadius: '6px',
                fontSize: '0.8rem',
                outline: 'none',
                cursor: 'pointer'
              }}
            >
              <option value="ALL">Tất Cả Cặp Tiền</option>
              <option value="XAUUSD">XAUUSD (Vàng)</option>
              <option value="EURUSD">EURUSD</option>
              <option value="GBPUSD">GBPUSD</option>
              <option value="USDJPY">USDJPY</option>
              <option value="USDCAD">USDCAD</option>
              <option value="EURCAD">EURCAD</option>
              <option value="EURJPY">EURJPY</option>
              <option value="US 30">US 30 (Dow Jones 30)</option>
              <option value="US 500">US 500 (S&P 500)</option>
              <option value="US TECH 100">US TECH 100 (Nasdaq 100)</option>
              <option value="JAPAN 225">JAPAN 225 (Nikkei 225)</option>
              <option value="GERMANY 40">GERMANY 40 (DAX 40)</option>
              <option value="UK 100">UK 100 (FTSE 100)</option>
              <option value="BTCUSD">BTCUSD (Bitcoin)</option>
              <option value="ETHUSD">ETHUSD (Ethereum)</option>
              <option value="BITCOIN">BITCOIN (Bitcoin - FxPro)</option>
              <option value="ETHEREUM">ETHEREUM (Ethereum - FxPro)</option>
            </select>
          </div>
        </div>

        {/* Generate AI Audit Button */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <button
            onClick={fetchSummary}
            title="Làm mới dữ liệu tổng hợp"
            style={{
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              color: '#94a3b8',
              padding: '0.45rem 0.8rem',
              borderRadius: '8px',
              fontSize: '0.8rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}
          >
            <RefreshCw size={14} className={isLoadingSummary ? 'live-pulse' : ''} /> Làm Mới
          </button>

          <button
            onClick={handleGenerateAudit}
            disabled={isGenerating || isGuest}
            style={{
              background: isGenerating
                ? 'rgba(56, 189, 248, 0.2)'
                : 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
              border: '1px solid rgba(56, 189, 248, 0.4)',
              color: '#ffffff',
              padding: '0.45rem 1.25rem',
              borderRadius: '8px',
              fontSize: '0.825rem',
              fontWeight: 700,
              cursor: isGenerating || isGuest ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              boxShadow: '0 4px 14px rgba(2, 132, 199, 0.35)',
              opacity: isGuest ? 0.5 : 1
            }}
          >
            <Sparkles size={16} className={isGenerating ? 'live-pulse' : ''} />
            {isGenerating ? 'AI Đang Phân Tích Dữ Liệu...' : 'Khởi Tạo Đánh Giá AI'}
          </button>
        </div>
      </div>

      {/* KPI Performance Matrix Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '1rem'
        }}
      >
        {/* Total Trades Card */}
        <div style={{ background: '#0b1120', border: '1px solid rgba(255, 255, 255, 0.07)', borderRadius: '10px', padding: '1rem' }}>
          <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', marginBottom: '0.35rem' }}>
            Tổng Lệnh Khớp
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#f8fafc' }}>
            {summaryData?.total_trades || 0}
          </div>
          <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '0.2rem' }}>
            Thắng: <strong style={{ color: '#34d399' }}>{summaryData?.total_wins || 0}</strong> | Thua: <strong style={{ color: '#f87171' }}>{summaryData?.total_losses || 0}</strong>
          </div>
        </div>

        {/* Win Rate Card */}
        <div style={{ background: '#0b1120', border: '1px solid rgba(255, 255, 255, 0.07)', borderRadius: '10px', padding: '1rem' }}>
          <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', marginBottom: '0.35rem' }}>
            Tỷ Lệ Thắng (Win Rate)
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, color: (summaryData?.win_rate || 0) >= 55 ? '#34d399' : (summaryData?.win_rate || 0) >= 40 ? '#fbbf24' : '#f87171' }}>
            {summaryData?.win_rate ? `${summaryData.win_rate}%` : '0.0%'}
          </div>
          <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '0.2rem' }}>
            Target tối ưu: &ge; 55.0%
          </div>
        </div>

        {/* Profit Factor Card */}
        <div style={{ background: '#0b1120', border: '1px solid rgba(255, 255, 255, 0.07)', borderRadius: '10px', padding: '1rem' }}>
          <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', marginBottom: '0.35rem' }}>
            Hệ Số Lợi Nhuận (Profit Factor)
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, color: (summaryData?.profit_factor || 0) >= 1.5 ? '#34d399' : (summaryData?.profit_factor || 0) >= 1.0 ? '#38bdf8' : '#f87171' }}>
            {summaryData?.profit_factor ? Number(summaryData.profit_factor).toFixed(2) : '1.00'}
          </div>
          <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '0.2rem' }}>
            Target bền vững: &ge; 1.50
          </div>
        </div>

        {/* Total Net PnL Card */}
        <div style={{ background: '#0b1120', border: '1px solid rgba(255, 255, 255, 0.07)', borderRadius: '10px', padding: '1rem' }}>
          <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', marginBottom: '0.35rem' }}>
            Tổng Lợi Nhuận (Net PnL)
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, color: (summaryData?.total_pnl_usd || 0) >= 0 ? '#34d399' : '#f87171' }}>
            ${summaryData?.total_pnl_usd ? Number(summaryData.total_pnl_usd).toFixed(2) : '0.00'}
          </div>
          <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '0.2rem' }}>
            Pips: <strong style={{ color: (summaryData?.total_pnl_pips || 0) >= 0 ? '#34d399' : '#f87171' }}>{summaryData?.total_pnl_pips > 0 ? `+${summaryData.total_pnl_pips}` : summaryData?.total_pnl_pips || 0} pips</strong>
          </div>
        </div>
      </div>

      {/* Main Audit Display Area */}
      {currentAudit ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem' }}>
          {/* Left Column: AI Detailed Qualitative Report */}
          <div
            style={{
              background: '#090d16',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '12px',
              padding: '1.5rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '1rem'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', paddingBottom: '0.8rem' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Award size={18} color="#38bdf8" /> Báo Cáo Phân Tích & Giải Phẫu Rủi Ro (Audit #{currentAudit.audit_id || currentAudit.id})
                </h3>
                <span style={{ fontSize: '0.72rem', color: '#64748b' }}>
                  Thời gian tạo: {currentAudit.created_at ? new Date(currentAudit.created_at).toLocaleString() : '--'} | AI: {currentAudit.provider?.toUpperCase()} ({currentAudit.model})
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <button
                  onClick={() => handleSendTelegram(currentAudit.audit_id || currentAudit.id)}
                  disabled={isSendingTelegram || isGuest}
                  style={{
                    background: 'rgba(56, 189, 248, 0.1)',
                    border: '1px solid rgba(56, 189, 248, 0.3)',
                    color: '#38bdf8',
                    padding: '0.35rem 0.75rem',
                    borderRadius: '6px',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    cursor: isGuest ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  <Send size={13} /> {isSendingTelegram ? 'Đang Gửi...' : 'Gửi Telegram'}
                </button>
              </div>
            </div>

            {/* Markdown Report Content */}
            <div
              style={{
                fontFamily: 'system-ui, -apple-system, sans-serif',
                fontSize: '0.85rem',
                lineHeight: '1.6',
                color: '#cbd5e1',
                whiteSpace: 'pre-wrap',
                maxHeight: '520px',
                overflowY: 'auto',
                paddingRight: '0.5rem'
              }}
            >
              {currentAudit.report_markdown || currentAudit.executive_summary || 'Chưa có nội dung báo cáo.'}
            </div>
          </div>

          {/* Right Column: AI Auto-Tuning Parameter Studio Card */}
          <div
            style={{
              background: '#090d16',
              border: '1px solid rgba(56, 189, 248, 0.25)',
              borderRadius: '12px',
              padding: '1.5rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '1.25rem',
              boxShadow: '0 10px 30px rgba(0,0,0,0.4)'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', paddingBottom: '0.8rem' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: '#38bdf8', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Sliders size={18} /> AI Recommended Parameters (Auto-Tuning)
                </h3>
                <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                  Bộ tham số được mô hình AI đề xuất tinh chỉnh cho chu kỳ tiếp theo
                </span>
              </div>

              {currentAudit.applied_status === 1 ? (
                <span style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.3)', padding: '0.2rem 0.6rem', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 700 }}>
                  ✓ ĐÃ ÁP DỤNG
                </span>
              ) : (
                <span style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b', border: '1px solid rgba(245, 158, 11, 0.3)', padding: '0.2rem 0.6rem', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 700 }}>
                  CHỜ ÁP DỤNG
                </span>
              )}
            </div>

            {/* Recommended Parameter Items */}
            {(() => {
              const rec = parseRecParams(currentAudit);
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0.75rem', background: 'rgba(255, 255, 255, 0.03)', borderRadius: '6px' }}>
                    <span style={{ color: '#94a3b8', fontSize: '0.8rem' }}>Stop Loss Đề Xuất (SL):</span>
                    <strong style={{ color: '#f87171', fontSize: '0.9rem' }}>{rec.recommended_sl_pips || 30} pips</strong>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0.75rem', background: 'rgba(255, 255, 255, 0.03)', borderRadius: '6px' }}>
                    <span style={{ color: '#94a3b8', fontSize: '0.8rem' }}>Take Profit Đề Xuất (TP):</span>
                    <strong style={{ color: '#34d399', fontSize: '0.9rem' }}>{rec.recommended_tp_pips || 60} pips</strong>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0.75rem', background: 'rgba(255, 255, 255, 0.03)', borderRadius: '6px' }}>
                    <span style={{ color: '#94a3b8', fontSize: '0.8rem' }}>Khoảng Cách Lưới DCA:</span>
                    <strong style={{ color: '#fbbf24', fontSize: '0.9rem' }}>{rec.recommended_dca_spacing_pips || 25} pips</strong>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0.75rem', background: 'rgba(255, 255, 255, 0.03)', borderRadius: '6px' }}>
                    <span style={{ color: '#94a3b8', fontSize: '0.8rem' }}>Ngưỡng Lọc ADX Min:</span>
                    <strong style={{ color: '#38bdf8', fontSize: '0.9rem' }}>{rec.recommended_adx_threshold || 22.0}</strong>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0.75rem', background: 'rgba(255, 255, 255, 0.03)', borderRadius: '6px' }}>
                    <span style={{ color: '#94a3b8', fontSize: '0.8rem' }}>Mức Rủi Ro Tối Đa / Lệnh:</span>
                    <strong style={{ color: '#c084fc', fontSize: '0.9rem' }}>{rec.recommended_risk_percent || 1.0}% Equity</strong>
                  </div>

                  {rec.avoid_sessions && Array.isArray(rec.avoid_sessions) && rec.avoid_sessions.length > 0 && (
                    <div style={{ padding: '0.5rem 0.75rem', background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '6px' }}>
                      <span style={{ color: '#fca5a5', fontSize: '0.78rem', fontWeight: 600 }}>Khung giờ / phiên nên hạn chế vào lệnh:</span>
                      <div style={{ color: '#cbd5e1', fontSize: '0.75rem', marginTop: '2px' }}>
                        {rec.avoid_sessions.join(', ')}
                      </div>
                    </div>
                  )}

                  {rec.summary_recommendation && (
                    <div style={{ padding: '0.65rem 0.8rem', background: 'rgba(56, 189, 248, 0.06)', border: '1px solid rgba(56, 189, 248, 0.2)', borderRadius: '6px', fontSize: '0.78rem', color: '#e2e8f0', fontStyle: 'italic' }}>
                      &ldquo;{rec.summary_recommendation}&rdquo;
                    </div>
                  )}

                  {/* 1-Click Apply Button */}
                  <button
                    onClick={() => handleApplyParameters(currentAudit.audit_id || currentAudit.id)}
                    disabled={isApplying || isGuest || currentAudit.applied_status === 1}
                    style={{
                      marginTop: '0.5rem',
                      background: currentAudit.applied_status === 1
                        ? 'rgba(255, 255, 255, 0.05)'
                        : 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                      border: 'none',
                      color: currentAudit.applied_status === 1 ? '#64748b' : '#ffffff',
                      padding: '0.65rem 1rem',
                      borderRadius: '8px',
                      fontSize: '0.85rem',
                      fontWeight: 700,
                      cursor: isApplying || isGuest || currentAudit.applied_status === 1 ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.5rem',
                      boxShadow: currentAudit.applied_status === 1 ? 'none' : '0 4px 14px rgba(16, 185, 129, 0.35)'
                    }}
                  >
                    <CheckCircle2 size={16} />
                    {isApplying ? 'Đang Cập Nhật...' : currentAudit.applied_status === 1 ? 'Đã Cập Nhật Bộ Tham Số Này' : '1-Click Áp Dụng Tham Số Vào Bot'}
                  </button>
                </div>
              );
            })()}
          </div>
        </div>
      ) : (
        <div
          style={{
            background: '#090d16',
            border: '1px dashed rgba(255, 255, 255, 0.15)',
            borderRadius: '12px',
            padding: '3.5rem 1.5rem',
            textAlign: 'center',
            color: '#64748b'
          }}
        >
          <BrainCircuit size={40} color="#38bdf8" style={{ marginBottom: '1rem', opacity: 0.6 }} />
          <h3 style={{ color: '#f8fafc', fontSize: '1.1rem', margin: '0 0 0.5rem 0' }}>
            Chưa có Báo Cáo Đánh Giá Chiến Lược AI Nào
          </h3>
          <p style={{ fontSize: '0.85rem', color: '#94a3b8', maxWidth: '500px', margin: '0 auto 1.5rem auto' }}>
            Bấm nút <strong>&ldquo;Khởi Tạo Đánh Giá AI&rdquo;</strong> ở trên để hệ thống nạp toàn bộ nhật ký giao dịch và lập luận AI gần đây nhằm tạo báo cáo phân tích rủi ro và tối ưu hóa thông số.
          </p>
        </div>
      )}

      {/* Audit History Table */}
      <div
        style={{
          background: '#090d16',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '12px',
          padding: '1.25rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.75rem'
        }}
      >
        <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <Layers size={16} color="#38bdf8" /> Lịch Sử Các Phiên Đánh Giá Chiến Lược Trước Đó
        </h3>

        {isLoadingHistory ? (
          <div style={{ color: '#64748b', textAlign: 'center', padding: '1.5rem' }}>
            Đang tải danh sách lịch sử...
          </div>
        ) : auditHistory.length === 0 ? (
          <div style={{ color: '#64748b', textAlign: 'center', padding: '1.5rem', fontSize: '0.8rem' }}>
            Chưa có lịch sử đánh giá nào được lưu.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.08)', color: '#64748b' }}>
                  <th style={{ padding: '0.6rem' }}>Audit ID</th>
                  <th style={{ padding: '0.6rem' }}>Thời Gian</th>
                  <th style={{ padding: '0.6rem' }}>Khung</th>
                  <th style={{ padding: '0.6rem' }}>Phạm Vi</th>
                  <th style={{ padding: '0.6rem' }}>Tổng Lệnh</th>
                  <th style={{ padding: '0.6rem' }}>Win Rate</th>
                  <th style={{ padding: '0.6rem' }}>Profit Factor</th>
                  <th style={{ padding: '0.6rem' }}>Tổng PnL</th>
                  <th style={{ padding: '0.6rem' }}>Trạng Thái</th>
                  <th style={{ padding: '0.6rem' }}>Thao Tác</th>
                </tr>
              </thead>
              <tbody>
                {auditHistory.map((item) => (
                  <tr
                    key={item.id}
                    style={{
                      borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
                      background: currentAudit && (currentAudit.id === item.id || currentAudit.audit_id === item.id) ? 'rgba(56, 189, 248, 0.05)' : 'transparent'
                    }}
                  >
                    <td style={{ padding: '0.6rem', fontWeight: 700, color: '#38bdf8' }}>#{item.id}</td>
                    <td style={{ padding: '0.6rem', color: '#94a3b8' }}>
                      {item.created_at ? new Date(item.created_at).toLocaleDateString() : '--'}
                    </td>
                    <td style={{ padding: '0.6rem', color: '#cbd5e1' }}>{item.timeframe_days} ngày</td>
                    <td style={{ padding: '0.6rem', color: '#cbd5e1' }}>{item.bot_id} / {item.symbol}</td>
                    <td style={{ padding: '0.6rem', color: '#f8fafc' }}>{item.total_trades}</td>
                    <td style={{ padding: '0.6rem', fontWeight: 700, color: item.win_rate >= 50 ? '#34d399' : '#f87171' }}>
                      {item.win_rate}%
                    </td>
                    <td style={{ padding: '0.6rem', color: item.profit_factor >= 1.0 ? '#38bdf8' : '#f87171' }}>
                      {Number(item.profit_factor).toFixed(2)}
                    </td>
                    <td style={{ padding: '0.6rem', fontWeight: 700, color: item.total_pnl_pips >= 0 ? '#34d399' : '#f87171' }}>
                      {item.total_pnl_pips > 0 ? `+${item.total_pnl_pips}` : item.total_pnl_pips} pips
                    </td>
                    <td style={{ padding: '0.6rem' }}>
                      {item.applied_status === 1 ? (
                        <span style={{ color: '#10b981', fontSize: '0.72rem', fontWeight: 700 }}>✓ Đã Áp Dụng</span>
                      ) : (
                        <span style={{ color: '#f59e0b', fontSize: '0.72rem', fontWeight: 700 }}>Chưa Áp Dụng</span>
                      )}
                    </td>
                    <td style={{ padding: '0.6rem' }}>
                      <button
                        onClick={() => {
                          let rec = {};
                          try {
                            rec = JSON.parse(item.recommended_params_json || '{}');
                          } catch (_) {}
                          setCurrentAudit({ ...item, audit_id: item.id, recommended_params: rec });
                        }}
                        style={{
                          background: 'rgba(255, 255, 255, 0.05)',
                          border: '1px solid rgba(255, 255, 255, 0.1)',
                          color: '#38bdf8',
                          padding: '0.2rem 0.55rem',
                          borderRadius: '4px',
                          fontSize: '0.72rem',
                          cursor: 'pointer'
                        }}
                      >
                        Xem Chi Tiết
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
