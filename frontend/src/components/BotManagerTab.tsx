import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { getApiBaseUrl, getWsBaseUrl } from '../config';
import {
  Play,
  Square,
  RotateCcw,
  Terminal,
  Upload,
  Bot,
  Cpu,
  Trash2,
  Copy,
  Check,
  Search,
  Wallet,
  FileCode,
  RefreshCw,
  X,
  Zap,
  Activity,
  AlertCircle,
  FolderOpen,
  Sliders,
  ArrowDown,
  GripVertical,
  ShieldCheck,
  Layers
} from 'lucide-react';
import ParameterStudioModal from './ParameterStudioModal';

interface BotInstance {
  id: number;
  name: string;
  algo_path: string;
  algo_name?: string;
  account_id: string;
  account_label?: string;
  account_type?: string;
  account_balance?: number;
  account_equity?: number;
  symbol: string;
  timeframe: string;
  status: 'RUNNING' | 'STOPPED' | 'ERROR';
  pid?: number | null;
  created_at: string;
  open_positions?: number;
  has_code_update?: boolean;
}

interface CBotItem {
  filename: string;
  name: string;
  rel_path: string;
  abs_path: string;
  size_bytes: number;
  size_formatted: string;
  modified_at: string;
  has_source: boolean;
  symbol_hint: string;
  timeframe_hint: string;
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

interface BotManagerTabProps {
  data: any;
  refreshData: () => void;
  isGuest?: boolean;
  onNavigateToAccounts?: () => void;
}

export default function BotManagerTab({ data, refreshData, isGuest = false, onNavigateToAccounts }: BotManagerTabProps) {
  const [cbots, setCbots] = useState<CBotItem[]>(data?.available_cbots || []);
  const [accounts, setAccounts] = useState<AccountItem[]>(data?.accounts || []);
  const [selectedBotId, setSelectedBotId] = useState<number | null>(null);
  const [paramModalBot, setParamModalBot] = useState<BotInstance | null>(null);
  const [botLogs, setBotLogs] = useState<string[]>([]);
  const [autoScroll, setAutoScroll] = useState<boolean>(true);
  const [logFilter, setLogFilter] = useState<string>('');
  const [actionLoading, setActionLoading] = useState<{ [key: number]: boolean }>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Modals
  const [isDeployModalOpen, setIsDeployModalOpen] = useState(false);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);

  // Deploy Form State
  const [deployForm, setDeployForm] = useState({
    name: '',
    algo_path: '',
    account_id: '',
    account_label: '',
    account_type: 'demo',
    symbol: 'XAUUSD',
    timeframe: 'm15',
    ctid_email: '',
    ctid_password: '',
    auto_start: true
  });

  // Upload Form State
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const logPollRef = useRef<any>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const logContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch updated cbots library and accounts
  const fetchAuxiliaryData = async () => {
    try {
      const [cbotsRes, accountsRes] = await Promise.all([
        axios.get(`${getApiBaseUrl()}/api/cbots`, { withCredentials: true }),
        axios.get(`${getApiBaseUrl()}/api/accounts`, { withCredentials: true })
      ]);
      if (cbotsRes.data?.cbots) setCbots(cbotsRes.data.cbots);
      if (accountsRes.data?.accounts) setAccounts(accountsRes.data.accounts);
    } catch (err) {
      console.error('Error fetching auxiliary data:', err);
    }
  };

  useEffect(() => {
    fetchAuxiliaryData();
  }, []);

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

  // Show status banner temporarily (safe against non-string inputs)
  const showBanner = (type: 'success' | 'error', text: any) => {
    const safeText = typeof text === 'string' ? text : formatErrorMessage(text, 'Có lỗi xảy ra');
    setStatusMessage({ type, text: safeText });
    setTimeout(() => {
      setStatusMessage(null);
    }, 5500);
  };

  // Copy to clipboard helper
  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(text);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const [bulkLoading, setBulkLoading] = useState<{ action: 'start' | 'stop' | 'restart'; fleet: 'live' | 'demo' } | null>(null);
  const [bulkModalFleet, setBulkModalFleet] = useState<'live' | 'demo' | null>(null);
  const [orderedBots, setOrderedBots] = useState<BotInstance[]>(data?.bots || []);
  const [draggedBotId, setDraggedBotId] = useState<number | null>(null);
  const [dragOverBotId, setDragOverBotId] = useState<number | null>(null);

  useEffect(() => {
    if (data?.bots) {
      setOrderedBots(data.bots);
    }
  }, [data?.bots]);

  // Drag & Drop reordering handlers
  const handleDragStart = (e: React.DragEvent, botId: number) => {
    if (isGuest) return;
    setDraggedBotId(botId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(botId));
  };

  const handleDragOver = (e: React.DragEvent, botId: number) => {
    if (isGuest || draggedBotId === null || draggedBotId === botId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverBotId !== botId) {
      setDragOverBotId(botId);
    }
  };

  const handleDragLeave = () => {
    setDragOverBotId(null);
  };

  const handleDrop = async (e: React.DragEvent, targetBotId: number) => {
    e.preventDefault();
    setDragOverBotId(null);
    if (isGuest || draggedBotId === null || draggedBotId === targetBotId) {
      setDraggedBotId(null);
      return;
    }

    const currentList = [...orderedBots];
    const fromIndex = currentList.findIndex((b) => b.id === draggedBotId);
    const toIndex = currentList.findIndex((b) => b.id === targetBotId);

    if (fromIndex === -1 || toIndex === -1) {
      setDraggedBotId(null);
      return;
    }

    // Move item
    const [movedBot] = currentList.splice(fromIndex, 1);
    currentList.splice(toIndex, 0, movedBot);

    // Optimistic UI update
    setOrderedBots(currentList);
    setDraggedBotId(null);

    // Persist to Backend SQLite
    try {
      const payload = { ordered_ids: currentList.map((b) => b.id) };
      await axios.post(`${getApiBaseUrl()}/api/bots/reorder`, payload, { withCredentials: true });
      showBanner('success', 'Đã cập nhật và lưu vị trí bot vào cơ sở dữ liệu thành công!');
    } catch (err: any) {
      const msg = formatErrorMessage(err.response?.data?.detail || err.message, 'Lỗi khi lưu thứ tự bot');
      showBanner('error', msg);
      if (data?.bots) setOrderedBots(data.bots);
    }
  };

  const handleDragEnd = () => {
    setDraggedBotId(null);
    setDragOverBotId(null);
  };

  const botsList: BotInstance[] = orderedBots;

  // Bot Instance Lifecycle Handlers
  const handleAction = async (botId: number, action: 'start' | 'stop' | 'restart') => {
    setActionLoading((prev) => ({ ...prev, [botId]: true }));
    try {
      const res = await axios.post(`${getApiBaseUrl()}/api/bots/${botId}/${action}`, {}, { withCredentials: true });
      if (res.data.status === 'success') {
        showBanner('success', `Bot #${botId} ${action.toUpperCase()} action executed successfully.`);
      }
      refreshData();
      fetchAuxiliaryData();
    } catch (err: any) {
      const errMsg = formatErrorMessage(err.response?.data?.detail, `Failed to ${action} bot #${botId}`);
      showBanner('error', errMsg);
    } finally {
      setActionLoading((prev) => ({ ...prev, [botId]: false }));
    }
  };

  // Bulk Action CPU Gate Modal State
  const [bulkModalAction, setBulkModalAction] = useState<'start' | 'restart' | null>(null);
  const [maxCpuThreshold, setMaxCpuThreshold] = useState<number>(40);
  const [minDelaySeconds, setMinDelaySeconds] = useState<number>(10);
  const [maxWaitSeconds, setMaxWaitSeconds] = useState<number>(90);
  const [systemMetrics, setSystemMetrics] = useState<{ cpu_percent: number; ram_percent: number; ram_used_mb?: number; ram_total_mb?: number }>({
    cpu_percent: data?.vps_cpu_percent ?? 0,
    ram_percent: data?.vps_ram_percent ?? 0
  });

  // Sync initial metrics whenever data updates
  useEffect(() => {
    if (data?.vps_cpu_percent !== undefined) {
      setSystemMetrics((prev) => ({
        ...prev,
        cpu_percent: data.vps_cpu_percent ?? prev.cpu_percent,
        ram_percent: data.vps_ram_percent ?? prev.ram_percent
      }));
    }
  }, [data?.vps_cpu_percent, data?.vps_ram_percent]);

