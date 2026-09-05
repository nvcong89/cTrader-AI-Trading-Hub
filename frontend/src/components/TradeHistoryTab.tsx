import { useState, useEffect } from 'react';
import axios from 'axios';
import { getApiBaseUrl } from '../config';
import { 
  History, 
  TrendingUp, 
  TrendingDown, 
  Search, 
  Download, 
  RefreshCw, 
  Award, 
  Target, 
  Scale, 
  DollarSign, 
  Calendar, 
  Layers, 
  Trash2,
  Zap,
  Cloud,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ChevronDown,
  ChevronUp,
  User,
  Activity,
  FileText,
  X
} from 'lucide-react';

interface TradeHistoryItem {
  id: number;
  ctrader_id?: number;
  account_id?: string;
  bot_id: string;
  symbol: string;
  side: string;
  volume: number;
  entry_price: number;
  exit_price: number;
  pnl: number;
  pnl_pips?: number;
  reason?: string;
  entry_time?: string;
  exit_time?: string;
}

interface HistoryStats {
  total_trades: number;
  total_wins: number;
  total_losses: number;
  win_rate: number;
  net_pnl: number;
  gross_profit: number;
  gross_loss: number;
  profit_factor: number;
  avg_pnl: number;
  avg_win?: number;
  avg_loss?: number;
  rr_ratio?: number;
  edge_usd?: number;
  edge_r?: number;
  edge_status?: string;
  max_win: number;
  max_loss: number;
}

interface GroupedStatsItem {
  symbol: string;
  account_id: string;
  bot_id: string;
  total_trades: number;
  total_wins: number;
  total_losses: number;
  win_rate: number;
  net_pnl: number;
  total_pnl_pips: number;
  gross_profit: number;
  gross_loss: number;
  profit_factor: number;
  avg_pnl: number;
  avg_win: number;
  avg_loss: number;
  rr_ratio: number;
  edge_usd: number;
  edge_r: number;
  edge_status: string;
}

interface ActiveReasonPopover {
  id: number;
  ctrader_id?: number;
  bot_id: string;
  symbol: string;
  reason: string;
  pnl: number;
}

interface TradeHistoryTabProps {
  isGuest?: boolean;
}

