import { useState, useEffect } from 'react';
import axios from 'axios';
import { getApiBaseUrl } from '../config';
import { 
  Award, 
  Play, 
  RefreshCw, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  TrendingUp, 
  Activity, 
  ShieldCheck, 
  AlertTriangle,
  Zap,
  Layers,
  ChevronDown,
  ChevronUp
} from 'lucide-react';

interface BenchmarkRun {
  id: number;
  start_time: string;
  end_time?: string;
  provider: string;
  model: string;
  dataset_name: string;
  total_scenarios: number;
  processed_scenarios: number;
  win_rate: number;
  profit_factor: number;
  avg_latency_ms: number;
  total_wins: number;
  total_losses: number;
  total_holds: number;
  total_pnl_pips: number;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
  summary_markdown?: string;
  error_message?: string;
}

interface BenchmarkResult {
  id: number;
  run_id: number;
  scenario_idx: number;
  timestamp: string;
  symbol: string;
  timeframe: string;
  ask: number;
  bid: number;
  indicators_json: string;
  ai_action: string;
  ai_volume: number;
  ai_sl_pips: number;
  ai_tp_pips: number;
  ai_confidence: number;
  ai_reason: string;
  latency_ms: number;
  forward_outcome: string;
  pnl_pips: number;
}

interface AIBenchmarkTabProps {
  isGuest?: boolean;
}