  // Poll system metrics when bulk configuration modal is open
  useEffect(() => {
    if (!bulkModalAction) return;
    let isMounted = true;
    const fetchMetrics = async () => {
      try {
        const res = await axios.get(`${getApiBaseUrl()}/api/system/metrics`, { withCredentials: true, timeout: 3000 });
        if (isMounted && res.data && typeof res.data.cpu_percent === 'number') {
          setSystemMetrics(res.data);
        }
      } catch (e) {
        if (isMounted && data?.vps_cpu_percent !== undefined) {
          setSystemMetrics((prev) => ({
            ...prev,
            cpu_percent: data.vps_cpu_percent,
            ram_percent: data.vps_ram_percent
          }));
        }
      }
    };
    fetchMetrics();
    const interval = setInterval(fetchMetrics, 2000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [bulkModalAction, data]);

  // Bulk Fleet Action Handler (Per Fleet: 'live' | 'demo')
  const handleBulkAction = async (action: 'start' | 'stop' | 'restart', fleet: 'live' | 'demo') => {
    const targetBots = orderedBots.filter((b) =>
      fleet === 'live'
        ? (b.account_type || '').toLowerCase() === 'live'
        : (b.account_type || '').toLowerCase() !== 'live'
    );
    const fleetName = fleet === 'live' ? 'LIVE' : 'DEMO';

    if (action === 'stop') {
      const runningCount = targetBots.filter((b) => b.status === 'RUNNING').length;
      if (runningCount === 0) {
        showBanner('error', `Không có bot nào trong ${fleetName} Fleet đang chạy để dừng.`);
        return;
      }
      if (!window.confirm(`⚠️ CẢNH BÁO: Bạn có chắc chắn muốn DỪNG TẤT CẢ ${runningCount} bot ${fleetName} đang chạy?`)) {
        return;
      }
      setBulkLoading({ action: 'stop', fleet });
      try {
        const res = await axios.post(
          `${getApiBaseUrl()}/api/bots/bulk/stop`,
          { account_type: fleet },
          { withCredentials: true }
        );
        if (res.data.status === 'success') {
          const r = res.data.result || {};
          showBanner('success', `⏹️ Stop All [${fleetName} FLEET] hoàn tất: ${r.stopped || 0} bot đã dừng, ${r.failed || 0} lỗi.`);
          refreshData();
          fetchAuxiliaryData();
        }
      } catch (err: any) {
        const errMsg = formatErrorMessage(err.response?.data?.detail, `Lỗi khi thực thi STOP ${fleetName} fleet.`);
        showBanner('error', errMsg);
      } finally {
        setBulkLoading(null);
      }
      return;
    }

    if (action === 'restart') {
      if (targetBots.length === 0) {
        showBanner('error', `Danh sách ${fleetName} Fleet hiện đang trống.`);
        return;
      }
      setBulkModalAction('restart');
      setBulkModalFleet(fleet);
      return;
    }

    if (action === 'start') {
      const stoppedCount = targetBots.filter((b) => b.status !== 'RUNNING').length;
      if (stoppedCount === 0) {
        showBanner('success', `Toàn bộ ${targetBots.length} bot trong ${fleetName} Fleet hiện đều đang chạy!`);
        return;
      }
      setBulkModalAction('start');
      setBulkModalFleet(fleet);
      return;
    }
  };

  // Confirm and execute CPU-gated bulk start / restart for selected fleet
  const executeBulkActionWithCpuGate = async () => {
    if (!bulkModalAction || !bulkModalFleet) return;
    const action = bulkModalAction;
    const fleet = bulkModalFleet;
    const fleetName = fleet === 'live' ? 'LIVE' : 'DEMO';
    setBulkModalAction(null);
    setBulkModalFleet(null);
    setBulkLoading({ action, fleet });

    try {
      const payload = {
        account_type: fleet,
        max_cpu_threshold: Number(maxCpuThreshold),
        min_delay_seconds: Number(minDelaySeconds),
        max_wait_seconds: Number(maxWaitSeconds)
      };
      const res = await axios.post(`${getApiBaseUrl()}/api/bots/bulk/${action}`, payload, { withCredentials: true });
      if (res.data.status === 'success') {
        if (action === 'start') {
          showBanner('success', `▶️ ${res.data.message || `Đang khởi chạy tuần tự các bot [${fleetName} FLEET] (CPU Gate < ${maxCpuThreshold}%)...`}`);
        } else if (action === 'restart') {
          showBanner('success', `🔄 ${res.data.message || `Đang khởi động lại [${fleetName} FLEET] (CPU Gate < ${maxCpuThreshold}%)...`}`);
        }

        // Trigger immediate refresh and periodic fast-polling every 3s
        refreshData();
        fetchAuxiliaryData();
        let pollCount = 0;
        const fastPollInterval = setInterval(() => {
          pollCount++;
          refreshData();
          fetchAuxiliaryData();
          if (pollCount >= 80) {
            clearInterval(fastPollInterval);
          }
        }, 3000);
      }
    } catch (err: any) {
      const errMsg = formatErrorMessage(err.response?.data?.detail, `Lỗi khi thực thi ${action.toUpperCase()} [${fleetName} FLEET].`);
      showBanner('error', errMsg);
    } finally {
      setBulkLoading(null);
    }
  };

  // Smart Incremental Restart Handler
  const handleRestartUpdated = async () => {
    const updatedBots = orderedBots.filter(b => b.status === 'RUNNING' && b.has_code_update);
    if (updatedBots.length === 0) {
      showBanner('success', 'Tất cả các bot đang chạy đều là phiên bản mới nhất. Không cần restart.');
      return;
    }
    const names = updatedBots.map(b => b.name).join(', ');
    if (!window.confirm(`⚡ Smart Restart: Khởi động lại ${updatedBots.length} bot có bản build mới?\n(${names})\n\nCác bot khác sẽ tiếp tục chạy bình thường không bị ảnh hưởng.`)) {
      return;
    }
    setBulkLoading({ action: 'restart', fleet: 'live' });
    try {
      const res = await axios.post(
        `${getApiBaseUrl()}/api/bots/bulk/restart-updated`,
        {},
        { withCredentials: true }
      );
      showBanner('success', res.data.message || `Đã kích hoạt Smart Restart cho ${updatedBots.length} bot.`);
      setTimeout(refreshData, 2500);
    } catch (err: any) {
      showBanner('error', formatErrorMessage(err.response?.data?.detail, 'Lỗi khi kích hoạt Smart Restart.'));
    } finally {
      setBulkLoading(null);
    }
  };

  const handleDeleteBot = async (botId: number, botName: string) => {
    if (!window.confirm(`Are you sure you want to delete bot "${botName}" (#${botId})?`)) return;
    try {
      await axios.post(`${getApiBaseUrl()}/api/bots/${botId}/delete`, {}, { withCredentials: true });
      showBanner('success', `Bot #${botId} removed.`);
      refreshData();
    } catch (err: any) {
      showBanner('error', err.response?.data?.detail || 'Failed to delete bot');
    }
  };

  // Open Log Streamer
  const openLogs = async (botId: number) => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    if (logPollRef.current) {
      clearInterval(logPollRef.current);
      logPollRef.current = null;
    }
    setSelectedBotId(botId);
    setAutoScroll(true);
    setBotLogs(['[Initializing] Connecting to bot process log stream...']);

    // 1. Fetch initial log snapshot immediately via HTTP
    const fetchHttpLogs = async () => {
      try {
        const res = await axios.get(`${getApiBaseUrl()}/api/bots/${botId}/logs`, { withCredentials: true });
        if (res.data?.logs) {
          const rawLogs = res.data.logs;
          const lines = Array.isArray(rawLogs) 
            ? rawLogs 
            : typeof rawLogs === 'string' 
              ? rawLogs.split('\n').filter(Boolean) 
              : [];
          if (lines.length > 0) {
            setBotLogs(lines);
          }
        }
      } catch (err) {
        console.error('Failed to fetch initial logs via HTTP:', err);
      }
    };

    await fetchHttpLogs();

    // 2. Connect via WebSocket for real-time streaming with automatic fallback
    try {
      const ws = new WebSocket(`${getWsBaseUrl()}/ws/logs/bot/${botId}`);
      ws.onmessage = (event) => {
        if (event.data) {
          setBotLogs((prev) => [...prev, event.data]);
        }
      };
      ws.onerror = () => {
        // Start polling fallback every 3 seconds if WebSocket is blocked or disconnected
        if (!logPollRef.current) {
          logPollRef.current = setInterval(fetchHttpLogs, 3000);
        }
      };
      ws.onclose = () => {
        // If WebSocket closes, start HTTP polling fallback
        if (!logPollRef.current) {
          logPollRef.current = setInterval(fetchHttpLogs, 3000);
        }
      };
      wsRef.current = ws;
    } catch (wsErr) {
      console.error('WebSocket connection failed:', wsErr);
      if (!logPollRef.current) {
        logPollRef.current = setInterval(fetchHttpLogs, 3000);
      }
    }
  };

  const closeLogs = () => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    if (logPollRef.current) {
      clearInterval(logPollRef.current);
      logPollRef.current = null;
    }
    setSelectedBotId(null);
  };

  // Smart manual scroll detection
  const handleLogScroll = () => {
    if (!logContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = logContainerRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight <= 45;
    if (isAtBottom !== autoScroll) {
      setAutoScroll(isAtBottom);
    }
  };

  // Auto-scroll to bottom only when autoScroll is enabled
  useEffect(() => {
    if (autoScroll && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [botLogs, autoScroll]);

  useEffect(() => {
    return () => {
      if (wsRef.current) wsRef.current.close();
      if (logPollRef.current) clearInterval(logPollRef.current);
    };
  }, []);

  // Helper for generating smart, consistent Bot Instance names
  const generateBotInstanceName = (baseName: string, accountId?: string, symbol?: string, timeframe?: string): string => {
    const cleanBase = (baseName || 'cBot')
      .replace(/\s*\[.*?\]\s*$/, '')
      .replace(/\s*-\s*[A-Z0-9]+$/i, '')
      .trim();
    const parts: string[] = [];
    if (accountId) parts.push(`#${accountId}`);
    if (symbol) {
      const tfStr = (timeframe || 'm15').toUpperCase();
      parts.push(`${symbol} ${tfStr}`);
    }
    return parts.length > 0 ? `${cleanBase} [${parts.join(' - ')}]` : cleanBase;
  };

  // Quick Open Deploy Modal from Catalog
  const handleDeployCbot = (cbot: CBotItem) => {
    const defaultAcc = accounts.length > 0 ? accounts[0] : null;
    const isLive = defaultAcc ? (defaultAcc.account_type || '').toLowerCase() === 'live' : false;
    const cleanCbotName = cbot.name.replace(/[^a-zA-Z0-9 _-]/g, '').trim();
    const sym = cbot.symbol_hint || 'XAUUSD';
    const tf = cbot.timeframe_hint || 'm15';

    setDeployForm({
      name: generateBotInstanceName(cleanCbotName, defaultAcc?.account_id, sym, tf),
      algo_path: cbot.filename,
      account_id: defaultAcc ? String(defaultAcc.account_id) : '',
      account_label: defaultAcc ? defaultAcc.account_label || `Account #${defaultAcc.account_id}` : 'Main Account',
      account_type: isLive ? 'live' : 'demo',
      symbol: sym,
      timeframe: tf,
      ctid_email: '',
      ctid_password: '',
      auto_start: true
    });
    setIsDeployModalOpen(true);
  };

  // Submit Deploy Form
  const handleDeploySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deployForm.name || !deployForm.algo_path || !deployForm.account_id) {
      showBanner('error', 'Please fill in Bot Name, Algo File, and Account Number.');
      return;
    }
    try {
      const res = await axios.post(`${getApiBaseUrl()}/api/bots`, deployForm, { withCredentials: true });
      if (res.data.status === 'success') {
        showBanner('success', `Bot instance "${deployForm.name}" created and deployed successfully!`);
        setIsDeployModalOpen(false);
        refreshData();
        fetchAuxiliaryData();
      }
    } catch (err: any) {
      showBanner('error', err.response?.data?.detail || 'Failed to deploy bot instance.');
    }
  };

  // Submit File Upload Form
  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile) return;

    const formData = new FormData();
    formData.append('file', uploadFile);

