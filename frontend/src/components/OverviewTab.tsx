import { useState, useEffect } from 'react';
import axios from 'axios';
import { Line } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend } from 'chart.js';
import { getApiBaseUrl } from '../config';
import {
  Trophy,
  Crown,
  TrendingUp,
  Zap,
  Bot,
  RefreshCw,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Layers,
  ArrowUpRight,
  ArrowDownRight,
  Cpu,
  ShieldCheck
} from 'lucide-react';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

interface OverviewProps {
  data: any;
  isGuest?: boolean;
  onNavigateTab?: (tab: any) => void;
}

interface BotRankingItem {
  rank: number;
  bot_id: number;
  bot_name: string;
  symbol: string;
  timeframe: string;
  status: string;
  account_id: string;
  account_type?: string;
  total_trades: number;
  total_wins: number;
  total_losses: number;
  total_breakevens: number;
  win_rate: number;
  profit_factor: number;
  closed_pnl_usd: number;
  floating_pnl_usd: number;
  total_pnl_usd: number;
  total_pnl_pips: number;
  open_positions_count: number;
  composite_score: number;
  tier_badge: string;
  tier_label: string;
  tier_color: string;
}

interface LeaderboardData {
  calculated_at: string;
  created_at?: string;
  next_update_at?: string;
  total_bots: number;
  running_bots_count: number;
  fleet_total_trades: number;
  fleet_win_rate: number;
  fleet_total_pnl_usd: number;
  top_performer?: BotRankingItem;
  rankings: BotRankingItem[];
}

// Currency format helper with commas & sign
const formatCurrency = (val: number | string | undefined, forceSign: boolean = false): string => {
  const num = Number(val || 0);
  const formatted = Math.abs(num).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (forceSign) {
    return num > 0 ? `+$${formatted}` : num < 0 ? `-$${formatted}` : `$${formatted}`;
  }
  return num < 0 ? `-$${formatted}` : `$${formatted}`;
};

