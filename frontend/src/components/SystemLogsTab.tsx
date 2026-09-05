import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { getApiBaseUrl, getWsBaseUrl } from '../config';
import {
  Brain,
  Search,
  Download,
  Trash2,
  AlertTriangle,
  XCircle,
  Info,
  ArrowDown,
  RefreshCw,
  HardDrive,
  FileSpreadsheet,
  Archive,
  CheckCircle2,
  X
} from 'lucide-react';

interface LogItem {
  id?: number;
  bot_id: string;
  level: string;
  message: string;
  timestamp: string;
}

interface SystemLogsTabProps {
  isGuest?: boolean;
}

export default function SystemLogsTab({ isGuest = false }: SystemLogsTabProps) {
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [filter, setFilter] = useState<string>('ALL');
  const [botFilter, setBotFilter] = useState<string>('ALL');
  const [search, setSearch] = useState<string>('');
  const [autoScroll, setAutoScroll] = useState<boolean>(true);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const logContainerRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);

  // Database Storage & Reset State
  const [dbStats, setDbStats] = useState<any>(null);
  const [isResetModalOpen, setIsResetModalOpen] = useState<boolean>(false);
  const [isResetting, setIsResetting] = useState<boolean>(false);
  const [resetPurgeDays, setResetPurgeDays] = useState<number>(1);
  const [statusBanner, setStatusBanner] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Format any error object/array safely to string to prevent React rendering crashes
  const formatErrorMessage = (detail: any, fallback: string): string => {
    if (!detail) return fallback;
    if (typeof detail === 'string') return detail;
    if (Array.isArray(detail)) {
      return detail.map((d: any) => (typeof d === 'string' ? d : d.msg || JSON.stringify(d))).join('; ');
    }
    if (typeof detail === 'object') {
      return detail.msg || detail.message || JSON.stringify(detail);
    }
    return String(detail);
  };

  const showBanner = (type: 'success' | 'error', text: any) => {
    const safeText = typeof text === 'string' ? text : formatErrorMessage(text, 'Có lỗi xảy ra');
    setStatusBanner({ type, text: safeText });
    setTimeout(() => setStatusBanner(null), 5000);
  };

  // 1. Fetch initial logs from SQLite on mount
  const fetchInitialLogs = async () => {
    setIsLoading(true);
    try {
      const res = await axios.get(`${getApiBaseUrl()}/api/logs?limit=300`, {
        withCredentials: true
      });
      if (res.data) {
        if (Array.isArray(res.data)) {
          setLogs(res.data);
        } else if (Array.isArray(res.data.logs)) {
          setLogs(res.data.logs);
        }
      }
    } catch (err: any) {
      console.error('Failed to fetch initial logs:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // 2. Fetch Database Storage Stats
  const fetchDbStats = async () => {
    try {
      const res = await axios.get(`${getApiBaseUrl()}/api/database/stats`, {
        withCredentials: true
      });
      if (res.data) {
        setDbStats(res.data);
      }
    } catch (err: any) {
      console.error('Failed to fetch DB stats:', err);
    }
  };

  // 3. Handle Database Reset & Vacuum
  const handleResetDatabase = async () => {
    if (isGuest) {
      showBanner('error', 'Chế độ Guest chỉ xem. Không thể Reset Database.');
      return;
    }
    setIsResetting(true);
    try {
      const res = await axios.post(
        `${getApiBaseUrl()}/api/database/reset`,
        { purge_logs_days: resetPurgeDays },
        { withCredentials: true }
      );
      if (res.data?.status === 'success') {
        showBanner('success', `Đã sao lưu và dọn dẹp ${res.data.purged_logs || 0} dòng log thành công!`);
        setIsResetModalOpen(false);
        fetchDbStats();
        fetchInitialLogs();
      }
    } catch (err: any) {
      const msg = formatErrorMessage(err.response?.data?.detail || err.message, 'Lỗi khi Reset Database');
      showBanner('error', msg);
    } finally {
      setIsResetting(false);
    }
  };

  // 4. WebSocket live log stream
  useEffect(() => {
    fetchInitialLogs();
    fetchDbStats();

    const connectWs = () => {
      const wsUrl = `${getWsBaseUrl()}/ws/logs`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
      };

      ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          const logItem = payload.type === 'log' ? payload.data : (payload.message ? payload : null);
          if (logItem) {
            setLogs((prev) => [...prev.slice(-499), logItem]);
          }
        } catch (err) {
          console.error('WS parse error:', err);
        }
      };

      ws.onclose = () => {
        setIsConnected(false);
        setTimeout(connectWs, 3000);
      };

      ws.onerror = () => {
        setIsConnected(false);
        ws.close();
      };
    };

    connectWs();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  // Smart Auto-scroll handling
  const handleLogScroll = () => {
    if (!logContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = logContainerRef.current;
    const isAtBottom = scrollHeight - (scrollTop + clientHeight) < 45;
    if (!isAtBottom && autoScroll) {
      setAutoScroll(false);
    } else if (isAtBottom && !autoScroll) {
      setAutoScroll(true);
    }
  };

  useEffect(() => {
    if (autoScroll && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoScroll]);

  // Clear Logs from SQLite
  const handleClearLogs = async () => {
    if (isGuest) {
      showBanner('error', 'Chế độ Guest chỉ xem (View-Only).');
      return;
    }
    if (!window.confirm('Bạn có chắc chắn muốn xóa toàn bộ System Logs trong cơ sở dữ liệu?')) {
      return;
    }
    try {
      await axios.delete(`${getApiBaseUrl()}/api/logs`, {
        withCredentials: true
      });
      setLogs([]);
      fetchDbStats();
      showBanner('success', 'Đã xóa toàn bộ logs thành công.');
    } catch (err: any) {
      const msg = formatErrorMessage(err.response?.data?.detail || err.message, 'Lỗi khi xóa logs');
      showBanner('error', msg);
    }
  };

  // Export JSON
  const exportLogs = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(filteredLogs, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `system_logs_${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  // Filter & Search Logic
  const filteredLogs = logs.filter((l) => {
    if (filter !== 'ALL' && l.level !== filter) return false;
    if (botFilter !== 'ALL' && l.bot_id !== botFilter) return false;
    if (search.trim() !== '') {
      const q = search.toLowerCase();
      return (
        l.message.toLowerCase().includes(q) ||
        l.bot_id.toLowerCase().includes(q) ||
        l.level.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const uniqueBots = Array.from(new Set(logs.map((l) => l.bot_id).filter(Boolean)));

  const getLevelBadge = (level: string) => {
    switch (level) {
      case 'GEMINI_REASONING':
      case 'AI_DECISION':
        return { bg: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', border: 'rgba(56, 189, 248, 0.3)', icon: <Brain size={12} /> };
      case 'ERROR':
        return { bg: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', border: 'rgba(239, 68, 68, 0.3)', icon: <XCircle size={12} /> };
      case 'WARNING':
        return { bg: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b', border: 'rgba(245, 158, 11, 0.3)', icon: <AlertTriangle size={12} /> };
      case 'INFO':
      default:
        return { bg: 'rgba(148, 163, 184, 0.1)', color: '#94a3b8', border: 'rgba(148, 163, 184, 0.2)', icon: <Info size={12} /> };
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 120px)', gap: '1rem' }}>
      {/* Top Banner Status */}
      {statusBanner && (
        <div
          style={{
            padding: '0.6rem 1rem',
            borderRadius: '8px',
            fontSize: '0.825rem',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            background: statusBanner.type === 'success' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
            border: `1px solid ${statusBanner.type === 'success' ? '#10b981' : '#ef4444'}`,
            color: statusBanner.type === 'success' ? '#34d399' : '#f87171'
          }}
        >
          {statusBanner.type === 'success' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
          {statusBanner.text}
        </div>
      )}

      {/* Database Storage & CSV Export Studio Card */}
      <div
        style={{
          background: dbStats?.is_storage_warning
            ? 'linear-gradient(135deg, rgba(239, 68, 68, 0.15) 0%, rgba(15, 23, 42, 0.8) 100%)'
            : 'rgba(15, 23, 42, 0.7)',
          border: dbStats?.is_storage_warning ? '1px solid #ef4444' : '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '12px',
          padding: '0.85rem 1.25rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <HardDrive size={20} color={dbStats?.is_storage_warning ? '#f87171' : '#38bdf8'} />
            <div>
              <div style={{ fontSize: '0.78rem', color: '#94a3b8', fontWeight: 600 }}>Dung Lượng portfolio.db:</div>
              <div style={{ fontSize: '0.95rem', fontWeight: 800, color: dbStats?.is_storage_warning ? '#f87171' : '#f8fafc' }}>
                {dbStats?.total_size_mb || 0} MB <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 500 }}>/ 100 MB max</span>
              </div>
            </div>
          </div>

          {/* Storage Progress Bar */}
          <div style={{ width: '130px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: '#94a3b8', marginBottom: '2px' }}>
              <span>Tiến độ:</span>
              <strong style={{ color: dbStats?.is_storage_warning ? '#f87171' : '#38bdf8' }}>{dbStats?.usage_percent || 0}%</strong>
            </div>
            <div style={{ width: '100%', height: '6px', background: 'rgba(255, 255, 255, 0.1)', borderRadius: '3px', overflow: 'hidden' }}>
              <div
                style={{
                  width: `${Math.min(100, dbStats?.usage_percent || 0)}%`,
                  height: '100%',
                  background: (dbStats?.usage_percent || 0) >= 100 ? '#ef4444' : (dbStats?.usage_percent || 0) >= 75 ? '#fbbf24' : '#38bdf8',
                  transition: 'width 0.3s ease'
                }}
              ></div>
            </div>
          </div>

          <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
            Logs: <strong>{dbStats?.logs_count || 0}</strong> • Lệnh đóng: <strong>{dbStats?.history_count || 0}</strong>
          </div>
        </div>

        {/* Export & Reset Action Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <a
            href={`${getApiBaseUrl()}/api/database/export/history/csv`}
            target="_blank"
            rel="noreferrer"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              background: 'rgba(16, 185, 129, 0.15)',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              color: '#34d399',
              padding: '0.35rem 0.75rem',
              borderRadius: '6px',
              fontSize: '0.75rem',
              fontWeight: 700,
              textDecoration: 'none',
              cursor: 'pointer'
            }}
          >
            <FileSpreadsheet size={13} /> Export Trade CSV
          </a>

          <a
            href={`${getApiBaseUrl()}/api/database/export/logs/csv?bot_id=${botFilter}&level=${filter}`}
            target="_blank"
            rel="noreferrer"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              background: 'rgba(56, 189, 248, 0.15)',
              border: '1px solid rgba(56, 189, 248, 0.3)',
              color: '#38bdf8',
              padding: '0.35rem 0.75rem',
              borderRadius: '6px',
              fontSize: '0.75rem',
              fontWeight: 700,
              textDecoration: 'none',
              cursor: 'pointer'
            }}
          >
            <FileSpreadsheet size={13} /> Export Logs CSV
          </a>

          <a
            href={`${getApiBaseUrl()}/api/database/export/all/zip`}
            target="_blank"
            rel="noreferrer"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              background: 'rgba(168, 85, 247, 0.15)',
              border: '1px solid rgba(168, 85, 247, 0.3)',
              color: '#c084fc',
              padding: '0.35rem 0.75rem',
              borderRadius: '6px',
              fontSize: '0.75rem',
              fontWeight: 700,
              textDecoration: 'none',
              cursor: 'pointer'
            }}
          >
            <Archive size={13} /> Tải Trọn Gói (.ZIP)
          </a>

          <button
            onClick={() => setIsResetModalOpen(true)}
            disabled={isGuest}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              background: 'linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)',
              border: 'none',
              color: '#ffffff',
              padding: '0.35rem 0.85rem',
              borderRadius: '6px',
              fontSize: '0.75rem',
              fontWeight: 700,
              cursor: isGuest ? 'not-allowed' : 'pointer',
              opacity: isGuest ? 0.4 : 1
            }}
          >
            <Trash2 size={13} /> Reset & Vacuum DB
          </button>
        </div>
      </div>

      {/* Logs Header Toolbar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '0.75rem',
          background: '#090d16',
          padding: '0.75rem 1rem',
          borderRadius: '10px',
          border: '1px solid rgba(255, 255, 255, 0.08)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          {/* Live Status Indicator */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: isConnected ? '#10b981' : '#ef4444',
                boxShadow: isConnected ? '0 0 8px #10b981' : 'none'
              }}
            />
            <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600 }}>
              {isConnected ? 'LIVE STREAM' : 'DISCONNECTED'}
            </span>
          </div>

          {/* Search Box */}
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
            <input
              type="text"
              placeholder="Search logs..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                background: '#070a13',
                border: '1px solid #334155',
                borderRadius: '6px',
                padding: '0.35rem 0.6rem 0.35rem 1.8rem',
                color: '#f8fafc',
                fontSize: '0.78rem',
                outline: 'none',
                width: '160px'
              }}
            />
          </div>

          {/* Level Filter Dropdown */}
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            style={{
              background: '#070a13',
              border: '1px solid #334155',
              borderRadius: '6px',
              padding: '0.35rem 0.6rem',
              color: '#f8fafc',
              fontSize: '0.78rem',
              outline: 'none',
              cursor: 'pointer'
            }}
          >
            <option value="ALL">All Levels ({logs.length})</option>
            <option value="GEMINI_REASONING">AI Reasoning</option>
            <option value="AI_DECISION">AI Decisions</option>
            <option value="INFO">Info</option>
            <option value="WARNING">Warnings</option>
            <option value="ERROR">Errors</option>
          </select>

          {/* Bot Instance Filter */}
          {uniqueBots.length > 0 && (
            <select
              value={botFilter}
              onChange={(e) => setBotFilter(e.target.value)}
              style={{
                background: '#070a13',
                border: '1px solid #334155',
                borderRadius: '6px',
                padding: '0.35rem 0.6rem',
                color: '#f8fafc',
                fontSize: '0.78rem',
                outline: 'none',
                cursor: 'pointer'
              }}
            >
              <option value="ALL">All Bots ({uniqueBots.length})</option>
              {uniqueBots.map((b) => (
                <option key={b} value={b}>
                  Bot: {b}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Action Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <button
            onClick={() => {
              fetchInitialLogs();
              fetchDbStats();
            }}
            title="Refresh logs from DB"
            style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'rgba(255, 255, 255, 0.05)', border: '1px solid rgba(255, 255, 255, 0.1)', color: '#cbd5e1', padding: '0.35rem 0.65rem', borderRadius: '6px', fontSize: '0.75rem', cursor: 'pointer' }}
          >
            <RefreshCw size={13} /> Refresh
          </button>

          <button
            onClick={() => {
              const nextState = !autoScroll;
              setAutoScroll(nextState);
              if (nextState && logContainerRef.current) {
                logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
              }
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              background: autoScroll ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255, 255, 255, 0.05)',
              border: `1px solid ${autoScroll ? 'rgba(16, 185, 129, 0.3)' : 'rgba(255, 255, 255, 0.1)'}`,
              color: autoScroll ? '#10b981' : '#94a3b8',
              padding: '0.35rem 0.65rem',
              borderRadius: '6px',
              fontSize: '0.75rem',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            <ArrowDown size={13} /> Auto-Scroll: {autoScroll ? 'ON' : 'OFF'}
          </button>

          <button
            onClick={() => !isGuest && handleClearLogs()}
            disabled={isGuest}
            title={isGuest ? "Chế độ Guest chỉ xem (View-Only)" : "Clear logs from database"}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              color: '#94a3b8',
              padding: '0.35rem 0.65rem',
              borderRadius: '6px',
              fontSize: '0.75rem',
              cursor: isGuest ? 'not-allowed' : 'pointer',
              opacity: isGuest ? 0.4 : 1
            }}
          >
            <Trash2 size={13} /> Clear
          </button>

          <button
            onClick={exportLogs}
            style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)', border: 'none', color: '#ffffff', padding: '0.35rem 0.8rem', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer' }}
          >
            <Download size={13} /> Export JSON
          </button>
        </div>
      </div>

      {/* Main Logs Matrix */}
      <div
        ref={logContainerRef}
        onScroll={handleLogScroll}
        style={{
          background: '#070a13',
          flex: 1,
          overflowY: 'auto',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '10px',
          padding: '1rem',
          fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
          fontSize: '0.8rem',
          position: 'relative'
        }}
      >
        {isLoading ? (
          <div style={{ color: '#64748b', textAlign: 'center', padding: '2rem' }}>Đang nạp nhật ký hệ thống...</div>
        ) : filteredLogs.length === 0 ? (
          <div style={{ color: '#64748b', textAlign: 'center', padding: '2rem' }}>Không có dòng log nào phù hợp với bộ lọc.</div>
        ) : (
          filteredLogs.map((item, idx) => {
            const badge = getLevelBadge(item.level);
            return (
              <div
                key={idx}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '0.75rem',
                  padding: '0.35rem 0',
                  borderBottom: '1px solid rgba(255, 255, 255, 0.03)',
                  lineHeight: '1.4'
                }}
              >
                {/* Timestamp */}
                <span style={{ color: '#64748b', fontSize: '0.72rem', whiteSpace: 'nowrap', minWidth: '130px' }}>
                  {item.timestamp ? item.timestamp.replace('T', ' ').slice(0, 19) : '--'}
                </span>

                {/* Level Badge */}
                <span
                  style={{
                    background: badge.bg,
                    color: badge.color,
                    border: `1px solid ${badge.border}`,
                    padding: '1px 6px',
                    borderRadius: '4px',
                    fontSize: '0.68rem',
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '3px',
                    whiteSpace: 'nowrap',
                    minWidth: '85px',
                    justifyContent: 'center'
                  }}
                >
                  {badge.icon} {item.level}
                </span>

                {/* Bot Tag */}
                {item.bot_id && (
                  <span style={{ color: '#c084fc', fontSize: '0.72rem', fontWeight: 600, whiteSpace: 'nowrap' }}>
                    [{item.bot_id}]
                  </span>
                )}

                {/* Message Text */}
                <span
                  style={{
                    color: item.level === 'ERROR' ? '#fca5a5' : item.level === 'GEMINI_REASONING' ? '#bae6fd' : '#cbd5e1',
                    wordBreak: 'break-word',
                    flex: 1
                  }}
                >
                  {item.message}
                </span>
              </div>
            );
          })
        )}
        <div ref={logsEndRef} />
      </div>

      {/* Database Reset Confirmation Modal */}
      {isResetModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '1rem'
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsResetModalOpen(false);
          }}
        >
          <div
            style={{
              background: '#090d16',
              border: '1px solid rgba(239, 68, 68, 0.4)',
              borderRadius: '14px',
              width: '100%',
              maxWidth: '520px',
              padding: '1.5rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '1.25rem',
              boxShadow: '0 20px 50px rgba(0, 0, 0, 0.6)'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', paddingBottom: '0.8rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#f87171', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <HardDrive size={20} /> Xác Nhận Lưu Trữ & Reset Database
              </h3>
              <button
                onClick={() => setIsResetModalOpen(false)}
                style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ fontSize: '0.85rem', color: '#cbd5e1', lineHeight: '1.6' }}>
              <p style={{ margin: '0 0 0.75rem 0' }}>
                Thao tác này sẽ thực hiện quy trình bảo trì an toàn:
              </p>
              <ul style={{ margin: 0, paddingLeft: '1.25rem', color: '#94a3b8', fontSize: '0.8rem' }}>
                <li>✅ Tự động tạo 1 bản sao lưu Online Backup hoàn chỉnh vào thư mục <code>backups/</code> trước khi xóa.</li>
                <li>✅ Giữ lại toàn bộ dữ liệu lịch sử lệnh đóng (<code>history</code>) và cấu hình bot.</li>
                <li>✅ Xóa các dòng nhật ký (logs) cũ hơn số ngày bạn chọn bên dưới.</li>
                <li>✅ Kích hoạt lệnh <code>PRAGMA wal_checkpoint(TRUNCATE)</code> và <code>VACUUM</code> để thu nhỏ file <code>portfolio.db</code> về mức tối thiểu.</li>
              </ul>
            </div>

            <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '0.75rem', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Giữ lại nhật ký trong:</span>
              <select
                value={resetPurgeDays}
                onChange={(e) => setResetPurgeDays(Number(e.target.value))}
                style={{
                  background: '#070a13',
                  border: '1px solid #334155',
                  color: '#f8fafc',
                  padding: '0.35rem 0.75rem',
                  borderRadius: '6px',
                  fontSize: '0.8rem',
                  outline: 'none',
                  cursor: 'pointer'
                }}
              >
                <option value={1}>Chỉ giữ 1 ngày gần nhất (Khuyến nghị)</option>
                <option value={3}>Giữ 3 ngày gần nhất</option>
                <option value={7}>Giữ 7 ngày gần nhất</option>
                <option value={0}>Xóa sạch toàn bộ logs (Reset 100%)</option>
              </select>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
              <button
                onClick={() => setIsResetModalOpen(false)}
                style={{ background: 'rgba(255, 255, 255, 0.05)', border: '1px solid rgba(255, 255, 255, 0.1)', color: '#94a3b8', padding: '0.45rem 1rem', borderRadius: '6px', fontSize: '0.8rem', cursor: 'pointer' }}
              >
                Hủy Bỏ
              </button>

              <button
                onClick={handleResetDatabase}
                disabled={isResetting || isGuest}
                style={{
                  background: 'linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)',
                  border: 'none',
                  color: '#ffffff',
                  padding: '0.45rem 1.25rem',
                  borderRadius: '6px',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  cursor: isResetting || isGuest ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  boxShadow: '0 4px 14px rgba(239, 68, 68, 0.35)'
                }}
              >
                <Trash2 size={14} />
                {isResetting ? 'Đang Sao Lưu & Reset...' : 'Tiến Hành Sao Lưu & Reset DB'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
