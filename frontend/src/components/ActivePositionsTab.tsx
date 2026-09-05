import { useState, useEffect } from 'react';
import axios from 'axios';
import { getApiBaseUrl } from '../config';
import {
  Zap,
  TrendingUp,
  TrendingDown,
  Layers,
  Search,
  RefreshCw,
  AlertOctagon,
  XCircle,
  Clock,
  Shield,
  Bot,
  Wallet,
  ArrowUpRight,
  ArrowDownRight,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Info,
  X,
  Copy,
  Check
} from 'lucide-react';

interface PositionItem {
  id: number;
  ctrader_id: number;
  account_id: string;
  account_label?: string;
  account_type?: string;
  account_balance?: number;
  account_equity?: number;
  bot_id: string;
  bot_name?: string;
  symbol: string;
  side: 'BUY' | 'SELL' | string;
  volume: number;
  entry_price: number;
  current_price?: number;
  pnl?: number;
  pnl_pips?: number;
  sl_price?: number;
  tp_price?: number;
  sl_pips?: number;
  tp_pips?: number;
  reason?: string;
  entry_time: string;
}

interface ActivePositionReasonPopover {
  id: number;
  ctrader_id?: number;
  bot_id: string;
  bot_name?: string;
  symbol: string;
  side: string;
  volume: number;
  entry_price: number;
  reason: string;
  isPinned?: boolean;
}

interface ActivePositionsTabProps {
  isGuest?: boolean;
}

