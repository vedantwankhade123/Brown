/**
 * Ultron Local Vector RAG & Semantic Knowledge Base
 * 100% Offline document indexing, chunking, and semantic vector cosine search.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { app } = require('electron');

const SUPPORTED_EXTENSIONS = new Set([
  '.txt', '.md', '.markdown', '.json', '.csv', '.js', '.ts', '.jsx', '.tsx',
  '.py', '.html', '.css', '.xml', '.yaml', '.yml', '.sql', '.sh', '.bat',
  '.ps1', '.ini', '.cfg', '.env', '.log', '.pdf'
]);

const CHUNK_SIZE = 800;
const CHUNK_OVERLAP = 150;

let os;
try { os = require('os'); } catch {}

function getIndexPath() {
  try {
    const electron = require('electron');
    if (electron && electron.app && typeof electron.app.getPath === 'function') {
      return path.join(electron.app.getPath('userData'), 'rag_knowledge_index.json');
    }
  } catch {}
  const fallbackDir = process.env.APPDATA || (os ? os.tmpdir() : process.cwd());
  return path.join(fallbackDir, 'rag_knowledge_index.json');
}

function loadIndex() {
  try {
    const file = getIndexPath();
    if (fs.existsSync(file)) {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (data && Array.isArray(data.sources)) return data;
    }
  } catch (err) {
    console.warn('[rag-engine] error loading index:', err.message);
  }
  return {
    version: '1.0',
    updatedAt: new Date().toISOString(),
    sources: [],
    chunks: []
  };
}

function saveIndex(indexData) {
  try {
    const file = getIndexPath();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    indexData.updatedAt = new Date().toISOString();
    fs.writeFileSync(file, JSON.stringify(indexData, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error('[rag-engine] error saving index:', err.message);
    return false;
  }
}

// Tokenize text into words and sub-word n-grams for semantic matching
function tokenize(text) {
  if (!text || typeof text !== 'string') return [];
  const words = text
    .toLowerCase()
    .replace(/[^\w\s-]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 1);

  const tokens = [];
  const stopWords = new Set([
    'the', 'is', 'at', 'which', 'on', 'a', 'an', 'and', 'or', 'in', 'with', 'to', 'for', 'of', 'by', 'from', 'this', 'that', 'it', 'be', 'are', 'was', 'were', 'as', 'if'
  ]);

  for (const w of words) {
    if (!stopWords.has(w)) {
      tokens.push(w);
      // Add 3-gram and 4-gram character tokens for fuzzy semantic matching
      if (w.length >= 4) {
        for (let i = 0; i <= w.length - 3; i++) {
          tokens.push(w.slice(i, i + 3));
        }
      }
    }
  }
  return tokens;
}

// Create TF (Term Frequency) Vector
function createTermVector(tokens) {
  const vec = {};
  for (const t of tokens) {
    vec[t] = (vec[t] || 0) + 1;
  }
  return vec;
}

// Compute Cosine Similarity between two term vectors
function cosineSimilarity(vecA, vecB) {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (const key in vecA) {
    const valA = vecA[key];
    normA += valA * valA;
    if (vecB[key]) {
      dotProduct += valA * vecB[key];
    }
  }

  for (const key in vecB) {
    const valB = vecB[key];
    normB += valB * valB;
  }

  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Split text into overlapping chunks
function chunkText(text, filePath) {
  if (!text) return [];
  const chunks = [];
  const fileName = path.basename(filePath);
  const clean = text.replace(/\r\n/g, '\n').trim();

  if (clean.length <= CHUNK_SIZE) {
    const tokens = tokenize(clean);
    return [{
      id: crypto.createHash('md5').update(`${filePath}:0`).digest('hex'),
      filePath,
      fileName,
      chunkIndex: 0,
      text: clean,
      charCount: clean.length,
      vector: createTermVector(tokens)
    }];
  }

  let start = 0;
  let chunkIdx = 0;

  while (start < clean.length) {
    let end = start + CHUNK_SIZE;
    if (end < clean.length) {
      // Try to break on a newline or period
      const lastNewline = clean.lastIndexOf('\n', end);
      const lastPeriod = clean.lastIndexOf('. ', end);
      if (lastNewline > start + CHUNK_SIZE / 2) {
        end = lastNewline + 1;
      } else if (lastPeriod > start + CHUNK_SIZE / 2) {
        end = lastPeriod + 2;
      }
    } else {
      end = clean.length;
    }

    const chunkContent = clean.slice(start, end).trim();
    if (chunkContent.length > 20) {
      const tokens = tokenize(chunkContent);
      chunks.push({
        id: crypto.createHash('md5').update(`${filePath}:${chunkIdx}`).digest('hex'),
        filePath,
        fileName,
        chunkIndex: chunkIdx,
        text: chunkContent,
        charCount: chunkContent.length,
        vector: createTermVector(tokens)
      });
      chunkIdx++;
    }

    start = end - CHUNK_OVERLAP;
    if (start >= clean.length || start < 0) break;
  }

  return chunks;
}

// Extract plain text from PDF (basic fallback text extractor)
function extractTextFromPdfBuffer(buffer) {
  try {
    const str = buffer.toString('binary');
    const texts = [];
    const streamRegex = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
    let match;
    while ((match = streamRegex.exec(str)) !== null) {
      const textMatch = match[1].match(/\((.*?)\)|\[(.*?)\]/g);
      if (textMatch) {
        texts.push(textMatch.map(t => t.replace(/^[(\[]|[)\]]$/g, '')).join(' '));
      }
    }
    if (texts.length > 0) return texts.join('\n');
  } catch {}
  return buffer.toString('utf8').replace(/[^\x20-\x7E\n\r\t]/g, ' ');
}

// Read and parse file content
function readFileContent(targetPath) {
  try {
    const ext = path.extname(targetPath).toLowerCase();
    if (ext === '.pdf') {
      const buffer = fs.readFileSync(targetPath);
      return extractTextFromPdfBuffer(buffer);
    }
    return fs.readFileSync(targetPath, 'utf8');
  } catch (err) {
    console.warn(`[rag-engine] error reading file ${targetPath}:`, err.message);
    return null;
  }
}

// Collect all indexable files
function collectFiles(sourcePath) {
  const results = [];
  if (!fs.existsSync(sourcePath)) return results;

  const stat = fs.statSync(sourcePath);
  if (stat.isFile()) {
    const ext = path.extname(sourcePath).toLowerCase();
    if (SUPPORTED_EXTENSIONS.has(ext)) {
      results.push(sourcePath);
    }
    return results;
  }

  if (stat.isDirectory()) {
    const walk = (dir, depth = 0) => {
      if (depth > 6) return;
      try {
        const items = fs.readdirSync(dir, { withFileTypes: true });
        for (const item of items) {
          if (item.name.startsWith('.') || item.name === 'node_modules' || item.name === 'dist' || item.name === 'build') continue;
          const full = path.join(dir, item.name);
          if (item.isDirectory()) {
            walk(full, depth + 1);
          } else if (item.isFile()) {
            const ext = path.extname(item.name).toLowerCase();
            if (SUPPORTED_EXTENSIONS.has(ext)) {
              results.push(full);
            }
          }
        }
      } catch {}
    };
    walk(sourcePath);
  }
  return results;
}

// Add folders or files to the Knowledge Base
async function addSources(targetPaths = []) {
  const indexData = loadIndex();
  const added = [];

  for (const src of targetPaths) {
    if (!src || !fs.existsSync(src)) continue;
    const isDir = fs.statSync(src).isDirectory();
    const existing = indexData.sources.find(s => s.path === src);
    if (!existing) {
      const sourceRecord = {
        path: src,
        isDirectory: isDir,
        name: path.basename(src),
        addedAt: new Date().toISOString(),
        fileCount: 0,
        chunkCount: 0
      };
      indexData.sources.push(sourceRecord);
      added.push(sourceRecord);
    }
  }

  saveIndex(indexData);
  await reindexAll();
  return { success: true, added, sources: indexData.sources, totalSources: indexData.sources.length };
}

// Remove a source from the Knowledge Base
async function removeSource(sourcePath) {
  const indexData = loadIndex();
  indexData.sources = indexData.sources.filter(s => s.path !== sourcePath);
  indexData.chunks = indexData.chunks.filter(c => !c.filePath.startsWith(sourcePath));
  saveIndex(indexData);
  return { success: true, totalSources: indexData.sources.length };
}

// Reindex all registered sources
async function reindexAll(progressCallback = null) {
  const indexData = loadIndex();
  const allChunks = [];
  let totalFilesIndexed = 0;

  for (let i = 0; i < indexData.sources.length; i++) {
    const source = indexData.sources[i];
    const files = collectFiles(source.path);
    source.fileCount = files.length;
    let sourceChunkCount = 0;

    for (const filePath of files) {
      const content = readFileContent(filePath);
      if (content) {
        const fileChunks = chunkText(content, filePath);
        allChunks.push(...fileChunks);
        sourceChunkCount += fileChunks.length;
        totalFilesIndexed++;
      }
      if (typeof progressCallback === 'function') {
        progressCallback({
          currentSource: source.name,
          sourceIndex: i + 1,
          totalSources: indexData.sources.length,
          filesIndexed: totalFilesIndexed
        });
      }
    }
    source.chunkCount = sourceChunkCount;
    source.lastIndexed = new Date().toISOString();
  }

  indexData.chunks = allChunks;
  saveIndex(indexData);

  return {
    success: true,
    totalSources: indexData.sources.length,
    totalFiles: totalFilesIndexed,
    totalChunks: allChunks.length
  };
}

// Semantic Vector Cosine Search
async function searchKnowledge(query, options = {}) {
  const topK = typeof options === 'number' ? options : (options?.topK || 5);
  const minScore = typeof options === 'object' && options?.minScore !== undefined ? options.minScore : 0.05;
  if (!query || typeof query !== 'string' || !query.trim()) return { success: true, results: [] };

  const indexData = loadIndex();
  if (!indexData.chunks || indexData.chunks.length === 0) return { success: true, results: [] };

  const queryTokens = tokenize(query);
  const queryVector = createTermVector(queryTokens);

  const scored = [];
  for (const chunk of indexData.chunks) {
    if (!chunk.vector) continue;
    const score = cosineSimilarity(queryVector, chunk.vector);
    if (score >= minScore) {
      scored.push({
        score: Math.round(score * 1000) / 1000,
        filePath: chunk.filePath,
        fileName: chunk.fileName,
        chunkIndex: chunk.chunkIndex,
        text: chunk.text,
        snippet: chunk.text.slice(0, 300)
      });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return { success: true, results: scored.slice(0, topK) };
}

// Clear all indexed knowledge
function clearIndex() {
  const empty = {
    version: '1.0',
    updatedAt: new Date().toISOString(),
    sources: [],
    chunks: []
  };
  saveIndex(empty);
  return { success: true };
}

// Get statistics
function getStats() {
  const indexData = loadIndex();
  return {
    sources: indexData.sources || [],
    totalSources: (indexData.sources || []).length,
    totalChunks: (indexData.chunks || []).length,
    updatedAt: indexData.updatedAt || null
  };
}

module.exports = {
  addSources,
  removeSource,
  reindexAll,
  searchKnowledge,
  clearIndex,
  getStats
};
