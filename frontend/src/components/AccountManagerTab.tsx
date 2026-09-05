import { useState, useEffect } from 'react';
import axios from 'axios';
import { getApiBaseUrl } from '../config';
import {
  Wallet,
  Plus,
  RefreshCw,
  Code,
  CheckCircle2,
  AlertTriangle,
  Mail,
  ShieldCheck,
  Search,
  Edit2,
  Trash2,
  X,
  Radio,
  Layers,
  Sparkles,
  Download,
  ChevronDown,
  ChevronUp
} from 'lucide-react';

interface AccountItem {
  account_id: string;
  account_label?: string;
  broker?: string;
  account_type?: string;
  currency?: string;
  profile_id?: string;
  profile_name?: string;
  ctid_email?: string;
  has_open_api?: boolean;
  enabled?: boolean;
  balance?: number;
  equity?: number;
  running_bots?: number;
  total_bots?: number;
  last_updated?: string;
}

interface ProfileItem {
  id: string;
  profile_name: string;
  enabled: boolean;
  ctid_email: string;
  ctid_password?: string;
  open_api?: {
    client_id?: string;
    client_secret?: string;
    access_token?: string;
    refresh_token?: string;
    environment?: string;
    redirect_uri?: string;
    last_refreshed?: string;
  };
  accounts?: any[];
}

interface AccountManagerTabProps {
  isGuest?: boolean;
  onNavigateToBots?: () => void;
}

