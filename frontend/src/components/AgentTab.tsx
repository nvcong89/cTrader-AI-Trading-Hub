import { useState, useEffect } from 'react';
import axios from 'axios';
import { getApiBaseUrl } from '../config';
import { 
  Cpu, 
  Brain, 
  CheckCircle2, 
  XCircle, 
  RefreshCw, 
  Eye, 
  EyeOff, 
  Sparkles, 
  Server,
  Play,
  Layers,
  FileCode,
  Zap,
  Info
} from 'lucide-react';

interface AgentConfig {
  active_provider: 'qwen_api' | 'deepseek_api' | 'gemini_api' | 'openai_api';
  gemini_api_key_masked: string;
  gemini_has_key: boolean;
  gemini_model: string;
  deepseek_api_key_masked: string;
  deepseek_has_key: boolean;
  deepseek_model: string;
  openai_api_key_masked: string;
  openai_has_key: boolean;
  openai_model: string;
  qwen_api_key_masked: string;
  qwen_has_key: boolean;
  qwen_model: string;
  qwen_endpoint: string;
  env_file_path?: string;
  env_file_exists?: boolean;
}

interface TestResult {
  status: 'success' | 'error';
  provider: string;
  model: string;
  latency_ms: number;
  decision?: {
    action: string;
    volume_lots: number;
    sl_pips: number;
    tp_pips: number;
    reason: string;
    confidence: number;
  };
  raw_preview?: string;
  message?: string;
}

interface AgentTabProps {
  isGuest?: boolean;
}

