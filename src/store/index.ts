import { create } from 'zustand';
import { persist, StateStorage, createJSONStorage } from 'zustand/middleware';
import { v4 as uuidv4 } from 'uuid';
import * as idb from 'idb-keyval';

// --- Chrome Storage Engine for Zustand ---
const chromeStorage: StateStorage = {
  getItem: async (name: string): Promise<string | null> => {
    const result = await chrome.storage.local.get(name);
    return result[name] || null;
  },
  setItem: async (name: string, value: string): Promise<void> => {
    await chrome.storage.local.set({ [name]: value });
  },
  removeItem: async (name: string): Promise<void> => {
    await chrome.storage.local.remove(name);
  },
};

// --- Types ---

export interface ContextMeta {
  title: string;
  url: string;
  snapshotId: string; // Used to fetch the large content blob from IndexedDB
}

export interface AttachmentMeta {
  id: string; // Used to fetch Base64 blob from IndexedDB
  name: string;
  mimeType: string;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  reasoningContent?: string;
  timestamp: number;
  attachedContext?: ContextMeta; // Only present if context was injected
  attachments?: AttachmentMeta[];
  stopped?: boolean; // True if the generation was stopped by user
}

export interface Session {
  id: string;
  title: string;
  updatedAt: number;
  messages: Message[];
  agentId?: string;
}

export interface Agent {
  id: string;
  name: string;
  icon: string;
  systemPrompt: string;
  isBuiltIn: boolean;
  defaultWelcomeMessage?: string;
  inputPlaceholder?: string;
}

export const builtInAgents: Agent[] = [
  {
    id: 'default',
    name: '网页阅读助手',
    icon: 'BookOpen',
    systemPrompt: '你是一个网页阅读助手。请根据以下网页内容回答用户的问题。',
    isBuiltIn: true,
    defaultWelcomeMessage: '请帮我总结这个网页的主要内容。',
    inputPlaceholder: '输入你的问题... (Enter 发送，Shift+Enter 换行)',
  },
  {
    id: 'translator',
    name: '翻译专家',
    icon: 'Languages',
    systemPrompt: '你是一个专业的翻译专家。请将用户输入的内容翻译为指定语言，保持原文的语气和风格。如果没有指定目标语言，默认翻译为中文。',
    isBuiltIn: true,
    inputPlaceholder: '输入需要翻译的文本...',
  },
  {
    id: 'coder',
    name: '代码助手',
    icon: 'Code',
    systemPrompt: '你是一个资深的编程助手。请用简洁准确的方式回答编程相关问题，提供可运行的代码示例。',
    isBuiltIn: true,
    inputPlaceholder: '描述你的编程问题或需求...',
  },
  {
    id: 'ruankao',
    name: '软考答题助手',
    icon: 'Bot',
    systemPrompt: '你是一个软考答题专家助手。请仔细分析网页中的软考题目，给出正确答案和详细的解析，包括知识点讲解和答题技巧。',
    isBuiltIn: true,
    defaultWelcomeMessage: '请帮我分析当前页面的软考题目，给出答案和详细解析。',
    inputPlaceholder: '粘贴软考题目或输入问题...',
  },
];

export interface PageContext {
  title: string;
  content: string;
  url: string;
}

// --- Heavy Data Storage (IndexedDB) ---

export const getContextSnapshot = async (snapshotId: string): Promise<string | undefined> => {
  return await idb.get<string>(`context_snapshot_${snapshotId}`);
};

export const saveContextSnapshot = async (snapshotId: string, content: string): Promise<void> => {
  await idb.set(`context_snapshot_${snapshotId}`, content);
};

export const deleteContextSnapshot = async (snapshotId: string): Promise<void> => {
  await idb.del(`context_snapshot_${snapshotId}`);
};

export const saveAttachmentBlob = async (attachmentId: string, base64Data: string): Promise<void> => {
  await idb.set(`attachment_${attachmentId}`, base64Data);
};

export const getAttachmentBlob = async (attachmentId: string): Promise<string | undefined> => {
  return await idb.get<string>(`attachment_${attachmentId}`);
};

export const deleteAttachmentBlob = async (attachmentId: string): Promise<void> => {
  await idb.del(`attachment_${attachmentId}`);
};

// --- App State (Zustand) ---