    setIsUploading(true);
    try {
      const res = await axios.post(`${getApiBaseUrl()}/api/cbots/upload`, formData, {
        withCredentials: true,
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      if (res.data.status === 'success') {
        showBanner('success', `cBot "${res.data.filename}" imported to library!`);
        setUploadFile(null);
        setIsUploadModalOpen(false);
        fetchAuxiliaryData();
        refreshData();
      }
    } catch (err: any) {
      showBanner('error', err.response?.data?.detail || 'Failed to upload bot file.');
    } finally {
      setIsUploading(false);
    }
  };

  // Computed Metrics (Deduplicated by unique active account_id to prevent double counting)
  const runningBots = botsList.filter((b) => b.status === 'RUNNING');
  
  const uniqueActiveAccountsMap = new Map<string, number>();
  runningBots.forEach((b) => {
    const accKey = (b.account_id && String(b.account_id).trim()) || `bot_${b.id}`;
    const eq = Number(b.account_equity) || 0;
    if (!uniqueActiveAccountsMap.has(accKey) || eq > 0) {
      uniqueActiveAccountsMap.set(accKey, eq);
    }
  });
  const totalRunningEquity = Array.from(uniqueActiveAccountsMap.values()).reduce((acc, val) => acc + val, 0);
  const activeAccountsCount = uniqueActiveAccountsMap.size;

  // Segment into Live Bots and Demo Bots
  const liveBots = orderedBots.filter((b) => (b.account_type || '').toLowerCase() === 'live');
  const demoBots = orderedBots.filter((b) => (b.account_type || '').toLowerCase() !== 'live');

  const runningLiveBots = liveBots.filter((b) => b.status === 'RUNNING');
  const runningDemoBots = demoBots.filter((b) => b.status === 'RUNNING');

  const liveAccountsMap = new Map<string, number>();
  runningLiveBots.forEach((b) => {
    const accKey = (b.account_id && String(b.account_id).trim()) || `bot_${b.id}`;
    const eq = Number(b.account_equity) || 0;
    if (!liveAccountsMap.has(accKey) || eq > 0) liveAccountsMap.set(accKey, eq);
  });
  const totalLiveEquity = Array.from(liveAccountsMap.values()).reduce((acc, val) => acc + val, 0);

  const demoAccountsMap = new Map<string, number>();
  runningDemoBots.forEach((b) => {
    const accKey = (b.account_id && String(b.account_id).trim()) || `bot_${b.id}`;
    const eq = Number(b.account_equity) || 0;
    if (!demoAccountsMap.has(accKey) || eq > 0) demoAccountsMap.set(accKey, eq);
  });
  const totalDemoEquity = Array.from(demoAccountsMap.values()).reduce((acc, val) => acc + val, 0);

  // Filtered available cBots for search
  const filteredCbots = cbots.filter(
    (c) =>
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.symbol_hint.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.filename.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Render Bot Table Helper with Drag & Drop
  const renderBotTable = (bots: BotInstance[], sectionTheme: 'live' | 'demo') => {
    if (bots.length === 0) {
      return (
        <div
          style={{
            padding: '2.5rem 1rem',
            textAlign: 'center',
            color: '#94a3b8',
            background: 'rgba(30, 41, 59, 0.3)',
            borderRadius: '10px',
            border: '1px dashed rgba(255, 255, 255, 0.08)'
          }}
        >
          <Bot size={36} style={{ opacity: 0.3, marginBottom: '0.75rem' }} />
          <h4 style={{ color: '#cbd5e1', margin: '0 0 0.4rem', fontSize: '0.95rem', fontWeight: 600 }}>
            {sectionTheme === 'live' ? 'Chưa có Bot nào triển khai trên Tài khoản LIVE' : 'Chưa có Bot nào triển khai trên Tài khoản DEMO'}
          </h4>
          <p style={{ fontSize: '0.8rem', maxWidth: '420px', margin: '0 auto', color: '#64748b' }}>
            {sectionTheme === 'live'
              ? 'Nhấn "Deploy Instance" và chọn loại tài khoản Live để đưa chiến thuật vào giao dịch thực tế.'
              : 'Chọn bot từ thư viện cBot hoặc nhấn "Deploy Instance" để thêm bot thử nghiệm.'}
          </p>
        </div>
      );
    }

    return (
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'separate', borderSpacing: '0 0.5rem' }}>
          <thead>
            <tr style={{ color: '#94a3b8', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              <th style={{ padding: '0.75rem 0.5rem', width: '38px', textAlign: 'center' }} title="Cầm icon ⠿ và kéo thả để thay đổi vị trí">
                ⠿
              </th>
              <th style={{ padding: '0.75rem 0.75rem' }}>Bot / Strategy</th>
              <th style={{ padding: '0.75rem 0.75rem' }}>Tên Tài Khoản</th>
              <th style={{ padding: '0.75rem 0.75rem' }}>Account Number</th>
              <th style={{ padding: '0.75rem 0.75rem' }}>Process ID (PID)</th>
              <th style={{ padding: '0.75rem 0.75rem' }}>Account Equity</th>
              <th style={{ padding: '0.75rem 0.75rem' }}>Pair / TF</th>
              <th style={{ padding: '0.75rem 0.75rem' }}>Status</th>
              <th style={{ padding: '0.75rem 0.75rem', textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {bots.map((bot) => {
              const isRunning = bot.status === 'RUNNING';
              const equityNum = Number(bot.account_equity) || 0;
              const balanceNum = Number(bot.account_balance) || 0;
              const isLoading = actionLoading[bot.id] || false;
              const isBeingDragged = draggedBotId === bot.id;
              const isDragTarget = dragOverBotId === bot.id;

              return (
                <tr
                  key={bot.id}
                  draggable={!isGuest}
                  onDragStart={(e) => handleDragStart(e, bot.id)}
                  onDragOver={(e) => handleDragOver(e, bot.id)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, bot.id)}
                  onDragEnd={handleDragEnd}
                  style={{
                    background: isDragTarget
                      ? 'rgba(56, 189, 248, 0.18)'
                      : isRunning
                      ? 'rgba(30, 41, 59, 0.75)'
                      : 'rgba(15, 23, 42, 0.6)',
                    border: isDragTarget
                      ? '2px dashed #38bdf8'
                      : isRunning
                      ? sectionTheme === 'live'
                        ? '1px solid rgba(234, 179, 8, 0.4)'
                        : '1px solid rgba(16, 185, 129, 0.3)'
                      : '1px solid rgba(255, 255, 255, 0.05)',
                    opacity: isBeingDragged ? 0.35 : 1,
                    transform: isBeingDragged ? 'scale(0.98)' : 'none',
                    transition: 'all 0.18s ease',
                    borderRadius: '8px',
                    cursor: isGuest ? 'default' : 'grab'
                  }}
                >
                  {/* Grip Vertical Drag Handle */}
                  <td
                    style={{
                      padding: '1rem 0.35rem',
                      textAlign: 'center',
                      borderTopLeftRadius: '8px',
                      borderBottomLeftRadius: '8px',
                      color: isGuest ? '#475569' : '#94a3b8',
                      cursor: isGuest ? 'default' : 'grab'
                    }}
                    title={isGuest ? 'Chế độ Guest chỉ xem' : 'Kéo thả để sắp xếp vị trí'}
                  >
                    <GripVertical size={16} />
                  </td>

                  {/* Bot / Strategy Name */}
                  <td style={{ padding: '1rem 0.75rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <div
                        style={{
                          width: '34px',
                          height: '34px',
                          borderRadius: '8px',
                          background: isRunning
                            ? sectionTheme === 'live'
                              ? 'rgba(234, 179, 8, 0.2)'
                              : 'rgba(16, 185, 129, 0.2)'
                            : 'rgba(100, 116, 139, 0.2)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: isRunning ? (sectionTheme === 'live' ? '#fbbf24' : '#34d399') : '#94a3b8'
                        }}
                      >
                        <Bot size={18} />
                      </div>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                          <span
                            style={{
                              background: 'rgba(56, 189, 248, 0.15)',
                              border: '1px solid rgba(56, 189, 248, 0.35)',
                              color: '#38bdf8',
                              padding: '0.1rem 0.45rem',
                              borderRadius: '4px',
                              fontSize: '0.725rem',
                              fontWeight: 800,
                              fontFamily: 'var(--font-mono)',
                              letterSpacing: '0.02em'
                            }}
                            title={`Instance Bot ID: ${bot.id}`}
                          >
                            #{bot.id}
                          </span>
                          <span style={{ fontWeight: 700, color: '#f8fafc', fontSize: '0.95rem' }}>{bot.name}</span>
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#64748b', fontFamily: 'var(--font-mono)', marginTop: '0.1rem' }}>
                          {bot.algo_name || 'cBot Package'}
                        </div>
                      </div>
                    </div>
                  </td>

                  {/* Tên tài khoản (Account Label / Name) */}
                  <td style={{ padding: '1rem 0.75rem' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                      <span style={{ fontWeight: 600, color: sectionTheme === 'live' ? '#fbbf24' : '#38bdf8', fontSize: '0.925rem' }}>
                        {bot.account_label || `Account #${bot.account_id}`}
                      </span>
                      <span
                        style={{
                          fontSize: '0.7rem',
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          color: sectionTheme === 'live' ? '#fbbf24' : '#94a3b8'
                        }}
                      >
                        {bot.account_type ? `[${bot.account_type.toUpperCase()}]` : '[DEMO]'}
                      </span>
                    </div>
                  </td>

                  {/* Account Number */}
                  <td style={{ padding: '1rem 0.75rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <span
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontWeight: 700,
                          color: '#cbd5e1',
                          fontSize: '0.9rem',
                          background: 'rgba(0, 0, 0, 0.25)',
                          padding: '0.2rem 0.5rem',
                          borderRadius: '4px'
                        }}
                      >
                        {bot.account_id}
                      </span>
                      <button
                        onClick={() => handleCopy(bot.account_id)}
                        title="Copy Account ID"
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: copiedId === bot.account_id ? '#34d399' : '#64748b',
                          cursor: 'pointer',
                          padding: '0.2rem'
                        }}
                      >
                        {copiedId === bot.account_id ? <Check size={14} /> : <Copy size={14} />}
                      </button>
                    </div>
                  </td>

                  {/* Process ID (PID) */}
                  <td style={{ padding: '1rem 0.75rem' }}>
                    {isRunning && bot.pid ? (
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.4rem',
                          padding: '0.25rem 0.65rem',
                          borderRadius: '6px',
                          fontSize: '0.8rem',
                          fontWeight: 700,
                          fontFamily: 'var(--font-mono)',
                          background: 'rgba(16, 185, 129, 0.15)',
                          border: '1px solid rgba(16, 185, 129, 0.3)',
                          color: '#34d399'
                        }}
                      >
                        <span
                          style={{
                            width: '6px',
                            height: '6px',
                            borderRadius: '50%',
                            backgroundColor: '#10b981',
                            boxShadow: '0 0 6px #10b981'
                          }}
                        />
                        PID: {bot.pid}
                      </span>
                    ) : (
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.3rem',
                          padding: '0.25rem 0.5rem',
                          borderRadius: '6px',
                          fontSize: '0.75rem',
                          fontFamily: 'var(--font-mono)',
                          background: 'rgba(100, 116, 139, 0.15)',
                          color: '#64748b'
                        }}
                      >
                        Offline
                      </span>
                    )}
                  </td>

                  {/* Account Equity */}
                  <td style={{ padding: '1rem 0.75rem' }}>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span
                        style={{
                          fontSize: '1.05rem',
                          fontWeight: 800,
                          color: equityNum >= balanceNum ? '#34d399' : '#f87171',
                          fontFamily: 'var(--font-mono)',
                          letterSpacing: '-0.02em'
                        }}
                      >
                        ${equityNum.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                      <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                        Bal: ${balanceNum.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  </td>

                  {/* Symbol & Timeframe */}
                  <td style={{ padding: '1rem 0.75rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      <span
                        style={{
                          padding: '0.2rem 0.5rem',
                          borderRadius: '4px',
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          background: '#1e293b',
                          border: '1px solid #334155',
                          color: '#f8fafc'
                        }}
                      >
                        {bot.symbol}
                      </span>
                      <span
                        style={{
                          padding: '0.2rem 0.45rem',
                          borderRadius: '4px',
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          background: '#334155',
                          color: '#38bdf8'
                        }}
                      >
                        {bot.timeframe.toUpperCase()}
                      </span>
                    </div>
                  </td>

                  {/* Status */}
                  <td style={{ padding: '1rem 0.75rem' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', alignItems: 'flex-start' }}>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.35rem',
                          padding: '0.3rem 0.75rem',
                          borderRadius: '999px',
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          background: isRunning ? '#064e3b' : '#334155',
                          color: isRunning ? '#34d399' : '#94a3b8',
                          border: `1px solid ${isRunning ? '#10b981' : '#475569'}`
                        }}
                      >
                        {isRunning ? 'RUNNING' : 'STOPPED'}
                      </span>
                      {isRunning && bot.has_code_update && (
                        <span
                          title="File .algo trên VPS mới hơn tiến trình đang chạy. Bấm nút Restart màu cam để nạp code mới."
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.25rem',
                            padding: '0.18rem 0.5rem',
                            borderRadius: '5px',
                            fontSize: '0.68rem',
                            fontWeight: 800,
                            background: 'rgba(245, 158, 11, 0.2)',
                            color: '#fbbf24',
                            border: '1px solid rgba(245, 158, 11, 0.6)',
                            boxShadow: '0 0 8px rgba(245, 158, 11, 0.3)'
                          }}
                        >
                          <Zap size={11} fill="#fbbf24" /> New Build
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Actions */}
                  <td style={{ padding: '1rem 0.75rem', textAlign: 'right', borderTopRightRadius: '8px', borderBottomRightRadius: '8px' }}>
                    <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'flex-end', alignItems: 'center' }}>
                      {!isRunning ? (
                        <button
                          onClick={() => !isGuest && handleAction(bot.id, 'start')}
                          disabled={isLoading || isGuest}
                          title={isGuest ? "Chế độ Guest chỉ xem (View-Only)" : "Start Bot Instance"}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.3rem',
                            background: isGuest ? 'rgba(100, 116, 139, 0.3)' : '#059669',
                            border: 'none',
                            color: isGuest ? '#94a3b8' : 'white',
                            padding: '0.5rem 0.75rem',
                            borderRadius: '6px',
                            cursor: isGuest ? 'not-allowed' : 'pointer',
                            fontWeight: 600,
                            fontSize: '0.8rem',
                            transition: 'opacity 0.2s',
                            opacity: isLoading || isGuest ? 0.5 : 1
                          }}
                        >
                          <Play size={14} /> Start
                        </button>
                      ) : (
                        <>
                          <button
                            onClick={() => !isGuest && handleAction(bot.id, 'stop')}
                            disabled={isLoading || isGuest}
                            title={isGuest ? "Chế độ Guest chỉ xem (View-Only)" : "Stop Bot Instance"}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.3rem',
                              background: isGuest ? 'rgba(100, 116, 139, 0.3)' : '#dc2626',
                              border: 'none',
                              color: isGuest ? '#94a3b8' : 'white',
                              padding: '0.5rem 0.75rem',
                              borderRadius: '6px',
                              cursor: isGuest ? 'not-allowed' : 'pointer',
                              fontWeight: 600,
                              fontSize: '0.8rem',
                              opacity: isLoading || isGuest ? 0.5 : 1
                            }}
                          >
                            <Square size={14} /> Stop
                          </button>
                          <button
                            onClick={() => !isGuest && handleAction(bot.id, 'restart')}
                            disabled={isLoading || isGuest}
                            title={
                              isGuest
                                ? "Chế độ Guest chỉ xem (View-Only)"
                                : bot.has_code_update
                                ? "⚡ Có bản build .algo mới! Bấm để Restart nạp code mới."
                                : "Restart Process"
                            }
                            style={{
                              background: isGuest
                                ? 'rgba(100, 116, 139, 0.3)'
                                : bot.has_code_update
                                ? '#d97706'
                                : 'rgba(217, 119, 6, 0.8)',
                              border: bot.has_code_update ? '1.5px solid #fbbf24' : 'none',
                              color: isGuest ? '#94a3b8' : 'white',
                              padding: '0.5rem',
                              borderRadius: '6px',
                              cursor: isGuest ? 'not-allowed' : 'pointer',
                              opacity: isLoading || isGuest ? 0.5 : 1,
                              boxShadow: bot.has_code_update ? '0 0 10px rgba(245, 158, 11, 0.5)' : 'none'
                            }}
                          >
                            <RotateCcw size={14} />
                          </button>
                        </>
                      )}

                      <button
                        onClick={() => setParamModalBot(bot)}
                        title="Configure Strategy & Risk Parameters"
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.3rem',
                          background: 'rgba(56, 189, 248, 0.12)',
                          border: '1px solid rgba(56, 189, 248, 0.3)',
                          color: '#38bdf8',
                          padding: '0.5rem 0.65rem',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          fontWeight: 600,
                          fontSize: '0.78rem'
                        }}
                      >
                        <Sliders size={14} /> Params
                      </button>

                      <button
                        onClick={() => openLogs(bot.id)}
                        title={selectedBotId === bot.id ? `Đang xem Live Console Bot #${bot.id}` : `Mở Live Terminal Console Bot #${bot.id}`}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.35rem',
                          background: selectedBotId === bot.id ? 'rgba(16, 185, 129, 0.22)' : '#1e293b',
                          border: selectedBotId === bot.id ? '1px solid #10b981' : '1px solid #475569',
                          color: selectedBotId === bot.id ? '#34d399' : '#38bdf8',
                          boxShadow: selectedBotId === bot.id ? '0 0 12px rgba(16, 185, 129, 0.45)' : 'none',
                          padding: '0.5rem 0.65rem',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          fontWeight: selectedBotId === bot.id ? 700 : 500,
                          transition: 'all 0.2s ease'
                        }}
                      >
                        <Terminal size={14} color={selectedBotId === bot.id ? '#34d399' : '#38bdf8'} />
                        {selectedBotId === bot.id && (
                          <span style={{ fontSize: '0.725rem', color: '#34d399', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
                            #{bot.id}
                          </span>
                        )}
                      </button>

                      <button
                        onClick={() => !isGuest && handleDeleteBot(bot.id, bot.name)}
                        disabled={isRunning || isGuest}
                        title={isGuest ? "Chế độ Guest chỉ xem (View-Only)" : isRunning ? 'Stop bot before deleting' : 'Delete Bot Instance'}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: isRunning || isGuest ? '#475569' : '#ef4444',
                          padding: '0.5rem',
                          cursor: isRunning || isGuest ? 'not-allowed' : 'pointer',
                          opacity: isGuest ? 0.4 : 1
                        }}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem', width: '100%', maxWidth: '1440px', margin: '0 auto' }}>
      {/* Toast Alert Banner */}
      {statusMessage && (
        <div
          style={{
            padding: '0.85rem 1.25rem',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            background: statusMessage.type === 'success' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(244, 63, 94, 0.15)',
            border: `1px solid ${statusMessage.type === 'success' ? '#10b981' : '#f43f5e'}`,
            color: statusMessage.type === 'success' ? '#34d399' : '#fda4af',
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            animation: 'fadeIn 0.3s ease'
          }}
        >
          {statusMessage.type === 'success' ? <Check size={20} /> : <AlertCircle size={20} />}
          <span style={{ fontWeight: 500, fontSize: '0.925rem' }}>{statusMessage.text}</span>
        </div>
      )}