export default function AgentTab({ isGuest = false }: AgentTabProps) {
  const [config, setConfig] = useState<AgentConfig | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [testing, setTesting] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);

  // Form Inputs
  const [activeProvider, setActiveProvider] = useState<string>('qwen_api');
  const [geminiKey, setGeminiKey] = useState<string>('');
  const [geminiModel, setGeminiModel] = useState<string>('gemini-1.5-flash');
  const [deepseekKey, setDeepseekKey] = useState<string>('');
  const [deepseekModel, setDeepseekModel] = useState<string>('deepseek-chat');
  const [openaiKey, setOpenaiKey] = useState<string>('');
  const [openaiModel, setOpenaiModel] = useState<string>('gpt-4o-mini');
  const [qwenKey, setQwenKey] = useState<string>('');
  const [qwenModel, setQwenModel] = useState<string>('qwen/qwen-2.5-72b-instruct');
  const [qwenEndpoint, setQwenEndpoint] = useState<string>('https://openrouter.ai/api/v1/chat/completions');

  // Key Visibility Toggles
  const [showGeminiKey, setShowGeminiKey] = useState<boolean>(false);
  const [showDeepseekKey, setShowDeepseekKey] = useState<boolean>(false);
  const [showOpenaiKey, setShowOpenaiKey] = useState<boolean>(false);
  const [showQwenKey, setShowQwenKey] = useState<boolean>(false);

  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const fetchConfig = async () => {
    try {
      const cfgRes = await axios.get(`${getApiBaseUrl()}/api/agent/config`, { withCredentials: true });
      setConfig(cfgRes.data);
      if (cfgRes.data.active_provider === 'gemini_web') {
        setActiveProvider('qwen_api');
      } else {
        setActiveProvider(cfgRes.data.active_provider || 'qwen_api');
      }
      setGeminiModel(cfgRes.data.gemini_model || 'gemini-1.5-flash');
      setDeepseekModel(cfgRes.data.deepseek_model || 'deepseek-chat');
      setOpenaiModel(cfgRes.data.openai_model || 'gpt-4o-mini');
      setQwenModel(cfgRes.data.qwen_model || 'qwen/qwen-2.5-72b-instruct');
      setQwenEndpoint(cfgRes.data.qwen_endpoint || 'https://openrouter.ai/api/v1/chat/completions');
      setLoading(false);
    } catch (err: any) {
      console.error('Error fetching agent config:', err);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConfig();
  }, []);

  const handleSaveConfig = async (overrideProvider?: string) => {
    setSaving(true);
    setNotification(null);
    try {
      const targetProvider = overrideProvider || activeProvider;
      await axios.post(`${getApiBaseUrl()}/api/agent/config`, {
        active_provider: targetProvider,
        gemini_api_key: geminiKey || undefined,
        gemini_model: geminiModel,
        deepseek_api_key: deepseekKey || undefined,
        deepseek_model: deepseekModel,
        openai_api_key: openaiKey || undefined,
        openai_model: openaiModel,
        qwen_api_key: qwenKey || undefined,
        qwen_model: qwenModel,
        qwen_endpoint: qwenEndpoint
      }, { withCredentials: true });

      setNotification({ 
        type: 'success', 
        message: `✅ Đã lưu cấu hình [${targetProvider.toUpperCase()}] và tự động đồng bộ vào file API_key.env thành công!` 
      });
      await fetchConfig();
      // Clear typed keys after saving so masked representation shows
      setGeminiKey('');
      setDeepseekKey('');
      setOpenaiKey('');
      setQwenKey('');
    } catch (err: any) {
      setNotification({ type: 'error', message: `Lỗi khi lưu cấu hình: ${err.response?.data?.detail || err.message}` });
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async (provider: string, customKey: string, customModel: string, customEndpoint?: string) => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await axios.post(`${getApiBaseUrl()}/api/agent/test-connection`, {
        provider,
        api_key: customKey || undefined,
        model: customModel,
        endpoint: customEndpoint || undefined
      }, { withCredentials: true });

      setTestResult(res.data);
    } catch (err: any) {
      setTestResult({
        status: 'error',
        provider,
        model: customModel,
        latency_ms: 0,
        message: err.response?.data?.detail || err.message
      });
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return <div style={{ color: '#94a3b8', padding: '2rem' }}>Đang nạp cấu hình AI Agent Hub...</div>;
  }

  const providers = [
    {
      id: 'qwen_api',
      name: 'Qwen AI (Alibaba / OpenRouter)',
      badge: 'Khuyên Dùng Cho cBot',
      badgeColor: '#10b981',
      icon: Zap,
      color: '#f59e0b',
      desc: 'Mô hình tối ưu cho cBot Direct AI (Qwen 2.5 72B / Flash). Tốc độ cực nhanh ~800ms, hỗ trợ chuẩn xác JSON format.'
    },
    {
      id: 'deepseek_api',
      name: 'DeepSeek Reasoning API',
      badge: 'Quant Reasoning',
      badgeColor: '#3b82f6',
      icon: Brain,
      color: '#3b82f6',
      desc: 'DeepSeek-V3 và DeepSeek-R1 chuyên sâu về suy luận định lượng, phân tích cấu trúc thị trường SMC và xác suất.'
    },
    {
      id: 'gemini_api',
      name: 'Google Gemini Official API',
      badge: 'Google AI Direct',
      badgeColor: '#a855f7',
      icon: Sparkles,
      color: '#a855f7',
      desc: 'API chính thức từ Google Generative AI (Gemini 1.5 Flash / Pro). Băng thông cao và hỗ trợ context thị trường lớn.'
    },
    {
      id: 'openai_api',
      name: 'OpenAI API',
      badge: 'GPT-4o Engine',
      badgeColor: '#10b981',
      icon: Cpu,
      color: '#10b981',
      desc: 'OpenAI GPT-4o và GPT-4o-mini với khả năng tuân thủ cấu trúc JSON nghiêm ngặt và độ ổn định cao.'
    }
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', maxWidth: '1200px' }}>
      {/* Header Banner */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.95) 0%, rgba(15, 23, 42, 0.98) 100%)',
        padding: '1.5rem',
        borderRadius: '12px',
        border: '1px solid #334155',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
        flexWrap: 'wrap',
        gap: '1rem'
      }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.5rem', color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <Cpu size={26} color="#38bdf8" /> AI API Key & Multi-Provider Hub
          </h1>
          <p style={{ margin: '0.4rem 0 0 0', color: '#94a3b8', fontSize: '0.92rem' }}>
            Quản lý tập trung các khóa API AI, tự động đồng bộ hóa 2 chiều vào file <code style={{ color: '#38bdf8' }}>API_key.env</code> cho toàn bộ cBot, và kiểm thử kết nối trực tiếp.
          </p>
        </div>

        {/* Global Status Badges */}
        <div style={{ display: 'flex', gap: '0.8rem', alignItems: 'center' }}>
          <div style={{
            background: 'rgba(56, 189, 248, 0.1)',
            border: '1px solid rgba(56, 189, 248, 0.3)',
            padding: '0.6rem 1rem',
            borderRadius: '10px',
            textAlign: 'right'
          }}>
            <div style={{ fontSize: '0.7rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Engine Mặc Định</div>
            <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#38bdf8', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '0.4rem', justifyContent: 'flex-end' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#10b981', display: 'inline-block' }}></span>
              {activeProvider.replace('_api', '').toUpperCase()}
            </div>
          </div>

          <div style={{
            background: 'rgba(16, 185, 129, 0.1)',
            border: '1px solid rgba(16, 185, 129, 0.3)',
            padding: '0.6rem 1rem',
            borderRadius: '10px',
            textAlign: 'right'
          }}>
            <div style={{ fontSize: '0.7rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Trạng Thái Key Sync</div>
            <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#34d399', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <FileCode size={14} /> API_key.env: OK
            </div>
          </div>
        </div>
      </div>

      {notification && (
        <div style={{
          padding: '0.9rem 1.2rem',
          borderRadius: '8px',
          background: notification.type === 'success' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
          border: `1px solid ${notification.type === 'success' ? '#10b981' : '#ef4444'}`,
          color: notification.type === 'success' ? '#34d399' : '#f87171',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          fontSize: '0.95rem'
        }}>
          {notification.type === 'success' ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
          {notification.message}
        </div>
      )}

      {/* 1. Provider Selection Cards Grid */}
      <div>
        <h3 style={{ margin: '0 0 0.8rem 0', color: '#cbd5e1', fontSize: '1.05rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <Layers size={18} color="#38bdf8" /> 1. Chọn Nhà Cung Cấp AI (Select AI Provider)
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem' }}>
          {providers.map((p) => {
            const IconComp = p.icon;
            const isSelected = activeProvider === p.id;
            return (
              <div 
                key={p.id}
                onClick={() => {
                  if (isGuest) return;
                  setActiveProvider(p.id);
                  handleSaveConfig(p.id);
                }}
                style={{
                  background: isSelected ? 'rgba(30, 41, 59, 0.95)' : '#1e293b',
                  border: isSelected ? `2px solid ${p.color}` : '1px solid #334155',
                  borderRadius: '10px',
                  padding: '1.2rem',
                  cursor: isGuest ? 'default' : 'pointer',
                  transition: 'all 0.2s ease',
                  position: 'relative',
                  boxShadow: isSelected ? `0 0 15px rgba(56, 189, 248, 0.2)` : 'none'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                  <div style={{
                    width: '38px',
                    height: '38px',
                    borderRadius: '8px',
                    background: `${p.color}15`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: `1px solid ${p.color}40`
                  }}>
                    <IconComp size={20} color={p.color} />
                  </div>
                  <span style={{
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    padding: '3px 8px',
                    borderRadius: '12px',
                    background: isSelected ? p.color : '#334155',
                    color: isSelected ? '#0f172a' : '#94a3b8'
                  }}>
                    {isSelected ? 'ACTIVE' : p.badge}
                  </span>
                </div>

                <div style={{ fontWeight: 700, fontSize: '1rem', color: isSelected ? '#f8fafc' : '#e2e8f0', marginBottom: '0.3rem' }}>
                  {p.name}
                </div>
                <div style={{ fontSize: '0.82rem', color: '#94a3b8', lineHeight: 1.4 }}>
                  {p.desc}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 2. Provider Detailed Configuration Box */}
      <div style={{
        background: '#1e293b',
        padding: '1.5rem',
        borderRadius: '12px',
        border: '1px solid #334155',
        display: 'flex',
        flexDirection: 'column',
        gap: '1.5rem'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #334155', paddingBottom: '0.8rem', flexWrap: 'wrap', gap: '0.8rem' }}>
          <h3 style={{ margin: 0, color: '#f8fafc', fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Server size={18} color="#38bdf8" /> 2. Cấu Hình Khóa Xác Thực & Đồng Bộ (API Key & Endpoints)
          </h3>
          <button
            onClick={() => !isGuest && handleSaveConfig()}
            disabled={saving || isGuest}
            title={isGuest ? "Chế độ Guest chỉ xem (View-Only)" : "Lưu cấu hình AI"}
            style={{
              background: isGuest ? 'rgba(100, 116, 139, 0.3)' : '#0284c7',
              color: isGuest ? '#94a3b8' : 'white',
              border: 'none',
              borderRadius: '6px',
              padding: '0.55rem 1.2rem',
              fontWeight: 600,
              fontSize: '0.9rem',
              cursor: saving || isGuest ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              opacity: isGuest ? 0.5 : 1,
              boxShadow: isGuest ? 'none' : '0 2px 8px rgba(2, 132, 199, 0.4)'
            }}
          >
            {saving ? <RefreshCw size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
            {isGuest ? 'Save Config (Disabled)' : 'Lưu & Đồng Bộ Vào API_key.env'}
          </button>
        </div>

        {/* Qwen AI Configuration Card */}
        {activeProvider === 'qwen_api' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: '#94a3b8', marginBottom: '0.4rem' }}>
                  Qwen / OpenRouter API Key {config?.qwen_has_key && <span style={{ color: '#10b981', fontWeight: 600 }}>(Đã lưu: {config.qwen_api_key_masked})</span>}
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showQwenKey ? 'text' : 'password'}
                    placeholder={config?.qwen_has_key ? config.qwen_api_key_masked : 'Nhập API Key (sk-or-v1-... hoặc sk-...)'}
                    value={qwenKey}
                    onChange={(e) => setQwenKey(e.target.value)}
                    style={{
                      width: '100%',
                      background: '#0f172a',
                      border: '1px solid #334155',
                      borderRadius: '6px',
                      padding: '0.6rem 2.5rem 0.6rem 0.8rem',
                      color: 'white',
                      fontSize: '0.9rem',
                      outline: 'none'
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowQwenKey(!showQwenKey)}
                    style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
                  >
                    {showQwenKey ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: '#94a3b8', marginBottom: '0.4rem' }}>Mô Hình (Model Name)</label>
                <input
                  type="text"
                  placeholder="qwen/qwen-2.5-72b-instruct"
                  value={qwenModel}
                  onChange={(e) => setQwenModel(e.target.value)}
                  style={{
                    width: '100%',
                    background: '#0f172a',
                    border: '1px solid #334155',
                    borderRadius: '6px',
                    padding: '0.6rem 0.8rem',
                    color: 'white',
                    fontSize: '0.9rem',
                    outline: 'none'
                  }}
                />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', color: '#94a3b8', marginBottom: '0.4rem' }}>Endpoint URL (OpenRouter hoặc DashScope)</label>
              <input
                type="text"
                placeholder="https://openrouter.ai/api/v1/chat/completions"
                value={qwenEndpoint}
                onChange={(e) => setQwenEndpoint(e.target.value)}
                style={{
                  width: '100%',
                  background: '#0f172a',
                  border: '1px solid #334155',
                  borderRadius: '6px',
                  padding: '0.6rem 0.8rem',
                  color: 'white',
                  fontSize: '0.9rem',
                  outline: 'none'
                }}
              />
            </div>
          </div>
        )}

        {/* DeepSeek API Card */}
        {activeProvider === 'deepseek_api' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', color: '#94a3b8', marginBottom: '0.4rem' }}>
                DeepSeek API Key {config?.deepseek_has_key && <span style={{ color: '#10b981', fontWeight: 600 }}>(Đã lưu: {config.deepseek_api_key_masked})</span>}
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showDeepseekKey ? 'text' : 'password'}
                  placeholder={config?.deepseek_has_key ? config.deepseek_api_key_masked : 'Nhập DeepSeek API Key (sk-...)'}
                  value={deepseekKey}
                  onChange={(e) => setDeepseekKey(e.target.value)}
                  style={{
                    width: '100%',
                    background: '#0f172a',
                    border: '1px solid #334155',
                    borderRadius: '6px',
                    padding: '0.6rem 2.5rem 0.6rem 0.8rem',
                    color: 'white',
                    fontSize: '0.9rem',
                    outline: 'none'
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowDeepseekKey(!showDeepseekKey)}
                  style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
                >
                  {showDeepseekKey ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', color: '#94a3b8', marginBottom: '0.4rem' }}>Mô Hình (Model)</label>
              <select
                value={deepseekModel}
                onChange={(e) => setDeepseekModel(e.target.value)}
                style={{
                  width: '100%',
                  background: '#0f172a',
                  border: '1px solid #334155',
                  borderRadius: '6px',
                  padding: '0.6rem 0.8rem',
                  color: 'white',
                  fontSize: '0.9rem',
                  outline: 'none'
                }}
              >
                <option value="deepseek-chat">deepseek-chat (DeepSeek-V3)</option>
                <option value="deepseek-reasoner">deepseek-reasoner (DeepSeek-R1)</option>
              </select>
            </div>
          </div>
        )}

        {/* Gemini API Card */}
        {activeProvider === 'gemini_api' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', color: '#94a3b8', marginBottom: '0.4rem' }}>
                Google Gemini API Key {config?.gemini_has_key && <span style={{ color: '#10b981', fontWeight: 600 }}>(Đã lưu: {config.gemini_api_key_masked})</span>}
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showGeminiKey ? 'text' : 'password'}
                  placeholder={config?.gemini_has_key ? config.gemini_api_key_masked : 'Nhập Google Gemini API Key (AIzaSy...)'}
                  value={geminiKey}
                  onChange={(e) => setGeminiKey(e.target.value)}
                  style={{
                    width: '100%',
                    background: '#0f172a',
                    border: '1px solid #334155',
                    borderRadius: '6px',
                    padding: '0.6rem 2.5rem 0.6rem 0.8rem',
                    color: 'white',
                    fontSize: '0.9rem',
                    outline: 'none'
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowGeminiKey(!showGeminiKey)}
                  style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
                >
                  {showGeminiKey ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', color: '#94a3b8', marginBottom: '0.4rem' }}>Mô Hình (Model)</label>
              <select
                value={geminiModel}
                onChange={(e) => setGeminiModel(e.target.value)}
                style={{
                  width: '100%',
                  background: '#0f172a',
                  border: '1px solid #334155',
                  borderRadius: '6px',
                  padding: '0.6rem 0.8rem',
                  color: 'white',
                  fontSize: '0.9rem',
                  outline: 'none'
                }}
              >
                <option value="gemini-1.5-flash">gemini-1.5-flash (Nhanh & Tiết Kiệm)</option>
                <option value="gemini-1.5-pro">gemini-1.5-pro (Suy Luận Sâu)</option>
                <option value="gemini-2.0-flash">gemini-2.0-flash (Thế Hệ 2.0 Siêu Tốc)</option>
              </select>
            </div>
          </div>
        )}

        {/* OpenAI API Card */}
        {activeProvider === 'openai_api' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', color: '#94a3b8', marginBottom: '0.4rem' }}>
                OpenAI API Key {config?.openai_has_key && <span style={{ color: '#10b981', fontWeight: 600 }}>(Đã lưu: {config.openai_api_key_masked})</span>}
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showOpenaiKey ? 'text' : 'password'}
                  placeholder={config?.openai_has_key ? config.openai_api_key_masked : 'Nhập OpenAI API Key (sk-proj-...)'}
                  value={openaiKey}
                  onChange={(e) => setOpenaiKey(e.target.value)}
                  style={{
                    width: '100%',
                    background: '#0f172a',
                    border: '1px solid #334155',
                    borderRadius: '6px',
                    padding: '0.6rem 2.5rem 0.6rem 0.8rem',
                    color: 'white',
                    fontSize: '0.9rem',
                    outline: 'none'
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowOpenaiKey(!showOpenaiKey)}
                  style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
                >
                  {showOpenaiKey ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', color: '#94a3b8', marginBottom: '0.4rem' }}>Mô Hình (Model)</label>
              <select
                value={openaiModel}
                onChange={(e) => setOpenaiModel(e.target.value)}
                style={{
                  width: '100%',
                  background: '#0f172a',
                  border: '1px solid #334155',
                  borderRadius: '6px',
                  padding: '0.6rem 0.8rem',
                  color: 'white',
                  fontSize: '0.9rem',
                  outline: 'none'
                }}
              >
                <option value="gpt-4o-mini">gpt-4o-mini (Tối Ưu Tốc Độ & Chi Phí)</option>
                <option value="gpt-4o">gpt-4o (Đỉnh Cao Đa Phương Thức)</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {/* 3. Interactive Live Test Bench (Kiểm Thử Kết Nối) */}
      <div style={{
        background: '#1e293b',
        padding: '1.5rem',
        borderRadius: '12px',
        border: '1px solid #334155',
        display: 'flex',
        flexDirection: 'column',
        gap: '1.2rem'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.8rem' }}>
          <div>
            <h3 style={{ margin: 0, color: '#f8fafc', fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Play size={18} color="#10b981" /> 3. Kiểm Thử Kết Nối & Đo Độ Trễ (Live Test Bench)
            </h3>
            <p style={{ margin: '0.3rem 0 0 0', color: '#94a3b8', fontSize: '0.85rem' }}>
              Gửi một snapshot thị trường giả lập (XAUUSD M15) để kiểm tra hạn mức API, đo độ trễ ms, và kiểm tra định dạng JSON.
            </p>
          </div>

          <button
            onClick={() => {
              if (isGuest) return;
              if (activeProvider === 'qwen_api') handleTestConnection('qwen_api', qwenKey, qwenModel, qwenEndpoint);
              else if (activeProvider === 'deepseek_api') handleTestConnection('deepseek_api', deepseekKey, deepseekModel);
              else if (activeProvider === 'gemini_api') handleTestConnection('gemini_api', geminiKey, geminiModel);
              else if (activeProvider === 'openai_api') handleTestConnection('openai_api', openaiKey, openaiModel);
            }}
            disabled={testing || isGuest}
            title={isGuest ? "Chế độ Guest chỉ xem (View-Only)" : "Kiểm thử kết nối API"}
            style={{
              background: isGuest ? 'rgba(100, 116, 139, 0.3)' : '#10b981',
              color: isGuest ? '#94a3b8' : '#0f172a',
              border: 'none',
              borderRadius: '6px',
              padding: '0.6rem 1.3rem',
              fontWeight: 700,
              fontSize: '0.9rem',
              cursor: testing || isGuest ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              opacity: isGuest ? 0.5 : 1,
              boxShadow: isGuest ? 'none' : '0 2px 10px rgba(16, 185, 129, 0.4)'
            }}
          >
            {testing ? <RefreshCw size={16} className="animate-spin" /> : <Play size={16} />}
            {testing ? 'Đang gửi truy vấn...' : isGuest ? 'Kiểm Thử (Disabled)' : `Kiểm Thử ${activeProvider.replace('_api', '').toUpperCase()} Ngay`}
          </button>
        </div>

        {/* Test Result Display Card */}
        {testResult && (
          <div style={{
            background: testResult.status === 'success' ? 'rgba(16, 185, 129, 0.08)' : 'rgba(239, 68, 68, 0.08)',
            border: `1px solid ${testResult.status === 'success' ? '#10b981' : '#ef4444'}`,
            borderRadius: '8px',
            padding: '1.2rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.8rem'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                {testResult.status === 'success' ? (
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', color: '#34d399', fontWeight: 700, fontSize: '0.95rem' }}>
                    <CheckCircle2 size={18} /> KẾT NỐI THÀNH CÔNG (HTTP 200 OK)
                  </span>
                ) : (
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', color: '#f87171', fontWeight: 700, fontSize: '0.95rem' }}>
                    <XCircle size={18} /> KẾT NỐI THẤT BẠI
                  </span>
                )}
                <span style={{ background: '#334155', padding: '2px 8px', borderRadius: '6px', fontSize: '0.75rem', color: '#cbd5e1' }}>
                  Model: {testResult.model}
                </span>
              </div>

              <div style={{
                background: testResult.latency_ms < 1500 ? 'rgba(16, 185, 129, 0.2)' : 'rgba(234, 179, 8, 0.2)',
                border: `1px solid ${testResult.latency_ms < 1500 ? '#10b981' : '#eab308'}`,
                color: testResult.latency_ms < 1500 ? '#34d399' : '#fde047',
                padding: '3px 10px',
                borderRadius: '12px',
                fontSize: '0.8rem',
                fontWeight: 700
              }}>
                ⚡ Độ Trễ: {testResult.latency_ms} ms
              </div>
            </div>

            {testResult.status === 'success' && testResult.decision && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.6rem', marginTop: '0.4rem' }}>
                <div style={{ background: '#0f172a', padding: '0.6rem', borderRadius: '6px', border: '1px solid #334155' }}>
                  <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>HÀNH ĐỘNG (ACTION)</div>
                  <div style={{
                    fontSize: '1rem',
                    fontWeight: 800,
                    color: testResult.decision.action === 'BUY' ? '#34d399' : testResult.decision.action === 'SELL' ? '#f87171' : '#38bdf8'
                  }}>
                    {testResult.decision.action}
                  </div>
                </div>

                <div style={{ background: '#0f172a', padding: '0.6rem', borderRadius: '6px', border: '1px solid #334155' }}>
                  <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>KHỐI LƯỢNG (LOTS)</div>
                  <div style={{ fontSize: '1rem', fontWeight: 800, color: '#f8fafc' }}>
                    {testResult.decision.volume_lots}
                  </div>
                </div>

                <div style={{ background: '#0f172a', padding: '0.6rem', borderRadius: '6px', border: '1px solid #334155' }}>
                  <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>SL / TP (PIPS)</div>
                  <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#e2e8f0' }}>
                    SL {testResult.decision.sl_pips} / TP {testResult.decision.tp_pips}
                  </div>
                </div>

                <div style={{ background: '#0f172a', padding: '0.6rem', borderRadius: '6px', border: '1px solid #334155' }}>
                  <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>ĐỘ TỰ TIN (CONFIDENCE)</div>
                  <div style={{ fontSize: '1rem', fontWeight: 800, color: '#38bdf8' }}>
                    {testResult.decision.confidence}%
                  </div>
                </div>
              </div>
            )}

            {testResult.status === 'success' && testResult.decision?.reason && (
              <div style={{ fontSize: '0.85rem', color: '#cbd5e1', background: '#0f172a', padding: '0.6rem 0.8rem', borderRadius: '6px', border: '1px solid #334155' }}>
                <strong style={{ color: '#38bdf8' }}>Lý do kỹ thuật (Reason):</strong> {testResult.decision.reason}
              </div>
            )}

            {testResult.status === 'error' && (
              <div style={{ color: '#f87171', fontSize: '0.85rem', background: '#0f172a', padding: '0.6rem 0.8rem', borderRadius: '6px', border: '1px solid #ef4444' }}>
                <strong>Chi tiết lỗi:</strong> {testResult.message}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 4. Information Card */}
      <div style={{
        background: 'rgba(56, 189, 248, 0.05)',
        border: '1px solid rgba(56, 189, 248, 0.2)',
        borderRadius: '10px',
        padding: '1.2rem',
        display: 'flex',
        alignItems: 'flex-start',
        gap: '0.8rem'
      }}>
        <Info size={22} color="#38bdf8" style={{ flexShrink: 0, marginTop: '2px' }} />
        <div style={{ fontSize: '0.88rem', color: '#cbd5e1', lineHeight: 1.5 }}>
          <strong style={{ color: '#38bdf8' }}>Cơ chế đọc API Key của cBot:</strong> Khi bạn lưu API Key tại đây, Web Server sẽ tự động ghi đè vào file <code style={{ color: '#38bdf8' }}>API_key.env</code>. Các cBot cTrader đang chạy ở chế độ <strong>Direct AI</strong> sẽ tự động nạp Key mới ngay trong lần truy vấn kế tiếp mà không cần phải khởi động lại bot.
        </div>
      </div>
    </div>
  );
}
