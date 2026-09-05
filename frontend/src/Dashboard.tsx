import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Activity, Bot, Cpu, History, LogOut, Menu, TerminalSquare, X, Zap, Award, ShieldCheck, Eye, RefreshCw, Wifi, Gauge, CheckCircle2, AlertTriangle, ArrowRight, BrainCircuit } from 'lucide-react';
import { getApiBaseUrl } from './config';
import OverviewTab from './components/OverviewTab';
import ActivePositionsTab from './components/ActivePositionsTab';
import BotManagerTab from './components/BotManagerTab';
import AgentTab from './components/AgentTab';
import AIBenchmarkTab from './components/AIBenchmarkTab';
import StrategyAuditTab from './components/StrategyAuditTab';
import TradeHistoryTab from './components/TradeHistoryTab';
import SystemLogsTab from './components/SystemLogsTab';

type TabType = 'overview' | 'positions' | 'bots' | 'agent' | 'benchmark' | 'audit' | 'history' | 'logs';

export default function Dashboard() {
  const getInitialDashboardData = () => {
    try {
      const cached = localStorage.getItem('agent_hub_dashboard_cache');
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (_) {}
    return null;
  };

  const [data, setData] = useState<any>(getInitialDashboardData);
  const [userRole, setUserRole] = useState<'admin' | 'guest'>('admin');
  const [userName, setUserName] = useState<string>('admin');
  const [error, setError] = useState('');
  const [isMobile, setIsMobile] = useState<boolean>(window.innerWidth < 768);
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);

  // Database Storage Threshold State
  const [dbStats, setDbStats] = useState<any>(null);
  const [dismissDbWarning, setDismissDbWarning] = useState<boolean>(false);

  // Network Ping & Latency Diagnostics State
  const [pingMs, setPingMs] = useState<number | null>(null);
  const [apiLatencyMs, setApiLatencyMs] = useState<number | null>(null);
  const [isDiagnosticModalOpen, setIsDiagnosticModalOpen] = useState<boolean>(false);
  const [isTestingSpeed, setIsTestingSpeed] = useState<boolean>(false);

  const measurePing = async () => {
    const t0 = performance.now();
    try {
      await axios.get(`${getApiBaseUrl()}/api/ping`, { timeout: 4000 });
      const rtt = Math.round(performance.now() - t0);
      setPingMs(rtt);
      return rtt;
    } catch (_) {
      setPingMs(null);
      return null;
    }
  };

  const runFullSpeedTest = async () => {
    setIsTestingSpeed(true);
    await measurePing();
    const tStart = performance.now();
    try {
      await axios.get(`${getApiBaseUrl()}/api/dashboard`, { withCredentials: true, timeout: 8000 });
      setApiLatencyMs(Math.round(performance.now() - tStart));
    } catch (_) {}
    setIsTestingSpeed(false);
  };

  const getInitialTab = (): TabType => {
    const hash = window.location.hash.replace('#', '') as TabType;
    const validTabs: TabType[] = ['overview', 'positions', 'bots', 'agent', 'benchmark', 'audit', 'history', 'logs'];
    if (validTabs.includes(hash)) {
      return hash;
    }
    const saved = localStorage.getItem('agent_hub_active_tab') as TabType;
    if (validTabs.includes(saved)) {
      return saved;
    }
    return 'overview';
  };

  const [activeTab, setActiveTab] = useState<TabType>(getInitialTab);
  const navigate = useNavigate();

  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
    localStorage.setItem('agent_hub_active_tab', tab);
    window.location.hash = tab;
    if (isMobile) {
      setMobileMenuOpen(false);
    }
  };

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (!mobile) {
        setMobileMenuOpen(false);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const fetchAuthMe = async () => {
    try {
      const res = await axios.get(`${getApiBaseUrl()}/api/auth/me`, { withCredentials: true, timeout: 5000 });
      if (res.data?.role) {
        setUserRole(res.data.role);
      }
      if (res.data?.user) {
        setUserName(res.data.user);
      }
    } catch (err: any) {
      if (err.response?.status === 401) {
        navigate('/login');
      }
    }
  };

  const fetchData = async () => {
    const tStart = performance.now();
    try {
      const response = await axios.get(`${getApiBaseUrl()}/api/dashboard`, {
        withCredentials: true,
        timeout: 8000
      });
      setApiLatencyMs(Math.round(performance.now() - tStart));
      setData(response.data);
      try {
        localStorage.setItem('agent_hub_dashboard_cache', JSON.stringify(response.data));
      } catch (_) {}
      setError('');
    } catch (err: any) {
      if (err.response?.status === 401) {
        navigate('/login');
      } else {
        const msg = err.response?.data?.detail || err.message || 'Không thể lấy dữ liệu dashboard';
        setError(msg);
      }
    }
  };

  const fetchDbStats = async () => {
    try {
      const res = await axios.get(`${getApiBaseUrl()}/api/database/stats`, {
        withCredentials: true,
        timeout: 5000
      });
      if (res.data) {
        setDbStats(res.data);
      }
    } catch (_) {}
  };

  useEffect(() => {
    fetchAuthMe();
    fetchData();
    fetchDbStats();
    measurePing();
    // Poll data every 10 seconds for dashboard summary when tab is visible
    const interval = setInterval(() => {
      if (!document.hidden) {
        fetchData();
        fetchDbStats();
        measurePing();
      }
    }, 10000);
    return () => clearInterval(interval);
  }, [navigate]);

  const handleLogout = async () => {
    try {
      await axios.post(`${getApiBaseUrl()}/api/logout`, {}, { withCredentials: true });
      localStorage.removeItem('agent_hub_dashboard_cache');
      navigate('/login');
    } catch (err) {
      console.error(err);
    }
  };

  if (!data) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        backgroundColor: '#0f172a',
        color: 'white',
        fontFamily: 'Inter, system-ui, sans-serif'
      }}>
        <div style={{
          background: 'rgba(30, 41, 59, 0.75)',
          backdropFilter: 'blur(16px)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '16px',
          padding: '2.5rem',
          maxWidth: '400px',
          width: '90%',
          textAlign: 'center',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)'
        }}>
          {error ? (
            <>
              <div style={{ fontSize: '2.5rem', marginBottom: '0.8rem' }}>⚠️</div>
              <h3 style={{ margin: '0 0 0.5rem', color: '#f87171', fontSize: '1.15rem', fontWeight: 600 }}>Không thể kết nối máy chủ</h3>
              <p style={{ color: '#94a3b8', fontSize: '0.825rem', marginBottom: '1.4rem', lineHeight: '1.5' }}>
                {error}. Vui lòng kiểm tra lại dịch vụ AI Hub trên VPS.
              </p>
              <button
                onClick={() => { setError(''); fetchData(); }}
                style={{
                  background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
                  color: 'white',
                  border: 'none',
                  padding: '0.65rem 1.3rem',
                  borderRadius: '8px',
                  fontWeight: 600,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}
              >
                <RefreshCw size={15} /> Thử kết nối lại
              </button>
            </>
          ) : (
            <>
              <div style={{
                width: '42px',
                height: '42px',
                border: '3px solid rgba(59, 130, 246, 0.2)',
                borderTopColor: '#38bdf8',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite',
                margin: '0 auto 1.2rem auto'
              }} />
              <h3 style={{ margin: '0 0 0.4rem', fontSize: '1.15rem', fontWeight: 600, color: '#f1f5f9' }}>Đang tải Dashboard...</h3>
              <p style={{ color: '#64748b', fontSize: '0.825rem', margin: 0 }}>Đang kết nối tới cTrader AI Trading Hub</p>
            </>
          )}
        </div>
      </div>
    );
  }

  const isGuest = userRole === 'guest';

  const renderTab = () => {
    switch (activeTab) {
      case 'overview':
        return <OverviewTab data={data} />;
      case 'positions':
        return <ActivePositionsTab isGuest={isGuest} />;
      case 'bots':
        return <BotManagerTab data={data} refreshData={fetchData} isGuest={isGuest} />;
      case 'agent':
        return <AgentTab isGuest={isGuest} />;
      case 'benchmark':
        return <AIBenchmarkTab isGuest={isGuest} />;
      case 'audit':
        return <StrategyAuditTab isGuest={isGuest} />;
      case 'history':
        return <TradeHistoryTab isGuest={isGuest} />;
      case 'logs':
        return <SystemLogsTab isGuest={isGuest} />;
      default:
        return <OverviewTab data={data} />;
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', height: '100vh', backgroundColor: '#0f172a', color: 'white', overflow: 'hidden' }}>
      {/* Mobile Top Header */}
      {isMobile && (
        <header style={{
          height: '56px',
          backgroundColor: '#1e293b',
          borderBottom: '1px solid #334155',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 1rem',
          zIndex: 40,
          flexShrink: 0
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              style={{
                background: 'rgba(255,255,255,0.08)',
                border: 'none',
                color: 'white',
                padding: '8px',
                borderRadius: '6px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
              aria-label="Toggle navigation menu"
            >
              {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
            <span style={{ fontWeight: 800, fontSize: '1.1rem', color: '#38bdf8', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Activity size={20} /> Agent Hub
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {/* Ping Indicator */}
            <button
              onClick={() => setIsDiagnosticModalOpen(true)}
              style={{
                background: 'rgba(15, 23, 42, 0.8)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                padding: '2px 6px',
                borderRadius: '4px',
                color: pingMs === null ? '#94a3b8' : pingMs < 60 ? '#34d399' : pingMs < 150 ? '#fbbf24' : '#f87171',
                fontSize: '0.68rem',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: '2px',
                cursor: 'pointer'
              }}
              title="Nhấn để mở Bảng Chẩn Đoán Đường Truyền"
            >
              <Wifi size={11} /> {pingMs !== null ? `${pingMs}ms` : 'Ping...'}
            </button>

            {data?.vps_cpu_percent !== undefined && (
              <span style={{
                fontSize: '0.68rem',
                color: data.vps_cpu_percent < 50 ? '#34d399' : data.vps_cpu_percent < 75 ? '#fbbf24' : '#f87171',
                background: 'rgba(15, 23, 42, 0.8)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                padding: '2px 6px',
                borderRadius: '4px',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: '2px'
              }}>
                <Cpu size={11} /> {data.vps_cpu_percent}%
              </span>
            )}
            {isGuest ? (
              <span style={{ fontSize: '0.72rem', color: '#fbbf24', background: 'rgba(245, 158, 11, 0.15)', border: '1px solid rgba(245, 158, 11, 0.3)', padding: '3px 6px', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '3px', fontWeight: 700 }}>
                <Eye size={12} /> View-Only
              </span>
            ) : (
              <span style={{ fontSize: '0.72rem', color: '#34d399', background: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.3)', padding: '3px 6px', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '3px', fontWeight: 700 }}>
                <ShieldCheck size={12} /> Admin
              </span>
            )}
            <span style={{ fontSize: '0.8rem', color: '#94a3b8', textTransform: 'capitalize', fontWeight: 600, background: '#0f172a', padding: '4px 8px', borderRadius: '4px', border: '1px solid #334155' }}>
              {activeTab}
            </span>
            <button 
              onClick={handleLogout} 
              style={{ 
                background: 'transparent', 
                border: 'none', 
                color: '#ef4444', 
                cursor: 'pointer', 
                padding: '6px', 
                display: 'flex', 
                alignItems: 'center' 
              }}
              title="Logout"
            >
              <LogOut size={18} />
            </button>
          </div>
        </header>
      )}

      {/* Backdrop for mobile drawer */}
      {isMobile && mobileMenuOpen && (
        <div
          onClick={() => setMobileMenuOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.6)',
            backdropFilter: 'blur(2px)',
            zIndex: 45
          }}
        />
      )}

      {/* Sidebar (Desktop permanent / Mobile drawer) */}
      <aside style={{
        width: '260px',
        backgroundColor: '#1e293b',
        padding: '1rem',
        display: 'flex',
        flexDirection: 'column',
        borderRight: '1px solid #334155',
        position: isMobile ? 'fixed' : 'relative',
        top: isMobile ? 0 : undefined,
        bottom: isMobile ? 0 : undefined,
        left: isMobile ? (mobileMenuOpen ? 0 : '-280px') : undefined,
        height: '100%',
        zIndex: isMobile ? 50 : undefined,
        transition: isMobile ? 'left 0.25s cubic-bezier(0.4, 0, 0.2, 1)' : undefined,
        boxShadow: isMobile && mobileMenuOpen ? '0 0 30px rgba(0,0,0,0.7)' : undefined,
        flexShrink: 0
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ color: '#38bdf8', display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
            <Activity size={24} /> Agent Hub
          </h2>
          {isMobile && (
            <button
              onClick={() => setMobileMenuOpen(false)}
              style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '4px' }}
            >
              <X size={20} />
            </button>
          )}
        </div>

        {/* User Identity & Role Badge */}
        <div style={{
          marginTop: '0.75rem',
          padding: '0.6rem 0.75rem',
          background: isGuest ? 'rgba(245, 158, 11, 0.08)' : 'rgba(16, 185, 129, 0.08)',
          border: isGuest ? '1px solid rgba(245, 158, 11, 0.25)' : '1px solid rgba(16, 185, 129, 0.25)',
          borderRadius: '8px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
            {isGuest ? <Eye size={15} color="#fbbf24" /> : <ShieldCheck size={15} color="#34d399" />}
            <span style={{ fontSize: '0.78rem', fontWeight: 700, color: isGuest ? '#fbbf24' : '#34d399' }}>
              {isGuest ? 'Guest (View-Only)' : 'Admin (Full Access)'}
            </span>
          </div>
          <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>{userName}</span>
        </div>

        {/* VPS Resource Telemetry Status */}
        <div style={{
          marginTop: '0.5rem',
          padding: '0.45rem 0.65rem',
          background: 'rgba(15, 23, 42, 0.6)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '8px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: '0.72rem'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <Cpu size={13} color="#38bdf8" />
            <span style={{ color: '#94a3b8' }}>VPS CPU:</span>
            <span style={{
              fontWeight: 700,
              color: (data?.vps_cpu_percent ?? 0) < 50 ? '#34d399' : (data?.vps_cpu_percent ?? 0) < 75 ? '#fbbf24' : '#f87171'
            }}>
              {data?.vps_cpu_percent ?? 0}%
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <span style={{ color: '#94a3b8' }}>RAM:</span>
            <span style={{ fontWeight: 700, color: '#38bdf8' }}>
              {data?.vps_ram_percent ?? 0}%
            </span>
          </div>
        </div>

        {/* Network Ping & Quality Status */}
        <div 
          onClick={() => setIsDiagnosticModalOpen(true)}
          style={{
            marginTop: '0.4rem',
            padding: '0.45rem 0.65rem',
            background: 'rgba(15, 23, 42, 0.6)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '0.72rem',
            cursor: 'pointer',
            transition: 'border-color 0.2s ease'
          }}
          title="Nhấn để kiểm tra và tối ưu đường truyền mạng"
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <Wifi size={13} color={pingMs === null ? '#94a3b8' : pingMs < 60 ? '#34d399' : pingMs < 150 ? '#fbbf24' : '#f87171'} />
            <span style={{ color: '#94a3b8' }}>Đường truyền:</span>
          </div>
          <span style={{
            fontWeight: 700,
            color: pingMs === null ? '#94a3b8' : pingMs < 60 ? '#34d399' : pingMs < 150 ? '#fbbf24' : '#f87171'
          }}>
            {pingMs !== null ? `${pingMs} ms` : 'Đang đo...'}
          </span>
        </div>

        <nav style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '1.25rem', flex: 1, overflowY: 'auto' }}>
          <button 
            onClick={() => handleTabChange('overview')} 
            style={{ color: activeTab === 'overview' ? 'white' : '#94a3b8', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.85rem 0.75rem', background: activeTab === 'overview' ? '#334155' : 'transparent', borderRadius: '6px', border: 'none', cursor: 'pointer', textAlign: 'left', fontSize: '1rem', fontWeight: 600, minHeight: '44px' }}
          >
            <Activity size={18} /> Overview
          </button>
          <button 
            onClick={() => handleTabChange('agent')} 
            style={{ color: activeTab === 'agent' ? 'white' : '#94a3b8', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.85rem 0.75rem', background: activeTab === 'agent' ? '#334155' : 'transparent', borderRadius: '6px', border: 'none', cursor: 'pointer', textAlign: 'left', fontSize: '1rem', fontWeight: 600, minHeight: '44px' }}
          >
            <Cpu size={18} color={activeTab === 'agent' ? '#38bdf8' : 'currentColor'} /> Agent AI
          </button>
          <button 
            onClick={() => handleTabChange('benchmark')} 
            style={{ color: activeTab === 'benchmark' ? 'white' : '#94a3b8', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.85rem 0.75rem', background: activeTab === 'benchmark' ? '#334155' : 'transparent', borderRadius: '6px', border: 'none', cursor: 'pointer', textAlign: 'left', fontSize: '1rem', fontWeight: 600, minHeight: '44px' }}
          >
            <Award size={18} color={activeTab === 'benchmark' ? '#38bdf8' : 'currentColor'} /> AI Benchmark
          </button>
          <button 
            onClick={() => handleTabChange('audit')} 
            style={{ color: activeTab === 'audit' ? 'white' : '#94a3b8', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.85rem 0.75rem', background: activeTab === 'audit' ? '#334155' : 'transparent', borderRadius: '6px', border: 'none', cursor: 'pointer', textAlign: 'left', fontSize: '1rem', fontWeight: 600, minHeight: '44px' }}
          >
            <BrainCircuit size={18} color={activeTab === 'audit' ? '#38bdf8' : 'currentColor'} /> AI Review & Auto-Tune
          </button>
          <button 
            onClick={() => handleTabChange('bots')} 
            style={{ color: activeTab === 'bots' ? 'white' : '#94a3b8', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.85rem 0.75rem', background: activeTab === 'bots' ? '#334155' : 'transparent', borderRadius: '6px', border: 'none', cursor: 'pointer', textAlign: 'left', fontSize: '1rem', fontWeight: 600, minHeight: '44px' }}
          >
            <Bot size={18} /> Bot Manager
          </button>
          <button 
            onClick={() => handleTabChange('positions')} 
            style={{ 
              color: activeTab === 'positions' ? 'white' : '#94a3b8', 
              textDecoration: 'none', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'space-between',
              padding: '0.85rem 0.75rem', 
              background: activeTab === 'positions' ? '#334155' : 'transparent', 
              borderRadius: '6px', 
              border: 'none', 
              cursor: 'pointer', 
              textAlign: 'left', 
              fontSize: '1rem',
              fontWeight: 600,
              minHeight: '44px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <Zap size={18} color={activeTab === 'positions' ? '#38bdf8' : 'currentColor'} /> Active Positions
            </div>
            {data?.open_positions > 0 && (
              <span style={{ background: '#38bdf8', color: '#090d16', fontSize: '0.75rem', fontWeight: 800, padding: '2px 7px', borderRadius: '10px' }}>
                {data.open_positions}
              </span>
            )}
          </button>
          <button 
            onClick={() => handleTabChange('history')} 
            style={{ color: activeTab === 'history' ? 'white' : '#94a3b8', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.85rem 0.75rem', background: activeTab === 'history' ? '#334155' : 'transparent', borderRadius: '6px', border: 'none', cursor: 'pointer', textAlign: 'left', fontSize: '1rem', fontWeight: 600, minHeight: '44px' }}
          >
            <History size={18} color={activeTab === 'history' ? '#38bdf8' : 'currentColor'} /> Trade History
          </button>
          <button 
            onClick={() => handleTabChange('logs')} 
            style={{ color: activeTab === 'logs' ? 'white' : '#94a3b8', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.85rem 0.75rem', background: activeTab === 'logs' ? '#334155' : 'transparent', borderRadius: '6px', border: 'none', cursor: 'pointer', textAlign: 'left', fontSize: '1rem', fontWeight: 600, minHeight: '44px' }}
          >
            <TerminalSquare size={18} /> System Logs
          </button>
        </nav>
        <button onClick={handleLogout} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '0.75rem', fontSize: '1rem', minHeight: '44px' }}>
          <LogOut size={18} /> Logout
        </button>
      </aside>

      {/* Main Content */}
      <main style={{ flex: 1, padding: isMobile ? '0.85rem' : '2rem', overflowY: 'auto' }}>
        {error && <div style={{ color: '#ef4444', marginBottom: '1rem' }}>{error}</div>}

        {/* 100MB Database Storage Warning Banner */}
        {dbStats?.is_storage_warning && !dismissDbWarning && (
          <div
            style={{
              background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.25) 0%, rgba(185, 28, 28, 0.35) 100%)',
              border: '1px solid #ef4444',
              borderRadius: '10px',
              padding: '0.85rem 1.25rem',
              marginBottom: '1.25rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '0.75rem',
              boxShadow: '0 4px 14px rgba(239, 68, 68, 0.3)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <AlertTriangle size={22} color="#f87171" />
              <div>
                <strong style={{ color: '#fca5a5', fontSize: '0.9rem' }}>
                  CẢNH BÁO DUNG LƯỢNG DATABASE:
                </strong>
                <span style={{ color: '#f8fafc', fontSize: '0.85rem', marginLeft: '6px' }}>
                  Tệp <code>portfolio.db</code> đã đạt <strong>{dbStats.total_size_mb} MB</strong> (vượt ngưỡng an toàn 100 MB). Hãy xuất CSV để lưu trữ riêng và thực hiện Reset Database.
                </span>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <a
                href={`${getApiBaseUrl()}/api/database/export/all/zip`}
                target="_blank"
                rel="noreferrer"
                style={{
                  background: '#0284c7',
                  color: '#ffffff',
                  padding: '0.35rem 0.75rem',
                  borderRadius: '6px',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  textDecoration: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                📥 Tải Backup CSV (.ZIP)
              </a>
              <button
                onClick={() => handleTabChange('logs')}
                style={{
                  background: '#ef4444',
                  color: '#ffffff',
                  border: 'none',
                  padding: '0.35rem 0.75rem',
                  borderRadius: '6px',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                🧹 Mở Reset & Vacuum DB
              </button>
              <button
                onClick={() => setDismissDbWarning(true)}
                style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '4px' }}
                title="Đóng cảnh báo"
              >
                <X size={16} />
              </button>
            </div>
          </div>
        )}

        {renderTab()}
      </main>

      {/* Network & Latency Diagnostic Studio Modal */}
      {isDiagnosticModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '1rem'
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsDiagnosticModalOpen(false);
          }}
        >
          <div
            style={{
              background: 'linear-gradient(145deg, #1e293b, #0f172a)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              borderRadius: '16px',
              width: '100%',
              maxWidth: '540px',
              padding: '1.75rem',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.6)',
              color: 'white'
            }}
          >
            {/* Modal Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <div style={{
                  padding: '8px',
                  borderRadius: '10px',
                  background: 'rgba(56, 189, 248, 0.15)',
                  color: '#38bdf8'
                }}>
                  <Gauge size={22} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700 }}>
                    Chẩn Đoán Tốc Độ & Đường Truyền VPS
                  </h3>
                  <p style={{ margin: '0.15rem 0 0', fontSize: '0.78rem', color: '#94a3b8' }}>
                    Phân tích Round-Trip Ping, API Latency và chế độ tải Web
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsDiagnosticModalOpen(false)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#64748b',
                  fontSize: '1.25rem',
                  cursor: 'pointer',
                  padding: '4px'
                }}
              >
                ✕
              </button>
            </div>

            {/* Latency Metric Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1.25rem' }}>
              {/* Ping RTT Card */}
              <div style={{
                background: 'rgba(15, 23, 42, 0.7)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '12px',
                padding: '1rem'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#94a3b8', fontSize: '0.78rem', marginBottom: '0.4rem' }}>
                  <Wifi size={14} color="#38bdf8" /> Ping (RTT) tới VPS
                </div>
                <div style={{ fontSize: '1.6rem', fontWeight: 800, color: pingMs === null ? '#94a3b8' : pingMs < 60 ? '#34d399' : pingMs < 150 ? '#fbbf24' : '#f87171' }}>
                  {pingMs !== null ? `${pingMs} ms` : '---'}
                </div>
                <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '0.2rem' }}>
                  {pingMs === null ? 'Đang đo...' : pingMs < 60 ? '🟢 Tuyệt vời (< 60ms)' : pingMs < 150 ? '🟡 Tốt (60 - 150ms)' : '🔴 Độ trễ cao (> 150ms)'}
                </div>
              </div>

              {/* API Fetch Latency Card */}
              <div style={{
                background: 'rgba(15, 23, 42, 0.7)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '12px',
                padding: '1rem'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#94a3b8', fontSize: '0.78rem', marginBottom: '0.4rem' }}>
                  <Activity size={14} color="#a855f7" /> Thời gian phản hồi API
                </div>
                <div style={{ fontSize: '1.6rem', fontWeight: 800, color: apiLatencyMs === null ? '#94a3b8' : apiLatencyMs < 150 ? '#34d399' : apiLatencyMs < 400 ? '#fbbf24' : '#f87171' }}>
                  {apiLatencyMs !== null ? `${apiLatencyMs} ms` : '---'}
                </div>
                <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '0.2rem' }}>
                  Xử lý Backend + Nén Gzip
                </div>
              </div>
            </div>

            {/* Production vs Dev Server Analysis Box */}
            <div style={{
              background: window.location.port === '5173' ? 'rgba(245, 158, 11, 0.08)' : 'rgba(16, 185, 129, 0.08)',
              border: window.location.port === '5173' ? '1px solid rgba(245, 158, 11, 0.3)' : '1px solid rgba(16, 185, 129, 0.3)',
              borderRadius: '12px',
              padding: '1rem',
              marginBottom: '1.25rem'
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.6rem' }}>
                {window.location.port === '5173' ? (
                  <AlertTriangle size={20} color="#fbbf24" style={{ flexShrink: 0, marginTop: '2px' }} />
                ) : (
                  <CheckCircle2 size={20} color="#34d399" style={{ flexShrink: 0, marginTop: '2px' }} />
                )}
                <div>
                  <h4 style={{ margin: '0 0 0.25rem', fontSize: '0.9rem', fontWeight: 700, color: window.location.port === '5173' ? '#fbbf24' : '#34d399' }}>
                    {window.location.port === '5173'
                      ? 'Đang mở qua Vite Dev Server (Cổng 5173)'
                      : 'Đang mở qua High-Speed Production SPA (Cổng 8181)'}
                  </h4>
                  <p style={{ margin: 0, fontSize: '0.78rem', color: '#cbd5e1', lineHeight: '1.45' }}>
                    {window.location.port === '5173' ? (
                      <>
                        Cổng 5173 là môi trường phát triển (Dev Mode) gửi hơn 1,880 file code nhỏ lẻ qua Internet nên trang web load mất 5-15s.
                        <br />
                        👉 <strong>Khuyên dùng:</strong> Hãy mở trực tiếp đường dẫn <strong>http://{window.location.hostname}:8181</strong> để tải bản Production gộp 1 file duy nhất với tốc độ <strong>dưới 0.2 giây</strong>!
                      </>
                    ) : (
                      <>
                        Bạn đang sử dụng bản Production Bundle tối ưu cao cấp nhất (Gzip Compression + Immutable Assets Cache). Trang web nạp siêu tốc trong <strong>0.1 - 0.2 giây</strong>!
                      </>
                    )}
                  </p>
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button
                type="button"
                onClick={runFullSpeedTest}
                disabled={isTestingSpeed}
                style={{
                  background: 'rgba(56, 189, 248, 0.15)',
                  border: '1px solid rgba(56, 189, 248, 0.3)',
                  color: '#38bdf8',
                  padding: '0.6rem 1.1rem',
                  borderRadius: '8px',
                  fontWeight: 600,
                  fontSize: '0.85rem',
                  cursor: isTestingSpeed ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem'
                }}
              >
                <RefreshCw size={15} className={isTestingSpeed ? 'animate-spin' : ''} />
                <span>{isTestingSpeed ? 'Đang đo tốc độ...' : 'Đo lại đường truyền'}</span>
              </button>

              {window.location.port === '5173' && (
                <button
                  type="button"
                  onClick={() => {
                    window.location.href = `http://${window.location.hostname}:8181`;
                  }}
                  style={{
                    background: 'linear-gradient(135deg, #10b981, #059669)',
                    border: 'none',
                    color: 'white',
                    padding: '0.6rem 1.2rem',
                    borderRadius: '8px',
                    fontWeight: 700,
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)'
                  }}
                >
                  <span>Chuyển sang Cổng 8181 Siêu Tốc</span>
                  <ArrowRight size={15} />
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

