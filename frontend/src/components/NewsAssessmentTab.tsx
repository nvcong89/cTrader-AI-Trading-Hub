import { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { getApiBaseUrl } from '../config';
import {
  Flame,
  Clock,
  Send,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  ChevronRight,
  TrendingUp,
  TrendingDown,
  ShieldAlert,
  Bot,
  Zap,
  History,
  X,
  Calendar,
  Sparkles,
  SlidersHorizontal,
  Globe,
  Settings,
  Bell,
  Plus,
  Check
} from 'lucide-react';

interface NewsEventItem {
  title: string;
  country: string;
  impact: string;
  forecast?: string;
  previous?: string;
  date_utc: string;
}

interface NewsCluster {
  id: string;
  timestamp_utc: string;
  date_formatted_vn: string;
  time_formatted_vn: string;
  time_formatted_utc: string;
  day_key: string;
  currencies: string[];
  events_count: number;
  events: NewsEventItem[];
  diff_minutes: number;
  is_past: boolean;
  is_upcoming_soon: boolean;
  is_assessed: boolean;
  latest_assessment?: any;
}

interface AssessmentRecord {
  id: number;
  cluster_hash: string;
  timestamp_utc: string;
  symbol: string;
  currencies: string[];
  events: NewsEventItem[];
  volatility_level: string;
  expected_pips_range: string;
  trend_type: string;
  prob_buy: number;
  prob_sell: number;
  scenario_better: string;
  scenario_worse: string;
  bot_guidance: string;
  analysis_markdown: string;
  scenario_better_vi?: string;
  scenario_better_en?: string;
  scenario_worse_vi?: string;
  scenario_worse_en?: string;
  bot_guidance_vi?: string;
  bot_guidance_en?: string;
  analysis_markdown_vi?: string;
  analysis_markdown_en?: string;
  ai_provider?: string;
  ai_model?: string;
  latency_ms?: number;
  user_notes?: string;
  created_at: string;
}

interface NewsAssessmentTabProps {
  isGuest?: boolean;
}

const COMMON_SYMBOLS = ['XAUUSD', 'EURUSD', 'GBPUSD', 'USDJPY', 'US30', 'BTCUSD', 'AUDUSD', 'USDCAD'];
const COMMON_CURRENCIES = ['ALL', 'USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'CHF'];

export default function NewsAssessmentTab({ isGuest = false }: NewsAssessmentTabProps) {
  const [weekRange, setWeekRange] = useState<'thisweek' | 'nextweek'>('thisweek');
  const [selectedCurrency, setSelectedCurrency] = useState<string>('ALL');
  const [selectedSymbol, setSelectedSymbol] = useState<string>('XAUUSD');
  const [customSymbolInput, setCustomSymbolInput] = useState<string>('');

  const [clusters, setClusters] = useState<NewsCluster[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Active Assessment Modal State
  const [activeModalCluster, setActiveModalCluster] = useState<NewsCluster | null>(null);
  const [modalSymbol, setModalSymbol] = useState<string>('XAUUSD');
  const [userNotes, setUserNotes] = useState<string>('');
  const [isAssessing, setIsAssessing] = useState<boolean>(false);
  const [activeAssessment, setActiveAssessment] = useState<AssessmentRecord | null>(null);
  const [activeLang, setActiveLang] = useState<'vi' | 'en'>('vi');

  // History Drawer State
  const [isHistoryOpen, setIsHistoryOpen] = useState<boolean>(false);
  const [historyList, setHistoryList] = useState<AssessmentRecord[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState<boolean>(false);

  // Telegram Send State
  const [isSendingTelegram, setIsSendingTelegram] = useState<boolean>(false);

  // Auto Assessment & Telegram Broadcast Setup State
  const [isAutoModalOpen, setIsAutoModalOpen] = useState<boolean>(false);
  const [isAutoEnabled, setIsAutoEnabled] = useState<boolean>(false);
  const [advanceMinutes, setAdvanceMinutes] = useState<number>(30);
  const [autoSymbols, setAutoSymbols] = useState<string[]>(['XAUUSD']);
  const [customAutoSymbol, setCustomAutoSymbol] = useState<string>('');
  const [isSavingAutoConfig, setIsSavingAutoConfig] = useState<boolean>(false);
  const [isTestingAutoTelegram, setIsTestingAutoTelegram] = useState<boolean>(false);

  // Countdown timer clock (refreshes every second)
  const [nowTime, setNowTime] = useState<number>(Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNowTime(Date.now()), 1000);
    fetchAutoConfig();
    return () => clearInterval(timer);
  }, []);

  const showBanner = (type: 'success' | 'error', text: string) => {
    setStatusMessage({ type, text });
    setTimeout(() => setStatusMessage(null), 5000);
  };

  // Fetch Auto Broadcast Config
  const fetchAutoConfig = async () => {
    try {
      const res = await axios.get(`${getApiBaseUrl()}/api/news/auto-config`, { withCredentials: true });
      if (res.data) {
        setIsAutoEnabled(Boolean(res.data.is_enabled));
        setAdvanceMinutes(Number(res.data.advance_minutes) || 30);
        setAutoSymbols(Array.isArray(res.data.symbols) && res.data.symbols.length > 0 ? res.data.symbols : ['XAUUSD']);
      }
    } catch (err) {
      console.error('Failed to load auto news config', err);
    }
  };

  // Save Auto Broadcast Config
  const handleSaveAutoConfig = async () => {
    setIsSavingAutoConfig(true);
    try {
      const payload = {
        is_enabled: isAutoEnabled,
        advance_minutes: advanceMinutes,
        symbols: autoSymbols
      };
      const res = await axios.post(`${getApiBaseUrl()}/api/news/auto-config`, payload, { withCredentials: true });
      if (res.data && res.data.status === 'success') {
        showBanner('success', `Đã lưu cấu hình tự động: ${isAutoEnabled ? 'BẬT' : 'TẮT'} (Báo trước ${advanceMinutes} phút, ${autoSymbols.length} symbol)!`);
        setIsAutoModalOpen(false);
      }
    } catch (err: any) {
      showBanner('error', err.response?.data?.detail || 'Lỗi khi lưu cấu hình tự động.');
    } finally {
      setIsSavingAutoConfig(false);
    }
  };

  // Test Telegram Notification
  const handleTestAutoTelegram = async () => {
    setIsTestingAutoTelegram(true);
    try {
      const res = await axios.post(`${getApiBaseUrl()}/api/news/test-telegram`, {}, { withCredentials: true });
      if (res.data && res.data.status === 'success') {
        showBanner('success', 'Đã bắn tin nhắn thử nghiệm thành công về nhóm Telegram!');
      }
    } catch (err: any) {
      showBanner('error', err.response?.data?.detail || 'Không thể gửi tin nhắn thử nghiệm qua Telegram.');
    } finally {
      setIsTestingAutoTelegram(false);
    }
  };

  // Fetch News Calendar
  const fetchCalendar = async (force: boolean = false) => {
    if (force) setIsRefreshing(true);
    else setIsLoading(true);

    try {
      const activeSym = customSymbolInput.trim() ? customSymbolInput.trim().toUpperCase() : selectedSymbol;
      const res = await axios.get(`${getApiBaseUrl()}/api/news/calendar`, {
        params: {
          range: weekRange,
          currency: selectedCurrency,
          symbol: activeSym
        },
        withCredentials: true
      });
      if (res.data && res.data.clusters) {
        setClusters(res.data.clusters);
      }
    } catch (err: any) {
      showBanner('error', err.response?.data?.detail || 'Không thể tải dữ liệu lịch tin tức ForexFactory.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchCalendar();
  }, [weekRange, selectedCurrency, selectedSymbol]);

  // Fetch Assessment History
  const fetchHistory = async () => {
    setIsLoadingHistory(true);
    try {
      const res = await axios.get(`${getApiBaseUrl()}/api/news/assessments`, {
        params: { limit: 50 },
        withCredentials: true
      });
      if (res.data && res.data.assessments) {
        setHistoryList(res.data.assessments);
      }
    } catch (err: any) {
      showBanner('error', 'Không thể tải lịch sử đánh giá.');
    } finally {
      setIsLoadingHistory(false);
    }
  };

  // Trigger Assessment Modal
  const handleOpenAssessmentModal = (cluster: NewsCluster) => {
    const currentSym = customSymbolInput.trim() ? customSymbolInput.trim().toUpperCase() : selectedSymbol;
    setActiveModalCluster(cluster);
    setModalSymbol(currentSym);
    setUserNotes('');
    
    // If cluster already has assessment for this symbol, load it directly
    if (cluster.latest_assessment && cluster.latest_assessment.symbol === currentSym) {
      setActiveAssessment(cluster.latest_assessment);
    } else {
      setActiveAssessment(null);
    }
  };

  // Execute AI Assessment
  const handleRunAssessment = async () => {
    if (!activeModalCluster) return;
    setIsAssessing(true);
    try {
      const payload = {
        cluster_hash: activeModalCluster.id,
        timestamp_utc: activeModalCluster.timestamp_utc,
        symbol: modalSymbol.toUpperCase().trim(),
        currencies: activeModalCluster.currencies,
        events: activeModalCluster.events,
        date_formatted_vn: activeModalCluster.date_formatted_vn,
        time_formatted_vn: activeModalCluster.time_formatted_vn,
        time_formatted_utc: activeModalCluster.time_formatted_utc,
        user_notes: userNotes.trim()
      };

      const res = await axios.post(`${getApiBaseUrl()}/api/news/assess`, payload, { withCredentials: true });
      if (res.data && res.data.status === 'success') {
        const fullRecord: AssessmentRecord = {
          id: res.data.assessment_id,
          cluster_hash: res.data.cluster_hash,
          timestamp_utc: activeModalCluster.timestamp_utc,
          symbol: res.data.symbol,
          currencies: activeModalCluster.currencies,
          events: activeModalCluster.events,
          volatility_level: res.data.metrics.volatility_level,
          expected_pips_range: res.data.metrics.expected_pips_range,
          trend_type: res.data.metrics.trend_type,
          prob_buy: res.data.metrics.prob_buy,
          prob_sell: res.data.metrics.prob_sell,
          scenario_better: res.data.metrics.scenario_better,
          scenario_worse: res.data.metrics.scenario_worse,
          bot_guidance: res.data.metrics.bot_guidance,
          scenario_better_vi: res.data.metrics.scenario_better_vi,
          scenario_better_en: res.data.metrics.scenario_better_en,
          scenario_worse_vi: res.data.metrics.scenario_worse_vi,
          scenario_worse_en: res.data.metrics.scenario_worse_en,
          bot_guidance_vi: res.data.metrics.bot_guidance_vi,
          bot_guidance_en: res.data.metrics.bot_guidance_en,
          analysis_markdown: res.data.analysis_markdown,
          analysis_markdown_vi: res.data.analysis_markdown_vi,
          analysis_markdown_en: res.data.analysis_markdown_en,
          ai_provider: res.data.ai_provider,
          ai_model: res.data.ai_model,
          latency_ms: res.data.latency_ms,
          user_notes: userNotes,
          created_at: new Date().toISOString()
        };
        setActiveAssessment(fullRecord);
        showBanner('success', `Đã hoàn tất phân tích tin tức cho ${res.data.symbol} (${res.data.latency_ms}ms)!`);
        // Refresh calendar in background to update status tag
        fetchCalendar();
      }
    } catch (err: any) {
      showBanner('error', err.response?.data?.detail || 'Lỗi khi gọi AI Engine đánh giá tin tức.');
    } finally {
      setIsAssessing(false);
    }
  };

  // Share to Telegram
  const handleShareTelegram = async () => {
    if (!activeAssessment && !activeModalCluster) return;
    setIsSendingTelegram(true);
    try {
      const payload = activeAssessment?.id
        ? { assessment_id: activeAssessment.id }
        : { cluster_hash: activeModalCluster?.id, symbol: modalSymbol };

      const res = await axios.post(`${getApiBaseUrl()}/api/news/share-telegram`, payload, { withCredentials: true });
      if (res.data && res.data.status === 'success') {
        showBanner('success', res.data.message || 'Báo cáo đã được gửi về Telegram nhóm!');
      }
    } catch (err: any) {
      showBanner('error', err.response?.data?.detail || 'Lỗi gửi tin nhắn Telegram.');
    } finally {
      setIsSendingTelegram(false);
    }
  };

  // Calculate Next Upcoming Red News Cluster
  const nextUpcomingCluster = useMemo(() => {
    const upcoming = clusters.filter((c) => {
      const eventTime = new Date(c.timestamp_utc).getTime();
      return eventTime > nowTime;
    });
    return upcoming.length > 0 ? upcoming[0] : null;
  }, [clusters, nowTime]);

  // Format countdown string
  const formatCountdown = (targetIso: string): string => {
    const diffMs = new Date(targetIso).getTime() - nowTime;
    if (diffMs <= 0) return 'Đang diễn ra';
    const totalSeconds = Math.floor(diffMs / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${hours.toString().padStart(2, '0')}g ${minutes.toString().padStart(2, '0')}p ${seconds.toString().padStart(2, '0')}s`;
  };

  // Group clusters by Date
  const groupedClusters = useMemo(() => {
    const groups: { [dateKey: string]: { dateTitle: string; items: NewsCluster[] } } = {};
    clusters.forEach((c) => {
      const dKey = c.day_key;
      if (!groups[dKey]) {
        groups[dKey] = {
          dateTitle: c.date_formatted_vn,
          items: []
        };
      }
      groups[dKey].items.push(c);
    });
    return Object.values(groups);
  }, [clusters]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem', paddingBottom: '3rem' }}>
      {/* 1. Header & Live Status */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <h1 style={{ margin: 0, fontSize: '1.65rem', fontWeight: 800, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '0.6rem', letterSpacing: '-0.01em' }}>
              <Flame size={28} color="#ef4444" /> News Assessment & Macro Impact Studio
            </h1>
            <span style={{ background: 'rgba(239, 68, 68, 0.2)', border: '1px solid rgba(239, 68, 68, 0.45)', color: '#f87171', padding: '0.2rem 0.65rem', borderRadius: '999px', fontSize: '0.725rem', fontWeight: 800, letterSpacing: '0.05em' }}>
              RED NEWS ONLY
            </span>
            <span style={{ background: 'rgba(56, 189, 248, 0.2)', border: '1px solid rgba(56, 189, 248, 0.45)', color: '#38bdf8', padding: '0.2rem 0.65rem', borderRadius: '999px', fontSize: '0.725rem', fontWeight: 800, letterSpacing: '0.05em' }}>
              AI POWERED
            </span>
          </div>
          <p style={{ margin: '0.35rem 0 0 0', fontSize: '0.85rem', color: '#94a3b8' }}>
            Quét và phân tích các cụm tin tức kinh tế biến động mạnh (ForexFactory High-Impact), dự báo hình thái giá 1 chiều/2 chiều Whipsaw, xác suất Buy/Sell theo từng cặp symbol.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          {statusMessage && (
            <div
              style={{
                padding: '0.5rem 0.85rem',
                borderRadius: '8px',
                fontSize: '0.825rem',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                background: statusMessage.type === 'success' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                border: `1px solid ${statusMessage.type === 'success' ? '#10b981' : '#ef4444'}`,
                color: statusMessage.type === 'success' ? '#34d399' : '#f87171'
              }}
            >
              {statusMessage.type === 'success' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
              {statusMessage.text}
            </div>
          )}

          <button
            id="btn-auto-setup"
            onClick={() => setIsAutoModalOpen(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.55rem 0.95rem',
              background: isAutoEnabled ? 'rgba(16, 185, 129, 0.15)' : 'rgba(30, 41, 59, 0.8)',
              border: isAutoEnabled ? '1px solid #10b981' : '1px solid rgba(255, 255, 255, 0.12)',
              borderRadius: '8px',
              color: isAutoEnabled ? '#34d399' : '#cbd5e1',
              cursor: 'pointer',
              fontSize: '0.825rem',
              fontWeight: 700,
              boxShadow: isAutoEnabled ? '0 0 12px rgba(16, 185, 129, 0.25)' : 'none',
              transition: 'all 0.2s ease'
            }}
          >
            <Settings size={16} color={isAutoEnabled ? '#34d399' : '#94a3b8'} />
            <span>Cài Đặt Tự Động</span>
            <span
              style={{
                fontSize: '0.68rem',
                padding: '0.15rem 0.45rem',
                borderRadius: '999px',
                background: isAutoEnabled ? '#10b981' : '#475569',
                color: '#ffffff',
                fontWeight: 800
              }}
            >
              {isAutoEnabled ? `BẬT (${advanceMinutes}p)` : 'TẮT'}
            </span>
          </button>

          <button
            id="btn-news-history"
            onClick={() => {
              fetchHistory();
              setIsHistoryOpen(true);
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.45rem',
              padding: '0.55rem 0.95rem',
              background: 'rgba(30, 41, 59, 0.8)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              borderRadius: '8px',
              color: '#cbd5e1',
              cursor: 'pointer',
              fontSize: '0.825rem',
              fontWeight: 600,
              transition: 'all 0.2s ease'
            }}
          >
            <History size={16} color="#38bdf8" />
            <span>Lịch Sử Phân Tích</span>
          </button>

          <button
            id="btn-refresh-news"
            onClick={() => fetchCalendar(true)}
            disabled={isRefreshing}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.45rem',
              padding: '0.55rem 0.95rem',
              background: 'rgba(30, 41, 59, 0.8)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              borderRadius: '8px',
              color: '#cbd5e1',
              cursor: isRefreshing ? 'not-allowed' : 'pointer',
              fontSize: '0.825rem',
              fontWeight: 600
            }}
          >
            <RefreshCw size={15} className={isRefreshing ? 'animate-spin' : ''} />
            <span>{isRefreshing ? 'Đang tải...' : 'Làm mới'}</span>
          </button>
        </div>
      </div>

      {/* 2. Hero Next Event Live Countdown Card */}
      {nextUpcomingCluster && (
        <div
          style={{
            background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.12) 0%, rgba(15, 23, 42, 0.95) 100%)',
            border: '1.5px solid rgba(239, 68, 68, 0.45)',
            borderRadius: '14px',
            padding: '1.25rem 1.5rem',
            backdropFilter: 'blur(12px)',
            boxShadow: '0 8px 30px rgba(239, 68, 68, 0.15)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '1.25rem'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div
              style={{
                width: '52px',
                height: '52px',
                borderRadius: '12px',
                background: 'rgba(239, 68, 68, 0.2)',
                border: '1px solid rgba(239, 68, 68, 0.5)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#ef4444'
              }}
            >
              <Clock size={26} className="animate-pulse" />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <span style={{ color: '#f87171', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  ⚡ SỰ KIỆN TIN ĐỎ KẾ TIẾP (NEXT RED NEWS)
                </span>
                <span style={{ background: '#ef4444', color: '#ffffff', fontSize: '0.68rem', fontWeight: 800, padding: '0.1rem 0.45rem', borderRadius: '4px' }}>
                  {nextUpcomingCluster.currencies.join(', ')}
                </span>
              </div>
              <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#f8fafc', marginTop: '0.2rem' }}>
                {nextUpcomingCluster.events.map((e) => e.title).join(' • ')}
              </div>
              <div style={{ color: '#94a3b8', fontSize: '0.8rem', marginTop: '0.15rem' }}>
                {nextUpcomingCluster.date_formatted_vn} lúc <strong>{nextUpcomingCluster.time_formatted_vn}</strong> ({nextUpcomingCluster.time_formatted_utc})
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600 }}>Thời gian còn lại:</div>
              <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#fca5a5', fontFamily: 'var(--font-mono, monospace)', letterSpacing: '0.02em' }}>
                {formatCountdown(nextUpcomingCluster.timestamp_utc)}
              </div>
            </div>

            <button
              onClick={() => handleOpenAssessmentModal(nextUpcomingCluster)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.75rem 1.25rem',
                background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                border: 'none',
                borderRadius: '8px',
                color: '#ffffff',
                fontWeight: 700,
                fontSize: '0.875rem',
                cursor: 'pointer',
                boxShadow: '0 4px 14px rgba(239, 68, 68, 0.4)',
                transition: 'all 0.15s ease'
              }}
            >
              <Zap size={16} fill="#ffffff" />
              <span>Đánh Giá Cụm Tin Này</span>
            </button>
          </div>
        </div>
      )}

      {/* 3. Filter Toolbar HUD (Weeks, Currencies, Target Symbol) */}
      <div
        style={{
          background: 'rgba(15, 23, 42, 0.8)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '14px',
          padding: '1.25rem',
          backdropFilter: 'blur(12px)',
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem'
        }}
      >
        {/* Row 1: Week Selector & Currency Chips */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#94a3b8', marginRight: '0.25rem' }}>Khoảng thời gian:</span>
            <button
              onClick={() => setWeekRange('thisweek')}
              style={{
                padding: '0.4rem 0.85rem',
                borderRadius: '8px',
                fontSize: '0.8rem',
                fontWeight: 700,
                cursor: 'pointer',
                background: weekRange === 'thisweek' ? 'linear-gradient(135deg, #0284c7 0%, #06b6d4 100%)' : 'rgba(30, 41, 59, 0.7)',
                color: weekRange === 'thisweek' ? '#ffffff' : '#94a3b8',
                border: weekRange === 'thisweek' ? '1px solid #0284c7' : '1px solid rgba(255, 255, 255, 0.08)'
              }}
            >
              Tuần Này (This Week)
            </button>
            <button
              onClick={() => setWeekRange('nextweek')}
              style={{
                padding: '0.4rem 0.85rem',
                borderRadius: '8px',
                fontSize: '0.8rem',
                fontWeight: 700,
                cursor: 'pointer',
                background: weekRange === 'nextweek' ? 'linear-gradient(135deg, #0284c7 0%, #06b6d4 100%)' : 'rgba(30, 41, 59, 0.7)',
                color: weekRange === 'nextweek' ? '#ffffff' : '#94a3b8',
                border: weekRange === 'nextweek' ? '1px solid #0284c7' : '1px solid rgba(255, 255, 255, 0.08)'
              }}
            >
              Tuần Tới (Next Week)
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#94a3b8', marginRight: '0.25rem' }}>Đồng tiền:</span>
            {COMMON_CURRENCIES.map((curr) => {
              const isSelected = selectedCurrency === curr;
              return (
                <button
                  key={curr}
                  onClick={() => setSelectedCurrency(curr)}
                  style={{
                    padding: '0.35rem 0.7rem',
                    borderRadius: '6px',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    background: isSelected ? 'rgba(239, 68, 68, 0.25)' : 'rgba(30, 41, 59, 0.6)',
                    color: isSelected ? '#f87171' : '#94a3b8',
                    border: isSelected ? '1px solid rgba(239, 68, 68, 0.6)' : '1px solid rgba(255, 255, 255, 0.05)'
                  }}
                >
                  {curr}
                </button>
              );
            })}
          </div>
        </div>

        {/* Row 2: Target Symbol Selection HUD */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '1rem',
            paddingTop: '0.85rem',
            borderTop: '1px solid rgba(255, 255, 255, 0.06)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.825rem', fontWeight: 700, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <SlidersHorizontal size={15} color="#38bdf8" /> Cặp Symbol Đánh Giá:
            </span>
            {COMMON_SYMBOLS.map((sym) => {
              const activeSym = customSymbolInput.trim() ? customSymbolInput.trim().toUpperCase() : selectedSymbol;
              const isSelected = activeSym === sym;
              return (
                <button
                  key={sym}
                  onClick={() => {
                    setSelectedSymbol(sym);
                    setCustomSymbolInput('');
                  }}
                  style={{
                    padding: '0.35rem 0.75rem',
                    borderRadius: '6px',
                    fontSize: '0.78rem',
                    fontWeight: 800,
                    cursor: 'pointer',
                    background: isSelected ? 'rgba(56, 189, 248, 0.2)' : 'rgba(30, 41, 59, 0.5)',
                    color: isSelected ? '#38bdf8' : '#cbd5e1',
                    border: isSelected ? '1px solid #38bdf8' : '1px solid rgba(255, 255, 255, 0.08)'
                  }}
                >
                  {sym}
                </button>
              );
            })}

            {/* Custom Symbol Input */}
            <div style={{ display: 'flex', alignItems: 'center', background: 'rgba(30, 41, 59, 0.6)', border: '1px solid #475569', borderRadius: '6px', padding: '0.2rem 0.5rem' }}>
              <input
                type="text"
                placeholder="Symbol khác..."
                value={customSymbolInput}
                onChange={(e) => setCustomSymbolInput(e.target.value)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'white',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  width: '90px',
                  outline: 'none'
                }}
              />
            </div>
          </div>

          <div style={{ fontSize: '0.78rem', color: '#94a3b8' }}>
            Đang phân tích cụ thể cho: <strong style={{ color: '#38bdf8', fontSize: '0.85rem' }}>{customSymbolInput.trim().toUpperCase() || selectedSymbol}</strong>
          </div>
        </div>
      </div>

      {/* 4. Clustered Events List */}
      {isLoading ? (
        <div style={{ padding: '4rem 1rem', textAlign: 'center', color: '#94a3b8' }}>
          <RefreshCw size={28} className="animate-spin" style={{ margin: '0 auto 1rem', color: '#ef4444' }} />
          <div style={{ fontSize: '1rem', fontWeight: 600 }}>Đang tải lịch tin tức ForexFactory...</div>
          <p style={{ fontSize: '0.8rem', color: '#64748b' }}>Đang lọc các tin đỏ (High Impact) và gom cụm cùng thời điểm</p>
        </div>
      ) : clusters.length === 0 ? (
        <div style={{ padding: '3.5rem 1rem', textAlign: 'center', background: 'rgba(30, 41, 59, 0.4)', borderRadius: '12px', border: '1px dashed rgba(255, 255, 255, 0.1)' }}>
          <Flame size={36} color="#64748b" style={{ margin: '0 auto 0.75rem' }} />
          <div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#f1f5f9' }}>Không có tin tức đỏ (High Impact) nào trong bộ lọc này</div>
          <p style={{ color: '#94a3b8', fontSize: '0.825rem', marginTop: '0.25rem' }}>Thử chọn đồng tiền khác hoặc chuyển sang "Tuần Tới" để xem các tin tức kinh tế quan trọng.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {groupedClusters.map((group) => (
            <div key={group.dateTitle} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {/* Day Header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.25rem 0.5rem' }}>
                <Calendar size={17} color="#ef4444" />
                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#f8fafc', letterSpacing: '-0.01em' }}>
                  {group.dateTitle}
                </h3>
                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                  ({group.items.length} cụm tin đỏ)
                </span>
              </div>

              {/* Cluster Cards for this day */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: '1rem' }}>
                {group.items.map((cluster) => {
                  const isUpcoming = cluster.diff_minutes >= 0;
                  const hasAssessment = cluster.is_assessed && cluster.latest_assessment;
                  const latest = cluster.latest_assessment;

                  return (
                    <div
                      key={cluster.id}
                      style={{
                        background: 'linear-gradient(145deg, rgba(30, 41, 59, 0.7) 0%, rgba(15, 23, 42, 0.85) 100%)',
                        border: hasAssessment
                          ? '1.5px solid rgba(16, 185, 129, 0.45)'
                          : cluster.is_upcoming_soon
                          ? '1.5px solid rgba(239, 68, 68, 0.5)'
                          : '1px solid rgba(255, 255, 255, 0.08)',
                        borderRadius: '12px',
                        padding: '1.25rem',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        gap: '1rem',
                        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.25)',
                        transition: 'transform 0.15s ease, border-color 0.15s ease'
                      }}
                    >
                      {/* Top Bar of Cluster */}
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span style={{ background: 'rgba(239, 68, 68, 0.18)', border: '1px solid rgba(239, 68, 68, 0.4)', color: '#f87171', padding: '0.2rem 0.55rem', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 800 }}>
                              {cluster.time_formatted_vn}
                            </span>
                            <span style={{ fontSize: '0.72rem', color: '#64748b' }}>
                              ({cluster.time_formatted_utc})
                            </span>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            {cluster.currencies.map((curr) => (
                              <span key={curr} style={{ background: '#ef4444', color: '#ffffff', fontSize: '0.7rem', fontWeight: 800, padding: '0.15rem 0.45rem', borderRadius: '4px' }}>
                                {curr}
                              </span>
                            ))}
                            {hasAssessment ? (
                              <span style={{ background: 'rgba(16, 185, 129, 0.2)', border: '1px solid rgba(16, 185, 129, 0.4)', color: '#34d399', fontSize: '0.68rem', fontWeight: 800, padding: '0.15rem 0.45rem', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                <CheckCircle2 size={11} /> AI ĐÃ ĐÁNH GIÁ
                              </span>
                            ) : isUpcoming ? (
                              <span style={{ background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', fontSize: '0.68rem', fontWeight: 800, padding: '0.15rem 0.45rem', borderRadius: '4px' }}>
                                SẮP TỚI
                              </span>
                            ) : (
                              <span style={{ background: 'rgba(100, 116, 139, 0.2)', color: '#94a3b8', fontSize: '0.68rem', fontWeight: 700, padding: '0.15rem 0.45rem', borderRadius: '4px' }}>
                                ĐÃ QUA
                              </span>
                            )}
                          </div>
                        </div>

                        {/* List of simultaneous events */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                          {cluster.events.map((ev, idx) => (
                            <div key={idx} style={{ background: 'rgba(15, 23, 42, 0.5)', border: '1px solid rgba(255, 255, 255, 0.05)', borderRadius: '8px', padding: '0.6rem 0.75rem' }}>
                              <div style={{ fontSize: '0.875rem', fontWeight: 700, color: '#f8fafc' }}>
                                {ev.title}
                              </div>
                              <div style={{ display: 'flex', gap: '1rem', marginTop: '0.3rem', fontSize: '0.75rem', color: '#94a3b8' }}>
                                <span>Dự báo (Forecast): <strong style={{ color: '#f8fafc' }}>{ev.forecast || 'N/A'}</strong></span>
                                <span>•</span>
                                <span>Kỳ trước (Previous): <strong style={{ color: '#cbd5e1' }}>{ev.previous || 'N/A'}</strong></span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Bottom Assessment Glance / CTA */}
                      <div style={{ paddingTop: '0.75rem', borderTop: '1px solid rgba(255, 255, 255, 0.06)' }}>
                        {hasAssessment && (
                          <div style={{ marginBottom: '0.75rem', padding: '0.6rem 0.75rem', background: 'rgba(15, 23, 42, 0.7)', borderRadius: '8px', border: '1px solid rgba(16, 185, 129, 0.25)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem' }}>
                              <span style={{ color: '#94a3b8' }}>Cặp #{latest.symbol}:</span>
                              <span style={{ fontWeight: 800, color: latest.volatility_level === 'EXTREME' ? '#ef4444' : '#f59e0b' }}>
                                Biến động: {latest.volatility_level} ({latest.expected_pips_range})
                              </span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.35rem', fontSize: '0.75rem' }}>
                              <span style={{ color: '#34d399', fontWeight: 700 }}>BUY {latest.prob_buy}%</span>
                              <div style={{ flex: 1, height: '6px', background: '#334155', borderRadius: '3px', overflow: 'hidden', display: 'flex' }}>
                                <div style={{ width: `${latest.prob_buy}%`, background: '#10b981' }} />
                                <div style={{ width: `${latest.prob_sell}%`, background: '#ef4444' }} />
                              </div>
                              <span style={{ color: '#f87171', fontWeight: 700 }}>SELL {latest.prob_sell}%</span>
                            </div>
                          </div>
                        )}

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '0.725rem', color: '#64748b' }}>
                            {cluster.events.length} tin đỏ cùng thời điểm
                          </span>

                          <button
                            id={`btn-assess-${cluster.id}`}
                            onClick={() => handleOpenAssessmentModal(cluster)}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.45rem',
                              padding: '0.5rem 0.9rem',
                              background: hasAssessment
                                ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.25) 0%, rgba(5, 150, 105, 0.35) 100%)'
                                : 'linear-gradient(135deg, #0284c7 0%, #06b6d4 100%)',
                              border: hasAssessment ? '1px solid rgba(16, 185, 129, 0.5)' : 'none',
                              borderRadius: '8px',
                              color: '#ffffff',
                              fontSize: '0.8rem',
                              fontWeight: 700,
                              cursor: 'pointer',
                              transition: 'all 0.15s ease'
                            }}
                          >
                            <Zap size={14} fill="#ffffff" />
                            <span>{hasAssessment ? 'Xem Đánh Giá / Cập Nhật' : '⚡ AI Đánh Giá'}</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 5. ASSESSMENT MODAL */}
      {activeModalCluster && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.85)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
            padding: '1.5rem'
          }}
        >
          <div
            style={{
              background: '#0f172a',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              borderRadius: '16px',
              width: '100%',
              maxWidth: '900px',
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
              overflow: 'hidden'
            }}
          >
            {/* Modal Header */}
            <div
              style={{
                padding: '1.25rem 1.5rem',
                borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                background: 'rgba(30, 41, 59, 0.5)'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <Flame size={22} color="#ef4444" />
                <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: '#f8fafc' }}>
                  AI Macro & SMC Assessment
                </h2>
                <span style={{ background: '#ef4444', color: '#ffffff', fontSize: '0.7rem', fontWeight: 800, padding: '0.15rem 0.5rem', borderRadius: '4px' }}>
                  {activeModalCluster.currencies.join(', ')}
                </span>
              </div>

              <button
                onClick={() => setActiveModalCluster(null)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#94a3b8',
                  cursor: 'pointer',
                  padding: '4px'
                }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: '1.5rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1.25rem', flex: 1 }}>
              {/* Cluster Meta & Events Summary */}
              <div style={{ background: 'rgba(30, 41, 59, 0.5)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '10px', padding: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
                  <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#f8fafc' }}>
                    📅 {activeModalCluster.date_formatted_vn} lúc {activeModalCluster.time_formatted_vn} ({activeModalCluster.time_formatted_utc})
                  </div>
                  <span style={{ fontSize: '0.75rem', color: '#38bdf8', fontWeight: 600 }}>
                    {activeModalCluster.events.length} sự kiện đồng thời
                  </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  {activeModalCluster.events.map((ev, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: '#cbd5e1' }}>
                      <span>• <strong>[{ev.country}] {ev.title}</strong></span>
                      <span style={{ color: '#94a3b8' }}>Dự báo: <strong style={{ color: '#f8fafc' }}>{ev.forecast || 'N/A'}</strong> | Kỳ trước: {ev.previous || 'N/A'}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Target Symbol & User Scenario Notes */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#94a3b8', marginBottom: '0.4rem' }}>
                    Cặp Symbol Cần Đánh Giá:
                  </label>
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    {COMMON_SYMBOLS.slice(0, 5).map((s) => (
                      <button
                        key={s}
                        onClick={() => setModalSymbol(s)}
                        style={{
                          padding: '0.35rem 0.65rem',
                          borderRadius: '6px',
                          fontSize: '0.75rem',
                          fontWeight: 800,
                          cursor: 'pointer',
                          background: modalSymbol === s ? 'rgba(56, 189, 248, 0.25)' : 'rgba(30, 41, 59, 0.6)',
                          color: modalSymbol === s ? '#38bdf8' : '#cbd5e1',
                          border: modalSymbol === s ? '1px solid #38bdf8' : '1px solid rgba(255, 255, 255, 0.1)'
                        }}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#94a3b8', marginBottom: '0.4rem' }}>
                    Ghi Chú Kịch Bản (Tùy chọn):
                  </label>
                  <input
                    type="text"
                    placeholder="Ví dụ: Giả định NFP tăng vọt > 250K thì Gold test vùng nào?"
                    value={userNotes}
                    onChange={(e) => setUserNotes(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.45rem 0.75rem',
                      background: 'rgba(30, 41, 59, 0.8)',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      borderRadius: '6px',
                      color: 'white',
                      fontSize: '0.8rem',
                      outline: 'none'
                    }}
                  />
                </div>
              </div>

              {/* Action: Run AI Assessment Button */}
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <button
                  id="btn-run-ai-assessment"
                  onClick={handleRunAssessment}
                  disabled={isAssessing || isGuest}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.6rem',
                    padding: '0.75rem 2rem',
                    background: isAssessing || isGuest
                      ? 'rgba(100, 116, 139, 0.3)'
                      : 'linear-gradient(135deg, #0284c7 0%, #06b6d4 100%)',
                    border: 'none',
                    borderRadius: '10px',
                    color: '#ffffff',
                    fontWeight: 800,
                    fontSize: '0.925rem',
                    cursor: isAssessing || isGuest ? 'not-allowed' : 'pointer',
                    boxShadow: isAssessing || isGuest ? 'none' : '0 4px 18px rgba(6, 182, 212, 0.35)',
                    transition: 'all 0.2s ease'
                  }}
                >
                  {isAssessing ? (
                    <>
                      <RefreshCw size={18} className="animate-spin" />
                      <span>AI Đang Phân Tích & Tính Toán Định Lượng...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles size={18} />
                      <span>{activeAssessment ? 'Phân Tích Lại Bằng AI' : 'Bắt Đầu Đánh Giá Bằng AI'}</span>
                    </>
                  )}
                </button>
              </div>

              {/* Assessment Results Section */}
              {activeAssessment && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', marginTop: '0.5rem' }}>
                  {/* Bilingual Language Switcher Bar */}
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      background: 'rgba(15, 23, 42, 0.75)',
                      padding: '0.5rem 0.85rem',
                      borderRadius: '10px',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', color: '#94a3b8', fontWeight: 700 }}>
                      <Globe size={16} color="#38bdf8" />
                      <span>Ngôn Ngữ Báo Cáo / Display Language:</span>
                    </div>
                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                      <button
                        id="btn-lang-vi"
                        onClick={() => setActiveLang('vi')}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.4rem',
                          padding: '0.35rem 0.85rem',
                          borderRadius: '8px',
                          fontSize: '0.8rem',
                          fontWeight: 800,
                          cursor: 'pointer',
                          background: activeLang === 'vi' ? 'rgba(14, 165, 233, 0.25)' : 'rgba(30, 41, 59, 0.6)',
                          color: activeLang === 'vi' ? '#38bdf8' : '#94a3b8',
                          border: activeLang === 'vi' ? '1px solid #38bdf8' : '1px solid rgba(255, 255, 255, 0.08)',
                          boxShadow: activeLang === 'vi' ? '0 0 10px rgba(56, 189, 248, 0.2)' : 'none',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        <span>🇻🇳</span>
                        <span>Tiếng Việt</span>
                      </button>
                      <button
                        id="btn-lang-en"
                        onClick={() => setActiveLang('en')}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.4rem',
                          padding: '0.35rem 0.85rem',
                          borderRadius: '8px',
                          fontSize: '0.8rem',
                          fontWeight: 800,
                          cursor: 'pointer',
                          background: activeLang === 'en' ? 'rgba(14, 165, 233, 0.25)' : 'rgba(30, 41, 59, 0.6)',
                          color: activeLang === 'en' ? '#38bdf8' : '#94a3b8',
                          border: activeLang === 'en' ? '1px solid #38bdf8' : '1px solid rgba(255, 255, 255, 0.08)',
                          boxShadow: activeLang === 'en' ? '0 0 10px rgba(56, 189, 248, 0.2)' : 'none',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        <span>🇬🇧</span>
                        <span>English</span>
                      </button>
                    </div>
                  </div>

                  {/* Executive Quantitative HUD (4 Cards) */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.85rem' }}>
                    {/* Card 1: Volatility */}
                    <div style={{ background: 'rgba(30, 41, 59, 0.6)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '10px', padding: '1rem' }}>
                      <div style={{ color: '#94a3b8', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase' }}>
                        {activeLang === 'vi' ? 'Mức Độ Biến Động' : 'Volatility Magnitude'}
                      </div>
                      <div style={{ fontSize: '1.25rem', fontWeight: 800, color: activeAssessment.volatility_level === 'EXTREME' ? '#ef4444' : '#f59e0b', marginTop: '0.25rem' }}>
                        {activeAssessment.volatility_level}
                      </div>
                      <div style={{ fontSize: '0.78rem', color: '#cbd5e1', marginTop: '0.2rem' }}>
                        {activeLang === 'vi' ? 'Biên độ: ' : 'Expected Range: '}<strong>{activeAssessment.expected_pips_range}</strong>
                      </div>
                    </div>

                    {/* Card 2: Trend Type */}
                    <div style={{ background: 'rgba(30, 41, 59, 0.6)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '10px', padding: '1rem' }}>
                      <div style={{ color: '#94a3b8', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase' }}>
                        {activeLang === 'vi' ? 'Hình Thái Di Chuyển' : 'Movement Profile'}
                      </div>
                      <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#38bdf8', marginTop: '0.25rem' }}>
                        {activeAssessment.trend_type === '1_WAY_TREND'
                          ? (activeLang === 'vi' ? '⚡ 1 Chiều (Trend Extension)' : '⚡ 1-Way Clean Trend')
                          : activeAssessment.trend_type === 'SWEEP_THEN_TREND'
                            ? (activeLang === 'vi' ? '🎯 Sweep Xong Đảo Chiều' : '🎯 Sweep & Reversal')
                            : (activeLang === 'vi' ? '🌪️ 2 Chiều (Whipsaw / Hunt)' : '🌪️ 2-Way Volatility Hunt')}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.2rem' }}>
                        {activeAssessment.trend_type === '1_WAY_TREND'
                          ? (activeLang === 'vi' ? 'Lực mở rộng dứt khoát' : 'Aggressive directional momentum')
                          : (activeLang === 'vi' ? 'Quét râu 2 đầu trước khi chọn hướng' : 'Two-sided liquidity sweep before trend')}
                      </div>
                    </div>

                    {/* Card 3: Probability Buy vs Sell */}
                    <div style={{ background: 'rgba(30, 41, 59, 0.6)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '10px', padding: '1rem' }}>
                      <div style={{ color: '#94a3b8', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase' }}>
                        {activeLang === 'vi' ? `Xác Suất Hướng Đi #${activeAssessment.symbol}` : `Direction Bias #${activeAssessment.symbol}`}
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.25rem', fontSize: '0.875rem', fontWeight: 800 }}>
                        <span style={{ color: '#34d399' }}>BUY {activeAssessment.prob_buy}%</span>
                        <span style={{ color: '#f87171' }}>SELL {activeAssessment.prob_sell}%</span>
                      </div>
                      <div style={{ height: '8px', background: '#334155', borderRadius: '4px', overflow: 'hidden', display: 'flex', marginTop: '0.4rem' }}>
                        <div style={{ width: `${activeAssessment.prob_buy}%`, background: '#10b981' }} />
                        <div style={{ width: `${activeAssessment.prob_sell}%`, background: '#ef4444' }} />
                      </div>
                    </div>

                    {/* Card 4: AI Model & Latency */}
                    <div style={{ background: 'rgba(30, 41, 59, 0.6)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '10px', padding: '1rem' }}>
                      <div style={{ color: '#94a3b8', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase' }}>
                        {activeLang === 'vi' ? 'Động Cơ Phân Tích' : 'AI Engine Model'}
                      </div>
                      <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#c084fc', marginTop: '0.25rem' }}>
                        {activeAssessment.ai_model || 'AI Engine'}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.2rem' }}>
                        {activeLang === 'vi' ? 'Thời gian xử lý: ' : 'Processing latency: '}{activeAssessment.latency_ms || 0}ms
                      </div>
                    </div>
                  </div>

                  {/* Bifurcated Scenarios */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '0.85rem' }}>
                    <div style={{ background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: '10px', padding: '1rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', color: '#34d399', fontSize: '0.825rem', fontWeight: 800 }}>
                        <TrendingUp size={16} />
                        {activeLang === 'vi' ? 'KỊCH BẢN A: THỰC TẾ > DỰ BÁO (BETTER)' : 'SCENARIO A: ACTUAL > FORECAST (BETTER)'}
                      </div>
                      <div style={{ fontSize: '0.825rem', color: '#f8fafc', marginTop: '0.45rem', lineHeight: 1.5 }}>
                        {activeLang === 'vi'
                          ? (activeAssessment.scenario_better_vi || activeAssessment.scenario_better)
                          : (activeAssessment.scenario_better_en || activeAssessment.scenario_better)}
                      </div>
                    </div>

                    <div style={{ background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '10px', padding: '1rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', color: '#f87171', fontSize: '0.825rem', fontWeight: 800 }}>
                        <TrendingDown size={16} />
                        {activeLang === 'vi' ? 'KỊCH BẢN B: THỰC TẾ < DỰ BÁO (WORSE)' : 'SCENARIO B: ACTUAL < FORECAST (WORSE)'}
                      </div>
                      <div style={{ fontSize: '0.825rem', color: '#f8fafc', marginTop: '0.45rem', lineHeight: 1.5 }}>
                        {activeLang === 'vi'
                          ? (activeAssessment.scenario_worse_vi || activeAssessment.scenario_worse)
                          : (activeAssessment.scenario_worse_en || activeAssessment.scenario_worse)}
                      </div>
                    </div>
                  </div>

                  {/* cBot Guidance */}
                  <div style={{ background: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.3)', borderRadius: '10px', padding: '1rem', display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                    <ShieldAlert size={20} color="#fbbf24" style={{ flexShrink: 0, marginTop: '2px' }} />
                    <div>
                      <div style={{ fontSize: '0.825rem', fontWeight: 800, color: '#fbbf24' }}>
                        {activeLang === 'vi' ? 'Khuyến Nghị Quản Trị Rủi Ro Cho cBot & Trader' : 'cBot Risk Management & Execution Directives'}
                      </div>
                      <div style={{ fontSize: '0.825rem', color: '#e2e8f0', marginTop: '0.25rem', lineHeight: 1.5 }}>
                        {activeLang === 'vi'
                          ? (activeAssessment.bot_guidance_vi || activeAssessment.bot_guidance)
                          : (activeAssessment.bot_guidance_en || activeAssessment.bot_guidance)}
                      </div>
                    </div>
                  </div>

                  {/* In-depth Markdown Analysis */}
                  <div style={{ background: 'rgba(15, 23, 42, 0.8)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '10px', padding: '1.25rem' }}>
                    <div style={{ fontSize: '0.9rem', fontWeight: 800, color: '#f8fafc', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                      <Bot size={18} color="#38bdf8" />
                      {activeLang === 'vi' ? 'Báo Cáo Phân Tích Vĩ Mô & SMC Chuyên Sâu' : 'Institutional Macro & SMC Order Flow Report'}
                    </div>
                    <div
                      style={{
                        fontSize: '0.85rem',
                        color: '#cbd5e1',
                        lineHeight: 1.65,
                        whiteSpace: 'pre-wrap',
                        fontFamily: 'inherit'
                      }}
                    >
                      {activeLang === 'vi'
                        ? (activeAssessment.analysis_markdown_vi || activeAssessment.analysis_markdown)
                        : (activeAssessment.analysis_markdown_en || activeAssessment.analysis_markdown)}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer Toolbar */}
            <div
              style={{
                padding: '1rem 1.5rem',
                borderTop: '1px solid rgba(255, 255, 255, 0.1)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                background: 'rgba(30, 41, 59, 0.5)'
              }}
            >
              <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                {activeAssessment ? `ID: #${activeAssessment.id} • ${new Date(activeAssessment.created_at).toLocaleString('vi-VN')}` : 'Chưa có dữ liệu đánh giá'}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                {activeAssessment && (
                  <button
                    id="btn-share-telegram"
                    onClick={handleShareTelegram}
                    disabled={isSendingTelegram || isGuest}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.45rem',
                      padding: '0.55rem 1rem',
                      background: 'linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%)',
                      border: 'none',
                      borderRadius: '8px',
                      color: '#ffffff',
                      fontSize: '0.825rem',
                      fontWeight: 700,
                      cursor: isSendingTelegram || isGuest ? 'not-allowed' : 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <Send size={15} />
                    <span>{isSendingTelegram ? 'Đang gửi...' : 'Gửi Về Telegram Nhóm'}</span>
                  </button>
                )}

                <button
                  onClick={() => setActiveModalCluster(null)}
                  style={{
                    padding: '0.55rem 1rem',
                    background: 'rgba(100, 116, 139, 0.2)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '8px',
                    color: '#94a3b8',
                    fontSize: '0.825rem',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Đóng
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 6. ASSESSMENT HISTORY DRAWER / MODAL */}
      {isHistoryOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.85)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
            padding: '1.5rem'
          }}
        >
          <div
            style={{
              background: '#0f172a',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              borderRadius: '16px',
              width: '100%',
              maxWidth: '850px',
              maxHeight: '85vh',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden'
            }}
          >
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid rgba(255, 255, 255, 0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <History size={20} color="#38bdf8" />
                <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: '#f8fafc' }}>
                  Lịch Sử Các Bản Đánh Giá Tin Tức AI
                </h3>
              </div>
              <button onClick={() => setIsHistoryOpen(false)} style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>

            <div style={{ padding: '1.5rem', overflowY: 'auto', flex: 1 }}>
              {isLoadingHistory ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: '#94a3b8' }}>Đang tải lịch sử...</div>
              ) : historyList.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: '#94a3b8' }}>Chưa có bản ghi đánh giá nào trong hệ thống.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {historyList.map((item) => (
                    <div
                      key={item.id}
                      onClick={() => {
                        setActiveAssessment(item);
                        // Open main modal with this assessment
                        setActiveModalCluster({
                          id: item.cluster_hash,
                          timestamp_utc: item.timestamp_utc,
                          date_formatted_vn: new Date(item.timestamp_utc).toLocaleDateString('vi-VN'),
                          time_formatted_vn: new Date(item.timestamp_utc).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
                          time_formatted_utc: `${item.timestamp_utc.slice(11, 16)} UTC`,
                          day_key: item.timestamp_utc.slice(0, 10),
                          currencies: item.currencies || [],
                          events_count: (item.events || []).length,
                          events: item.events || [],
                          diff_minutes: 0,
                          is_past: true,
                          is_upcoming_soon: false,
                          is_assessed: true,
                          latest_assessment: item
                        });
                        setModalSymbol(item.symbol);
                        setIsHistoryOpen(false);
                      }}
                      style={{
                        background: 'rgba(30, 41, 59, 0.5)',
                        border: '1px solid rgba(255, 255, 255, 0.08)',
                        borderRadius: '10px',
                        padding: '1rem',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        cursor: 'pointer',
                        transition: 'background 0.15s ease'
                      }}
                    >
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span style={{ fontWeight: 800, color: '#38bdf8' }}>#{item.symbol}</span>
                          <span style={{ color: '#64748b' }}>•</span>
                          <span style={{ fontSize: '0.8rem', color: '#cbd5e1' }}>
                            {new Date(item.timestamp_utc).toLocaleString('vi-VN')}
                          </span>
                          <span style={{ fontSize: '0.7rem', padding: '0.1rem 0.4rem', borderRadius: '4px', background: item.volatility_level === 'EXTREME' ? 'rgba(239,68,68,0.2)' : 'rgba(245,158,11,0.2)', color: item.volatility_level === 'EXTREME' ? '#f87171' : '#fbbf24', fontWeight: 700 }}>
                            {item.volatility_level}
                          </span>
                        </div>
                        <div style={{ fontSize: '0.78rem', color: '#94a3b8', marginTop: '0.25rem' }}>
                          {(item.events || []).map((e: any) => e.title).join(' • ')}
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <div style={{ textAlign: 'right', fontSize: '0.78rem' }}>
                          <span style={{ color: '#34d399', fontWeight: 700 }}>BUY {item.prob_buy}%</span>
                          <span style={{ color: '#64748b' }}> / </span>
                          <span style={{ color: '#f87171', fontWeight: 700 }}>SELL {item.prob_sell}%</span>
                        </div>
                        <ChevronRight size={18} color="#64748b" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 7. AUTO ASSESSMENT & TELEGRAM BROADCAST SETUP MODAL */}
      {isAutoModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.85)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 110,
            padding: '1.5rem'
          }}
        >
          <div
            style={{
              background: '#0f172a',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              borderRadius: '16px',
              width: '100%',
              maxWidth: '620px',
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              boxShadow: '0 20px 50px rgba(0,0,0,0.5)'
            }}
          >
            {/* Modal Header */}
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid rgba(255, 255, 255, 0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <Settings size={20} color="#38bdf8" />
                <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: '#f8fafc' }}>
                  Cài Đặt Tự Động Phân Tích &amp; Bắn Telegram
                </h3>
              </div>
              <button
                onClick={() => setIsAutoModalOpen(false)}
                style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: '1.5rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {/* Section 1: Toggle Switch */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  background: isAutoEnabled ? 'rgba(16, 185, 129, 0.1)' : 'rgba(30, 41, 59, 0.6)',
                  border: isAutoEnabled ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '12px',
                  padding: '1.1rem 1.25rem',
                  transition: 'all 0.2s ease'
                }}
              >
                <div>
                  <div style={{ fontSize: '0.95rem', fontWeight: 800, color: isAutoEnabled ? '#34d399' : '#f8fafc', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Bell size={18} color={isAutoEnabled ? '#34d399' : '#94a3b8'} />
                    <span>Tự Động Đánh Giá Tin Đỏ &amp; Báo Telegram</span>
                  </div>
                  <div style={{ fontSize: '0.78rem', color: '#94a3b8', marginTop: '0.3rem', lineHeight: 1.4 }}>
                    Khi bật, hệ thống chạy ngầm liên tục và tự động gọi AI phân tích song ngữ rồi bắn thông báo về Telegram khi tin đỏ sắp ra.
                  </div>
                </div>

                {/* Switch button */}
                <button
                  id="toggle-auto-broadcast"
                  onClick={() => setIsAutoEnabled(!isAutoEnabled)}
                  style={{
                    position: 'relative',
                    width: '52px',
                    height: '28px',
                    borderRadius: '14px',
                    background: isAutoEnabled ? '#10b981' : '#334155',
                    border: 'none',
                    cursor: 'pointer',
                    transition: 'background 0.2s ease',
                    flexShrink: 0
                  }}
                >
                  <div
                    style={{
                      position: 'absolute',
                      top: '3px',
                      left: isAutoEnabled ? '27px' : '3px',
                      width: '22px',
                      height: '22px',
                      borderRadius: '50%',
                      background: '#ffffff',
                      boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
                      transition: 'left 0.2s ease'
                    }}
                  />
                </button>
              </div>

              {/* Section 2: Advance Trigger Time */}
              <div style={{ background: 'rgba(30, 41, 59, 0.5)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '12px', padding: '1.1rem 1.25rem' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 800, color: '#f8fafc', marginBottom: '0.25rem' }}>
                  ⏰ Thời Gian Báo Trước Khi Tin Ra (Phút)
                </label>
                <div style={{ fontSize: '0.78rem', color: '#94a3b8', marginBottom: '0.75rem' }}>
                  Hệ thống sẽ kích hoạt phân tích và gửi báo cáo về Telegram trước giờ công bố đúng số phút này.
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                  {[15, 30, 45, 60].map((mins) => (
                    <button
                      key={mins}
                      onClick={() => setAdvanceMinutes(mins)}
                      style={{
                        padding: '0.4rem 0.85rem',
                        borderRadius: '8px',
                        fontSize: '0.8rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        background: advanceMinutes === mins ? 'rgba(56, 189, 248, 0.25)' : 'rgba(15, 23, 42, 0.6)',
                        color: advanceMinutes === mins ? '#38bdf8' : '#cbd5e1',
                        border: advanceMinutes === mins ? '1px solid #38bdf8' : '1px solid rgba(255, 255, 255, 0.1)',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      {mins} phút
                    </button>
                  ))}

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginLeft: 'auto' }}>
                    <input
                      type="number"
                      min={5}
                      max={240}
                      value={advanceMinutes}
                      onChange={(e) => setAdvanceMinutes(Math.max(5, Math.min(240, Number(e.target.value) || 30)))}
                      style={{
                        width: '75px',
                        padding: '0.35rem 0.5rem',
                        background: 'rgba(15, 23, 42, 0.8)',
                        border: '1px solid rgba(255, 255, 255, 0.2)',
                        borderRadius: '6px',
                        color: '#f8fafc',
                        fontSize: '0.85rem',
                        fontWeight: 700,
                        textAlign: 'center',
                        outline: 'none'
                      }}
                    />
                    <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>phút</span>
                  </div>
                </div>
              </div>

              {/* Section 3: Target Symbols Selection */}
              <div style={{ background: 'rgba(30, 41, 59, 0.5)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '12px', padding: '1.1rem 1.25rem' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 800, color: '#f8fafc', marginBottom: '0.25rem' }}>
                  🎯 Danh Sách Symbol Cần Phân Tích &amp; Bắn Telegram
                </label>
                <div style={{ fontSize: '0.78rem', color: '#94a3b8', marginBottom: '0.75rem' }}>
                  Chỉ các tin đỏ có liên quan trực tiếp đến các symbol này mới được kích hoạt phân tích.
                </div>

                {/* Quick Add Buttons */}
                <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.85rem' }}>
                  {COMMON_SYMBOLS.map((s) => {
                    const isSelected = autoSymbols.includes(s);
                    return (
                      <button
                        key={s}
                        onClick={() => {
                          if (isSelected) {
                            if (autoSymbols.length > 1) {
                              setAutoSymbols(autoSymbols.filter(x => x !== s));
                            }
                          } else {
                            setAutoSymbols([...autoSymbols, s]);
                          }
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.35rem',
                          padding: '0.35rem 0.65rem',
                          borderRadius: '6px',
                          fontSize: '0.78rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                          background: isSelected ? 'rgba(56, 189, 248, 0.2)' : 'rgba(15, 23, 42, 0.6)',
                          color: isSelected ? '#38bdf8' : '#94a3b8',
                          border: isSelected ? '1px solid #38bdf8' : '1px solid rgba(255, 255, 255, 0.1)',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        {isSelected ? <Check size={13} /> : <Plus size={13} />}
                        <span>{s}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Custom Symbol Input */}
                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.85rem' }}>
                  <input
                    type="text"
                    placeholder="Nhập symbol khác (VD: AUDUSD, USDCHF...)"
                    value={customAutoSymbol}
                    onChange={(e) => setCustomAutoSymbol(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && customAutoSymbol.trim()) {
                        const sym = customAutoSymbol.trim().toUpperCase();
                        if (!autoSymbols.includes(sym)) {
                          setAutoSymbols([...autoSymbols, sym]);
                        }
                        setCustomAutoSymbol('');
                      }
                    }}
                    style={{
                      flex: 1,
                      padding: '0.45rem 0.75rem',
                      background: 'rgba(15, 23, 42, 0.8)',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      borderRadius: '6px',
                      color: 'white',
                      fontSize: '0.8rem',
                      outline: 'none'
                    }}
                  />
                  <button
                    onClick={() => {
                      if (customAutoSymbol.trim()) {
                        const sym = customAutoSymbol.trim().toUpperCase();
                        if (!autoSymbols.includes(sym)) {
                          setAutoSymbols([...autoSymbols, sym]);
                        }
                        setCustomAutoSymbol('');
                      }
                    }}
                    style={{
                      padding: '0.45rem 0.85rem',
                      background: 'rgba(56, 189, 248, 0.2)',
                      border: '1px solid #38bdf8',
                      borderRadius: '6px',
                      color: '#38bdf8',
                      fontSize: '0.8rem',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    + Thêm
                  </button>
                </div>

                {/* Active Selected Symbol Chips */}
                <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.75rem', color: '#94a3b8', marginRight: '0.25rem' }}>Đã chọn ({autoSymbols.length}):</span>
                  {autoSymbols.map((sym) => (
                    <span
                      key={sym}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.35rem',
                        padding: '0.25rem 0.55rem',
                        background: 'rgba(56, 189, 248, 0.15)',
                        border: '1px solid rgba(56, 189, 248, 0.4)',
                        borderRadius: '6px',
                        color: '#38bdf8',
                        fontSize: '0.78rem',
                        fontWeight: 800
                      }}
                    >
                      <span>#{sym}</span>
                      {autoSymbols.length > 1 && (
                        <X
                          size={13}
                          style={{ cursor: 'pointer', opacity: 0.8 }}
                          onClick={() => setAutoSymbols(autoSymbols.filter(x => x !== sym))}
                        />
                      )}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div
              style={{
                padding: '1rem 1.5rem',
                borderTop: '1px solid rgba(255, 255, 255, 0.1)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                background: 'rgba(30, 41, 59, 0.5)'
              }}
            >
              <button
                id="btn-test-auto-telegram"
                onClick={handleTestAutoTelegram}
                disabled={isTestingAutoTelegram || isGuest}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.45rem',
                  padding: '0.55rem 1rem',
                  background: 'rgba(56, 189, 248, 0.15)',
                  border: '1px solid rgba(56, 189, 248, 0.35)',
                  borderRadius: '8px',
                  color: '#38bdf8',
                  fontSize: '0.825rem',
                  fontWeight: 700,
                  cursor: isTestingAutoTelegram || isGuest ? 'not-allowed' : 'pointer'
                }}
              >
                <Send size={15} />
                <span>{isTestingAutoTelegram ? 'Đang gửi...' : 'Bắn Tin Thử Nghiệm'}</span>
              </button>

              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button
                  onClick={() => setIsAutoModalOpen(false)}
                  style={{
                    padding: '0.55rem 1rem',
                    background: 'rgba(100, 116, 139, 0.2)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '8px',
                    color: '#94a3b8',
                    fontSize: '0.825rem',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Đóng
                </button>

                <button
                  id="btn-save-auto-config"
                  onClick={handleSaveAutoConfig}
                  disabled={isSavingAutoConfig || isGuest}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.45rem',
                    padding: '0.55rem 1.25rem',
                    background: isSavingAutoConfig || isGuest ? 'rgba(100, 116, 139, 0.3)' : 'linear-gradient(135deg, #0284c7 0%, #06b6d4 100%)',
                    border: 'none',
                    borderRadius: '8px',
                    color: '#ffffff',
                    fontSize: '0.825rem',
                    fontWeight: 800,
                    cursor: isSavingAutoConfig || isGuest ? 'not-allowed' : 'pointer',
                    boxShadow: isSavingAutoConfig || isGuest ? 'none' : '0 4px 14px rgba(6, 182, 212, 0.3)'
                  }}
                >
                  {isSavingAutoConfig ? <RefreshCw size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
                  <span>{isSavingAutoConfig ? 'Đang lưu...' : 'Lưu Cài Đặt'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