export default function AIBenchmarkTab({ isGuest = false }: AIBenchmarkTabProps) {
  const [runs, setRuns] = useState<BenchmarkRun[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<number | null>(null);
  const [selectedRunDetail, setSelectedRunDetail] = useState<any>(null);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [starting, setStarting] = useState<boolean>(false);
  const [expandedReasonId, setExpandedReasonId] = useState<number | null>(null);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const fetchHistory = async () => {
    try {
      const res = await axios.get(`${getApiBaseUrl()}/api/eval/history`, { withCredentials: true });
      const runList: BenchmarkRun[] = res.data.runs || [];
      setRuns(runList);

      if (runList.length > 0) {
        if (!selectedRunId || !runList.some(r => r.id === selectedRunId)) {
          setSelectedRunId(runList[0].id);
        }
      }
    } catch (err) {
      console.error('Error fetching benchmark history:', err);
    }
  };

  const fetchStatus = async () => {
    try {
      const res = await axios.get(`${getApiBaseUrl()}/api/eval/status`, { withCredentials: true });
      setIsRunning(res.data.is_running);
    } catch (err) {
      console.error('Error fetching benchmark status:', err);
    }
  };

  const fetchRunDetail = async (runId: number) => {
    try {
      const res = await axios.get(`${getApiBaseUrl()}/api/eval/runs/${runId}`, { withCredentials: true });
      setSelectedRunDetail(res.data);
    } catch (err) {
      console.error(`Error fetching run #${runId} detail:`, err);
    }
  };

  useEffect(() => {
    const init = async () => {
      await Promise.all([fetchHistory(), fetchStatus()]);
    };
    init();
  }, []);

  useEffect(() => {
    if (selectedRunId) {
      fetchRunDetail(selectedRunId);
    }
  }, [selectedRunId]);

  // Polling loop when running
  useEffect(() => {
    let interval: any = null;
    if (isRunning) {
      interval = setInterval(async () => {
        await Promise.all([fetchHistory(), fetchStatus()]);
        if (selectedRunId) {
          fetchRunDetail(selectedRunId);
        }
      }, 2000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isRunning, selectedRunId]);

  const handleStartBenchmark = async () => {
    setStarting(true);
    setNotification(null);
    try {
      await axios.post(`${getApiBaseUrl()}/api/eval/start`, {}, { withCredentials: true });
      setIsRunning(true);
      setNotification({ type: 'success', message: 'Phiên AI Benchmark đã được khởi chạy thành công!' });
      setTimeout(() => {
        fetchHistory();
      }, 1000);
    } catch (err: any) {
      const msg = err.response?.data?.detail || 'Không thể khởi chạy phiên Benchmark.';
      setNotification({ type: 'error', message: msg });
    } finally {
      setStarting(false);
    }
  };

  const activeRun = runs.find(r => r.id === selectedRunId) || runs[0];

  return (
    <div style={{ paddingBottom: '3rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '1.5rem', fontWeight: 700 }}>
            <Award style={{ color: '#38bdf8' }} /> AI Agent Evaluation & Benchmark Harness
          </h1>
          <p style={{ margin: '0.25rem 0 0 0', color: '#94a3b8', fontSize: '0.875rem' }}>
            Đo lường tự động độ chính xác (Win Rate), Profit Factor, độ trễ và khả năng quản lý rủi ro trên dữ liệu nến tương lai.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <button
            onClick={() => { fetchHistory(); fetchStatus(); if (selectedRunId) fetchRunDetail(selectedRunId); }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              background: '#1e293b',
              border: '1px solid #334155',
              color: '#cbd5e1',
              padding: '0.5rem 1rem',
              borderRadius: '6px',
              cursor: 'pointer'
            }}
          >
            <RefreshCw size={16} className={isRunning ? 'animate-spin' : ''} /> Làm mới
          </button>

          <button
            onClick={() => !isGuest && handleStartBenchmark()}
            disabled={isRunning || starting || isGuest}
            title={isGuest ? "Chế độ Guest chỉ xem (View-Only)" : "Bắt đầu chạy đánh giá AI Benchmark"}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              background: isGuest ? 'rgba(100, 116, 139, 0.3)' : isRunning ? '#475569' : 'linear-gradient(135deg, #0284c7 0%, #2563eb 100%)',
              border: 'none',
              color: isGuest ? '#94a3b8' : 'white',
              padding: '0.5rem 1.25rem',
              borderRadius: '6px',
              fontWeight: 600,
              cursor: isRunning || isGuest ? 'not-allowed' : 'pointer',
              opacity: isGuest ? 0.5 : 1,
              boxShadow: isRunning || isGuest ? 'none' : '0 4px 12px rgba(37, 99, 235, 0.3)'
            }}
          >
            <Play size={16} fill={isGuest ? '#94a3b8' : 'white'} /> {isRunning ? 'Đang Chạy Benchmark...' : isGuest ? 'Benchmark (Disabled)' : 'Bắt Đầu Benchmark'}
          </button>
        </div>
      </div>

      {notification && (
        <div style={{
          padding: '0.75rem 1rem',
          borderRadius: '6px',
          marginBottom: '1.5rem',
          background: notification.type === 'success' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
          border: `1px solid ${notification.type === 'success' ? '#10b981' : '#ef4444'}`,
          color: notification.type === 'success' ? '#34d399' : '#f87171',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem'
        }}>
          {notification.type === 'success' ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
          <span>{notification.message}</span>
        </div>
      )}

      {/* Benchmark Progress Bar when running */}
      {activeRun && activeRun.status === 'RUNNING' && (
        <div style={{ background: '#1e293b', padding: '1.25rem', borderRadius: '8px', border: '1px solid #0284c7', marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.875rem' }}>
            <span style={{ color: '#38bdf8', fontWeight: 600 }}>⚡ Đang chấm điểm kịch bản...</span>
            <span style={{ color: '#cbd5e1' }}>{activeRun.processed_scenarios} / {activeRun.total_scenarios} ({Math.round((activeRun.processed_scenarios / (activeRun.total_scenarios || 1)) * 100)}%)</span>
          </div>
          <div style={{ width: '100%', height: '8px', background: '#0f172a', borderRadius: '4px', overflow: 'hidden' }}>
            <div style={{
              width: `${(activeRun.processed_scenarios / (activeRun.total_scenarios || 1)) * 100}%`,
              height: '100%',
              background: 'linear-gradient(90deg, #38bdf8, #3b82f6)',
              transition: 'width 0.3s ease'
            }} />
          </div>
        </div>
      )}

      {/* KPI Overview Cards */}
      {activeRun && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
          {/* Win Rate */}
          <div style={{ background: '#1e293b', padding: '1.25rem', borderRadius: '8px', border: '1px solid #334155' }}>
            <div style={{ color: '#94a3b8', fontSize: '0.8125rem', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <TrendingUp size={16} style={{ color: '#38bdf8' }} /> Forward Win Rate
            </div>
            <div style={{
              fontSize: '1.75rem',
              fontWeight: 'bold',
              color: activeRun.win_rate >= 60 ? '#10b981' : (activeRun.win_rate >= 45 ? '#f59e0b' : '#ef4444')
            }}>
              {activeRun.win_rate ? `${activeRun.win_rate.toFixed(1)}%` : '0.0%'}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>
              {activeRun.total_wins} Thắng / {activeRun.total_losses} Thua ({activeRun.total_holds} Giữ)
            </div>
          </div>

          {/* Profit Factor */}
          <div style={{ background: '#1e293b', padding: '1.25rem', borderRadius: '8px', border: '1px solid #334155' }}>
            <div style={{ color: '#94a3b8', fontSize: '0.8125rem', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <ShieldCheck size={16} style={{ color: '#10b981' }} /> Profit Factor
            </div>
            <div style={{ fontSize: '1.75rem', fontWeight: 'bold', color: activeRun.profit_factor >= 1.5 ? '#10b981' : '#cbd5e1' }}>
              {activeRun.profit_factor ? activeRun.profit_factor.toFixed(2) : '1.00'}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>
              Tỷ lệ Lãi / Lỗ gộp
            </div>
          </div>

          {/* Net PnL */}
          <div style={{ background: '#1e293b', padding: '1.25rem', borderRadius: '8px', border: '1px solid #334155' }}>
            <div style={{ color: '#94a3b8', fontSize: '0.8125rem', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <Activity size={16} style={{ color: '#f59e0b' }} /> Lợi Nhuận Ròng (PnL)
            </div>
            <div style={{
              fontSize: '1.75rem',
              fontWeight: 'bold',
              color: activeRun.total_pnl_pips >= 0 ? '#10b981' : '#ef4444'
            }}>
              {activeRun.total_pnl_pips > 0 ? `+${activeRun.total_pnl_pips.toFixed(1)}` : `${(activeRun.total_pnl_pips || 0).toFixed(1)}`} pips
            </div>
            <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>
              Tổng pips tích lũy
            </div>
          </div>

          {/* Avg Latency */}
          <div style={{ background: '#1e293b', padding: '1.25rem', borderRadius: '8px', border: '1px solid #334155' }}>
            <div style={{ color: '#94a3b8', fontSize: '0.8125rem', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <Clock size={16} style={{ color: '#a855f7' }} /> Độ Trễ Trung Bình
            </div>
            <div style={{ fontSize: '1.75rem', fontWeight: 'bold', color: '#cbd5e1' }}>
              {Math.round(activeRun.avg_latency_ms || 0)} <span style={{ fontSize: '1rem', fontWeight: 'normal', color: '#94a3b8' }}>ms</span>
            </div>
            <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>
              Model: <code style={{ color: '#38bdf8' }}>{activeRun.model}</code>
            </div>
          </div>
        </div>
      )}

      {/* Historical Runs Selection & Breakdown */}
      <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: '1.5rem', alignItems: 'start' }}>
        {/* Left: Runs History List */}
        <div style={{ background: '#1e293b', borderRadius: '8px', border: '1px solid #334155', padding: '1rem' }}>
          <h3 style={{ margin: '0 0 1rem 0', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Layers size={18} style={{ color: '#38bdf8' }} /> Lịch Sử Benchmark ({runs.length})
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '500px', overflowY: 'auto' }}>
            {runs.length === 0 ? (
              <div style={{ color: '#64748b', textAlign: 'center', padding: '2rem 0', fontSize: '0.875rem' }}>
                Chưa có phiên benchmark nào. Nhấn "Bắt Đầu Benchmark" để chạy.
              </div>
            ) : (
              runs.map((r) => {
                const isSel = r.id === selectedRunId;
                return (
                  <div
                    key={r.id}
                    onClick={() => setSelectedRunId(r.id)}
                    style={{
                      padding: '0.75rem',
                      borderRadius: '6px',
                      background: isSel ? '#0f172a' : '#334155',
                      border: isSel ? '1px solid #0284c7' : '1px solid transparent',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                      <span style={{ fontWeight: 600, fontSize: '0.875rem', color: isSel ? '#38bdf8' : 'white' }}>
                        Run #{r.id} ({r.provider.toUpperCase()})
                      </span>
                      <span style={{
                        fontSize: '0.75rem',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        background: r.status === 'COMPLETED' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(2, 132, 199, 0.2)',
                        color: r.status === 'COMPLETED' ? '#34d399' : '#38bdf8'
                      }}>
                        {r.status}
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#94a3b8' }}>
                      <span>Win: {r.win_rate ? `${r.win_rate.toFixed(0)}%` : '0%'}</span>
                      <span>PnL: {r.total_pnl_pips > 0 ? `+${r.total_pnl_pips}` : (r.total_pnl_pips || 0)} pips</span>
                    </div>
                    <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '0.25rem' }}>
                      {new Date(r.start_time).toLocaleString()}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right: Detailed Scenario Outcomes Table */}
        <div style={{ background: '#1e293b', borderRadius: '8px', border: '1px solid #334155', padding: '1.25rem', overflowX: 'auto' }}>
          <h3 style={{ margin: '0 0 1rem 0', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Zap size={18} style={{ color: '#f59e0b' }} /> Chi Tiết Từng Kịch Bản (Run #{selectedRunId || (activeRun ? activeRun.id : '-')})
          </h3>

          {(!selectedRunDetail || !selectedRunDetail.results || selectedRunDetail.results.length === 0) ? (
            <div style={{ color: '#64748b', textAlign: 'center', padding: '3rem 0' }}>
              Không có dữ liệu kịch bản chi tiết cho phiên này.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ color: '#94a3b8', borderBottom: '1px solid #334155' }}>
                  <th style={{ padding: '0.75rem 0.5rem' }}>#</th>
                  <th style={{ padding: '0.75rem 0.5rem' }}>Cặp / TF</th>
                  <th style={{ padding: '0.75rem 0.5rem' }}>AI Quyết Định</th>
                  <th style={{ padding: '0.75rem 0.5rem' }}>SL / TP (pips)</th>
                  <th style={{ padding: '0.75rem 0.5rem' }}>Mô Phỏng Nến Tương Lai</th>
                  <th style={{ padding: '0.75rem 0.5rem' }}>PnL Pips</th>
                  <th style={{ padding: '0.75rem 0.5rem' }}>Độ Trễ</th>
                  <th style={{ padding: '0.75rem 0.5rem' }}>Lý Do AI</th>
                </tr>
              </thead>
              <tbody>
                {selectedRunDetail.results.map((res: BenchmarkResult) => {
                  const isWin = res.forward_outcome === 'WIN' || res.forward_outcome === 'TIMEOUT_WIN';
                  const isLoss = res.forward_outcome === 'LOSS' || res.forward_outcome === 'TIMEOUT_LOSS';
                  const isExpanded = expandedReasonId === res.id;

                  return (
                    <tr key={res.id} style={{ borderBottom: '1px solid #334155' }}>
                      <td style={{ padding: '0.75rem 0.5rem', color: '#64748b' }}>{res.scenario_idx}</td>
                      <td style={{ padding: '0.75rem 0.5rem', fontWeight: 600 }}>
                        {res.symbol} <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{res.timeframe}</span>
                      </td>
                      <td style={{ padding: '0.75rem 0.5rem' }}>
                        <span style={{
                          padding: '2px 8px',
                          borderRadius: '4px',
                          fontWeight: 700,
                          fontSize: '0.75rem',
                          background: res.ai_action === 'BUY' ? 'rgba(16, 185, 129, 0.2)' : (res.ai_action === 'SELL' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(100, 116, 139, 0.2)'),
                          color: res.ai_action === 'BUY' ? '#34d399' : (res.ai_action === 'SELL' ? '#f87171' : '#94a3b8')
                        }}>
                          {res.ai_action}
                        </span>
                        <span style={{ fontSize: '0.75rem', color: '#64748b', marginLeft: '6px' }}>
                          ({res.ai_confidence}%)
                        </span>
                      </td>
                      <td style={{ padding: '0.75rem 0.5rem', fontSize: '0.8125rem' }}>
                        <span style={{ color: '#ef4444' }}>{res.ai_sl_pips || 0}</span> / <span style={{ color: '#10b981' }}>{res.ai_tp_pips || 0}</span>
                      </td>
                      <td style={{ padding: '0.75rem 0.5rem' }}>
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '2px 8px',
                          borderRadius: '4px',
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          background: isWin ? 'rgba(16, 185, 129, 0.2)' : (isLoss ? 'rgba(239, 68, 68, 0.2)' : 'rgba(56, 189, 248, 0.2)'),
                          color: isWin ? '#34d399' : (isLoss ? '#f87171' : '#38bdf8')
                        }}>
                          {isWin && <CheckCircle2 size={14} />}
                          {isLoss && <XCircle size={14} />}
                          {!isWin && !isLoss && <ShieldCheck size={14} />}
                          {res.forward_outcome}
                        </span>
                      </td>
                      <td style={{
                        padding: '0.75rem 0.5rem',
                        fontWeight: 700,
                        color: res.pnl_pips > 0 ? '#10b981' : (res.pnl_pips < 0 ? '#ef4444' : '#94a3b8')
                      }}>
                        {res.pnl_pips > 0 ? `+${res.pnl_pips}` : res.pnl_pips}
                      </td>
                      <td style={{ padding: '0.75rem 0.5rem', color: '#94a3b8', fontSize: '0.75rem' }}>
                        {Math.round(res.latency_ms)}ms
                      </td>
                      <td style={{ padding: '0.75rem 0.5rem', maxWidth: '280px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <span style={{
                            fontSize: '0.75rem',
                            color: '#cbd5e1',
                            whiteSpace: isExpanded ? 'normal' : 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            display: 'block'
                          }}>
                            {res.ai_reason}
                          </span>
                          <button
                            onClick={() => setExpandedReasonId(isExpanded ? null : res.id)}
                            style={{ background: 'transparent', border: 'none', color: '#38bdf8', cursor: 'pointer', padding: 0 }}
                          >
                            {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