export default function AccountManagerTab({ isGuest: _isGuest = false, onNavigateToBots }: AccountManagerTabProps) {
  const [accounts, setAccounts] = useState<AccountItem[]>([]);
  const [profiles, setProfiles] = useState<ProfileItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [reloading, setReloading] = useState<boolean>(false);
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Search and Filter State
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [filterType, setFilterType] = useState<'all' | 'live' | 'demo'>('all');
  const [filterBroker, setFilterBroker] = useState<string>('all');
  const [filterProfile, setFilterProfile] = useState<string>('all');

  // Test & Refresh Token State
  const [testingProfileId, setTestingProfileId] = useState<string | null>(null);
  const [refreshingProfileId, setRefreshingProfileId] = useState<string | null>(null);
  const [scanningProfileId, setScanningProfileId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<{ [profileId: string]: any }>({});

  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState<boolean>(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState<boolean>(false);
  const [isRawJsonModalOpen, setIsRawJsonModalOpen] = useState<boolean>(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState<boolean>(false);
  const [targetAccount, setTargetAccount] = useState<AccountItem | null>(null);

  // Add Form State
  const [addForm, setAddForm] = useState({
    profile_id: '',
    account_id: '',
    account_label: '',
    broker: 'FxPro',
    account_type: 'demo',
    currency: 'USD',
    enabled: true
  });

  // Edit Form State
  const [editForm, setEditForm] = useState({
    account_id: '',
    account_label: '',
    broker: '',
    account_type: '',
    currency: 'USD',
    enabled: true
  });

  // Raw JSON Editor State
  const [rawJsonText, setRawJsonText] = useState<string>('');
  const [rawJsonError, setRawJsonError] = useState<string | null>(null);
  const [savingRawJson, setSavingRawJson] = useState<boolean>(false);

  // Profile Modals State
  const [isAddProfileModalOpen, setIsAddProfileModalOpen] = useState<boolean>(false);
  const [isEditProfileModalOpen, setIsEditProfileModalOpen] = useState<boolean>(false);
  const [isDeleteProfileModalOpen, setIsDeleteProfileModalOpen] = useState<boolean>(false);
  const [targetProfile, setTargetProfile] = useState<ProfileItem | null>(null);
  const [isOpenApiAccordionOpen, setIsOpenApiAccordionOpen] = useState<boolean>(false);
  const [submittingProfile, setSubmittingProfile] = useState<boolean>(false);

  // Profile Form State
  const initialProfileForm = {
    profile_name: '',
    ctid_email: '',
    ctid_password: '',
    enabled: true,
    auto_scan: true,
    open_api: {
      client_id: '',
      client_secret: '',
      access_token: '',
      refresh_token: '',
      environment: 'live',
      redirect_uri: 'https://openapi.ctrader.com/apps/token'
    }
  };
  const [profileForm, setProfileForm] = useState(initialProfileForm);

  const fetchFullList = async () => {
    try {
      setLoading(true);
      const res = await axios.get(`${getApiBaseUrl()}/api/accounts/full-list`, { withCredentials: true });
      setAccounts(res.data.accounts || []);
      setProfiles(res.data.profiles || []);
      if (res.data.profiles && res.data.profiles.length > 0 && !addForm.profile_id) {
        setAddForm(prev => ({ ...prev, profile_id: res.data.profiles[0].id }));
      }
    } catch (err: any) {
      const msg = err.response?.data?.detail || 'Không thể tải danh sách tài khoản.';
      setActionMessage({ type: 'error', text: msg });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFullList();
  }, []);

  const handleReloadConfig = async () => {
    try {
      setReloading(true);
      const res = await axios.post(`${getApiBaseUrl()}/api/accounts/reload`, {}, { withCredentials: true });
      setActionMessage({ type: 'success', text: `Đã nạp lại cấu hình: ${res.data.synced_count} tài khoản được đồng bộ.` });
      await fetchFullList();
    } catch (err: any) {
      const msg = err.response?.data?.detail || 'Lỗi khi nạp lại cấu hình.';
      setActionMessage({ type: 'error', text: msg });
    } finally {
      setReloading(false);
    }
  };

  const handleTestConnection = async (profileId: string) => {
    try {
      setTestingProfileId(profileId);
      const res = await axios.post(`${getApiBaseUrl()}/api/accounts/profiles/${profileId}/test-connection`, {}, { withCredentials: true });
      setTestResults(prev => ({ ...prev, [profileId]: res.data }));
      if (res.data.status === 'success') {
        setActionMessage({ type: 'success', text: `Kết nối thành công tới ${res.data.environment?.toUpperCase()} (${res.data.latency_ms}ms, ${res.data.account_count} tài khoản khả dụng).` });
      } else {
        setActionMessage({ type: 'error', text: `Kiểm tra kết nối thất bại: ${res.data.message}` });
      }
    } catch (err: any) {
      const msg = err.response?.data?.detail || err.message || 'Lỗi kiểm tra kết nối Open API.';
      setActionMessage({ type: 'error', text: msg });
      setTestResults(prev => ({ ...prev, [profileId]: { status: 'error', message: msg } }));
    } finally {
      setTestingProfileId(null);
    }
  };

  const handleRefreshToken = async (profileId: string) => {
    try {
      setRefreshingProfileId(profileId);
      const res = await axios.post(`${getApiBaseUrl()}/api/accounts/profiles/${profileId}/refresh-token`, {}, { withCredentials: true });
      setActionMessage({ type: 'success', text: `Token đã được làm mới thành công (${res.data.access_token_masked}).` });
      await fetchFullList();
    } catch (err: any) {
      const msg = err.response?.data?.detail || err.message || 'Lỗi làm mới Token.';
      setActionMessage({ type: 'error', text: msg });
    } finally {
      setRefreshingProfileId(null);
    }
  };

  const handleScanAccounts = async (profileId: string) => {
    try {
      setScanningProfileId(profileId);
      const res = await axios.post(`${getApiBaseUrl()}/api/accounts/profiles/${profileId}/scan-accounts`, {}, { withCredentials: true });
      setActionMessage({ type: 'success', text: res.data.message || `Đã quét và đồng bộ thành công ${res.data.count} tài khoản từ cTID.` });
      await fetchFullList();
    } catch (err: any) {
      const msg = err.response?.data?.detail || err.message || 'Lỗi quét tài khoản từ cTID.';
      setActionMessage({ type: 'error', text: msg });
    } finally {
      setScanningProfileId(null);
    }
  };

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addForm.account_id) {
      setActionMessage({ type: 'error', text: 'Số tài khoản không được để trống.' });
      return;
    }
    try {
      await axios.post(`${getApiBaseUrl()}/api/accounts`, addForm, { withCredentials: true });
      setActionMessage({ type: 'success', text: `Đã thêm tài khoản #${addForm.account_id} thành công.` });
      setIsAddModalOpen(false);
      setAddForm({
        profile_id: profiles[0]?.id || '',
        account_id: '',
        account_label: '',
        broker: 'FxPro',
        account_type: 'demo',
        currency: 'USD',
        enabled: true
      });
      await fetchFullList();
    } catch (err: any) {
      const msg = err.response?.data?.detail || 'Lỗi thêm tài khoản.';
      setActionMessage({ type: 'error', text: msg });
    }
  };

  const handleOpenEdit = (acc: AccountItem) => {
    setEditForm({
      account_id: acc.account_id,
      account_label: acc.account_label || '',
      broker: acc.broker || 'FxPro',
      account_type: acc.account_type || 'demo',
      currency: acc.currency || 'USD',
      enabled: acc.enabled !== false
    });
    setIsEditModalOpen(true);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await axios.put(`${getApiBaseUrl()}/api/accounts/${editForm.account_id}`, editForm, { withCredentials: true });
      setActionMessage({ type: 'success', text: `Cập nhật thông tin tài khoản #${editForm.account_id} thành công.` });
      setIsEditModalOpen(false);
      await fetchFullList();
    } catch (err: any) {
      const msg = err.response?.data?.detail || 'Lỗi cập nhật tài khoản.';
      setActionMessage({ type: 'error', text: msg });
    }
  };

  const handleDeleteAccount = async () => {
    if (!targetAccount) return;
    try {
      await axios.delete(`${getApiBaseUrl()}/api/accounts/${targetAccount.account_id}`, { withCredentials: true });
      setActionMessage({ type: 'success', text: `Đã xóa tài khoản #${targetAccount.account_id}.` });
      setIsDeleteModalOpen(false);
      setTargetAccount(null);
      await fetchFullList();
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err.response?.data?.detail || 'Lỗi xóa tài khoản.' });
    } finally {
      setIsDeleteModalOpen(false);
    }
  };

  const handleOpenAddProfile = () => {
    setProfileForm(initialProfileForm);
    setIsOpenApiAccordionOpen(false);
    setIsAddProfileModalOpen(true);
  };

  const handleOpenEditProfile = (prof: ProfileItem) => {
    setTargetProfile(prof);
    setProfileForm({
      profile_name: prof.profile_name || '',
      ctid_email: prof.ctid_email || '',
      ctid_password: '',
      enabled: prof.enabled !== false,
      auto_scan: false,
      open_api: {
        client_id: prof.open_api?.client_id || '',
        client_secret: '',
        access_token: '',
        refresh_token: '',
        environment: prof.open_api?.environment || 'live',
        redirect_uri: prof.open_api?.redirect_uri || 'https://openapi.ctrader.com/apps/token'
      }
    });
    setIsOpenApiAccordionOpen(Boolean(prof.open_api?.client_id));
    setIsEditProfileModalOpen(true);
  };

  const handleOpenDeleteProfile = (prof: ProfileItem) => {
    setTargetProfile(prof);
    setIsDeleteProfileModalOpen(true);
  };

  const handleCreateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profileForm.profile_name || !profileForm.ctid_email || !profileForm.ctid_password) {
      setActionMessage({ type: 'error', text: 'Vui lòng điền đầy đủ Tên hồ sơ, Email và Mật khẩu cTID.' });
      return;
    }
    try {
      setSubmittingProfile(true);
      const res = await axios.post(`${getApiBaseUrl()}/api/accounts/profiles`, profileForm, { withCredentials: true });
      let successMsg = res.data.message || 'Tạo hồ sơ cTID thành công.';
      if (res.data.scan_result?.message) {
        successMsg += ` ${res.data.scan_result.message}`;
      }
      setActionMessage({ type: 'success', text: successMsg });
      setIsAddProfileModalOpen(false);
      await fetchFullList();
    } catch (err: any) {
      const msg = err.response?.data?.detail || err.message || 'Lỗi tạo hồ sơ cTID.';
      setActionMessage({ type: 'error', text: msg });
    } finally {
      setSubmittingProfile(false);
    }
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetProfile) return;
    try {
      setSubmittingProfile(true);
      const res = await axios.put(`${getApiBaseUrl()}/api/accounts/profiles/${targetProfile.id}`, profileForm, { withCredentials: true });
      setActionMessage({ type: 'success', text: res.data.message || 'Cập nhật hồ sơ thành công.' });
      setIsEditProfileModalOpen(false);
      await fetchFullList();
    } catch (err: any) {
      const msg = err.response?.data?.detail || err.message || 'Lỗi cập nhật hồ sơ.';
      setActionMessage({ type: 'error', text: msg });
    } finally {
      setSubmittingProfile(false);
    }
  };

  const handleDeleteProfile = async () => {
    if (!targetProfile) return;
    try {
      setSubmittingProfile(true);
      const res = await axios.delete(`${getApiBaseUrl()}/api/accounts/profiles/${targetProfile.id}`, { withCredentials: true });
      setActionMessage({ type: 'success', text: res.data.message || 'Đã xóa hồ sơ thành công.' });
      setIsDeleteProfileModalOpen(false);
      await fetchFullList();
    } catch (err: any) {
      const msg = err.response?.data?.detail || err.message || 'Lỗi khi xóa hồ sơ.';
      setActionMessage({ type: 'error', text: msg });
    } finally {
      setSubmittingProfile(false);
    }
  };

  const handleOpenRawJson = async () => {
    try {
      const res = await axios.get(`${getApiBaseUrl()}/api/accounts/raw-config`, { withCredentials: true });
      setRawJsonText(res.data.raw_json);
      setRawJsonError(null);
      setIsRawJsonModalOpen(true);
    } catch (err: any) {
      setActionMessage({ type: 'error', text: 'Không thể đọc file cấu hình JSON.' });
    }
  };

  const handlePrettifyJson = () => {
    try {
      const parsed = JSON.parse(rawJsonText);
      setRawJsonText(JSON.stringify(parsed, null, 2));
      setRawJsonError(null);
    } catch (err: any) {
      setRawJsonError(`Cú pháp JSON không hợp lệ: ${err.message}`);
    }
  };

  const handleSaveRawJson = async () => {
    try {
      setSavingRawJson(true);
      setRawJsonError(null);
      await axios.put(`${getApiBaseUrl()}/api/accounts/raw-config`, { raw_json: rawJsonText }, { withCredentials: true });
      setActionMessage({ type: 'success', text: 'Đã lưu cấu hình JSON và đồng bộ cơ sở dữ liệu thành công.' });
      setIsRawJsonModalOpen(false);
      await fetchFullList();
    } catch (err: any) {
      const msg = err.response?.data?.detail || err.message || 'Lỗi lưu cấu hình JSON.';
      setRawJsonError(msg);
    } finally {
      setSavingRawJson(false);
    }
  };

  // Filter calculations
  const uniqueBrokers = Array.from(new Set(accounts.map(a => a.broker || 'Khác'))).filter(Boolean);
  const filteredAccounts = accounts.filter(acc => {
    const matchesSearch =
      acc.account_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (acc.account_label || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (acc.broker || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (acc.ctid_email || '').toLowerCase().includes(searchTerm.toLowerCase());

    const matchesType =
      filterType === 'all' ||
      (filterType === 'live' && (acc.account_type || '').toLowerCase() === 'live') ||
      (filterType === 'demo' && (acc.account_type || '').toLowerCase() !== 'live');

    const matchesBroker = filterBroker === 'all' || (acc.broker || 'Khác') === filterBroker;
    const matchesProfile = filterProfile === 'all' || acc.profile_id === filterProfile;

    return matchesSearch && matchesType && matchesBroker && matchesProfile;
  });

  const liveAccounts = accounts.filter(a => (a.account_type || '').toLowerCase() === 'live');
  const demoAccounts = accounts.filter(a => (a.account_type || '').toLowerCase() !== 'live');
  const totalLiveBalance = liveAccounts.reduce((sum, a) => sum + (a.balance || 0), 0);
  const totalLiveEquity = liveAccounts.reduce((sum, a) => sum + (a.equity || 0), 0);
  const totalDemoBalance = demoAccounts.reduce((sum, a) => sum + (a.balance || 0), 0);
  const totalRunningBots = accounts.reduce((sum, a) => sum + (a.running_bots || 0), 0);

  const isAccountInProfile = (acc: AccountItem, prof: ProfileItem) => {
    if (acc.profile_id && acc.profile_id === prof.id) return true;
    if (acc.ctid_email && prof.ctid_email && acc.ctid_email.toLowerCase() === prof.ctid_email.toLowerCase()) return true;
    if (prof.accounts && prof.accounts.some((a: any) => String(a.account_id) === String(acc.account_id))) return true;
    return false;
  };

  return (
    <div style={{ color: '#f8fafc', maxWidth: '1600px', margin: '0 auto', paddingBottom: '3rem' }}>
      {/* Top Banner & Header */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '1rem',
        marginBottom: '1.5rem',
        background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.7) 0%, rgba(15, 23, 42, 0.9) 100%)',
        padding: '1.25rem 1.5rem',
        borderRadius: '12px',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.25)'
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.25rem' }}>
            <div style={{
              background: 'linear-gradient(135deg, #0284c7 0%, #38bdf8 100%)',
              padding: '0.5rem',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 0 15px rgba(56, 189, 248, 0.35)'
            }}>
              <Wallet size={22} color="#090d16" strokeWidth={2.5} />
            </div>
            <div>
              <h1 style={{ fontSize: '1.5rem', fontWeight: 800, margin: 0, letterSpacing: '-0.02em', color: '#f8fafc' }}>
                Account Manager
              </h1>
              <p style={{ margin: 0, fontSize: '0.8rem', color: '#94a3b8' }}>
                Quản lý tập trung các tài khoản giao dịch, hồ sơ cTrader ID (CTID) và cấu hình cTrader Open API
              </p>
            </div>
          </div>
        </div>

        {/* Global Action Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
          <button
            onClick={() => setIsAddModalOpen(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
              color: '#ffffff',
              border: '1px solid rgba(56, 189, 248, 0.4)',
              padding: '0.55rem 0.9rem',
              borderRadius: '6px',
              fontSize: '0.825rem',
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: '0 2px 10px rgba(2, 132, 199, 0.3)',
              transition: 'all 0.15s ease'
            }}
          >
            <Plus size={16} /> Thêm Tài Khoản
          </button>

          <button
            onClick={handleReloadConfig}
            disabled={reloading}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              background: 'rgba(30, 41, 59, 0.8)',
              color: '#38bdf8',
              border: '1px solid rgba(56, 189, 248, 0.25)',
              padding: '0.55rem 0.85rem',
              borderRadius: '6px',
              fontSize: '0.825rem',
              fontWeight: 600,
              cursor: reloading ? 'not-allowed' : 'pointer'
            }}
            title="Đọc lại ctrader_accounts.json và đồng bộ vào database"
          >
            <RefreshCw size={15} className={reloading ? 'spin' : ''} />
            {reloading ? 'Đang nạp...' : 'Nạp lại JSON'}
          </button>

          <button
            onClick={handleOpenRawJson}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              background: 'rgba(30, 41, 59, 0.8)',
              color: '#e2e8f0',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              padding: '0.55rem 0.85rem',
              borderRadius: '6px',
              fontSize: '0.825rem',
              fontWeight: 600,
              cursor: 'pointer'
            }}
            title="Mở trình biên tập JSON gốc"
          >
            <Code size={15} color="#a855f7" /> Xem/Sửa JSON
          </button>
        </div>
      </div>

      {/* Global Action Message Alert */}
      {actionMessage && (
        <div style={{
          marginBottom: '1.25rem',
          padding: '0.75rem 1rem',
          borderRadius: '8px',
          background: actionMessage.type === 'success' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
          border: `1px solid ${actionMessage.type === 'success' ? 'rgba(16, 185, 129, 0.35)' : 'rgba(239, 68, 68, 0.35)'}`,
          color: actionMessage.type === 'success' ? '#34d399' : '#f87171',
          fontSize: '0.85rem',
          fontWeight: 600,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {actionMessage.type === 'success' ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
            <span>{actionMessage.text}</span>
          </div>
          <button
            onClick={() => setActionMessage(null)}
            style={{ background: 'transparent', border: 'none', color: 'currentColor', cursor: 'pointer', padding: '2px' }}
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Overview Stat Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: '1rem',
        marginBottom: '1.5rem'
      }}>
        <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '8px', padding: '1rem' }}>
          <div style={{ color: '#94a3b8', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', marginBottom: '0.25rem' }}>Tổng Số Tài Khoản</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#38bdf8' }}>{accounts.length}</div>
          <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '0.2rem' }}>
            {accounts.filter(a => (a.account_type || '').toLowerCase() === 'live').length} Live • {accounts.filter(a => (a.account_type || '').toLowerCase() !== 'live').length} Demo
          </div>
        </div>

        <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '8px', padding: '1rem' }}>
          <div style={{ color: '#94a3b8', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', marginBottom: '0.25rem' }}>Hồ Sơ CTID</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#a855f7' }}>{profiles.length}</div>
          <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '0.2rem' }}>
            {profiles.filter(p => p.open_api?.access_token).length} đã cấu hình Open API
          </div>
        </div>

        <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '8px', padding: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
            <span style={{ color: '#94a3b8', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase' }}>Tổng Số Dư (Balance)</span>
            <span style={{ fontSize: '0.65rem', fontWeight: 800, padding: '0.1rem 0.35rem', borderRadius: '3px', background: 'rgba(16, 185, 129, 0.2)', color: '#34d399', border: '1px solid rgba(16, 185, 129, 0.35)' }}>
              CHỈ LIVE
            </span>
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#34d399' }}>
            ${totalLiveBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '0.2rem' }}>
            Đồng bộ thời gian thực{demoAccounts.length > 0 ? ` • Demo: $${totalDemoBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : ''}
          </div>
        </div>

        <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '8px', padding: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
            <span style={{ color: '#94a3b8', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase' }}>Vốn Khả Dụng (Equity)</span>
            <span style={{ fontSize: '0.65rem', fontWeight: 800, padding: '0.1rem 0.35rem', borderRadius: '3px', background: 'rgba(16, 185, 129, 0.2)', color: '#34d399', border: '1px solid rgba(16, 185, 129, 0.35)' }}>
              CHỈ LIVE
            </span>
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: totalLiveEquity >= totalLiveBalance ? '#34d399' : '#fbbf24' }}>
            ${totalLiveEquity.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '0.2rem' }}>
            {totalRunningBots} bot đang giao dịch
          </div>
        </div>
      </div>

      {/* SECTION 1: CTID PROFILES & OPEN API HEALTH CARDS */}
      <div style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0, color: '#e2e8f0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <ShieldCheck size={18} color="#38bdf8" /> Hồ Sơ cTrader ID (CTID) & Spotware Open API
          </h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{profiles.length} hồ sơ</span>
            <button
              onClick={handleOpenAddProfile}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
                background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
                color: '#ffffff',
                border: 'none',
                padding: '0.4rem 0.8rem',
                borderRadius: '6px',
                fontSize: '0.78rem',
                fontWeight: 700,
                cursor: 'pointer',
                boxShadow: '0 2px 10px rgba(2, 132, 199, 0.3)'
              }}
            >
              <Plus size={14} /> Thêm Hồ Sơ cTID
            </button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '1rem' }}>
          {profiles.map(prof => {
            const hasOa = Boolean(prof.open_api?.client_id && prof.open_api?.access_token);
            const testRes = testResults[prof.id];
            const isTesting = testingProfileId === prof.id;
            const isRefreshing = refreshingProfileId === prof.id;
            const isLiveEnv = (prof.open_api?.environment || 'demo').toLowerCase() === 'live';

            const profAccounts = accounts.filter(a => isAccountInProfile(a, prof));
            const profLiveAccounts = profAccounts.filter(a => (a.account_type || '').toLowerCase() === 'live');
            const profDemoAccounts = profAccounts.filter(a => (a.account_type || '').toLowerCase() !== 'live');
            const profLiveBalance = profLiveAccounts.reduce((sum, a) => sum + (a.balance || 0), 0);
            const profLiveEquity = profLiveAccounts.reduce((sum, a) => sum + (a.equity || 0), 0);
            const profDemoBalance = profDemoAccounts.reduce((sum, a) => sum + (a.balance || 0), 0);

            return (
              <div
                key={prof.id}
                style={{
                  background: '#1e293b',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '10px',
                  padding: '1.2rem',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  boxShadow: '0 4px 15px rgba(0, 0, 0, 0.15)'
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                    <div>
                      <div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#f8fafc' }}>
                        {prof.profile_name}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#94a3b8', fontSize: '0.78rem', marginTop: '0.2rem' }}>
                        <Mail size={13} /> {prof.ctid_email || 'Chưa cấu hình Email'}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <span style={{
                        fontSize: '0.68rem',
                        fontWeight: 700,
                        padding: '0.2rem 0.5rem',
                        borderRadius: '4px',
                        background: prof.enabled ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                        color: prof.enabled ? '#34d399' : '#f87171',
                        border: `1px solid ${prof.enabled ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`
                      }}>
                        {prof.enabled ? 'ACTIVE' : 'DISABLED'}
                      </span>
                      <button
                        onClick={() => handleOpenEditProfile(prof)}
                        style={{
                          background: 'rgba(56, 189, 248, 0.15)',
                          border: '1px solid rgba(56, 189, 248, 0.3)',
                          color: '#38bdf8',
                          padding: '0.25rem 0.45rem',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.2rem',
                          fontSize: '0.72rem'
                        }}
                        title="Chỉnh sửa thông tin hồ sơ"
                      >
                        <Edit2 size={12} />
                      </button>
                      <button
                        onClick={() => handleOpenDeleteProfile(prof)}
                        style={{
                          background: 'rgba(239, 68, 68, 0.15)',
                          border: '1px solid rgba(239, 68, 68, 0.3)',
                          color: '#f87171',
                          padding: '0.25rem 0.45rem',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.2rem',
                          fontSize: '0.72rem'
                        }}
                        title="Xóa hồ sơ cTID này"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>

                  {/* Financial Summary Strip (Live Balance & Equity) */}
                  <div style={{
                    background: 'rgba(15, 23, 42, 0.7)',
                    border: '1px solid rgba(56, 189, 248, 0.2)',
                    borderRadius: '6px',
                    padding: '0.6rem 0.85rem',
                    marginBottom: '0.85rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.35rem'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.4rem', fontSize: '0.825rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                        <span style={{ color: '#10b981', fontWeight: 700 }}>🟢 Live Balance:</span>
                        <span style={{ fontWeight: 800, color: '#f8fafc', fontFamily: 'monospace' }}>
                          ${profLiveBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                        <span style={{ color: '#64748b' }}>|</span>
                        <span style={{ color: '#38bdf8', fontWeight: 700 }}>Equity:</span>
                        <span style={{ fontWeight: 800, color: profLiveEquity >= profLiveBalance ? '#10b981' : '#fbbf24', fontFamily: 'monospace' }}>
                          ${profLiveEquity.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>
                      <span style={{ fontSize: '0.72rem', color: '#94a3b8', background: 'rgba(255, 255, 255, 0.05)', padding: '0.1rem 0.45rem', borderRadius: '4px' }}>
                        {profLiveAccounts.length} tài khoản Live
                      </span>
                    </div>
                    {profDemoAccounts.length > 0 && (
                      <div style={{ fontSize: '0.72rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '0.4rem', borderTop: '1px dashed rgba(255, 255, 255, 0.06)', paddingTop: '0.25rem' }}>
                        <span>🔵 Demo:</span>
                        <span style={{ color: '#94a3b8', fontFamily: 'monospace' }}>
                          ${profDemoBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                        <span>({profDemoAccounts.length} tài khoản)</span>
                      </div>
                    )}
                  </div>

                  {/* Open API Status Box */}
                  <div style={{
                    background: 'rgba(15, 23, 42, 0.6)',
                    border: '1px solid rgba(255, 255, 255, 0.05)',
                    borderRadius: '6px',
                    padding: '0.75rem',
                    marginBottom: '1rem'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                      <span style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 600 }}>Spotware Open API:</span>
                      <span style={{
                        fontSize: '0.68rem',
                        fontWeight: 700,
                        padding: '0.15rem 0.4rem',
                        borderRadius: '3px',
                        background: hasOa ? (isLiveEnv ? 'rgba(245, 158, 11, 0.2)' : 'rgba(56, 189, 248, 0.2)') : 'rgba(100, 116, 139, 0.2)',
                        color: hasOa ? (isLiveEnv ? '#fbbf24' : '#38bdf8') : '#94a3b8'
                      }}>
                        {hasOa ? (isLiveEnv ? 'LIVE API' : 'DEMO API') : 'CHƯA CẤU HÌNH'}
                      </span>
                    </div>

                    {hasOa && (
                      <>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: '#cbd5e1', marginBottom: '0.2rem' }}>
                          <span style={{ color: '#64748b' }}>Client ID:</span>
                          <span style={{ fontFamily: 'monospace' }}>{prof.open_api?.client_id || '—'}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: '#cbd5e1', marginBottom: '0.2rem' }}>
                          <span style={{ color: '#64748b' }}>Access Token:</span>
                          <span style={{ fontFamily: 'monospace', color: '#a855f7' }}>{prof.open_api?.access_token || '••••••••'}</span>
                        </div>
                        {prof.open_api?.last_refreshed && (
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: '#64748b' }}>
                            <span>Làm mới gần nhất:</span>
                            <span>{new Date(prof.open_api.last_refreshed).toLocaleDateString()}</span>
                          </div>
                        )}
                      </>
                    )}

                    {/* Test Connection Output */}
                    {testRes && (
                      <div style={{
                        marginTop: '0.5rem',
                        padding: '0.4rem 0.6rem',
                        borderRadius: '4px',
                        fontSize: '0.7rem',
                        background: testRes.status === 'success' ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                        color: testRes.status === 'success' ? '#34d399' : '#f87171',
                        border: `1px solid ${testRes.status === 'success' ? 'rgba(16, 185, 129, 0.25)' : 'rgba(239, 68, 68, 0.25)'}`,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.35rem'
                      }}>
                        <Radio size={12} className={testRes.status === 'success' ? '' : 'alert'} />
                        <span>
                          {testRes.status === 'success'
                            ? `Kết nối tốt (${testRes.latency_ms}ms) • ${testRes.account_count} tài khoản`
                            : `Lỗi: ${testRes.message}`}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Profile Card Actions */}
                <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
                  <button
                    onClick={() => handleScanAccounts(prof.id)}
                    disabled={scanningProfileId === prof.id || !prof.ctid_email}
                    style={{
                      flex: 1,
                      minWidth: '95px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.3rem',
                      background: 'rgba(16, 185, 129, 0.12)',
                      border: '1px solid rgba(16, 185, 129, 0.35)',
                      color: prof.ctid_email ? '#34d399' : '#64748b',
                      padding: '0.45rem 0.4rem',
                      borderRadius: '5px',
                      fontSize: '0.72rem',
                      fontWeight: 600,
                      cursor: prof.ctid_email && scanningProfileId !== prof.id ? 'pointer' : 'not-allowed'
                    }}
                    title="Tự động gọi ctrader-cli accounts để quét và nạp toàn bộ danh sách tài khoản của cTID này"
                  >
                    <Download size={13} className={scanningProfileId === prof.id ? 'spin' : ''} />
                    {scanningProfileId === prof.id ? 'Đang quét...' : 'Quét cTID'}
                  </button>

                  <button
                    onClick={() => handleTestConnection(prof.id)}
                    disabled={isTesting || !hasOa}
                    style={{
                      flex: 1,
                      minWidth: '95px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.3rem',
                      background: 'rgba(56, 189, 248, 0.12)',
                      border: '1px solid rgba(56, 189, 248, 0.3)',
                      color: hasOa ? '#38bdf8' : '#64748b',
                      padding: '0.45rem 0.4rem',
                      borderRadius: '5px',
                      fontSize: '0.72rem',
                      fontWeight: 600,
                      cursor: hasOa && !isTesting ? 'pointer' : 'not-allowed'
                    }}
                    title="Kiểm tra kết nối và tính hợp lệ của token tới cTrader Open API"
                  >
                    <Radio size={13} className={isTesting ? 'spin' : ''} />
                    {isTesting ? 'Đang test...' : 'Test API'}
                  </button>

                  <button
                    onClick={() => handleRefreshToken(prof.id)}
                    disabled={isRefreshing || !prof.open_api?.refresh_token}
                    style={{
                      flex: 1,
                      minWidth: '95px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.3rem',
                      background: 'rgba(168, 85, 247, 0.12)',
                      border: '1px solid rgba(168, 85, 247, 0.3)',
                      color: prof.open_api?.refresh_token ? '#c084fc' : '#64748b',
                      padding: '0.45rem 0.4rem',
                      borderRadius: '5px',
                      fontSize: '0.72rem',
                      fontWeight: 600,
                      cursor: prof.open_api?.refresh_token && !isRefreshing ? 'pointer' : 'not-allowed'
                    }}
                    title="Lấy Access Token mới bằng Refresh Token"
                  >
                    <RefreshCw size={13} className={isRefreshing ? 'spin' : ''} />
                    {isRefreshing ? 'Đang làm mới...' : 'Làm Mới Token'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* SECTION 2: ACCOUNTS DATA TABLE & FILTER BAR */}
      <div>
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '1rem',
          marginBottom: '1rem'
        }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0, color: '#e2e8f0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Layers size={18} color="#38bdf8" /> Danh Sách Tài Khoản Giao Dịch
            <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 400 }}>
              ({filteredAccounts.length} / {accounts.length} tài khoản)
            </span>
          </h2>

          {/* Filter Bar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
            {/* Search Box */}
            <div style={{ position: 'relative' }}>
              <Search size={14} color="#94a3b8" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }} />
              <input
                type="text"
                placeholder="Tìm account ID, alias, broker..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                style={{
                  background: '#090d16',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  borderRadius: '6px',
                  color: '#f8fafc',
                  padding: '0.4rem 0.6rem 0.4rem 2rem',
                  fontSize: '0.8rem',
                  width: '200px'
                }}
              />
            </div>

            {/* Filter Account Type */}
            <select
              value={filterType}
              onChange={e => setFilterType(e.target.value as any)}
              style={{
                background: '#090d16',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                borderRadius: '6px',
                color: '#f8fafc',
                padding: '0.4rem 0.6rem',
                fontSize: '0.8rem'
              }}
            >
              <option value="all">Tất cả loại (Live/Demo)</option>
              <option value="live">Chỉ Live</option>
              <option value="demo">Chỉ Demo</option>
            </select>

            {/* Filter Broker */}
            <select
              value={filterBroker}
              onChange={e => setFilterBroker(e.target.value)}
              style={{
                background: '#090d16',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                borderRadius: '6px',
                color: '#f8fafc',
                padding: '0.4rem 0.6rem',
                fontSize: '0.8rem'
              }}
            >
              <option value="all">Tất cả Sàn</option>
              {uniqueBrokers.map(b => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>

            {/* Filter Profile */}
            <select
              value={filterProfile}
              onChange={e => setFilterProfile(e.target.value)}
              style={{
                background: '#090d16',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                borderRadius: '6px',
                color: '#f8fafc',
                padding: '0.4rem 0.6rem',
                fontSize: '0.8rem'
              }}
            >
              <option value="all">Tất cả Profile</option>
              {profiles.map(p => (
                <option key={p.id} value={p.id}>{p.profile_name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Data Table */}
        <div style={{
          background: '#1e293b',
          border: '1px solid #334155',
          borderRadius: '8px',
          overflowX: 'auto',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)'
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.825rem' }}>
            <thead>
              <tr style={{ background: '#0f172a', borderBottom: '1px solid #334155', color: '#94a3b8' }}>
                <th style={{ padding: '0.75rem 1rem', fontWeight: 700 }}>Số Tài Khoản (Account ID)</th>
                <th style={{ padding: '0.75rem 1rem', fontWeight: 700 }}>Tên Gợi Nhớ (Alias)</th>
                <th style={{ padding: '0.75rem 1rem', fontWeight: 700 }}>Sàn (Broker)</th>
                <th style={{ padding: '0.75rem 1rem', fontWeight: 700 }}>Loại</th>
                <th style={{ padding: '0.75rem 1rem', fontWeight: 700, textAlign: 'right' }}>Số Dư (Balance)</th>
                <th style={{ padding: '0.75rem 1rem', fontWeight: 700, textAlign: 'right' }}>Vốn Khả Dụng (Equity)</th>
                <th style={{ padding: '0.75rem 1rem', fontWeight: 700, textAlign: 'center' }}>Bot Hoạt Động</th>
                <th style={{ padding: '0.75rem 1rem', fontWeight: 700, textAlign: 'right' }}>Thao Tác</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                      <RefreshCw size={18} className="spin" /> Đang tải danh sách tài khoản...
                    </div>
                  </td>
                </tr>
              ) : filteredAccounts.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>
                    Không tìm thấy tài khoản nào phù hợp với bộ lọc hiện tại.
                  </td>
                </tr>
              ) : (
                filteredAccounts.map(acc => {
                  const isLive = (acc.account_type || '').toLowerCase() === 'live';
                  return (
                    <tr
                      key={acc.account_id}
                      style={{
                        borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                        background: 'transparent',
                        transition: 'background 0.15s ease'
                      }}
                    >
                      {/* Account ID */}
                      <td style={{ padding: '0.75rem 1rem', fontWeight: 700, color: '#38bdf8', fontFamily: 'monospace', fontSize: '0.9rem' }}>
                        {acc.account_id}
                      </td>

                      {/* Alias */}
                      <td style={{ padding: '0.75rem 1rem', fontWeight: 600, color: '#f8fafc' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          <span>{acc.account_label || `Account #${acc.account_id}`}</span>
                          <button
                            onClick={() => handleOpenEdit(acc)}
                            style={{ background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer', padding: '2px' }}
                            title="Sửa Tên Gợi Nhớ"
                          >
                            <Edit2 size={12} />
                          </button>
                        </div>
                        <div style={{ fontSize: '0.7rem', color: '#64748b' }}>
                          Profile: {acc.profile_name || 'Mặc định'}
                        </div>
                      </td>

                      {/* Broker */}
                      <td style={{ padding: '0.75rem 1rem', color: '#cbd5e1', fontWeight: 500 }}>
                        <span style={{ background: 'rgba(255, 255, 255, 0.08)', padding: '0.15rem 0.45rem', borderRadius: '4px', fontSize: '0.75rem' }}>
                          {acc.broker || 'FxPro'}
                        </span>
                      </td>

                      {/* Account Type */}
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <span style={{
                          fontSize: '0.7rem',
                          fontWeight: 700,
                          padding: '0.15rem 0.45rem',
                          borderRadius: '4px',
                          background: isLive ? 'rgba(245, 158, 11, 0.2)' : 'rgba(56, 189, 248, 0.2)',
                          color: isLive ? '#fbbf24' : '#38bdf8',
                          border: `1px solid ${isLive ? 'rgba(245, 158, 11, 0.35)' : 'rgba(56, 189, 248, 0.35)'}`
                        }}>
                          {isLive ? 'LIVE' : 'DEMO'}
                        </span>
                      </td>

                      {/* Balance */}
                      <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 700, color: '#f8fafc', fontFamily: 'monospace' }}>
                        ${(acc.balance || 0).toFixed(2)}
                      </td>

                      {/* Equity */}
                      <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 700, fontFamily: 'monospace', color: (acc.equity || 0) >= (acc.balance || 0) ? '#34d399' : '#fbbf24' }}>
                        ${(acc.equity || 0).toFixed(2)}
                      </td>

                      {/* Running Bots */}
                      <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                        {(acc.running_bots || 0) > 0 ? (
                          <span
                            onClick={onNavigateToBots}
                            style={{
                              background: 'rgba(56, 189, 248, 0.2)',
                              color: '#38bdf8',
                              border: '1px solid rgba(56, 189, 248, 0.4)',
                              borderRadius: '12px',
                              padding: '0.15rem 0.55rem',
                              fontSize: '0.75rem',
                              fontWeight: 800,
                              cursor: onNavigateToBots ? 'pointer' : 'default'
                            }}
                            title="Nhấn để xem các bot trong Bot Manager"
                          >
                            {acc.running_bots} Active
                          </span>
                        ) : (
                          <span style={{ color: '#64748b', fontSize: '0.75rem' }}>0</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.4rem' }}>
                          <button
                            onClick={() => handleOpenEdit(acc)}
                            style={{
                              background: 'rgba(255, 255, 255, 0.08)',
                              border: 'none',
                              color: '#cbd5e1',
                              padding: '0.3rem 0.5rem',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.25rem',
                              fontSize: '0.72rem'
                            }}
                          >
                            <Edit2 size={12} /> Sửa
                          </button>

                          <button
                            onClick={() => {
                              setTargetAccount(acc);
                              setIsDeleteModalOpen(true);
                            }}
                            style={{
                              background: 'rgba(239, 68, 68, 0.15)',
                              border: '1px solid rgba(239, 68, 68, 0.3)',
                              color: '#f87171',
                              padding: '0.3rem 0.5rem',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.25rem',
                              fontSize: '0.72rem'
                            }}
                          >
                            <Trash2 size={12} /> Xóa
                          </button>
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

      {/* MODAL 1: THÊM TÀI KHOẢN MỚI */}
      {isAddModalOpen && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(3px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 100,
          padding: '1rem'
        }}>
          <div style={{
            background: '#1e293b',
            border: '1px solid #334155',
            borderRadius: '12px',
            width: '100%',
            maxWidth: '480px',
            padding: '1.5rem',
            boxShadow: '0 20px 40px rgba(0, 0, 0, 0.5)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Plus size={18} color="#38bdf8" /> Thêm Tài Khoản Giao Dịch
              </h3>
              <button
                onClick={() => setIsAddModalOpen(false)}
                style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateAccount}>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '0.3rem' }}>
                  Hồ Sơ CTID Trực Thuộc *
                </label>
                <select
                  value={addForm.profile_id}
                  onChange={e => setAddForm({ ...addForm, profile_id: e.target.value })}
                  required
                  style={{
                    width: '100%',
                    background: '#090d16',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    borderRadius: '6px',
                    color: '#f8fafc',
                    padding: '0.55rem',
                    fontSize: '0.85rem'
                  }}
                >
                  {profiles.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.profile_name} ({p.ctid_email})
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '0.3rem' }}>
                  Số Tài Khoản (Account Number / ID) *
                </label>
                <input
                  type="text"
                  placeholder="e.g. 46477582"
                  value={addForm.account_id}
                  onChange={e => setAddForm({ ...addForm, account_id: e.target.value.trim() })}
                  required
                  style={{
                    width: '100%',
                    background: '#090d16',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    borderRadius: '6px',
                    color: '#f8fafc',
                    padding: '0.55rem',
                    fontSize: '0.85rem',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '0.3rem' }}>
                  Tên Gợi Nhớ (Account Alias / Label)
                </label>
                <input
                  type="text"
                  placeholder="e.g. FxPro Live Scalping"
                  value={addForm.account_label}
                  onChange={e => setAddForm({ ...addForm, account_label: e.target.value })}
                  style={{
                    width: '100%',
                    background: '#090d16',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    borderRadius: '6px',
                    color: '#f8fafc',
                    padding: '0.55rem',
                    fontSize: '0.85rem',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '0.3rem' }}>
                    Sàn Giao Dịch (Broker)
                  </label>
                  <input
                    type="text"
                    value={addForm.broker}
                    onChange={e => setAddForm({ ...addForm, broker: e.target.value })}
                    style={{
                      width: '100%',
                      background: '#090d16',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      borderRadius: '6px',
                      color: '#f8fafc',
                      padding: '0.55rem',
                      fontSize: '0.85rem',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '0.3rem' }}>
                    Loại Tài Khoản
                  </label>
                  <select
                    value={addForm.account_type}
                    onChange={e => setAddForm({ ...addForm, account_type: e.target.value })}
                    style={{
                      width: '100%',
                      background: '#090d16',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      borderRadius: '6px',
                      color: '#f8fafc',
                      padding: '0.55rem',
                      fontSize: '0.85rem'
                    }}
                  >
                    <option value="demo">DEMO</option>
                    <option value="live">LIVE / REAL</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.25rem' }}>
                <input
                  type="checkbox"
                  id="enabledAdd"
                  checked={addForm.enabled}
                  onChange={e => setAddForm({ ...addForm, enabled: e.target.checked })}
                  style={{ width: '16px', height: '16px', accentColor: '#38bdf8' }}
                />
                <label htmlFor="enabledAdd" style={{ fontSize: '0.825rem', color: '#e2e8f0', cursor: 'pointer' }}>
                  Kích hoạt tài khoản ngay sau khi tạo
                </label>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  style={{
                    background: 'transparent',
                    border: '1px solid #475569',
                    color: '#94a3b8',
                    padding: '0.55rem 1rem',
                    borderRadius: '6px',
                    fontSize: '0.85rem',
                    cursor: 'pointer'
                  }}
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  style={{
                    background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
                    border: 'none',
                    color: '#ffffff',
                    padding: '0.55rem 1.25rem',
                    borderRadius: '6px',
                    fontSize: '0.85rem',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  Lưu & Đồng Bộ
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: CHỈNH SỬA TÀI KHOẢN */}
      {isEditModalOpen && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(3px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 100,
          padding: '1rem'
        }}>
          <div style={{
            background: '#1e293b',
            border: '1px solid #334155',
            borderRadius: '12px',
            width: '100%',
            maxWidth: '480px',
            padding: '1.5rem',
            boxShadow: '0 20px 40px rgba(0, 0, 0, 0.5)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Edit2 size={18} color="#38bdf8" /> Chỉnh Sửa Tài Khoản #{editForm.account_id}
              </h3>
              <button
                onClick={() => setIsEditModalOpen(false)}
                style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveEdit}>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '0.3rem' }}>
                  Tên Gợi Nhớ (Account Alias / Label)
                </label>
                <input
                  type="text"
                  value={editForm.account_label}
                  onChange={e => setEditForm({ ...editForm, account_label: e.target.value })}
                  style={{
                    width: '100%',
                    background: '#090d16',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    borderRadius: '6px',
                    color: '#f8fafc',
                    padding: '0.55rem',
                    fontSize: '0.85rem',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '0.3rem' }}>
                    Sàn Giao Dịch (Broker)
                  </label>
                  <input
                    type="text"
                    value={editForm.broker}
                    onChange={e => setEditForm({ ...editForm, broker: e.target.value })}
                    style={{
                      width: '100%',
                      background: '#090d16',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      borderRadius: '6px',
                      color: '#f8fafc',
                      padding: '0.55rem',
                      fontSize: '0.85rem',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '0.3rem' }}>
                    Loại Tài Khoản
                  </label>
                  <select
                    value={editForm.account_type}
                    onChange={e => setEditForm({ ...editForm, account_type: e.target.value })}
                    style={{
                      width: '100%',
                      background: '#090d16',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      borderRadius: '6px',
                      color: '#f8fafc',
                      padding: '0.55rem',
                      fontSize: '0.85rem'
                    }}
                  >
                    <option value="demo">DEMO</option>
                    <option value="live">LIVE / REAL</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.25rem' }}>
                <input
                  type="checkbox"
                  id="enabledEdit"
                  checked={editForm.enabled}
                  onChange={e => setEditForm({ ...editForm, enabled: e.target.checked })}
                  style={{ width: '16px', height: '16px', accentColor: '#38bdf8' }}
                />
                <label htmlFor="enabledEdit" style={{ fontSize: '0.825rem', color: '#e2e8f0', cursor: 'pointer' }}>
                  Kích hoạt tài khoản
                </label>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  style={{
                    background: 'transparent',
                    border: '1px solid #475569',
                    color: '#94a3b8',
                    padding: '0.55rem 1rem',
                    borderRadius: '6px',
                    fontSize: '0.85rem',
                    cursor: 'pointer'
                  }}
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  style={{
                    background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
                    border: 'none',
                    color: '#ffffff',
                    padding: '0.55rem 1.25rem',
                    borderRadius: '6px',
                    fontSize: '0.85rem',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  Lưu Thay Đổi
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: TRÌNH BIÊN TẬP JSON GỐC */}
      {isRawJsonModalOpen && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          backdropFilter: 'blur(3px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 110,
          padding: '1.5rem'
        }}>
          <div style={{
            background: '#1e293b',
            border: '1px solid #334155',
            borderRadius: '12px',
            width: '100%',
            maxWidth: '840px',
            maxHeight: '90vh',
            display: 'flex',
            flexDirection: 'column',
            padding: '1.5rem',
            boxShadow: '0 25px 50px rgba(0, 0, 0, 0.6)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Code size={20} color="#a855f7" /> Trình Biên Tập ctrader_accounts.json
                </h3>
                <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.75rem', color: '#94a3b8' }}>
                  Chỉnh sửa trực tiếp file cấu hình nguồn. Hệ thống sẽ kiểm tra cú pháp trước khi lưu và đồng bộ vào SQLite.
                </p>
              </div>
              <button
                onClick={() => setIsRawJsonModalOpen(false)}
                style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Error Message */}
            {rawJsonError && (
              <div style={{
                marginBottom: '0.75rem',
                padding: '0.6rem 0.85rem',
                borderRadius: '6px',
                background: 'rgba(239, 68, 68, 0.15)',
                border: '1px solid rgba(239, 68, 68, 0.35)',
                color: '#f87171',
                fontSize: '0.8rem',
                fontWeight: 600
              }}>
                {rawJsonError}
              </div>
            )}

            {/* Textarea */}
            <div style={{ flex: 1, minHeight: '380px', marginBottom: '1rem', display: 'flex', flexDirection: 'column' }}>
              <textarea
                value={rawJsonText}
                onChange={e => {
                  setRawJsonText(e.target.value);
                  setRawJsonError(null);
                }}
                style={{
                  flex: 1,
                  width: '100%',
                  background: '#090d16',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  borderRadius: '6px',
                  color: '#38bdf8',
                  fontFamily: 'Consolas, Monaco, "Courier New", monospace',
                  fontSize: '0.85rem',
                  lineHeight: '1.4',
                  padding: '1rem',
                  resize: 'none',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            {/* Bottom Controls */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <button
                onClick={handlePrettifyJson}
                style={{
                  background: 'rgba(255, 255, 255, 0.08)',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  color: '#cbd5e1',
                  padding: '0.5rem 0.85rem',
                  borderRadius: '6px',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.35rem'
                }}
              >
                <Sparkles size={14} color="#fbbf24" /> Định dạng JSON (Prettify)
              </button>

              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button
                  type="button"
                  onClick={() => setIsRawJsonModalOpen(false)}
                  style={{
                    background: 'transparent',
                    border: '1px solid #475569',
                    color: '#94a3b8',
                    padding: '0.5rem 1rem',
                    borderRadius: '6px',
                    fontSize: '0.825rem',
                    cursor: 'pointer'
                  }}
                >
                  Đóng
                </button>
                <button
                  type="button"
                  onClick={handleSaveRawJson}
                  disabled={savingRawJson}
                  style={{
                    background: 'linear-gradient(135deg, #a855f7 0%, #7e22ce 100%)',
                    border: 'none',
                    color: '#ffffff',
                    padding: '0.5rem 1.25rem',
                    borderRadius: '6px',
                    fontSize: '0.825rem',
                    fontWeight: 700,
                    cursor: savingRawJson ? 'not-allowed' : 'pointer'
                  }}
                >
                  {savingRawJson ? 'Đang lưu...' : 'Lưu & Đồng Bộ Cơ Sở Dữ Liệu'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: XÁC NHẬN XÓA TÀI KHOẢN */}
      {isDeleteModalOpen && targetAccount && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(3px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 100,
          padding: '1rem'
        }}>
          <div style={{
            background: '#1e293b',
            border: '1px solid rgba(239, 68, 68, 0.4)',
            borderRadius: '12px',
            width: '100%',
            maxWidth: '420px',
            padding: '1.5rem',
            boxShadow: '0 20px 40px rgba(0, 0, 0, 0.5)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', color: '#f87171', marginBottom: '1rem' }}>
              <AlertTriangle size={24} />
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: '#f8fafc' }}>
                Xác Nhận Xóa Tài Khoản
              </h3>
            </div>

            <p style={{ fontSize: '0.85rem', color: '#cbd5e1', lineHeight: '1.5', margin: '0 0 1.25rem 0' }}>
              Bạn có chắc chắn muốn xóa tài khoản <strong style={{ color: '#38bdf8' }}>#{targetAccount.account_id}</strong> ({targetAccount.account_label || 'Không tên'}) khỏi cấu hình hệ thống?
              Hành động này sẽ xóa tài khoản khỏi file cấu hình và cơ sở dữ liệu.
            </p>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button
                type="button"
                onClick={() => setIsDeleteModalOpen(false)}
                style={{
                  background: 'transparent',
                  border: '1px solid #475569',
                  color: '#94a3b8',
                  padding: '0.5rem 1rem',
                  borderRadius: '6px',
                  fontSize: '0.825rem',
                  cursor: 'pointer'
                }}
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleDeleteAccount}
                style={{
                  background: '#dc2626',
                  border: 'none',
                  color: '#ffffff',
                  padding: '0.5rem 1.25rem',
                  borderRadius: '6px',
                  fontSize: '0.825rem',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                Xác Nhận Xóa
              </button>
            </div>
          </div>
        </div>
      )}
      {/* MODAL 5: THÊM HỒ SƠ CTID MỚI */}
      {isAddProfileModalOpen && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(3px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 110,
          padding: '1rem'
        }}>
          <div style={{
            background: '#1e293b',
            border: '1px solid #334155',
            borderRadius: '12px',
            width: '100%',
            maxWidth: '540px',
            maxHeight: '90vh',
            overflowY: 'auto',
            padding: '1.5rem',
            boxShadow: '0 20px 40px rgba(0, 0, 0, 0.5)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Plus size={18} color="#38bdf8" /> Thêm Hồ Sơ cTrader ID (CTID) Mới
              </h3>
              <button
                onClick={() => setIsAddProfileModalOpen(false)}
                style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateProfile}>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '0.3rem' }}>
                  Tên Hồ Sơ (Profile Name) *
                </label>
                <input
                  type="text"
                  placeholder="e.g. Tài Khoản Phụ (Đối Tác)"
                  value={profileForm.profile_name}
                  onChange={e => setProfileForm({ ...profileForm, profile_name: e.target.value })}
                  required
                  style={{
                    width: '100%',
                    background: '#090d16',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    borderRadius: '6px',
                    color: '#f8fafc',
                    padding: '0.55rem',
                    fontSize: '0.85rem'
                  }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '0.3rem' }}>
                    Email Đăng Nhập cTID *
                  </label>
                  <input
                    type="email"
                    placeholder="user@example.com"
                    value={profileForm.ctid_email}
                    onChange={e => setProfileForm({ ...profileForm, ctid_email: e.target.value.trim() })}
                    required
                    style={{
                      width: '100%',
                      background: '#090d16',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      borderRadius: '6px',
                      color: '#f8fafc',
                      padding: '0.55rem',
                      fontSize: '0.85rem'
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '0.3rem' }}>
                    Mật Khẩu cTID *
                  </label>
                  <input
                    type="password"
                    placeholder="••••••••"
                    value={profileForm.ctid_password}
                    onChange={e => setProfileForm({ ...profileForm, ctid_password: e.target.value })}
                    required
                    style={{
                      width: '100%',
                      background: '#090d16',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      borderRadius: '6px',
                      color: '#f8fafc',
                      padding: '0.55rem',
                      fontSize: '0.85rem'
                    }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.25rem', background: 'rgba(15, 23, 42, 0.5)', padding: '0.75rem', borderRadius: '6px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', color: '#e2e8f0', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={profileForm.enabled}
                    onChange={e => setProfileForm({ ...profileForm, enabled: e.target.checked })}
                  />
                  Kích hoạt hồ sơ này (Active)
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', color: '#38bdf8', fontWeight: 600, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={profileForm.auto_scan}
                    onChange={e => setProfileForm({ ...profileForm, auto_scan: e.target.checked })}
                  />
                  Tự động quét tài khoản, balance & equity từ cTID ngay sau khi tạo
                </label>
              </div>

              {/* Accordion Open API */}
              <div style={{ marginBottom: '1.25rem', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '8px', overflow: 'hidden' }}>
                <button
                  type="button"
                  onClick={() => setIsOpenApiAccordionOpen(!isOpenApiAccordionOpen)}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    background: 'rgba(15, 23, 42, 0.8)',
                    border: 'none',
                    color: '#94a3b8',
                    padding: '0.65rem 0.9rem',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: isOpenApiAccordionOpen ? '#38bdf8' : '#cbd5e1' }}>
                    <ShieldCheck size={14} /> Cấu hình Spotware Open API (Tùy chọn)
                  </span>
                  {isOpenApiAccordionOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </button>

                {isOpenApiAccordionOpen && (
                  <div style={{ padding: '0.9rem', background: '#0b1120', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '0.2rem' }}>Client ID</label>
                        <input
                          type="text"
                          placeholder="e.g. 35921_..."
                          value={profileForm.open_api.client_id}
                          onChange={e => setProfileForm({ ...profileForm, open_api: { ...profileForm.open_api, client_id: e.target.value.trim() } })}
                          style={{ width: '100%', background: '#090d16', border: '1px solid rgba(255, 255, 255, 0.15)', borderRadius: '4px', color: '#f8fafc', padding: '0.45rem', fontSize: '0.8rem' }}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '0.2rem' }}>Client Secret</label>
                        <input
                          type="password"
                          placeholder="••••••••"
                          value={profileForm.open_api.client_secret}
                          onChange={e => setProfileForm({ ...profileForm, open_api: { ...profileForm.open_api, client_secret: e.target.value.trim() } })}
                          style={{ width: '100%', background: '#090d16', border: '1px solid rgba(255, 255, 255, 0.15)', borderRadius: '4px', color: '#f8fafc', padding: '0.45rem', fontSize: '0.8rem' }}
                        />
                      </div>
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '0.2rem' }}>Access Token</label>
                      <input
                        type="password"
                        placeholder="Token từ Spotware Playground..."
                        value={profileForm.open_api.access_token}
                        onChange={e => setProfileForm({ ...profileForm, open_api: { ...profileForm.open_api, access_token: e.target.value.trim() } })}
                        style={{ width: '100%', background: '#090d16', border: '1px solid rgba(255, 255, 255, 0.15)', borderRadius: '4px', color: '#f8fafc', padding: '0.45rem', fontSize: '0.8rem' }}
                      />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '0.2rem' }}>Refresh Token</label>
                        <input
                          type="password"
                          placeholder="••••••••"
                          value={profileForm.open_api.refresh_token}
                          onChange={e => setProfileForm({ ...profileForm, open_api: { ...profileForm.open_api, refresh_token: e.target.value.trim() } })}
                          style={{ width: '100%', background: '#090d16', border: '1px solid rgba(255, 255, 255, 0.15)', borderRadius: '4px', color: '#f8fafc', padding: '0.45rem', fontSize: '0.8rem' }}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '0.2rem' }}>Môi Trường</label>
                        <select
                          value={profileForm.open_api.environment}
                          onChange={e => setProfileForm({ ...profileForm, open_api: { ...profileForm.open_api, environment: e.target.value } })}
                          style={{ width: '100%', background: '#090d16', border: '1px solid rgba(255, 255, 255, 0.15)', borderRadius: '4px', color: '#f8fafc', padding: '0.45rem', fontSize: '0.8rem' }}
                        >
                          <option value="live">Live Broker</option>
                          <option value="demo">Demo Sandbox</option>
                        </select>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button
                  type="button"
                  onClick={() => setIsAddProfileModalOpen(false)}
                  style={{
                    background: 'transparent',
                    border: '1px solid #475569',
                    color: '#94a3b8',
                    padding: '0.55rem 1rem',
                    borderRadius: '6px',
                    fontSize: '0.825rem',
                    cursor: 'pointer'
                  }}
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={submittingProfile}
                  style={{
                    background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
                    border: 'none',
                    color: '#ffffff',
                    padding: '0.55rem 1.25rem',
                    borderRadius: '6px',
                    fontSize: '0.825rem',
                    fontWeight: 700,
                    cursor: submittingProfile ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem'
                  }}
                >
                  {submittingProfile && <RefreshCw size={14} className="spin" />}
                  {submittingProfile ? 'Đang tạo & Quét...' : 'Tạo Hồ Sơ cTID'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 6: CHỈNH SỬA HỒ SƠ CTID */}
      {isEditProfileModalOpen && targetProfile && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(3px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 110,
          padding: '1rem'
        }}>
          <div style={{
            background: '#1e293b',
            border: '1px solid #334155',
            borderRadius: '12px',
            width: '100%',
            maxWidth: '540px',
            maxHeight: '90vh',
            overflowY: 'auto',
            padding: '1.5rem',
            boxShadow: '0 20px 40px rgba(0, 0, 0, 0.5)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Edit2 size={18} color="#38bdf8" /> Chỉnh Sửa Hồ Sơ cTID
              </h3>
              <button
                onClick={() => setIsEditProfileModalOpen(false)}
                style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleUpdateProfile}>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '0.3rem' }}>
                  Tên Hồ Sơ (Profile Name) *
                </label>
                <input
                  type="text"
                  value={profileForm.profile_name}
                  onChange={e => setProfileForm({ ...profileForm, profile_name: e.target.value })}
                  required
                  style={{
                    width: '100%',
                    background: '#090d16',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    borderRadius: '6px',
                    color: '#f8fafc',
                    padding: '0.55rem',
                    fontSize: '0.85rem'
                  }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '0.3rem' }}>
                    Email Đăng Nhập cTID *
                  </label>
                  <input
                    type="email"
                    value={profileForm.ctid_email}
                    onChange={e => setProfileForm({ ...profileForm, ctid_email: e.target.value.trim() })}
                    required
                    style={{
                      width: '100%',
                      background: '#090d16',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      borderRadius: '6px',
                      color: '#f8fafc',
                      padding: '0.55rem',
                      fontSize: '0.85rem'
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '0.3rem' }}>
                    Mật Khẩu Mới (Tùy chọn)
                  </label>
                  <input
                    type="password"
                    placeholder="Để trống nếu giữ nguyên"
                    value={profileForm.ctid_password}
                    onChange={e => setProfileForm({ ...profileForm, ctid_password: e.target.value })}
                    style={{
                      width: '100%',
                      background: '#090d16',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      borderRadius: '6px',
                      color: '#f8fafc',
                      padding: '0.55rem',
                      fontSize: '0.85rem'
                    }}
                  />
                </div>
              </div>

              <div style={{ marginBottom: '1.25rem', background: 'rgba(15, 23, 42, 0.5)', padding: '0.75rem', borderRadius: '6px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', color: '#e2e8f0', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={profileForm.enabled}
                    onChange={e => setProfileForm({ ...profileForm, enabled: e.target.checked })}
                  />
                  Kích hoạt hồ sơ này (Active)
                </label>
              </div>

              {/* Accordion Open API */}
              <div style={{ marginBottom: '1.25rem', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '8px', overflow: 'hidden' }}>
                <button
                  type="button"
                  onClick={() => setIsOpenApiAccordionOpen(!isOpenApiAccordionOpen)}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    background: 'rgba(15, 23, 42, 0.8)',
                    border: 'none',
                    color: '#94a3b8',
                    padding: '0.65rem 0.9rem',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: isOpenApiAccordionOpen ? '#38bdf8' : '#cbd5e1' }}>
                    <ShieldCheck size={14} /> Cấu hình Spotware Open API (Tùy chọn)
                  </span>
                  {isOpenApiAccordionOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </button>

                {isOpenApiAccordionOpen && (
                  <div style={{ padding: '0.9rem', background: '#0b1120', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '0.2rem' }}>Client ID</label>
                        <input
                          type="text"
                          placeholder="Client ID..."
                          value={profileForm.open_api.client_id}
                          onChange={e => setProfileForm({ ...profileForm, open_api: { ...profileForm.open_api, client_id: e.target.value.trim() } })}
                          style={{ width: '100%', background: '#090d16', border: '1px solid rgba(255, 255, 255, 0.15)', borderRadius: '4px', color: '#f8fafc', padding: '0.45rem', fontSize: '0.8rem' }}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '0.2rem' }}>Client Secret</label>
                        <input
                          type="password"
                          placeholder="Để trống nếu giữ nguyên"
                          value={profileForm.open_api.client_secret}
                          onChange={e => setProfileForm({ ...profileForm, open_api: { ...profileForm.open_api, client_secret: e.target.value.trim() } })}
                          style={{ width: '100%', background: '#090d16', border: '1px solid rgba(255, 255, 255, 0.15)', borderRadius: '4px', color: '#f8fafc', padding: '0.45rem', fontSize: '0.8rem' }}
                        />
                      </div>
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '0.2rem' }}>Access Token</label>
                      <input
                        type="password"
                        placeholder="Để trống nếu giữ nguyên"
                        value={profileForm.open_api.access_token}
                        onChange={e => setProfileForm({ ...profileForm, open_api: { ...profileForm.open_api, access_token: e.target.value.trim() } })}
                        style={{ width: '100%', background: '#090d16', border: '1px solid rgba(255, 255, 255, 0.15)', borderRadius: '4px', color: '#f8fafc', padding: '0.45rem', fontSize: '0.8rem' }}
                      />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '0.2rem' }}>Refresh Token</label>
                        <input
                          type="password"
                          placeholder="Để trống nếu giữ nguyên"
                          value={profileForm.open_api.refresh_token}
                          onChange={e => setProfileForm({ ...profileForm, open_api: { ...profileForm.open_api, refresh_token: e.target.value.trim() } })}
                          style={{ width: '100%', background: '#090d16', border: '1px solid rgba(255, 255, 255, 0.15)', borderRadius: '4px', color: '#f8fafc', padding: '0.45rem', fontSize: '0.8rem' }}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '0.2rem' }}>Môi Trường</label>
                        <select
                          value={profileForm.open_api.environment}
                          onChange={e => setProfileForm({ ...profileForm, open_api: { ...profileForm.open_api, environment: e.target.value } })}
                          style={{ width: '100%', background: '#090d16', border: '1px solid rgba(255, 255, 255, 0.15)', borderRadius: '4px', color: '#f8fafc', padding: '0.45rem', fontSize: '0.8rem' }}
                        >
                          <option value="live">Live Broker</option>
                          <option value="demo">Demo Sandbox</option>
                        </select>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button
                  type="button"
                  onClick={() => setIsEditProfileModalOpen(false)}
                  style={{
                    background: 'transparent',
                    border: '1px solid #475569',
                    color: '#94a3b8',
                    padding: '0.55rem 1rem',
                    borderRadius: '6px',
                    fontSize: '0.825rem',
                    cursor: 'pointer'
                  }}
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={submittingProfile}
                  style={{
                    background: '#0284c7',
                    border: 'none',
                    color: '#ffffff',
                    padding: '0.55rem 1.25rem',
                    borderRadius: '6px',
                    fontSize: '0.825rem',
                    fontWeight: 700,
                    cursor: submittingProfile ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem'
                  }}
                >
                  {submittingProfile && <RefreshCw size={14} className="spin" />}
                  {submittingProfile ? 'Đang lưu...' : 'Lưu Thay Đổi'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 7: XÁC NHẬN XÓA HỒ SƠ CTID */}
      {isDeleteProfileModalOpen && targetProfile && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(3px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 110,
          padding: '1rem'
        }}>
          <div style={{
            background: '#1e293b',
            border: '1px solid rgba(239, 68, 68, 0.4)',
            borderRadius: '12px',
            width: '100%',
            maxWidth: '460px',
            padding: '1.5rem',
            boxShadow: '0 20px 40px rgba(0, 0, 0, 0.5)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', color: '#f87171', marginBottom: '1rem' }}>
              <AlertTriangle size={24} />
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: '#f8fafc' }}>
                Xác Nhận Xóa Hồ Sơ cTID
              </h3>
            </div>

            <p style={{ fontSize: '0.85rem', color: '#cbd5e1', lineHeight: '1.5', margin: '0 0 1rem 0' }}>
              Bạn có chắc chắn muốn xóa hồ sơ <strong style={{ color: '#38bdf8' }}>{targetProfile.profile_name}</strong> ({targetProfile.ctid_email})?
            </p>

            <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.25)', borderRadius: '6px', padding: '0.75rem', marginBottom: '1.25rem', fontSize: '0.78rem', color: '#fca5a5', lineHeight: '1.4' }}>
              ⚠️ Thao tác này sẽ xóa hồ sơ và dọn sạch <strong>{targetProfile.accounts?.length || 0}</strong> tài khoản trực thuộc khỏi cơ sở dữ liệu.
              Nếu có bot đang chạy trên bất kỳ tài khoản nào thuộc hồ sơ này, hệ thống sẽ chặn xóa để bảo đảm an toàn.
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button
                type="button"
                onClick={() => setIsDeleteProfileModalOpen(false)}
                style={{
                  background: 'transparent',
                  border: '1px solid #475569',
                  color: '#94a3b8',
                  padding: '0.5rem 1rem',
                  borderRadius: '6px',
                  fontSize: '0.825rem',
                  cursor: 'pointer'
                }}
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleDeleteProfile}
                disabled={submittingProfile}
                style={{
                  background: '#dc2626',
                  border: 'none',
                  color: '#ffffff',
                  padding: '0.5rem 1.25rem',
                  borderRadius: '6px',
                  fontSize: '0.825rem',
                  fontWeight: 700,
                  cursor: submittingProfile ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem'
                }}
              >
                {submittingProfile && <RefreshCw size={14} className="spin" />}
                {submittingProfile ? 'Đang xóa...' : 'Xác Nhận Xóa Hồ Sơ'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