      {/* Top Header & Actions */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <h1 style={{ margin: 0, fontSize: '1.85rem', fontWeight: 800, color: '#f8fafc', letterSpacing: '-0.02em' }}>
              Bot Fleet Manager
            </h1>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                padding: '0.25rem 0.65rem',
                borderRadius: '999px',
                fontSize: '0.75rem',
                fontWeight: 700,
                background: runningBots.length > 0 ? 'rgba(16, 185, 129, 0.15)' : 'rgba(100, 116, 139, 0.2)',
                border: `1px solid ${runningBots.length > 0 ? '#10b981' : '#64748b'}`,
                color: runningBots.length > 0 ? '#34d399' : '#94a3b8'
              }}
            >
              <span
                style={{
                  width: '7px',
                  height: '7px',
                  borderRadius: '50%',
                  backgroundColor: runningBots.length > 0 ? '#10b981' : '#64748b',
                  boxShadow: runningBots.length > 0 ? '0 0 8px #10b981' : 'none'
                }}
              />
              {runningBots.length} Active / {botsList.length} Total
            </span>
          </div>
          <p style={{ color: '#94a3b8', margin: '0.35rem 0 0', fontSize: '0.875rem' }}>
            Deploy, monitor, and control cTrader algorithmic trading bots in real-time.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <button
            onClick={() => {
              refreshData();
              fetchAuxiliaryData();
            }}
            title="Refresh Fleet Data"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.65rem 0.9rem',
              background: 'rgba(30, 41, 59, 0.7)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '8px',
              color: '#cbd5e1',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '0.875rem',
              transition: 'all 0.2s'
            }}
          >
            <RefreshCw size={16} /> Refresh
          </button>

          <button
            onClick={() => !isGuest && setIsUploadModalOpen(true)}
            disabled={isGuest}
            title={isGuest ? "Chế độ Guest chỉ xem (View-Only)" : "Tải lên file bot .algo mới"}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.65rem 1.15rem',
              background: isGuest ? 'rgba(100, 116, 139, 0.3)' : 'linear-gradient(135deg, #059669 0%, #10b981 100%)',
              border: isGuest ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid rgba(16, 185, 129, 0.4)',
              borderRadius: '8px',
              color: isGuest ? '#94a3b8' : '#ffffff',
              cursor: isGuest ? 'not-allowed' : 'pointer',
              fontWeight: 700,
              fontSize: '0.875rem',
              boxShadow: isGuest ? 'none' : '0 4px 14px rgba(16, 185, 129, 0.25)',
              opacity: isGuest ? 0.5 : 1,
              transition: 'transform 0.15s, box-shadow 0.15s'
            }}
          >
            <Upload size={16} /> Add New Bot
          </button>

          <button
            onClick={() => {
              if (isGuest) return;
              if (cbots.length > 0) {
                handleDeployCbot(cbots[0]);
              } else {
                const defaultAcc = accounts.length > 0 ? accounts[0] : null;
                const isLive = defaultAcc ? (defaultAcc.account_type || '').toLowerCase() === 'live' : false;
                setDeployForm({
                  name: generateBotInstanceName('cBot Instance', defaultAcc?.account_id, 'XAUUSD', 'm15'),
                  algo_path: '',
                  account_id: defaultAcc ? String(defaultAcc.account_id) : '',
                  account_label: defaultAcc ? defaultAcc.account_label || `Account #${defaultAcc.account_id}` : 'Main Account',
                  account_type: isLive ? 'live' : 'demo',
                  symbol: 'XAUUSD',
                  timeframe: 'm15',
                  ctid_email: '',
                  ctid_password: '',
                  auto_start: true
                });
                setIsDeployModalOpen(true);
              }
            }}
            disabled={isGuest}
            title={isGuest ? "Chế độ Guest chỉ xem (View-Only)" : "Tạo instance bot mới"}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.65rem 1.25rem',
              background: isGuest ? 'rgba(100, 116, 139, 0.3)' : 'linear-gradient(135deg, #0284c7 0%, #06b6d4 100%)',
              border: isGuest ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid rgba(6, 182, 212, 0.4)',
              borderRadius: '8px',
              color: isGuest ? '#94a3b8' : '#ffffff',
              cursor: isGuest ? 'not-allowed' : 'pointer',
              fontWeight: 700,
              fontSize: '0.875rem',
              boxShadow: isGuest ? 'none' : '0 4px 14px rgba(6, 182, 212, 0.3)',
              opacity: isGuest ? 0.5 : 1,
              transition: 'transform 0.15s, box-shadow 0.15s'
            }}
          >
            <Play size={16} /> Deploy Instance
          </button>
        </div>
      </div>

      {/* Executive Metrics HUD */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
        {/* Card 1: Configured Bots */}
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
            <Bot size={24} />
          </div>
          <div>
            <div style={{ color: '#94a3b8', fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Configured Bots
            </div>
            <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#f8fafc', marginTop: '0.2rem' }}>
              {botsList.length} <span style={{ fontSize: '0.875rem', fontWeight: 500, color: '#64748b' }}>Instances</span>
            </div>
          </div>
        </div>

        {/* Card 2: Active Processes (Live Pulse) */}
        <div
          style={{
            background: 'linear-gradient(145deg, rgba(30, 41, 59, 0.7) 0%, rgba(15, 23, 42, 0.8) 100%)',
            border: runningBots.length > 0 ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(255, 255, 255, 0.08)',
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
              background: runningBots.length > 0 ? 'rgba(16, 185, 129, 0.15)' : 'rgba(100, 116, 139, 0.12)',
              border: `1px solid ${runningBots.length > 0 ? '#10b981' : '#64748b'}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: runningBots.length > 0 ? '#10b981' : '#94a3b8'
            }}
          >
            <Zap size={24} />
          </div>
          <div>
            <div style={{ color: '#94a3b8', fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Running Processes
            </div>
            <div style={{ fontSize: '1.6rem', fontWeight: 800, color: runningBots.length > 0 ? '#34d399' : '#94a3b8', marginTop: '0.2rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              {runningBots.length}
              {runningBots.length > 0 && (
                <span style={{ fontSize: '0.75rem', padding: '0.15rem 0.5rem', borderRadius: '4px', background: 'rgba(16, 185, 129, 0.2)', color: '#34d399' }}>
                  ONLINE
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Card 3: Managed Fleet Equity */}
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
            <Wallet size={24} />
          </div>
          <div>
            <div style={{ color: '#94a3b8', fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Active Fleet Equity
            </div>
            <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#f8fafc', marginTop: '0.2rem' }}>
              ${totalRunningEquity.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            {runningBots.length > 0 && (
              <div style={{ fontSize: '0.75rem', color: '#c084fc', marginTop: '0.15rem', fontWeight: 500 }}>
                {runningBots.length} active bot{runningBots.length !== 1 ? 's' : ''} on {activeAccountsCount} unique account{activeAccountsCount !== 1 ? 's' : ''}
              </div>
            )}
          </div>
        </div>

        {/* Card 4: Discovered cBots Library */}
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
              background: 'rgba(245, 158, 11, 0.12)',
              border: '1px solid rgba(245, 158, 11, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fbbf24'
            }}
          >
            <FileCode size={24} />
          </div>
          <div>
            <div style={{ color: '#94a3b8', fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              cBot Repository
            </div>
            <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#f8fafc', marginTop: '0.2rem' }}>
              {cbots.length} <span style={{ fontSize: '0.875rem', fontWeight: 500, color: '#64748b' }}>.algo packages</span>
            </div>
          </div>
        </div>
      </div>

      {/* SECTION 1A: LIVE TRADING FLEET (Tài Khoản Live) */}
      <div
        style={{
          background: 'linear-gradient(145deg, rgba(234, 179, 8, 0.05) 0%, rgba(15, 23, 42, 0.85) 100%)',
          border: '1px solid rgba(234, 179, 8, 0.35)',
          borderRadius: '14px',
          padding: '1.5rem',
          backdropFilter: 'blur(12px)',
          boxShadow: '0 12px 30px rgba(0, 0, 0, 0.3)',
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '0.5rem', letterSpacing: '-0.01em' }}>
                <ShieldCheck size={22} color="#fbbf24" /> LIVE TRADING FLEET
              </h2>
              <span
                style={{
                  background: 'rgba(234, 179, 8, 0.15)',
                  border: '1px solid rgba(234, 179, 8, 0.4)',
                  color: '#fbbf24',
                  padding: '0.2rem 0.6rem',
                  borderRadius: '999px',
                  fontSize: '0.725rem',
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em'
                }}
              >
                Real Capital
              </span>
            </div>
            <p style={{ color: '#94a3b8', fontSize: '0.825rem', margin: '0.25rem 0 0' }}>
              Các chiến thuật đang vận hành trên tài khoản Live tiền thật • Cầm icon ⠿ kéo thả để sắp xếp vị trí
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}>
              <span style={{ color: '#94a3b8' }}>Live Bots:</span>
              <strong style={{ color: '#f8fafc' }}>{liveBots.length}</strong>
              <span style={{ color: '#64748b' }}>•</span>
              <span style={{ color: '#94a3b8' }}>Running:</span>
              <strong style={{ color: runningLiveBots.length > 0 ? '#34d399' : '#94a3b8' }}>{runningLiveBots.length}</strong>
              <span style={{ color: '#64748b' }}>•</span>
              <span style={{ color: '#94a3b8' }}>Live Equity:</span>
              <strong style={{ color: '#fbbf24', fontFamily: 'var(--font-mono)' }}>
                ${totalLiveEquity.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </strong>
            </div>

            {/* Live Fleet Dedicated Bulk Controls */}
            {liveBots.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
                <button
                  id="btn-bulk-start-live"
                  onClick={() => !isGuest && handleBulkAction('start', 'live')}
                  disabled={bulkLoading !== null || isGuest || liveBots.filter((b) => b.status !== 'RUNNING').length === 0}
                  style={{
                    background: isGuest || liveBots.filter((b) => b.status !== 'RUNNING').length === 0
                      ? 'rgba(100, 116, 139, 0.2)'
                      : 'linear-gradient(135deg, rgba(234, 179, 8, 0.2), rgba(16, 185, 129, 0.35))',
                    border: isGuest || liveBots.filter((b) => b.status !== 'RUNNING').length === 0
                      ? '1px solid rgba(255, 255, 255, 0.1)'
                      : '1px solid rgba(234, 179, 8, 0.45)',
                    color: isGuest || liveBots.filter((b) => b.status !== 'RUNNING').length === 0 ? '#94a3b8' : '#fbbf24',
                    padding: '0.4rem 0.75rem',
                    borderRadius: '8px',
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    cursor: bulkLoading !== null || isGuest || liveBots.filter((b) => b.status !== 'RUNNING').length === 0 ? 'not-allowed' : 'pointer',
                    transition: 'all 0.2s ease',
                    opacity: isGuest || liveBots.filter((b) => b.status !== 'RUNNING').length === 0 ? 0.5 : 1
                  }}
                  title={isGuest ? "Chế độ Guest chỉ xem" : "Khởi chạy toàn bộ bot Live đang dừng (CPU-Gated)"}
                >
                  {bulkLoading?.action === 'start' && bulkLoading?.fleet === 'live' ? (
                    <RefreshCw size={13} className="animate-spin" />
                  ) : (
                    <Play size={13} fill={isGuest || liveBots.filter((b) => b.status !== 'RUNNING').length === 0 ? '#94a3b8' : '#fbbf24'} />
                  )}
                  <span>Start Live</span>
                  {liveBots.filter((b) => b.status !== 'RUNNING').length > 0 && (
                    <span style={{ background: 'rgba(234, 179, 8, 0.3)', color: '#fbbf24', padding: '0.05rem 0.35rem', borderRadius: '10px', fontSize: '0.68rem', fontWeight: 800 }}>
                      {liveBots.filter((b) => b.status !== 'RUNNING').length}
                    </span>
                  )}
                </button>

                <button
                  id="btn-bulk-stop-live"
                  onClick={() => !isGuest && handleBulkAction('stop', 'live')}
                  disabled={bulkLoading !== null || isGuest || runningLiveBots.length === 0}
                  style={{
                    background: isGuest || runningLiveBots.length === 0
                      ? 'rgba(100, 116, 139, 0.2)'
                      : 'linear-gradient(135deg, rgba(239, 68, 68, 0.2), rgba(185, 28, 28, 0.35))',
                    border: isGuest || runningLiveBots.length === 0
                      ? '1px solid rgba(255, 255, 255, 0.1)'
                      : '1px solid rgba(239, 68, 68, 0.45)',
                    color: isGuest || runningLiveBots.length === 0 ? '#94a3b8' : '#f87171',
                    padding: '0.4rem 0.75rem',
                    borderRadius: '8px',
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    cursor: bulkLoading !== null || isGuest || runningLiveBots.length === 0 ? 'not-allowed' : 'pointer',
                    transition: 'all 0.2s ease',
                    opacity: isGuest || runningLiveBots.length === 0 ? 0.5 : 1
                  }}
                  title={isGuest ? "Chế độ Guest chỉ xem" : "Dừng khẩn cấp toàn bộ các bot Live đang chạy"}
                >
                  {bulkLoading?.action === 'stop' && bulkLoading?.fleet === 'live' ? (
                    <RefreshCw size={13} className="animate-spin" />
                  ) : (
                    <Square size={13} fill={isGuest || runningLiveBots.length === 0 ? '#94a3b8' : '#f87171'} />
                  )}
                  <span>Stop Live</span>
                  {runningLiveBots.length > 0 && (
                    <span style={{ background: 'rgba(239, 68, 68, 0.3)', color: '#fca5a5', padding: '0.05rem 0.35rem', borderRadius: '10px', fontSize: '0.68rem', fontWeight: 800 }}>
                      {runningLiveBots.length}
                    </span>
                  )}
                </button>

                <button
                  id="btn-bulk-restart-live"
                  onClick={() => !isGuest && handleBulkAction('restart', 'live')}
                  disabled={bulkLoading !== null || isGuest || liveBots.length === 0}
                  style={{
                    background: isGuest || liveBots.length === 0
                      ? 'rgba(100, 116, 139, 0.2)'
                      : 'linear-gradient(135deg, rgba(245, 158, 11, 0.18), rgba(217, 119, 6, 0.35))',
                    border: isGuest || liveBots.length === 0
                      ? '1px solid rgba(255, 255, 255, 0.1)'
                      : '1px solid rgba(245, 158, 11, 0.45)',
                    color: isGuest || liveBots.length === 0 ? '#94a3b8' : '#f59e0b',
                    padding: '0.4rem 0.75rem',
                    borderRadius: '8px',
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    cursor: bulkLoading !== null || isGuest || liveBots.length === 0 ? 'not-allowed' : 'pointer',
                    transition: 'all 0.2s ease',
                    opacity: isGuest || liveBots.length === 0 ? 0.5 : 1
                  }}
                  title={isGuest ? "Chế độ Guest chỉ xem" : "Khởi động lại toàn bộ bot Live"}
                >
                  {bulkLoading?.action === 'restart' && bulkLoading?.fleet === 'live' ? (
                    <RefreshCw size={13} className="animate-spin" />
                  ) : (
                    <RotateCcw size={13} />
                  )}
                  <span>Restart Live</span>
                  <span style={{ background: 'rgba(245, 158, 11, 0.3)', color: '#fbbf24', padding: '0.05rem 0.35rem', borderRadius: '10px', fontSize: '0.68rem', fontWeight: 800 }}>
                    {liveBots.length}
                  </span>
                </button>

                {liveBots.some(b => b.status === 'RUNNING' && b.has_code_update) && (
                  <button
                    id="btn-restart-updated-live"
                    onClick={handleRestartUpdated}
                    disabled={bulkLoading !== null || isGuest}
                    style={{
                      background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.3), rgba(217, 119, 6, 0.55))',
                      border: '1.5px solid #fbbf24',
                      color: '#fbbf24',
                      padding: '0.4rem 0.85rem',
                      borderRadius: '8px',
                      fontSize: '0.78rem',
                      fontWeight: 800,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                      cursor: isGuest ? 'not-allowed' : 'pointer',
                      boxShadow: '0 0 12px rgba(245, 158, 11, 0.4)'
                    }}
                    title="Chỉ khởi động lại các bot Live có file .algo mới hơn tiến trình đang chạy"
                  >
                    <Zap size={13} fill="#fbbf24" />
                    <span>Restart Updated ({liveBots.filter(b => b.status === 'RUNNING' && b.has_code_update).length})</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {renderBotTable(liveBots, 'live')}
      </div>

      {/* SECTION 1B: DEMO & PAPER FLEET (Tài Khoản Demo) */}
      <div
        style={{
          background: 'linear-gradient(145deg, rgba(56, 189, 248, 0.04) 0%, rgba(15, 23, 42, 0.85) 100%)',
          border: '1px solid rgba(56, 189, 248, 0.25)',
          borderRadius: '14px',
          padding: '1.5rem',
          backdropFilter: 'blur(12px)',
          boxShadow: '0 12px 30px rgba(0, 0, 0, 0.3)',
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '0.5rem', letterSpacing: '-0.01em' }}>
                <Layers size={22} color="#38bdf8" /> DEMO & PAPER FLEET
              </h2>
              <span
                style={{
                  background: 'rgba(56, 189, 248, 0.15)',
                  border: '1px solid rgba(56, 189, 248, 0.35)',
                  color: '#38bdf8',
                  padding: '0.2rem 0.6rem',
                  borderRadius: '999px',
                  fontSize: '0.725rem',
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em'
                }}
              >
                Paper Testing
              </span>
            </div>
            <p style={{ color: '#94a3b8', fontSize: '0.825rem', margin: '0.25rem 0 0' }}>
              Các chiến thuật thử nghiệm & tối ưu hóa trên tài khoản Demo • Cầm icon ⠿ kéo thả để sắp xếp vị trí
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}>
              <span style={{ color: '#94a3b8' }}>Demo Bots:</span>
              <strong style={{ color: '#f8fafc' }}>{demoBots.length}</strong>
              <span style={{ color: '#64748b' }}>•</span>
              <span style={{ color: '#94a3b8' }}>Running:</span>
              <strong style={{ color: runningDemoBots.length > 0 ? '#34d399' : '#94a3b8' }}>{runningDemoBots.length}</strong>
              <span style={{ color: '#64748b' }}>•</span>
              <span style={{ color: '#94a3b8' }}>Demo Equity:</span>
              <strong style={{ color: '#38bdf8', fontFamily: 'var(--font-mono)' }}>
                ${totalDemoEquity.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </strong>
            </div>

            {/* Demo Fleet Dedicated Bulk Controls */}
            {demoBots.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
                <button
                  id="btn-bulk-start-demo"
                  onClick={() => !isGuest && handleBulkAction('start', 'demo')}
                  disabled={bulkLoading !== null || isGuest || demoBots.filter((b) => b.status !== 'RUNNING').length === 0}
                  style={{
                    background: isGuest || demoBots.filter((b) => b.status !== 'RUNNING').length === 0
                      ? 'rgba(100, 116, 139, 0.2)'
                      : 'linear-gradient(135deg, rgba(16, 185, 129, 0.2), rgba(5, 150, 105, 0.35))',
                    border: isGuest || demoBots.filter((b) => b.status !== 'RUNNING').length === 0
                      ? '1px solid rgba(255, 255, 255, 0.1)'
                      : '1px solid rgba(16, 185, 129, 0.4)',
                    color: isGuest || demoBots.filter((b) => b.status !== 'RUNNING').length === 0 ? '#94a3b8' : '#34d399',
                    padding: '0.4rem 0.75rem',
                    borderRadius: '8px',
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    cursor: bulkLoading !== null || isGuest || demoBots.filter((b) => b.status !== 'RUNNING').length === 0 ? 'not-allowed' : 'pointer',
                    transition: 'all 0.2s ease',
                    opacity: isGuest || demoBots.filter((b) => b.status !== 'RUNNING').length === 0 ? 0.5 : 1
                  }}
                  title={isGuest ? "Chế độ Guest chỉ xem" : "Khởi chạy toàn bộ bot Demo đang dừng (CPU-Gated)"}
                >
                  {bulkLoading?.action === 'start' && bulkLoading?.fleet === 'demo' ? (
                    <RefreshCw size={13} className="animate-spin" />
                  ) : (
                    <Play size={13} fill={isGuest || demoBots.filter((b) => b.status !== 'RUNNING').length === 0 ? '#94a3b8' : '#34d399'} />
                  )}
                  <span>Start Demo</span>
                  {demoBots.filter((b) => b.status !== 'RUNNING').length > 0 && (
                    <span style={{ background: 'rgba(16, 185, 129, 0.25)', padding: '0.05rem 0.35rem', borderRadius: '10px', fontSize: '0.68rem', fontWeight: 800 }}>
                      {demoBots.filter((b) => b.status !== 'RUNNING').length}
                    </span>
                  )}
                </button>

                <button
                  id="btn-bulk-stop-demo"
                  onClick={() => !isGuest && handleBulkAction('stop', 'demo')}
                  disabled={bulkLoading !== null || isGuest || runningDemoBots.length === 0}
                  style={{
                    background: isGuest || runningDemoBots.length === 0
                      ? 'rgba(100, 116, 139, 0.2)'
                      : 'linear-gradient(135deg, rgba(239, 68, 68, 0.15), rgba(185, 28, 28, 0.3))',
                    border: isGuest || runningDemoBots.length === 0
                      ? '1px solid rgba(255, 255, 255, 0.1)'
                      : '1px solid rgba(239, 68, 68, 0.4)',
                    color: isGuest || runningDemoBots.length === 0 ? '#94a3b8' : '#f87171',
                    padding: '0.4rem 0.75rem',
                    borderRadius: '8px',
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    cursor: bulkLoading !== null || isGuest || runningDemoBots.length === 0 ? 'not-allowed' : 'pointer',
                    transition: 'all 0.2s ease',
                    opacity: isGuest || runningDemoBots.length === 0 ? 0.5 : 1
                  }}
                  title={isGuest ? "Chế độ Guest chỉ xem" : "Dừng khẩn cấp toàn bộ các bot Demo đang chạy"}
                >
                  {bulkLoading?.action === 'stop' && bulkLoading?.fleet === 'demo' ? (
                    <RefreshCw size={13} className="animate-spin" />
                  ) : (
                    <Square size={13} fill={isGuest || runningDemoBots.length === 0 ? '#94a3b8' : '#f87171'} />
                  )}
                  <span>Stop Demo</span>
                  {runningDemoBots.length > 0 && (
                    <span style={{ background: 'rgba(239, 68, 68, 0.25)', padding: '0.05rem 0.35rem', borderRadius: '10px', fontSize: '0.68rem', fontWeight: 800 }}>
                      {runningDemoBots.length}
                    </span>
                  )}
                </button>

                <button
                  id="btn-bulk-restart-demo"
                  onClick={() => !isGuest && handleBulkAction('restart', 'demo')}
                  disabled={bulkLoading !== null || isGuest || demoBots.length === 0}
                  style={{
                    background: isGuest || demoBots.length === 0
                      ? 'rgba(100, 116, 139, 0.2)'
                      : 'linear-gradient(135deg, rgba(56, 189, 248, 0.15), rgba(2, 132, 199, 0.3))',
                    border: isGuest || demoBots.length === 0
                      ? '1px solid rgba(255, 255, 255, 0.1)'
                      : '1px solid rgba(56, 189, 248, 0.4)',
                    color: isGuest || demoBots.length === 0 ? '#94a3b8' : '#38bdf8',
                    padding: '0.4rem 0.75rem',
                    borderRadius: '8px',
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    cursor: bulkLoading !== null || isGuest || demoBots.length === 0 ? 'not-allowed' : 'pointer',
                    transition: 'all 0.2s ease',
                    opacity: isGuest || demoBots.length === 0 ? 0.5 : 1
                  }}
                  title={isGuest ? "Chế độ Guest chỉ xem" : "Khởi động lại toàn bộ bot Demo"}
                >
                  {bulkLoading?.action === 'restart' && bulkLoading?.fleet === 'demo' ? (
                    <RefreshCw size={13} className="animate-spin" />
                  ) : (
                    <RotateCcw size={13} />
                  )}
                  <span>Restart Demo</span>
                  <span style={{ background: 'rgba(56, 189, 248, 0.25)', padding: '0.05rem 0.35rem', borderRadius: '10px', fontSize: '0.68rem', fontWeight: 800 }}>
                    {demoBots.length}
                  </span>
                </button>

                {demoBots.some(b => b.status === 'RUNNING' && b.has_code_update) && (
                  <button
                    id="btn-restart-updated-demo"
                    onClick={handleRestartUpdated}
                    disabled={bulkLoading !== null || isGuest}
                    style={{
                      background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.3), rgba(217, 119, 6, 0.55))',
                      border: '1.5px solid #fbbf24',
                      color: '#fbbf24',
                      padding: '0.4rem 0.85rem',
                      borderRadius: '8px',
                      fontSize: '0.78rem',
                      fontWeight: 800,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                      cursor: isGuest ? 'not-allowed' : 'pointer',
                      boxShadow: '0 0 12px rgba(245, 158, 11, 0.4)'
                    }}
                    title="Chỉ khởi động lại các bot Demo có file .algo mới hơn tiến trình đang chạy"
                  >
                    <Zap size={13} fill="#fbbf24" />
                    <span>Restart Updated ({demoBots.filter(b => b.status === 'RUNNING' && b.has_code_update).length})</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {renderBotTable(demoBots, 'demo')}
      </div>

      {/* SECTION 2: Available cBots Library & Selector */}
      <div
        style={{
          background: 'rgba(15, 23, 42, 0.8)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '14px',
          padding: '1.5rem',
          backdropFilter: 'blur(12px)',
          boxShadow: '0 12px 30px rgba(0, 0, 0, 0.3)'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: '#f1f5f9', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <FolderOpen size={20} color="#38bdf8" /> cBot Repository (Folder <code>/cbot</code>)
            </h2>
            <p style={{ color: '#64748b', fontSize: '0.825rem', margin: '0.2rem 0 0' }}>
              Select any discovered .algo algorithmic package to configure and launch an active trading instance.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
            {/* Search */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                background: 'rgba(30, 41, 59, 0.8)',
                border: '1px solid #334155',
                borderRadius: '8px',
                padding: '0.4rem 0.75rem',
                gap: '0.5rem'
              }}
            >
              <Search size={16} color="#94a3b8" />
              <input
                type="text"
                placeholder="Search cBots..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'white',
                  fontSize: '0.85rem',
                  outline: 'none',
                  width: '180px'
                }}
              />
            </div>
          </div>
        </div>

        {filteredCbots.length === 0 ? (
          <div style={{ padding: '2.5rem', textAlign: 'center', color: '#94a3b8' }}>
            No cBot files found in <code>/cbot</code> directory. Click <strong>"Add New Bot"</strong> above to upload one!
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1rem' }}>
            {filteredCbots.map((cbot, idx) => (
              <div
                key={idx}
                style={{
                  background: 'linear-gradient(145deg, rgba(30, 41, 59, 0.6) 0%, rgba(15, 23, 42, 0.8) 100%)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '10px',
                  padding: '1.25rem',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: '1rem',
                  transition: 'transform 0.15s, border-color 0.2s, box-shadow 0.2s'
                }}
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                    <div
                      style={{
                        width: '38px',
                        height: '38px',
                        borderRadius: '8px',
                        background: 'rgba(6, 182, 212, 0.15)',
                        border: '1px solid rgba(6, 182, 212, 0.3)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#38bdf8'
                      }}
                    >
                      <Cpu size={20} />
                    </div>
                    <span
                      style={{
                        fontSize: '0.7rem',
                        fontWeight: 600,
                        padding: '0.2rem 0.5rem',
                        borderRadius: '4px',
                        background: 'rgba(100, 116, 139, 0.2)',
                        color: '#94a3b8'
                      }}
                    >
                      {cbot.size_formatted}
                    </span>
                  </div>

                  <h3 style={{ margin: '0 0 0.35rem', fontSize: '1rem', fontWeight: 700, color: '#f8fafc' }}>
                    {cbot.name}
                  </h3>

                  <div style={{ fontSize: '0.75rem', color: '#64748b', fontFamily: 'var(--font-mono)', marginBottom: '0.75rem' }}>
                    {cbot.filename}
                  </div>

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '0.5rem' }}>
                    <span
                      style={{
                        fontSize: '0.725rem',
                        fontWeight: 700,
                        padding: '0.15rem 0.5rem',
                        borderRadius: '4px',
                        background: '#0f172a',
                        border: '1px solid #334155',
                        color: '#38bdf8'
                      }}
                    >
                      {cbot.symbol_hint}
                    </span>
                    <span
                      style={{
                        fontSize: '0.725rem',
                        fontWeight: 700,
                        padding: '0.15rem 0.45rem',
                        borderRadius: '4px',
                        background: '#0f172a',
                        border: '1px solid #334155',
                        color: '#f59e0b'
                      }}
                    >
                      {cbot.timeframe_hint.toUpperCase()}
                    </span>
                    {cbot.has_source && (
                      <span
                        style={{
                          fontSize: '0.725rem',
                          fontWeight: 600,
                          padding: '0.15rem 0.45rem',
                          borderRadius: '4px',
                          background: 'rgba(16, 185, 129, 0.15)',
                          color: '#34d399'
                        }}
                      >
                        ✓ Source Project
                      </span>
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid rgba(255, 255, 255, 0.06)', paddingTop: '0.75rem' }}>
                  <span style={{ fontSize: '0.725rem', color: '#64748b' }}>Modified: {cbot.modified_at.split(' ')[0]}</span>
                  <button
                    onClick={() => !isGuest && handleDeployCbot(cbot)}
                    disabled={isGuest}
                    title={isGuest ? "Chế độ Guest chỉ xem (View-Only)" : "Deploy & Run"}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                      background: isGuest ? 'rgba(100, 116, 139, 0.3)' : 'linear-gradient(135deg, #0284c7 0%, #06b6d4 100%)',
                      border: 'none',
                      color: isGuest ? '#94a3b8' : 'white',
                      padding: '0.45rem 0.85rem',
                      borderRadius: '6px',
                      cursor: isGuest ? 'not-allowed' : 'pointer',
                      fontWeight: 700,
                      fontSize: '0.8rem',
                      opacity: isGuest ? 0.5 : 1,
                      boxShadow: isGuest ? 'none' : '0 2px 8px rgba(6, 182, 212, 0.25)'
                    }}
                  >
                    <Play size={13} /> Deploy & Run
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* MODAL 1: Add New Bot (Upload .algo) */}
      {isUploadModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '1rem'
          }}
        >
          <div
            style={{
              background: '#1e293b',
              border: '1px solid #475569',
              borderRadius: '12px',
              width: '100%',
              maxWidth: '520px',
              overflow: 'hidden',
              boxShadow: '0 20px 40px rgba(0, 0, 0, 0.5)'
            }}
          >
            <div style={{ padding: '1.25rem', background: '#0f172a', borderBottom: '1px solid #334155', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '1.15rem', color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Upload size={18} color="#10b981" /> Add New cBot Package
              </h3>
              <button
                onClick={() => setIsUploadModalOpen(false)}
                style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleUploadSubmit} style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div
                onClick={() => fileInputRef.current?.click()}
                style={{
                  border: '2px dashed #475569',
                  borderRadius: '10px',
                  padding: '2rem 1rem',
                  textAlign: 'center',
                  cursor: 'pointer',
                  background: uploadFile ? 'rgba(16, 185, 129, 0.05)' : 'rgba(15, 23, 42, 0.4)',
                  borderColor: uploadFile ? '#10b981' : '#475569',
                  transition: 'all 0.2s'
                }}
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  accept=".algo,.cs,.zip"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      setUploadFile(e.target.files[0]);
                    }
                  }}
                />
                <Upload size={36} color={uploadFile ? '#10b981' : '#64748b'} style={{ margin: '0 auto 0.75rem' }} />
                {uploadFile ? (
                  <div>
                    <div style={{ fontWeight: 700, color: '#f8fafc', fontSize: '0.95rem' }}>{uploadFile.name}</div>
                    <div style={{ color: '#10b981', fontSize: '0.8rem', marginTop: '0.2rem' }}>
                      {(uploadFile.size / 1024).toFixed(1)} KB — Ready to upload
                    </div>
                  </div>
                ) : (
                  <div>
                    <div style={{ fontWeight: 600, color: '#cbd5e1' }}>Click or Drag & Drop .algo Bot File</div>
                    <div style={{ color: '#64748b', fontSize: '0.775rem', marginTop: '0.3rem' }}>
                      Supports compiled .algo packages and C# .cs algorithms
                    </div>
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => setIsUploadModalOpen(false)}
                  style={{
                    background: 'transparent',
                    border: '1px solid #475569',
                    color: '#cbd5e1',
                    padding: '0.6rem 1.25rem',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontWeight: 600
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!uploadFile || isUploading}
                  style={{
                    background: '#10b981',
                    border: 'none',
                    color: 'white',
                    padding: '0.6rem 1.5rem',
                    borderRadius: '6px',
                    cursor: !uploadFile || isUploading ? 'not-allowed' : 'pointer',
                    fontWeight: 700,
                    opacity: !uploadFile || isUploading ? 0.6 : 1
                  }}
                >
                  {isUploading ? 'Uploading...' : 'Import to /cbot'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Deploy Bot Instance Wizard */}
      {isDeployModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '1rem'
          }}
        >
          <div
            style={{
              background: '#1e293b',
              border: '1px solid #475569',
              borderRadius: '12px',
              width: '100%',
              maxWidth: '640px',
              maxHeight: '90vh',
              overflowY: 'auto',
              boxShadow: '0 20px 40px rgba(0, 0, 0, 0.5)'
            }}
          >
            <div style={{ padding: '1.25rem', background: '#0f172a', borderBottom: '1px solid #334155', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '1.15rem', color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Zap size={18} color="#06b6d4" /> Configure & Deploy Bot Instance
              </h3>
              <button
                onClick={() => setIsDeployModalOpen(false)}
                style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleDeploySubmit} style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {/* Instance Name */}
              <div>
                <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '0.4rem' }}>
                  Tên Bot Instance (Instance Name) <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Smart Trend Bot Pro [#384729 - XAUUSD M15]"
                  value={deployForm.name}
                  onChange={(e) => setDeployForm({ ...deployForm, name: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '0.65rem 0.85rem',
                    background: '#0f172a',
                    border: '1px solid #334155',
                    borderRadius: '6px',
                    color: 'white',
                    fontSize: '0.9rem',
                    boxSizing: 'border-box'
                  }}
                />
                <div style={{ marginTop: '0.25rem', fontSize: '0.725rem', color: '#64748b' }}>
                  💡 Tên định danh bot hiển thị trên bảng điều khiển. Bạn có thể tự do đặt tên theo ý muốn.
                </div>
              </div>

              {/* cBot Package Selector */}
              <div>
                <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '0.4rem' }}>
                  Chiến thuật cBot Package (từ thư mục <code>/cbot</code>) <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <select
                  required
                  value={deployForm.algo_path}
                  onChange={(e) => {
                    const newAlgo = e.target.value;
                    const cbotObj = cbots.find(c => c.filename === newAlgo);
                    const cleanCbot = cbotObj?.name || newAlgo;
                    const sym = cbotObj?.symbol_hint || deployForm.symbol;
                    const tf = cbotObj?.timeframe_hint || deployForm.timeframe;
                    setDeployForm(prev => ({
                      ...prev,
                      algo_path: newAlgo,
                      symbol: sym,
                      timeframe: tf,
                      name: generateBotInstanceName(cleanCbot, prev.account_id, sym, tf)
                    }));
                  }}
                  style={{
                    width: '100%',
                    padding: '0.65rem 0.85rem',
                    background: '#0f172a',
                    border: '1px solid #334155',
                    borderRadius: '6px',
                    color: 'white',
                    fontSize: '0.9rem',
                    boxSizing: 'border-box'
                  }}
                >
                  <option value="">-- Chọn file cBot thuật toán --</option>
                  {cbots.map((c, i) => (
                    <option key={i} value={c.filename}>
                      {c.name} ({c.filename})
                    </option>
                  ))}
                </select>
              </div>

              {/* Account Selection from Account Manager */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                  <label style={{ fontSize: '0.825rem', fontWeight: 600, color: '#cbd5e1', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <Wallet size={15} color="#38bdf8" /> Tài khoản Giao dịch (Connected cTrader Account) <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  {onNavigateToAccounts && (
                    <button
                      type="button"
                      onClick={() => {
                        setIsDeployModalOpen(false);
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
                        padding: 0
                      }}
                    >
                      <Sliders size={12} /> Quản lý tài khoản
                    </button>
                  )}
                </div>

                {accounts.length === 0 ? (
                  <div style={{
                    background: 'rgba(239, 68, 68, 0.1)',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    borderRadius: '8px',
                    padding: '0.85rem 1rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '1rem'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#fca5a5', fontSize: '0.825rem' }}>
                      <AlertCircle size={18} />
                      <span>Chưa có tài khoản cTrader nào được cấu hình trong hệ thống.</span>
                    </div>
                    {onNavigateToAccounts && (
                      <button
                        type="button"
                        onClick={() => {
                          setIsDeployModalOpen(false);
                          onNavigateToAccounts();
                        }}
                        style={{
                          background: '#0284c7',
                          border: 'none',
                          color: 'white',
                          fontSize: '0.75rem',
                          padding: '0.35rem 0.75rem',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontWeight: 600,
                          whiteSpace: 'nowrap'
                        }}
                      >
                        + Thêm tài khoản
                      </button>
                    )}
                  </div>
                ) : (
                  <>
                    <select
                      required
                      value={deployForm.account_id}
                      onChange={(e) => {
                        const val = e.target.value;
                        const matched = accounts.find((a) => String(a.account_id) === val);
                        if (matched) {
                          const isLive = (matched.account_type || '').toLowerCase() === 'live';
                          const cleanCbot = cbots.find(c => c.filename === deployForm.algo_path)?.name || deployForm.name;
                          setDeployForm(prev => ({
                            ...prev,
                            account_id: String(matched.account_id),
                            account_label: matched.account_label || `Account #${matched.account_id}`,
                            account_type: isLive ? 'live' : 'demo',
                            name: generateBotInstanceName(cleanCbot, matched.account_id, prev.symbol, prev.timeframe)
                          }));
                        } else {
                          setDeployForm(prev => ({ ...prev, account_id: val }));
                        }
                      }}
                      style={{
                        width: '100%',
                        padding: '0.65rem 0.85rem',
                        background: '#0f172a',
                        border: '1px solid #334155',
                        borderRadius: '6px',
                        color: 'white',
                        fontSize: '0.9rem',
                        boxSizing: 'border-box'
                      }}
                    >
                      <option value="" disabled>-- Chọn tài khoản cTrader để chạy bot --</option>
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
                      const selectedAcc = accounts.find(a => String(a.account_id) === String(deployForm.account_id));
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

              {/* Symbol & Timeframe */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '0.4rem' }}>
                    Cặp Tiền Giao Dịch (Symbol)
                  </label>
                  <select
                    value={deployForm.symbol}
                    onChange={(e) => {
                      const newSymbol = e.target.value;
                      const cleanCbot = cbots.find(c => c.filename === deployForm.algo_path)?.name || deployForm.name;
                      setDeployForm(prev => ({
                        ...prev,
                        symbol: newSymbol,
                        name: generateBotInstanceName(cleanCbot, prev.account_id, newSymbol, prev.timeframe)
                      }));
                    }}
                    style={{
                      width: '100%',
                      padding: '0.65rem 0.85rem',
                      background: '#0f172a',
                      border: '1px solid #334155',
                      borderRadius: '6px',
                      color: 'white',
                      fontSize: '0.9rem',
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

                    {/* Standard Crypto (Spotware, IC Markets, Pepperstone) */}
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

                <div>
                  <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '0.4rem' }}>
                    Khung Thời Gian (Timeframe)
                  </label>
                  <select
                    value={deployForm.timeframe}
                    onChange={(e) => {
                      const newTf = e.target.value;
                      const cleanCbot = cbots.find(c => c.filename === deployForm.algo_path)?.name || deployForm.name;
                      setDeployForm(prev => ({
                        ...prev,
                        timeframe: newTf,
                        name: generateBotInstanceName(cleanCbot, prev.account_id, prev.symbol, newTf)
                      }));
                    }}
                    style={{
                      width: '100%',
                      padding: '0.65rem 0.85rem',
                      background: '#0f172a',
                      border: '1px solid #334155',
                      borderRadius: '6px',
                      color: 'white',
                      fontSize: '0.9rem',
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

              {/* Auto start check */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input
                  type="checkbox"
                  id="auto_start"
                  checked={deployForm.auto_start}
                  onChange={(e) => setDeployForm({ ...deployForm, auto_start: e.target.checked })}
                  style={{ width: '16px', height: '16px', accentColor: '#0284c7', cursor: 'pointer' }}
                />
                <label htmlFor="auto_start" style={{ fontSize: '0.875rem', color: '#e2e8f0', cursor: 'pointer' }}>
                  Tự động khởi chạy bot ngay sau khi deploy (Start process automatically)
                </label>
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => setIsDeployModalOpen(false)}
                  style={{
                    background: 'transparent',
                    border: '1px solid #475569',
                    color: '#cbd5e1',
                    padding: '0.6rem 1.25rem',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontWeight: 600
                  }}
                >
                  Hủy (Cancel)
                </button>
                <button
                  type="submit"
                  style={{
                    background: 'linear-gradient(135deg, #0284c7 0%, #06b6d4 100%)',
                    border: 'none',
                    color: 'white',
                    padding: '0.6rem 1.5rem',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontWeight: 700,
                    boxShadow: '0 4px 14px rgba(6, 182, 212, 0.3)'
                  }}
                >
                  Deploy & Khởi chạy
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Live Terminal Console Drawer */}
      {selectedBotId !== null && (
        <div
          style={{
            marginTop: '0.5rem',
            background: '#090d16',
            border: '1px solid #334155',
            borderRadius: '12px',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            height: '420px',
            boxShadow: '0 15px 35px rgba(0, 0, 0, 0.5)',
            position: 'relative'
          }}
        >
          <div
            style={{
              background: '#0f172a',
              padding: '0.75rem 1.25rem',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              borderBottom: '1px solid #334155',
              flexWrap: 'wrap',
              gap: '0.75rem'
            }}
          >
            {(() => {
              const activeBot = botsList.find((b) => b.id === selectedBotId);
              return (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
                  <div
                    style={{
                      width: '10px',
                      height: '10px',
                      borderRadius: '50%',
                      backgroundColor: '#10b981',
                      boxShadow: '0 0 8px #10b981'
                    }}
                  />
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.95rem', fontWeight: 800, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <Terminal size={17} color="#34d399" />
                      Live Terminal Console
                    </span>
                    <span
                      style={{
                        background: 'rgba(16, 185, 129, 0.2)',
                        border: '1px solid #10b981',
                        color: '#34d399',
                        padding: '0.15rem 0.55rem',
                        borderRadius: '4px',
                        fontSize: '0.8rem',
                        fontWeight: 800,
                        fontFamily: 'var(--font-mono)'
                      }}
                    >
                      Bot #{selectedBotId}
                    </span>
                    {activeBot && (
                      <>
                        <span style={{ color: '#f1f5f9', fontWeight: 700, fontSize: '0.9rem' }}>
                          {activeBot.name}
                        </span>
                        <span style={{ color: '#475569' }}>•</span>
                        <span
                          style={{
                            color: '#38bdf8',
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            background: '#1e293b',
                            padding: '0.15rem 0.45rem',
                            borderRadius: '4px',
                            border: '1px solid #334155'
                          }}
                        >
                          {activeBot.symbol} / {activeBot.timeframe.toUpperCase()}
                        </span>
                        <span style={{ color: '#475569' }}>•</span>
                        <span
                          style={{
                            color: (activeBot.account_type || '').toLowerCase() === 'live' ? '#fbbf24' : '#94a3b8',
                            fontSize: '0.8rem',
                            fontWeight: 600
                          }}
                        >
                          {activeBot.account_label || `Account #${activeBot.account_id}`}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              );
            })()}

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <input
                type="text"
                placeholder="Filter logs..."
                value={logFilter}
                onChange={(e) => setLogFilter(e.target.value)}
                style={{
                  background: '#1e293b',
                  border: '1px solid #334155',
                  borderRadius: '4px',
                  color: 'white',
                  fontSize: '0.75rem',
                  padding: '0.25rem 0.5rem',
                  outline: 'none'
                }}
              />
              <button
                onClick={() => {
                  const nextState = !autoScroll;
                  setAutoScroll(nextState);
                  if (nextState && logContainerRef.current) {
                    logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
                  }
                }}
                style={{
                  background: autoScroll ? '#0284c7' : 'transparent',
                  border: '1px solid #475569',
                  color: 'white',
                  padding: '0.25rem 0.65rem',
                  borderRadius: '4px',
                  fontSize: '0.75rem',
                  cursor: 'pointer'
                }}
              >
                Auto-scroll: {autoScroll ? 'ON' : 'OFF'}
              </button>
              <button
                onClick={() => setBotLogs([])}
                style={{
                  background: 'transparent',
                  border: '1px solid #475569',
                  color: '#cbd5e1',
                  padding: '0.25rem 0.65rem',
                  borderRadius: '4px',
                  fontSize: '0.75rem',
                  cursor: 'pointer'
                }}
              >
                Clear
              </button>
              <button
                onClick={closeLogs}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#f43f5e',
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  fontWeight: 600,
                  marginLeft: '0.5rem'
                }}
              >
                Close ✕
              </button>
            </div>
          </div>

          <div
            ref={logContainerRef}
            onScroll={handleLogScroll}
            style={{
              padding: '1.25rem',
              overflowY: 'auto',
              flex: 1,
              fontFamily: 'var(--font-mono)',
              fontSize: '0.825rem',
              lineHeight: '1.5',
              whiteSpace: 'pre-wrap',
              background: '#090d16',
              color: '#94a3b8'
            }}
          >
            {botLogs.length === 0 ? (
              <div style={{ color: '#475569', textAlign: 'center', padding: '2rem' }}>
                Waiting for stdout stream from ctrader-cli process...
              </div>
            ) : (
              botLogs
                .filter((l) => !logFilter || l.toLowerCase().includes(logFilter.toLowerCase()))
                .map((log, i) => {
                  let color = '#cbd5e1';
                  if (log.includes('Starting Bot') || log.includes('INFO')) color = '#38bdf8';
                  if (log.includes('ERROR') || log.includes('Exception') || log.includes('Failed')) color = '#f87171';
                  if (log.includes('WARN')) color = '#fbbf24';
                  if (log.includes('BUY') || log.includes('SELL')) color = '#34d399';

                  return (
                    <div key={i} style={{ color, marginBottom: '0.15rem' }}>
                      {log}
                    </div>
                  );
                })
            )}
            <div ref={logsEndRef} />
          </div>

          {!autoScroll && (
            <button
              onClick={() => {
                setAutoScroll(true);
                if (logContainerRef.current) {
                  logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
                }
              }}
              style={{
                position: 'absolute',
                bottom: '1.25rem',
                right: '2rem',
                background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
                color: 'white',
                border: '1px solid rgba(56, 189, 248, 0.4)',
                borderRadius: '20px',
                padding: '0.4rem 0.9rem',
                fontSize: '0.78rem',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                cursor: 'pointer',
                boxShadow: '0 4px 16px rgba(0, 0, 0, 0.5)',
                backdropFilter: 'blur(6px)',
                zIndex: 10,
                transition: 'all 0.2s ease-in-out'
              }}
            >
              <ArrowDown size={14} className="live-pulse" /> Cuộn xuống mới nhất (Auto-scroll đang tạm dừng)
            </button>
          )}
        </div>
      )}

      {/* Bulk Action CPU-Gated Configuration Modal */}
      {bulkModalAction && (
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
            if (e.target === e.currentTarget) setBulkModalAction(null);
          }}
        >
          <div
            style={{
              background: 'linear-gradient(145deg, #1e293b, #0f172a)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              borderRadius: '16px',
              width: '100%',
              maxWidth: '520px',
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
                  background: bulkModalFleet === 'live' ? 'rgba(234, 179, 8, 0.15)' : 'rgba(56, 189, 248, 0.15)',
                  color: bulkModalFleet === 'live' ? '#fbbf24' : '#38bdf8'
                }}>
                  <Cpu size={22} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700 }}>
                    {bulkModalAction === 'start'
                      ? `Khởi chạy ${bulkModalFleet === 'live' ? 'LIVE' : 'DEMO'} Fleet (CPU-Gated)`
                      : `Khởi động lại ${bulkModalFleet === 'live' ? 'LIVE' : 'DEMO'} Fleet (CPU-Gated)`}
                  </h3>
                  <p style={{ margin: '0.15rem 0 0', fontSize: '0.78rem', color: '#94a3b8' }}>
                    Tự động đo lường tải CPU VPS trước khi kích hoạt từng bot trong {bulkModalFleet === 'live' ? 'Live' : 'Demo'} Fleet
                  </p>
                </div>
              </div>
              <button
                onClick={() => setBulkModalAction(null)}
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

            {/* Real-time VPS Telemetry Box */}
            <div style={{
              background: 'rgba(15, 23, 42, 0.6)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '12px',
              padding: '1rem',
              marginBottom: '1.25rem'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <Activity size={14} color="#38bdf8" /> Tải VPS Hiện Tại (Real-time)
                </span>
                <span style={{ fontSize: '0.72rem', color: '#64748b' }}>Cập nhật mỗi 2s</span>
              </div>

              {/* CPU & RAM Live Gauges */}
              {(() => {
                const effectiveCpu = systemMetrics?.cpu_percent ?? data?.vps_cpu_percent ?? 0;
                const effectiveRam = systemMetrics?.ram_percent ?? data?.vps_ram_percent ?? 0;
                const isSafe = effectiveCpu < maxCpuThreshold;
                const isWarning = effectiveCpu >= maxCpuThreshold && effectiveCpu < 70;
                const cpuColor = isSafe ? '#34d399' : isWarning ? '#fbbf24' : '#f87171';
                const cpuBarColor = isSafe ? '#10b981' : isWarning ? '#f59e0b' : '#ef4444';

                return (
                  <>
                    {/* CPU Meter */}
                    <div style={{ marginBottom: '0.75rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginBottom: '0.3rem' }}>
                        <span style={{ color: '#cbd5e1' }}>CPU Usage:</span>
                        <span style={{ fontWeight: 700, color: cpuColor }}>
                          {effectiveCpu}%
                          <span style={{ fontSize: '0.72rem', fontWeight: 500, marginLeft: '0.4rem', color: '#94a3b8' }}>
                            {isSafe ? '(Đạt chuẩn kích hoạt)' : isWarning ? '(Đang xử lý tải)' : '(Đang tải cao)'}
                          </span>
                        </span>
                      </div>
                      <div style={{ width: '100%', height: '8px', background: '#334155', borderRadius: '4px', overflow: 'hidden' }}>
                        <div
                          style={{
                            height: '100%',
                            width: `${Math.min(100, Math.max(3, effectiveCpu))}%`,
                            background: cpuBarColor,
                            transition: 'width 0.4s ease'
                          }}
                        />
                      </div>
                    </div>

                    {/* RAM Meter */}
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginBottom: '0.3rem' }}>
                        <span style={{ color: '#cbd5e1' }}>RAM Usage:</span>
                        <span style={{ fontWeight: 700, color: '#38bdf8' }}>
                          {effectiveRam}%
                          {systemMetrics?.ram_used_mb && systemMetrics?.ram_total_mb && (
                            <span style={{ fontSize: '0.72rem', fontWeight: 500, marginLeft: '0.4rem', color: '#94a3b8' }}>
                              ({(systemMetrics.ram_used_mb / 1024).toFixed(1)}GB / {(systemMetrics.ram_total_mb / 1024).toFixed(1)}GB)
                            </span>
                          )}
                        </span>
                      </div>
                      <div style={{ width: '100%', height: '8px', background: '#334155', borderRadius: '4px', overflow: 'hidden' }}>
                        <div
                          style={{
                            height: '100%',
                            width: `${Math.min(100, Math.max(3, effectiveRam))}%`,
                            background: '#0ea5e9',
                            transition: 'width 0.4s ease'
                          }}
                        />
                      </div>
                    </div>
                  </>
                );
              })()}
            </div>

            {/* Threshold & Timing Configurations */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1.5rem' }}>
              {/* Max CPU Threshold Slider */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                  <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#e2e8f0' }}>
                    Ngưỡng CPU Kích Hoạt Tối Đa:
                  </label>
                  <span style={{
                    background: 'rgba(56, 189, 248, 0.15)',
                    color: '#38bdf8',
                    padding: '2px 8px',
                    borderRadius: '6px',
                    fontWeight: 700,
                    fontSize: '0.9rem'
                  }}>
                    &lt; {maxCpuThreshold}%
                  </span>
                </div>
                <input
                  type="range"
                  min={20}
                  max={80}
                  step={5}
                  value={maxCpuThreshold}
                  onChange={(e) => setMaxCpuThreshold(Number(e.target.value))}
                  style={{
                    width: '100%',
                    accentColor: '#38bdf8',
                    cursor: 'pointer'
                  }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: '#64748b', marginTop: '0.15rem' }}>
                  <span>20% (Rất an toàn)</span>
                  <span style={{ color: '#38bdf8', fontWeight: 600 }}>40% (Khuyến nghị)</span>
                  <span>80% (Nhanh)</span>
                </div>
                <p style={{ margin: '0.35rem 0 0', fontSize: '0.75rem', color: '#94a3b8', lineHeight: '1.4' }}>
                  💡 Khi CPU VPS hạ xuống <strong>dưới {maxCpuThreshold}%</strong> (duy trì 2 lần đo liên tiếp), hệ thống sẽ lập tức khởi chạy bot tiếp theo.
                </p>
              </div>

              {/* Timing settings grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '0.3rem' }}>
                    Nghỉ tối thiểu sau mỗi bot:
                  </label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type="number"
                      min={5}
                      max={60}
                      value={minDelaySeconds}
                      onChange={(e) => setMinDelaySeconds(Math.max(5, Number(e.target.value)))}
                      style={{
                        width: '100%',
                        background: '#0f172a',
                        border: '1px solid #334155',
                        borderRadius: '8px',
                        color: 'white',
                        padding: '0.5rem 0.75rem',
                        fontSize: '0.85rem'
                      }}
                    />
                    <span style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', fontSize: '0.75rem', color: '#64748b' }}>
                      giây
                    </span>
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '0.3rem' }}>
                    Timeout tối đa mỗi bot:
                  </label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type="number"
                      min={30}
                      max={300}
                      value={maxWaitSeconds}
                      onChange={(e) => setMaxWaitSeconds(Math.max(30, Number(e.target.value)))}
                      style={{
                        width: '100%',
                        background: '#0f172a',
                        border: '1px solid #334155',
                        borderRadius: '8px',
                        color: 'white',
                        padding: '0.5rem 0.75rem',
                        fontSize: '0.85rem'
                      }}
                    />
                    <span style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', fontSize: '0.75rem', color: '#64748b' }}>
                      giây
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button
                type="button"
                onClick={() => setBulkModalAction(null)}
                style={{
                  background: 'rgba(100, 116, 139, 0.2)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  color: '#94a3b8',
                  padding: '0.6rem 1.1rem',
                  borderRadius: '8px',
                  fontWeight: 600,
                  fontSize: '0.85rem',
                  cursor: 'pointer'
                }}
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={executeBulkActionWithCpuGate}
                style={{
                  background: bulkModalAction === 'start'
                    ? 'linear-gradient(135deg, #10b981, #059669)'
                    : 'linear-gradient(135deg, #0284c7, #0369a1)',
                  border: 'none',
                  color: 'white',
                  padding: '0.6rem 1.3rem',
                  borderRadius: '8px',
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)'
                }}
              >
                <Zap size={16} />
                <span>
                  {bulkModalAction === 'start'
                    ? `Bắt đầu Khởi chạy (CPU < ${maxCpuThreshold}%)`
                    : `Bắt đầu Khởi động lại (CPU < ${maxCpuThreshold}%)`}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Parameter Studio Modal */}
      {paramModalBot && (
        <ParameterStudioModal
          botId={paramModalBot.id}
          botName={paramModalBot.name}
          status={paramModalBot.status}
          accounts={accounts}
          onNavigateToAccounts={onNavigateToAccounts}
          onClose={() => setParamModalBot(null)}
          onSuccess={(msg) => {
            showBanner('success', msg);
            refreshData();
            fetchAuxiliaryData();
          }}
          isGuest={isGuest}
        />
      )}
    </div>
  );
}
