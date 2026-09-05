import { useState, useEffect } from 'react';
import axios from 'axios';
import { getApiBaseUrl } from '../config';
import {
  Sliders,
  X,
  RotateCcw,
  Save,
  Zap,
  Search,
  AlertCircle,
  Layers,
  Activity,
  Shield,
  Target,
  TrendingUp,
  Bell,
  RefreshCw,
  Wallet,
  ShieldCheck
} from 'lucide-react';

interface ParameterMeta {
  PropertyName: string;
  FriendlyName: string;
  GroupName?: string;
  Type: 'Boolean' | 'Double' | 'Int32' | 'String' | 'Enum';
  DefaultValue: any;
  MinValue?: number;
  MaxValue?: number;
  EnumValues?: { [key: string]: number };
}

interface AccountItem {
  account_id: string;
  account_label?: string;
  account_type?: string;
  broker?: string;
  currency?: string;
  ctid_email?: string;
  profile_id?: string;
  balance?: number;
  equity?: number;
  last_updated?: string;
}

interface ParameterStudioModalProps {
  botId: number;
  botName: string;
  status: 'RUNNING' | 'STOPPED' | 'ERROR';
  accounts?: AccountItem[];
  onNavigateToAccounts?: () => void;
  onClose: () => void;
  onSuccess: (msg: string) => void;
  isGuest?: boolean;
}

