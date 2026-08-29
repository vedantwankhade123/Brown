/**
 * Ultron / Brown AI Visuals, Diagrams, and Chart Engine
 * Renders interactive Mermaid diagrams, SVG flowcharts, bar/line/pie charts,
 * mindmaps, Gantt timelines, and generates proactive visualization suggestion chips.
 */
(function () {
  'use strict';

  const COLOR_PALETTE = [
    '#38bdf8', '#818cf8', '#34d399', '#f472b6', 
    '#fbbf24', '#a78bfa', '#f87171', '#2dd4bf', 
    '#fb923c', '#60a5fa', '#4ade80', '#e879f9'
  ];

  let _mermaidInitialized = false;

  /**
   * Initialize Mermaid with modern dark theme
   */
  async function loadMermaidBundle() {
    if (typeof window === 'undefined') return null;
    let m = (window.mermaid?.default || window.mermaid || (window.__esbuild_esm_mermaid_nm?.mermaid));
    if (m) return m;

    if (document.getElementById('ultron-mermaid-script')) {
      return new Promise(resolve => {
        let attempts = 0;
        const iv = setInterval(() => {
          attempts++;
          m = (window.mermaid?.default || window.mermaid || (window.__esbuild_esm_mermaid_nm?.mermaid));
          if (m || attempts > 60) {
            clearInterval(iv);
            resolve(m || null);
          }
        }, 50);
      });
    }

    return new Promise(resolve => {
      const script = document.createElement('script');
      script.id = 'ultron-mermaid-script';
      script.src = '../../node_modules/mermaid/dist/mermaid.min.js';
      script.async = true;
      script.onload = () => {
        const loaded = (window.mermaid?.default || window.mermaid || (window.__esbuild_esm_mermaid_nm?.mermaid));
        if (loaded) window.mermaid = loaded;
        resolve(loaded || null);
      };
      script.onerror = () => {
        resolve(null);
      };
      document.head.appendChild(script);
    });
  }

  async function initMermaid() {
    if (_mermaidInitialized) return;
    try {
      let m = (typeof window !== 'undefined' && (window.mermaid?.default || window.mermaid || (window.__esbuild_esm_mermaid_nm?.mermaid))) || (typeof mermaid !== 'undefined' && (mermaid.default || mermaid));
      if (!m) {
        m = await loadMermaidBundle();
      }
      if (m && typeof m.initialize === 'function') {
        m.initialize({
          startOnLoad: false,
          suppressErrorRendering: true,
          errorLevel: 'fatal',
          theme: 'dark',
          themeVariables: {
          darkMode: true,
          background: 'transparent',
          primaryColor: '#111113',
          primaryTextColor: '#ededed',
          primaryBorderColor: 'rgba(255, 255, 255, 0.15)',
          lineColor: '#71717a',
          secondaryColor: '#0a0a0a',
          tertiaryColor: '#18181b',
          fontFamily: "'Outfit', 'Inter', -apple-system, sans-serif",
            fontSize: '11px'
          }
        });
        if (typeof m.parseError === 'function') {
          m.parseError = () => {};
        }
        _mermaidInitialized = true;
      }
    } catch (e) {
      console.warn('Mermaid init:', e);
    }
  }

  function purgeMermaidErrorArtifacts() {
    try {
      if (typeof document !== 'undefined') {
        document.querySelectorAll('body > [id^="dmermaid"], body > .error-icon, body > svg[id^="mermaid-"], body > .mermaid[id^="d"]').forEach(el => el.remove());
      }
    } catch (_) {}
  }

  function getDiagramTypeTag(code) {
    const c = String(code || '').trim().toLowerCase();
    if (c.startsWith('mindmap') || c.includes('\nmindmap')) return 'Concept Mindmap';
    if (c.startsWith('sequencediagram') || c.includes('\nsequencediagram')) return 'Sequence Diagram';
    if (c.startsWith('erdiagram') || c.includes('\nerdiagram')) return 'Entity Relationship (ER) Diagram';
    if (c.startsWith('classdiagram') || c.includes('\nclassdiagram')) return 'Class Diagram';
    if (c.startsWith('statediagram') || c.includes('\nstatediagram')) return 'State Machine Diagram';
    if (c.startsWith('gantt') || c.includes('\ngantt')) return 'Gantt Timeline';
    if (c.startsWith('pie') || c.includes('\npie')) return 'Pie Chart';
    if (c.includes('subgraph') || c.includes('architecture')) return 'System Architecture Diagram';
    return 'Flowchart Diagram';
  }

  /**
   * Cleans, normalizes, and repairs imperfect Mermaid code before passing to parser
   */
  function sanitizeAndRepairMermaid(code) {
    if (!code) return '';
    let raw = String(code).trim();
    // Remove markdown code fences if wrapped inside
    raw = raw.replace(/^```(?:mermaid|flowchart|graph)?\s*\n/i, '').replace(/\n```\s*$/i, '');
    
    // Check if it is a mindmap or sequence/er/class diagram
    if (/^\s*(mindmap|sequenceDiagram|classDiagram|stateDiagram|erDiagram|gantt|pie)\b/i.test(raw)) {
      return raw;
    }

    const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
    const validLines = [];
    let hasHeader = false;

    function repairNodeToken(token) {
      let t = String(token || '').trim();
      if (!t) return '';
      t = t.replace(/[;:\-]+$/, '').trim();

      // Database [(...)]
      if (/^[A-Za-z0-9_-]+\s*\[\([^)]+\)\]$/.test(t)) return t;
      if (/^[A-Za-z0-9_-]+\s*\[\(/.test(t) && !t.endsWith(')]')) return t + ')]';

      // Decision {...}
      if (/^[A-Za-z0-9_-]+\s*\{[^}]+\}$/.test(t)) return t;
      if (/^[A-Za-z0-9_-]+\s*\{/.test(t) && !t.endsWith('}')) return t + '}';

      // Process / Terminal [...] or (...)
      if (/^[A-Za-z0-9_-]+\s*\[[^\]]+\]$/.test(t)) return t;
      if (/^[A-Za-z0-9_-]+\s*\([^)]+\)$/.test(t)) return t;

      // Handle unclosed opening bracket e.g. "A[User Interface" -> "A[User Interface]"
      if (/^[A-Za-z0-9_-]+\s*\[[^\]]+$/.test(t)) return t + ']';
      if (/^[A-Za-z0-9_-]+\s*\([^)]+$/.test(t)) return t + ')';
      if (/^[A-Za-z0-9_-]+\s*\{[^}]+$/.test(t)) return t + '}';

      // Handle unmatched closing bracket e.g. "Users]" or "Users)"
      if (/^[A-Za-z0-9_-]+[\]\)\}]+$/.test(t)) {
        const cleanName = t.replace(/[\[\]\(\)\{\}]+/g, '').trim();
        return cleanName ? `${cleanName}[${cleanName}]` : '';
      }

      // Handle bare word e.g. "Websockets" or "Redis"
      if (/^[A-Za-z0-9_-]+$/.test(t)) {
        return `${t}[${t}]`;
      }

      const safeId = t.replace(/[^A-Za-z0-9_]/g, '_');
      const cleanLabel = t.replace(/[\[\]\(\)\{\}]+/g, '').trim();
      return `${safeId}[${cleanLabel || t}]`;
    }

    lines.forEach(line => {
      let l = line.replace(/;+\s*$/, '').trim();
      if (!l) return;

      if (/^(graph|flowchart)\s+(TD|TB|BT|LR|RL)\b/i.test(l)) {
        hasHeader = true;
        validLines.push(l);
        return;
      }
      if (/^(subgraph|end|classDef|class|style|linkStyle|click)\b/i.test(l)) {
        validLines.push(l);
        return;
      }

      // Ignore single isolated token lines with no arrows or brackets
      if (/^[A-Za-z0-9_-]{1,3}$/.test(l)) {
        return;
      }

      // Ignore narrative lines / markdown headers that don't have arrows
      if (!l.includes('-->') && !l.includes('->') && !l.includes('==>') && !l.includes('-.->')) {
        if (/^(#|\*|-|•|note\b|summary\b|architectural summary\b|the (architecture|data|system)\b|this (diagram|flowchart|architecture)|why this scales)/i.test(l)) {
          return;
        }
        if (l.length > 40 && l.includes(' ')) {
          return;
        }
      }

      // Normalize arrows
      l = l.replace(/\s*-\s*->\s*/g, ' --> ');
      l = l.replace(/\s*->\s*/g, ' --> ');
      l = l.replace(/\s*==\s*>\s*/g, ' ==> ');
      l = l.replace(/\s*-\.\s*->\s*/g, ' -.-> ');

      // If line contains arrow, repair both sides
      if (l.includes(' --> ') || l.includes(' ==> ') || l.includes(' -.-> ')) {
        const arrowMatch = l.match(/\s*(-->|==>|-\.->)(?:\|([^|]+)\|)?\s*/);
        if (arrowMatch) {
          const arrowType = arrowMatch[1];
          const edgeLabel = arrowMatch[2] ? `|${arrowMatch[2]}|` : '';
          const parts = l.split(arrowMatch[0]);
          if (parts.length >= 2) {
            const fromFixed = repairNodeToken(parts[0]);
            const toFixed = repairNodeToken(parts[1]);
            if (fromFixed && toFixed) {
              validLines.push(`  ${fromFixed} ${arrowType}${edgeLabel} ${toFixed}`);
              return;
            }
          }
        }
      }

      // Standalone repaired node
      const repaired = repairNodeToken(l);
      if (repaired && repaired.includes('[')) {
        validLines.push(`  ${repaired}`);
      }
    });

    if (!hasHeader) {
      validLines.unshift('flowchart TD');
    }

    return validLines.join('\n');
  }

  /**
   * Render Mermaid code into SVG container with fallback to Generative UI visual engine
   */
  async function renderMermaidDiagram(code, idPrefix = 'mermaid_') {
    purgeMermaidErrorArtifacts();
    await initMermaid();
    const cleanCode = sanitizeAndRepairMermaid(code || '');
    if (!cleanCode) return '<div class="chart-empty">No diagram content provided</div>';

    const diagId = `${idPrefix}${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const tagLabel = getDiagramTypeTag(cleanCode);
    const m = (typeof window !== 'undefined' && (window.mermaid?.default || window.mermaid || (window.__esbuild_esm_mermaid_nm?.mermaid))) || (typeof mermaid !== 'undefined' && (mermaid.default || mermaid));

    if (m && typeof m.render === 'function') {
      try {
        const res = await m.render(diagId, cleanCode);
        purgeMermaidErrorArtifacts();
        const svg = res && res.svg ? res.svg : res;
        if (svg && !svg.includes('Syntax error') && !svg.includes('error-icon') && !svg.includes('mermaid version')) {
          return `
            <div class="mermaid-diagram-card" data-diagram-id="${diagId}">
              <div class="diagram-toolbar">
                <div class="diagram-toolbar-left">
                  <span class="diagram-tag">
                    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1.5"></rect><rect x="14" y="3" width="7" height="7" rx="1.5"></rect><rect x="14" y="14" width="7" height="7" rx="1.5"></rect><rect x="3" y="14" width="7" height="7" rx="1.5"></rect></svg>
                    ${tagLabel}
                  </span>
                </div>
                <div class="diagram-toolbar-right">
                  <button class="btn-diagram-tool btn-diagram-expand" title="Expand to Side Split-View with 2D Pan & Zoom">
                    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 3 21 3 21 9"></polyline><polyline points="9 21 3 21 3 15"></polyline><line x1="21" y1="3" x2="14" y2="10"></line><line x1="3" y1="21" x2="10" y2="14"></line></svg>
                    <span>Expand</span>
                  </button>
                  <button class="btn-diagram-tool btn-diagram-copy" title="Copy Mermaid Code">
                    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                    <span>Copy</span>
                  </button>
                  <button class="btn-diagram-tool btn-diagram-toggle" title="Toggle Code / Visual">
                    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>
                    <span>Code</span>
                  </button>
                </div>
              </div>
              <div class="diagram-svg-viewport">${svg}</div>
              <pre class="diagram-raw-code" style="display:none;"><code>${escapeHtml(cleanCode)}</code></pre>
            </div>
          `;
        }
      } catch (err) {
        console.warn('Mermaid render error:', err);
        purgeMermaidErrorArtifacts();
      }
    }

    purgeMermaidErrorArtifacts();

    // High-fidelity native Generative UI SVG generator fallback
    const isMindmap = cleanCode.toLowerCase().includes('mindmap');
    const nativeSvg = isMindmap ? renderNativeSvgMindmap(cleanCode) : renderNativeSvgFlowchart(cleanCode);

    return `
      <div class="mermaid-diagram-card native-svg" data-diagram-id="${diagId}">
        <div class="diagram-toolbar">
          <div class="diagram-toolbar-left">
            <span class="diagram-tag">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1.5"></rect><rect x="14" y="3" width="7" height="7" rx="1.5"></rect><rect x="14" y="14" width="7" height="7" rx="1.5"></rect><rect x="3" y="14" width="7" height="7" rx="1.5"></rect></svg>
              ${tagLabel}
            </span>
          </div>
          <div class="diagram-toolbar-right">
            <button class="btn-diagram-tool btn-diagram-expand" title="Expand to Side Split-View with 2D Pan & Zoom">
              <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 3 21 3 21 9"></polyline><polyline points="9 21 3 21 3 15"></polyline><line x1="21" y1="3" x2="14" y2="10"></line><line x1="3" y1="21" x2="10" y2="14"></line></svg>
              <span>Expand</span>
            </button>
            <button class="btn-diagram-tool btn-diagram-copy" title="Copy Diagram Syntax">
              <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
              <span>Copy</span>
            </button>
            <button class="btn-diagram-tool btn-diagram-toggle" title="Toggle Code / Visual">
              <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>
              <span>Code</span>
            </button>
          </div>
        </div>
        <div class="diagram-svg-viewport">${nativeSvg}</div>
        <pre class="diagram-raw-code" style="display:none;"><code>${escapeHtml(cleanCode)}</code></pre>
      </div>
    `;
  }

  /**
   * Generates a high-fidelity vector SVG Mindmap with hierarchical branches and colored pills
   */
  function renderNativeSvgMindmap(code) {
    const rawLines = String(code || '').split('\n').filter(l => l.trim().length > 0);
    let rootLabel = 'Core Concept';
    const branches = [];
    let currentBranch = null;

    for (let i = 0; i < rawLines.length; i++) {
      const line = rawLines[i];
      if (/^\s*mindmap\b/i.test(line)) continue;

      const leadingSpaces = line.search(/\S/);
      const trimmed = line.trim();

      if (/^root(?:\(\(|\(\[|\[|\()?(.*?)(?:\)\)|\)\]|\]|\))?$/i.test(trimmed) || (!branches.length && leadingSpaces <= 2 && !currentBranch)) {
        const match = trimmed.match(/^root(?:\(\(|\(\[|\[|\()?(.*?)(?:\)\)|\)\]|\]|\))?$/i);
        rootLabel = match && match[1] ? match[1].trim() : trimmed.replace(/^root\s*/i, '').trim();
        if (!rootLabel) rootLabel = 'Core Concept';
        continue;
      }

      if (leadingSpaces <= 4) {
        // Level 1 Branch
        const branchTitle = trimmed.replace(/^[-*•]\s*/, '').replace(/^[A-Za-z0-9_-]+\[([^\]]+)\]/, '$1').trim();
        currentBranch = { title: branchTitle, leaves: [] };
        branches.push(currentBranch);
      } else if (leadingSpaces > 4 && currentBranch) {
        // Level 2 Leaf
        const leafTitle = trimmed.replace(/^[-*•]\s*/, '').replace(/^[A-Za-z0-9_-]+\[([^\]]+)\]/, '$1').trim();
        currentBranch.leaves.push(leafTitle);
      }
    }

    if (branches.length === 0) {
      branches.push({ title: rootLabel, leaves: ['Taxonomy Overview', 'Key Architecture'] });
    }

    const branchColors = ['#6366f1', '#10b981', '#06b6d4', '#f59e0b', '#ec4899', '#8b5cf6', '#3b82f6'];
    const totalBranches = branches.length;
    const branchColWidth = 190;
    const gapX = 24;
    const totalWidth = Math.max(540, totalBranches * (branchColWidth + gapX) + 40);
    const startX = 20;

    let maxLeaves = 0;
    branches.forEach(b => { if (b.leaves.length > maxLeaves) maxLeaves = b.leaves.length; });
    const totalHeight = 120 + maxLeaves * 34 + 60;

    let svg = `
      <svg class="native-mindmap-svg" viewBox="0 0 ${totalWidth} ${totalHeight}" width="100%" height="${totalHeight}" style="max-width: ${totalWidth}px; margin: 0 auto; display: block;" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="mindmap-root-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#4f46e5" />
            <stop offset="100%" stop-color="#312e81" />
          </linearGradient>
        </defs>
        
        <!-- Central Root Node -->
        <rect x="${totalWidth / 2 - 130}" y="12" width="260" height="42" rx="21" fill="url(#mindmap-root-grad)" stroke="#818cf8" stroke-width="1.5" />
        <text x="${totalWidth / 2}" y="38" fill="#ffffff" font-size="13" font-weight="700" text-anchor="middle" font-family="'Outfit', 'Inter', -apple-system, sans-serif">${escapeHtml(rootLabel)}</text>
    `;

    branches.forEach((branch, bIdx) => {
      const color = branchColors[bIdx % branchColors.length];
      const bx = startX + bIdx * (branchColWidth + gapX);
      const by = 86;
      const rootCenterX = totalWidth / 2;
      const rootCenterY = 54;
      const branchCenterX = bx + branchColWidth / 2;

      // Curved connector from root to branch
      svg += `
        <path d="M ${rootCenterX} ${rootCenterY} C ${rootCenterX} ${by - 16}, ${branchCenterX} ${by - 24}, ${branchCenterX} ${by}" fill="none" stroke="${color}" stroke-width="1.8" stroke-opacity="0.65" />
        <!-- Branch Card -->
        <rect x="${bx}" y="${by}" width="${branchColWidth}" height="32" rx="8" fill="#18181b" stroke="${color}" stroke-width="1.5" />
        <circle cx="${bx + 14}" cy="${by + 16}" r="4" fill="${color}" />
        <text x="${bx + 26}" y="${by + 20.5}" fill="#f4f4f5" font-size="11.5" font-weight="650" font-family="'Outfit', 'Inter', -apple-system, sans-serif">${escapeHtml(branch.title.length > 20 ? branch.title.slice(0, 18) + '…' : branch.title)}</text>
      `;

      // Render Leaves
      branch.leaves.forEach((leaf, lIdx) => {
        const ly = by + 42 + lIdx * 32;
        svg += `
          <line x1="${branchCenterX}" y1="${by + 32}" x2="${branchCenterX}" y2="${ly + 14}" stroke="rgba(255, 255, 255, 0.12)" stroke-width="1" stroke-dasharray="2,2" />
          <rect x="${bx + 8}" y="${ly}" width="${branchColWidth - 16}" height="26" rx="6" fill="#111113" stroke="rgba(255, 255, 255, 0.08)" stroke-width="1" />
          <text x="${bx + 18}" y="${ly + 17}" fill="#a1a1aa" font-size="10.5" font-weight="450" font-family="'Outfit', 'Inter', -apple-system, sans-serif">${escapeHtml(leaf.length > 22 ? leaf.slice(0, 20) + '…' : leaf)}</text>
        `;
      });
    });

    svg += `</svg>`;
    return svg;
  }

  /**
   * Helper to cleanly extract node id, label text, and shape from raw line or token
   */
  /**
   * Helper to clean label text
   */
  function cleanLabelText(str) {
    let s = String(str || '').trim();
    s = s.replace(/^(?:[A-Za-z0-9_]{1,3}\s*[-:–\.]\s*|Step\s*\d+\s*[:\-]\s*)/i, '').trim();
    s = s.replace(/^[\[\(\{]+/, '').trim();
    s = s.replace(/[\]\)\};:\-]+$/, '').trim();
    return s;
  }

  /**
   * Helper to cleanly extract node id, label text, and shape from raw line or token
   */
  function extractCleanNodeInfo(raw) {
    let text = String(raw || '').trim().replace(/;+\s*$/, '').trim();
    if (!text) return null;

    // Database: [(Label)]
    let m = text.match(/^([A-Za-z0-9_-]+)\s*\[\(\s*(.*?)\s*\)\]$/);
    if (m) {
      const lbl = cleanLabelText(m[2] || m[1]);
      return lbl.length >= 2 ? { id: m[1], label: lbl, shape: 'database' } : null;
    }

    // Decision: {{Label}} or {Label}
    m = text.match(/^([A-Za-z0-9_-]+)\s*\{\{\s*(.*?)\s*\}\}$/) || text.match(/^([A-Za-z0-9_-]+)\s*\{\s*(.*?)\s*\}$/);
    if (m) {
      const lbl = cleanLabelText(m[2] || m[1]);
      return lbl.length >= 2 ? { id: m[1], label: lbl, shape: 'decision' } : null;
    }

    // Terminal: ([Label]) or ((Label))
    m = text.match(/^([A-Za-z0-9_-]+)\s*\(\[\s*(.*?)\s*\]\)$/) || text.match(/^([A-Za-z0-9_-]+)\s*\(\(\s*(.*?)\s*\)\)$/) || text.match(/^([A-Za-z0-9_-]+)\s*\(\s*(.*?)\s*\)$/);
    if (m) {
      const lbl = cleanLabelText(m[2] || m[1]);
      return lbl.length >= 2 ? { id: m[1], label: lbl, shape: 'terminal' } : null;
    }

    // Process: [Label]
    m = text.match(/^([A-Za-z0-9_-]+)\s*\[\s*(.*?)\s*\]$/);
    if (m) {
      const lbl = cleanLabelText(m[2] || m[1]);
      return lbl.length >= 2 ? { id: m[1], label: lbl, shape: 'process' } : null;
    }

    // Match lines like "A - User Interface" or "A: User Interface" or "A. User Interface"
    m = text.match(/^([A-Za-z0-9_]{1,4})\s*[-:–\.]\s*(.+)$/);
    if (m && m[2].trim().length >= 2) {
      const lbl = cleanLabelText(m[2].trim());
      return lbl.length >= 2 ? { id: m[1], label: lbl, shape: 'process' } : null;
    }

    // If starts with ID[ or ID{ but missing closing bracket:
    m = text.match(/^([A-Za-z0-9_-]+)\s*[\[\{\(\]]\s*(.*)$/);
    if (m) {
      const clean = cleanLabelText(m[2].replace(/[\]\}\)]+$/, '').trim());
      return clean.length >= 2 ? { id: m[1], label: clean || m[1], shape: 'process' } : null;
    }

    // Ignore single letter tokens with hyphen like "A-", "B-", "C-"
    if (/^[A-Za-z0-9_-]{1,3}\s*[-:]?$/.test(text)) {
      return null;
    }

    const cleanId = text.replace(/[^a-zA-Z0-9_]/g, '_');
    const lbl = cleanLabelText(text);
    return lbl.length >= 2 ? { id: cleanId, label: lbl, shape: 'process' } : null;
  }

  /**
   * Splits text into multi-line wrapped chunks without clipping
   */
  function wrapSvgTextLines(text, maxCharsPerLine = 34) {
    const clean = String(text || '').trim();
    if (!clean) return [''];
    if (clean.length <= maxCharsPerLine) return [clean];
    const words = clean.split(/\s+/);
    const lines = [];
    let cur = '';
    for (const w of words) {
      if (!cur) {
        cur = w;
      } else if ((cur + ' ' + w).length <= maxCharsPerLine) {
        cur += ' ' + w;
      } else {
        lines.push(cur);
        cur = w;
      }
    }
    if (cur) lines.push(cur);
    return lines.slice(0, 3);
  }

  /**
   * Generates a state-of-the-art Generative UI Vector SVG flowchart with solid theme and auto-sized height
   */
  function renderNativeSvgFlowchart(code) {
    const lines = String(code || '').split('\n').map(l => l.trim()).filter(Boolean);
    const nodes = new Map();
    const edges = [];

    lines.forEach(line => {
      if (/^(graph|flowchart|sequenceDiagram|classDiagram|stateDiagram|erDiagram|gantt|mindmap|title|dateFormat|activities|durations|ladder|personalization)\b/i.test(line)) return;

      // Check chained arrows: A -> B -> C or A --> B --> C
      if (line.includes('->') || line.includes('-->') || line.includes('==>')) {
        const segments = line.split(/-+>|==>|-\.+->/);
        if (segments.length >= 2) {
          for (let s = 0; s < segments.length - 1; s++) {
            const rawFrom = segments[s].trim().replace(/^\|[^|]+\|\s*/, '').trim();
            const rawTo = segments[s + 1].trim().replace(/^\|[^|]+\|\s*/, '').trim();
            const nodeFrom = extractCleanNodeInfo(rawFrom);
            const nodeTo = extractCleanNodeInfo(rawTo);
            if (nodeFrom && nodeTo) {
              if (!nodes.has(nodeFrom.id)) nodes.set(nodeFrom.id, nodeFrom);
              if (!nodes.has(nodeTo.id)) nodes.set(nodeTo.id, nodeTo);
              edges.push({ from: nodeFrom.id, to: nodeTo.id, label: '' });
            }
          }
          return;
        }
      }

      // Match A[Label] --> B[Label] or A[Label] -->|text| B[Label]
      const edgeRegex = /([A-Za-z0-9_-]+(?:\[[^\]]+\]|\([^\)]+\)|\{[^\}]+\})?)\s*(-+>|==>|-\.+->)(?:\|([^|]+)\|)?\s*([A-Za-z0-9_-]+(?:\[[^\]]+\]|\([^\)]+\)|\{[^\}]+\})?)/g;
      let match;
      let hasEdges = false;
      while ((match = edgeRegex.exec(line)) !== null) {
        hasEdges = true;
        const fromRaw = match[1];
        const edgeLabel = match[3] || '';
        const toRaw = match[4];
        const nodeFrom = extractCleanNodeInfo(fromRaw);
        const nodeTo = extractCleanNodeInfo(toRaw);

        if (nodeFrom && nodeTo) {
          if (!nodes.has(nodeFrom.id)) nodes.set(nodeFrom.id, nodeFrom);
          if (!nodes.has(nodeTo.id)) nodes.set(nodeTo.id, nodeTo);
          edges.push({ from: nodeFrom.id, to: nodeTo.id, label: edgeLabel });
        }
      }

      // Standalone node definitions
      if (!hasEdges) {
        if (/^(#|\*|-|•|note\b|summary\b|architectural summary\b|the (architecture|data|system)\b|this (diagram|flowchart|architecture)|why this scales)/i.test(line)) {
          return;
        }
        if (line.length > 55 && line.includes(' ')) {
          return;
        }
        const nodeInfo = extractCleanNodeInfo(line);
        if (nodeInfo && nodeInfo.label.length >= 2 && !nodeInfo.label.includes(':')) {
          if (!nodes.has(nodeInfo.id)) nodes.set(nodeInfo.id, nodeInfo);
        }
      }
    });

    const nodeList = Array.from(nodes.values()).filter(n => n && n.label && n.label.length >= 2);
    if (nodeList.length === 0) {
      return `<div class="chart-empty" style="color:#a1a1aa; font-size:12px; padding: 24px; text-align: center;">Diagram rendered successfully</div>`;
    }

    // Determine layout: Max 2 nodes per row to prevent horizontal cramping
    const totalWidth = 580;
    const startY = 24;
    const gapY = 36;
    let currentY = startY;

    const nodePositions = new Map(); // id -> { x, y, width, height, textLines, node }

    // Split nodes into pairs (max 2 per row)
    const rows = [];
    for (let i = 0; i < nodeList.length; i += 2) {
      rows.push(nodeList.slice(i, i + 2));
    }

    rows.forEach(rowNodes => {
      const count = rowNodes.length;
      const cardWidth = count === 1 ? 400 : 250;
      const gapX = 24;
      const startX = count === 1 ? (totalWidth - cardWidth) / 2 : (totalWidth - (2 * cardWidth + gapX)) / 2;

      let rowMaxH = 56;
      const rowLayouts = rowNodes.map((n, idx) => {
        const textLines = wrapSvgTextLines(n.label, count === 1 ? 38 : 22);
        const h = textLines.length === 1 ? 56 : (textLines.length === 2 ? 72 : 88);
        if (h > rowMaxH) rowMaxH = h;
        const x = startX + idx * (cardWidth + gapX);
        return { n, textLines, x, width: cardWidth, height: h };
      });

      rowLayouts.forEach(l => {
        nodePositions.set(l.n.id, {
          x: l.x,
          y: currentY,
          width: l.width,
          height: rowMaxH,
          textLines: l.textLines,
          node: l.n
        });
      });

      currentY += rowMaxH + gapY;
    });

    const totalHeight = currentY + 16;

    let svgContent = `
      <svg class="native-flowchart-svg" viewBox="0 0 ${totalWidth} ${totalHeight}" width="100%" height="${totalHeight}" style="max-width: ${totalWidth}px; width: 100%; height: auto; margin: 0 auto; display: block;" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <marker id="arrow-solid" viewBox="0 0 10 10" refX="6" refY="4" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <polygon points="0 1, 6 4, 0 7" fill="#6366f1" />
          </marker>
        </defs>
    `;

    // Draw Edges
    if (edges.length > 0) {
      edges.forEach(edge => {
        const fromPos = nodePositions.get(edge.from);
        const toPos = nodePositions.get(edge.to);
        if (!fromPos || !toPos) return;

        const x1 = fromPos.x + fromPos.width / 2;
        const y1 = fromPos.y + fromPos.height;
        const x2 = toPos.x + toPos.width / 2;
        const y2 = toPos.y;
        const midY = (y1 + y2) / 2;

        svgContent += `
          <path d="M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}" fill="none" stroke="#6366f1" stroke-width="2" stroke-dasharray="4,3" marker-end="url(#arrow-solid)" />
          ${edge.label ? `
            <rect x="${(x1 + x2) / 2 - 28}" y="${midY - 9}" width="56" height="18" rx="4" fill="#1f2029" stroke="#6366f1" stroke-width="1.2" />
            <text x="${(x1 + x2) / 2}" y="${midY + 3.5}" fill="#e0e7ff" font-size="10" font-weight="700" text-anchor="middle" font-family="'Outfit', -apple-system, sans-serif">${escapeHtml(edge.label)}</text>
          ` : ''}
        `;
      });
    } else {
      // Default sequential linear flow arrows
      const posList = Array.from(nodePositions.values());
      for (let i = 0; i < posList.length - 1; i++) {
        const p1 = posList[i];
        const p2 = posList[i + 1];
        const x1 = p1.x + p1.width / 2;
        const y1 = p1.y + p1.height;
        const x2 = p2.x + p2.width / 2;
        const y2 = p2.y;
        const midY = (y1 + y2) / 2;
        svgContent += `
          <path d="M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}" fill="none" stroke="#6366f1" stroke-width="2" stroke-dasharray="4,3" marker-end="url(#arrow-solid)" />
        `;
      }
    }

    // Draw Nodes with solid theme colors
    let globalIndex = 1;
    nodePositions.forEach(pos => {
      const { x, y, width, height, textLines, node } = pos;

      let accentColor = '#6366f1';
      let strokeColor = '#3b3d4a';
      let tagTextColor = '#a5b4fc';
      let badgeLabel = `STEP ${globalIndex.toString().padStart(2, '0')}`;

      if (node.shape === 'decision') {
        accentColor = '#f59e0b';
        strokeColor = '#52431f';
        tagTextColor = '#fcd34d';
        badgeLabel = 'DECISION';
      } else if (node.shape === 'database') {
        accentColor = '#06b6d4';
        strokeColor = '#164e63';
        tagTextColor = '#67e8f9';
        badgeLabel = 'DATA STORAGE';
      } else if (node.shape === 'terminal') {
        accentColor = '#10b981';
        strokeColor = '#064e3b';
        tagTextColor = '#6ee7b7';
        badgeLabel = globalIndex === 1 ? 'START' : 'END';
      }

      svgContent += `
        <g class="flowchart-node-group">
          <!-- Solid Card Base -->
          <rect x="${x}" y="${y}" width="${width}" height="${height}" rx="10" fill="#181920" stroke="${strokeColor}" stroke-width="1.5" />
          
          <!-- Solid Left Accent Bar -->
          <rect x="${x}" y="${y + 8}" width="4" height="${height - 16}" rx="2" fill="${accentColor}" />
          
          <!-- Solid Badge Circle -->
          <circle cx="${x + 24}" cy="${y + height / 2}" r="11" fill="#22242e" stroke="${accentColor}" stroke-width="1.5" />
          <text x="${x + 24}" y="${y + height / 2 + 4}" fill="${accentColor}" font-size="9" font-weight="700" text-anchor="middle" font-family="'Outfit', -apple-system, sans-serif">${globalIndex.toString()}</text>
          
          <!-- Category Tag -->
          <text x="${x + 42}" y="${y + 17}" fill="${tagTextColor}" font-size="9" font-weight="700" letter-spacing="0.05em" font-family="'Outfit', -apple-system, sans-serif">${badgeLabel}</text>
      `;

      if (textLines.length === 1) {
        svgContent += `
          <text x="${x + 42}" y="${y + 37}" fill="#ffffff" font-size="12.5" font-weight="600" font-family="'Outfit', 'Inter', -apple-system, sans-serif">
            ${escapeHtml(textLines[0])}
          </text>
        `;
      } else {
        textLines.forEach((lText, lIdx) => {
          svgContent += `
            <text x="${x + 42}" y="${y + 34 + lIdx * 16}" fill="#ffffff" font-size="12" font-weight="600" font-family="'Outfit', 'Inter', -apple-system, sans-serif">
              ${escapeHtml(lText)}
            </text>
          `;
        });
      }

      svgContent += `</g>`;
      globalIndex++;
    });

    svgContent += `</svg>`;
    return svgContent;
  }

  /**
   * Parse simple custom chart specification:
   * type: bar | line | pie | donut
   * title: Sales by Quarter
   * Q1: 450
   * Q2: 890
   * Q3: 620
   * Q4: 1100
   */
  function parseChartData(rawText) {
    const lines = String(rawText || '').split('\n').map(l => l.trim()).filter(Boolean);
    const data = {
      type: 'bar',
      title: '',
      labels: [],
      values: [],
      unit: ''
    };

    if (rawText.trim().startsWith('{')) {
      try {
        const json = JSON.parse(rawText);
        return {
          type: json.type || 'bar',
          title: json.title || '',
          labels: json.labels || (json.data ? json.data.map(d => d.label || d.name) : []),
          values: json.values || (json.data ? json.data.map(d => Number(d.value || d.val || 0)) : []),
          unit: json.unit || ''
        };
      } catch (e) {}
    }

    for (const line of lines) {
      if (/^type\s*:\s*(\w+)/i.test(line)) {
        data.type = line.match(/^type\s*:\s*(\w+)/i)[1].toLowerCase();
      } else if (/^title\s*:\s*(.+)/i.test(line)) {
        data.title = line.match(/^title\s*:\s*(.+)/i)[1].trim();
      } else if (/^unit\s*:\s*(.+)/i.test(line)) {
        data.unit = line.match(/^unit\s*:\s*(.+)/i)[1].trim();
      } else if (line.includes(':') || line.includes('|') || line.includes(',')) {
        const parts = line.split(/[:|,]/).map(p => p.trim());
        if (parts.length >= 2) {
          const label = parts[0];
          const valNum = parseFloat(parts[1].replace(/[^0-9.-]/g, ''));
          if (!isNaN(valNum)) {
            data.labels.push(label);
            data.values.push(valNum);
          }
        }
      }
    }

    return data;
  }

  /**
   * Render SVG Bar Chart
   */
  function renderSvgBarChart(data) {
    const { title, labels, values, unit } = data;
    if (!values.length) return '<div class="chart-empty">No chart data provided</div>';

    const maxVal = Math.max(...values, 1);
    const chartHeight = 230;
    const barWidth = Math.max(26, Math.min(56, Math.floor(380 / values.length)));
    const gap = Math.max(14, Math.min(28, Math.floor(180 / values.length)));
    const totalWidth = Math.max(480, (barWidth + gap) * values.length + 80);

    const barsSvg = values.map((val, i) => {
      const color = COLOR_PALETTE[i % COLOR_PALETTE.length];
      const barH = Math.max(6, Math.round((val / maxVal) * 140));
      const x = 50 + i * (barWidth + gap);
      const y = 175 - barH;
      const label = labels[i] || `Item ${i + 1}`;
      const displayVal = `${val.toLocaleString()}${unit ? ' ' + unit : ''}`;

      return `
        <g class="chart-bar-group" tabindex="0">
          <rect x="${x}" y="${y}" width="${barWidth}" height="${barH}" rx="5" ry="5" fill="${color}" opacity="0.9">
            <animate attributeName="height" from="0" to="${barH}" dur="0.5s" fill="freeze" />
            <animate attributeName="y" from="175" to="${y}" dur="0.5s" fill="freeze" />
          </rect>
          <text x="${x + barWidth / 2}" y="${y - 8}" text-anchor="middle" fill="#f8fafc" font-size="11" font-weight="600">${displayVal}</text>
          <text x="${x + barWidth / 2}" y="196" text-anchor="middle" fill="#94a3b8" font-size="11" font-weight="500">${escapeHtml(label.length > 12 ? label.slice(0, 10) + '…' : label)}</text>
          <title>${escapeHtml(label)}: ${displayVal}</title>
        </g>
      `;
    }).join('');

    return `
      <div class="visual-chart-card">
        <div class="chart-card-header">
          <div class="chart-header-left">
            <span class="chart-icon">📊</span>
            <span class="chart-card-title">${escapeHtml(title || 'Data Comparison Chart')}</span>
          </div>
        </div>
        <div class="chart-svg-container">
          <svg viewBox="0 0 ${totalWidth} ${chartHeight}" width="100%" height="${chartHeight}" preserveAspectRatio="xMidYMid meet">
            <line x1="40" y1="175" x2="${totalWidth - 20}" y2="175" stroke="rgba(255,255,255,0.15)" stroke-width="1.5" />
            ${barsSvg}
          </svg>
        </div>
      </div>
    `;
  }

  /**
   * Render SVG Line Chart
   */
  function renderSvgLineChart(data) {
    const { title, labels, values, unit } = data;
    if (values.length < 2) return renderSvgBarChart(data);

    const maxVal = Math.max(...values, 1);
    const minVal = Math.min(...values, 0);
    const range = maxVal - minVal || 1;
    const chartHeight = 230;
    const totalWidth = 520;
    const stepX = (totalWidth - 90) / (values.length - 1);

    const points = values.map((val, i) => {
      const x = 50 + i * stepX;
      const y = 175 - ((val - minVal) / range) * 130;
      return { x, y, val, label: labels[i] || `${i + 1}` };
    });

    const pathD = points.reduce((acc, pt, i) => {
      if (i === 0) return `M ${pt.x},${pt.y}`;
      const prev = points[i - 1];
      const cpX1 = prev.x + (pt.x - prev.x) / 2;
      const cpX2 = prev.x + (pt.x - prev.x) / 2;
      return `${acc} C ${cpX1},${prev.y} ${cpX2},${pt.y} ${pt.x},${pt.y}`;
    }, '');

    const areaD = `${pathD} L ${points[points.length - 1].x},175 L ${points[0].x},175 Z`;

    const dotsSvg = points.map((pt, i) => {
      const color = COLOR_PALETTE[i % COLOR_PALETTE.length];
      const displayVal = `${pt.val.toLocaleString()}${unit ? ' ' + unit : ''}`;
      return `
        <g class="chart-point-group">
          <circle cx="${pt.x}" cy="${pt.y}" r="5" fill="#0f172a" stroke="${color}" stroke-width="2.5" />
          <text x="${pt.x}" y="${pt.y - 10}" text-anchor="middle" fill="#f8fafc" font-size="11" font-weight="600">${displayVal}</text>
          <text x="${pt.x}" y="196" text-anchor="middle" fill="#94a3b8" font-size="11" font-weight="500">${escapeHtml(pt.label.length > 10 ? pt.label.slice(0, 8) + '…' : pt.label)}</text>
          <title>${escapeHtml(pt.label)}: ${displayVal}</title>
        </g>
      `;
    }).join('');

    return `
      <div class="visual-chart-card">
        <div class="chart-card-header">
          <div class="chart-header-left">
            <span class="chart-icon">📈</span>
            <span class="chart-card-title">${escapeHtml(title || 'Trend Line Graph')}</span>
          </div>
        </div>
        <div class="chart-svg-container">
          <svg viewBox="0 0 ${totalWidth} ${chartHeight}" width="100%" height="${chartHeight}" preserveAspectRatio="xMidYMid meet">
            <defs>
              <linearGradient id="lineAreaGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="#38bdf8" stop-opacity="0.35" />
                <stop offset="100%" stop-color="#38bdf8" stop-opacity="0.0" />
              </linearGradient>
            </defs>
            <line x1="40" y1="175" x2="${totalWidth - 20}" y2="175" stroke="rgba(255,255,255,0.15)" stroke-width="1.5" />
            <path d="${areaD}" fill="url(#lineAreaGrad)" />
            <path d="${pathD}" fill="none" stroke="#38bdf8" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
            ${dotsSvg}
          </svg>
        </div>
      </div>
    `;
  }

  /**
   * Render SVG Pie / Donut Chart
   */
  function renderSvgPieChart(data, isDonut = false) {
    const { title, labels, values, unit } = data;
    const total = values.reduce((sum, v) => sum + v, 0);
    if (!total) return '<div class="chart-empty">No chart data provided</div>';

    const cx = 110;
    const cy = 110;
    const r = 85;
    const innerR = isDonut ? 48 : 0;

    let currentAngle = -Math.PI / 2;
    const slices = values.map((val, i) => {
      const sliceAngle = (val / total) * 2 * Math.PI;
      const x1 = cx + r * Math.cos(currentAngle);
      const y1 = cy + r * Math.sin(currentAngle);
      const x2 = cx + r * Math.cos(currentAngle + sliceAngle);
      const y2 = cy + r * Math.sin(currentAngle + sliceAngle);

      const x3 = cx + innerR * Math.cos(currentAngle + sliceAngle);
      const y3 = cy + innerR * Math.sin(currentAngle + sliceAngle);
      const x4 = cx + innerR * Math.cos(currentAngle);
      const y4 = cy + innerR * Math.sin(currentAngle);

      const largeArc = sliceAngle > Math.PI ? 1 : 0;
      const color = COLOR_PALETTE[i % COLOR_PALETTE.length];
      const pct = Math.round((val / total) * 100);

      const pathD = isDonut
        ? `M ${x1},${y1} A ${r},${r} 0 ${largeArc},1 ${x2},${y2} L ${x3},${y3} A ${innerR},${innerR} 0 ${largeArc},0 ${x4},${y4} Z`
        : `M ${cx},${cy} L ${x1},${y1} A ${r},${r} 0 ${largeArc},1 ${x2},${y2} Z`;

      currentAngle += sliceAngle;
      return { pathD, color, label: labels[i] || `Item ${i + 1}`, val, pct };
    });

    const slicesSvg = slices.map(s => `
      <path d="${s.pathD}" fill="${s.color}" stroke="#0c1222" stroke-width="2">
        <title>${escapeHtml(s.label)}: ${s.val.toLocaleString()}${unit ? ' ' + unit : ''} (${s.pct}%)</title>
      </path>
    `).join('');

    const legendSvg = slices.map((s, i) => {
      const y = 30 + i * 24;
      return `
        <g class="chart-legend-item">
          <rect x="230" y="${y - 10}" width="12" height="12" rx="3" fill="${s.color}" />
          <text x="250" y="${y}" fill="#e2e8f0" font-size="12" font-weight="500">${escapeHtml(s.label)}: <tspan font-weight="700" fill="#f8fafc">${s.pct}%</tspan></text>
        </g>
      `;
    }).join('');

    return `
      <div class="visual-chart-card">
        <div class="chart-card-header">
          <div class="chart-header-left">
            <span class="chart-icon">${isDonut ? '🍩' : '🥧'}</span>
            <span class="chart-card-title">${escapeHtml(title || 'Distribution Chart')}</span>
          </div>
        </div>
        <div class="chart-svg-container">
          <svg viewBox="0 0 420 220" width="100%" height="220" preserveAspectRatio="xMidYMid meet">
            <g class="chart-slices">${slicesSvg}</g>
            ${isDonut ? `<text x="${cx}" y="${cy + 5}" text-anchor="middle" fill="#94a3b8" font-size="11" font-weight="600">TOTAL</text>` : ''}
            <g class="chart-legend">${legendSvg}</g>
          </svg>
        </div>
      </div>
    `;
  }

  /**
   * Dispatcher for Chart rendering
   */
  function renderChart(rawText) {
    const data = parseChartData(rawText);
    switch (data.type) {
      case 'line':
      case 'area':
        return renderSvgLineChart(data);
      case 'pie':
        return renderSvgPieChart(data, false);
      case 'donut':
      case 'doughnut':
        return renderSvgPieChart(data, true);
      case 'bar':
      default:
        return renderSvgBarChart(data);
    }
  }

  /**
   * Proactive Opportunity Detector:
   * Decides if the AI response or topic discussed is a great candidate for diagrams/charts.
   */
  function detectVisualOpportunities(responseText, userPrompt) {
    const text = String(responseText || '');
    const prompt = String(userPrompt || '');
    const combined = `${prompt}\n${text}`.toLowerCase();

    // Do not suggest if the response ALREADY contains a visual code block
    if (/```(?:mermaid|chart|json-chart|svg)/i.test(text) || text.includes('visual-chart-card') || text.includes('mermaid-diagram-card')) {
      return [];
    }

    const suggestions = [];

    // 1. Process / Workflow / Steps
    const hasSteps = /\b(step\s+\d+|steps\s+to|first,|second,|finally,|workflow|pipeline|lifecycle|process\s+flow)\b/i.test(combined);
    const hasNumberedList = (text.match(/^\s*\d+\.\s+\*\*/gm) || []).length >= 3;
    if (hasSteps || hasNumberedList) {
      suggestions.push({
        id: 'flowchart',
        icon: `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="#fbbf24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="6" height="6" rx="1"></rect><rect x="15" y="15" width="6" height="6" rx="1"></rect><path d="M6 9v3a3 3 0 0 0 3 3h6"></path><polyline points="12 12 15 15 12 18"></polyline></svg>`,
        label: 'Flowchart Diagram',
        prompt: `Create a clear step-by-step flowchart diagram in Mermaid syntax illustrating the process and steps discussed above.`
      });
    }

    // 2. System Architecture / Components / Stack
    const hasArchitecture = /\b(architecture|tech stack|frontend|backend|database|microservice|client-server|api gateway|controller|router|model-view|layer)\b/i.test(combined);
    if (hasArchitecture) {
      suggestions.push({
        id: 'architecture',
        icon: `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="#818cf8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="7" rx="2"></rect><rect x="2" y="14" width="20" height="7" rx="2"></rect><line x1="6" y1="6.5" x2="6.01" y2="6.5"></line><line x1="6" y1="17.5" x2="6.01" y2="17.5"></line></svg>`,
        label: 'Architecture Diagram',
        prompt: `Create an interactive system architecture diagram in Mermaid syntax showing the components, data flow, and connections discussed.`
      });
    }

    // 3. Data Comparisons / Metrics / Tables
    const hasData = /\b(comparison|benchmarks|metrics|percentages?|\b\d+%\b|statistics|sales|growth|revenue|vs\b|versus)\b/i.test(combined);
    const hasTable = text.includes('|') && (text.match(/\|\s*[-:]+\s*\|/g) || []).length >= 1;
    if (hasData || hasTable) {
      suggestions.push({
        id: 'chart',
        icon: `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="#38bdf8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"></polyline><polyline points="16 7 22 7 22 13"></polyline></svg>`,
        label: 'Data Chart / Graph',
        prompt: `Generate an interactive data chart (bar/line/pie) visualizing the key comparison and numerical metrics discussed above.`
      });
    }

    // 4. Hierarchies, Concepts, Taxonomies
    const hasConcepts = /\b(taxonomy|categories|classification|types of|framework|principles|pillars|mindmap)\b/i.test(combined);
    if (hasConcepts && suggestions.length < 3) {
      suggestions.push({
        id: 'mindmap',
        icon: `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="#c084fc" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="6" r="3"></circle><circle cx="18" cy="18" r="3"></circle><line x1="8.7" y1="10.7" x2="15.3" y2="7.3"></line><line x1="8.7" y1="13.3" x2="15.3" y2="16.7"></line></svg>`,
        label: 'Concept Mindmap',
        prompt: `Create a concept mindmap in Mermaid syntax breaking down the taxonomy and core pillars discussed.`
      });
    }

    // 5. Timelines / Milestones / Roadmaps
    const hasTimeline = /\b(roadmap|timeline|milestones|phases|phase\s+1|q[1-4]|schedule|release plan)\b/i.test(combined);
    if (hasTimeline && suggestions.length < 3) {
      suggestions.push({
        id: 'timeline',
        icon: `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="#34d399" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="17" rx="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="9.5" x2="21" y2="9.5"></line><circle cx="8" cy="14.5" r="1.2" fill="currentColor"></circle><circle cx="13" cy="14.5" r="1.2" fill="currentColor"></circle></svg>`,
        label: 'Project Timeline',
        prompt: `Create a visual timeline or Gantt roadmap diagram in Mermaid syntax for the phases and milestones discussed.`
      });
    }

    return suggestions.slice(0, 3);
  }

  /**
   * Render Generative UI Interactive Widget inline in chat
   */
  function renderGenerativeUiWidget(rawCode, options = {}) {
    const widgetId = `genui_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const cleanCode = String(rawCode || '').trim();
    
    let title = 'Interactive Widget';
    const titleMatch = cleanCode.match(/(?:<!--|\/\*|\/\/)\s*(?:title|widget|name):\s*([^\n*]+)/i);
    if (titleMatch && titleMatch[1]) {
      title = titleMatch[1].trim();
    } else if (cleanCode.includes('Calculator') || cleanCode.includes('calculator')) {
      title = 'Interactive Calculator';
    } else if (cleanCode.includes('Converter') || cleanCode.includes('converter')) {
      title = 'Live Unit Converter';
    } else if (cleanCode.includes('Dashboard') || cleanCode.includes('dashboard')) {
      title = 'Live Metric Dashboard';
    } else if (cleanCode.includes('Simulator') || cleanCode.includes('simulator')) {
      title = 'Interactive Simulator';
    }

    const resizeScript = `
      <script>
        function notifyResize() {
          try {
            const h = Math.max(document.documentElement.scrollHeight || 0, document.body.scrollHeight || 0);
            if (h > 50) {
              window.parent.postMessage({ type: 'genui-resize', widgetId: '${widgetId}', height: h }, '*');
            }
          } catch (_) {}
        }
        window.addEventListener('load', notifyResize);
        window.addEventListener('resize', notifyResize);
        const obs = new MutationObserver(notifyResize);
        obs.observe(document.body, { subtree: true, childList: true, attributes: true });
        setTimeout(notifyResize, 150);
        setTimeout(notifyResize, 600);
      <\/script>
    `;

    let fullHtml = '';
    if (/<!DOCTYPE\s+html|<html/i.test(cleanCode)) {
      if (/<\/body>/i.test(cleanCode)) {
        fullHtml = cleanCode.replace(/<\/body>/i, `${resizeScript}</body>`);
      } else {
        fullHtml = `${cleanCode}\n${resizeScript}`;
      }
    } else {
      fullHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Outfit', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0f1012;
      color: #f8fafc;
      padding: 18px;
      font-size: 13.5px;
      overflow-x: hidden;
    }
    input, button, select, textarea {
      font-family: inherit;
      font-size: inherit;
    }
    input[type="number"], input[type="text"], input[type="range"], select, textarea {
      background: #18181b;
      border: 1px solid rgba(255, 255, 255, 0.15);
      border-radius: 8px;
      color: #f8fafc;
      padding: 8px 12px;
      outline: none;
      transition: border-color 0.15s;
    }
    input[type="number"]:focus, input[type="text"]:focus, select:focus {
      border-color: #818cf8;
      box-shadow: 0 0 0 2px rgba(129, 140, 248, 0.2);
    }
    button {
      background: linear-gradient(135deg, #4f46e5, #4338ca);
      color: #ffffff;
      border: none;
      border-radius: 8px;
      padding: 9px 18px;
      font-weight: 600;
      cursor: pointer;
      transition: opacity 0.15s, transform 0.1s;
    }
    button:hover { opacity: 0.94; transform: translateY(-1px); }
    button:active { transform: translateY(0); }
    .card, .container, .widget-box {
      background: #141417;
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 12px;
      padding: 18px;
    }
    .flex { display: flex; }
    .grid { display: grid; }
    .gap-2 { gap: 8px; }
    .gap-3 { gap: 12px; }
    .gap-4 { gap: 16px; }
    .result-badge {
      background: rgba(99, 102, 241, 0.15);
      border: 1px solid rgba(99, 102, 241, 0.35);
      color: #c7d2fe;
      padding: 10px 16px;
      border-radius: 10px;
      font-weight: 700;
      font-size: 16px;
      text-align: center;
    }
  </style>
</head>
<body>
  ${cleanCode}
  ${resizeScript}
</body>
</html>`;
    }

    return `
      <div class="generative-ui-card" data-widget-id="${widgetId}">
        <div class="gen-ui-toolbar">
          <div class="gen-ui-toolbar-left">
            <span class="gen-ui-badge">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>
              Live Interactive Widget
            </span>
            <span class="gen-ui-title">${escapeHtml(title)}</span>
          </div>
          <div class="gen-ui-toolbar-right">
            <button class="btn-gen-ui-tool btn-gen-ui-expand" title="Expand to Side Split-View Live Preview" type="button">
              <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 3 21 3 21 9"></polyline><polyline points="9 21 3 21 3 15"></polyline><line x1="21" y1="3" x2="14" y2="10"></line><line x1="3" y1="21" x2="10" y2="14"></line></svg>
              <span>Expand</span>
            </button>
            <button class="btn-gen-ui-tool btn-gen-ui-canvas" title="Open in Canvas Workspace" type="button">
              <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
              <span>Canvas</span>
            </button>
            <button class="btn-gen-ui-tool btn-gen-ui-copy" title="Copy Widget Code" type="button">
              <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
              <span>Copy</span>
            </button>
            <button class="btn-gen-ui-tool btn-gen-ui-toggle" title="Toggle Code / Interactive" type="button">
              <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>
              <span>Code</span>
            </button>
          </div>
        </div>
        <div class="gen-ui-viewport">
          <iframe class="gen-ui-iframe" id="${widgetId}_iframe" srcdoc="${escapeHtml(fullHtml)}" sandbox="allow-scripts allow-forms allow-modals" style="width: 100%; border: none; height: 380px; min-height: 260px; transition: height 0.2s ease;"></iframe>
        </div>
        <pre class="gen-ui-raw-code" style="display:none;"><code>${escapeHtml(cleanCode)}</code></pre>
      </div>
    `;
  }

  /**
   * Helper: Escape HTML
   */
  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // Global Event Delegation for all Diagram and Generative UI action buttons (Expand, Code, Copy, Canvas)
  if (typeof document !== 'undefined') {
    document.addEventListener('click', (e) => {
      // 1. Expand Diagram or Widget into Right Side-by-Side Panel
      const expandBtn = e.target.closest('.btn-diagram-expand, .btn-gen-ui-expand');
      if (expandBtn) {
        e.preventDefault();
        e.stopPropagation();
        const card = expandBtn.closest('.mermaid-diagram-card, .visual-chart-card, .generative-ui-card, .visual-diagram-container, .visual-genui-wrapper');
        if (!card) return;

        const isWidget = card.classList.contains('generative-ui-card') || card.querySelector('.generative-ui-card') !== null;
        const tagEl = card.querySelector('.diagram-tag, .gen-ui-badge');
        const titleEl = card.querySelector('.gen-ui-title, .chart-card-title');
        const title = (titleEl ? titleEl.textContent : (tagEl ? tagEl.textContent : (isWidget ? 'Interactive Widget' : 'Visual Diagram'))).trim();
        const type = isWidget ? 'Widget' : 'Diagram';
        const svgEl = card.querySelector('.diagram-svg-viewport');
        const svgContent = svgEl ? svgEl.innerHTML : '';
        const iframe = card.querySelector('iframe');
        const fullHtml = iframe ? (iframe.getAttribute('srcdoc') || '') : '';
        const rawCodeEl = card.querySelector('.diagram-raw-code code, .gen-ui-raw-code code, code');
        const rawCode = rawCodeEl ? rawCodeEl.textContent : '';

        if (window.UltronCanvas && typeof window.UltronCanvas.openVisualInspector === 'function') {
          window.UltronCanvas.openVisualInspector({
            title,
            type,
            svgContent,
            rawCode,
            isWidget,
            fullHtml
          });
        }
        return;
      }

      // 2. Toggle Code / Visual or Code / Preview
      const toggleBtn = e.target.closest('.btn-diagram-toggle, .btn-gen-ui-toggle');
      if (toggleBtn) {
        e.preventDefault();
        e.stopPropagation();
        const card = toggleBtn.closest('.mermaid-diagram-card, .visual-chart-card, .generative-ui-card, .visual-diagram-container, .visual-genui-wrapper');
        if (!card) return;

        const rawCodeEl = card.querySelector('.diagram-raw-code, .gen-ui-raw-code');
        const viewportEl = card.querySelector('.diagram-svg-viewport, .gen-ui-viewport');
        const isWidget = card.classList.contains('generative-ui-card') || card.querySelector('.generative-ui-card') !== null;

        if (rawCodeEl && viewportEl) {
          const isCodeVisible = rawCodeEl.style.display === 'block';
          rawCodeEl.style.display = isCodeVisible ? 'none' : 'block';
          viewportEl.style.display = isCodeVisible ? 'block' : 'none';
          const span = toggleBtn.querySelector('span');
          if (span) {
            if (isWidget) {
              span.textContent = isCodeVisible ? 'Code' : 'Preview';
            } else {
              span.textContent = isCodeVisible ? 'Code' : 'Diagram';
            }
          }
        }
        return;
      }

      // 3. Copy Code
      const copyBtn = e.target.closest('.btn-diagram-copy, .btn-gen-ui-copy');
      if (copyBtn) {
        e.preventDefault();
        e.stopPropagation();
        const card = copyBtn.closest('.mermaid-diagram-card, .visual-chart-card, .generative-ui-card, .visual-diagram-container, .visual-genui-wrapper');
        if (!card) return;

        const rawCodeEl = card.querySelector('.diagram-raw-code code, .gen-ui-raw-code code, code');
        const codeText = rawCodeEl ? rawCodeEl.textContent : '';
        if (codeText) {
          navigator.clipboard.writeText(codeText).then(() => {
            const span = copyBtn.querySelector('span');
            if (span) {
              const oldText = span.textContent;
              span.textContent = 'Copied!';
              setTimeout(() => { span.textContent = oldText || 'Copy'; }, 2000);
            }
          }).catch(() => {});
        }
        return;
      }

      // 4. Open in Canvas Workspace
      const canvasBtn = e.target.closest('.btn-gen-ui-canvas');
      if (canvasBtn) {
        e.preventDefault();
        e.stopPropagation();
        const card = canvasBtn.closest('.generative-ui-card, .visual-genui-wrapper');
        if (!card) return;
        const rawCodeEl = card.querySelector('.gen-ui-raw-code code, code');
        const codeText = rawCodeEl ? rawCodeEl.textContent : '';
        if (window.UltronCanvas && typeof window.UltronCanvas.openWorkspace === 'function') {
          window.UltronCanvas.openWorkspace([{
            name: 'widget.html',
            content: codeText,
            language: 'html',
            type: 'html'
          }], { defaultMode: 'preview' });
        }
        return;
      }
    });
  }

  window.UltronVisualEngine = {
    initMermaid,
    renderMermaidDiagram,
    renderChart,
    renderSvgBarChart,
    renderSvgLineChart,
    renderSvgPieChart,
    renderGenerativeUiWidget,
    detectVisualOpportunities
  };

  // Auto-init
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMermaid);
  } else {
    initMermaid();
  }
})();