export type ApiProvider = 'gemini' | 'openai' | 'deepseek' | 'groq' | 'ollama' | 'anthropic';

export interface ProviderConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

interface AppState {
  // Settings
  apiProvider: ApiProvider;
  providerConfigs: Record<ApiProvider, ProviderConfig>;
  setSettings: (provider: ApiProvider, config: Partial<ProviderConfig>) => void;
  setActiveProvider: (provider: ApiProvider) => void;

  // UI State
  isSettingsOpen: boolean;
  setIsSettingsOpen: (isOpen: boolean) => void;
  isDrawerOpen: boolean;
  setIsDrawerOpen: (isOpen: boolean) => void;
  isAgentDrawerOpen: boolean;
  setIsAgentDrawerOpen: (isOpen: boolean) => void;
  isAgentManagerOpen: boolean;
  setIsAgentManagerOpen: (isOpen: boolean) => void;

  // Generation State
  isGenerating: boolean;
  abortController: AbortController | null;
  setAbortController: (controller: AbortController | null) => void;

  // Agents
  agents: Agent[];
  currentAgentId: string;
  setCurrentAgent: (agentId: string) => Promise<void>;
  addAgent: (agent: Omit<Agent, 'isBuiltIn'>) => void;
  updateAgent: (agentId: string, updates: Partial<Pick<Agent, 'name' | 'icon' | 'systemPrompt' | 'defaultWelcomeMessage' | 'inputPlaceholder'>>) => void;
  deleteAgent: (agentId: string) => void;
  getCurrentAgent: () => Agent;

  // Active Session State
  currentSessionId: string | null;
  useContext: boolean;
  setUseContext: (use: boolean) => void;
  pageContext: PageContext | null; // Real-time context from the active tab
  setPageContext: (context: PageContext | null) => void;

  // Sessions Management
  sessions: Session[];

  // Actions
  createNewSession: (initialTitle?: string) => string;
  switchSession: (sessionId: string) => void;
  deleteSession: (sessionId: string) => void;
  addMessage: (message: Omit<Message, 'attachedContext' | 'attachments'>, injectCurrentContext?: boolean, attachments?: AttachmentMeta[]) => Promise<void>;
  updateMessageContent: (messageId: string, content: string, reasoningContent?: string) => void;
  updateSessionTitle: (sessionId: string, title: string) => void;
  generateResponse: (userMessage?: string, stagedAttachments?: Array<{ file: File; base64: string }>) => Promise<void>;

  // Cache Size
  cacheSize: { indexedDb: number; chromeStorage: number; total: number } | null;
  setCacheSize: (size: { indexedDb: number; chromeStorage: number; total: number } | null) => void;

  // Selectors/Computed
  getCurrentSession: () => Session | undefined;
}

