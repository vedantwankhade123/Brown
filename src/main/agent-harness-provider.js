/**
 * Agent Harness Provider Factory
 * Configures Vercel AI SDK Core models with 100% offline-first defaults.
 * Supports: Local Ollama, Local LM Studio / vLLM, and optional Cloud Providers.
 */
const DEFAULT_OFFLINE_OLLAMA_URL = 'http://127.0.0.1:11434/v1';
const DEFAULT_OFFLINE_MODEL = 'llama3.2';

/**
 * Resolves an AI SDK language model instance according to user configuration
 * @param {Object} config
 * @param {string} [config.provider] - 'ollama' | 'lmstudio' | 'custom' | 'gemini' | 'groq' | 'openai'
 * @param {string} [config.modelId]
 * @param {string} [config.baseURL]
 * @param {string} [config.apiKey]
 * @returns {{ model: any, provider: string, modelId: string, isOffline: boolean }}
 */
async function resolveAgentLanguageModel(config = {}) {
  const { createOpenAI } = await import('@ai-sdk/openai');
  const provider = (config.provider || 'ollama').toLowerCase();
  let modelId = config.modelId;
  let baseURL = config.baseURL;
  let apiKey = config.apiKey || 'offline-token';
  let isOffline = true;

  switch (provider) {
    case 'ollama': {
      baseURL = baseURL || process.env.OLLAMA_BASE_URL || DEFAULT_OFFLINE_OLLAMA_URL;
      modelId = modelId || DEFAULT_OFFLINE_MODEL;
      isOffline = true;
      break;
    }

    case 'lmstudio':
    case 'localai':
    case 'vllm': {
      baseURL = baseURL || 'http://127.0.0.1:1234/v1';
      modelId = modelId || 'local-model';
      isOffline = true;
      break;
    }

    case 'gemini': {
      // Google Gemini via OpenAI-compatible endpoint
      baseURL = 'https://generativelanguage.googleapis.com/v1beta/openai/';
      modelId = modelId || 'gemini-2.5-flash';
      apiKey = config.apiKey;
      isOffline = false;
      break;
    }

    case 'groq': {
      baseURL = 'https://api.groq.com/openai/v1';
      modelId = modelId || 'llama-3.3-70b-versatile';
      apiKey = config.apiKey;
      isOffline = false;
      break;
    }

    case 'deepseek': {
      baseURL = 'https://api.deepseek.com/v1';
      modelId = modelId || 'deepseek-chat';
      apiKey = config.apiKey;
      isOffline = false;
      break;
    }

    case 'openai': {
      baseURL = 'https://api.openai.com/v1';
      modelId = modelId || 'gpt-4o-mini';
      apiKey = config.apiKey;
      isOffline = false;
      break;
    }

    case 'custom':
    default: {
      baseURL = baseURL || DEFAULT_OFFLINE_OLLAMA_URL;
      modelId = modelId || DEFAULT_OFFLINE_MODEL;
      isOffline = !baseURL.startsWith('https://');
      break;
    }
  }

  const client = createOpenAI({
    baseURL,
    apiKey: apiKey || 'offline-token'
  });

  const model = client.chat(modelId);

  return {
    model,
    provider,
    modelId,
    baseURL,
    isOffline
  };
}

module.exports = {
  resolveAgentLanguageModel,
  DEFAULT_OFFLINE_OLLAMA_URL,
  DEFAULT_OFFLINE_MODEL
};
