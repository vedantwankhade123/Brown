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
const parsers = require('./knowledge-parsers');
const SUPPORTED_EXTENSIONS = parsers.extensions;

const CHUNK_SIZE = 800;
const CHUNK_OVERLAP = 150;

// Safety rails for automatic indexing: bound the work and skip noise/dependency dirs.
const EXCLUDED_DIRS = new Set([
  'node_modules', 'dist', 'build', '.git', '__pycache__', '.venv', 'venv',
  '.cache', '.next', 'coverage', 'out', 'target', '.expo', '.vs', '.idea'
]);
const MAX_FILES_PER_SOURCE = 1500;
// Raw binary documents/images have a separate 32 MB bound; text files are limited to 2 MB.
const MAX_SOURCE_BYTES = 128000000; // Raw source bytes per folder; extracted output is independently bounded.
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

async function saveIndex(indexData) {
  const file = getIndexPath();
  const tmp = `${file}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
  try {
    await fs.promises.mkdir(path.dirname(file), { recursive: true });
    indexData.updatedAt = new Date().toISOString();
    await fs.promises.writeFile(tmp, JSON.stringify(indexData, null, 2), 'utf8');
    await fs.promises.rename(tmp, file);
    return true;
  } catch (err) {
    console.error('[rag-engine] error saving index:', err.message);
    try { await fs.promises.unlink(tmp); } catch (_) {}
    return false;
  }
}

// Tokenize text into words and sub-word n-grams for semantic matching
function tokenize(text) {
  if (!text || typeof text !== 'string') return [];
  const words = text
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\s-]/gu, ' ')
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

    // The tail slice is complete: re-overlapping it would land on the same
    // `start` forever (start = clean.length - CHUNK_OVERLAP < clean.length),
    // which looped until the process ran out of heap.
    if (end >= clean.length) break;
    start = end - CHUNK_OVERLAP;
  }

  return chunks;
}

// Share extraction across initial imports, automatic refreshes and evidence reads.
async function parseFile(targetPath, report = null) {
  try {
    const result = await parsers.extract(targetPath);
    for (const reason of result.warnings || []) report?.push({path:targetPath,reason,warning:true});
    return result;
  } catch (error) {
    report?.push({path:targetPath,reason:error.message});
    return {text:'',segments:[]};
  }
}
async function readFileContent(targetPath) { return (await parseFile(targetPath)).text; }
function parsedChunks(parsed, filePath) {
  const chunks=[];
  for(const segment of parsed.segments||[]){
    for(const chunk of chunkText(segment.text,filePath)){
      chunk.chunkIndex=chunks.length;chunk.id=crypto.createHash('md5').update(`${filePath}:${chunk.chunkIndex}`).digest('hex');
      Object.assign(chunk,{extraction:segment.extraction||parsed.extraction,kind:parsed.kind||'document',pageNumber:segment.pageNumber,slideNumber:segment.slideNumber,sheetName:segment.sheetName});chunks.push(chunk);
    }
  }
  return chunks;
}

// Collect all indexable files
function collectFiles(sourcePath, skipped = null) {
  const results = [];
  if (!fs.existsSync(sourcePath)) return results;

  const stat = fs.statSync(sourcePath);
  if (stat.isFile()) {
    const ext = path.extname(sourcePath).toLowerCase();
    if (SUPPORTED_EXTENSIONS.has(ext) && stat.size <= parsers.limitFor(sourcePath)) {
      results.push(sourcePath);
    } else if (SUPPORTED_EXTENSIONS.has(ext) && skipped) {
      skipped.push({ path: sourcePath, reason: 'File exceeds its format-specific indexing size limit.' });
    }
    return results;
  }

  if (stat.isDirectory()) {
    let totalBytes = 0;
    const walk = (dir, depth = 0) => {
      if(depth>6){if(skipped&&skipped.length<500)skipped.push({path:dir,reason:'Folder is beyond the six-level indexing depth limit.'});return;}
      if (results.length >= MAX_FILES_PER_SOURCE || totalBytes >= MAX_SOURCE_BYTES) return;
      try {
        const items = fs.readdirSync(dir, { withFileTypes: true });
        for (const item of items) {
          if (item.name.startsWith('.') || EXCLUDED_DIRS.has(item.name)) continue;
          const full = path.join(dir, item.name);
          if (item.isDirectory()) {
            walk(full, depth + 1);
          } else if (item.isFile()) {
            const ext = path.extname(item.name).toLowerCase();
            if (!SUPPORTED_EXTENSIONS.has(ext)) { if (skipped && skipped.length < 500) skipped.push({path:full,reason:'Unsupported file format: '+(ext||'no extension')+'. Convert it to a supported format.'}); continue; }
            let size = 0;
            try {
              size = fs.statSync(full).size;
              if (size > parsers.limitFor(full)) {
                skipped?.push({ path: full, reason: 'File exceeds its format-specific indexing size limit.' });
                continue;
              }
            } catch { continue; }
            totalBytes += size;
            results.push(full);
            if (results.length >= MAX_FILES_PER_SOURCE || totalBytes >= MAX_SOURCE_BYTES) break;
          }
        }
      } catch {}
    };
    walk(sourcePath);
    if(results.length>=MAX_FILES_PER_SOURCE||totalBytes>=MAX_SOURCE_BYTES)skipped?.push({path:sourcePath,reason:'Folder scan reached its file-count or raw-byte limit. Import smaller subfolders for the remaining files.'});
  }
  return results;
}

function chunksBelongToSource(chunkPath, sourcePath) {
  return chunkPath === sourcePath || chunkPath.startsWith(sourcePath.endsWith(path.sep) ? sourcePath : sourcePath + path.sep);
}

// Add folders or files to the Knowledge Base
async function addSources(targetPaths = [], progressCallback = null) {
  if (!Array.isArray(targetPaths) || !targetPaths.length || targetPaths.some(src => typeof src !== 'string')) {
    return { success: false, error: 'Select valid files or folders to import.' };
  }
  const indexData = loadIndex();
  const added = [];
  const rejected = [];

  for (const src of targetPaths) {
    if (!src || !fs.existsSync(src)) { rejected.push({ path: src, reason: 'Path not found.' }); continue; }
    const isDir = fs.statSync(src).isDirectory();
    if (!isDir && !SUPPORTED_EXTENSIONS.has(path.extname(src).toLowerCase())) {
      rejected.push({ path: src, reason: 'Unsupported file format.' }); continue;
    }
    // Keep empty directories registered so projects can start before their files
    // exist and the update monitor can index supported files added later.
    if (!isDir && collectFiles(src).length === 0) {
      rejected.push({ path: src, reason: 'No supported files within the size limits were found.' }); continue;
    }
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

  if (rejected.length === targetPaths.length) return { success: false, error: rejected.map(item => `${path.basename(item.path || '')}: ${item.reason}`).join(' '), rejected };
  if (!(await saveIndex(indexData))) return { success: false, error: 'Could not save the Knowledge Base. Check available disk space and permissions.' };
  const result = await reindexAll(progressCallback);
  const refreshed = loadIndex();
  return { ...result, added, rejected, sources: refreshed.sources, totalSources: refreshed.sources.length };
}

// Remove a source from the Knowledge Base
async function removeSource(sourcePath) {
  const indexData = loadIndex();
  indexData.sources = indexData.sources.filter(s => s.path !== sourcePath);
  indexData.chunks = indexData.chunks.filter(c => c.sourceId || indexData.sources.some(source => chunksBelongToSource(c.filePath, source.path)));
  if (indexData.fileState) for (const file of Object.keys(indexData.fileState)) if (!indexData.sources.some(source => chunksBelongToSource(file, source.path))) delete indexData.fileState[file];
  if (!(await saveIndex(indexData))) return { success: false, error: 'Could not save the source removal.' };
  return { success: true, totalSources: indexData.sources.length };
}

// Reindex a single source incrementally (used by auto-learn)
async function reindexSource(sourcePath) {
  const indexData = loadIndex();
  const source = indexData.sources.find(s => s.path === sourcePath);
  if (!source) return { success: false, error: 'Source not registered' };

  indexData.chunks = (indexData.chunks || []).filter(c => !chunksBelongToSource(c.filePath, sourcePath));
  const files = collectFiles(source.path);
  source.fileCount = 0;
  let sourceChunkCount = 0,extractedChars=0;const skipped=[];
  for (const filePath of files) {
    const parsed = await parseFile(filePath,skipped);
    if (parsed.text) {
      if(extractedChars+parsed.text.length>25_000_000){skipped.push({path:filePath,reason:'Source exceeds the extracted-text budget.'});continue;}
      extractedChars+=parsed.text.length;source.fileCount++;
      const fileChunks = parsedChunks(parsed, filePath);
      indexData.chunks.push(...fileChunks);
      sourceChunkCount += fileChunks.length;
    }
  }
  source.chunkCount = sourceChunkCount;
  source.lastIndexed = new Date().toISOString();
  await saveIndex(indexData);
  return { success: true, totalFiles: source.fileCount, totalChunks: sourceChunkCount,skipped };
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
    await saveIndex(indexData);
  }
  return await reindexSource(targetPath);
}

// Auto-learn: index one file the agent wrote or read. Skips work when the
// file has not changed since its last indexing (mtime check).
async function indexFile(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return { success: false };
  let stat;
  try { stat = fs.statSync(filePath); } catch { return { success: false }; }
  if (!stat.isFile() || stat.size > parsers.limitFor(filePath)) return { success: false };
  const ext = path.extname(filePath).toLowerCase();
  if (!SUPPORTED_EXTENSIONS.has(ext)) return { success: false };

  const indexData = loadIndex();
  const hasChunks = (indexData.chunks || []).some(c => c.filePath === filePath);
  const existing = indexData.sources.find(s => s.path === filePath);
  if (existing && existing.indexedMtime === stat.mtimeMs && existing.indexedParserVersion===parsers.VERSION && hasChunks) {
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
  const parsed = await parseFile(filePath);
  const chunks = parsedChunks(parsed, filePath);
  indexData.chunks.push(...chunks);
  const source = indexData.sources.find(s => s.path === filePath);
  if (source) {
    source.chunkCount = chunks.length;
    source.indexedMtime = stat.mtimeMs;
    source.indexedParserVersion = parsers.VERSION;
    source.lastIndexed = new Date().toISOString();
  }
  await saveIndex(indexData);
  return { success: true, chunks: chunks.length };
}

// Reindex all registered sources
async function reindexAll(progressCallback = null) {
  const indexData = loadIndex();
  const fileState = {};
  const allChunks = (indexData.chunks || []).filter(chunk => chunk.sourceId);
  let totalFilesIndexed = 0;
  const indexedPaths = new Set();
  const skipped = [];

  for (let i = 0; i < indexData.sources.length; i++) {
    const source = indexData.sources[i];
    const files = collectFiles(source.path, skipped);
    source.fileCount = files.length;
    let sourceChunkCount = 0;
    let extractedChars = 0,sourceFilesIndexed=0;

    for (const filePath of files) {
      try { const stat = fs.statSync(filePath); fileState[filePath] = `${parsers.VERSION}:${stat.mtimeMs}:${stat.size}`; } catch {}
      if(indexedPaths.has(filePath)){const chunks=allChunks.filter(chunk=>chunk.filePath===filePath);sourceChunkCount+=chunks.length;sourceFilesIndexed++;extractedChars+=chunks.reduce((sum,chunk)=>sum+chunk.charCount,0);continue;}
      if (typeof progressCallback === 'function') progressCallback({currentSource:source.name,currentFile:path.basename(filePath),sourceIndex:i+1,totalSources:indexData.sources.length,filesIndexed:totalFilesIndexed});
      const parsed = await parseFile(filePath, skipped);
      if (parsed.text && parsed.text.trim()) {
        if(extractedChars+parsed.text.length>25_000_000){skipped.push({path:filePath,reason:'Source exceeds the 25 million character extracted-text budget. Import a smaller subfolder.'});continue;}
        extractedChars+=parsed.text.length;sourceFilesIndexed++;
        const fileChunks = parsedChunks(parsed, filePath);
        allChunks.push(...fileChunks);
        sourceChunkCount += fileChunks.length;
        if (!indexedPaths.has(filePath)) {
          indexedPaths.add(filePath);
          totalFilesIndexed++;
        }
      } else {
        if(!skipped.some(item=>item.path===filePath&&!item.warning))skipped.push({ path: filePath, reason: 'No readable text found. Check OCR availability, document language, encryption or file integrity.' });
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
    source.fileCount = sourceFilesIndexed;
    source.lastIndexed = new Date().toISOString();
  }

  indexData.chunks = [...new Map(allChunks.map(chunk => [chunk.id, chunk])).values()];
  indexData.fileState = fileState;
  indexData.extractionReport=skipped.slice(0,500);
  if (!(await saveIndex(indexData))) return { success: false, error: 'Could not save the indexed files.' };

  return {
    success: true,
    totalSources: indexData.sources.length,
    totalFiles: totalFilesIndexed,
    totalChunks: indexData.chunks.length,
    skipped
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
  if (Array.isArray(options?.sourcePaths)) {
    indexData.chunks = (indexData.chunks || []).filter(chunk => options.sourcePaths.some(source => typeof source === 'string' && chunksBelongToSource(chunk.filePath, source)));
  }
  if (!indexData.chunks || indexData.chunks.length === 0) return { success: true, results: [] };

  const queryTokens = tokenize(query);
  const queryVector = createTermVector(queryTokens);
  // Unique query terms for BM25 (no n-grams, just whole words)
  const searchStopWords = new Set('the and for from with this that what which when where how does are was were have has can could would should please tell explain according using indexed files file documents document notes note folder folders project knowledge base search find about into your my our its'.split(' '));
  const queryWords = [...new Set(query.toLowerCase().replace(/[^\p{L}\p{M}\p{N}\s-]/gu, ' ').split(/\s+/).filter(w => w.length > 2 && !searchStopWords.has(w)))];
  if (!queryWords.length) return { success: true, results: [] };

  // Pre-compute BM25 corpus stats
  const totalDocs = indexData.chunks.length;
  let totalLen = 0;
  const docFreqs = {};
  for (const chunk of indexData.chunks) {
    const words = (chunk.text || '').toLowerCase().replace(/[^\p{L}\p{M}\p{N}\s-]/gu, ' ').split(/\s+/).filter(w => w.length > 2);
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
    const evidenceWords = new Set(((chunk.text || '') + ' ' + (chunk.fileName || '')).toLowerCase().replace(/[^\p{L}\p{M}\p{N}\s-]/gu, ' ').split(/\s+/));
    const matchedWords = queryWords.filter(word => evidenceWords.has(word)).length;
    // Character n-grams and relative ranking cannot establish relevance alone.
    if (!matchedWords || matchedWords / queryWords.length < 0.2) continue;

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
      chunkId: chunk.id,
      sourceId: chunk.sourceId,
      kind: chunk.kind,
      extraction: chunk.extraction,
      pageNumber: chunk.pageNumber,
      slideNumber: chunk.slideNumber,
      sheetName: chunk.sheetName,
      text: chunk.text,
      snippet: chunk.text
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

  await saveIndex(indexData);
  return { success: true, chunksAdded: textChunks.length };
}

// Clear all indexed knowledge
async function clearIndex() {
  const empty = {
    version: '1.0',
    updatedAt: new Date().toISOString(),
    sources: [],
    chunks: []
  };
  return (await saveIndex(empty)) ? { success: true } : { success: false, error: 'Could not clear the Knowledge Base index.' };
}

// Get statistics
function getStats() {
  const indexData = loadIndex();
  return {
    sources: indexData.sources || [],
    totalSources: (indexData.sources || []).length,
    totalChunks: (indexData.chunks || []).length,
    updatedAt: indexData.updatedAt || null
    ,extractionReport:indexData.extractionReport||[]
  };
}

// Distinct indexed files, for the @ mention file picker. Derived from chunks so
// directory sources, auto-learned files and pasted text all show up.
function listIndexedFiles(filter = '') {
  const indexData = loadIndex();
  const byFile = new Map();
  for (const chunk of (indexData.chunks || [])) {
    if (!chunk || !chunk.filePath) continue;
    const current = byFile.get(chunk.filePath);
    if (current) {
      current.chunkCount++;
    } else {
      let metadata = null;
      try { metadata = fs.statSync(chunk.filePath); } catch { /* Saved notes and removed files have no disk metadata. */ }
      byFile.set(chunk.filePath, {
        path: chunk.filePath,
        fileName: chunk.fileName || path.basename(chunk.filePath),
        chunkCount: 1,
        size: metadata?.isFile() ? metadata.size : null,
        modifiedAt: metadata?.isFile() ? metadata.mtime.toISOString() : null
        ,kind:chunk.kind,extraction:chunk.extraction
      });
    }
  }
  const needle = String(filter || '').trim().toLowerCase();
  const files = [...byFile.values()].sort((a, b) => a.path.length - b.path.length);
  return {
    success: true,
    files: needle ? files.filter(f => f.path.toLowerCase().includes(needle)) : files
  };
}

// Refresh only changed files, retaining saved notes and unchanged chunks.
async function readEvidence(filePath, options = {}) {
  const data = loadIndex();
  if (typeof filePath !== 'string' || !data.chunks.some(chunk => chunk.filePath === filePath)) return { success: false, error: 'File is not indexed.' };
  const notes = data.chunks.filter(chunk => chunk.filePath === filePath && chunk.sourceId);
  if (notes.length) return { success: true, content: notes.map(chunk => chunk.text).join('\n\n').slice(0,24000) };
  try { const stat = await fs.promises.stat(filePath); if (!stat.isFile() || stat.size > parsers.limitFor(filePath)) return { success: false, error: 'Source exceeds the readable file size limit.' }; }
  catch { return { success: false, error: 'The source file is unavailable.' }; }
  if(parsers.IMAGES.has(path.extname(filePath).toLowerCase())){
    const chunks=data.chunks.filter(chunk=>chunk.filePath===filePath);
    const result={success:true,kind:'image',extraction:chunks[0]?.extraction,content:chunks.map(chunk=>chunk.text).join('\n\n').slice(0,24000)};
    if(options?.includeImage){
      try{const {nativeImage}=require('electron');const image=await nativeImage.createThumbnailFromPath(filePath,{width:1600,height:1600});const buffer=image.toPNG();if(!image.isEmpty()&&buffer.length<=4_000_000)result.image={mimeType:'image/png',data:buffer.toString('base64')};else result.imageError='Image preview exceeds the vision input limit.';}
      catch(error){result.imageError='Original image preview is unavailable: '+error.message;}
    }
    return result;
  }
  const content = await readFileContent(filePath);
  if (!content) return { success: false, error: 'The source is unavailable or has no readable text.' };
  return { success: true, content: content.slice(0, 24000) };
}

async function refreshChangedFiles() {
  const data = loadIndex(), previous = data.fileState || {}, next = {}, skipped = [];
  const paths = new Set(), unavailable = [];
  for (const source of data.sources) {
    if (source.type === 'memory') continue;
    if (!fs.existsSync(source.path)) {
      if (source.isDirectory || !fs.existsSync(path.parse(source.path).root)) unavailable.push(source.path);
      skipped.push({ path: source.path, reason: 'Source is unavailable.' }); continue;
    }
    for (const file of collectFiles(source.path, skipped)) paths.add(file);
  }
  let updated = 0, removed = 0;
  for (const file of paths) {
    let stat;
    try { stat = await fs.promises.stat(file); } catch { continue; }
    const stamp = `${parsers.VERSION}:${stat.mtimeMs}:${stat.size}`;
    next[file] = stamp;
    if (previous[file] === stamp) continue;
    const parsed = await parseFile(file, skipped);
    data.chunks = (data.chunks || []).filter(chunk => chunk.filePath !== file);
    if (parsed.text?.trim()){
      const withinBudget=data.sources.filter(source=>chunksBelongToSource(file,source.path)).every(source=>data.chunks.filter(chunk=>chunksBelongToSource(chunk.filePath,source.path)).reduce((sum,chunk)=>sum+(chunk.charCount||chunk.text.length),0)+parsed.text.length<=25_000_000);
      if(withinBudget)data.chunks.push(...parsedChunks(parsed,file));else skipped.push({path:file,reason:'Source exceeds the extracted-text budget. Import a smaller subfolder.'});
    }
    else if(!skipped.some(item=>item.path===file&&!item.warning))skipped.push({ path: file, reason: 'No readable text found.' });
    updated++;
    // Yield between files so a large update does not monopolize Electron.
    await new Promise(resolve => setImmediate(resolve));
  }
  for (const file of Object.keys(previous)) {
    if (paths.has(file)) continue;
    if (unavailable.some(source => chunksBelongToSource(file, source))) { next[file] = previous[file]; continue; }
    data.chunks = (data.chunks || []).filter(chunk => chunk.filePath !== file);
    removed++;
  }
  const stale = new Set((data.chunks || []).filter(chunk => !chunk.sourceId && !paths.has(chunk.filePath) && !unavailable.some(source => chunksBelongToSource(chunk.filePath, source))).map(chunk => chunk.filePath));
  if (stale.size) { data.chunks = data.chunks.filter(chunk => !stale.has(chunk.filePath)); removed += stale.size; }
  data.fileState = next;
  for (const source of data.sources.filter(source => source.type !== 'memory')) {
    if (unavailable.includes(source.path)) continue;
    source.fileCount = new Set(data.chunks.filter(chunk=>chunksBelongToSource(chunk.filePath,source.path)).map(chunk=>chunk.filePath)).size;
    source.chunkCount = data.chunks.filter(chunk => chunksBelongToSource(chunk.filePath, source.path)).length;
    if (updated || removed) source.lastIndexed = new Date().toISOString();
  }
  if ((updated || removed || JSON.stringify(previous) !== JSON.stringify(next)) && !(await saveIndex(data))) return { success: false, error: 'Could not save automatic knowledge updates.' };
  return { success: true, updated, removed, skipped, lastChecked: new Date().toISOString() };
}

// All disk mutations share one queue; background updates cannot overwrite imports.
let mutationQueue = Promise.resolve();
const serialize = fn => (...args) => {
  const job = mutationQueue.then(() => fn(...args));
  mutationQueue = job.catch(() => {});
  return job;
};
module.exports = {
  supportedExtensions: [...SUPPORTED_EXTENSIONS],
  addSources: serialize(addSources),
  removeSource: serialize(removeSource),
  reindexAll: serialize(reindexAll),
  reindexSource: serialize(reindexSource),
  autoAddSource: serialize(autoAddSource),
  indexFile: serialize(indexFile),
  indexTextContent: serialize(indexTextContent),
  refreshChangedFiles: serialize(refreshChangedFiles),
  readEvidence,
  searchKnowledge,
  clearIndex: serialize(clearIndex),
  getStats,
  listIndexedFiles
};
