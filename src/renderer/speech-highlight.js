(function (root) {
  'use strict';
  const pattern = /[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu;
  const normalize = text => text.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/’/g, "'");
  function words(text) {
    return [...String(text || '').matchAll(pattern)].map(match => ({
      word: normalize(match[0]), start: match.index, end: match.index + match[0].length,
      weight: Math.max(1, Math.pow(match[0].length, 0.65))
    }));
  }

  class SpeechHighlight {
    constructor(content) {
      this.content = content;
      this.cursor = 0;
      this.tokens = [];
      this.segment = null;
      this.lastRange = null;
      this.overlay = null;
      this.range = null;
      this.reposition = () => this.positionOverlay();
      root.addEventListener?.('scroll', this.reposition, { capture: true, passive: true });
      root.addEventListener?.('resize', this.reposition);
      this.indexText();
    }

    indexText() {
      this.tokens = [];
      const walker = document.createTreeWalker(this.content, 4);
      let node;
      while ((node = walker.nextNode())) {
        if (node.parentElement?.closest('pre, code, svg, button, .katex, .visual-diagram-container, .visual-chart-wrapper, .visual-genui-wrapper, .visual-loading-state, .chatgpt-thought-container, [hidden]')) continue;
        for (const token of words(node.textContent)) this.tokens.push({ ...token, node });
      }
    }

    update(text, progress, id) {
      if (!this.content.isConnected) { this.clearRange(); return; }
      if (!root.CSS?.highlights || !root.Highlight) return;
      if (this.tokens.length && !this.tokens[0].node.isConnected) {
        this.indexText(); this.cursor = 0; this.segment = null;
      }
      if (!this.segment || this.segment.id !== id) {
        const spoken = words(text);
        const matches = [];
        let cursor = this.cursor;
        for (const token of spoken) {
          let found = -1;
          for (let i = cursor; i < this.tokens.length; i++) {
            if (this.tokens[i].word === token.word) { found = i; break; }
          }
          matches.push(found < 0 ? null : this.tokens[found]);
          if (found >= 0) cursor = found + 1;
        }
        // Spoken summaries can differ from the displayed answer. Avoid pointing
        // at unrelated words when the speech cannot be mapped faithfully.
        const valid = spoken.length && matches.filter(Boolean).length / spoken.length >= 0.75;
        if (valid) this.cursor = cursor;
        this.segment = { id, spoken, matches: valid ? matches : [], total: spoken.reduce((sum, token) => sum + token.weight, 0) };
      }
      const { spoken, matches, total } = this.segment;
      let remaining = Math.min(0.999999, Math.max(0, progress)) * total;
      let index = 0;
      while (index < spoken.length - 1 && remaining >= spoken[index].weight) remaining -= spoken[index++].weight;
      const token = matches[index];
      if (!token) { this.clearRange(); return; }
      if (this.lastRange === token) { this.positionOverlay(); return; }
      const range = document.createRange();
      range.setStart(token.node, token.start);
      range.setEnd(token.node, token.end);
      root.CSS.highlights.set('brown-spoken-word', new root.Highlight(range));
      this.lastRange = token;
      this.range = range;
      this.showOverlay(token);
    }

    showOverlay(token) {
      if (!root.getComputedStyle || !this.range?.getBoundingClientRect || !document.body) return;
      if (!this.overlay) {
        this.overlay = document.createElement('span');
        this.overlay.className = 'brown-spoken-word-overlay';
        this.overlay.setAttribute('aria-hidden', 'true');
        document.body.appendChild(this.overlay);
      }
      const style = root.getComputedStyle(token.node.parentElement);
      this.overlay.style.font = style.font;
      this.overlay.style.letterSpacing = style.letterSpacing;
      this.overlay.style.fontFeatureSettings = style.fontFeatureSettings;
      this.overlay.textContent = token.node.textContent.slice(token.start, token.end);
      this.overlay.hidden = false;
      this.content.classList.add('speech-highlight-overlay-active');
      this.positionOverlay();
      this.pop?.cancel();
      if (!root.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
        this.pop = this.overlay.animate?.([
          { transform: 'translateY(0) scale(1)' },
          { transform: 'translateY(-1px) scale(1.015)' }
        ], { duration: 120, easing: 'ease-out', fill: 'both' });
      }
    }

    positionOverlay() {
      if (!this.overlay || !this.range) return;
      if (!this.lastRange?.node.isConnected) { this.clearRange(); return; }
      const box = this.range.getBoundingClientRect();
      const viewport = this.content.closest('#chat-messages-container')?.getBoundingClientRect();
      if (!box.width || !box.height || (viewport && (box.top < viewport.top || box.bottom > viewport.bottom || box.left < viewport.left || box.right > viewport.right))) {
        this.overlay.hidden = true;
        this.content.classList.remove('speech-highlight-overlay-active');
        return;
      }
      this.overlay.hidden = false;
      this.content.classList.add('speech-highlight-overlay-active');
      this.overlay.style.left = `${box.left - 3}px`;
      this.overlay.style.top = `${box.top - 1}px`;
      this.overlay.style.lineHeight = `${box.height}px`;
    }

    clearRange() {
      root.CSS?.highlights?.delete('brown-spoken-word');
      this.content.classList.remove('speech-highlight-overlay-active');
      this.pop?.cancel();
      if (this.overlay) this.overlay.hidden = true;
      this.lastRange = null; this.range = null;
    }
    clear() {
      this.clearRange(); this.segment = null;
      this.overlay?.remove(); this.overlay = null;
      root.removeEventListener?.('scroll', this.reposition, true);
      root.removeEventListener?.('resize', this.reposition);
    }
  }
  root.BrownSpeechHighlight = SpeechHighlight;
})(window);