export const defaultProviderConfigs: Record<ApiProvider, ProviderConfig> = {
  gemini: {
    apiKey: '',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    model: 'gemini-1.5-flash',
  },
  openai: {
    apiKey: '',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
  },
  deepseek: {
    apiKey: '',
    baseUrl: 'https://api.deepseek.com',
    model: 'deepseek-chat',
  },
  groq: {
    apiKey: '',
    baseUrl: 'https://api.groq.com/openai/v1',
    model: 'llama3-8b-8192',
  },
  ollama: {
    apiKey: '',
    baseUrl: 'http://localhost:11434/v1',
    model: 'llama3',
  },
  anthropic: {
    apiKey: '',
    baseUrl: 'https://api.anthropic.com/v1',
    model: 'claude-3-5-sonnet-20241022',
  }
};

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      // Settings
      apiProvider: 'gemini',
      providerConfigs: defaultProviderConfigs,
      setActiveProvider: (provider) => set({ apiProvider: provider }),
      setSettings: (provider, config) => set((state) => ({
        providerConfigs: {
          ...state.providerConfigs,
          [provider]: {
            ...state.providerConfigs[provider],
            ...config
          }
        }
      })),

      // UI State
      isSettingsOpen: false,
      setIsSettingsOpen: (isSettingsOpen) => set({ isSettingsOpen }),
      isDrawerOpen: false,
      setIsDrawerOpen: (isDrawerOpen) => set({ isDrawerOpen }),
      isAgentDrawerOpen: false,
      setIsAgentDrawerOpen: (isAgentDrawerOpen) => set({ isAgentDrawerOpen }),
      isAgentManagerOpen: false,
      setIsAgentManagerOpen: (isAgentManagerOpen) => set({ isAgentManagerOpen }),

      // Generation State
      isGenerating: false,
      abortController: null,
      setAbortController: (controller) => set({ abortController: controller }),

      // Agents
      agents: builtInAgents,
      currentAgentId: 'default',

      setCurrentAgent: async (agentId: string) => {
        const state = get();
        const agent = state.agents.find(a => a.id === agentId);
        if (!agent) return;
        // Switching agent creates a new session
        state.createNewSession(agent.name);
        set({ currentAgentId: agentId, isAgentDrawerOpen: false });

        // Auto-send welcome message if configured and generate AI response
        if (agent.defaultWelcomeMessage) {
          const { addMessage, generateResponse } = get();
          await new Promise(resolve => setTimeout(resolve, 100)); // Small delay to ensure session is ready
          await addMessage({
            id: Date.now().toString(),
            role: 'user',
            content: agent.defaultWelcomeMessage,
            timestamp: Date.now(),
          }, state.useContext); // Inject context if useContext is enabled
          // Generate AI response for the welcome message
          await generateResponse(agent.defaultWelcomeMessage);
        }
      },

      addAgent: (agent) => {
        const newAgent: Agent = { ...agent, isBuiltIn: false };
        set((state) => ({
          agents: [...state.agents, newAgent],
        }));
      },

      updateAgent: (agentId, updates) => {
        set((state) => ({
          agents: state.agents.map(a => {
            if (a.id !== agentId) return a;
            // 所有智能体都可以更新所有字段
            return { ...a, ...updates };
          }),
        }));
      },

      deleteAgent: (agentId) => {
        set((state) => {
          const agent = state.agents.find(a => a.id === agentId);
          if (!agent || agent.isBuiltIn) return state;
          const newAgents = state.agents.filter(a => a.id !== agentId);
          const newCurrentAgentId = state.currentAgentId === agentId ? 'default' : state.currentAgentId;
          return { agents: newAgents, currentAgentId: newCurrentAgentId };
        });
      },

      getCurrentAgent: () => {
        const { agents, currentAgentId } = get();
        return agents.find(a => a.id === currentAgentId) || builtInAgents[0];
      },

      // Context
      useContext: true,
      setUseContext: (useContext) => set({ useContext }),
      pageContext: null,
      setPageContext: (pageContext) => set({ pageContext }),

      // Sessions
      currentSessionId: null,
      sessions: [],

      getCurrentSession: () => {
        const { sessions, currentSessionId } = get();
        return sessions.find(s => s.id === currentSessionId);
      },

      createNewSession: (initialTitle = 'New Chat') => {
        const state = get();
        const newSessionId = uuidv4();
        const newSession: Session = {
          id: newSessionId,
          title: initialTitle,
          updatedAt: Date.now(),
          messages: [],
          agentId: state.currentAgentId,
        };

        set((state) => ({
          sessions: [newSession, ...state.sessions],
          currentSessionId: newSessionId,
          isDrawerOpen: false, // Auto close drawer when creating new
        }));

        return newSessionId;
      },

      switchSession: (sessionId: string) => {
        const state = get();
        const session = state.sessions.find(s => s.id === sessionId);
        if (session?.agentId) {
          set({ currentSessionId: sessionId, isDrawerOpen: false, currentAgentId: session.agentId });
        } else {
          set({ currentSessionId: sessionId, isDrawerOpen: false });
        }
      },

      deleteSession: async (sessionId: string) => {
        const state = get();
        const sessionToDelete = state.sessions.find(s => s.id === sessionId);

        // Cleanup IndexedDB snapshots and attachments for this session
        if (sessionToDelete) {
          for (const msg of sessionToDelete.messages) {
            if (msg.attachedContext?.snapshotId) {
              await deleteContextSnapshot(msg.attachedContext.snapshotId);
            }
            if (msg.attachments) {
              for (const att of msg.attachments) {
                await deleteAttachmentBlob(att.id);
              }
            }
          }
        }

        set((state) => {
          const newSessions = state.sessions.filter(s => s.id !== sessionId);
          let newCurrentId = state.currentSessionId;

          if (state.currentSessionId === sessionId) {
            newCurrentId = newSessions.length > 0 ? newSessions[0].id : null;
          }

          return {
            sessions: newSessions,
            currentSessionId: newCurrentId,
          };
        });
      },

      updateSessionTitle: (sessionId: string, title: string) => {
        set((state) => ({
          sessions: state.sessions.map((s) =>
            s.id === sessionId ? { ...s, title } : s
          ),
        }));
      },

      addMessage: async (baseMessage, injectCurrentContext = false, attachments?: AttachmentMeta[]) => {
        const state = get();
        let activeSessionId = state.currentSessionId;

        // Auto-create session if none exists
        if (!activeSessionId) {
           activeSessionId = get().createNewSession();
        }

        // Ensure stopped is explicitly false for new messages
        let fullMessage: Message = { ...baseMessage, stopped: false };

        // Handle Context Snapshotting
        if (injectCurrentContext && state.useContext && state.pageContext) {
          const snapshotId = uuidv4();
          // 1. Save heavy content to IndexedDB immediately
          await saveContextSnapshot(snapshotId, state.pageContext.content);

          // 2. Attach metadata to message
          fullMessage.attachedContext = {
            title: state.pageContext.title,
            url: state.pageContext.url,
            snapshotId,
          };
        }

        if (attachments && attachments.length > 0) {
          fullMessage.attachments = attachments;
        }

        set((currentState) => {
          const sessionIndex = currentState.sessions.findIndex(s => s.id === activeSessionId);
          if (sessionIndex === -1) return currentState;

          const updatedSessions = [...currentState.sessions];
          const session = { ...updatedSessions[sessionIndex] };

          session.messages = [...session.messages, fullMessage];
          session.updatedAt = Date.now();

          // Auto-update generic title on first user message
          if (session.title === 'New Chat' && fullMessage.role === 'user') {
            session.title = fullMessage.content.slice(0, 20) + (fullMessage.content.length > 20 ? '...' : '');
          }

          updatedSessions[sessionIndex] = session;

          // Sort to bring most recently updated session to top
          updatedSessions.sort((a, b) => b.updatedAt - a.updatedAt);

          return { sessions: updatedSessions };
        });
      },

      updateMessageContent: (messageId: string, content: string, reasoningContent?: string) => {
         set((state) => {
           const activeSessionId = state.currentSessionId;
           if (!activeSessionId) return state;

           const sessionIndex = state.sessions.findIndex(s => s.id === activeSessionId);
           if (sessionIndex === -1) return state;

           const updatedSessions = [...state.sessions];
           const session = { ...updatedSessions[sessionIndex] };

           session.messages = session.messages.map(msg => {
              if (msg.id === messageId) {
                const updatedMsg = { ...msg, content };
                if (reasoningContent !== undefined) {
                  updatedMsg.reasoningContent = reasoningContent;
                }
                // Ensure stopped is not set during normal content updates
                // Only explicit abort operations should set stopped: true
                delete updatedMsg.stopped;
                return updatedMsg;
              }
              return msg;
           });

           updatedSessions[sessionIndex] = session;
           return { sessions: updatedSessions };
         });
      },

      generateResponse: async (userMessage?: string, stagedAttachments?: Array<{ file: File; base64: string }>) => {
        const state = get();
        const { apiProvider, providerConfigs, getCurrentAgent, getCurrentSession, useContext, pageContext, addMessage, updateMessageContent, setAbortController } = state;

        const currentConfig = providerConfigs[apiProvider];
        const { baseUrl, model } = currentConfig;

        // Use secure API key if available, otherwise fallback to stored key
        let apiKey = currentConfig.apiKey;
        try {
          const SecureStorage = (await import('../utils/secureStorage')).default;
          const hasPassword = await SecureStorage.hasMasterPassword();
          if (hasPassword) {
            const unlocked = await SecureStorage.checkUnlocked();
            if (unlocked) {
              const secureKey = await SecureStorage.getApiKey(apiProvider);
              if (secureKey) apiKey = secureKey;
            }
          }
        } catch (e) {
          console.warn('Failed to load secure API key', e);
        }

        const agentPrompt = getCurrentAgent().systemPrompt;
        const currentSession = getCurrentSession();
        const messages = currentSession?.messages || [];

        // Create abort controller for this request
        const abortController = new AbortController();
        setAbortController(abortController);

        const assistantMessageId = (Date.now() + 1).toString();
        await addMessage({
          id: assistantMessageId,
          role: 'assistant',
          content: '',
          timestamp: Date.now(),
        });

        set({ isGenerating: true });

        try {
          if (apiProvider === 'gemini') {
            const { GoogleGenerativeAI } = await import('@google/generative-ai');
            const genAI = new GoogleGenerativeAI(apiKey);

            let requestOptions = {};
            if (baseUrl && baseUrl !== 'https://generativelanguage.googleapis.com/v1beta') {
              let cleanBaseUrl = baseUrl.replace(/\/$/, '');
              if (cleanBaseUrl.endsWith('/v1beta')) {
                cleanBaseUrl = cleanBaseUrl.slice(0, -7);
              }
              requestOptions = { baseUrl: cleanBaseUrl };
            }

            const generativeModel = genAI.getGenerativeModel(
              { model: model },
              // @ts-ignore ignore type mis-match from old versions
              requestOptions
            );

            // Multimodal payload assembly
            const promptParts: any[] = [];
            let textualPrompt = '';

            if (useContext && pageContext) {
              textualPrompt += `${agentPrompt}\n\n<context>\n标题: ${pageContext.title}\n内容: ${pageContext.content}\n</context>\n\n`;
            } else if (agentPrompt) {
              textualPrompt += `${agentPrompt}\n\n`;
            }

            // 添加纯文本的历史对话以节约 Token (历史记录中不包括图片)
            const historyMsg = messages.map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`).join('\n');
            if (historyMsg) {
              textualPrompt += `历史对话:\n${historyMsg}\n\n`;
            }

            // If userMessage is provided, it means we're generating a response to a new user message
            // Otherwise, we're generating a response for the last user message in history
            const lastUserMessageContent = userMessage || messages.filter(m => m.role === 'user').pop()?.content || '';
            if (lastUserMessageContent) {
              textualPrompt += `User: ${lastUserMessageContent}\nAssistant:`;
            }
            promptParts.push({ text: textualPrompt });

            // Add attached images
            if (stagedAttachments) {
              for (const att of stagedAttachments) {
                promptParts.push({
                  inlineData: {
                    data: att.base64,
                    mimeType: att.file.type
                  }
                });
              }
            }

            const result = await generativeModel.generateContentStream(promptParts);

            let fullStreamText = '';
            let isThinkingPhase = true;
            let splitIndex = -1;
            const isThinkingModel = model.toLowerCase().includes('thinking');

            for await (const chunk of result.stream) {
              if (abortController.signal.aborted) {
                // Set stopped flag and keep the content as is
                set((state) => {
                  const sessions = state.sessions.map(s => {
                    if (s.id !== state.currentSessionId) return s;
                    return {
                      ...s,
                      messages: s.messages.map(m => {
                        if (m.id === assistantMessageId) {
                          return { ...m, stopped: true };
                        }
                        return m;
                      })
                    };
                  });
                  return { sessions };
                });
                break;
              }
              try {
                const chunkText = chunk.text();
                if (chunkText) {
                  fullStreamText += chunkText;

                  if (isThinkingModel) {
                    if (isThinkingPhase) {
                      // 寻找第一个中文字符
                      const chineseCharMatch = fullStreamText.match(/[\u4e00-\u9fa5]/);

                      if (chineseCharMatch && chineseCharMatch.index !== undefined) {
                        isThinkingPhase = false;

                        // 找到中文字符前最近的一个换行符，作为思考过程和正文的物理分界线
                        // 如果没有换行符，就直接以中文字符的位置作为分界线
                        const lastNewlineIndex = fullStreamText.lastIndexOf('\n', chineseCharMatch.index);
                        splitIndex = lastNewlineIndex !== -1 ? lastNewlineIndex : chineseCharMatch.index;
                      }
                    }

                    if (!isThinkingPhase && splitIndex !== -1) {
                      // 思考阶段已结束，进行切割
                      const reasoningPart = fullStreamText.substring(0, splitIndex).trim();
                      const finalAnswerPart = fullStreamText.substring(splitIndex).trimStart();
                      updateMessageContent(assistantMessageId, finalAnswerPart, reasoningPart);
                    } else {
                      // 还在思考阶段，全部作为思考内容
                      updateMessageContent(assistantMessageId, '', fullStreamText);
                    }
                  } else {
                    // 非思考模型，直接更新正文
                    updateMessageContent(assistantMessageId, fullStreamText);
                  }
                }
              } catch (e) {
                console.warn('Failed to extract text from chunk', e);
              }
            }
          } else if (apiProvider === 'anthropic') {
            // Anthropic (Claude) Provider
            const cleanBaseUrl = baseUrl.replace(/\/$/, '');
            const url = `${cleanBaseUrl}/messages`;

            let systemPrompt = '';
            if (useContext && pageContext) {
              systemPrompt = `${agentPrompt}\n\n<context>\n标题: ${pageContext.title}\n内容: ${pageContext.content}\n</context>`;
            } else {
              systemPrompt = agentPrompt;
            }

            const anthropicMessages: any[] = [];
            for (const msg of messages) {
              anthropicMessages.push({
                role: msg.role,
                content: msg.content
              });
            }

            // Current Message with Multimodal support
            if (stagedAttachments && stagedAttachments.length > 0) {
              const contentArray: any[] = [];
              for (const att of stagedAttachments) {
                contentArray.push({
                  type: 'image',
                  source: {
                    type: 'base64',
                    media_type: att.file.type,
                    data: att.base64
                  }
                });
              }
              const userContent = userMessage || messages.filter(m => m.role === 'user').pop()?.content || '';
              contentArray.push({ type: 'text', text: userContent });
              anthropicMessages.push({
                role: 'user',
                content: contentArray
              });
            } else if (userMessage) {
              anthropicMessages.push({
                role: 'user',
                content: userMessage
              });
            }

            const response = await fetch(url, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
                'anthropic-dangerous-direct-browser-access': 'true'
              },
              body: JSON.stringify({
                model: model,
                system: systemPrompt || undefined,
                messages: anthropicMessages,
                max_tokens: 4096,
                stream: true
              }),
              signal: abortController.signal
            });

            if (!response.ok) {
              throw new Error(`HTTP error! status: ${response.status}`);
            }

            const reader = response.body?.getReader();
            const decoder = new TextDecoder('utf-8');
            let fullResponse = '';

            if (reader) {
              while (true) {
                // 主动检查中止状态
                if (abortController.signal.aborted) {
                  // Set stopped flag and keep the content as is
                  set((state) => {
                    const sessions = state.sessions.map(s => {
                      if (s.id !== state.currentSessionId) return s;
                      return {
                        ...s,
                        messages: s.messages.map(m => {
                          if (m.id === assistantMessageId) {
                            return { ...m, stopped: true };
                          }
                          return m;
                        })
                      };
                    });
                    return { sessions };
                  });
                  break;
                }

                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk.split('\n');

                for (const line of lines) {
                  if (line.startsWith('data: ')) {
                    try {
                      const data = JSON.parse(line.slice(6));
                      if (data.type === 'content_block_delta' && data.delta && data.delta.text) {
                        fullResponse += data.delta.text;
                        updateMessageContent(assistantMessageId, fullResponse);
                      }
                    } catch (e) {
                      // Ignore parse errors for incomplete chunks
                    }
                  }
                }
              }
            }
          } else {
            // OpenAI Compatible Provider (OpenAI, DeepSeek, Groq, Ollama)
            const cleanBaseUrl = baseUrl.replace(/\/$/, '');
            const url = `${cleanBaseUrl}/chat/completions`;

            const openAiMessages: any[] = [];

            // System Prompt with Context
            if (useContext && pageContext) {
              openAiMessages.push({
                role: 'system',
                content: `${agentPrompt}\n\n<context>\n标题: ${pageContext.title}\n内容: ${pageContext.content}\n</context>`
              });
            } else if (agentPrompt) {
              openAiMessages.push({
                role: 'system',
                content: agentPrompt
              });
            }

            // History
            for (const msg of messages) {
              openAiMessages.push({
                role: msg.role,
                content: msg.content
              });
            }

            // Current Message with Multimodal support
            if (stagedAttachments && stagedAttachments.length > 0) {
              const contentArray: any[] = [{ type: 'text', text: userMessage || '' }];
              for (const att of stagedAttachments) {
                contentArray.push({
                  type: 'image_url',
                  image_url: {
                    url: `data:${att.file.type};base64,${att.base64}`
                  }
                });
              }
              openAiMessages.push({
                role: 'user',
                content: contentArray
              });
            } else if (userMessage) {
              openAiMessages.push({
                role: 'user',
                content: userMessage
              });
            }

            const headers: Record<string, string> = {
              'Content-Type': 'application/json',
            };

            if (apiKey) {
              headers['Authorization'] = `Bearer ${apiKey}`;
            }

            const response = await fetch(url, {
              method: 'POST',
              headers,
              body: JSON.stringify({
                model: model,
                messages: openAiMessages,
                stream: true
              }),
              signal: abortController.signal
            });

            if (!response.ok) {
              throw new Error(`HTTP error! status: ${response.status}`);
            }

            const reader = response.body?.getReader();
            const decoder = new TextDecoder('utf-8');
            let fullResponse = '';
            let fullReasoning = '';

            if (reader) {
              while (true) {
                // 主动检查中止状态
                if (abortController.signal.aborted) {
                  // Set stopped flag and keep the content as is
                  set((state) => {
                    const sessions = state.sessions.map(s => {
                      if (s.id !== state.currentSessionId) return s;
                      return {
                        ...s,
                        messages: s.messages.map(m => {
                          if (m.id === assistantMessageId) {
                            return { ...m, stopped: true };
                          }
                          return m;
                        })
                      };
                    });
                    return { sessions };
                  });
                  break;
                }

                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk.split('\n');

                for (const line of lines) {
                  if (line.startsWith('data: ') && line !== 'data: [DONE]') {
                    try {
                      const data = JSON.parse(line.slice(6));
                      if (data.choices && data.choices[0].delta) {
                        const delta = data.choices[0].delta;
                        let contentUpdated = false;

                        if (delta.reasoning_content) {
                          fullReasoning += delta.reasoning_content;
                          contentUpdated = true;
                        }

                        if (delta.content) {
                          fullResponse += delta.content;
                          contentUpdated = true;
                        }

                        if (contentUpdated) {
                          updateMessageContent(assistantMessageId, fullResponse, fullReasoning);
                        }
                      }
                    } catch (e) {
                      // Ignore parse errors for incomplete chunks
                    }
                  }
                }
              }
            }
          }
        } catch (error) {
          if (error instanceof Error && error.name === 'AbortError') {
            // Set stopped flag - keep the content as is, don't modify it
            set((state) => {
              const sessions = state.sessions.map(s => {
                if (s.id !== state.currentSessionId) return s;
                return {
                  ...s,
                  messages: s.messages.map(m => {
                    if (m.id === assistantMessageId) {
                      return { ...m, stopped: true };
                    }
                    return m;
                  })
                };
              });
              return { sessions };
            });
          } else {
            console.error('Error generating content:', error);
            updateMessageContent(assistantMessageId, `Error: ${error instanceof Error ? error.message : 'Unknown error occurred'}`);
          }
        } finally {
          set({ isGenerating: false, abortController: null });
        }
      },

      // Cache Size
      cacheSize: null,
      setCacheSize: (size) => set({ cacheSize: size }),
    }),
    {
      name: 'luminasider-storage',
      storage: createJSONStorage(() => chromeStorage),
      partialize: (state) => {
        // Migration logic for old state format
        const anyState = state as any;
        let providerConfigs = state.providerConfigs;

        if (anyState.apiKey !== undefined && anyState.baseUrl !== undefined && anyState.model !== undefined) {
          // Migrate old flat config to the active provider
          providerConfigs = {
            ...defaultProviderConfigs,
            [state.apiProvider]: {
              apiKey: anyState.apiKey,
              baseUrl: anyState.baseUrl,
              model: anyState.model,
            }
          };
        }

        return {
          apiProvider: state.apiProvider,
          providerConfigs,
          useContext: state.useContext,
          sessions: state.sessions,
          currentSessionId: state.currentSessionId,
          agents: state.agents,
          currentAgentId: state.currentAgentId,
        } as any;
      },
    }
  )
);