export default function ParameterStudioModal({
  botId,
  botName,
  status,
  accounts = [],
  onNavigateToAccounts,
  onClose,
  onSuccess,
  isGuest = false
}: ParameterStudioModalProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parameters, setParameters] = useState<ParameterMeta[]>([]);
  const [formValues, setFormValues] = useState<{ [key: string]: any }>({});
  const [selectedGroup, setSelectedGroup] = useState<string>('Account & Bot');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [restartOnSave, setRestartOnSave] = useState<boolean>(status === 'RUNNING');

  // Bot Instance Account & Credential Configuration
  const [accountInfo, setAccountInfo] = useState({
    name: botName,
    account_id: '',
    account_label: '',
    account_type: 'demo',
    ctid_email: '',
    ctid_password: '',
    symbol: 'XAUUSD',
    timeframe: 'm15'
  });

  // 1. Fetch schema and current values
  useEffect(() => {
    const fetchParams = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await axios.get(`${getApiBaseUrl()}/api/bots/${botId}/parameters`, {
          withCredentials: true
        });
        const schema = res.data?.schema?.Parameters || [];
        const savedValues = res.data?.values || {};

        setParameters(schema);

        setAccountInfo({
          name: res.data?.name || botName,
          account_id: res.data?.account_id || '',
          account_label: res.data?.account_label || '',
          account_type: res.data?.account_type || 'demo',
          ctid_email: res.data?.ctid_email || '',
          ctid_password: res.data?.ctid_password || '',
          symbol: res.data?.symbol || 'XAUUSD',
          timeframe: res.data?.timeframe || 'm15'
        });

        // Merge defaults with saved values
        const initialValues: { [key: string]: any } = {};
        schema.forEach((p: ParameterMeta) => {
          if (savedValues[p.PropertyName] !== undefined) {
            initialValues[p.PropertyName] = savedValues[p.PropertyName];
          } else {
            initialValues[p.PropertyName] = p.DefaultValue;
          }
        });
        setFormValues(initialValues);
      } catch (err: any) {
        console.error('Failed to load parameters:', err);
        setError(err.response?.data?.detail || 'Failed to extract bot parameters.');
      } finally {
        setLoading(false);
      }
    };

    fetchParams();
  }, [botId]);

  // Extract unique groups
  const groups = Array.from(new Set(parameters.map((p) => p.GroupName || 'General')));

  // Filtered parameters
  const filteredParams = parameters.filter((p) => {
    if (selectedGroup === 'Account & Bot') return false;
    if (selectedGroup !== 'ALL' && (p.GroupName || 'General') !== selectedGroup) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = p.PropertyName.toLowerCase().includes(q);
      const matchFriendly = p.FriendlyName?.toLowerCase().includes(q);
      const matchGroup = p.GroupName?.toLowerCase().includes(q);
      if (!matchName && !matchFriendly && !matchGroup) return false;
    }
    return true;
  });

  // Handle value change
  const handleChange = (name: string, value: any) => {
    setFormValues((prev) => ({
      ...prev,
      [name]: value
    }));
  };

  // Reset to default values
  const handleResetDefaults = () => {
    if (!window.confirm('Reset all parameters to cBot factory defaults?')) return;
    const defaults: { [key: string]: any } = {};
    parameters.forEach((p) => {
      defaults[p.PropertyName] = p.DefaultValue;
    });
    setFormValues(defaults);
  };

  // Save parameters to backend
  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await axios.post(
        `${getApiBaseUrl()}/api/bots/${botId}/parameters`,
        {
          parameters: formValues,
          restart: restartOnSave,
          name: accountInfo.name,
          account_id: accountInfo.account_id,
          account_label: accountInfo.account_label,
          account_type: accountInfo.account_type,
          ctid_email: '',
          ctid_password: '',
          symbol: accountInfo.symbol,
          timeframe: accountInfo.timeframe
        },
        { withCredentials: true }
      );

      if (res.data.status === 'success' || res.data.status === 'warning') {
        onSuccess(res.data.message || 'Parameters updated successfully.');
        onClose();
      }
    } catch (err: any) {
      console.error('Failed to save parameters:', err);
      const errDetail = err.response?.data?.detail;
      const formattedErr = typeof errDetail === 'string' ? errDetail : (errDetail ? JSON.stringify(errDetail) : 'Failed to save parameters.');
      setError(formattedErr);
    } finally {
      setSaving(false);
    }
  };

  const getGroupIcon = (groupName: string) => {
    const gn = groupName.toLowerCase();
    if (gn.includes('account') || gn.includes('bot') || gn.includes('ctid')) return <Wallet size={14} />;
    if (gn.includes('risk') || gn.includes('volume')) return <Shield size={14} />;
    if (gn.includes('stop') || gn.includes('profit') || gn.includes('target')) return <Target size={14} />;
    if (gn.includes('indicator') || gn.includes('trend')) return <TrendingUp size={14} />;
    if (gn.includes('dca') || gn.includes('even') || gn.includes('trailing')) return <Layers size={14} />;
    if (gn.includes('news') || gn.includes('telegram')) return <Bell size={14} />;
    if (gn.includes('protection') || gn.includes('circuit')) return <Activity size={14} />;
    return <Sliders size={14} />;
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(3, 7, 18, 0.85)',
        backdropFilter: 'blur(8px)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.5rem'
      }}
    >
      <div
        style={{
          backgroundColor: '#090d16',
          border: '1px solid rgba(56, 189, 248, 0.25)',
          borderRadius: '16px',
          width: '100%',
          maxWidth: '1050px',
          height: '88vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.9), 0 0 40px rgba(56, 189, 248, 0.15)',
          overflow: 'hidden'
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '1.2rem 1.5rem',
            background: 'linear-gradient(90deg, #0f172a 0%, #1e293b 100%)',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
                padding: '10px',
                borderRadius: '10px',
                color: '#ffffff',
                boxShadow: '0 0 15px rgba(2, 132, 199, 0.4)'
              }}
            >
              <Sliders size={22} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: '#f8fafc' }}>
                  Parameter Studio
                </h2>
                <span
                  style={{
                    background: status === 'RUNNING' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(148, 163, 184, 0.15)',
                    color: status === 'RUNNING' ? '#34d399' : '#94a3b8',
                    border: `1px solid ${status === 'RUNNING' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(148, 163, 184, 0.3)'}`,
                    padding: '2px 8px',
                    borderRadius: '12px',
                    fontSize: '0.72rem',
                    fontWeight: 700
                  }}
                >
                  {status}
                </span>
              </div>
              <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '2px' }}>
                Configuring runtime parameters for <strong style={{ color: '#38bdf8' }}>{botName}</strong> (#{botId})
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            style={{
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '8px',
              color: '#94a3b8',
              padding: '6px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center'
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Error Banner */}
        {error && (
          <div
            style={{
              background: 'rgba(239, 68, 68, 0.15)',
              borderBottom: '1px solid rgba(239, 68, 68, 0.3)',
              color: '#f87171',
              padding: '0.6rem 1.5rem',
              fontSize: '0.8rem',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            <AlertCircle size={15} />
            <span>{error}</span>
          </div>
        )}

        {/* Body Matrix */}
        {loading ? (
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '12px',
              color: '#64748b'
            }}
          >
            <RefreshCw size={28} className="live-pulse" />
            <div style={{ fontSize: '0.9rem' }}>Extracting metadata schema from cBot package...</div>
          </div>
        ) : (
          <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
            {/* Left Category Sidebar */}
            <div
              style={{
                width: '240px',
                background: 'rgba(15, 23, 42, 0.6)',
                borderRight: '1px solid rgba(255, 255, 255, 0.06)',
                display: 'flex',
                flexDirection: 'column',
                padding: '1rem',
                gap: '0.5rem'
              }}
            >
              {/* Search Box */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  background: '#090d16',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '6px',
                  padding: '0.4rem 0.6rem',
                  marginBottom: '0.5rem'
                }}
              >
                <Search size={14} color="#64748b" />
                <input
                  type="text"
                  placeholder="Search param..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#f8fafc',
                    outline: 'none',
                    paddingLeft: '0.5rem',
                    fontSize: '0.8rem',
                    width: '100%'
                  }}
                />
              </div>

              <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>
                Parameter Categories ({groups.length})
              </div>

              <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <button
                  onClick={() => setSelectedGroup('Account & Bot')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: '8px',
                    border: 'none',
                    background: selectedGroup === 'Account & Bot' ? 'rgba(56, 189, 248, 0.15)' : 'transparent',
                    color: selectedGroup === 'Account & Bot' ? '#38bdf8' : '#94a3b8',
                    fontSize: '0.78rem',
                    fontWeight: selectedGroup === 'Account & Bot' ? 700 : 500,
                    cursor: 'pointer',
                    textAlign: 'left'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Wallet size={14} color={selectedGroup === 'Account & Bot' ? '#38bdf8' : '#64748b'} /> Tài khoản & Bot
                  </div>
                  <span style={{ fontSize: '0.65rem', background: 'rgba(56, 189, 248, 0.2)', color: '#38bdf8', padding: '1px 5px', borderRadius: '4px' }}>Config</span>
                </button>

                <button
                  onClick={() => setSelectedGroup('ALL')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: '8px',
                    border: 'none',
                    background: selectedGroup === 'ALL' ? 'rgba(56, 189, 248, 0.15)' : 'transparent',
                    color: selectedGroup === 'ALL' ? '#38bdf8' : '#94a3b8',
                    fontSize: '0.78rem',
                    fontWeight: selectedGroup === 'ALL' ? 700 : 500,
                    cursor: 'pointer',
                    textAlign: 'left'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Layers size={14} /> All Parameters
                  </div>
                  <span style={{ fontSize: '0.7rem', opacity: 0.8 }}>{parameters.length}</span>
                </button>

                {groups.map((group) => {
                  const count = parameters.filter((p) => (p.GroupName || 'General') === group).length;
                  const isSelected = selectedGroup === group;
                  return (
                    <button
                      key={group}
                      onClick={() => setSelectedGroup(group)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        width: '100%',
                        padding: '8px 10px',
                        borderRadius: '8px',
                        border: 'none',
                        background: isSelected ? 'rgba(56, 189, 248, 0.15)' : 'transparent',
                        color: isSelected ? '#38bdf8' : '#94a3b8',
                        fontSize: '0.78rem',
                        fontWeight: isSelected ? 700 : 500,
                        cursor: 'pointer',
                        textAlign: 'left'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {getGroupIcon(group)}
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{group}</span>
                      </div>
                      <span style={{ fontSize: '0.7rem', opacity: 0.8, marginLeft: '4px' }}>{count}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Right Parameter Editors Area */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {selectedGroup === 'Account & Bot' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                  {/* Account & Bot Configuration Card */}
                  <div
                    style={{
                      background: 'rgba(30, 41, 59, 0.4)',
                      border: '1px solid rgba(56, 189, 248, 0.2)',
                      borderRadius: '12px',
                      padding: '1.25rem',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '1.25rem'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', paddingBottom: '0.75rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Wallet size={18} color="#38bdf8" />
                        <div>
                          <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#f8fafc' }}>
                            Thông tin Tài khoản & Bot Instance
                          </div>
                          <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                            Quản trị liên kết tài khoản cTrader & thông tin thực thi cho Bot #{botId}
                          </div>
                        </div>
                      </div>
                      {onNavigateToAccounts && (
                        <button
                          type="button"
                          onClick={() => {
                            onClose();
                            onNavigateToAccounts();
                          }}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: '#38bdf8',
                            fontSize: '0.75rem',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.25rem',
                            padding: '0.25rem 0.5rem',
                            borderRadius: '4px'
                          }}
                        >
                          <Sliders size={12} /> Quản lý tài khoản
                        </button>
                      )}
                    </div>

                    {/* Account Selector */}
                    <div>
                      <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#94a3b8', marginBottom: '6px', textTransform: 'uppercase' }}>
                        Tài khoản Giao dịch (Connected cTrader Account)
                      </label>
                      {accounts.length === 0 ? (
                        <div style={{
                          background: 'rgba(239, 68, 68, 0.1)',
                          border: '1px solid rgba(239, 68, 68, 0.3)',
                          borderRadius: '8px',
                          padding: '0.75rem 1rem',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between'
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#fca5a5', fontSize: '0.825rem' }}>
                            <AlertCircle size={16} />
                            <span>Chưa có danh sách tài khoản được cấu hình trong hệ thống.</span>
                          </div>
                          {onNavigateToAccounts && (
                            <button
                              type="button"
                              onClick={() => {
                                onClose();
                                onNavigateToAccounts();
                              }}
                              style={{
                                background: '#0284c7',
                                border: 'none',
                                color: 'white',
                                fontSize: '0.75rem',
                                padding: '0.3rem 0.65rem',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                fontWeight: 600
                              }}
                            >
                              + Thêm tài khoản
                            </button>
                          )}
                        </div>
                      ) : (
                        <>
                          <select
                            value={accountInfo.account_id}
                            onChange={(e) => {
                              const val = e.target.value;
                              const matched = accounts.find((a) => String(a.account_id) === val);
                              if (matched) {
                                const isLive = (matched.account_type || '').toLowerCase() === 'live';
                                setAccountInfo(prev => ({
                                  ...prev,
                                  account_id: String(matched.account_id),
                                  account_label: matched.account_label || `Account #${matched.account_id}`,
                                  account_type: isLive ? 'live' : 'demo'
                                }));
                              } else {
                                setAccountInfo(prev => ({ ...prev, account_id: val }));
                              }
                            }}
                            style={{
                              width: '100%',
                              background: '#090d16',
                              border: '1px solid rgba(255, 255, 255, 0.15)',
                              borderRadius: '6px',
                              color: '#f8fafc',
                              padding: '0.6rem 0.75rem',
                              fontSize: '0.875rem',
                              boxSizing: 'border-box'
                            }}
                          >
                            <option value="" disabled>-- Chọn tài khoản cTrader --</option>
                            {accounts.filter(a => (a.account_type || '').toLowerCase() === 'live').length > 0 && (
                              <optgroup label="🟢 TÀI KHOẢN LIVE / REAL">
                                {accounts.filter(a => (a.account_type || '').toLowerCase() === 'live').map((acc) => (
                                  <option key={acc.account_id} value={acc.account_id}>
                                    🟢 [LIVE] {acc.broker ? `${acc.broker} ` : ''}#{acc.account_id} {acc.account_label ? `— ${acc.account_label}` : ''} {acc.equity ? `(Equity: $${acc.equity.toLocaleString()})` : ''}
                                  </option>
                                ))}
                              </optgroup>
                            )}
                            {accounts.filter(a => (a.account_type || '').toLowerCase() !== 'live').length > 0 && (
                              <optgroup label="🔵 TÀI KHOẢN DEMO">
                                {accounts.filter(a => (a.account_type || '').toLowerCase() !== 'live').map((acc) => (
                                  <option key={acc.account_id} value={acc.account_id}>
                                    🔵 [DEMO] {acc.broker ? `${acc.broker} ` : ''}#{acc.account_id} {acc.account_label ? `— ${acc.account_label}` : ''} {acc.equity ? `(Equity: $${acc.equity.toLocaleString()})` : ''}
                                  </option>
                                ))}
                              </optgroup>
                            )}
                          </select>

                          {/* Selected Account Summary Card */}
                          {(() => {
                            const selectedAcc = accounts.find(a => String(a.account_id) === String(accountInfo.account_id));
                            if (!selectedAcc) return null;
                            const isLive = (selectedAcc.account_type || '').toLowerCase() === 'live';
                            return (
                              <div style={{
                                marginTop: '0.6rem',
                                padding: '0.75rem 1rem',
                                background: 'rgba(15, 23, 42, 0.75)',
                                border: `1px solid ${isLive ? 'rgba(245, 158, 11, 0.4)' : 'rgba(56, 189, 248, 0.4)'}`,
                                borderRadius: '8px',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '0.45rem'
                              }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <span style={{
                                      fontSize: '0.7rem',
                                      fontWeight: 800,
                                      padding: '0.15rem 0.45rem',
                                      borderRadius: '4px',
                                      background: isLive ? 'rgba(245, 158, 11, 0.2)' : 'rgba(56, 189, 248, 0.2)',
                                      color: isLive ? '#fbbf24' : '#38bdf8',
                                      border: `1px solid ${isLive ? 'rgba(245, 158, 11, 0.4)' : 'rgba(56, 189, 248, 0.4)'}`
                                    }}>
                                      {isLive ? 'LIVE' : 'DEMO'}
                                    </span>
                                    {selectedAcc.broker && (
                                      <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#cbd5e1', background: '#334155', padding: '0.1rem 0.45rem', borderRadius: '4px' }}>
                                        {selectedAcc.broker}
                                      </span>
                                    )}
                                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', fontWeight: 700, color: '#f8fafc' }}>
                                      #{selectedAcc.account_id}
                                    </span>
                                    {selectedAcc.account_label && (
                                      <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                                        ({selectedAcc.account_label})
                                      </span>
                                    )}
                                  </div>
                                  {selectedAcc.equity !== undefined && (
                                    <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#10b981' }}>
                                      Equity: ${selectedAcc.equity.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </div>
                                  )}
                                </div>
                                <div style={{ fontSize: '0.75rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                  <ShieldCheck size={13} color="#10b981" />
                                  <span>Tự động liên kết CTID Profile an toàn (không cần nhập mật khẩu)</span>
                                </div>
                              </div>
                            );
                          })()}
                        </>
                      )}
                    </div>

                    {/* Instance Name */}
                    <div>
                      <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#94a3b8', marginBottom: '4px', textTransform: 'uppercase' }}>
                        Tên Instance (Bot Name)
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Smart Trend Bot Pro"
                        value={accountInfo.name}
                        onChange={(e) => setAccountInfo({ ...accountInfo, name: e.target.value })}
                        style={{
                          width: '100%',
                          background: '#090d16',
                          border: '1px solid rgba(255, 255, 255, 0.15)',
                          borderRadius: '6px',
                          color: '#f8fafc',
                          padding: '0.55rem 0.75rem',
                          fontSize: '0.85rem',
                          boxSizing: 'border-box'
                        }}
                      />
                    </div>

                    {/* Symbol & Timeframe Grid */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                      {/* Symbol */}
                      <div>
                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#94a3b8', marginBottom: '4px', textTransform: 'uppercase' }}>
                          Cặp Tiền (Symbol)
                        </label>
                        <select
                          value={accountInfo.symbol}
                          onChange={(e) => setAccountInfo({ ...accountInfo, symbol: e.target.value })}
                          style={{
                            width: '100%',
                            background: '#090d16',
                            border: '1px solid rgba(255, 255, 255, 0.15)',
                            borderRadius: '6px',
                            color: '#f8fafc',
                            padding: '0.55rem 0.75rem',
                            fontSize: '0.85rem',
                            boxSizing: 'border-box'
                          }}
                        >
                          {/* Standard Forex & Commodities */}
                          <option value="XAUUSD">XAUUSD (Gold)</option>
                          <option value="EURUSD">EURUSD</option>
                          <option value="GBPUSD">GBPUSD</option>
                          <option value="USDJPY">USDJPY</option>
                          <option value="USDCAD">USDCAD</option>
                          <option value="EURCAD">EURCAD</option>
                          <option value="EURJPY">EURJPY</option>

                          {/* Standard Crypto */}
                          <option value="BTCUSD">BTCUSD (Bitcoin - Standard)</option>
                          <option value="ETHUSD">ETHUSD (Ethereum - Standard)</option>

                          {/* Official FxPro Broker Crypto */}
                          <option value="BITCOIN">BITCOIN (Bitcoin - FxPro)</option>
                          <option value="ETHEREUM">ETHEREUM (Ethereum - FxPro)</option>

                          {/* Standard Indices (Spotware, IC Markets, Pepperstone) */}
                          <option value="US TECH 100">US TECH 100 (Nasdaq 100 - Standard)</option>
                          <option value="US 30">US 30 (Dow Jones 30 - Standard)</option>
                          <option value="US 500">US 500 (S&P 500 - Standard)</option>
                          <option value="JAPAN 225">JAPAN 225 (Nikkei 225 - Standard)</option>
                          <option value="GERMANY 40">GERMANY 40 (DAX 40 - Standard)</option>
                          <option value="UK 100">UK 100 (FTSE 100 - Standard)</option>

                          {/* Official FxPro Broker Spot Indices */}
                          <option value="#USNDAQ100">#USNDAQ100 (US Nasdaq 100 - FxPro)</option>
                          <option value="#US30">#US30 (US Dow Jones 30 - FxPro)</option>
                          <option value="#USSPX500">#USSPX500 (US S&P 500 - FxPro)</option>
                          <option value="#Japan225">#Japan225 (Japan Nikkei 225 - FxPro)</option>
                          <option value="#Germany40">#Germany40 (Germany DAX 40 - FxPro)</option>
                          <option value="#UK100">#UK100 (UK FTSE 100 - FxPro)</option>
                          <option value="#Euro50">#Euro50 (Euro Stoxx 50 - FxPro)</option>
                          <option value="#AUS200">#AUS200 (Australia 200 - FxPro)</option>
                          <option value="#HongKong50">#HongKong50 (Hong Kong 50 - FxPro)</option>
                        </select>
                      </div>

                      {/* Timeframe */}
                      <div>
                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#94a3b8', marginBottom: '4px', textTransform: 'uppercase' }}>
                          Khung Thời Gian (Timeframe)
                        </label>
                        <select
                          value={accountInfo.timeframe}
                          onChange={(e) => setAccountInfo({ ...accountInfo, timeframe: e.target.value })}
                          style={{
                            width: '100%',
                            background: '#090d16',
                            border: '1px solid rgba(255, 255, 255, 0.15)',
                            borderRadius: '6px',
                            color: '#f8fafc',
                            padding: '0.55rem 0.75rem',
                            fontSize: '0.85rem',
                            boxSizing: 'border-box'
                          }}
                        >
                          <option value="m1">M1 (1 Minute)</option>
                          <option value="m5">M5 (5 Minutes)</option>
                          <option value="m15">M15 (15 Minutes)</option>
                          <option value="m30">M30 (30 Minutes)</option>
                          <option value="h1">H1 (1 Hour)</option>
                          <option value="h4">H4 (4 Hours)</option>
                          <option value="d1">D1 (Daily)</option>
                        </select>
                      </div>
                    </div>
                  </div>
                </div>
              ) : filteredParams.length === 0 ? (
                <div style={{ color: '#64748b', textAlign: 'center', marginTop: '3rem' }}>
                  No parameters matching "{searchQuery}" in group "{selectedGroup}".
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '1rem' }}>
                  {filteredParams.map((param) => {
                    const val = formValues[param.PropertyName];
                    const isBool = param.Type === 'Boolean';
                    const isDouble = param.Type === 'Double';
                    const isInt = param.Type === 'Int32';
                    const isNumber = isDouble || isInt;
                    const hasMinMax = isNumber && param.MinValue !== undefined && param.MaxValue !== undefined;

                    return (
                      <div
                        key={param.PropertyName}
                        style={{
                          background: 'rgba(30, 41, 59, 0.4)',
                          border: '1px solid rgba(255, 255, 255, 0.08)',
                          borderRadius: '10px',
                          padding: '0.9rem 1rem',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '8px',
                          transition: 'border-color 0.2s ease'
                        }}
                      >
                        {/* Parameter Header */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                          <div>
                            <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#f8fafc' }}>
                              {param.PropertyName}
                            </div>
                            {param.FriendlyName && param.FriendlyName !== param.PropertyName && (
                              <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '2px', lineHeight: '1.3' }}>
                                {param.FriendlyName.replace(/\\n/g, ' ')}
                              </div>
                            )}
                          </div>
                          <span
                            style={{
                              background: 'rgba(255, 255, 255, 0.05)',
                              color: '#64748b',
                              padding: '1px 6px',
                              borderRadius: '4px',
                              fontSize: '0.65rem',
                              fontFamily: 'monospace'
                            }}
                          >
                            {param.Type}
                          </span>
                        </div>

                        {/* Input Control */}
                        <div style={{ marginTop: '4px' }}>
                          {isBool ? (
                            <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                              <input
                                type="checkbox"
                                checked={!!val}
                                onChange={(e) => handleChange(param.PropertyName, e.target.checked)}
                                style={{ display: 'none' }}
                              />
                              <div
                                style={{
                                  width: '42px',
                                  height: '22px',
                                  backgroundColor: val ? '#10b981' : '#334155',
                                  borderRadius: '12px',
                                  position: 'relative',
                                  transition: 'background-color 0.2s ease',
                                  cursor: 'pointer'
                                }}
                              >
                                <div
                                  style={{
                                    width: '18px',
                                    height: '18px',
                                    backgroundColor: '#ffffff',
                                    borderRadius: '50%',
                                    position: 'absolute',
                                    top: '2px',
                                    left: val ? '22px' : '2px',
                                    transition: 'left 0.2s ease'
                                  }}
                                />
                              </div>
                              <span style={{ fontSize: '0.8rem', fontWeight: 600, color: val ? '#34d399' : '#94a3b8' }}>
                                {val ? 'ENABLED' : 'DISABLED'}
                              </span>
                            </label>
                          ) : hasMinMax ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: '0.72rem', color: '#64748b' }}>
                                  Range: [{param.MinValue} ... {param.MaxValue}]
                                </span>
                                <input
                                  type="number"
                                  step={isDouble ? '0.1' : '1'}
                                  min={param.MinValue}
                                  max={param.MaxValue}
                                  value={val ?? ''}
                                  onChange={(e) => handleChange(param.PropertyName, isDouble ? parseFloat(e.target.value) || 0 : parseInt(e.target.value, 10) || 0)}
                                  style={{
                                    width: '75px',
                                    background: '#090d16',
                                    border: '1px solid rgba(255, 255, 255, 0.15)',
                                    borderRadius: '4px',
                                    color: '#38bdf8',
                                    fontWeight: 700,
                                    fontSize: '0.82rem',
                                    padding: '2px 6px',
                                    textAlign: 'right'
                                  }}
                                />
                              </div>
                              <input
                                type="range"
                                min={param.MinValue}
                                max={param.MaxValue}
                                step={isDouble ? '0.1' : '1'}
                                value={val ?? param.DefaultValue}
                                onChange={(e) => handleChange(param.PropertyName, isDouble ? parseFloat(e.target.value) : parseInt(e.target.value, 10))}
                                style={{ width: '100%', accentColor: '#0284c7', cursor: 'pointer' }}
                              />
                            </div>
                          ) : param.Type === 'Enum' && param.EnumValues ? (
                            <select
                              value={val ?? param.DefaultValue}
                              onChange={(e) => handleChange(param.PropertyName, parseInt(e.target.value, 10))}
                              style={{
                                width: '100%',
                                background: '#090d16',
                                border: '1px solid rgba(255, 255, 255, 0.12)',
                                borderRadius: '6px',
                                color: '#38bdf8',
                                fontWeight: 600,
                                fontSize: '0.85rem',
                                padding: '6px 10px',
                                outline: 'none'
                              }}
                            >
                              {Object.entries(param.EnumValues).map(([enumName, enumVal]) => (
                                <option key={enumName} value={enumVal}>
                                  {enumName.replace(/_/g, ' ')}
                                </option>
                              ))}
                            </select>
                          ) : isNumber ? (
                            <input
                              type="number"
                              step={isDouble ? '0.1' : '1'}
                              value={val ?? ''}
                              onChange={(e) => handleChange(param.PropertyName, isDouble ? parseFloat(e.target.value) || 0 : parseInt(e.target.value, 10) || 0)}
                              style={{
                                width: '100%',
                                background: '#090d16',
                                border: '1px solid rgba(255, 255, 255, 0.12)',
                                borderRadius: '6px',
                                color: '#38bdf8',
                                fontWeight: 600,
                                fontSize: '0.85rem',
                                padding: '6px 10px',
                                outline: 'none'
                              }}
                            />
                          ) : (
                            <input
                              type="text"
                              value={val ?? ''}
                              onChange={(e) => handleChange(param.PropertyName, e.target.value)}
                              style={{
                                width: '100%',
                                background: '#090d16',
                                border: '1px solid rgba(255, 255, 255, 0.12)',
                                borderRadius: '6px',
                                color: '#f8fafc',
                                fontSize: '0.82rem',
                                padding: '6px 10px',
                                outline: 'none'
                              }}
                            />
                          )}
                        </div>

                        {/* Default Value Hint */}
                        <div style={{ fontSize: '0.68rem', color: '#64748b', display: 'flex', justifyContent: 'space-between', marginTop: '2px' }}>
                          <span>Default: {String(param.DefaultValue)}</span>
                          {param.GroupName && <span style={{ color: '#475569' }}>{param.GroupName}</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Footer Actions */}
        <div
          style={{
            padding: '1rem 1.5rem',
            background: 'rgba(15, 23, 42, 0.8)',
            borderTop: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '1rem'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <button
              onClick={handleResetDefaults}
              disabled={loading || saving || isGuest}
              title={isGuest ? "Chế độ Guest chỉ xem (View-Only), không thể chỉnh sửa tham số." : "Reset all parameters to cBot defaults"}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '8px',
                color: '#cbd5e1',
                padding: '0.5rem 0.9rem',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: isGuest ? 'not-allowed' : 'pointer',
                opacity: isGuest ? 0.45 : 1
              }}
            >
              <RotateCcw size={14} /> Reset Defaults
            </button>

            {status === 'RUNNING' && (
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: isGuest ? 'not-allowed' : 'pointer', fontSize: '0.8rem', color: '#cbd5e1', opacity: isGuest ? 0.5 : 1 }}>
                <input
                  type="checkbox"
                  disabled={isGuest}
                  checked={restartOnSave}
                  onChange={(e) => setRestartOnSave(e.target.checked)}
                  style={{ accentColor: '#10b981' }}
                />
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Zap size={14} color="#34d399" /> Automatically Restart Bot with New Parameters
                </span>
              </label>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <button
              onClick={onClose}
              style={{
                background: 'transparent',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                borderRadius: '8px',
                color: '#94a3b8',
                padding: '0.5rem 1rem',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Close
            </button>

            <button
              onClick={handleSave}
              disabled={loading || saving || isGuest}
              title={isGuest ? "Chế độ Guest chỉ xem (View-Only), không thể lưu cấu hình tham số." : "Save and apply parameters to bot instance"}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                background: isGuest 
                  ? 'rgba(100, 116, 139, 0.3)'
                  : restartOnSave
                    ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
                    : 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
                border: 'none',
                borderRadius: '8px',
                color: '#ffffff',
                padding: '0.55rem 1.4rem',
                fontSize: '0.82rem',
                fontWeight: 700,
                cursor: isGuest ? 'not-allowed' : 'pointer',
                opacity: loading || saving || isGuest ? 0.5 : 1,
                boxShadow: isGuest ? 'none' : restartOnSave ? '0 0 15px rgba(16, 185, 129, 0.35)' : '0 0 15px rgba(2, 132, 199, 0.35)'
              }}
            >
              {saving ? (
                <>
                  <RefreshCw size={15} className="live-pulse" /> Saving...
                </>
              ) : isGuest ? (
                <>
                  <Save size={15} /> Save (Disabled)
                </>
              ) : restartOnSave ? (
                <>
                  <Zap size={15} /> Save & Restart Bot
                </>
              ) : (
                <>
                  <Save size={15} /> Save Parameters
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
