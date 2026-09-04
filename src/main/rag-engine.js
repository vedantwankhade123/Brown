/**
 * Ultron Local Vector RAG & Semantic Knowledge Base
 * 100% Offline document indexing, chunking, and semantic vector cosine search.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { app } = require('electron');

// NOTE: secret-bearing files (.env, keys) are deliberately NOT indexable —
// indexed snippets can be injected into LLM prompts, so they must never be stored.
const SUPPORTED_EXTENSIONS = new Set([
  '.txt', '.md', '.markdown', '.json', '.csv', '.js', '.ts', '.jsx', '.tsx',
  '.py', '.html', '.css', '.xml', '.yaml', '.yml', '.sql', '.sh', '.bat',
  '.ps1', '.ini', '.cfg', '.log', '.pdf'
]);

const CHUNK_SIZE = 800;
const CHUNK_OVERLAP = 150;

// Safety rails for automatic indexing: bound the work and skip noise/dependency dirs.
const EXCLUDED_DIRS = new Set([
  'node_modules', 'dist', 'build', '.git', '__pycache__', '.venv', 'venv',
  '.cache', '.next', 'coverage', 'out', 'target', '.expo', '.vs', '.idea'
]);
const MAX_FILES_PER_SOURCE = 1500;
const MAX_FILE_BYTES = 1500000; // 1.5 MB per file
const MAX_AUTO_FILE_SOURCES = 250;

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

// Structure-aware chunking: splits on markdown headings, code blocks, paragraph boundaries
function chunkText(text, filePath) {
  if (!text) return [];
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

  // Try structure-aware splitting first
  const ext = path.extname(filePath).toLowerCase();
  let sections;

  if (['.md', '.markdown'].includes(ext)) {
    sections = splitByMarkdownHeadings(clean);
  } else if (['.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.go', '.rs'].includes(ext)) {
    sections = splitByCodeFunctions(clean);
  } else {
    sections = splitByParagraphs(clean);
  }

  // If structure-aware splitting produced reasonable chunks, use them
  // Otherwise fall back to fixed-size with overlap
  const chunks = [];
  let chunkIdx = 0;

  for (const section of sections) {
    if (section.length <= CHUNK_SIZE) {
      if (section.trim().length > 20) {
        const tokens = tokenize(section);
        chunks.push({
          id: crypto.createHash('md5').update(`${filePath}:${chunkIdx}`).digest('hex'),
          filePath,
          fileName,
          chunkIndex: chunkIdx,
          text: section.trim(),
          charCount: section.trim().length,
          vector: createTermVector(tokens)
        });
        chunkIdx++;
      }
    } else {
      // Section too large, sub-chunk with overlap
      const subChunks = fixedSizeChunk(section, filePath, fileName, chunkIdx);
      chunks.push(...subChunks);
      chunkIdx += subChunks.length;
    }
  }

  return chunks.length > 0 ? chunks : fixedSizeChunk(clean, filePath, fileName, 0);
}

// Split markdown by heading boundaries (# ## ### etc.)
function splitByMarkdownHeadings(text) {
  const lines = text.split('\n');
  const sections = [];
  let current = [];

  for (const line of lines) {
    if (/^#{1,4}\s+/.test(line) && current.length > 0) {
      sections.push(current.join('\n'));
      current = [line];
    } else {
      current.push(line);
    }
  }
  if (current.length > 0) sections.push(current.join('\n'));

  // Merge tiny sections (< 100 chars) with next section
  const merged = [];
  for (let i = 0; i < sections.length; i++) {
    if (sections[i].length < 100 && merged.length > 0) {
      merged[merged.length - 1] += '\n' + sections[i];
    } else {
      merged.push(sections[i]);
    }
  }
  return merged;
}

// Split code files by function/class/method boundaries
function splitByCodeFunctions(text) {
  const lines = text.split('\n');
  const sections = [];
  let current = [];
  let braceDepth = 0;

  // Patterns for function/class/method start
  const funcStartPattern = /^(?:export\s+)?(?:async\s+)?(?:function|class|const\s+\w+\s*=\s*(?:async\s+)?\(?|def\s+|fn\s+|func\s+|pub\s+fn\s+|public\s+|private\s+|protected\s+)/;

  for (const line of lines) {
    const trimmed = line.trim();
    if (funcStartPattern.test(trimmed) && braceDepth <= 1 && current.length > 5) {
      sections.push(current.join('\n'));
      current = [line];
    } else {
      current.push(line);
    }
    // Track brace depth (rough heuristic)
    for (const ch of trimmed) {
      if (ch === '{') braceDepth++;
      else if (ch === '}') braceDepth = Math.max(0, braceDepth - 1);
    }
  }
  if (current.length > 0) sections.push(current.join('\n'));
  return sections;
}

// Split plain text by paragraph boundaries (double newlines)
function splitByParagraphs(text) {
  const paragraphs = text.split(/\n\s*\n/);
  const sections = [];
  let buffer = '';

  for (const para of paragraphs) {
    if (buffer.length + para.length + 2 > CHUNK_SIZE && buffer.length > 0) {
      sections.push(buffer);
      buffer = para;
    } else {
      buffer += (buffer ? '\n\n' : '') + para;
    }
  }
  if (buffer) sections.push(buffer);
  return sections;
}

// Fallback fixed-size chunking with overlap
function fixedSizeChunk(text, filePath, fileName, startIdx) {
  const clean = text.trim();
  const chunks = [];
  let start = 0;
  let chunkIdx = startIdx;

  while (start < clean.length) {
    let end = start + CHUNK_SIZE;
    if (end < clean.length) {
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

// Extract plain text from PDF using pdf-parse with fallbacks
async function extractTextFromPdfBuffer(buffer) {
  if (!buffer) return '';
  try {
    const uint8 = Buffer.isBuffer(buffer) ? new Uint8Array(buffer) : new Uint8Array(Buffer.from(buffer));
    if (typeof globalThis.DOMMatrix === 'undefined') {
      globalThis.DOMMatrix = class DOMMatrix {
        constructor(init) {
          this.a = 1; this.b = 0; this.c = 0; this.d = 1; this.e = 0; this.f = 0;
          if (Array.isArray(init) && init.length >= 6) {
            [this.a, this.b, this.c, this.d, this.e, this.f] = init;
          }
        }
      };
    }
    if (typeof globalThis.ImageData === 'undefined') {
      globalThis.ImageData = class ImageData {
        constructor(width, height) {
          this.width = width || 0;
          this.height = height || 0;
          this.data = new Uint8ClampedArray((this.width * this.height * 4) || 0);
        }
      };
    }
    if (typeof globalThis.Path2D === 'undefined') {
      globalThis.Path2D = class Path2D {
        constructor() {}
        addPath() {}
        closePath() {}
        moveTo() {}
        lineTo() {}
        bezierCurveTo() {}
        quadraticCurveTo() {}
        arc() {}
        arcTo() {}
        ellipse() {}
        rect() {}
      };
    }
    try {
      const pdfModule = require('pdf-parse');
      const PDFParse = pdfModule.PDFParse || (typeof pdfModule === 'function' ? pdfModule : null);
      if (PDFParse) {
        const origWarn = console.warn;
        const origError = console.error;
        try {
          console.warn = (...args) => {
            const msg = String(args[0] || '');
            if (msg.includes('standardFontDataUrl') || msg.includes('polyfill') || msg.includes('require')) return;
            origWarn.apply(console, args);
          };
          console.error = (...args) => {
            const msg = String(args[0] || '');
            if (msg.includes('standardFontDataUrl') || msg.includes('polyfill')) return;
            origError.apply(console, args);
          };
          if (typeof PDFParse === 'function' && !pdfModule.PDFParse) {
            const res = await PDFParse(Buffer.from(uint8));
            if (res && res.text && res.text.trim()) return res.text.trim();
          } else {
            const parser = new PDFParse(uint8);
            const res = await parser.getText();
            if (res && res.text && res.text.trim()) return res.text.trim();
          }
        } finally {
          console.warn = origWarn;
          console.error = origError;
        }
      }
    } catch {}

    const str = Buffer.from(uint8).toString('latin1');
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
    return str.replace(/[^\x20-\x7E\n\r\t]/g, ' ').trim();
  } catch {
    return '';
  }
}

// Read and parse file content
async function readFileContent(targetPath) {
  try {
    const ext = path.extname(targetPath).toLowerCase();
    if (ext === '.pdf') {
      const buffer = fs.readFileSync(targetPath);
      return await extractTextFromPdfBuffer(buffer);
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
      if (depth > 6 || results.length >= MAX_FILES_PER_SOURCE) return;
      try {
        const items = fs.readdirSync(dir, { withFileTypes: true });
        for (const item of items) {
          if (item.name.startsWith('.') || EXCLUDED_DIRS.has(item.name)) continue;
          const full = path.join(dir, item.name);
          if (item.isDirectory()) {
            walk(full, depth + 1);
          } else if (item.isFile()) {
            const ext = path.extname(item.name).toLowerCase();
            if (!SUPPORTED_EXTENSIONS.has(ext)) continue;
            try {
              if (fs.statSync(full).size > MAX_FILE_BYTES) continue;
            } catch { continue; }
            results.push(full);
            if (results.length >= MAX_FILES_PER_SOURCE) break;
          }
        }
      } catch {}
    };
    walk(sourcePath);
  }
  return results;
}

function chunksBelongToSource(chunkPath, sourcePath) {
  return chunkPath === sourcePath || chunkPath.startsWith(sourcePath.endsWith(path.sep) ? sourcePath : sourcePath + path.sep);
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
  indexData.chunks = indexData.chunks.filter(c => !chunksBelongToSource(c.filePath, sourcePath));
  saveIndex(indexData);
  return { success: true, totalSources: indexData.sources.length };
}

// Reindex a single source incrementally (used by auto-learn)
async function reindexSource(sourcePath) {
  const indexData = loadIndex();
  const source = indexData.sources.find(s => s.path === sourcePath);
  if (!source) return { success: false, error: 'Source not registered' };

  indexData.chunks = (indexData.chunks || []).filter(c => !chunksBelongToSource(c.filePath, sourcePath));
  const files = collectFiles(source.path);
  source.fileCount = files.length;
  let sourceChunkCount = 0;
  for (const filePath of files) {
    const content = await readFileContent(filePath);
    if (content) {
      const fileChunks = chunkText(content, filePath);
      indexData.chunks.push(...fileChunks);
      sourceChunkCount += fileChunks.length;
    }
  }
  source.chunkCount = sourceChunkCount;
  source.lastIndexed = new Date().toISOString();
  saveIndex(indexData);
  return { success: true, totalFiles: files.length, totalChunks: sourceChunkCount };
}

// Auto-learn: register a folder/file the user brought into Ultron (implicit
// consent) and index just that source — never scans anything else.
async function autoAddSource(targetPath) {
  if (!targetPath || !fs.existsSync(targetPath)) return { success: false, error: 'Path not found' };
  const indexData = loadIndex();
  const isDir = fs.statSync(targetPath).isDirectory();
  if (!indexData.sources.find(s => s.path === targetPath)) {
    indexData.sources.push({
      path: targetPath,
      isDirectory: isDir,
      name: path.basename(targetPath),
      auto: true,
      addedAt: new Date().toISOString(),
      fileCount: 0,
      chunkCount: 0
    });
    saveIndex(indexData);
  }
  return await reindexSource(targetPath);
}

// Auto-learn: index one file the agent wrote or read. Skips work when the
// file has not changed since its last indexing (mtime check).
async function indexFile(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return { success: false };
  let stat;
  try { stat = fs.statSync(filePath); } catch { return { success: false }; }
  if (!stat.isFile() || stat.size > MAX_FILE_BYTES) return { success: false };
  const ext = path.extname(filePath).toLowerCase();
  if (!SUPPORTED_EXTENSIONS.has(ext)) return { success: false };

  const indexData = loadIndex();
  const hasChunks = (indexData.chunks || []).some(c => c.filePath === filePath);
  const existing = indexData.sources.find(s => s.path === filePath);
  if (existing && existing.indexedMtime === stat.mtimeMs && hasChunks) {
    return { success: true, skipped: true };
  }

  if (!existing) {
    // Prune oldest auto single-file sources so the list stays bounded.
    const autoFiles = indexData.sources.filter(s => s.auto && !s.isDirectory);
    if (autoFiles.length >= MAX_AUTO_FILE_SOURCES) {
      const drop = autoFiles.slice(0, autoFiles.length - MAX_AUTO_FILE_SOURCES + 1);
      for (const d of drop) {
        indexData.sources = indexData.sources.filter(s => s.path !== d.path);
        indexData.chunks = (indexData.chunks || []).filter(c => c.filePath !== d.path);
      }
    }
    indexData.sources.push({
      path: filePath,
      isDirectory: false,
      name: path.basename(filePath),
      auto: true,
      addedAt: new Date().toISOString(),
      fileCount: 1,
      chunkCount: 0
    });
  }

  indexData.chunks = (indexData.chunks || []).filter(c => c.filePath !== filePath);
  const content = await readFileContent(filePath);
  const chunks = content ? chunkText(content, filePath) : [];
  indexData.chunks.push(...chunks);
  const source = indexData.sources.find(s => s.path === filePath);
  if (source) {
    source.chunkCount = chunks.length;
    source.indexedMtime = stat.mtimeMs;
    source.lastIndexed = new Date().toISOString();
  }
  saveIndex(indexData);
  return { success: true, chunks: chunks.length };
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
      const content = await readFileContent(filePath);
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
// BM25 scoring parameters
const BM25_K1 = 1.5;
const BM25_B = 0.75;

// Compute BM25 score for a query against a chunk
function bm25Score(queryTerms, chunkText, avgDocLen, totalDocs, docFreqs) {
  const chunkTokens = tokenize(chunkText);
  const chunkLen = chunkTokens.length;
  const termFreqs = {};
  for (const t of chunkTokens) {
    termFreqs[t] = (termFreqs[t] || 0) + 1;
  }

  let score = 0;
  for (const term of queryTerms) {
    const tf = termFreqs[term] || 0;
    if (tf === 0) continue;
    const df = docFreqs[term] || 1;
    const idf = Math.log((totalDocs - df + 0.5) / (df + 0.5) + 1);
    const tfNorm = (tf * (BM25_K1 + 1)) / (tf + BM25_K1 * (1 - BM25_B + BM25_B * (chunkLen / avgDocLen)));
    score += idf * tfNorm;
  }
  return score;
}

// Hybrid Retrieval: BM25 keyword matching + TF-cosine vector similarity
async function searchKnowledge(query, options = {}) {
  const topK = typeof options === 'number' ? options : (options?.topK || 5);
  const minScore = typeof options === 'object' && options?.minScore !== undefined ? options.minScore : 0.05;
  if (!query || typeof query !== 'string' || !query.trim()) return { success: true, results: [] };

  const indexData = loadIndex();
  if (!indexData.chunks || indexData.chunks.length === 0) return { success: true, results: [] };

  const queryTokens = tokenize(query);
  const queryVector = createTermVector(queryTokens);
  // Unique query terms for BM25 (no n-grams, just whole words)
  const queryWords = query.toLowerCase().replace(/[^\w\s-]/g, ' ').split(/\s+/).filter(w => w.length > 2);

  // Pre-compute BM25 corpus stats
  const totalDocs = indexData.chunks.length;
  let totalLen = 0;
  const docFreqs = {};
  for (const chunk of indexData.chunks) {
    const words = (chunk.text || '').toLowerCase().replace(/[^\w\s-]/g, ' ').split(/\s+/).filter(w => w.length > 2);
    totalLen += words.length;
    const seen = new Set(words);
    for (const w of seen) {
      docFreqs[w] = (docFreqs[w] || 0) + 1;
    }
  }
  const avgDocLen = totalLen / Math.max(totalDocs, 1);

  const scored = [];
  for (const chunk of indexData.chunks) {
    if (!chunk.vector) continue;

    // Cosine similarity score (0-1)
    const cosineScore = cosineSimilarity(queryVector, chunk.vector);

    // BM25 score (unbounded, normalize later)
    const bm25 = bm25Score(queryWords, chunk.text || '', avgDocLen, totalDocs, docFreqs);

    // Skip if both scores are negligible
    if (cosineScore < 0.01 && bm25 < 0.1) continue;

    scored.push({
      cosineScore,
      bm25Score: bm25,
      filePath: chunk.filePath,
      fileName: chunk.fileName,
      chunkIndex: chunk.chunkIndex,
      text: chunk.text,
      snippet: chunk.text.slice(0, 300)
    });
  }

  if (scored.length === 0) return { success: true, results: [] };

  // Normalize BM25 scores to 0-1 range for fusion
  const maxBm25 = Math.max(...scored.map(s => s.bm25Score), 0.001);
  for (const item of scored) {
    item.bm25Norm = item.bm25Score / maxBm25;
    // Weighted fusion: 40% BM25 + 60% cosine (cosine handles semantic similarity better with n-grams)
    item.score = Math.round((0.4 * item.bm25Norm + 0.6 * item.cosineScore) * 1000) / 1000;
  }

  // Filter by minimum score and sort
  const filtered = scored.filter(s => s.score >= minScore);
  filtered.sort((a, b) => b.score - a.score);
  return { success: true, results: filtered.slice(0, topK) };
}

// Index in-memory text content directly (e.g. implementation plans, session learnings, task playbooks)
async function indexTextContent(id, title, content, metadata = {}) {
  if (!content || typeof content !== 'string' || !content.trim()) return { success: false, error: 'Empty content' };
  const indexData = loadIndex();
  const sourceId = id || `memory-${Date.now()}`;
  const fileName = title || `${sourceId}.md`;

  // Remove existing chunks for this sourceId if updating
  indexData.chunks = (indexData.chunks || []).filter(c => c.sourceId !== sourceId && c.filePath !== sourceId);

  const clean = content.replace(/\r\n/g, '\n').trim();
  const textChunks = [];
  if (clean.length <= CHUNK_SIZE) {
    const tokens = tokenize(clean);
    textChunks.push({
      id: crypto.createHash('md5').update(`${sourceId}:0`).digest('hex'),
      sourceId,
      filePath: sourceId,
      fileName,
      chunkIndex: 0,
      text: clean,
      charCount: clean.length,
      tokenCount: tokens.length,
      vector: createTermVector(tokens),
      metadata
    });
  } else {
    let start = 0;
    let index = 0;
    while (start < clean.length) {
      const end = Math.min(start + CHUNK_SIZE, clean.length);
      const slice = clean.slice(start, end);
      const tokens = tokenize(slice);
      textChunks.push({
        id: crypto.createHash('md5').update(`${sourceId}:${index}`).digest('hex'),
        sourceId,
        filePath: sourceId,
        fileName,
        chunkIndex: index,
        text: slice,
        charCount: slice.length,
        tokenCount: tokens.length,
        vector: createTermVector(tokens),
        metadata
      });
      start += (CHUNK_SIZE - CHUNK_OVERLAP);
      index++;
    }
  }

  indexData.chunks.push(...textChunks);
  
  // Track as source
  let source = (indexData.sources || []).find(s => s.path === sourceId);
  if (!source) {
    source = { id: sourceId, type: 'memory', path: sourceId, name: fileName, addedAt: new Date().toISOString() };
    indexData.sources.push(source);
  }
  source.chunkCount = textChunks.length;
  source.lastIndexed = new Date().toISOString();

  saveIndex(indexData);
  return { success: true, chunksAdded: textChunks.length };
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
  reindexSource,
  autoAddSource,
  indexFile,
  indexTextContent,
  searchKnowledge,
  clearIndex,
  getStats
};
