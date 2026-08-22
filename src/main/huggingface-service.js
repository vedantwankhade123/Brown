/**
 * Ultron Hugging Face Model Provider & GGUF Hub Service
 * Queries Hugging Face Hub REST API for GGUF model repositories,
 * parses available quantizations (Q4_K_M, Q5_K_M, etc.), and formats metadata.
 */

const https = require('https');
const http = require('http');

/**
 * Perform a GET request returning JSON or raw data
 * @param {string} url 
 * @param {number} timeoutMs 
 * @returns {Promise<any>}
 */
function fetchJson(url, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const req = client.get(
      url,
      {
        headers: {
          'User-Agent': 'Ultron-Desktop-AI/1.0',
          Accept: 'application/json',
        },
        timeout: timeoutMs,
      },
      (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return fetchJson(res.headers.location, timeoutMs).then(resolve).catch(reject);
        }

        if (res.statusCode < 200 || res.statusCode >= 300) {
          res.resume();
          return reject(new Error(`HTTP ${res.statusCode} from ${url}`));
        }

        let rawData = '';
        res.on('data', (chunk) => {
          rawData += chunk;
        });

        res.on('end', () => {
          try {
            const parsed = JSON.parse(rawData);
            resolve(parsed);
          } catch (e) {
            reject(new Error(`Failed to parse JSON response: ${e.message}`));
          }
        });
      }
    );

    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Request timed out after ${timeoutMs}ms`));
    });

    req.on('error', (err) => {
      reject(err);
    });
  });
}

/**
 * Format raw byte size into human readable string
 * @param {number} bytes 
 * @returns {string}
 */
function formatBytes(bytes) {
  if (!bytes || isNaN(bytes)) return 'Est. ~4 GB';
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
  }
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

/**
 * Infer parameter size from model name (e.g. 7B, 1.5B, 8x7B)
 * @param {string} name 
 * @returns {string}
 */
function inferParamSize(name) {
  const match = name.match(/([0-9.]+[xX]?[0-9.]*\s*[bBmM])/);
  if (match) return match[1].toUpperCase();
  return 'GGUF';
}

/**
 * Search Hugging Face Hub for GGUF models
 * @param {string} query 
 * @param {number} limit 
 * @returns {Promise<Array<object>>}
 */
async function searchHuggingFaceGgufModels(query = '', limit = 20) {
  try {
    const cleanQuery = encodeURIComponent(query.trim());
    let url = `https://huggingface.co/api/models?filter=gguf&sort=downloads&direction=-1&limit=${limit}`;
    if (cleanQuery) {
      url += `&search=${cleanQuery}`;
    }

    const rawModels = await fetchJson(url, 7000);
    if (!Array.isArray(rawModels)) return [];

    return rawModels.map((m) => {
      const repoId = m.id || m.modelId || '';
      const [author, modelName] = repoId.includes('/') ? repoId.split('/') : ['huggingface', repoId];
      const paramSize = inferParamSize(modelName || repoId);
      const isReasoning = /r1|reason|thinking|deepseek/i.test(repoId);
      const isCode = /coder|code|starcoder|dev/i.test(repoId);
      const isVision = /vision|llava|vl/i.test(repoId);

      const tags = ['huggingface', 'gguf', 'offline'];
      if (isReasoning) tags.push('thinking');
      if (isCode) tags.push('code');
      if (isVision) tags.push('vision');

      return {
        id: repoId,
        name: `hf.co/${repoId}:Q4_K_M`,
        displayName: modelName || repoId,
        author: author,
        provider: 'huggingface',
        providerName: 'Hugging Face Hub',
        repoId: repoId,
        size: paramSize,
        downloadSize: 'GGUF',
        downloads: m.downloads || 0,
        likes: m.likes || 0,
        desc: m.description || `High-performance ${paramSize} GGUF quantized model hosted on Hugging Face by ${author}`,
        tags: tags,
        defaultQuantization: 'Q4_K_M',
        lastModified: m.lastModified || null,
      };
    });
  } catch (err) {
    console.warn('[huggingface-service] search failed, falling back to curated list:', err.message);
    return [];
  }
}

/**
 * Get available GGUF quantization files for a specific Hugging Face repository
 * @param {string} repoId e.g. "bartowski/Llama-3.2-1B-Instruct-GGUF"
 * @returns {Promise<Array<object>>}
 */
async function getModelQuantizations(repoId) {
  try {
    const cleanRepo = repoId.replace(/^hf\.co\//i, '').split(':')[0];
    const url = `https://huggingface.co/api/models/${cleanRepo}/tree/main`;
    const files = await fetchJson(url, 6000);
    if (!Array.isArray(files)) return [];

    const ggufFiles = files
      .filter((f) => f.path && f.path.toLowerCase().endsWith('.gguf'))
      .map((f) => {
        // Extract quantization tag e.g. Q4_K_M, Q5_K_M, Q8_0
        const match = f.path.match(/([qQ][0-9]+_[a-zA-Z0-9_]+|[fF][pP][0-9]+)/);
        const quantTag = match ? match[1].toUpperCase() : 'Q4_K_M';
        return {
          filename: f.path,
          quantization: quantTag,
          pullTag: `hf.co/${cleanRepo}:${quantTag}`,
          sizeBytes: f.size || 0,
          formattedSize: formatBytes(f.size),
        };
      });

    return ggufFiles;
  } catch (err) {
    console.warn(`[huggingface-service] failed fetching quantizations for ${repoId}:`, err.message);
    return [
      { quantization: 'Q4_K_M', pullTag: `hf.co/${repoId}:Q4_K_M`, formattedSize: 'Est. ~4 GB' },
      { quantization: 'Q5_K_M', pullTag: `hf.co/${repoId}:Q5_K_M`, formattedSize: 'Est. ~5 GB' },
      { quantization: 'Q8_0', pullTag: `hf.co/${repoId}:Q8_0`, formattedSize: 'Est. ~8 GB' },
    ];
  }
}

module.exports = {
  searchHuggingFaceGgufModels,
  getModelQuantizations,
};
