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
  Layers
} from 'lucide-react';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

interface OverviewProps {
  data: any;
  isGuest?: boolean;
}

interface BotRankingItem {
  rank: number;
  bot_id: number;
  bot_name: string;
  symbol: string;
  timeframe: string;
  status: string;
  account_id: string;
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

export default function OverviewTab({ data, isGuest = false }: OverviewProps) {
  const [leaderboard, setLeaderboard] = useState<LeaderboardData | null>(null);
  const [isLoadingLeaderboard, setIsLoadingLeaderboard] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [countdownText, setCountdownText] = useState<string>('--:--:--');
  const [refreshMessage, setRefreshMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Fetch Leaderboard
  const fetchLeaderboard = async (force: boolean = false) => {
    if (force) {
      setIsRefreshing(true);
    } else {
      setIsLoadingLeaderboard(true);
    }
    try {
      const url = force
        ? `${getApiBaseUrl()}/api/leaderboard/refresh`
        : `${getApiBaseUrl()}/api/leaderboard`;
      const method = force ? 'post' : 'get';
      const res = await axios[method](url, force ? {} : { withCredentials: true }, { withCredentials: true });
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
        setRefreshMessage({ type: 'error', text: 'Lỗi khi cập nhật bảng xếp hạng' });
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

  const [chartMetric, setChartMetric] = useState<'daily' | 'cumulative'>('daily');

  const COLOR_PALETTE = [
    { border: '#10b981', bg: 'rgba(16, 185, 129, 0.15)' }, // Emerald Green
    { border: '#a855f7', bg: 'rgba(168, 85, 247, 0.15)' }, // Purple
    { border: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)' }, // Amber Gold
    { border: '#ec4899', bg: 'rgba(236, 72, 153, 0.15)' }, // Pink Rose
    { border: '#06b6d4', bg: 'rgba(6, 182, 212, 0.15)' },  // Teal
    { border: '#6366f1', bg: 'rgba(99, 102, 241, 0.15)' }, // Indigo
    { border: '#84cc16', bg: 'rgba(132, 204, 22, 0.15)' }  // Lime
  ];

  // Construct Multi-Account Datasets
  const buildChartData = () => {
    if (data?.pnl_by_account?.dates) {
      const dates = data.pnl_by_account.dates;
      const isDaily = chartMetric === 'daily';

      const datasets: any[] = [
        // 1. Total Fleet Series
        {
          label: isDaily ? '⭐ Toàn Fleet (Total Daily PnL)' : '⭐ Toàn Fleet (Cumulative Growth)',
          data: isDaily ? data.pnl_by_account.totals_daily : data.pnl_by_account.totals_cumulative,
          borderColor: '#38bdf8',
          backgroundColor: 'rgba(56, 189, 248, 0.15)',
          borderWidth: 3,
          pointRadius: 4,
          pointHoverRadius: 6,
          tension: 0.3
        }
      ];

      // 2. Individual Account Series
      const uniqueAccounts = data.pnl_by_account.unique_accounts || [];
      uniqueAccounts.forEach((accId: string, idx: number) => {
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
          label: 'Daily P&L',
          data: data?.pnl_history ? data.pnl_history.map((h: any) => h.pnl) : [],
          borderColor: '#38bdf8',
          backgroundColor: 'rgba(56, 189, 248, 0.5)',
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
          padding: 12,
          boxWidth: 8,
          boxHeight: 8
        }
      },
      tooltip: {
        backgroundColor: 'rgba(15, 23, 42, 0.95)',
        titleColor: '#38bdf8',
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
      {/* Header Title */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ margin: '0 0 0.35rem 0', fontSize: '1.6rem', fontWeight: 800, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <TrendingUp size={26} color="#38bdf8" /> Trading Fleet Overview & Performance Studio
          </h1>
          <p style={{ margin: 0, fontSize: '0.85rem', color: '#94a3b8' }}>
            Giám sát tổng quan tình trạng tài khoản, vị thế mở và Bảng Xếp Hạng Định Lượng (Quant Leaderboard) cập nhật 1 ngày 2 lần (mỗi 12 tiếng).
          </p>
        </div>

        {refreshMessage && (
          <div
            style={{
              padding: '0.5rem 1rem',
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
            {refreshMessage.type === 'success' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
            {refreshMessage.text}
          </div>
        )}
      </div>

      {/* KPI Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
        <div style={{ background: '#0b1120', padding: '1.2rem', borderRadius: '10px', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
          <div style={{ color: '#64748b', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase' }}>Total Balance</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#f8fafc', marginTop: '0.25rem' }}>${data?.summary?.account_balance || '0.00'}</div>
          <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '0.2rem' }}>Số dư ký quỹ sàn</div>
        </div>

        <div style={{ background: '#0b1120', padding: '1.2rem', borderRadius: '10px', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
          <div style={{ color: '#64748b', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase' }}>Total Equity</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#38bdf8', marginTop: '0.25rem' }}>${data?.summary?.account_equity || '0.00'}</div>
          <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '0.2rem' }}>Vốn thực tế thời gian thực</div>
        </div>

        <div style={{ background: '#0b1120', padding: '1.2rem', borderRadius: '10px', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
          <div style={{ color: '#64748b', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase' }}>Open Positions</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: (data?.summary?.open_positions || 0) > 0 ? '#34d399' : '#f8fafc', marginTop: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <Zap size={20} color={(data?.summary?.open_positions || 0) > 0 ? '#34d399' : '#64748b'} />
            {data?.summary?.open_positions || 0}
          </div>
          <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '0.2rem' }}>Lệnh đang chạy thị trường</div>
        </div>

        <div style={{ background: '#0b1120', padding: '1.2rem', borderRadius: '10px', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
          <div style={{ color: '#64748b', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase' }}>Active Running Bots</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#a855f7', marginTop: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <Bot size={20} color="#a855f7" />
            {data?.bots ? data.bots.filter((b: any) => b.status === 'RUNNING').length : 0}
            <span style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 500 }}>/ {data?.bots?.length || 0}</span>
          </div>
          <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '0.2rem' }}>Tiến trình cBot đang kích hoạt</div>
        </div>

        <div style={{ background: '#0b1120', padding: '1.2rem', borderRadius: '10px', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
          <div style={{ color: '#64748b', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase' }}>Fleet Win Rate</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: (leaderboard?.fleet_win_rate || 0) >= 50 ? '#34d399' : '#f87171', marginTop: '0.25rem' }}>
            {leaderboard?.fleet_win_rate !== undefined ? `${leaderboard.fleet_win_rate}%` : '--'}
          </div>
          <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '0.2rem' }}>
            Tổng lệnh khớp: <strong>{leaderboard?.fleet_total_trades || 0}</strong>
          </div>
        </div>
      </div>

      {/* 🏆 BOT FLEET PERFORMANCE LEADERBOARD SECTION */}
      <div
        style={{
          background: '#090d16',
          border: '1px solid rgba(56, 189, 248, 0.25)',
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
              <Trophy size={22} color="#fbbf24" /> Bảng Xếp Hạng Hiệu Suất Bot Fleet (Quant Leaderboard)
            </h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.35rem', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Clock size={13} color="#38bdf8" /> Chu kỳ: <strong>1 ngày 2 lần (12h/lần)</strong>
              </span>
              <span style={{ fontSize: '0.75rem', color: '#cbd5e1' }}>•</span>
              <span style={{ fontSize: '0.75rem', color: '#38bdf8', fontWeight: 600 }}>
                ⏳ Cập nhật tiếp theo sau: <span style={{ fontFamily: 'monospace', color: '#fbbf24', fontWeight: 700 }}>{countdownText}</span>
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

          {/* Action Recalculate Now Button */}
          <button
            onClick={() => fetchLeaderboard(true)}
            disabled={isRefreshing || isGuest}
            style={{
              background: 'rgba(56, 189, 248, 0.1)',
              border: '1px solid rgba(56, 189, 248, 0.3)',
              color: '#38bdf8',
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
            <RefreshCw size={14} className={isRefreshing ? 'live-pulse' : ''} />
            {isRefreshing ? 'Đang Tính Toán...' : 'Cập Nhật Ngay (Recalculate)'}
          </button>
        </div>

        {/* Podium Top 3 Champions Cards */}
        {leaderboard?.rankings && leaderboard.rankings.length >= 2 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
            {/* Rank 1 Gold */}
            {leaderboard.rankings[0] && (
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
                    <Crown size={16} /> 🥇 QUÁN QUÂN (#1)
                  </span>
                  <span style={{ background: 'rgba(56, 189, 248, 0.2)', color: '#38bdf8', fontSize: '0.7rem', fontWeight: 800, padding: '2px 6px', borderRadius: '4px' }}>
                    {leaderboard.rankings[0].tier_label}
                  </span>
                </div>
                <div style={{ fontWeight: 800, fontSize: '0.95rem', color: '#f8fafc' }}>
                  {leaderboard.rankings[0].bot_name}
                </div>
                <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                  {leaderboard.rankings[0].symbol} ({leaderboard.rankings[0].timeframe}) • Win Rate: <strong style={{ color: '#34d399' }}>{leaderboard.rankings[0].win_rate}%</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.3rem' }}>
                  <span style={{ fontSize: '0.72rem', color: '#64748b' }}>Quant Score:</span>
                  <strong style={{ color: '#fbbf24', fontSize: '1.1rem' }}>{leaderboard.rankings[0].composite_score} / 100</strong>
                </div>
              </div>
            )}

            {/* Rank 2 Silver */}
            {leaderboard.rankings[1] && (
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
                    🥈 Á QUÂN (#2)
                  </span>
                  <span style={{ background: 'rgba(245, 158, 11, 0.2)', color: '#fbbf24', fontSize: '0.7rem', fontWeight: 800, padding: '2px 6px', borderRadius: '4px' }}>
                    {leaderboard.rankings[1].tier_label}
                  </span>
                </div>
                <div style={{ fontWeight: 800, fontSize: '0.95rem', color: '#f8fafc' }}>
                  {leaderboard.rankings[1].bot_name}
                </div>
                <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                  {leaderboard.rankings[1].symbol} ({leaderboard.rankings[1].timeframe}) • Win Rate: <strong style={{ color: leaderboard.rankings[1].win_rate >= 50 ? '#34d399' : '#f87171' }}>{leaderboard.rankings[1].win_rate}%</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.3rem' }}>
                  <span style={{ fontSize: '0.72rem', color: '#64748b' }}>Quant Score:</span>
                  <strong style={{ color: '#cbd5e1', fontSize: '1.1rem' }}>{leaderboard.rankings[1].composite_score} / 100</strong>
                </div>
              </div>
            )}

            {/* Rank 3 Bronze */}
            {leaderboard.rankings[2] && (
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
                    🥉 HẠNG BA (#3)
                  </span>
                  <span style={{ background: 'rgba(148, 163, 184, 0.2)', color: '#94a3b8', fontSize: '0.7rem', fontWeight: 800, padding: '2px 6px', borderRadius: '4px' }}>
                    {leaderboard.rankings[2].tier_label}
                  </span>
                </div>
                <div style={{ fontWeight: 800, fontSize: '0.95rem', color: '#f8fafc' }}>
                  {leaderboard.rankings[2].bot_name}
                </div>
                <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                  {leaderboard.rankings[2].symbol} ({leaderboard.rankings[2].timeframe}) • Win Rate: <strong style={{ color: leaderboard.rankings[2].win_rate >= 50 ? '#34d399' : '#f87171' }}>{leaderboard.rankings[2].win_rate}%</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.3rem' }}>
                  <span style={{ fontSize: '0.72rem', color: '#64748b' }}>Quant Score:</span>
                  <strong style={{ color: '#f59e0b', fontSize: '1.1rem' }}>{leaderboard.rankings[2].composite_score} / 100</strong>
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
                    Đang nạp dữ liệu bảng xếp hạng...
                  </td>
                </tr>
              ) : leaderboard?.rankings && leaderboard.rankings.length > 0 ? (
                leaderboard.rankings.map((bot) => (
                  <tr
                    key={bot.bot_id}
                    style={{
                      borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
                      background: bot.rank === 1 ? 'rgba(245, 158, 11, 0.04)' : 'transparent'
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
                      <strong>{bot.total_trades}</strong> <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>({bot.total_wins}W - {bot.total_losses}L)</span>
                    </td>

                    {/* Win Rate */}
                    <td style={{ padding: '0.6rem', fontWeight: 700, color: bot.win_rate >= 50 ? '#34d399' : '#f87171' }}>
                      {bot.win_rate}%
                    </td>

                    {/* Profit Factor */}
                    <td style={{ padding: '0.6rem', color: bot.profit_factor >= 1.0 ? '#38bdf8' : '#f87171' }}>
                      {Number(bot.profit_factor).toFixed(2)}
                    </td>

                    {/* Total PnL */}
                    <td style={{ padding: '0.6rem', fontWeight: 700, color: bot.total_pnl_usd >= 0 ? '#34d399' : '#f87171' }}>
                      ${Number(bot.total_pnl_usd).toFixed(2)}
                      {bot.floating_pnl_usd !== 0 && (
                        <span style={{ fontSize: '0.7rem', color: bot.floating_pnl_usd > 0 ? '#34d399' : '#f87171', display: 'block' }}>
                          Float: {bot.floating_pnl_usd > 0 ? `+${bot.floating_pnl_usd}` : bot.floating_pnl_usd}
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
                    Chưa có dữ liệu bot nào trong hệ thống.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Intraday Multi-Account Chart & Accounts Layout */}
      <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
        <div style={{ flex: 2, minWidth: '340px', background: '#0b1120', padding: '1.5rem', borderRadius: '10px', border: '1px solid rgba(255, 255, 255, 0.08)', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <TrendingUp size={18} color="#38bdf8" /> Multi-Account Performance & Equity Curve
              </h2>
              <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                Biểu đồ so sánh hiệu suất từng tài khoản riêng biệt • Nhấn vào tên tài khoản trên Chú giải để bật/tắt
              </span>
            </div>

            {/* Metric Mode Switcher */}
            <div style={{ display: 'flex', background: 'rgba(15, 23, 42, 0.8)', padding: '2px', borderRadius: '6px', border: '1px solid #334155' }}>
              <button
                onClick={() => setChartMetric('daily')}
                style={{
                  background: chartMetric === 'daily' ? '#0284c7' : 'transparent',
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
                  background: chartMetric === 'cumulative' ? '#0284c7' : 'transparent',
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

        <div style={{ flex: 1, minWidth: '280px', background: '#0b1120', padding: '1.5rem', borderRadius: '10px', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
          <h2 style={{ marginTop: 0, fontSize: '1.05rem', fontWeight: 700, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <Layers size={18} color="#a855f7" /> Linked Accounts
          </h2>
          <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse', fontSize: '0.825rem' }}>
            <thead>
              <tr style={{ color: '#64748b', borderBottom: '1px solid rgba(255, 255, 255, 0.08)' }}>
                <th style={{ padding: '0.6rem 0' }}>Account ID</th>
                <th style={{ padding: '0.6rem 0' }}>Equity</th>
              </tr>
            </thead>
            <tbody>
              {data?.accounts ? (
                data.accounts.map((acc: any) => (
                  <tr key={acc.account_id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)' }}>
                    <td style={{ padding: '0.6rem 0', fontWeight: 600, color: '#38bdf8' }}>{acc.account_id}</td>
                    <td style={{ padding: '0.6rem 0', fontWeight: 700, color: '#f8fafc' }}>
                      ${acc.equity !== undefined ? acc.equity.toFixed(2) : '0.00'}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={2} style={{ color: '#64748b', padding: '1rem 0' }}>Không có tài khoản liên kết</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
