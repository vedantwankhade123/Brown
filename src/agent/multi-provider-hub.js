/**
 * Ultron Multi-Provider Model Hub & Router
 * Unified client for Local Ollama, Google Gemini, OpenAI, Anthropic Claude, DeepSeek, Groq, and Custom OpenAI-compatible endpoints.
 */
(function () {
  'use strict';

  const PROVIDERS = {
    ollama: {
      id: 'ollama',
      name: 'Local Ollama',
      badge: '100% Offline',
      color: '#10b981',
      requiresKey: false,
      models: [
        { id: 'llama3.2', name: 'Llama 3.2 (3B)', description: 'Fast, lightweight local instruction model', vram: '4 GB' },
        { id: 'phi4', name: 'Phi-4 (14B)', description: 'State-of-the-art compact reasoning by Microsoft', vram: '8 GB' },
        { id: 'qwen2.5:7b', name: 'Qwen 2.5 (7B)', description: 'Exceptional coding and multilingual accuracy', vram: '6 GB' },
        { id: 'deepseek-r1:7b', name: 'DeepSeek-R1 (7B Distill)', description: 'High-speed local chain-of-thought reasoning', vram: '6 GB' },
        { id: 'llama3.3', name: 'Llama 3.3 (70B)', description: 'Heavyweight reasoning and enterprise coding', vram: '24 GB' }
      ]
    },
    gemini: {
      id: 'gemini',
      name: 'Google Gemini',
      badge: 'Cloud Multimodal',
      color: '#4285f4',
      requiresKey: true,
      keyPlaceholder: 'AIzaSy...',
      docsUrl: 'https://aistudio.google.com/app/apikey',
      models: [
        { id: 'gemini-3.6-flash', name: 'Gemini 3.6 Flash', description: 'Latest fast multimodal reasoning (Default)', speed: 'Ultra-Fast' },
        { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', description: 'Advanced coding, long-context, and vision', speed: 'High Precision' },
        { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', description: 'Fast multimodal reasoning', speed: 'Ultra-Fast' },
        { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', description: 'Next-gen low-latency multimodal streaming', speed: 'Ultra-Fast' }
      ]
    },
    openai: {
      id: 'openai',
      name: 'OpenAI',
      badge: 'Cloud GPT',
      color: '#10a37f',
      requiresKey: true,
      keyPlaceholder: 'sk-proj-...',
      docsUrl: 'https://platform.openai.com/api-keys',
      models: [
        { id: 'gpt-5', name: 'GPT-5', description: 'Flagship reasoning + multimodal chat model', speed: 'Fast' },
        { id: 'gpt-5-mini', name: 'GPT-5 Mini', description: 'Affordable, fast intelligent model', speed: 'Very Fast' },
        { id: 'gpt-4o', name: 'GPT-4o', description: 'Multimodal omni model for complex tasks', speed: 'Fast' },
        { id: 'gpt-4o-mini', name: 'GPT-4o Mini', description: 'Affordable, fast intelligent model', speed: 'Very Fast' },
        { id: 'o3-mini', name: 'o3-mini', description: 'High-speed STEM, math, and coding reasoning', speed: 'Reasoning' }
      ]
    },
    anthropic: {
      id: 'anthropic',
      name: 'Anthropic Claude',
      badge: 'Cloud Claude',
      color: '#d97706',
      requiresKey: true,
      keyPlaceholder: 'sk-ant-...',
      docsUrl: 'https://console.anthropic.com/settings/keys',
      models: [
        { id: 'claude-3-7-sonnet-20250219', name: 'Claude 3.7 Sonnet', description: 'Hybrid reasoning and premier coding engine', speed: 'High Precision' },
        { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', description: 'Superior nuance, architecture, and writing', speed: 'Fast' },
        { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku', description: 'Instant response speeds and rapid agent tool calls', speed: 'Ultra-Fast' }
      ]
    },
    deepseek: {
      id: 'deepseek',
      name: 'DeepSeek API',
      badge: 'Reasoning R1',
      color: '#3b82f6',
      requiresKey: true,
      keyPlaceholder: 'sk-...',
      docsUrl: 'https://platform.deepseek.com/api_keys',
      models: [
        { id: 'deepseek-reasoner', name: 'DeepSeek-R1', description: 'Open reasoning frontier model with full CoT', speed: 'Reasoning' },
        { id: 'deepseek-chat', name: 'DeepSeek-V3', description: 'General purpose 671B MoE architecture', speed: 'Fast' }
      ]
    },
    groq: {
      id: 'groq',
      name: 'Groq Cloud',
      badge: '300+ Tokens/sec',
      color: '#f97316',
      requiresKey: true,
      keyPlaceholder: 'gsk_...',
      docsUrl: 'https://console.groq.com/keys',
      models: [
        { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B (Groq)', description: '300+ tok/sec LPU accelerated inference', speed: '300+ tok/s' },
        { id: 'deepseek-r1-distill-llama-70b', name: 'DeepSeek-R1 Distill 70B', description: 'Ultra-fast distilled reasoning on Groq LPU', speed: '280+ tok/s' },
        { id: 'mixtral-8x7b-32768', name: 'Mixtral 8x7B (Groq)', description: '32k context MoE model with sub-second latency', speed: '400+ tok/s' },
        { id: 'gemma2-9b-it', name: 'Gemma 2 9B (Groq)', description: 'Fast Google Gemma on Groq hardware', speed: '350+ tok/s' }
      ]
    },
    custom: {
      id: 'custom',
      name: 'Custom Models (LM Studio / vLLM / OpenRouter)',
      badge: 'CUSTOM',
      color: '#8b5cf6',
      requiresKey: false,
      hasCustomUrl: true,
      defaultUrl: 'http://localhost:1234/v1',
      models: [
        { id: 'custom-model', name: 'Custom Model (Local Server / Proxy)', description: 'Connects to any custom local LLM server or proxy' }
      ]
    }
  };

  function getProviderCatalog() {
    return PROVIDERS;
  }

  function detectProviderForModel(modelName) {
    if (!modelName || typeof modelName !== 'string') return 'ollama';
    const m = modelName.toLowerCase();
    if (m.startsWith('gemini')) return 'gemini';
    if (m.startsWith('gpt-') || m.startsWith('o1') || m.startsWith('o3') || m.startsWith('chatgpt')) return 'openai';
    if (m.startsWith('claude')) return 'anthropic';
    if (m.endsWith('(groq)') || m.startsWith('groq/') || m === 'llama-3.3-70b-versatile' || m.includes('distill-llama') || m === 'mixtral-8x7b-32768' || m === 'gemma2-9b-it') return 'groq';
    if (m.includes('deepseek-reasoner') || m.includes('deepseek-chat') || (m.startsWith('deepseek') && !m.includes(':'))) return 'deepseek';

    if (discoveredModelsCache) {
      for (const [pId, models] of Object.entries(discoveredModelsCache)) {
        if (Array.isArray(models) && models.some(x => x.id === modelName || x.name === modelName)) {
          return pId;
        }
      }
    }

    if (m.startsWith('hf.co/') || m.startsWith('huggingface/') || m.includes('huggingface')) return 'huggingface';
    if (m.startsWith('custom') || m.startsWith('http://') || m.startsWith('https://')) return 'custom';
    return 'ollama';
  }

  function getStoredApiKey(providerId) {
    if (typeof window === 'undefined') return '';
    try {
      const keys = JSON.parse(window.localStorage.getItem('ultron-provider-keys') || '{}');
      if (keys[providerId]) return keys[providerId];
      if (providerId === 'gemini') return window.localStorage.getItem('ultron-gemini-api-key') || '';
    } catch {}
    return '';
  }

  function setStoredApiKey(providerId, key) {
    if (typeof window === 'undefined') return;
    try {
      const keys = JSON.parse(window.localStorage.getItem('ultron-provider-keys') || '{}');
      keys[providerId] = (key || '').trim();
      window.localStorage.setItem('ultron-provider-keys', JSON.stringify(keys));
      if (providerId === 'gemini') window.localStorage.setItem('ultron-gemini-api-key', (key || '').trim());
    } catch {}
  }

  function getCustomEndpointUrl() {
    if (typeof window === 'undefined') return '';
    return (window.localStorage.getItem('ultron-custom-endpoint-url') || '').trim();
  }

  function setCustomEndpointUrl(url) {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem('ultron-custom-endpoint-url', (url || '').trim());
  }

  // Unified Request Dispatcher
  async function queryProvider(options = {}) {
    const {
      model = 'gemini-3.6-flash',
      prompt = '',
      systemPrompt = '',
      messages = [],
      temperature = 0.7,
      maxTokens = 4096,
      visionImages = [],
      signal = null,
      onChunk = null
    } = options;

    const providerId = options.provider || detectProviderForModel(model);
    const apiKey = options.apiKey || getStoredApiKey(providerId);
    const customUrl = options.customUrl || getCustomEndpointUrl();

    switch (providerId) {
      case 'gemini':
        return callGemini({ model, prompt, systemPrompt, messages, temperature, maxTokens, visionImages, apiKey, signal, onChunk });
      case 'openai':
        return callOpenAiCompatible({
          endpoint: 'https://api.openai.com/v1/chat/completions',
          model,
          prompt,
          systemPrompt,
          messages,
          temperature,
          maxTokens,
          apiKey,
          signal,
          onChunk
        });
      case 'anthropic':
        return callAnthropic({ model, prompt, systemPrompt, messages, temperature, maxTokens, visionImages, apiKey, signal, onChunk });
      case 'deepseek':
        return callOpenAiCompatible({
          endpoint: 'https://api.deepseek.com/chat/completions',
          model,
          prompt,
          systemPrompt,
          messages,
          temperature,
          maxTokens,
          apiKey,
          signal,
          onChunk
        });
      case 'groq':
        return callOpenAiCompatible({
          endpoint: 'https://api.groq.com/openai/v1/chat/completions',
          model: model.replace(/\s*\(Groq\)/i, ''),
          prompt,
          systemPrompt,
          messages,
          temperature,
          maxTokens,
          apiKey,
          signal,
          onChunk
        });
      case 'custom':
        const cleanBase = customUrl.replace(/\/+$/, '');
        const targetEndpoint = cleanBase.endsWith('/chat/completions') ? cleanBase : `${cleanBase}/chat/completions`;
        return callOpenAiCompatible({
          endpoint: targetEndpoint,
          model: model === 'custom-model' ? 'default' : model,
          prompt,
          systemPrompt,
          messages,
          temperature,
          maxTokens,
          apiKey: apiKey || 'not-required',
          signal,
          onChunk
        });
      case 'ollama':
      default:
        return callOllama({ model, prompt, systemPrompt, messages, temperature, visionImages, signal, onChunk });
    }
  }

  // Google Gemini API Adapter
  async function callGemini({ model, prompt, systemPrompt, messages, temperature, maxTokens, visionImages, apiKey, signal, onChunk }) {
    if (!apiKey) throw new Error('Google Gemini API Key is required. Please set it in Settings > Models.');
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey.trim())}`;
    
    const contents = [];
    if (Array.isArray(messages) && messages.length > 0) {
      messages.forEach(m => {
        if (m.content || m.text) {
          contents.push({
            role: m.role === 'assistant' || m.role === 'model' || m.isAi ? 'model' : 'user',
            parts: [{ text: m.content || m.text }]
          });
        }
      });
    }

    const currentParts = [{ text: prompt }];
    if (Array.isArray(visionImages) && visionImages.length > 0) {
      visionImages.filter(p => p && p.data).forEach(p => {
        currentParts.push({
          inline_data: {
            mime_type: p.mimeType || 'image/png',
            data: p.data
          }
        });
      });
    }
    contents.push({ role: 'user', parts: currentParts });

    const payload = {
      contents,
      systemInstruction: systemPrompt ? { parts: [{ text: systemPrompt }] } : undefined,
      generationConfig: {
        temperature: typeof temperature === 'number' ? temperature : 0.7,
        maxOutputTokens: maxTokens || 8192
      }
    };

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const msg = (errorData.error && errorData.error.message) ? errorData.error.message : `Gemini HTTP ${response.status}`;
      throw new Error(msg);
    }

    const data = await response.json();
    const candidate = data.candidates && data.candidates[0];
    const output = candidate?.content?.parts
      ?.map(part => part.text || '')
      .filter(Boolean)
      .join('\n')
      .trim();

    if (!output) {
      const blockReason = data.promptFeedback?.blockReason || candidate?.finishReason;
      throw new Error(blockReason ? `Gemini returned no text (${blockReason}).` : 'Gemini returned an empty response.');
    }
    if (typeof onChunk === 'function') onChunk(output);
    return output;
  }

  // OpenAI / DeepSeek / Groq / Custom OpenAI-Compatible Adapter
  async function callOpenAiCompatible({ endpoint, model, prompt, systemPrompt, messages, temperature, maxTokens, apiKey, signal, onChunk }) {
    if (!apiKey) throw new Error('API Key is required for this provider. Configure it in Settings > Models.');

    const chatMessages = [];
    if (systemPrompt) {
      chatMessages.push({ role: 'system', content: systemPrompt });
    }
    if (Array.isArray(messages) && messages.length > 0) {
      messages.forEach(m => {
        chatMessages.push({
          role: m.role || (m.isAi ? 'assistant' : 'user'),
          content: m.content || m.text || ''
        });
      });
    }
    if (!chatMessages.some(m => m.role === 'user' && m.content === prompt)) {
      chatMessages.push({ role: 'user', content: prompt });
    }

    const payload = {
      model,
      messages: chatMessages,
      temperature: typeof temperature === 'number' ? temperature : 0.7,
      max_tokens: maxTokens || 4096,
      stream: Boolean(onChunk)
    };

    const headers = {
      'Content-Type': 'application/json'
    };
    if (apiKey && apiKey !== 'not-required') {
      headers['Authorization'] = `Bearer ${apiKey.trim()}`;
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const msg = errorData.error?.message || `API Error HTTP ${response.status}`;
      throw new Error(msg);
    }

    // Non-streaming response
    if (!onChunk || !response.body) {
      const data = await response.json();
      const output = data.choices?.[0]?.message?.content || data.choices?.[0]?.text || '';
      return output.trim();
    }

    // Streaming response
    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let fullText = '';
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed === 'data: [DONE]') continue;
        if (trimmed.startsWith('data: ')) {
          try {
            const parsed = JSON.parse(trimmed.slice(6));
            const delta = parsed.choices?.[0]?.delta?.content || '';
            if (delta) {
              fullText += delta;
              onChunk(delta, fullText);
            }
          } catch {}
        }
      }
    }
    return fullText.trim();
  }

  // Anthropic Claude Messages Adapter
  async function callAnthropic({ model, prompt, systemPrompt, messages, temperature, maxTokens, visionImages, apiKey, signal, onChunk }) {
    if (!apiKey) throw new Error('Anthropic API Key is required. Please configure it in Settings > Models.');
    const endpoint = 'https://api.anthropic.com/v1/messages';

    const formattedMessages = [];
    if (Array.isArray(messages) && messages.length > 0) {
      messages.forEach(m => {
        if (m.role === 'user' || m.role === 'assistant') {
          formattedMessages.push({
            role: m.role,
            content: m.content || m.text || ''
          });
        }
      });
    }

    const userContent = [{ type: 'text', text: prompt }];
    if (Array.isArray(visionImages) && visionImages.length > 0) {
      visionImages.filter(p => p && p.data).forEach(p => {
        userContent.push({
          type: 'image',
          source: {
            type: 'base64',
            media_type: p.mimeType || 'image/png',
            data: p.data
          }
        });
      });
    }
    formattedMessages.push({ role: 'user', content: userContent });

    const payload = {
      model,
      system: systemPrompt || undefined,
      messages: formattedMessages,
      max_tokens: maxTokens || 4096,
      temperature: typeof temperature === 'number' ? temperature : 0.7,
      stream: Boolean(onChunk)
    };

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey.trim(),
        'anthropic-version': '2023-06-01',
        'dangerously-allow-browser': 'true'
      },
      body: JSON.stringify(payload),
      signal
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error?.message || `Anthropic HTTP ${response.status}`);
    }

    if (!onChunk || !response.body) {
      const data = await response.json();
      const output = data.content?.map(c => c.text || '').join('\n') || '';
      return output.trim();
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let fullText = '';
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('data: ')) {
          try {
            const parsed = JSON.parse(trimmed.slice(6));
            if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
              fullText += parsed.delta.text;
              onChunk(parsed.delta.text, fullText);
            }
          } catch {}
        }
      }
    }
    return fullText.trim();
  }

  // Local Ollama Adapter
  async function callOllama({ model, prompt, systemPrompt, messages, temperature, visionImages, signal, onChunk }) {
    const endpoint = 'http://127.0.0.1:11434/api/generate';
    
    // GPU ACCELERATION: Enable GPU layers for all models
    const payload = {
      model,
      prompt,
      system: systemPrompt || undefined,
      stream: false,
      options: {
        temperature: typeof temperature === 'number' ? temperature : 0.7,
        // GPU prioritization options
        num_gpu: 999,  // Use all available GPU layers
        num_thread: undefined,  // Let Ollama auto-detect optimal CPU threads
        use_mmap: true,  // Memory-mapped file access for faster loading
        use_mlock: false,  // Don't lock model in RAM (let OS manage)
        // Performance tuning
        num_ctx: 4096,  // Context window
        num_batch: 512,  // Batch size for processing
        num_predict: -1,  // No limit on prediction tokens
        // GPU-specific optimizations
        low_vram: false,  // Don't enable low VRAM mode by default
        f16_kv: true,  // Use FP16 for key/value cache (faster on GPU)
        logits_all: false,  // Don't return logits for all tokens
        vocab_only: false,
        rope_frequency_base: 10000,
        rope_frequency_scale: 1.0
      }
    };
    
    if (Array.isArray(visionImages) && visionImages.length > 0) {
      payload.images = visionImages.filter(p => p && p.data).map(p => p.data);
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal
    });

    if (!response.ok) {
      throw new Error(`Ollama Error: Could not connect to local model ${model} at localhost:11434.`);
    }

    const data = await response.json();
    const output = data.response || '';
    if (typeof onChunk === 'function') onChunk(output);
    return output.trim();
  }

  // In-memory / persisted cache of dynamically discovered models
  let discoveredModelsCache = {};
  try {
    if (typeof window !== 'undefined') {
      discoveredModelsCache = JSON.parse(window.localStorage.getItem('ultron-discovered-provider-models') || '{}');
    }
  } catch {}

  function saveDiscoveredModelsCache() {
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem('ultron-discovered-provider-models', JSON.stringify(discoveredModelsCache));
      } catch {}
    }
  }

  function formatModelDisplayName(id) {
    if (!id) return '';
    return id.replace(/-20\d{6}$/, '')
             .replace(/:latest$/, '')
             .split(/[-_]/)
             .map(w => w.charAt(0).toUpperCase() + w.slice(1))
             .join(' ');
  }

  /** True when a model id is usable for plain text chat (excludes TTS/STT/audio/realtime/image/embedding/guard models). */
  function isChatCapableModel(modelId) {
    const id = String(modelId || '').toLowerCase();
    if (!id) return false;
    return !/(tts|whisper|audio|realtime|transcri|embedding|moderation|dall-e|image|speech|voice|guard)/.test(id);
  }

  async function fetchProviderModels(providerId, apiKey, customUrl) {
    const key = (apiKey || getStoredApiKey(providerId) || '').trim();
    const endpoint = (customUrl || getCustomEndpointUrl() || 'http://localhost:1234/v1').trim();

    if (providerId === 'openai') {
      if (!key) throw new Error('OpenAI API key is required');
      const res = await fetch('https://api.openai.com/v1/models', {
        headers: { Authorization: `Bearer ${key}` }
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error?.message || `OpenAI returned HTTP ${res.status}`);
      }
      const rawList = Array.isArray(data.data) ? data.data : [];
      const allowedPrefixes = ['gpt-5', 'gpt-4o', 'gpt-4.5', 'o1', 'o3', 'o4', 'gpt-4-turbo', 'gpt-4', 'gpt-3.5-turbo', 'chatgpt-4o'];
      const excluded = ['embedding', 'whisper', 'tts', 'dall-e', 'realtime', 'audio', 'moderation', 'transcription', 'similarity', 'search', 'instruct', 'babbage', 'davinci'];

      const filtered = rawList.filter(m => {
        const id = (m.id || '').toLowerCase();
        if (excluded.some(x => id.includes(x))) return false;
        return allowedPrefixes.some(p => id.startsWith(p));
      });

      filtered.sort((a, b) => {
        const order = ['gpt-5', 'gpt-5-mini', 'gpt-4o', 'gpt-4o-mini', 'o4', 'o3-mini', 'o1', 'gpt-4.5-preview', 'gpt-4-turbo', 'gpt-4'];
        const idxA = order.findIndex(p => a.id.startsWith(p));
        const idxB = order.findIndex(p => b.id.startsWith(p));
        if (idxA !== -1 && idxB !== -1) return idxA - idxB;
        if (idxA !== -1) return -1;
        if (idxB !== -1) return 1;
        return a.id.localeCompare(b.id);
      });

      const models = filtered.map(m => ({
        id: m.id,
        name: m.id,
        displayName: formatModelDisplayName(m.id),
        provider: 'openai',
        tag: 'GPT',
        speed: m.id.includes('mini') ? 'Very Fast' : (m.id.startsWith('o') ? 'Reasoning' : 'Fast')
      }));

      if (models.length > 0) {
        discoveredModelsCache.openai = models;
        saveDiscoveredModelsCache();
        return models;
      }
      return (PROVIDERS.openai.models || []).map(m => ({
        id: m.id, name: m.id, displayName: m.name, provider: 'openai', tag: 'GPT', speed: m.speed
      }));
    }

    if (providerId === 'anthropic') {
      if (!key) throw new Error('Anthropic API key is required');
      let rawList = [];
      try {
        const res = await fetch('https://api.anthropic.com/v1/models', {
          headers: {
            'x-api-key': key,
            'anthropic-version': '2023-06-01',
            'dangerously-allow-browser': 'true'
          }
        });
        if (res.ok) {
          const data = await res.json();
          rawList = Array.isArray(data.data) ? data.data : [];
        }
      } catch {}

      if (rawList.length > 0) {
        const filtered = rawList.filter(m => (m.id || '').toLowerCase().startsWith('claude-'));
        const models = filtered.map(m => ({
          id: m.id,
          name: m.id,
          displayName: m.display_name || formatModelDisplayName(m.id),
          provider: 'anthropic',
          tag: 'CLAUDE',
          speed: m.id.includes('haiku') ? 'Ultra-Fast' : 'High Precision'
        }));
        if (models.length > 0) {
          discoveredModelsCache.anthropic = models;
          saveDiscoveredModelsCache();
          return models;
        }
      }

      // Verification fallback ping
      const testRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
          'dangerously-allow-browser': 'true'
        },
        body: JSON.stringify({
          model: 'claude-3-5-haiku-20241022',
          messages: [{ role: 'user', content: 'hi' }],
          max_tokens: 1
        })
      });
      const testData = await testRes.json().catch(() => ({}));
      if (!testRes.ok) {
        throw new Error(testData.error?.message || `Anthropic returned HTTP ${testRes.status}`);
      }

      const verified = (PROVIDERS.anthropic.models || []).map(m => ({
        id: m.id,
        name: m.id,
        displayName: m.name,
        provider: 'anthropic',
        tag: 'CLAUDE',
        speed: m.speed
      }));
      discoveredModelsCache.anthropic = verified;
      saveDiscoveredModelsCache();
      return verified;
    }

    if (providerId === 'deepseek') {
      if (!key) throw new Error('DeepSeek API key is required');
      const res = await fetch('https://api.deepseek.com/models', {
        headers: { Authorization: `Bearer ${key}` }
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error?.message || `DeepSeek returned HTTP ${res.status}`);
      }
      const rawList = Array.isArray(data.data) ? data.data : [];
      const models = rawList.map(m => ({
        id: m.id,
        name: m.id,
        displayName: m.id === 'deepseek-reasoner' ? 'DeepSeek-R1 (Reasoning)' : 'DeepSeek-V3',
        provider: 'deepseek',
        tag: m.id === 'deepseek-reasoner' ? 'REASONING' : 'FAST',
        speed: m.id === 'deepseek-reasoner' ? 'Reasoning' : 'Fast'
      }));
      if (models.length > 0) {
        discoveredModelsCache.deepseek = models;
        saveDiscoveredModelsCache();
        return models;
      }
      return (PROVIDERS.deepseek.models || []).map(m => ({
        id: m.id, name: m.id, displayName: m.name, provider: 'deepseek', tag: 'DEEPSEEK', speed: m.speed
      }));
    }

    if (providerId === 'groq') {
      if (!key) throw new Error('Groq API key is required');
      const res = await fetch('https://api.groq.com/openai/v1/models', {
        headers: { Authorization: `Bearer ${key}` }
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error?.message || `Groq returned HTTP ${res.status}`);
      }
      const rawList = Array.isArray(data.data) ? data.data : [];
      const excluded = ['whisper', 'guard', 'distil-whisper', 'audio', 'tts'];
      const filtered = rawList.filter(m => {
        const id = (m.id || '').toLowerCase();
        return !excluded.some(x => id.includes(x)) && m.active !== false;
      });

      const models = filtered.map(m => ({
        id: m.id,
        name: m.id,
        displayName: formatModelDisplayName(m.id) + ' (Groq)',
        provider: 'groq',
        tag: 'FAST',
        speed: '300+ tok/s'
      }));
      if (models.length > 0) {
        discoveredModelsCache.groq = models;
        saveDiscoveredModelsCache();
        return models;
      }
      return (PROVIDERS.groq.models || []).map(m => ({
        id: m.id, name: m.id, displayName: m.name, provider: 'groq', tag: 'GROQ', speed: m.speed
      }));
    }

    if (providerId === 'custom') {
      const customUrl = (endpoint || getCustomEndpointUrl()).trim();
      if (!customUrl && !key) return [];
      const cleanBase = (customUrl || 'http://localhost:1234/v1').replace(/\/+$/, '');
      const targetUrl = cleanBase.endsWith('/models') ? cleanBase : `${cleanBase}/models`;
      try {
        const res = await fetch(targetUrl, {
          headers: key ? { Authorization: `Bearer ${key}` } : {}
        });
        if (res.ok) {
          const data = await res.json().catch(() => ({}));
          const list = Array.isArray(data.data) ? data.data : (Array.isArray(data.models) ? data.models : (Array.isArray(data) ? data : []));
          if (list.length > 0) {
            const models = list.map(m => {
              const id = typeof m === 'string' ? m : (m.id || m.name || 'custom-model');
              return {
                id: id,
                name: id,
                displayName: id,
                provider: 'custom',
                tag: 'CUSTOM',
                speed: 'Custom'
              };
            });
            discoveredModelsCache.custom = models;
            saveDiscoveredModelsCache();
            return models;
          }
        }
      } catch {}

      if (customUrl || key) {
        const fallback = [{
          id: 'custom-model',
          name: 'custom-model',
          displayName: 'Custom Server Model',
          provider: 'custom',
          tag: 'CUSTOM',
          speed: 'Custom'
        }];
        discoveredModelsCache.custom = fallback;
        saveDiscoveredModelsCache();
        return fallback;
      }
      return [];
    }

    return [];
  }

  // Test provider connectivity and discover supported models
  async function testProviderConnection(providerId, apiKey, customUrl) {
    try {
      if (providerId === 'ollama') {
        const res = await fetch('http://127.0.0.1:11434/api/tags');
        if (!res.ok) return { success: false, error: 'Ollama is not running on localhost:11434' };
        const data = await res.json();
        return { success: true, models: (data.models || []).map(m => m.name) };
      }
      if (providerId === 'gemini') {
        if (!apiKey) return { success: false, error: 'API key is required' };
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey.trim())}`);
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          return { success: false, error: err.error?.message || `HTTP ${res.status}` };
        }
        const data = await res.json().catch(() => ({}));
        return { success: true, message: 'Google Gemini connected successfully.', models: data.models || [] };
      }

      const models = await fetchProviderModels(providerId, apiKey, customUrl);
      return {
        success: true,
        message: `${PROVIDERS[providerId]?.name || providerId} connected successfully.`,
        models
      };
    } catch (err) {
      return { success: false, error: err.message || 'Connection failed.' };
    }
  }

  function getAvailableModels(includeConfiguredOnly = false) {
    const results = [];
    const providerIds = ['openai', 'anthropic', 'deepseek', 'groq', 'custom'];

    providerIds.forEach(providerId => {
      const provider = PROVIDERS[providerId];
      const hasKey = Boolean(getStoredApiKey(providerId));
      const hasCustom = providerId === 'custom' && Boolean(getCustomEndpointUrl());
      const isConfigured = hasKey || hasCustom;

      if (!includeConfiguredOnly || isConfigured) {
        if (providerId === 'custom' && !isConfigured) return;
        const cached = discoveredModelsCache[providerId];
        const models = (Array.isArray(cached) && cached.length > 0) ? cached : (provider.models || []);

        models.forEach(m => {
          if (!isChatCapableModel(m.id)) return; // chat dropdown only shows conversation-capable models
          results.push({
            id: m.id,
            name: m.id,
            displayName: m.displayName || m.name,
            provider: providerId,
            tag: m.tag || (providerId === 'custom' ? 'CUSTOM' : provider.badge || providerId.toUpperCase()),
            speed: m.speed,
            isConfigured
          });
        });
      }
    });
    return results;
  }

  const api = {
    PROVIDERS,
    getProviderCatalog,
    detectProviderForModel,
    isChatCapableModel,
    getStoredApiKey,
    setStoredApiKey,
    getCustomEndpointUrl,
    setCustomEndpointUrl,
    getAvailableModels,
    fetchProviderModels,
    queryProvider,
    testProviderConnection
  };

  if (typeof window !== 'undefined') {
    window.UltronMultiProviderHub = api;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { ...api, UltronMultiProviderHub: api };
  }
})();