export default function ActivePositionsTab({ isGuest = false }: ActivePositionsTabProps) {
  const [positions, setPositions] = useState<PositionItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [actionLoading, setActionLoading] = useState<{ [key: number]: boolean }>({});
  const [isClosingAll, setIsClosingAll] = useState<boolean>(false);
  const [isSyncingBroker, setIsSyncingBroker] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sideFilter, setSideFilter] = useState<'ALL' | 'BUY' | 'SELL'>('ALL');
  const [banner, setBanner] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [activeReason, setActiveReason] = useState<ActivePositionReasonPopover | null>(null);
  const [hoveredReasonId, setHoveredReasonId] = useState<number | null>(null);
  const [copiedReasonId, setCopiedReasonId] = useState<number | null>(null);
  const [refreshInterval, setRefreshInterval] = useState<number>(() => {
    const saved = localStorage.getItem('agent_hub_pnl_interval');
    return saved !== null ? parseInt(saved, 10) : 15; // default 15s to minimize VPS CPU/IO
  });

  const fetchPositions = async (isManual = false) => {
    if (isManual) setRefreshing(true);
    try {
      const res = await axios.get(`${getApiBaseUrl()}/api/positions`, { withCredentials: true });
      setPositions(res.data?.positions || []);
    } catch (err: any) {
      console.error('Error fetching active positions:', err);
      if (isManual) showBanner('error', 'Failed to refresh active positions.');
    } finally {
      setLoading(false);
      if (isManual) setRefreshing(false);
    }
  };

  // Sync directly from Spotware broker via cTrader CLI
  const handleSyncBrokerCli = async () => {
    setIsSyncingBroker(true);
    try {
      const res = await axios.post(`${getApiBaseUrl()}/api/positions/sync-cli`, {}, { withCredentials: true });
      if (res.data.status === 'success') {
        showBanner('success', `⚡ cTrader CLI Broker Sync: Updated ${res.data.positions_count} positions and ${res.data.orders_count} orders from Spotware!`);
        fetchPositions();
      } else {
        showBanner('error', res.data.error || 'cTrader CLI sync encountered an issue.');
      }
    } catch (err: any) {
      showBanner('error', err.response?.data?.detail || 'Failed to sync with cTrader CLI broker.');
    } finally {
      setIsSyncingBroker(false);
    }
  };

  useEffect(() => {
    fetchPositions();
    if (refreshInterval <= 0) return;

    const interval = setInterval(() => {
      // Auto-pause polling when browser tab is inactive to preserve 100% VPS resources
      if (!document.hidden) {
        fetchPositions();
      }
    }, refreshInterval * 1000);

    return () => clearInterval(interval);
  }, [refreshInterval]);

  const showBanner = (type: 'success' | 'error', text: string) => {
    setBanner({ type, text });
    setTimeout(() => setBanner(null), 4500);
  };

  // Click outside to dismiss pinned popover & ESC listener
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.active-position-reason-container')) {
        setActiveReason(null);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setActiveReason(null);
        setHoveredReasonId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const handleCopyReason = (text: string, id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(text);
    setCopiedReasonId(id);
    setTimeout(() => setCopiedReasonId(null), 2000);
  };

  const getReasonBadgeInfo = (reasonStr?: string) => {
    if (!reasonStr || !reasonStr.trim()) return null;
    const lower = reasonStr.toLowerCase();
    if (lower.includes('judas')) {
      return { label: 'Judas Sweep', icon: Sparkles, isAi: true, color: '#38bdf8', bg: 'rgba(56, 189, 248, 0.12)', border: 'rgba(56, 189, 248, 0.35)' };
    }
    if (lower.includes('gemini') || lower.includes('ai') || lower.includes('confidence') || lower.includes('mss') || lower.includes('bos') || lower.includes('fvg') || lower.includes('smc')) {
      return { label: 'AI Rationale', icon: Sparkles, isAi: true, color: '#38bdf8', bg: 'rgba(56, 189, 248, 0.12)', border: 'rgba(56, 189, 248, 0.35)' };
    }
    if (lower.includes('broker cli sync') || lower.includes('cli sync')) {
      return { label: 'Broker Sync', icon: Info, isAi: false, color: '#94a3b8', bg: 'rgba(148, 163, 184, 0.1)', border: 'rgba(148, 163, 184, 0.25)' };
    }
    if (lower.includes('strategy')) {
      return { label: 'Strategy Entry', icon: Sparkles, isAi: true, color: '#a78bfa', bg: 'rgba(167, 139, 250, 0.12)', border: 'rgba(167, 139, 250, 0.35)' };
    }
    return { label: 'Entry Reason', icon: Info, isAi: false, color: '#38bdf8', bg: 'rgba(56, 189, 248, 0.12)', border: 'rgba(56, 189, 248, 0.35)' };
  };

  // Close Single Position
  const handleClosePosition = async (pos: PositionItem) => {
    if (!window.confirm(`Close ${pos.side} position #${pos.ctrader_id || pos.id} (${pos.volume} lots ${pos.symbol}) immediately?`)) {
      return;
    }

    const posKey = pos.id;
    setActionLoading((prev) => ({ ...prev, [posKey]: true }));
    try {
      const res = await axios.post(`${getApiBaseUrl()}/api/positions/${pos.id}/close`, {}, { withCredentials: true });
      if (res.data.status === 'success') {
        showBanner('success', res.data.message || `Position #${pos.ctrader_id} closed.`);
        fetchPositions();
      }
    } catch (err: any) {
      showBanner('error', err.response?.data?.detail || 'Failed to close position.');
    } finally {
      setActionLoading((prev) => ({ ...prev, [posKey]: false }));
    }
  };

  // Close All Positions
  const handleCloseAll = async () => {
    if (positions.length === 0) return;
    if (!window.confirm(`🚨 EMERGENCY CLOSE ALL:\nAre you sure you want to close ALL ${positions.length} active positions across all accounts?`)) {
      return;
    }

    setIsClosingAll(true);
    try {
      const res = await axios.post(`${getApiBaseUrl()}/api/positions/close-all`, {}, { withCredentials: true });
      if (res.data.status === 'success') {
        showBanner('success', res.data.message || 'All active positions closed successfully.');
        fetchPositions();
      }
    } catch (err: any) {
      showBanner('error', err.response?.data?.detail || 'Failed to close all positions.');
    } finally {
      setIsClosingAll(false);
    }
  };

  // Metrics Calculations
  const totalPositions = positions.length;
  const totalPnL = positions.reduce((sum, p) => {
    const val = typeof p.pnl === 'number' ? p.pnl : parseFloat(p.pnl as any) || 0;
    return sum + val;
  }, 0);
  const totalExposureLots = positions.reduce((sum, p) => {
    const val = typeof p.volume === 'number' ? p.volume : parseFloat(p.volume as any) || 0;
    return sum + val;
  }, 0);
  const uniqueAccounts = new Set(positions.map((p) => p.account_id)).size;

  // Filtered positions
  const filteredPositions = positions.filter((p) => {
    if (sideFilter !== 'ALL' && p.side.toUpperCase() !== sideFilter) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchSym = p.symbol.toLowerCase().includes(q);
      const matchId = String(p.ctrader_id || p.id).includes(q);
      const matchAcc = p.account_id.toLowerCase().includes(q) || (p.account_label || '').toLowerCase().includes(q);
      const matchBot = p.bot_id.toLowerCase().includes(q) || (p.bot_name || '').toLowerCase().includes(q);
      if (!matchSym && !matchId && !matchAcc && !matchBot) return false;
    }
    return true;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', width: '100%', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Banner Message */}
      {banner && (
        <div
          style={{
            padding: '0.85rem 1.25rem',
            borderRadius: '10px',
            background: banner.type === 'success' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
            border: `1px solid ${banner.type === 'success' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
            color: banner.type === 'success' ? '#34d399' : '#f87171',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            fontSize: '0.9rem',
            fontWeight: 600
          }}
        >
          {banner.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
          <span>{banner.text}</span>
        </div>
      )}

      {/* Header Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.8rem', fontWeight: 800, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span
              style={{
                background: 'linear-gradient(135deg, #38bdf8 0%, #0284c7 100%)',
                color: '#ffffff',
                padding: '8px',
                borderRadius: '10px',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 0 15px rgba(56, 189, 248, 0.4)'
              }}
            >
              <Zap size={22} />
            </span>
            Active Positions Matrix
          </h1>
          <div style={{ color: '#94a3b8', fontSize: '0.875rem', marginTop: '0.3rem' }}>
            Real-time multi-account position monitoring, live PnL tracking, and instant execution control
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          {/* Direct cTrader CLI Broker Sync */}
          <button
            onClick={handleSyncBrokerCli}
            disabled={isSyncingBroker}
            title="Execute direct ctrader-cli interactive session to pull live positions and orders from Spotware broker"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: 'linear-gradient(135deg, rgba(14, 165, 233, 0.25) 0%, rgba(2, 132, 199, 0.35) 100%)',
              border: '1px solid #38bdf8',
              borderRadius: '8px',
              color: '#38bdf8',
              padding: '0.6rem 1rem',
              cursor: isSyncingBroker ? 'not-allowed' : 'pointer',
              fontWeight: 700,
              fontSize: '0.85rem',
              boxShadow: '0 0 15px rgba(56, 189, 248, 0.2)',
              opacity: isSyncingBroker ? 0.7 : 1
            }}
          >
            <Zap size={15} className={isSyncingBroker ? 'live-pulse' : ''} />
            {isSyncingBroker ? 'Syncing Broker via CLI...' : '⚡ Sync cTrader CLI Broker'}
          </button>

          <button
            onClick={() => fetchPositions(true)}
            disabled={refreshing}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: 'rgba(30, 41, 59, 0.8)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '8px',
              color: '#cbd5e1',
              padding: '0.6rem 1rem',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '0.85rem'
            }}
          >
            <RefreshCw size={15} className={refreshing ? 'live-pulse' : ''} /> Refresh
          </button>

          {/* Refresh Frequency Selector */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            background: 'rgba(30, 41, 59, 0.8)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '8px',
            padding: '0.45rem 0.75rem'
          }}>
            <Clock size={14} color="#94a3b8" />
            <span style={{ fontSize: '0.8rem', color: '#94a3b8', fontWeight: 600 }}>Tần suất:</span>
            <select
              value={refreshInterval}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10);
                setRefreshInterval(val);
                localStorage.setItem('agent_hub_pnl_interval', val.toString());
              }}
              style={{
                background: '#0f172a',
                color: '#38bdf8',
                border: '1px solid #334155',
                borderRadius: '4px',
                padding: '0.2rem 0.4rem',
                fontSize: '0.8rem',
                fontWeight: 700,
                cursor: 'pointer',
                outline: 'none'
              }}
            >
              <option value={5}>5s (Nhanh)</option>
              <option value={15}>15s (Chuẩn)</option>
              <option value={30}>30s (Tiết kiệm)</option>
              <option value={60}>60s</option>
              <option value={0}>Tắt (Thủ công)</option>
            </select>
          </div>

          <button
            onClick={handleCloseAll}
            disabled={isClosingAll || totalPositions === 0 || isGuest}
            title={isGuest ? "Chế độ Guest chỉ xem (View-Only), không thể đóng lệnh." : "Đóng khẩn cấp toàn bộ các vị thế đang mở"}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: totalPositions > 0 && !isGuest ? 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)' : 'rgba(100, 116, 139, 0.2)',
              border: 'none',
              borderRadius: '8px',
              color: '#ffffff',
              padding: '0.6rem 1.25rem',
              cursor: totalPositions > 0 && !isGuest ? 'pointer' : 'not-allowed',
              fontWeight: 700,
              fontSize: '0.85rem',
              boxShadow: totalPositions > 0 && !isGuest ? '0 0 20px rgba(220, 38, 38, 0.4)' : 'none',
              opacity: isClosingAll || totalPositions === 0 || isGuest ? 0.5 : 1
            }}
          >
            <AlertOctagon size={16} /> {isClosingAll ? 'Closing All...' : isGuest ? '🚨 Close All (Disabled)' : '🚨 Close All Positions'}
          </button>
        </div>
      </div>

      {/* Executive Metrics HUD */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
        {/* Card 1: Active Positions Count */}
        <div
          style={{
            background: 'linear-gradient(145deg, rgba(30, 41, 59, 0.7) 0%, rgba(15, 23, 42, 0.8) 100%)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '12px',
            padding: '1.25rem',
            display: 'flex',
            alignItems: 'center',
            gap: '1rem',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.2)'
          }}
        >
          <div
            style={{
              width: '46px',
              height: '46px',
              borderRadius: '10px',
              background: 'rgba(56, 189, 248, 0.12)',
              border: '1px solid rgba(56, 189, 248, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#38bdf8'
            }}
          >
            <Layers size={24} />
          </div>
          <div>
            <div style={{ color: '#94a3b8', fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Open Positions
            </div>
            <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#f8fafc', marginTop: '0.2rem' }}>
              {totalPositions} <span style={{ fontSize: '0.875rem', fontWeight: 500, color: '#64748b' }}>Active</span>
            </div>
          </div>
        </div>

        {/* Card 2: Unrealized PnL (Floating Profit/Loss) */}
        <div
          style={{
            background: 'linear-gradient(145deg, rgba(30, 41, 59, 0.7) 0%, rgba(15, 23, 42, 0.8) 100%)',
            border: totalPnL >= 0 ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: '12px',
            padding: '1.25rem',
            display: 'flex',
            alignItems: 'center',
            gap: '1rem',
            boxShadow: totalPnL >= 0 ? '0 8px 24px rgba(16, 185, 129, 0.15)' : '0 8px 24px rgba(239, 68, 68, 0.15)'
          }}
        >
          <div
            style={{
              width: '46px',
              height: '46px',
              borderRadius: '10px',
              background: totalPnL >= 0 ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
              border: `1px solid ${totalPnL >= 0 ? '#10b981' : '#ef4444'}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: totalPnL >= 0 ? '#10b981' : '#ef4444'
            }}
          >
            {totalPnL >= 0 ? <TrendingUp size={24} /> : <TrendingDown size={24} />}
          </div>
          <div>
            <div style={{ color: '#94a3b8', fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Unrealized Floating P&L
            </div>
            <div
              style={{
                fontSize: '1.6rem',
                fontWeight: 800,
                color: totalPnL >= 0 ? '#34d399' : '#f87171',
                marginTop: '0.2rem',
                fontFamily: 'monospace'
              }}
            >
              {totalPnL >= 0 ? `+$${totalPnL.toFixed(2)}` : `-$${Math.abs(totalPnL).toFixed(2)}`}
            </div>
          </div>
        </div>

        {/* Card 3: Total Exposure Volume */}
        <div
          style={{
            background: 'linear-gradient(145deg, rgba(30, 41, 59, 0.7) 0%, rgba(15, 23, 42, 0.8) 100%)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '12px',
            padding: '1.25rem',
            display: 'flex',
            alignItems: 'center',
            gap: '1rem',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.2)'
          }}
        >
          <div
            style={{
              width: '46px',
              height: '46px',
              borderRadius: '10px',
              background: 'rgba(168, 85, 247, 0.12)',
              border: '1px solid rgba(168, 85, 247, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#c084fc'
            }}
          >
            <Shield size={24} />
          </div>
          <div>
            <div style={{ color: '#94a3b8', fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Total Market Exposure
            </div>
            <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#f8fafc', marginTop: '0.2rem', fontFamily: 'monospace' }}>
              {totalExposureLots.toFixed(2)} <span style={{ fontSize: '0.875rem', fontWeight: 500, color: '#64748b' }}>Lots</span>
            </div>
          </div>
        </div>

        {/* Card 4: Connected Accounts */}
        <div
          style={{
            background: 'linear-gradient(145deg, rgba(30, 41, 59, 0.7) 0%, rgba(15, 23, 42, 0.8) 100%)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '12px',
            padding: '1.25rem',
            display: 'flex',
            alignItems: 'center',
            gap: '1rem',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.2)'
          }}
        >
          <div
            style={{
              width: '46px',
              height: '46px',
              borderRadius: '10px',
              background: 'rgba(234, 179, 8, 0.12)',
              border: '1px solid rgba(234, 179, 8, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#facc15'
            }}
          >
            <Wallet size={24} />
          </div>
          <div>
            <div style={{ color: '#94a3b8', fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Active Accounts
            </div>
            <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#f8fafc', marginTop: '0.2rem' }}>
              {uniqueAccounts} <span style={{ fontSize: '0.875rem', fontWeight: 500, color: '#64748b' }}>Accounts</span>
            </div>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div
        style={{
          background: 'rgba(30, 41, 59, 0.5)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '12px',
          padding: '0.75rem 1rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem'
        }}
      >
        {/* Search */}
        <div style={{ display: 'flex', alignItems: 'center', background: '#090d16', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '8px', padding: '0.45rem 0.8rem', width: '320px' }}>
          <Search size={16} color="#64748b" />
          <input
            type="text"
            placeholder="Search by Symbol, ID, Account, Bot..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#f8fafc',
              outline: 'none',
              paddingLeft: '0.6rem',
              fontSize: '0.85rem',
              width: '100%'
            }}
          />
        </div>

        {/* Side Filter Pills */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {(['ALL', 'BUY', 'SELL'] as const).map((side) => {
            const isSelected = sideFilter === side;
            return (
              <button
                key={side}
                onClick={() => setSideFilter(side)}
                style={{
                  background: isSelected ? (side === 'BUY' ? 'rgba(16, 185, 129, 0.2)' : side === 'SELL' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(56, 189, 248, 0.2)') : 'transparent',
                  border: isSelected ? `1px solid ${side === 'BUY' ? '#10b981' : side === 'SELL' ? '#ef4444' : '#38bdf8'}` : '1px solid rgba(255, 255, 255, 0.1)',
                  color: isSelected ? (side === 'BUY' ? '#34d399' : side === 'SELL' ? '#f87171' : '#38bdf8') : '#94a3b8',
                  borderRadius: '6px',
                  padding: '0.4rem 0.9rem',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                {side}
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Positions Table */}
      <div
        style={{
          background: 'rgba(15, 23, 42, 0.7)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '14px',
          overflow: 'hidden',
          boxShadow: '0 10px 30px rgba(0, 0, 0, 0.3)',
          minHeight: filteredPositions.length > 0 && filteredPositions.length <= 2 ? '360px' : undefined
        }}
      >
        {loading ? (
          <div style={{ padding: '4rem', textAlign: 'center', color: '#64748b', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
            <RefreshCw size={32} className="live-pulse" />
            <div>Loading active positions...</div>
          </div>
        ) : filteredPositions.length === 0 ? (
          <div style={{ padding: '4rem', textAlign: 'center', color: '#64748b' }}>
            <div style={{ fontSize: '1.1rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '0.4rem' }}>
              No Active Positions
            </div>
            <div style={{ fontSize: '0.85rem' }}>
              {searchQuery ? `No open orders match search query "${searchQuery}"` : 'All bots are currently in flat/idle state or waiting for next technical breakout.'}
            </div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ background: '#090d16', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', color: '#94a3b8', textTransform: 'uppercase', fontSize: '0.72rem', letterSpacing: '0.5px' }}>
                  <th style={{ padding: '1rem 1.25rem' }}>Position / Symbol</th>
                  <th style={{ padding: '1rem' }}>Side & Lots</th>
                  <th style={{ padding: '1rem' }}>Account & Bot</th>
                  <th style={{ padding: '1rem' }}>Entry vs Current Price</th>
                  <th style={{ padding: '1rem' }}>Unrealized P&L</th>
                  <th style={{ padding: '1rem' }}>SL / TP Targets</th>
                  <th style={{ padding: '1rem' }}>Open Time</th>
                  <th style={{ padding: '1rem 1.25rem', textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredPositions.map((pos, idx) => {
                  const isBuy = pos.side.toUpperCase() === 'BUY';
                  const pnlVal = typeof pos.pnl === 'number' ? pos.pnl : parseFloat(pos.pnl as any) || 0;
                  const isProfitable = pnlVal >= 0;
                  const isClosing = actionLoading[pos.id];
                  const badgeInfo = getReasonBadgeInfo(pos.reason);
                  const isPinned = activeReason?.id === pos.id;
                  const isHovered = hoveredReasonId === pos.id && (!activeReason || activeReason.id === pos.id);
                  const isReasonVisible = (isPinned || isHovered) && !isClosing;
                  const openDownward = idx < 2 || filteredPositions.length <= 2;

                  return (
                    <tr
                      key={pos.id}
                      style={{
                        borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
                        background: isProfitable ? 'rgba(16, 185, 129, 0.03)' : 'rgba(239, 68, 68, 0.03)',
                        transition: 'background 0.2s ease'
                      }}
                    >
                      {/* Position ID & Symbol + Entry Reason Badge */}
                      <td
                        className="active-position-reason-container"
                        style={{
                          padding: '1rem 1.25rem',
                          position: 'relative',
                          zIndex: isReasonVisible ? 60 : 1
                        }}
                      >
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span
                              style={{
                                background: '#1e293b',
                                border: '1px solid rgba(255, 255, 255, 0.1)',
                                color: '#f8fafc',
                                fontWeight: 800,
                                padding: '3px 8px',
                                borderRadius: '6px',
                                fontSize: '0.8rem'
                              }}
                            >
                              {pos.symbol}
                            </span>
                            <span style={{ color: '#64748b', fontFamily: 'monospace', fontSize: '0.75rem' }}>
                              #{pos.ctrader_id || pos.id}
                            </span>
                          </div>

                          {badgeInfo && (
                            <div style={{ display: 'flex', alignItems: 'center' }}>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (activeReason?.id === pos.id) {
                                    setActiveReason(null);
                                  } else {
                                    setActiveReason({
                                      id: pos.id,
                                      ctrader_id: pos.ctrader_id,
                                      bot_id: pos.bot_id,
                                      bot_name: pos.bot_name,
                                      symbol: pos.symbol,
                                      side: pos.side,
                                      volume: pos.volume,
                                      entry_price: pos.entry_price,
                                      reason: pos.reason || '',
                                      isPinned: true
                                    });
                                  }
                                }}
                                onMouseEnter={() => setHoveredReasonId(pos.id)}
                                onMouseLeave={() => setHoveredReasonId(null)}
                                title="Click để ghim hoặc rê chuột để xem lý do vào lệnh"
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  background: badgeInfo.bg,
                                  border: `1px solid ${badgeInfo.border}`,
                                  color: badgeInfo.color,
                                  borderRadius: '5px',
                                  padding: '2px 7px',
                                  fontSize: '0.70rem',
                                  fontWeight: 700,
                                  cursor: 'pointer',
                                  transition: 'all 0.18s ease',
                                  boxShadow: isReasonVisible ? `0 0 10px ${badgeInfo.bg}` : 'none'
                                }}
                              >
                                <badgeInfo.icon size={11} />
                                <span>{badgeInfo.label}</span>
                              </button>
                            </div>
                          )}
                        </div>

                        {/* Floating Popover on Hover or Click */}
                        {isReasonVisible && pos.reason && (
                          <div
                            onClick={(e) => e.stopPropagation()}
                            onMouseEnter={() => setHoveredReasonId(pos.id)}
                            onMouseLeave={() => setHoveredReasonId(null)}
                            style={{
                              position: 'absolute',
                              left: '1.25rem',
                              ...(openDownward ? { top: 'calc(100% + 4px)' } : { bottom: 'calc(100% + 4px)' }),
                              width: '350px',
                              maxWidth: '85vw',
                              background: '#090d16',
                              border: '1px solid rgba(56, 189, 248, 0.45)',
                              boxShadow: '0 16px 36px rgba(0, 0, 0, 0.95), 0 0 20px rgba(56, 189, 248, 0.2)',
                              borderRadius: '10px',
                              padding: '0.85rem',
                              zIndex: 100,
                              textAlign: 'left',
                              cursor: 'default',
                              backdropFilter: 'blur(16px)'
                            }}
                          >
                            {/* Popover Header */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255, 255, 255, 0.1)', paddingBottom: '0.45rem', marginBottom: '0.55rem' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#38bdf8', fontWeight: 800, fontSize: '0.82rem' }}>
                                <Sparkles size={14} />
                                <span>Lý Do Vào Lệnh #{pos.ctrader_id || pos.id}</span>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <button
                                  type="button"
                                  onClick={(e) => handleCopyReason(pos.reason || '', pos.id, e)}
                                  title="Sao chép lý do"
                                  style={{
                                    background: 'rgba(255, 255, 255, 0.06)',
                                    border: '1px solid rgba(255, 255, 255, 0.12)',
                                    color: copiedReasonId === pos.id ? '#34d399' : '#94a3b8',
                                    borderRadius: '4px',
                                    padding: '3px 6px',
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '3px',
                                    fontSize: '0.70rem',
                                    transition: 'all 0.15s ease'
                                  }}
                                >
                                  {copiedReasonId === pos.id ? <Check size={12} /> : <Copy size={12} />}
                                  <span>{copiedReasonId === pos.id ? 'Đã chép' : 'Chép'}</span>
                                </button>
                                {isPinned && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setActiveReason(null);
                                    }}
                                    title="Đóng ghim"
                                    style={{
                                      background: 'none',
                                      border: 'none',
                                      color: '#94a3b8',
                                      cursor: 'pointer',
                                      padding: '2px',
                                      display: 'flex',
                                      alignItems: 'center'
                                    }}
                                  >
                                    <X size={14} />
                                  </button>
                                )}
                              </div>
                            </div>

                            {/* Metadata Pills */}
                            <div style={{ display: 'flex', gap: '5px', marginBottom: '0.55rem', fontSize: '0.72rem', flexWrap: 'wrap' }}>
                              <span style={{ background: '#1e293b', border: '1px solid rgba(255, 255, 255, 0.12)', padding: '2px 6px', borderRadius: '4px', color: '#f8fafc', fontWeight: 700 }}>
                                {pos.symbol}
                              </span>
                              <span style={{
                                background: isBuy ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                                border: `1px solid ${isBuy ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                                color: isBuy ? '#34d399' : '#f87171',
                                padding: '2px 6px',
                                borderRadius: '4px',
                                fontWeight: 700
                              }}>
                                {pos.side} {typeof pos.volume === 'number' ? pos.volume.toFixed(2) : pos.volume} Lots
                              </span>
                              <span style={{ background: '#1e293b', border: '1px solid rgba(255, 255, 255, 0.12)', padding: '2px 6px', borderRadius: '4px', color: '#cbd5e1', display: 'flex', alignItems: 'center', gap: '3px' }}>
                                <Bot size={11} /> {pos.bot_name || pos.bot_id}
                              </span>
                              <span style={{ background: '#1e293b', border: '1px solid rgba(255, 255, 255, 0.12)', padding: '2px 6px', borderRadius: '4px', color: '#94a3b8', fontFamily: 'monospace' }}>
                                @ {typeof pos.entry_price === 'number' ? pos.entry_price.toFixed(2) : pos.entry_price}
                              </span>
                            </div>

                            {/* Reason Text Panel */}
                            <div style={{
                              background: '#040711',
                              border: '1px solid rgba(255, 255, 255, 0.08)',
                              borderRadius: '6px',
                              padding: '0.65rem 0.75rem',
                              fontSize: '0.78rem',
                              color: '#e2e8f0',
                              lineHeight: 1.5,
                              maxHeight: '160px',
                              overflowY: 'auto',
                              wordBreak: 'break-word',
                              whiteSpace: 'pre-wrap',
                              userSelect: 'text'
                            }}>
                              {pos.reason}
                            </div>

                            {/* Footer Hint */}
                            <div style={{ marginTop: '0.45rem', fontSize: '0.68rem', color: '#64748b', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span>{isPinned ? '📌 Đã ghim popover' : '💡 Click badge để ghim'}</span>
                              <span>{isPinned ? 'Bấm ESC để tắt' : 'Rê chuột để xem nhanh'}</span>
                            </div>
                          </div>
                        )}
                      </td>

                      {/* Side & Lots */}
                      <td style={{ padding: '1rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '3px 8px',
                              borderRadius: '6px',
                              fontWeight: 800,
                              fontSize: '0.78rem',
                              background: isBuy ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                              color: isBuy ? '#34d399' : '#f87171',
                              border: `1px solid ${isBuy ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`
                            }}
                          >
                            {isBuy ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                            {pos.side.toUpperCase()}
                          </span>
                          <span style={{ fontWeight: 700, color: '#f8fafc', fontFamily: 'monospace' }}>
                            {typeof pos.volume === 'number' ? pos.volume.toFixed(2) : pos.volume} <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Lots</span>
                          </span>
                        </div>
                      </td>

                      {/* Account & Bot */}
                      <td style={{ padding: '1rem' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                            <span style={{ fontWeight: 800, color: '#38bdf8', fontSize: '0.85rem', fontFamily: 'monospace' }}>
                              #{pos.account_id}
                            </span>
                            {pos.account_label && pos.account_label !== `Account #${pos.account_id}` && (
                              <span style={{ fontSize: '0.75rem', color: '#cbd5e1', fontWeight: 600 }}>
                                • {pos.account_label}
                              </span>
                            )}
                            <span style={{ 
                              fontSize: '0.65rem', 
                              fontWeight: 700,
                              textTransform: 'uppercase',
                              color: (pos.account_type || '').toLowerCase() === 'live' ? '#f59e0b' : '#94a3b8', 
                              background: (pos.account_type || '').toLowerCase() === 'live' ? 'rgba(245, 158, 11, 0.15)' : 'rgba(255,255,255,0.06)', 
                              border: `1px solid ${(pos.account_type || '').toLowerCase() === 'live' ? 'rgba(245, 158, 11, 0.3)' : 'rgba(255,255,255,0.1)'}`,
                              padding: '1px 6px', 
                              borderRadius: '4px' 
                            }}>
                              {pos.account_type || 'DEMO'}
                            </span>
                          </div>
                          <div style={{ fontSize: '0.72rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <Bot size={12} /> {pos.bot_name || pos.bot_id}
                          </div>
                        </div>
                      </td>

                      {/* Entry vs Current Price */}
                      <td style={{ padding: '1rem' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', fontFamily: 'monospace' }}>
                          <div style={{ color: '#f8fafc', fontWeight: 600 }}>
                            Entry: {typeof pos.entry_price === 'number' ? pos.entry_price.toFixed(2) : pos.entry_price}
                          </div>
                          {pos.current_price !== undefined && pos.current_price !== null && (
                            <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                              Now: {typeof pos.current_price === 'number' ? pos.current_price.toFixed(2) : pos.current_price}
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Unrealized PnL */}
                      <td style={{ padding: '1rem' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', fontFamily: 'monospace' }}>
                          <span style={{ fontSize: '1rem', fontWeight: 800, color: isProfitable ? '#34d399' : '#f87171' }}>
                            {pnlVal >= 0 ? `+$${pnlVal.toFixed(2)}` : `-$${Math.abs(pnlVal).toFixed(2)}`}
                          </span>
                          {pos.pnl_pips !== undefined && (
                            <span style={{ fontSize: '0.75rem', color: isProfitable ? 'rgba(52, 211, 153, 0.8)' : 'rgba(248, 113, 113, 0.8)' }}>
                              {pos.pnl_pips >= 0 ? `+${pos.pnl_pips} pips` : `${pos.pnl_pips} pips`}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* SL / TP Targets */}
                      <td style={{ padding: '1rem' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', fontSize: '0.75rem', fontFamily: 'monospace' }}>
                          {pos.sl_price ? (
                            <span style={{ color: '#f87171' }}>
                              SL: {pos.sl_price.toFixed(2)}{pos.sl_pips ? ` (${pos.sl_pips} pips)` : ''}
                            </span>
                          ) : pos.sl_pips ? (
                            <span style={{ color: '#f87171' }}>
                              SL: {pos.sl_pips} pips
                            </span>
                          ) : (
                            <span style={{ color: '#64748b' }}>SL: None</span>
                          )}

                          {pos.tp_price ? (
                            <span style={{ color: '#34d399' }}>
                              TP: {pos.tp_price.toFixed(2)}{pos.tp_pips ? ` (${pos.tp_pips} pips)` : ''}
                            </span>
                          ) : pos.tp_pips ? (
                            <span style={{ color: '#34d399' }}>
                              TP: {pos.tp_pips} pips
                            </span>
                          ) : (
                            <span style={{ color: '#64748b' }}>TP: None</span>
                          )}
                        </div>
                      </td>

                      {/* Open Time */}
                      <td style={{ padding: '1rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#94a3b8', fontSize: '0.78rem' }}>
                          <Clock size={13} />
                          <span>{pos.entry_time ? pos.entry_time.replace('T', ' ').substring(0, 19) : 'Active'}</span>
                        </div>
                      </td>

                      {/* Action */}
                      <td style={{ padding: '1rem 1.25rem', textAlign: 'right' }}>
                        <button
                          onClick={() => handleClosePosition(pos)}
                          disabled={isClosing || isGuest}
                          title={isGuest ? "Chế độ Guest chỉ xem (View-Only), không thể đóng lệnh." : "Close this position immediately"}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            background: isGuest ? 'rgba(100, 116, 139, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                            border: isGuest ? '1px solid rgba(100, 116, 139, 0.25)' : '1px solid rgba(239, 68, 68, 0.3)',
                            color: isGuest ? '#94a3b8' : '#f87171',
                            borderRadius: '6px',
                            padding: '0.45rem 0.85rem',
                            fontWeight: 700,
                            fontSize: '0.78rem',
                            cursor: isGuest ? 'not-allowed' : 'pointer',
                            transition: 'all 0.2s ease',
                            opacity: isClosing || isGuest ? 0.45 : 1
                          }}
                        >
                          {isClosing ? <RefreshCw size={13} className="live-pulse" /> : <XCircle size={14} />}
                          {isClosing ? 'Closing...' : isGuest ? 'View Only' : 'Close'}
                        </button>
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
  );
}