export default function OverviewTab({ data, isGuest = false, onNavigateTab }: OverviewProps) {
  const [activeFleetTab, setActiveFleetTab] = useState<'live' | 'demo'>(() => {
    return (localStorage.getItem('ctrader_overview_fleet_tab') as 'live' | 'demo') || 'live';
  });

  const [leaderboard, setLeaderboard] = useState<LeaderboardData | null>(null);
  const [isLoadingLeaderboard, setIsLoadingLeaderboard] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [countdownText, setCountdownText] = useState<string>('--:--:--');
  const [refreshMessage, setRefreshMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [chartMetric, setChartMetric] = useState<'daily' | 'cumulative'>('daily');
  const [rankingFilter, setRankingFilter] = useState<'all' | 'running' | 'profitable'>('all');

  // Handle fleet subtab change with localStorage sync
  const handleFleetTabChange = (tab: 'live' | 'demo') => {
    setActiveFleetTab(tab);
    localStorage.setItem('ctrader_overview_fleet_tab', tab);
  };

  // Fetch Leaderboard
  const fetchLeaderboard = async (force: boolean = false) => {
    if (force) {
      setIsRefreshing(true);
    } else {
      setIsLoadingLeaderboard(true);
    }
    try {
      const res = force
        ? await axios.post(`${getApiBaseUrl()}/api/leaderboard/refresh`, {}, { withCredentials: true })
        : await axios.get(`${getApiBaseUrl()}/api/leaderboard`, { withCredentials: true });

      if (res.data) {
        setLeaderboard(res.data);
        if (force) {
          setRefreshMessage({ type: 'success', text: 'Đã tính toán lại Bảng xếp hạng thành công!' });
          setTimeout(() => setRefreshMessage(null), 4000);
        }
      }
    } catch (err: any) {
      console.error('Failed to fetch leaderboard:', err);
      if (force) {
        const msg = err.response?.data?.detail || 'Lỗi khi cập nhật bảng xếp hạng';
        setRefreshMessage({ type: 'error', text: typeof msg === 'string' ? msg : 'Lỗi khi cập nhật bảng xếp hạng' });
        setTimeout(() => setRefreshMessage(null), 4000);
      }
    } finally {
      setIsLoadingLeaderboard(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchLeaderboard(false);
  }, []);

  // 12-Hour Next Update Countdown Timer
  useEffect(() => {
    if (!leaderboard?.next_update_at) return;

    const interval = setInterval(() => {
      const targetTime = new Date(leaderboard.next_update_at!).getTime();
      const now = new Date().getTime();
      const diff = targetTime - now;

      if (diff <= 0) {
        setCountdownText('Đang cập nhật phiên mới...');
        fetchLeaderboard(false);
      } else {
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);
        setCountdownText(
          `${String(hours).padStart(2, '0')}h ${String(minutes).padStart(2, '0')}m ${String(seconds).padStart(2, '0')}s`
        );
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [leaderboard?.next_update_at]);

  // Extended Modern High-Contrast Palette
  const COLOR_PALETTE = [
    { border: '#38bdf8', bg: 'rgba(56, 189, 248, 0.15)' }, // Sky Blue
    { border: '#10b981', bg: 'rgba(16, 185, 129, 0.15)' }, // Emerald
    { border: '#a855f7', bg: 'rgba(168, 85, 247, 0.15)' }, // Purple
    { border: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)' }, // Amber Gold
    { border: '#ec4899', bg: 'rgba(236, 72, 153, 0.15)' }, // Rose Pink
    { border: '#06b6d4', bg: 'rgba(6, 182, 212, 0.15)' },  // Teal
    { border: '#6366f1', bg: 'rgba(99, 102, 241, 0.15)' }, // Indigo
    { border: '#84cc16', bg: 'rgba(132, 204, 22, 0.15)' }, // Lime
    { border: '#f97316', bg: 'rgba(249, 115, 22, 0.15)' }, // Orange
    { border: '#14b8a6', bg: 'rgba(20, 184, 166, 0.15)' }, // Cyan
    { border: '#e11d48', bg: 'rgba(225, 29, 72, 0.15)' },  // Ruby
    { border: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.15)' }, // Violet
    { border: '#eab308', bg: 'rgba(234, 179, 8, 0.15)' },  // Yellow
    { border: '#0ea5e9', bg: 'rgba(14, 165, 233, 0.15)' }  // Ocean
  ];

  // Helper Mappings & Filter Functions
  const accountTypeMap: { [key: string]: boolean } = {};
  (data?.accounts || []).forEach((acc: any) => {
    const isLive = (acc.account_type || '').toLowerCase() === 'live';
    accountTypeMap[String(acc.account_id)] = isLive;
  });

  const isLiveAccount = (acc: any): boolean => (acc?.account_type || '').toLowerCase() === 'live';

  const isLiveBot = (bot: any): boolean => {
    if (bot.account_type) return (bot.account_type || '').toLowerCase() === 'live';
    if (bot.account_id && accountTypeMap[String(bot.account_id)] !== undefined) {
      return accountTypeMap[String(bot.account_id)];
    }
    return false;
  };

  const isLivePosition = (pos: any): boolean => {
    if (pos.account_type) return (pos.account_type || '').toLowerCase() === 'live';
    if (pos.account_id && accountTypeMap[String(pos.account_id)] !== undefined) {
      return accountTypeMap[String(pos.account_id)];
    }
    return false;
  };

  const isLiveHistory = (h: any): boolean => {
    if (h.account_type) return (h.account_type || '').toLowerCase() === 'live';
    if (h.account_id && accountTypeMap[String(h.account_id)] !== undefined) {
      return accountTypeMap[String(h.account_id)];
    }
    return false;
  };

  const isToday = (ts: string) => {
    if (!ts) return false;
    const todayUtc = new Date().toISOString().slice(0, 10);
    const todayLocal = new Date().toLocaleDateString('en-CA');
    return ts.startsWith(todayUtc) || ts.startsWith(todayLocal);
  };

  // Segregated fleet stats for switcher headers
  const liveBots = (data?.bots || []).filter(isLiveBot);
  const demoBots = (data?.bots || []).filter((b: any) => !isLiveBot(b));
  const runningLiveBots = liveBots.filter((b: any) => b.status === 'RUNNING');
  const runningDemoBots = demoBots.filter((b: any) => b.status === 'RUNNING');

  const liveAccounts = (data?.accounts || []).filter(isLiveAccount);
  const demoAccounts = (data?.accounts || []).filter((a: any) => !isLiveAccount(a));

  const totalLiveEquity = liveAccounts.reduce((acc: number, a: any) => acc + (Number(a.equity) || 0), 0);
  const totalDemoEquity = demoAccounts.reduce((acc: number, a: any) => acc + (Number(a.equity) || 0), 0);

  // Active Fleet Calculations
  const isCurrentFleetLive = activeFleetTab === 'live';
  const currentFleetAccounts = isCurrentFleetLive ? liveAccounts : demoAccounts;
  const currentFleetBots = isCurrentFleetLive ? liveBots : demoBots;
  const currentFleetRunningBots = isCurrentFleetLive ? runningLiveBots : runningDemoBots;

  const currentFleetPositions = (data?.positions || []).filter((p: any) =>
    isCurrentFleetLive ? isLivePosition(p) : !isLivePosition(p)
  );
  const currentFleetFloatingPnl = currentFleetPositions.reduce((acc: number, p: any) => acc + (Number(p.pnl) || 0), 0);

  const currentFleetBalance = currentFleetAccounts.reduce((acc: number, a: any) => acc + (Number(a.balance) || 0), 0);
  const currentFleetEquity = currentFleetAccounts.reduce((acc: number, a: any) => acc + (Number(a.equity) || 0), 0);

  // Today's PnL for active fleet
  let currentFleetTodayPnl = 0;
  let hasTodayPnlFromAccounts = false;
  if (data?.pnl_by_account?.dates && data.pnl_by_account.dates.length > 0) {
    const lastDate = data.pnl_by_account.dates[data.pnl_by_account.dates.length - 1];
    if (isToday(lastDate)) {
      currentFleetAccounts.forEach((acc: any) => {
        const accId = String(acc.account_id);
        const dailyVals = data.pnl_by_account.accounts_daily?.[accId];
        if (dailyVals && dailyVals.length > 0) {
          currentFleetTodayPnl += Number(dailyVals[dailyVals.length - 1]) || 0;
          hasTodayPnlFromAccounts = true;
        }
      });
    }
  }

  // Trades today for active fleet
  const currentFleetTodayTrades = (data?.history || []).filter((h: any) => {
    const matchFleet = isCurrentFleetLive ? isLiveHistory(h) : !isLiveHistory(h);
    return matchFleet && isToday(h.timestamp);
  });
  if (!hasTodayPnlFromAccounts && currentFleetTodayTrades.length > 0) {
    currentFleetTodayPnl = currentFleetTodayTrades.reduce((acc: number, h: any) => acc + (Number(h.pnl) || 0), 0);
  }

  // Segregated Leaderboard Rankings (re-index rank relative to this fleet)
  const allRankings: BotRankingItem[] = leaderboard?.rankings || [];
  const fleetRankings: BotRankingItem[] = allRankings
    .filter((b) => (isCurrentFleetLive ? isLiveBot(b) : !isLiveBot(b)))
    .map((b, idx) => ({
      ...b,
      rank: idx + 1
    }));

  const fleetTotalTrades = fleetRankings.reduce((sum, b) => sum + (b.total_trades || 0), 0);
  const fleetTotalWins = fleetRankings.reduce((sum, b) => sum + (b.total_wins || 0), 0);
  const fleetWinRate = fleetTotalTrades > 0 ? Number(((fleetTotalWins / fleetTotalTrades) * 100).toFixed(1)) : 0;

  const displayRankings = fleetRankings.filter((bot) => {
    if (rankingFilter === 'running') return bot.status === 'RUNNING';
    if (rankingFilter === 'profitable') return bot.total_pnl_usd > 0;
    return true;
  });

  const vpsCpu = data?.vps_cpu_percent !== undefined ? data.vps_cpu_percent : null;
  const vpsRam = data?.vps_ram_percent !== undefined ? data.vps_ram_percent : null;

  // Construct Multi-Account Datasets (Segregated by active fleet)
  const buildChartData = () => {
    if (data?.pnl_by_account?.dates) {
      const dates = data.pnl_by_account.dates;
      const isDaily = chartMetric === 'daily';

      // 1. Filter unique accounts for active fleet
      const allUniqueAccounts = data.pnl_by_account.unique_accounts || [];
      const fleetUniqueAccounts = allUniqueAccounts.filter((accId: string) => {
        const isLive = accountTypeMap[String(accId)] ?? false;
        return isCurrentFleetLive ? isLive : !isLive;
      });

      // 2. Compute Fleet Aggregate Series for each date
      const fleetDailyTotals = dates.map((_: any, dIdx: number) => {
        return fleetUniqueAccounts.reduce((sum: number, accId: string) => {
          const val = data.pnl_by_account.accounts_daily?.[accId]?.[dIdx] || 0;
          return sum + Number(val);
        }, 0);
      });

      let cum = 0;
      const fleetCumulativeTotals = fleetDailyTotals.map((dailyVal: number) => {
        cum = Number((cum + dailyVal).toFixed(2));
        return cum;
      });

      const fleetLabel = isCurrentFleetLive ? 'LIVE FLEET' : 'DEMO FLEET';
      const fleetColor = isCurrentFleetLive ? '#fbbf24' : '#38bdf8';
      const fleetBgColor = isCurrentFleetLive ? 'rgba(245, 158, 11, 0.18)' : 'rgba(56, 189, 248, 0.15)';

      const datasets: any[] = [
        // Fleet summary line
        {
          label: isDaily ? `⭐ Tổng ${fleetLabel} (Daily PnL)` : `⭐ Tổng ${fleetLabel} (Cumulative Growth)`,
          data: isDaily ? fleetDailyTotals : fleetCumulativeTotals,
          borderColor: fleetColor,
          backgroundColor: fleetBgColor,
          borderWidth: 3,
          pointRadius: 4,
          pointHoverRadius: 6,
          tension: 0.3
        }
      ];

      // Individual Account Series (Only for accounts present in fleetUniqueAccounts)
      fleetUniqueAccounts.forEach((accId: string, idx: number) => {
        const color = COLOR_PALETTE[idx % COLOR_PALETTE.length];
        const label = data.pnl_by_account.account_labels?.[accId] || `Account #${accId}`;
        const seriesData = isDaily
          ? data.pnl_by_account.accounts_daily?.[accId] || []
          : data.pnl_by_account.accounts_cumulative?.[accId] || [];

        datasets.push({
          label: label,
          data: seriesData,
          borderColor: color.border,
          backgroundColor: color.bg,
          borderWidth: 2,
          pointRadius: 3,
          pointHoverRadius: 5,
          tension: 0.3
        });
      });

      return { labels: dates, datasets };
    }

    // Fallback to legacy single series
    return {
      labels: data?.pnl_history ? data.pnl_history.map((h: any) => h.date) : [],
      datasets: [
        {
          label: isCurrentFleetLive ? 'Live Daily P&L' : 'Demo Daily P&L',
          data: data?.pnl_history ? data.pnl_history.map((h: any) => h.pnl) : [],
          borderColor: isCurrentFleetLive ? '#fbbf24' : '#38bdf8',
          backgroundColor: isCurrentFleetLive ? 'rgba(245, 158, 11, 0.5)' : 'rgba(56, 189, 248, 0.5)',
          borderWidth: 2,
          tension: 0.3
        }
      ]
    };
  };

  const chartData = buildChartData();

  const chartOptions: any = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top' as const,
        align: 'start' as const,
        labels: {
          color: '#cbd5e1',
          font: {
            size: 11,
            weight: 600
          },
          usePointStyle: true,
          pointStyle: 'circle',
          padding: 10,
          boxWidth: 7,
          boxHeight: 7
        }
      },
      tooltip: {
        backgroundColor: 'rgba(15, 23, 42, 0.95)',
        titleColor: isCurrentFleetLive ? '#fbbf24' : '#38bdf8',
        bodyColor: '#f8fafc',
        borderColor: 'rgba(255, 255, 255, 0.15)',
        borderWidth: 1,
        padding: 10,
        callbacks: {
          label: (context: any) => {
            const label = context.dataset.label || '';
            const val = context.parsed.y !== null ? context.parsed.y : 0;
            const sign = val > 0 ? '+' : '';
            return ` ${label}: ${sign}$${val.toFixed(2)}`;
          }
        }
      }
    },
    scales: {
      y: {
        grid: { color: 'rgba(51, 65, 85, 0.4)' },
        ticks: {
          color: '#94a3b8',
          callback: (val: any) => `$${val}`
        }
      },
      x: {
        grid: { color: 'rgba(51, 65, 85, 0.2)' },
        ticks: { color: '#94a3b8' }
      }
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem', paddingBottom: '2rem' }}>
      {/* Header Title & Status */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ margin: '0 0 0.35rem 0', fontSize: '1.6rem', fontWeight: 800, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <TrendingUp size={26} color="#38bdf8" /> Trading Fleet Overview & Performance Studio
          </h1>
          <p style={{ margin: 0, fontSize: '0.85rem', color: '#94a3b8' }}>
            Giám sát tổng quan tình trạng tài khoản, vị thế mở và Bảng Xếp Hạng Định Lượng (Quant Leaderboard) cập nhật 1 ngày 2 lần (mỗi 12 tiếng).
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          {/* VPS Health Badge */}
          {vpsCpu !== null && vpsRam !== null && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                background: 'rgba(15, 23, 42, 0.7)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                padding: '0.45rem 0.85rem',
                borderRadius: '8px',
                fontSize: '0.75rem',
                color: '#cbd5e1'
              }}
              title="Tải phần cứng máy chủ VPS"
            >
              <Cpu size={14} color="#38bdf8" />
              <span>VPS:</span>
              <strong style={{ color: vpsCpu > 70 ? '#f87171' : vpsCpu > 40 ? '#fbbf24' : '#34d399' }}>
                CPU {vpsCpu}%
              </strong>
              <span style={{ color: '#475569' }}>•</span>
              <strong style={{ color: vpsRam > 80 ? '#f87171' : '#38bdf8' }}>
                RAM {vpsRam}%
              </strong>
            </div>
          )}

          {refreshMessage && (
            <div
              style={{
                padding: '0.45rem 0.85rem',
                borderRadius: '8px',
                fontSize: '0.8rem',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                background: refreshMessage.type === 'success' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                border: `1px solid ${refreshMessage.type === 'success' ? '#10b981' : '#ef4444'}`,
                color: refreshMessage.type === 'success' ? '#34d399' : '#f87171'
              }}
            >
              {refreshMessage.type === 'success' ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}
              {refreshMessage.text}
            </div>
          )}
        </div>
      </div>

      {/* 🎛️ SUB-TAB FLEET SWITCHER (LIVE vs DEMO) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: '1rem',
          background: 'rgba(15, 23, 42, 0.6)',
          padding: '0.5rem',
          borderRadius: '14px',
          border: '1px solid rgba(255, 255, 255, 0.08)'
        }}
      >
        {/* Tab 1: Live Fleet */}
        <div
          id="btn-subtab-live-fleet"
          onClick={() => handleFleetTabChange('live')}
          style={{
            cursor: 'pointer',
            padding: '1.1rem 1.25rem',
            borderRadius: '10px',
            transition: 'all 0.2s ease',
            position: 'relative',
            overflow: 'hidden',
            background: activeFleetTab === 'live'
              ? 'linear-gradient(135deg, rgba(245, 158, 11, 0.16) 0%, rgba(15, 23, 42, 0.9) 100%)'
              : 'rgba(15, 23, 42, 0.4)',
            border: activeFleetTab === 'live'
              ? '1.5px solid #fbbf24'
              : '1px solid rgba(255, 255, 255, 0.05)',
            boxShadow: activeFleetTab === 'live'
              ? '0 6px 20px rgba(245, 158, 11, 0.15)'
              : 'none'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <div
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '8px',
                  background: activeFleetTab === 'live' ? 'rgba(245, 158, 11, 0.25)' : 'rgba(255, 255, 255, 0.05)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <ShieldCheck size={22} color={activeFleetTab === 'live' ? '#fbbf24' : '#94a3b8'} />
              </div>
              <div>
                <div style={{ fontSize: '1.05rem', fontWeight: 800, color: activeFleetTab === 'live' ? '#fbbf24' : '#cbd5e1', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  LIVE TRADING FLEET
                </div>
                <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '1px' }}>
                  Tài khoản Live vốn thật • Real Capital
                </div>
              </div>
            </div>
            <span
              style={{
                background: activeFleetTab === 'live' ? 'rgba(234, 179, 8, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                border: activeFleetTab === 'live' ? '1px solid rgba(234, 179, 8, 0.5)' : '1px solid rgba(255, 255, 255, 0.1)',
                color: activeFleetTab === 'live' ? '#fbbf24' : '#64748b',
                fontSize: '0.7rem',
                fontWeight: 800,
                padding: '0.2rem 0.6rem',
                borderRadius: '999px',
                letterSpacing: '0.04em'
              }}
            >
              REAL CAPITAL
            </span>
          </div>
          {/* Live Fleet Quick Stats Bar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.75rem', fontSize: '0.76rem', color: '#cbd5e1', paddingTop: '0.65rem', borderTop: '1px solid rgba(255, 255, 255, 0.06)' }}>
            <span>Bots: <strong style={{ color: '#f8fafc' }}>{liveBots.length}</strong></span>
            <span style={{ color: '#475569' }}>•</span>
            <span>Đang chạy: <strong style={{ color: runningLiveBots.length > 0 ? '#34d399' : '#94a3b8' }}>{runningLiveBots.length}</strong></span>
            <span style={{ color: '#475569' }}>•</span>
            <span>Equity: <strong style={{ color: '#fbbf24', fontFamily: 'monospace' }}>{formatCurrency(totalLiveEquity)}</strong></span>
          </div>
        </div>

        {/* Tab 2: Demo Fleet */}
        <div
          id="btn-subtab-demo-fleet"
          onClick={() => handleFleetTabChange('demo')}
          style={{
            cursor: 'pointer',
            padding: '1.1rem 1.25rem',
            borderRadius: '10px',
            transition: 'all 0.2s ease',
            position: 'relative',
            overflow: 'hidden',
            background: activeFleetTab === 'demo'
              ? 'linear-gradient(135deg, rgba(56, 189, 248, 0.16) 0%, rgba(15, 23, 42, 0.9) 100%)'
              : 'rgba(15, 23, 42, 0.4)',
            border: activeFleetTab === 'demo'
              ? '1.5px solid #38bdf8'
              : '1px solid rgba(255, 255, 255, 0.05)',
            boxShadow: activeFleetTab === 'demo'
              ? '0 6px 20px rgba(56, 189, 248, 0.15)'
              : 'none'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <div
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '8px',
                  background: activeFleetTab === 'demo' ? 'rgba(56, 189, 248, 0.25)' : 'rgba(255, 255, 255, 0.05)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <Bot size={22} color={activeFleetTab === 'demo' ? '#38bdf8' : '#94a3b8'} />
              </div>
              <div>
                <div style={{ fontSize: '1.05rem', fontWeight: 800, color: activeFleetTab === 'demo' ? '#38bdf8' : '#cbd5e1', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  DEMO TESTING FLEET
                </div>
                <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '1px' }}>
                  Tài khoản Demo thử nghiệm • Sandbox
                </div>
              </div>
            </div>
            <span
              style={{
                background: activeFleetTab === 'demo' ? 'rgba(56, 189, 248, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                border: activeFleetTab === 'demo' ? '1px solid rgba(56, 189, 248, 0.5)' : '1px solid rgba(255, 255, 255, 0.1)',
                color: activeFleetTab === 'demo' ? '#38bdf8' : '#64748b',
                fontSize: '0.7rem',
                fontWeight: 800,
                padding: '0.2rem 0.6rem',
                borderRadius: '999px',
                letterSpacing: '0.04em'
              }}
            >
              SANDBOX / TESTING
            </span>
          </div>
          {/* Demo Fleet Quick Stats Bar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.75rem', fontSize: '0.76rem', color: '#cbd5e1', paddingTop: '0.65rem', borderTop: '1px solid rgba(255, 255, 255, 0.06)' }}>
            <span>Bots: <strong style={{ color: '#f8fafc' }}>{demoBots.length}</strong></span>
            <span style={{ color: '#475569' }}>•</span>
            <span>Đang chạy: <strong style={{ color: runningDemoBots.length > 0 ? '#34d399' : '#94a3b8' }}>{runningDemoBots.length}</strong></span>
            <span style={{ color: '#475569' }}>•</span>
            <span>Equity: <strong style={{ color: '#38bdf8', fontFamily: 'monospace' }}>{formatCurrency(totalDemoEquity)}</strong></span>
          </div>
        </div>
      </div>

      {/* Executive KPI Grid (6 Cards Segregated by Active Fleet) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
        {/* Card 1: Total Balance */}
        <div style={{ background: '#0b1120', padding: '1.2rem', borderRadius: '10px', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
          <div style={{ color: '#64748b', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Total Balance ({isCurrentFleetLive ? 'Live' : 'Demo'})
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#f8fafc', marginTop: '0.25rem' }}>
            {formatCurrency(currentFleetBalance)}
          </div>
          <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '0.2rem' }}>
            {isCurrentFleetLive ? 'Số dư ký quỹ tài khoản tiền thật' : 'Số dư ký quỹ tài khoản demo sandbox'}
          </div>
        </div>

        {/* Card 2: Total Equity */}
        <div style={{ background: '#0b1120', padding: '1.2rem', borderRadius: '10px', border: isCurrentFleetLive ? '1px solid rgba(245, 158, 11, 0.3)' : '1px solid rgba(56, 189, 248, 0.3)' }}>
          <div style={{ color: '#64748b', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Total Equity ({isCurrentFleetLive ? 'Live' : 'Demo'})
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: isCurrentFleetLive ? '#fbbf24' : '#38bdf8', marginTop: '0.25rem' }}>
            {formatCurrency(currentFleetEquity)}
          </div>
          <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '0.2rem' }}>
            {isCurrentFleetLive ? 'Vốn thực tế tiền thật thời gian thực' : 'Vốn thực tế demo thời gian thực'}
          </div>
        </div>

        {/* Card 3: Today's P&L */}
        <div
          onClick={() => onNavigateTab?.('history')}
          style={{
            background: '#0b1120',
            padding: '1.2rem',
            borderRadius: '10px',
            border: currentFleetTodayPnl !== 0 ? (currentFleetTodayPnl > 0 ? '1px solid rgba(16, 185, 129, 0.35)' : '1px solid rgba(239, 68, 68, 0.35)') : '1px solid rgba(255, 255, 255, 0.08)',
            cursor: onNavigateTab ? 'pointer' : 'default',
            transition: 'transform 0.15s, border-color 0.15s'
          }}
          title="Nhấn để xem Lịch sử giao dịch"
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ color: '#64748b', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Today's P&L ({isCurrentFleetLive ? 'Live' : 'Demo'})
            </div>
            {currentFleetTodayPnl !== 0 && (
              currentFleetTodayPnl > 0 ? <ArrowUpRight size={16} color="#34d399" /> : <ArrowDownRight size={16} color="#f87171" />
            )}
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: currentFleetTodayPnl > 0 ? '#34d399' : currentFleetTodayPnl < 0 ? '#f87171' : '#f8fafc', marginTop: '0.25rem' }}>
            {formatCurrency(currentFleetTodayPnl, true)}
          </div>
          <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '0.2rem' }}>
            Khớp {currentFleetTodayTrades.length} lệnh hôm nay ({isCurrentFleetLive ? 'Live' : 'Demo'})
          </div>
        </div>

        {/* Card 4: Open Positions */}
        <div
          onClick={() => onNavigateTab?.('positions')}
          style={{
            background: '#0b1120',
            padding: '1.2rem',
            borderRadius: '10px',
            border: currentFleetPositions.length > 0 ? (isCurrentFleetLive ? '1px solid rgba(245, 158, 11, 0.35)' : '1px solid rgba(56, 189, 248, 0.35)') : '1px solid rgba(255, 255, 255, 0.08)',
            cursor: onNavigateTab ? 'pointer' : 'default',
            transition: 'transform 0.15s, border-color 0.15s'
          }}
          title="Nhấn để xem các Lệnh đang mở"
        >
          <div style={{ color: '#64748b', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Open Positions ({isCurrentFleetLive ? 'Live' : 'Demo'})
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: currentFleetPositions.length > 0 ? '#34d399' : '#f8fafc', marginTop: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <Zap size={20} color={currentFleetPositions.length > 0 ? (isCurrentFleetLive ? '#fbbf24' : '#34d399') : '#64748b'} />
            {currentFleetPositions.length}
          </div>
          <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '0.2rem' }}>
            {currentFleetPositions.length > 0 ? (
              <span>
                Float: <strong style={{ color: currentFleetFloatingPnl >= 0 ? '#34d399' : '#f87171' }}>{formatCurrency(currentFleetFloatingPnl, true)}</strong>
              </span>
            ) : (
              'Không có lệnh mở'
            )}
          </div>
        </div>

        {/* Card 5: Active Running Bots */}
        <div
          onClick={() => onNavigateTab?.('bots')}
          style={{
            background: '#0b1120',
            padding: '1.2rem',
            borderRadius: '10px',
            border: currentFleetRunningBots.length > 0 ? (isCurrentFleetLive ? '1px solid rgba(245, 158, 11, 0.35)' : '1px solid rgba(168, 85, 247, 0.35)') : '1px solid rgba(255, 255, 255, 0.08)',
            cursor: onNavigateTab ? 'pointer' : 'default',
            transition: 'transform 0.15s, border-color 0.15s'
          }}
          title="Nhấn để quản lý cBot"
        >
          <div style={{ color: '#64748b', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Active Running Bots ({isCurrentFleetLive ? 'Live' : 'Demo'})
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: isCurrentFleetLive ? '#fbbf24' : '#a855f7', marginTop: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            {isCurrentFleetLive ? <ShieldCheck size={20} color="#fbbf24" /> : <Bot size={20} color="#a855f7" />}
            {currentFleetRunningBots.length}
            <span style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 500 }}>/ {currentFleetBots.length}</span>
          </div>
          <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '0.2rem' }}>
            Tiến trình cBot {isCurrentFleetLive ? 'Live' : 'Demo'} đang chạy
          </div>
        </div>

        {/* Card 6: Fleet Win Rate */}
        <div style={{ background: '#0b1120', padding: '1.2rem', borderRadius: '10px', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
          <div style={{ color: '#64748b', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Fleet Win Rate ({isCurrentFleetLive ? 'Live' : 'Demo'})
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: fleetWinRate >= 50 ? '#34d399' : fleetTotalTrades === 0 ? '#94a3b8' : '#f87171', marginTop: '0.25rem' }}>
            {fleetTotalTrades > 0 ? `${fleetWinRate}%` : '--'}
          </div>
          <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '0.2rem' }}>
            Tổng lệnh khớp: <strong>{fleetTotalTrades}</strong>
          </div>
        </div>
      </div>

      {/* 🏆 BOT FLEET PERFORMANCE LEADERBOARD SECTION */}
      <div
        style={{
          background: '#090d16',
          border: isCurrentFleetLive ? '1px solid rgba(245, 158, 11, 0.35)' : '1px solid rgba(56, 189, 248, 0.25)',
          borderRadius: '14px',
          padding: '1.5rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '1.25rem',
          boxShadow: '0 8px 30px rgba(0, 0, 0, 0.4)'
        }}
      >
        {/* Leaderboard Header & Cycle Controls */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', paddingBottom: '1rem' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <Trophy size={22} color={isCurrentFleetLive ? '#fbbf24' : '#38bdf8'} />
              Bảng Xếp Hạng Hiệu Suất Bot Fleet — {isCurrentFleetLive ? 'LIVE FLEET (Vốn Thật)' : 'DEMO FLEET (Thử Nghiệm)'}
            </h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.35rem', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Clock size={13} color={isCurrentFleetLive ? '#fbbf24' : '#38bdf8'} /> Chu kỳ: <strong>1 ngày 2 lần (12h/lần)</strong>
              </span>
              <span style={{ fontSize: '0.75rem', color: '#cbd5e1' }}>•</span>
              <span style={{ fontSize: '0.75rem', color: isCurrentFleetLive ? '#fbbf24' : '#38bdf8', fontWeight: 600 }}>
                ⏳ Cập nhật tiếp theo sau: <span style={{ fontFamily: 'monospace', color: isCurrentFleetLive ? '#fbbf24' : '#38bdf8', fontWeight: 700 }}>{countdownText}</span>
              </span>
              {leaderboard?.created_at && (
                <>
                  <span style={{ fontSize: '0.75rem', color: '#cbd5e1' }}>•</span>
                  <span style={{ fontSize: '0.72rem', color: '#64748b' }}>
                    Snapshot lúc: {new Date(leaderboard.created_at).toLocaleTimeString()}
                  </span>
                </>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
            {/* Quick Filter Buttons */}
            <div style={{ display: 'flex', background: 'rgba(15, 23, 42, 0.8)', padding: '2px', borderRadius: '6px', border: '1px solid #334155' }}>
              <button
                onClick={() => setRankingFilter('all')}
                style={{
                  background: rankingFilter === 'all' ? (isCurrentFleetLive ? '#d97706' : '#0284c7') : 'transparent',
                  color: rankingFilter === 'all' ? '#ffffff' : '#94a3b8',
                  border: 'none',
                  borderRadius: '4px',
                  padding: '0.3rem 0.6rem',
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                Tất cả ({fleetRankings.length})
              </button>
              <button
                onClick={() => setRankingFilter('running')}
                style={{
                  background: rankingFilter === 'running' ? (isCurrentFleetLive ? '#d97706' : '#0284c7') : 'transparent',
                  color: rankingFilter === 'running' ? '#ffffff' : '#94a3b8',
                  border: 'none',
                  borderRadius: '4px',
                  padding: '0.3rem 0.6rem',
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                Đang chạy ({fleetRankings.filter((b) => b.status === 'RUNNING').length})
              </button>
              <button
                onClick={() => setRankingFilter('profitable')}
                style={{
                  background: rankingFilter === 'profitable' ? (isCurrentFleetLive ? '#d97706' : '#0284c7') : 'transparent',
                  color: rankingFilter === 'profitable' ? '#ffffff' : '#94a3b8',
                  border: 'none',
                  borderRadius: '4px',
                  padding: '0.3rem 0.6rem',
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                Có lãi ({fleetRankings.filter((b) => b.total_pnl_usd > 0).length})
              </button>
            </div>

            {/* Action Recalculate Now Button */}
            <button
              onClick={() => !isGuest && fetchLeaderboard(true)}
              disabled={isRefreshing || isGuest}
              title={isGuest ? 'Chế độ Guest chỉ xem' : 'Kích hoạt tính toán lại Bảng xếp hạng định lượng ngay lập tức'}
              style={{
                background: isGuest ? 'rgba(100, 116, 139, 0.2)' : isCurrentFleetLive ? 'rgba(245, 158, 11, 0.1)' : 'rgba(56, 189, 248, 0.1)',
                border: isGuest ? '1px solid rgba(255, 255, 255, 0.1)' : isCurrentFleetLive ? '1px solid rgba(245, 158, 11, 0.3)' : '1px solid rgba(56, 189, 248, 0.3)',
                color: isGuest ? '#64748b' : isCurrentFleetLive ? '#fbbf24' : '#38bdf8',
                padding: '0.45rem 1rem',
                borderRadius: '8px',
                fontSize: '0.78rem',
                fontWeight: 700,
                cursor: isRefreshing || isGuest ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                transition: 'all 0.2s ease',
                opacity: isGuest ? 0.5 : 1
              }}
            >
              <RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} />
              {isRefreshing ? 'Đang Tính Toán...' : 'Cập Nhật Ngay'}
            </button>
          </div>
        </div>

        {/* Empty State Banner if no bots in fleet */}
        {fleetRankings.length === 0 && !isLoadingLeaderboard ? (
          <div style={{ textAlign: 'center', padding: '2.5rem 1.5rem', background: 'rgba(15, 23, 42, 0.4)', borderRadius: '10px', border: '1px dashed rgba(255, 255, 255, 0.1)' }}>
            <div style={{ fontSize: '2.2rem', marginBottom: '0.5rem' }}>{isCurrentFleetLive ? '🛡️' : '🤖'}</div>
            <h3 style={{ margin: '0 0 0.5rem 0', color: '#f8fafc', fontSize: '1.1rem', fontWeight: 800 }}>
              {isCurrentFleetLive ? 'Chưa Có cBot Nào Trong Live Trading Fleet' : 'Chưa Có cBot Nào Trong Demo Testing Fleet'}
            </h3>
            <p style={{ margin: '0 0 1.25rem 0', color: '#94a3b8', fontSize: '0.85rem' }}>
              {isCurrentFleetLive
                ? 'Bạn chưa gán hoặc kích hoạt cBot nào trên tài khoản tiền thật (Live Account). Bạn có thể cấu hình bot ngay trong Bot Manager.'
                : 'Bạn chưa khởi tạo cBot nào trên tài khoản thử nghiệm (Demo Account).'}
            </p>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
              <button
                onClick={() => onNavigateTab?.('bots')}
                style={{
                  background: isCurrentFleetLive ? '#d97706' : '#0284c7',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '0.5rem 1.1rem',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                Mở Bot Manager để cấu hình
              </button>
              <button
                onClick={() => handleFleetTabChange(isCurrentFleetLive ? 'demo' : 'live')}
                style={{
                  background: 'rgba(255, 255, 255, 0.08)',
                  color: '#cbd5e1',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  borderRadius: '6px',
                  padding: '0.5rem 1.1rem',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Chuyển sang xem {isCurrentFleetLive ? 'Demo Fleet' : 'Live Fleet'}
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Podium Top 3 Champions Cards */}
            {fleetRankings.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
                {/* Rank 1 Gold */}
                {fleetRankings[0] && (
                  <div
                    style={{
                      background: 'linear-gradient(145deg, rgba(245, 158, 11, 0.12) 0%, rgba(15, 23, 42, 0.8) 100%)',
                      border: '1px solid rgba(245, 158, 11, 0.4)',
                      borderRadius: '10px',
                      padding: '1rem',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.5rem',
                      position: 'relative',
                      overflow: 'hidden'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#fbbf24', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Crown size={16} /> 🥇 QUÁN QUÂN ({isCurrentFleetLive ? 'LIVE' : 'DEMO'} #1)
                      </span>
                      <span style={{ background: 'rgba(56, 189, 248, 0.2)', color: '#38bdf8', fontSize: '0.7rem', fontWeight: 800, padding: '2px 6px', borderRadius: '4px' }}>
                        {fleetRankings[0].tier_label}
                      </span>
                    </div>
                    <div style={{ fontWeight: 800, fontSize: '0.95rem', color: '#f8fafc' }}>
                      {fleetRankings[0].bot_name}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                      {fleetRankings[0].symbol} ({fleetRankings[0].timeframe}) • Win Rate: <strong style={{ color: '#34d399' }}>{fleetRankings[0].win_rate}%</strong>
                      {fleetRankings[0].total_trades === 0 && (
                        <span style={{ marginLeft: '6px', color: '#94a3b8', fontStyle: 'italic' }}>(Chưa có lệnh)</span>
                      )}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.3rem' }}>
                      <span style={{ fontSize: '0.72rem', color: '#64748b' }}>Quant Score:</span>
                      <strong style={{ color: '#fbbf24', fontSize: '1.1rem' }}>{fleetRankings[0].composite_score} / 100</strong>
                    </div>
                  </div>
                )}

                {/* Rank 2 Silver */}
                {fleetRankings[1] && (
                  <div
                    style={{
                      background: 'linear-gradient(145deg, rgba(148, 163, 184, 0.12) 0%, rgba(15, 23, 42, 0.8) 100%)',
                      border: '1px solid rgba(148, 163, 184, 0.3)',
                      borderRadius: '10px',
                      padding: '1rem',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.5rem'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#cbd5e1', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        🥈 Á QUÂN ({isCurrentFleetLive ? 'LIVE' : 'DEMO'} #2)
                      </span>
                      <span style={{ background: 'rgba(245, 158, 11, 0.2)', color: '#fbbf24', fontSize: '0.7rem', fontWeight: 800, padding: '2px 6px', borderRadius: '4px' }}>
                        {fleetRankings[1].tier_label}
                      </span>
                    </div>
                    <div style={{ fontWeight: 800, fontSize: '0.95rem', color: '#f8fafc' }}>
                      {fleetRankings[1].bot_name}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                      {fleetRankings[1].symbol} ({fleetRankings[1].timeframe}) • Win Rate: <strong style={{ color: fleetRankings[1].win_rate >= 50 ? '#34d399' : '#f87171' }}>{fleetRankings[1].win_rate}%</strong>
                      {fleetRankings[1].total_trades === 0 && (
                        <span style={{ marginLeft: '6px', color: '#94a3b8', fontStyle: 'italic' }}>(Chưa có lệnh)</span>
                      )}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.3rem' }}>
                      <span style={{ fontSize: '0.72rem', color: '#64748b' }}>Quant Score:</span>
                      <strong style={{ color: '#cbd5e1', fontSize: '1.1rem' }}>{fleetRankings[1].composite_score} / 100</strong>
                    </div>
                  </div>
                )}

                {/* Rank 3 Bronze */}
                {fleetRankings[2] && (
                  <div
                    style={{
                      background: 'linear-gradient(145deg, rgba(217, 119, 6, 0.1) 0%, rgba(15, 23, 42, 0.8) 100%)',
                      border: '1px solid rgba(217, 119, 6, 0.3)',
                      borderRadius: '10px',
                      padding: '1rem',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.5rem'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#f59e0b', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        🥉 HẠNG BA ({isCurrentFleetLive ? 'LIVE' : 'DEMO'} #3)
                      </span>
                      <span style={{ background: 'rgba(148, 163, 184, 0.2)', color: '#94a3b8', fontSize: '0.7rem', fontWeight: 800, padding: '2px 6px', borderRadius: '4px' }}>
                        {fleetRankings[2].tier_label}
                      </span>
                    </div>
                    <div style={{ fontWeight: 800, fontSize: '0.95rem', color: '#f8fafc' }}>
                      {fleetRankings[2].bot_name}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                      {fleetRankings[2].symbol} ({fleetRankings[2].timeframe}) • Win Rate: <strong style={{ color: fleetRankings[2].win_rate >= 50 ? '#34d399' : '#f87171' }}>{fleetRankings[2].win_rate}%</strong>
                      {fleetRankings[2].total_trades === 0 && (
                        <span style={{ marginLeft: '6px', color: '#94a3b8', fontStyle: 'italic' }}>(Chưa có lệnh)</span>
                      )}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.3rem' }}>
                      <span style={{ fontSize: '0.72rem', color: '#64748b' }}>Quant Score:</span>
                      <strong style={{ color: '#f59e0b', fontSize: '1.1rem' }}>{fleetRankings[2].composite_score} / 100</strong>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Detailed Leaderboard Ranking Table */}
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', textAlign: 'left' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.1)', color: '#64748b' }}>
                    <th style={{ padding: '0.6rem 0.5rem' }}>Hạng</th>
                    <th style={{ padding: '0.6rem' }}>Tên Bot & Chiến Lược</th>
                    <th style={{ padding: '0.6rem' }}>Cặp Tiền / TF</th>
                    <th style={{ padding: '0.6rem' }}>Trạng Thái</th>
                    <th style={{ padding: '0.6rem' }}>Lệnh (W/L)</th>
                    <th style={{ padding: '0.6rem' }}>Win Rate</th>
                    <th style={{ padding: '0.6rem' }}>Profit Factor</th>
                    <th style={{ padding: '0.6rem' }}>Tổng PnL ($)</th>
                    <th style={{ padding: '0.6rem' }}>Quant Score</th>
                    <th style={{ padding: '0.6rem' }}>Phân Cấp (Tier)</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoadingLeaderboard ? (
                    <tr>
                      <td colSpan={10} style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>
                        <RefreshCw size={18} className="animate-spin" style={{ display: 'inline', marginRight: '6px' }} />
                        Đang nạp dữ liệu bảng xếp hạng...
                      </td>
                    </tr>
                  ) : displayRankings && displayRankings.length > 0 ? (
                    displayRankings.map((bot) => (
                      <tr
                        key={bot.bot_id}
                        style={{
                          borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
                          background: bot.rank === 1 ? (isCurrentFleetLive ? 'rgba(245, 158, 11, 0.05)' : 'rgba(56, 189, 248, 0.05)') : 'transparent'
                        }}
                      >
                        {/* Rank Badge */}
                        <td style={{ padding: '0.6rem 0.5rem' }}>
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              width: '24px',
                              height: '24px',
                              borderRadius: '50%',
                              fontWeight: 800,
                              fontSize: '0.75rem',
                              background:
                                bot.rank === 1
                                  ? '#fbbf24'
                                  : bot.rank === 2
                                  ? '#cbd5e1'
                                  : bot.rank === 3
                                  ? '#d97706'
                                  : 'rgba(255, 255, 255, 0.08)',
                              color: bot.rank <= 3 ? '#090d16' : '#94a3b8'
                            }}
                          >
                            {bot.rank}
                          </span>
                        </td>

                        {/* Bot Name */}
                        <td style={{ padding: '0.6rem', fontWeight: 700, color: '#f8fafc' }}>
                          {bot.bot_name}
                        </td>

                        {/* Symbol / TF */}
                        <td style={{ padding: '0.6rem', color: '#94a3b8' }}>
                          {bot.symbol} <span style={{ fontSize: '0.72rem', color: '#64748b' }}>({bot.timeframe})</span>
                        </td>

                        {/* Status */}
                        <td style={{ padding: '0.6rem' }}>
                          {bot.status === 'RUNNING' ? (
                            <span style={{ color: '#34d399', fontSize: '0.72rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10b981', display: 'inline-block' }}></span> RUNNING
                            </span>
                          ) : (
                            <span style={{ color: '#64748b', fontSize: '0.72rem', fontWeight: 600 }}>STOPPED</span>
                          )}
                        </td>

                        {/* Trades W/L */}
                        <td style={{ padding: '0.6rem', color: '#cbd5e1' }}>
                          <strong>{bot.total_trades}</strong>{' '}
                          <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                            ({bot.total_wins}W - {bot.total_losses}L)
                          </span>
                        </td>

                        {/* Win Rate */}
                        <td style={{ padding: '0.6rem', fontWeight: 700, color: bot.win_rate >= 50 ? '#34d399' : bot.total_trades === 0 ? '#94a3b8' : '#f87171' }}>
                          {bot.total_trades > 0 ? `${bot.win_rate}%` : '--'}
                        </td>

                        {/* Profit Factor */}
                        <td style={{ padding: '0.6rem', color: bot.profit_factor >= 1.0 ? '#38bdf8' : '#f87171' }}>
                          {Number(bot.profit_factor).toFixed(2)}
                        </td>

                        {/* Total PnL */}
                        <td style={{ padding: '0.6rem', fontWeight: 700, color: bot.total_pnl_usd > 0 ? '#34d399' : bot.total_pnl_usd < 0 ? '#f87171' : '#cbd5e1' }}>
                          {formatCurrency(bot.total_pnl_usd, true)}
                          {bot.floating_pnl_usd !== 0 && (
                            <span style={{ fontSize: '0.7rem', color: bot.floating_pnl_usd > 0 ? '#34d399' : '#f87171', display: 'block' }}>
                              Float: {formatCurrency(bot.floating_pnl_usd, true)}
                            </span>
                          )}
                        </td>

                        {/* Quant Score with Bar */}
                        <td style={{ padding: '0.6rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ fontWeight: 800, color: bot.composite_score >= 70 ? '#34d399' : bot.composite_score >= 50 ? '#fbbf24' : '#f87171', width: '30px' }}>
                              {bot.composite_score}
                            </span>
                            <div style={{ width: '45px', height: '5px', background: 'rgba(255, 255, 255, 0.1)', borderRadius: '3px', overflow: 'hidden' }}>
                              <div
                                style={{
                                  width: `${Math.min(100, bot.composite_score)}%`,
                                  height: '100%',
                                  background: bot.composite_score >= 70 ? '#34d399' : bot.composite_score >= 50 ? '#fbbf24' : '#f87171'
                                }}
                              ></div>
                            </div>
                          </div>
                        </td>

                        {/* Tier Badge */}
                        <td style={{ padding: '0.6rem' }}>
                          <span
                            style={{
                              background: `${bot.tier_color}18`,
                              color: bot.tier_color,
                              border: `1px solid ${bot.tier_color}35`,
                              padding: '2px 7px',
                              borderRadius: '4px',
                              fontSize: '0.72rem',
                              fontWeight: 700,
                              whiteSpace: 'nowrap'
                            }}
                          >
                            {bot.tier_label}
                          </span>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={10} style={{ textAlign: 'center', padding: '1.5rem', color: '#64748b' }}>
                        Không tìm thấy bot nào trong {isCurrentFleetLive ? 'Live Fleet' : 'Demo Fleet'} phù hợp với bộ lọc đã chọn.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* Intraday Multi-Account Chart & Linked Accounts Layout */}
      <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
        {/* Left: Multi-Account Chart */}
        <div style={{ flex: 2, minWidth: '340px', background: '#0b1120', padding: '1.5rem', borderRadius: '10px', border: '1px solid rgba(255, 255, 255, 0.08)', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <TrendingUp size={18} color={isCurrentFleetLive ? '#fbbf24' : '#38bdf8'} /> Multi-Account Performance ({isCurrentFleetLive ? 'LIVE FLEET' : 'DEMO FLEET'})
              </h2>
              <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                Biểu đồ hiệu suất các tài khoản {isCurrentFleetLive ? 'Live tiền thật' : 'Demo thử nghiệm'} • Nhấn vào tên tài khoản trên Chú giải để bật/tắt
              </span>
            </div>

            {/* Metric Mode Switcher */}
            <div style={{ display: 'flex', background: 'rgba(15, 23, 42, 0.8)', padding: '2px', borderRadius: '6px', border: '1px solid #334155' }}>
              <button
                onClick={() => setChartMetric('daily')}
                style={{
                  background: chartMetric === 'daily' ? (isCurrentFleetLive ? '#d97706' : '#0284c7') : 'transparent',
                  color: chartMetric === 'daily' ? '#ffffff' : '#94a3b8',
                  border: 'none',
                  borderRadius: '4px',
                  padding: '0.3rem 0.65rem',
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
              >
                📊 Daily P&L ($)
              </button>

              <button
                onClick={() => setChartMetric('cumulative')}
                style={{
                  background: chartMetric === 'cumulative' ? (isCurrentFleetLive ? '#d97706' : '#0284c7') : 'transparent',
                  color: chartMetric === 'cumulative' ? '#ffffff' : '#94a3b8',
                  border: 'none',
                  borderRadius: '4px',
                  padding: '0.3rem 0.65rem',
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
              >
                📈 Tích Lũy (Cumulative)
              </button>
            </div>
          </div>

          <div style={{ height: '320px', position: 'relative', width: '100%' }}>
            <Line options={chartOptions} data={chartData} />
          </div>
        </div>

        {/* Right: Linked Accounts Card */}
        <div style={{ flex: 1, minWidth: '300px', background: '#0b1120', padding: '1.25rem', borderRadius: '10px', border: '1px solid rgba(255, 255, 255, 0.08)', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Layers size={18} color={isCurrentFleetLive ? '#fbbf24' : '#a855f7'} /> Linked Accounts ({isCurrentFleetLive ? 'Live' : 'Demo'})
            </h2>
            <span
              style={{
                fontSize: '0.75rem',
                color: isCurrentFleetLive ? '#fbbf24' : '#38bdf8',
                background: isCurrentFleetLive ? 'rgba(245, 158, 11, 0.15)' : 'rgba(56, 189, 248, 0.12)',
                border: isCurrentFleetLive ? '1px solid rgba(245, 158, 11, 0.3)' : '1px solid rgba(56, 189, 248, 0.25)',
                padding: '2px 8px',
                borderRadius: '10px',
                fontWeight: 700
              }}
            >
              {currentFleetAccounts.length} {isCurrentFleetLive ? 'Live' : 'Demo'} Accounts
            </span>
          </div>

          <div style={{ maxHeight: '280px', overflowY: 'auto', paddingRight: '4px' }}>
            <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
              <thead>
                <tr style={{ color: '#64748b', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', position: 'sticky', top: 0, background: '#0b1120' }}>
                  <th style={{ padding: '0.5rem 0' }}>Tài Khoản</th>
                  <th style={{ padding: '0.5rem 0' }}>Loại</th>
                  <th style={{ padding: '0.5rem 0', textAlign: 'right' }}>Equity / Vốn</th>
                </tr>
              </thead>
              <tbody>
                {currentFleetAccounts && currentFleetAccounts.length > 0 ? (
                  currentFleetAccounts.map((acc: any) => {
                    const isLive = (acc.account_type || '').toLowerCase() === 'live';
                    return (
                      <tr key={acc.account_id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)' }}>
                        <td style={{ padding: '0.55rem 0' }}>
                          <div style={{ fontWeight: 700, color: isLive ? '#fbbf24' : '#38bdf8' }}>{acc.account_id}</div>
                          <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>
                            {acc.account_label || acc.broker || 'cTrader Account'}
                          </div>
                        </td>
                        <td style={{ padding: '0.55rem 0' }}>
                          <span
                            style={{
                              fontSize: '0.68rem',
                              fontWeight: 800,
                              padding: '2px 6px',
                              borderRadius: '4px',
                              background: isLive ? 'rgba(245, 158, 11, 0.15)' : 'rgba(148, 163, 184, 0.15)',
                              color: isLive ? '#fbbf24' : '#94a3b8',
                              border: `1px solid ${isLive ? 'rgba(245, 158, 11, 0.3)' : 'rgba(148, 163, 184, 0.2)'}`
                            }}
                          >
                            {isLive ? 'LIVE' : 'DEMO'}
                          </span>
                        </td>
                        <td style={{ padding: '0.55rem 0', textAlign: 'right', fontWeight: 700, color: '#f8fafc' }}>
                          <div>{formatCurrency(acc.equity)}</div>
                          <div style={{ fontSize: '0.7rem', color: '#64748b' }}>
                            Bal: {formatCurrency(acc.balance)}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={3} style={{ color: '#64748b', padding: '1.5rem 0', textAlign: 'center' }}>
                      Không có tài khoản {isCurrentFleetLive ? 'Live' : 'Demo'} liên kết
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