export default function TradeHistoryTab({ isGuest = false }: TradeHistoryTabProps) {
  const [trades, setTrades] = useState<TradeHistoryItem[]>([]);
  const [stats, setStats] = useState<HistoryStats | null>(null);
  const [groupedStats, setGroupedStats] = useState<GroupedStatsItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [syncingCloud, setSyncingCloud] = useState<boolean>(false);
  const [syncBanner, setSyncBanner] = useState<string | null>(null);

  // Floating Popover for Exit Reason
  const [activeReason, setActiveReason] = useState<ActiveReasonPopover | null>(null);

  // Filter States
  const [botFilter, setBotFilter] = useState<string>('ALL');
  const [symbolFilter, setSymbolFilter] = useState<string>('ALL');
  const [accountFilter, setAccountFilter] = useState<string>('ALL');
  const [timeFilter, setTimeFilter] = useState<number>(0); // 0 = all, 1 = today, 7 = 7d, 30 = 30d
  const [outcomeFilter, setOutcomeFilter] = useState<string>('ALL'); // ALL, WIN, LOSS
  const [search, setSearch] = useState<string>('');

  // UI View States
  const [showGroupedMatrix, setShowGroupedMatrix] = useState<boolean>(true);

  // Sorting States
  const [tableSortBy, setTableSortBy] = useState<string>('id');
  const [tableSortOrder, setTableSortOrder] = useState<'asc' | 'desc'>('desc');
  const [matrixSortBy, setMatrixSortBy] = useState<string>('edge_usd');
  const [matrixSortOrder, setMatrixSortOrder] = useState<'asc' | 'desc'>('desc');

  const fetchHistoryData = async () => {
    setRefreshing(true);
    try {
      const pagedParams: any = {
        sort_by: tableSortBy,
        order: tableSortOrder,
        limit: 250
      };
      if (botFilter !== 'ALL') pagedParams.bot_id = botFilter;
      if (symbolFilter !== 'ALL') pagedParams.symbol = symbolFilter;
      if (accountFilter !== 'ALL') pagedParams.account_id = accountFilter;
      if (timeFilter > 0) pagedParams.days = timeFilter;
      if (outcomeFilter !== 'ALL') pagedParams.outcome = outcomeFilter;
      if (search.trim()) pagedParams.search = search.trim();

      const statsParams: any = {};
      if (botFilter !== 'ALL') statsParams.bot_id = botFilter;
      if (symbolFilter !== 'ALL') statsParams.symbol = symbolFilter;
      if (accountFilter !== 'ALL') statsParams.account_id = accountFilter;
      if (timeFilter > 0) statsParams.days = timeFilter;

      const groupedParams: any = {
        sort_by: matrixSortBy,
        order: matrixSortOrder
      };
      if (botFilter !== 'ALL') groupedParams.bot_id = botFilter;
      if (symbolFilter !== 'ALL') groupedParams.symbol = symbolFilter;
      if (accountFilter !== 'ALL') groupedParams.account_id = accountFilter;
      if (timeFilter > 0) groupedParams.days = timeFilter;

      const [tradesRes, statsRes, groupedRes] = await Promise.all([
        axios.get(`${getApiBaseUrl()}/api/history`, { params: pagedParams, withCredentials: true }),
        axios.get(`${getApiBaseUrl()}/api/history/stats`, { params: statsParams, withCredentials: true }),
        axios.get(`${getApiBaseUrl()}/api/history/grouped-stats`, { params: groupedParams, withCredentials: true })
      ]);

      setTrades(tradesRes.data.trades || []);
      setStats(statsRes.data);
      setGroupedStats(groupedRes.data.groups || []);
    } catch (err: any) {
      console.error('Error fetching trade history:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchHistoryData();
  }, [botFilter, symbolFilter, accountFilter, timeFilter, outcomeFilter, tableSortBy, tableSortOrder, matrixSortBy, matrixSortOrder]);

  // Auto-close reason popover when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.reason-popover-cell')) {
        setActiveReason(null);
      }
    };
    if (activeReason) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [activeReason]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchHistoryData();
  };

  const handleTableSort = (column: string) => {
    if (tableSortBy === column) {
      setTableSortOrder(tableSortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setTableSortBy(column);
      setTableSortOrder('desc');
    }
  };

  const handleMatrixSort = (column: string) => {
    if (matrixSortBy === column) {
      setMatrixSortOrder(matrixSortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setMatrixSortBy(column);
      setMatrixSortOrder('desc');
    }
  };

  const handleExportCSV = () => {
    if (trades.length === 0) return;
    
    const headers = [
      'ID',
      'cTrader ID',
      'Bot ID',
      'Account',
      'Symbol',
      'Side',
      'Volume (Lots)',
      'Entry Price',
      'Exit Price',
      'PnL ($)',
      'PnL (Pips)',
      'Exit Reason',
      'Entry Time',
      'Exit Time'
    ];

    const rows = trades.map(t => [
      t.id,
      t.ctrader_id || '',
      t.bot_id || '',
      t.account_id || '',
      t.symbol || '',
      t.side || '',
      t.volume || '',
      t.entry_price || '',
      t.exit_price || '',
      t.pnl || '0.00',
      t.pnl_pips || '0.0',
      `"${(t.reason || '').replace(/"/g, '""')}"`,
      t.entry_time || '',
      t.exit_time || ''
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Trade_History_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleClearHistory = async () => {
    if (!window.confirm('Bạn có chắc chắn muốn xóa toàn bộ lịch sử lệnh đã đóng trong cơ sở dữ liệu không?')) {
      return;
    }
    try {
      await axios.post(`${getApiBaseUrl()}/api/history/clear`, {}, { withCredentials: true });
      fetchHistoryData();
    } catch (err: any) {
      alert('Lỗi khi xóa lịch sử: ' + err.message);
    }
  };

  const handleSyncCloudHistory = async () => {
    setSyncingCloud(true);
    setSyncBanner(null);
    try {
      const res = await axios.post(`${getApiBaseUrl()}/api/history/sync`, {}, { withCredentials: true });
      if (res.data.status === 'success') {
        setSyncBanner(res.data.message || `Đồng bộ thành công ${res.data.new_deals} lệnh mới!`);
      } else {
        setSyncBanner(res.data.message || 'Không có lệnh mới từ Cloud.');
      }
      fetchHistoryData();
    } catch (err: any) {
      console.error('Error syncing cloud trade history:', err);
      setSyncBanner('Lỗi đồng bộ Cloud: ' + (err.response?.data?.detail || err.message));
    } finally {
      setSyncingCloud(false);
      setTimeout(() => setSyncBanner(null), 6000);
    }
  };

  const formatDuration = (entry?: string, exit?: string) => {
    if (!entry || !exit) return '-';
    const d1 = new Date(entry).getTime();
    const d2 = new Date(exit).getTime();
    if (isNaN(d1) || isNaN(d2)) return '-';
    const diffMs = Math.abs(d2 - d1);
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 60) return `${diffMins}m`;
    const diffHours = Math.floor(diffMins / 60);
    const remMins = diffMins % 60;
    return `${diffHours}h ${remMins}m`;
  };

  // Collect unique options dynamically
  const uniqueBots = Array.from(new Set(trades.map(t => t.bot_id).filter(Boolean)));
  const uniqueSymbols = Array.from(new Set(trades.map(t => t.symbol).filter(Boolean)));
  const uniqueAccounts = Array.from(new Set(trades.map(t => String(t.account_id || '')).filter(Boolean)));

  const positiveEdgeCount = groupedStats.filter(g => g.edge_usd > 0).length;

  if (loading) {
    return <div style={{ color: '#94a3b8', padding: '2rem' }}>Đang tải dữ liệu Sổ Lệnh Lịch Sử & Ma Trận Định Lượng...</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', maxWidth: '1400px' }}>
      {/* 1. Header Banner */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.9) 0%, rgba(15, 23, 42, 0.95) 100%)',
        padding: '1.2rem',
        borderRadius: '12px',
        border: '1px solid #334155',
        display: 'flex',
        flexWrap: 'wrap',
        gap: '1rem',
        justifyContent: 'space-between',
        alignItems: 'center',
        boxShadow: '0 4px 20px rgba(0,0,0,0.3)'
      }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.4rem', color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <History size={26} color="#38bdf8" /> Sổ Lệnh Đã Đóng & Ma Trận Định Lượng (Quant Edge)
          </h1>
          <p style={{ margin: '0.3rem 0 0 0', color: '#94a3b8', fontSize: '0.85rem' }}>
            Phân tích chuyên sâu lịch sử giao dịch: Sắp xếp theo <strong>Symbol + Tài khoản + Bot</strong>, tự động đánh giá Win Rate, PnL, Profit Factor và Kỳ vọng toán học (Edge).
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
          <button
            onClick={handleSyncCloudHistory}
            disabled={syncingCloud}
            title="Đồng bộ toàn bộ lịch sử khớp lệnh đã đóng từ cTrader Cloud Open API"
            style={{
              background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
              color: '#ffffff',
              border: '1px solid rgba(56, 189, 248, 0.4)',
              borderRadius: '8px',
              padding: '0.5rem 0.85rem',
              fontSize: '0.85rem',
              fontWeight: 600,
              cursor: syncingCloud ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              boxShadow: '0 2px 8px rgba(2, 132, 199, 0.25)'
            }}
          >
            <Cloud size={15} className={syncingCloud ? 'animate-spin' : ''} />
            {syncingCloud ? 'Đang đồng bộ...' : 'Đồng bộ Cloud'}
          </button>

          <button
            onClick={fetchHistoryData}
            disabled={refreshing}
            style={{
              background: '#1e293b',
              color: '#94a3b8',
              border: '1px solid #334155',
              borderRadius: '8px',
              padding: '0.5rem 0.85rem',
              fontSize: '0.85rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem'
            }}
          >
            <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} /> Làm Mới
          </button>
          
          <button
            onClick={handleExportCSV}
            disabled={trades.length === 0}
            style={{
              background: '#0284c7',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              padding: '0.5rem 1rem',
              fontWeight: 600,
              fontSize: '0.85rem',
              cursor: trades.length === 0 ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              boxShadow: '0 2px 10px rgba(2, 132, 199, 0.3)'
            }}
          >
            <Download size={15} /> Xuất CSV
          </button>
        </div>
      </div>

      {/* Sync Status Banner */}
      {syncBanner && (
        <div style={{
          background: syncBanner.includes('Lỗi') ? 'rgba(239, 68, 68, 0.15)' : 'rgba(14, 165, 233, 0.15)',
          border: syncBanner.includes('Lỗi') ? '1px solid #ef4444' : '1px solid #0284c7',
          color: syncBanner.includes('Lỗi') ? '#fca5a5' : '#7dd3fc',
          padding: '0.75rem 1rem',
          borderRadius: '8px',
          fontSize: '0.88rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          boxShadow: '0 2px 10px rgba(0,0,0,0.2)'
        }}>
          <Cloud size={16} />
          <span>{syncBanner}</span>
        </div>
      )}

      {/* 2. KPI Metrics Bar (5 Metric Cards including Edge) */}
      {stats && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
          gap: '0.75rem'
        }}>
          {/* Net Profit */}
          <div style={{
            background: '#1e293b',
            border: '1px solid #334155',
            borderRadius: '10px',
            padding: '1.2rem',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.82rem', color: '#94a3b8', fontWeight: 600 }}>TỔNG LỢI NHUẬN RÒNG</span>
              <DollarSign size={18} color={stats.net_pnl >= 0 ? '#10b981' : '#ef4444'} />
            </div>
            <div style={{ marginTop: '0.6rem' }}>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: stats.net_pnl >= 0 ? '#10b981' : '#ef4444' }}>
                {stats.net_pnl >= 0 ? `+$${stats.net_pnl.toFixed(2)}` : `-$${Math.abs(stats.net_pnl).toFixed(2)}`}
              </div>
              <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '2px' }}>
                Gross: +${stats.gross_profit.toFixed(2)} / -${stats.gross_loss.toFixed(2)}
              </div>
            </div>
          </div>

          {/* Win Rate */}
          <div style={{
            background: '#1e293b',
            border: '1px solid #334155',
            borderRadius: '10px',
            padding: '1.2rem',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.82rem', color: '#94a3b8', fontWeight: 600 }}>TỶ LỆ THẮNG (WIN RATE)</span>
              <Award size={18} color="#38bdf8" />
            </div>
            <div style={{ marginTop: '0.6rem' }}>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#38bdf8' }}>
                {stats.win_rate.toFixed(1)}%
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', fontSize: '0.72rem', marginTop: '2px' }}>
                <span style={{ color: '#10b981' }}>{stats.total_wins} Thắng</span>
                <span style={{ color: '#64748b' }}>/</span>
                <span style={{ color: '#ef4444' }}>{stats.total_losses} Thua</span>
              </div>
            </div>
          </div>

          {/* Profit Factor */}
          <div style={{
            background: '#1e293b',
            border: '1px solid #334155',
            borderRadius: '10px',
            padding: '1.2rem',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.82rem', color: '#94a3b8', fontWeight: 600 }}>PROFIT FACTOR (PF)</span>
              <Scale size={18} color="#a855f7" />
            </div>
            <div style={{ marginTop: '0.6rem' }}>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: stats.profit_factor >= 1.5 ? '#10b981' : stats.profit_factor >= 1.0 ? '#fde047' : '#ef4444' }}>
                {stats.profit_factor.toFixed(2)}
              </div>
              <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '2px' }}>
                {stats.profit_factor >= 1.5 ? '⭐ Rất tốt (>1.5)' : stats.profit_factor >= 1.0 ? '🟡 Hòa vốn (>1.0)' : '🔴 Rủi ro (<1.0)'}
              </div>
            </div>
          </div>

          {/* Mathematical Edge */}
          <div style={{
            background: '#1e293b',
            border: `1px solid ${(stats.edge_usd || 0) > 0 ? '#10b98140' : (stats.edge_usd || 0) < 0 ? '#ef444440' : '#334155'}`,
            borderRadius: '10px',
            padding: '1.2rem',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.82rem', color: '#94a3b8', fontWeight: 600 }}>KỲ VỌNG TOÁN HỌC (EDGE)</span>
              <Zap size={18} color={(stats.edge_usd || 0) > 0 ? '#10b981' : (stats.edge_usd || 0) < 0 ? '#ef4444' : '#94a3b8'} />
            </div>
            <div style={{ marginTop: '0.6rem' }}>
              <div style={{
                fontSize: '1.5rem',
                fontWeight: 800,
                color: (stats.edge_usd || 0) > 0 ? '#10b981' : (stats.edge_usd || 0) < 0 ? '#ef4444' : '#94a3b8'
              }}>
                {(stats.edge_usd || 0) >= 0 ? `+$${(stats.edge_usd || 0).toFixed(2)}` : `-$${Math.abs(stats.edge_usd || 0).toFixed(2)}`}
                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8', marginLeft: '4px' }}>/lệnh</span>
              </div>
              <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '2px' }}>
                Edge R: {(stats.edge_r || 0) >= 0 ? `+${(stats.edge_r || 0).toFixed(2)}R` : `${(stats.edge_r || 0).toFixed(2)}R`} | R:R ~{(stats.rr_ratio || 1.0).toFixed(1)}
              </div>
            </div>
          </div>

          {/* Total Trades */}
          <div style={{
            background: '#1e293b',
            border: '1px solid #334155',
            borderRadius: '10px',
            padding: '1.2rem',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.82rem', color: '#94a3b8', fontWeight: 600 }}>TỔNG LỆNH ĐÃ ĐÓNG</span>
              <Target size={18} color="#f59e0b" />
            </div>
            <div style={{ marginTop: '0.6rem' }}>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#f8fafc' }}>
                {stats.total_trades}
              </div>
              <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '2px' }}>
                TB: {stats.avg_pnl >= 0 ? `+$${stats.avg_pnl.toFixed(2)}` : `-$${Math.abs(stats.avg_pnl).toFixed(2)}`}/lệnh
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 3. Filter & Search Toolbar */}
      <div style={{
        background: '#1e293b',
        padding: '1.2rem',
        borderRadius: '10px',
        border: '1px solid #334155',
        display: 'flex',
        flexWrap: 'wrap',
        gap: '0.8rem',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem', alignItems: 'center' }}>
          {/* Symbol Filter */}
          <div>
            <select
              value={symbolFilter}
              onChange={(e) => setSymbolFilter(e.target.value)}
              style={{
                background: '#0f172a',
                border: '1px solid #334155',
                borderRadius: '6px',
                padding: '0.5rem 0.8rem',
                color: 'white',
                fontSize: '0.85rem',
                outline: 'none'
              }}
            >
              <option value="ALL">🌐 Tất Cả Cặp Tiền</option>
              {uniqueSymbols.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          {/* Account Filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <User size={15} color="#94a3b8" />
            <select
              value={accountFilter}
              onChange={(e) => setAccountFilter(e.target.value)}
              style={{
                background: '#0f172a',
                border: '1px solid #334155',
                borderRadius: '6px',
                padding: '0.5rem 0.8rem',
                color: 'white',
                fontSize: '0.85rem',
                outline: 'none'
              }}
            >
              <option value="ALL">👤 Tất Cả Tài Khoản</option>
              {uniqueAccounts.map(a => (
                <option key={a} value={a}>Acc #{a}</option>
              ))}
            </select>
          </div>

          {/* Bot Filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <Layers size={15} color="#94a3b8" />
            <select
              value={botFilter}
              onChange={(e) => setBotFilter(e.target.value)}
              style={{
                background: '#0f172a',
                border: '1px solid #334155',
                borderRadius: '6px',
                padding: '0.5rem 0.8rem',
                color: 'white',
                fontSize: '0.85rem',
                outline: 'none'
              }}
            >
              <option value="ALL">🤖 Tất Cả Bot</option>
              {uniqueBots.map(b => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </div>

          {/* Time Filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <Calendar size={15} color="#94a3b8" />
            <select
              value={timeFilter}
              onChange={(e) => setTimeFilter(Number(e.target.value))}
              style={{
                background: '#0f172a',
                border: '1px solid #334155',
                borderRadius: '6px',
                padding: '0.5rem 0.8rem',
                color: 'white',
                fontSize: '0.85rem',
                outline: 'none'
              }}
            >
              <option value={0}>Toàn Bộ Lịch Sử</option>
              <option value={1}>Hôm Nay (Today)</option>
              <option value={7}>7 Ngày Qua</option>
              <option value={30}>30 Ngày Qua</option>
            </select>
          </div>

          {/* Outcome Filter */}
          <div>
            <select
              value={outcomeFilter}
              onChange={(e) => setOutcomeFilter(e.target.value)}
              style={{
                background: '#0f172a',
                border: '1px solid #334155',
                borderRadius: '6px',
                padding: '0.5rem 0.8rem',
                color: 'white',
                fontSize: '0.85rem',
                outline: 'none'
              }}
            >
              <option value="ALL">Tất Cả Kết Quả</option>
              <option value="WIN">🟢 Chỉ Lệnh Thắng</option>
              <option value="LOSS">🔴 Chỉ Lệnh Thua</option>
            </select>
          </div>
        </div>

        {/* Search Bar & Reset */}
        <form onSubmit={handleSearchSubmit} style={{ display: 'flex', gap: '0.5rem', minWidth: '240px' }}>
          <div style={{ position: 'relative', width: '100%' }}>
            <input
              type="text"
              placeholder="Tìm symbol, bot, account, reason..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: '100%',
                background: '#0f172a',
                border: '1px solid #334155',
                borderRadius: '6px',
                padding: '0.5rem 2rem 0.5rem 0.8rem',
                color: 'white',
                fontSize: '0.85rem',
                outline: 'none'
              }}
            />
            <button
              type="submit"
              style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
            >
              <Search size={15} />
            </button>
          </div>

          <button
            type="button"
            onClick={() => !isGuest && handleClearHistory()}
            disabled={isGuest}
            title={isGuest ? "Chế độ Guest chỉ xem (View-Only)" : "Xóa toàn bộ lịch sử trong database"}
            style={{
              background: '#0f172a',
              border: '1px solid #ef444440',
              color: isGuest ? '#64748b' : '#ef4444',
              borderRadius: '6px',
              padding: '0.5rem 0.8rem',
              cursor: isGuest ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              opacity: isGuest ? 0.4 : 1
            }}
          >
            <Trash2 size={15} />
          </button>
        </form>
      </div>

      {/* 4. Grouped Quant Edge Matrix Table (Symbol × Account × Bot) */}
      <div style={{
        background: '#1e293b',
        borderRadius: '10px',
        border: '1px solid #334155',
        overflow: 'hidden',
        boxShadow: '0 4px 20px rgba(0,0,0,0.2)'
      }}>
        {/* Collapsible Header */}
        <div 
          onClick={() => setShowGroupedMatrix(!showGroupedMatrix)}
          style={{
            background: 'linear-gradient(90deg, #0f172a 0%, #1e293b 100%)',
            padding: '1rem 1.2rem',
            borderBottom: showGroupedMatrix ? '1px solid #334155' : 'none',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            cursor: 'pointer',
            userSelect: 'none'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <Activity size={20} color="#38bdf8" />
            <h2 style={{ margin: 0, fontSize: '1.05rem', color: '#f8fafc', fontWeight: 700 }}>
              Ma Trận Định Lượng Phân Nhóm (Grouped Quant Edge Matrix: Symbol × Account × Bot)
            </h2>
            <span style={{
              background: '#0284c720',
              border: '1px solid #0284c750',
              color: '#38bdf8',
              padding: '2px 8px',
              borderRadius: '12px',
              fontSize: '0.75rem',
              fontWeight: 600
            }}>
              {groupedStats.length} nhóm ({positiveEdgeCount} nhóm Edge dương)
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#94a3b8', fontSize: '0.85rem' }}>
            <span>{showGroupedMatrix ? 'Thu gọn' : 'Mở rộng bảng nhóm'}</span>
            {showGroupedMatrix ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </div>
        </div>

        {showGroupedMatrix && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.86rem' }}>
              <thead>
                <tr style={{ background: '#0f172a', borderBottom: '1px solid #334155', color: '#94a3b8', fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  <th onClick={() => handleMatrixSort('symbol')} style={{ padding: '0.8rem 1rem', cursor: 'pointer' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                      Cặp Tiền {matrixSortBy === 'symbol' ? (matrixSortOrder === 'asc' ? <ArrowUp size={13} color="#38bdf8" /> : <ArrowDown size={13} color="#38bdf8" />) : <ArrowUpDown size={12} opacity={0.4} />}
                    </div>
                  </th>
                  <th onClick={() => handleMatrixSort('account_id')} style={{ padding: '0.8rem 1rem', cursor: 'pointer' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                      Tài Khoản {matrixSortBy === 'account_id' ? (matrixSortOrder === 'asc' ? <ArrowUp size={13} color="#38bdf8" /> : <ArrowDown size={13} color="#38bdf8" />) : <ArrowUpDown size={12} opacity={0.4} />}
                    </div>
                  </th>
                  <th onClick={() => handleMatrixSort('bot_id')} style={{ padding: '0.8rem 1rem', cursor: 'pointer' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                      Nguồn Bot {matrixSortBy === 'bot_id' ? (matrixSortOrder === 'asc' ? <ArrowUp size={13} color="#38bdf8" /> : <ArrowDown size={13} color="#38bdf8" />) : <ArrowUpDown size={12} opacity={0.4} />}
                    </div>
                  </th>
                  <th onClick={() => handleMatrixSort('total_trades')} style={{ padding: '0.8rem 1rem', cursor: 'pointer' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                      Số Lệnh {matrixSortBy === 'total_trades' ? (matrixSortOrder === 'asc' ? <ArrowUp size={13} color="#38bdf8" /> : <ArrowDown size={13} color="#38bdf8" />) : <ArrowUpDown size={12} opacity={0.4} />}
                    </div>
                  </th>
                  <th onClick={() => handleMatrixSort('win_rate')} style={{ padding: '0.8rem 1rem', cursor: 'pointer' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                      Win Rate {matrixSortBy === 'win_rate' ? (matrixSortOrder === 'asc' ? <ArrowUp size={13} color="#38bdf8" /> : <ArrowDown size={13} color="#38bdf8" />) : <ArrowUpDown size={12} opacity={0.4} />}
                    </div>
                  </th>
                  <th onClick={() => handleMatrixSort('net_pnl')} style={{ padding: '0.8rem 1rem', cursor: 'pointer' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                      Net PnL ($) {matrixSortBy === 'net_pnl' ? (matrixSortOrder === 'asc' ? <ArrowUp size={13} color="#38bdf8" /> : <ArrowDown size={13} color="#38bdf8" />) : <ArrowUpDown size={12} opacity={0.4} />}
                    </div>
                  </th>
                  <th onClick={() => handleMatrixSort('profit_factor')} style={{ padding: '0.8rem 1rem', cursor: 'pointer' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                      Profit Factor {matrixSortBy === 'profit_factor' ? (matrixSortOrder === 'asc' ? <ArrowUp size={13} color="#38bdf8" /> : <ArrowDown size={13} color="#38bdf8" />) : <ArrowUpDown size={12} opacity={0.4} />}
                    </div>
                  </th>
                  <th style={{ padding: '0.8rem 1rem' }}>Avg Win / Avg Loss</th>
                  <th onClick={() => handleMatrixSort('edge_usd')} style={{ padding: '0.8rem 1rem', cursor: 'pointer', background: 'rgba(56, 189, 248, 0.05)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', color: '#38bdf8', fontWeight: 700 }}>
                      ⚡ Edge ($/lệnh) {matrixSortBy === 'edge_usd' ? (matrixSortOrder === 'asc' ? <ArrowUp size={13} color="#38bdf8" /> : <ArrowDown size={13} color="#38bdf8" />) : <ArrowUpDown size={12} opacity={0.4} />}
                    </div>
                  </th>
                  <th onClick={() => handleMatrixSort('edge_r')} style={{ padding: '0.8rem 1rem', cursor: 'pointer' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                      Edge (R) {matrixSortBy === 'edge_r' ? (matrixSortOrder === 'asc' ? <ArrowUp size={13} color="#38bdf8" /> : <ArrowDown size={13} color="#38bdf8" />) : <ArrowUpDown size={12} opacity={0.4} />}
                    </div>
                  </th>
                  <th style={{ padding: '0.8rem 1rem' }}>Đánh Giá Lợi Thế</th>
                </tr>
              </thead>
              <tbody>
                {groupedStats.length === 0 ? (
                  <tr>
                    <td colSpan={11} style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>
                      Không có nhóm giao dịch nào khớp với bộ lọc hiện tại.
                    </td>
                  </tr>
                ) : (
                  groupedStats.map((g, idx) => {
                    const hasPositiveEdge = g.edge_usd > 0;
                    const hasNegativeEdge = g.edge_usd < 0;

                    return (
                      <tr 
                        key={idx}
                        style={{
                          borderBottom: '1px solid #334155',
                          background: hasPositiveEdge ? 'rgba(16, 185, 129, 0.03)' : hasNegativeEdge ? 'rgba(239, 68, 68, 0.03)' : 'transparent',
                          transition: 'background 0.2s ease'
                        }}
                      >
                        {/* Symbol */}
                        <td style={{ padding: '0.8rem 1rem', fontWeight: 700, color: '#f8fafc' }}>
                          {g.symbol}
                        </td>

                        {/* Account */}
                        <td style={{ padding: '0.8rem 1rem', color: '#cbd5e1' }}>
                          <span style={{ background: '#0f172a', border: '1px solid #334155', padding: '2px 6px', borderRadius: '4px', fontSize: '0.78rem' }}>
                            #{g.account_id}
                          </span>
                        </td>

                        {/* Bot */}
                        <td style={{ padding: '0.8rem 1rem' }}>
                          <span style={{ color: '#38bdf8', fontWeight: 600 }}>
                            {g.bot_id}
                          </span>
                        </td>

                        {/* Total Trades */}
                        <td style={{ padding: '0.8rem 1rem', color: '#cbd5e1' }}>
                          <span style={{ fontWeight: 600 }}>{g.total_trades}</span>
                          <span style={{ fontSize: '0.75rem', color: '#64748b', marginLeft: '4px' }}>
                            ({g.total_wins}W/{g.total_losses}L)
                          </span>
                        </td>

                        {/* Win Rate */}
                        <td style={{ padding: '0.8rem 1rem' }}>
                          <span style={{
                            fontWeight: 700,
                            color: g.win_rate >= 60 ? '#10b981' : g.win_rate >= 45 ? '#fde047' : '#ef4444'
                          }}>
                            {g.win_rate.toFixed(1)}%
                          </span>
                        </td>

                        {/* Net PnL */}
                        <td style={{ padding: '0.8rem 1rem' }}>
                          <span style={{
                            fontWeight: 800,
                            color: g.net_pnl >= 0 ? '#10b981' : '#ef4444'
                          }}>
                            {g.net_pnl >= 0 ? `+$${g.net_pnl.toFixed(2)}` : `-$${Math.abs(g.net_pnl).toFixed(2)}`}
                          </span>
                          {g.total_pnl_pips !== 0 && (
                            <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
                              {g.total_pnl_pips >= 0 ? `+${g.total_pnl_pips}p` : `${g.total_pnl_pips}p`}
                            </div>
                          )}
                        </td>

                        {/* Profit Factor */}
                        <td style={{ padding: '0.8rem 1rem' }}>
                          <span style={{
                            fontWeight: 700,
                            color: g.profit_factor >= 1.5 ? '#10b981' : g.profit_factor >= 1.0 ? '#fde047' : '#ef4444'
                          }}>
                            {g.profit_factor.toFixed(2)}
                          </span>
                        </td>

                        {/* Avg Win / Avg Loss */}
                        <td style={{ padding: '0.8rem 1rem', fontSize: '0.78rem', color: '#cbd5e1' }}>
                          <span style={{ color: '#10b981' }}>+${g.avg_win.toFixed(2)}</span>
                          <span style={{ color: '#64748b', margin: '0 4px' }}>/</span>
                          <span style={{ color: '#ef4444' }}>-${g.avg_loss.toFixed(2)}</span>
                        </td>

                        {/* Edge ($/trade) */}
                        <td style={{ padding: '0.8rem 1rem', background: 'rgba(56, 189, 248, 0.04)' }}>
                          <div style={{
                            fontWeight: 800,
                            fontSize: '0.92rem',
                            color: hasPositiveEdge ? '#10b981' : hasNegativeEdge ? '#ef4444' : '#94a3b8'
                          }}>
                            {g.edge_usd >= 0 ? `+$${g.edge_usd.toFixed(2)}` : `-$${Math.abs(g.edge_usd).toFixed(2)}`}
                          </div>
                        </td>

                        {/* Edge (R) */}
                        <td style={{ padding: '0.8rem 1rem' }}>
                          <span style={{
                            fontWeight: 700,
                            color: g.edge_r >= 0 ? '#38bdf8' : '#f87171'
                          }}>
                            {g.edge_r >= 0 ? `+${g.edge_r.toFixed(2)}R` : `${g.edge_r.toFixed(2)}R`}
                          </span>
                        </td>

                        {/* Edge Status Badge */}
                        <td style={{ padding: '0.8rem 1rem' }}>
                          {hasPositiveEdge ? (
                            <span style={{
                              background: 'rgba(16, 185, 129, 0.15)',
                              color: '#34d399',
                              border: '1px solid rgba(16, 185, 129, 0.3)',
                              padding: '2px 8px',
                              borderRadius: '4px',
                              fontSize: '0.75rem',
                              fontWeight: 700
                            }}>
                              ⭐ Lợi Thế Dương
                            </span>
                          ) : hasNegativeEdge ? (
                            <span style={{
                              background: 'rgba(239, 68, 68, 0.15)',
                              color: '#f87171',
                              border: '1px solid rgba(239, 68, 68, 0.3)',
                              padding: '2px 8px',
                              borderRadius: '4px',
                              fontSize: '0.75rem',
                              fontWeight: 700
                            }}>
                              🔴 Lợi Thế Âm
                            </span>
                          ) : (
                            <span style={{
                              background: 'rgba(148, 163, 184, 0.15)',
                              color: '#94a3b8',
                              padding: '2px 8px',
                              borderRadius: '4px',
                              fontSize: '0.75rem'
                            }}>
                              ⚪ Hòa Vốn
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 5. Detailed Trade History Matrix Table */}
      <div style={{
        background: '#1e293b',
        borderRadius: '10px',
        border: '1px solid #334155',
        overflow: 'hidden',
        boxShadow: '0 4px 20px rgba(0,0,0,0.2)'
      }}>
        <div style={{
          padding: '1rem 1.2rem',
          background: '#0f172a',
          borderBottom: '1px solid #334155',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <h2 style={{ margin: 0, fontSize: '1.05rem', color: '#f8fafc', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Layers size={18} color="#38bdf8" /> Sổ Lệnh Chi Tiết ({trades.length} lệnh hiển thị)
          </h2>
          <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
            Nhấp vào tiêu đề cột để sắp xếp (Sort)
          </span>
        </div>

        <div style={{ overflowX: 'auto', borderRadius: '0 0 10px 10px' }}>
          <table style={{ width: '100%', tableLayout: 'fixed', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.78rem' }}>
            <colgroup>
              <col style={{ width: '8%' }} />   {/* Mã Lệnh */}
              <col style={{ width: '14%' }} />  {/* Nguồn Bot */}
              <col style={{ width: '9%' }} />   {/* Tài Khoản */}
              <col style={{ width: '8%' }} />   {/* Cặp Tiền */}
              <col style={{ width: '8%' }} />   {/* Loại Lệnh */}
              <col style={{ width: '7%' }} />   {/* Khối Lượng */}
              <col style={{ width: '15%' }} />  {/* Giá Vào ➔ Đóng */}
              <col style={{ width: '13%' }} />  {/* Lợi Nhuận */}
              <col style={{ width: '6%' }} />   {/* Lý Do */}
              <col style={{ width: '13%' }} />  {/* Thời Gian Đóng */}
            </colgroup>
            <thead>
              <tr style={{ background: '#0f172a', borderBottom: '1px solid #334155', color: '#94a3b8', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                <th onClick={() => handleTableSort('id')} style={{ padding: '0.65rem 0.6rem', cursor: 'pointer' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    Mã Lệnh {tableSortBy === 'id' ? (tableSortOrder === 'asc' ? <ArrowUp size={12} color="#38bdf8" /> : <ArrowDown size={12} color="#38bdf8" />) : <ArrowUpDown size={11} opacity={0.4} />}
                  </div>
                </th>
                <th onClick={() => handleTableSort('bot_id')} style={{ padding: '0.65rem 0.6rem', cursor: 'pointer' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    Nguồn Bot {tableSortBy === 'bot_id' ? (tableSortOrder === 'asc' ? <ArrowUp size={12} color="#38bdf8" /> : <ArrowDown size={12} color="#38bdf8" />) : <ArrowUpDown size={11} opacity={0.4} />}
                  </div>
                </th>
                <th onClick={() => handleTableSort('account_id')} style={{ padding: '0.65rem 0.6rem', cursor: 'pointer' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    Tài Khoản {tableSortBy === 'account_id' ? (tableSortOrder === 'asc' ? <ArrowUp size={12} color="#38bdf8" /> : <ArrowDown size={12} color="#38bdf8" />) : <ArrowUpDown size={11} opacity={0.4} />}
                  </div>
                </th>
                <th onClick={() => handleTableSort('symbol')} style={{ padding: '0.65rem 0.6rem', cursor: 'pointer' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    Cặp Tiền {tableSortBy === 'symbol' ? (tableSortOrder === 'asc' ? <ArrowUp size={12} color="#38bdf8" /> : <ArrowDown size={12} color="#38bdf8" />) : <ArrowUpDown size={11} opacity={0.4} />}
                  </div>
                </th>
                <th onClick={() => handleTableSort('side')} style={{ padding: '0.65rem 0.6rem', cursor: 'pointer' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    Loại Lệnh {tableSortBy === 'side' ? (tableSortOrder === 'asc' ? <ArrowUp size={12} color="#38bdf8" /> : <ArrowDown size={12} color="#38bdf8" />) : <ArrowUpDown size={11} opacity={0.4} />}
                  </div>
                </th>
                <th onClick={() => handleTableSort('volume')} style={{ padding: '0.65rem 0.6rem', cursor: 'pointer' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    Lot {tableSortBy === 'volume' ? (tableSortOrder === 'asc' ? <ArrowUp size={12} color="#38bdf8" /> : <ArrowDown size={12} color="#38bdf8" />) : <ArrowUpDown size={11} opacity={0.4} />}
                  </div>
                </th>
                <th style={{ padding: '0.65rem 0.6rem' }}>Giá Vào ➔ Đóng</th>
                <th onClick={() => handleTableSort('pnl')} style={{ padding: '0.65rem 0.6rem', cursor: 'pointer' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    Lợi Nhuận {tableSortBy === 'pnl' ? (tableSortOrder === 'asc' ? <ArrowUp size={12} color="#38bdf8" /> : <ArrowDown size={12} color="#38bdf8" />) : <ArrowUpDown size={11} opacity={0.4} />}
                  </div>
                </th>
                <th style={{ padding: '0.65rem 0.4rem', textAlign: 'center' }}>Lý Do</th>
                <th onClick={() => handleTableSort('exit_time')} style={{ padding: '0.65rem 0.6rem', cursor: 'pointer' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    Thời Gian Đóng {tableSortBy === 'exit_time' ? (tableSortOrder === 'asc' ? <ArrowUp size={12} color="#38bdf8" /> : <ArrowDown size={12} color="#38bdf8" />) : <ArrowUpDown size={11} opacity={0.4} />}
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              {trades.length === 0 ? (
                <tr>
                  <td colSpan={10} style={{ textAlign: 'center', padding: '2.5rem', color: '#64748b' }}>
                    Chưa có lịch sử giao dịch nào khớp với bộ lọc.
                  </td>
                </tr>
              ) : (
                trades.map((t, idx) => {
                  const isBuy = t.side?.toUpperCase() === 'BUY';
                  const isWin = (t.pnl || 0) > 0;
                  const isLoss = (t.pnl || 0) < 0;

                  return (
                    <tr 
                      key={t.id || idx}
                      style={{
                        borderBottom: '1px solid #334155',
                        background: isWin ? 'rgba(16, 185, 129, 0.02)' : isLoss ? 'rgba(239, 68, 68, 0.02)' : 'transparent',
                        transition: 'background 0.15s ease'
                      }}
                    >
                      {/* 1. Mã Lệnh */}
                      <td style={{ padding: '0.55rem 0.6rem', fontWeight: 600, color: '#f8fafc', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        #{t.ctrader_id || t.id}
                      </td>

                      {/* 2. Nguồn Bot */}
                      <td style={{ padding: '0.55rem 0.6rem', overflow: 'hidden' }}>
                        <span 
                          title={t.bot_id || 'Manual'}
                          style={{
                            background: '#0f172a',
                            border: '1px solid #334155',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            fontSize: '0.74rem',
                            color: '#38bdf8',
                            fontWeight: 600,
                            display: 'block',
                            textOverflow: 'ellipsis',
                            overflow: 'hidden',
                            whiteSpace: 'nowrap'
                          }}
                        >
                          {t.bot_id || 'Manual'}
                        </span>
                      </td>

                      {/* 3. Tài Khoản */}
                      <td style={{ padding: '0.55rem 0.6rem', color: '#cbd5e1', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        <span style={{ background: '#0f172a', border: '1px solid #334155', padding: '1px 5px', borderRadius: '4px', fontSize: '0.74rem' }}>
                          #{t.account_id || 'N/A'}
                        </span>
                      </td>

                      {/* 4. Cặp Tiền */}
                      <td style={{ padding: '0.55rem 0.6rem', fontWeight: 700, color: '#f8fafc', whiteSpace: 'nowrap' }}>
                        {t.symbol}
                      </td>

                      {/* 5. Loại Lệnh */}
                      <td style={{ padding: '0.55rem 0.6rem', whiteSpace: 'nowrap' }}>
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.2rem',
                          padding: '1px 6px',
                          borderRadius: '4px',
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          background: isBuy ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                          color: isBuy ? '#34d399' : '#f87171'
                        }}>
                          {isBuy ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                          {t.side}
                        </span>
                      </td>

                      {/* 6. Khối Lượng */}
                      <td style={{ padding: '0.55rem 0.6rem', color: '#cbd5e1', whiteSpace: 'nowrap' }}>
                        {t.volume}
                      </td>

                      {/* 7. Giá Vào ➔ Giá Đóng (Gộp) */}
                      <td style={{ padding: '0.55rem 0.6rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.76rem', color: '#cbd5e1' }}>
                          <span>{t.entry_price?.toFixed(2) || '-'}</span>
                          <span style={{ color: '#64748b' }}>➔</span>
                          <span style={{ fontWeight: 600, color: '#f8fafc' }}>{t.exit_price?.toFixed(2) || '-'}</span>
                        </div>
                      </td>

                      {/* 8. Lợi Nhuận ($ / pips) */}
                      <td style={{ padding: '0.55rem 0.6rem', whiteSpace: 'nowrap' }}>
                        <div style={{
                          fontWeight: 800,
                          fontSize: '0.82rem',
                          color: isWin ? '#10b981' : isLoss ? '#ef4444' : '#94a3b8',
                          display: 'flex',
                          alignItems: 'baseline',
                          gap: '0.25rem'
                        }}>
                          <span>{t.pnl >= 0 ? `+$${t.pnl.toFixed(2)}` : `-$${Math.abs(t.pnl).toFixed(2)}`}</span>
                          {t.pnl_pips !== undefined && t.pnl_pips !== null && (
                            <span style={{ fontSize: '0.68rem', color: '#64748b', fontWeight: 500 }}>
                              ({t.pnl_pips >= 0 ? `+${t.pnl_pips.toFixed(1)}p` : `${t.pnl_pips.toFixed(1)}p`})
                            </span>
                          )}
                        </div>
                      </td>

                      {/* 9. Lý Do Popover Trigger Cell */}
                      <td className="reason-popover-cell" style={{ padding: '0.55rem 0.4rem', textAlign: 'center', position: 'relative', zIndex: activeReason?.id === t.id ? 60 : 1 }}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveReason(activeReason?.id === t.id ? null : {
                              id: t.id,
                              ctrader_id: t.ctrader_id,
                              bot_id: t.bot_id,
                              symbol: t.symbol,
                              reason: t.reason || 'Closed without reason',
                              pnl: t.pnl
                            });
                          }}
                          title={t.reason ? `Lý do: ${t.reason}` : 'Xem chi tiết lý do đóng lệnh'}
                          style={{
                            background: t.reason?.includes('TP') ? 'rgba(16, 185, 129, 0.15)' : t.reason?.includes('SL') ? 'rgba(239, 68, 68, 0.15)' : 'rgba(56, 189, 248, 0.12)',
                            border: `1px solid ${t.reason?.includes('TP') ? 'rgba(16, 185, 129, 0.4)' : t.reason?.includes('SL') ? 'rgba(239, 68, 68, 0.4)' : 'rgba(56, 189, 248, 0.35)'}`,
                            color: t.reason?.includes('TP') ? '#34d399' : t.reason?.includes('SL') ? '#f87171' : '#38bdf8',
                            padding: '3px 6px',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                            transition: 'all 0.15s ease'
                          }}
                        >
                          <FileText size={13} />
                        </button>

                        {/* Floating Popover */}
                        {activeReason?.id === t.id && (
                          <div 
                            onClick={(e) => e.stopPropagation()}
                            style={{
                              position: 'absolute',
                              right: '0px',
                              ...(idx === 0 
                                ? { top: 'calc(100% + 6px)' } 
                                : { bottom: 'calc(100% + 6px)' }
                              ),
                              width: '300px',
                              maxWidth: '85vw',
                              background: '#0f172a',
                              border: '1px solid #38bdf880',
                              boxShadow: '0 12px 30px rgba(0, 0, 0, 0.9), 0 0 16px rgba(56, 189, 248, 0.25)',
                              borderRadius: '8px',
                              padding: '0.8rem',
                              zIndex: 100,
                              textAlign: 'left',
                              cursor: 'default'
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #334155', paddingBottom: '0.4rem', marginBottom: '0.5rem' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#38bdf8', fontWeight: 700, fontSize: '0.80rem' }}>
                                <FileText size={13} />
                                <span>Lý Do Đóng Lệnh #{activeReason.ctrader_id || activeReason.id}</span>
                              </div>
                              <button
                                onClick={() => setActiveReason(null)}
                                title="Đóng"
                                style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '2px', display: 'flex', alignItems: 'center' }}
                              >
                                <X size={13} />
                              </button>
                            </div>

                            <div style={{ display: 'flex', gap: '0.35rem', marginBottom: '0.5rem', fontSize: '0.70rem', flexWrap: 'wrap' }}>
                              <span style={{ background: '#1e293b', border: '1px solid #334155', padding: '2px 5px', borderRadius: '4px', color: '#f8fafc', fontWeight: 600 }}>
                                {activeReason.symbol}
                              </span>
                              <span style={{ background: '#1e293b', border: '1px solid #334155', padding: '2px 5px', borderRadius: '4px', color: '#38bdf8' }}>
                                {activeReason.bot_id}
                              </span>
                              <span style={{ 
                                background: activeReason.pnl >= 0 ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                                color: activeReason.pnl >= 0 ? '#10b981' : '#ef4444',
                                padding: '2px 5px',
                                borderRadius: '4px',
                                fontWeight: 700
                              }}>
                                {activeReason.pnl >= 0 ? `+$${activeReason.pnl.toFixed(2)}` : `-$${Math.abs(activeReason.pnl).toFixed(2)}`}
                              </span>
                            </div>

                            <div style={{
                              background: '#1e293b',
                              border: '1px solid #334155',
                              borderRadius: '6px',
                              padding: '0.55rem',
                              fontSize: '0.78rem',
                              color: '#e2e8f0',
                              lineHeight: 1.45,
                              maxHeight: '150px',
                              overflowY: 'auto',
                              wordBreak: 'break-word',
                              whiteSpace: 'pre-wrap'
                            }}>
                              {activeReason.reason}
                            </div>
                          </div>
                        )}
                      </td>

                      {/* 10. Thời Gian Đóng (Kèm Thời Lượng) */}
                      <td style={{ padding: '0.55rem 0.6rem', whiteSpace: 'nowrap' }}>
                        <div style={{ color: '#cbd5e1', fontSize: '0.74rem' }}>
                          {t.exit_time ? new Date(t.exit_time).toLocaleDateString(undefined, { month: '2-digit', day: '2-digit' }) + ' ' + new Date(t.exit_time).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : '-'}
                        </div>
                        <div style={{ color: '#64748b', fontSize: '0.68rem' }}>
                          {formatDuration(t.entry_time, t.exit_time)}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
