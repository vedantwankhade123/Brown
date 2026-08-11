/**
 * Multi-intent segmentation (Sir Thaddeus ConversationSegmenter pattern).
 */
(function () {
  const SPLIT_RE = /\s+(?:and then|after that|afterwards)\s+/i;

  function segmentUserPrompt(prompt) {
    const text = String(prompt || '').trim();
    if (!text || text.length < 48) return [text];
    if (!/\b(and then|after that|afterwards)\b/i.test(text)) return [text];

    const parts = text.split(SPLIT_RE).map(s => s.trim()).filter(Boolean);
    if (parts.length <= 1) return [text];

    return parts.slice(0, 4);
  }

  function isCompoundPrompt(prompt) {
    return segmentUserPrompt(prompt).length > 1;
  }

  function buildSegmentedAgentPrompt(segments, index = 0) {
    if (!segments || !segments.length) return '';
    const current = segments[index];
    const remaining = segments.slice(index + 1);
    let msg = `[MULTI-STEP TASK — segment ${index + 1}/${segments.length}]\n${current}`;
    if (remaining.length) {
      msg += `\n\n[Deferred for after this segment: ${remaining.join(' | ')}]`;
    }
    return msg;
  }

  window.UltronAgentSegmentation = {
    segmentUserPrompt,
    isCompoundPrompt,
    buildSegmentedAgentPrompt
  };
})();
