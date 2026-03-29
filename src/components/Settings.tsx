import { useState, useEffect } from 'react';
import { useStore, ApiProvider, defaultProviderConfigs } from '../store';
import { Save, ArrowLeft, RefreshCw, Lock, Shield, Eye, EyeOff, Trash2, Key, Database } from 'lucide-react';
import SecureStorage from '../utils/secureStorage';
import { calculateStorageSize, clearIndexedDbCache, formatBytes } from '../utils/storageUtils';

interface ModelInfo {
  name: string;
  displayName: string;
}

export function Settings() {
  const { apiProvider, providerConfigs, setSettings, setActiveProvider, setIsSettingsOpen } = useStore();
  const [localApiProvider, setLocalApiProvider] = useState<string>(apiProvider || 'gemini');

  // Initialize local state with the config of the currently selected provider
  const currentConfig = providerConfigs[localApiProvider as ApiProvider] || defaultProviderConfigs[localApiProvider as ApiProvider] || defaultProviderConfigs['gemini'];
  const [localApiKey, setLocalApiKey] = useState(currentConfig.apiKey);
  const [localBaseUrl, setLocalBaseUrl] = useState(currentConfig.baseUrl);
  const [localModel, setLocalModel] = useState(currentConfig.model);

  const [availableModels, setAvailableModels] = useState<ModelInfo[]>([]);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [modelError, setModelError] = useState('');

  // Storage & cache state
  const { cacheSize, setCacheSize, sessions, deleteSession } = useStore();
  const [isCalculatingSize, setIsCalculatingSize] = useState(false);
  const [isClearingCache, setIsClearingCache] = useState(false);

  // Security settings state
  const [showApiKey, setShowApiKey] = useState(false);
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [hasMasterPassword, setHasMasterPassword] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [securityMessage, setSecurityMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Check security status on mount
  useEffect(() => {
    checkSecurityStatus();
  }, []);

  // Calculate cache size on mount
  useEffect(() => {
    refreshCacheSize();
  }, []);

  const refreshCacheSize = async () => {
    setIsCalculatingSize(true);
    try {
      const size = await calculateStorageSize();
      setCacheSize(size);
    } finally {
      setIsCalculatingSize(false);
    }
  };

  const handleClearCache = async () => {
    if (!window.confirm('确定要清除所有页面快照和附件缓存吗？对话记录将保留，但相关页面内容将被删除。')) return;
    setIsClearingCache(true);
    try {
      // Delete IndexedDB blobs for all sessions
      for (const session of sessions) {
        for (const msg of session.messages) {
          if (msg.attachedContext?.snapshotId) {
            const { deleteContextSnapshot } = await import('../store');
            await deleteContextSnapshot(msg.attachedContext.snapshotId);
          }
          if (msg.attachments) {
            const { deleteAttachmentBlob } = await import('../store');
            for (const att of msg.attachments) {
              await deleteAttachmentBlob(att.id);
            }
          }
        }
      }
      // Also run the bulk clear for any orphaned keys
      await clearIndexedDbCache();
      await refreshCacheSize();
    } finally {
      setIsClearingCache(false);
    }
  };

  const handleClearAllHistory = async () => {
    if (!window.confirm('确定要删除所有对话记录吗？此操作不可恢复。')) return;
    setIsClearingCache(true);
    try {
      // Delete all sessions one by one (also cleans up their IndexedDB data)
      for (const session of [...sessions]) {
        await deleteSession(session.id);
      }
      await refreshCacheSize();
    } finally {
      setIsClearingCache(false);
    }
  };

  // Load API key from secure storage when provider changes
  useEffect(() => {
    loadApiKeyFromSecureStorage();
  }, [localApiProvider, isUnlocked]);

  const checkSecurityStatus = async () => {
    const hasPassword = await SecureStorage.hasMasterPassword();
    setHasMasterPassword(hasPassword);

    if (hasPassword) {
      const unlocked = await SecureStorage.checkUnlocked();
      setIsUnlocked(unlocked);
    }
  };

  const loadApiKeyFromSecureStorage = async () => {
    if (hasMasterPassword && isUnlocked) {
      const provider = localApiProvider as ApiProvider;
      const secureKey = await SecureStorage.getApiKey(provider);
      if (secureKey) {
        setLocalApiKey(secureKey);
      } else {
        // Fallback to store config if not in secure storage
        const config = providerConfigs[provider] || defaultProviderConfigs[provider];
        setLocalApiKey(config?.apiKey || '');
      }
    } else {
      // Use store config if no security or not unlocked
      const config = providerConfigs[localApiProvider as ApiProvider] || defaultProviderConfigs[localApiProvider as ApiProvider];
      setLocalApiKey(config?.apiKey || '');
    }
  };

  const handleProviderChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newProvider = e.target.value as ApiProvider;
    setLocalApiProvider(newProvider);
    setModelError('');

    // Load config for the new provider
    const newConfig = providerConfigs[newProvider] || defaultProviderConfigs[newProvider];
    if (newConfig) {
      setLocalBaseUrl(newConfig.baseUrl);
      setLocalModel(newConfig.model);

      // Load API key from secure storage if unlocked
      if (hasMasterPassword && isUnlocked) {
        const secureKey = await SecureStorage.getApiKey(newProvider);
        setLocalApiKey(secureKey || newConfig.apiKey || '');
      } else {
        setLocalApiKey(newConfig.apiKey || '');
      }
    }
  };

  const handleChangePassword = async () => {
    setSecurityMessage(null);

    if (newPassword.length < 6) {
      setSecurityMessage({ type: 'error', text: '新密码长度至少需要6个字符' });
      return;
    }

    if (newPassword !== confirmNewPassword) {
      setSecurityMessage({ type: 'error', text: '两次输入的新密码不一致' });
      return;
    }

    const result = await SecureStorage.changeMasterPassword(oldPassword, newPassword);

    if (result.success) {
      setSecurityMessage({ type: 'success', text: '密码修改成功' });
      setShowChangePassword(false);
      setOldPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
    } else {
      setSecurityMessage({ type: 'error', text: result.error || '密码修改失败' });
    }
  };

  const handleClearAllData = async () => {
    if (confirm('确定要清除所有安全数据吗？这将删除所有已保存的加密 API 密钥。')) {
      await SecureStorage.clearAll();
      setHasMasterPassword(false);
      setIsUnlocked(false);
      setLocalApiKey('');
      setSecurityMessage({ type: 'success', text: '所有安全数据已清除' });
    }
  };

  const fetchModels = async () => {
    // Get API key - use local state or secure storage
    let apiKeyToUse = localApiKey;
    if (hasMasterPassword && isUnlocked) {
      const secureKey = await SecureStorage.getApiKey(localApiProvider);
      if (secureKey) apiKeyToUse = secureKey;
    }

    if (!apiKeyToUse && localApiProvider !== 'ollama' && localApiProvider !== 'anthropic') {
      setModelError('请先输入 API 密钥');
      return;
    }

    setIsLoadingModels(true);
    setModelError('');

    try {
      const cleanBaseUrl = localBaseUrl.replace(/\/$/, '');

      if (localApiProvider === 'gemini') {
        const url = `${cleanBaseUrl}/models`;
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'Accept': '*/*',
            'Accept-Language': 'zh-CN',
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKeyToUse,
          },
        });

        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();

        if (data.models && Array.isArray(data.models)) {
          const modelsList = data.models.map((m: { name: string; displayName?: string }) => {
            const cleanName = m.name.replace(/^models\//, '');
            return { name: cleanName, displayName: m.displayName || cleanName };
          });
          setAvailableModels(modelsList);
          if (modelsList.length > 0 && !modelsList.find((m: ModelInfo) => m.name === localModel)) {
            setLocalModel(modelsList[0].name);
          }
        } else {
          throw new Error('Invalid response format');
        }
      } else if (localApiProvider === 'anthropic') {
        const modelsList = [
          { name: 'claude-3-5-sonnet-20241022', displayName: 'Claude 3.5 Sonnet' },
          { name: 'claude-3-5-haiku-20241022', displayName: 'Claude 3.5 Haiku' },
          { name: 'claude-3-opus-20240229', displayName: 'Claude 3 Opus' },
        ];
        setAvailableModels(modelsList);
        if (!modelsList.find((m: ModelInfo) => m.name === localModel)) {
          setLocalModel(modelsList[0].name);
        }
      } else if (localApiProvider === 'ollama') {
        let url = `${cleanBaseUrl}/api/tags`;
        if (cleanBaseUrl.endsWith('/v1')) {
          url = `${cleanBaseUrl.replace(/\/v1$/, '')}/api/tags`;
        }
        const response = await fetch(url, { method: 'GET' });

        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();

        if (data.models && Array.isArray(data.models)) {
          const modelsList = data.models.map((m: { name: string }) => ({
            name: m.name,
            displayName: m.name
          }));
          setAvailableModels(modelsList);
          if (modelsList.length > 0 && !modelsList.find((m: ModelInfo) => m.name === localModel)) {
            setLocalModel(modelsList[0].name);
          }
        } else {
          throw new Error('Invalid response format');
        }
      } else {
        const url = `${cleanBaseUrl}/models`;
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${apiKeyToUse}`,
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();

        if (data.data && Array.isArray(data.data)) {
          const modelsList = data.data.map((m: { id: string }) => ({
            name: m.id,
            displayName: m.id
          }));
          setAvailableModels(modelsList);
          if (modelsList.length > 0 && !modelsList.find((m: ModelInfo) => m.name === localModel)) {
            setLocalModel(modelsList[0].name);
          }
        } else {
          throw new Error('Invalid response format');
        }
      }
    } catch (error) {
      console.error('Failed to fetch models:', error);
      setModelError('获取模型列表失败，请检查 API 密钥和接口地址');
      setDefaultModels();
    } finally {
      setIsLoadingModels(false);
    }
  };

  const setDefaultModels = () => {
    const defaults: Record<string, ModelInfo[]> = {
      gemini: [
        { name: 'gemini-1.5-flash', displayName: 'gemini-1.5-flash (默认)' },
        { name: 'gemini-1.5-pro', displayName: 'gemini-1.5-pro' },
        { name: 'gemini-2.0-flash', displayName: 'gemini-2.0-flash' }
      ],
      deepseek: [
        { name: 'deepseek-chat', displayName: 'deepseek-chat (默认)' },
        { name: 'deepseek-reasoner', displayName: 'deepseek-reasoner' }
      ],
      groq: [
        { name: 'llama3-8b-8192', displayName: 'llama3-8b-8192 (默认)' },
        { name: 'llama3-70b-8192', displayName: 'llama3-70b-8192' },
        { name: 'mixtral-8x7b-32768', displayName: 'mixtral-8x7b-32768' }
      ],
      anthropic: [
        { name: 'claude-3-5-sonnet-20241022', displayName: 'Claude 3.5 Sonnet' },
        { name: 'claude-3-5-haiku-20241022', displayName: 'Claude 3.5 Haiku' },
        { name: 'claude-3-opus-20240229', displayName: 'Claude 3 Opus' },
      ],
      ollama: [
        { name: 'llama3', displayName: 'llama3 (默认)' },
        { name: 'qwen2.5', displayName: 'qwen2.5' }
      ],
      openai: [
        { name: 'gpt-4o-mini', displayName: 'gpt-4o-mini (默认)' },
        { name: 'gpt-4o', displayName: 'gpt-4o' },
        { name: 'claude-3-5-sonnet-20240620', displayName: 'claude-3-5-sonnet' }
      ]
    };
    setAvailableModels(defaults[localApiProvider] || defaults.openai);
  };

  // Fetch models on mount
  useEffect(() => {
    if (localApiKey || localApiProvider === 'ollama' || localApiProvider === 'anthropic') {
      fetchModels();
    } else {
      setDefaultModels();
    }
  }, [localApiProvider]);

  const handleSave = async () => {
    const provider = localApiProvider as ApiProvider;

    // Save API key to secure storage if security is enabled
    if (hasMasterPassword && isUnlocked && localApiKey) {
      await SecureStorage.storeApiKey(provider, localApiKey);
    }

    // Save other settings to regular storage
    setActiveProvider(provider);
    setSettings(provider, {
      apiKey: hasMasterPassword ? '' : localApiKey, // Don't store in regular storage if secured
      baseUrl: localBaseUrl,
      model: localModel,
    });
    setIsSettingsOpen(false);
  };

  return (
    <div className="absolute inset-0 bg-white dark:bg-primary z-50 flex flex-col animate-in slide-in-from-bottom-4 fade-in duration-200">
      <header className="h-[60px] border-b border-gray-200 dark:border-gray-800 flex items-center px-4 shrink-0">
        <button
          onClick={() => setIsSettingsOpen(false)}
          aria-label="返回"
          className="p-2 -ml-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-gray-600 dark:text-gray-300 mr-2"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h2 className="font-semibold text-lg">模型与 API 设置</h2>
      </header>

      <main className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Security Status Banner */}
        {hasMasterPassword && !isUnlocked && (
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
            <div className="flex items-center gap-2 text-yellow-700 dark:text-yellow-300">
              <Lock className="w-5 h-5" />
              <span className="font-medium">安全存储已锁定</span>
            </div>
            <p className="text-sm text-yellow-600 dark:text-yellow-400 mt-1">
              API 密钥已加密存储。请先解锁以访问或修改密钥。
            </p>
          </div>
        )}

        {hasMasterPassword && isUnlocked && (
          <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
            <div className="flex items-center gap-2 text-green-700 dark:text-green-300">
              <Shield className="w-5 h-5" />
              <span className="font-medium">安全存储已解锁</span>
            </div>
            <p className="text-sm text-green-600 dark:text-green-400 mt-1">
              API 密钥使用 AES-256 加密存储，当前会话已解锁。
            </p>
          </div>
        )}

        {/* API Provider Selection */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            API 提供商
          </label>
          <select
            value={localApiProvider}
            onChange={handleProviderChange}
            aria-label="API 提供商"
            className="w-full px-3 py-2 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-md focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
          >
            <option value="gemini">Google Gemini</option>
            <option value="openai">OpenAI 兼容接口</option>
            <option value="deepseek">DeepSeek</option>
            <option value="anthropic">Anthropic (Claude)</option>
            <option value="groq">Groq</option>
            <option value="ollama">Ollama (本地模型)</option>
          </select>
        </div>

        {/* API Key Input */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            API 密钥 (API Key)
          </label>
          <div className="relative">
            <input
              type={showApiKey ? 'text' : 'password'}
              value={localApiKey}
              onChange={(e) => setLocalApiKey(e.target.value)}
              placeholder={hasMasterPassword && !isUnlocked ? '请先解锁安全存储' : 'AIzaSy...'}
              disabled={hasMasterPassword && !isUnlocked}
              className="w-full px-3 py-2 pr-10 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-md focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent disabled:bg-gray-100 disabled:dark:bg-gray-800"
            />
            <button
              type="button"
              onClick={() => setShowApiKey(!showApiKey)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              {showApiKey ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
          </div>
          <p className="text-xs text-gray-500">
            {hasMasterPassword
              ? '🔒 API 密钥使用 AES-256 加密存储，浏览器关闭后需要重新解锁。'
              : '你的 API 密钥仅保存在浏览器本地，不会上传到任何第三方服务器。'}
          </p>
        </div>

        {/* Base URL */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            自定义接口地址 (Base URL)
          </label>
          <input
            type="text"
            value={localBaseUrl}
            onChange={(e) => setLocalBaseUrl(e.target.value)}
            placeholder="https://generativelanguage.googleapis.com/v1beta"
            className="w-full px-3 py-2 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-md focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
          />
          <p className="text-xs text-gray-500">
            如果你使用代理或第三方中转，请在此修改。
          </p>
        </div>

        {/* Model Selection */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              模型选择
            </label>
            <button
              onClick={fetchModels}
              disabled={isLoadingModels || (!localApiKey && localApiProvider !== 'ollama' && localApiProvider !== 'anthropic')}
              className="flex items-center gap-1 text-xs text-accent hover:text-blue-600 disabled:text-gray-400 disabled:cursor-not-allowed transition-colors"
            >
              <RefreshCw className={`w-3 h-3 ${isLoadingModels ? 'animate-spin' : ''}`} />
              获取模型
            </button>
          </div>
          <select
            value={localModel}
            onChange={(e) => setLocalModel(e.target.value)}
            disabled={isLoadingModels}
            aria-label="模型选择"
            className="w-full px-3 py-2 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-md focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent disabled:bg-gray-50 disabled:dark:bg-gray-800"
          >
            {availableModels.map((m) => (
              <option key={m.name} value={m.name}>
                {m.displayName}
              </option>
            ))}
          </select>
          {modelError && (
            <p className="text-xs text-red-500 mt-1">{modelError}</p>
          )}
        </div>

        {/* Security Settings */}
        <div className="border-t border-gray-200 dark:border-gray-700 pt-6 mt-6">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
            <Key className="w-4 h-4" />
            安全设置
          </h3>

          {securityMessage && (
            <div className={`mb-4 p-3 rounded-lg text-sm ${
              securityMessage.type === 'success'
                ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300'
                : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300'
            }`}>
              {securityMessage.text}
            </div>
          )}

          {!hasMasterPassword ? (
            <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4">
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                启用安全存储后，您的 API 密钥将使用 AES-256 加密保存，每次打开扩展需要输入密码解锁。
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-500">
                点击"保存并返回"后，将在下次打开设置时提示设置密码。
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Change Password */}
              {!showChangePassword ? (
                <button
                  onClick={() => setShowChangePassword(true)}
                  className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                >
                  <span className="text-sm text-gray-700 dark:text-gray-300">修改主密码</span>
                  <span className="text-xs text-gray-500">更改加密密码</span>
                </button>
              ) : (
                <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4 space-y-3">
                  <input
                    type="password"
                    value={oldPassword}
                    onChange={(e) => setOldPassword(e.target.value)}
                    placeholder="当前密码"
                    className="w-full px-3 py-2 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-md text-sm"
                  />
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="新密码（至少6位）"
                    className="w-full px-3 py-2 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-md text-sm"
                  />
                  <input
                    type="password"
                    value={confirmNewPassword}
                    onChange={(e) => setConfirmNewPassword(e.target.value)}
                    placeholder="确认新密码"
                    className="w-full px-3 py-2 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-md text-sm"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => setShowChangePassword(false)}
                      className="flex-1 py-2 px-3 border border-gray-300 dark:border-gray-600 rounded-md text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                    >
                      取消
                    </button>
                    <button
                      onClick={handleChangePassword}
                      className="flex-1 py-2 px-3 bg-blue-500 text-white rounded-md text-sm hover:bg-blue-600"
                    >
                      确认修改
                    </button>
                  </div>
                </div>
              )}

              {/* Lock Session */}
              {isUnlocked && (
                <button
                  onClick={async () => {
                    await SecureStorage.lock();
                    setIsUnlocked(false);
                    setSecurityMessage({ type: 'success', text: '会话已锁定' });
                  }}
                  className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                >
                  <span className="text-sm text-gray-700 dark:text-gray-300">锁定会话</span>
                  <Lock className="w-4 h-4 text-gray-500" />
                </button>
              )}

              {/* Clear All Data */}
              <button
                onClick={handleClearAllData}
                className="w-full flex items-center justify-between px-4 py-3 bg-red-50 dark:bg-red-900/20 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
              >
                <span className="text-sm text-red-700 dark:text-red-300">清除所有安全数据</span>
                <Trash2 className="w-4 h-4 text-red-500" />
              </button>
            </div>
          )}
        </div>
        {/* Storage & Cache Section */}
        <div className="border-t border-gray-200 dark:border-gray-700 pt-6 mt-6">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
            <Database className="w-4 h-4" />
            存储与缓存
          </h3>

          {/* Cache Size Display */}
          <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4 space-y-2 mb-3">
            {isCalculatingSize ? (
              <p className="text-sm text-gray-500">计算中...</p>
            ) : cacheSize ? (
              <>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-gray-600 dark:text-gray-400">IndexedDB（快照 & 附件）</span>
                  <span className="font-medium text-gray-800 dark:text-gray-200">{formatBytes(cacheSize.indexedDb)}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-gray-600 dark:text-gray-400">设置存储</span>
                  <span className="font-medium text-gray-800 dark:text-gray-200">{formatBytes(cacheSize.chromeStorage)}</span>
                </div>
                <div className="border-t border-gray-200 dark:border-gray-700 pt-2 flex justify-between items-center text-sm font-semibold">
                  <span className="text-gray-700 dark:text-gray-300">合计</span>
                  <span className="text-gray-900 dark:text-gray-100">{formatBytes(cacheSize.total)}</span>
                </div>
              </>
            ) : (
              <p className="text-sm text-gray-500">无法获取存储信息</p>
            )}
            <button
              onClick={refreshCacheSize}
              disabled={isCalculatingSize}
              className="mt-1 text-xs text-accent hover:text-blue-600 disabled:text-gray-400 flex items-center gap-1 transition-colors"
            >
              <RefreshCw className={`w-3 h-3 ${isCalculatingSize ? 'animate-spin' : ''}`} />
              刷新
            </button>
          </div>

          {/* Clear Cache Button */}
          <button
            onClick={handleClearCache}
            disabled={isClearingCache}
            className="w-full flex items-center justify-between px-4 py-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg hover:bg-yellow-100 dark:hover:bg-yellow-900/30 transition-colors mb-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span className="text-sm text-yellow-700 dark:text-yellow-300">
              {isClearingCache ? '清除中...' : '清除页面缓存'}
            </span>
            <Trash2 className="w-4 h-4 text-yellow-500" />
          </button>

          {/* Clear All History Button */}
          <button
            onClick={handleClearAllHistory}
            disabled={isClearingCache}
            className="w-full flex items-center justify-between px-4 py-3 bg-red-50 dark:bg-red-900/20 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span className="text-sm text-red-700 dark:text-red-300">
              {isClearingCache ? '删除中...' : '删除所有对话记录'}
            </span>
            <Trash2 className="w-4 h-4 text-red-500" />
          </button>
        </div>
      </main>

      <footer className="p-4 border-t border-gray-200 dark:border-gray-800 shrink-0">
        <button
          onClick={handleSave}
          className="w-full flex items-center justify-center gap-2 bg-accent hover:bg-blue-600 text-white py-2.5 rounded-md font-medium transition-colors"
        >
          <Save className="w-4 h-4" />
          保存并返回
        </button>
      </footer>
    </div>
  );
}
