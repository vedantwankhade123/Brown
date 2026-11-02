/* A single render-thread PCM queue for the lifetime of a spoken passage. */
class SpeechPcmProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.queue = [];
    this.offset = 0;
    this.frames = 0;
    this.consumed = 0;
    this.started = false;
    this.playing = false;
    this.ended = false;
    this.finished = false;
    this.report = 0;
    this.port.onmessage = ({ data }) => {
      if (data.type === 'push' && !this.finished) {
        this.queue.push(data.samples);
        this.frames += data.samples.length;
      } else if (data.type === 'end') this.ended = true;
    };
  }

  process(_inputs, outputs) {
    const out = outputs[0][0];
    out.fill(0);
    if (this.finished) return false;
    // Each push is already a complete synthesized phrase. Play it immediately;
    // waiting for another phrase adds a full inference call to startup/recovery.
    if (!this.playing && (this.frames > 0 || this.ended)) {
      this.playing = true;
      this.started = true;
      if (this.frames) this.port.postMessage({ type: 'playing' });
    }
    if (this.playing) {
      let written = 0;
      while (written < out.length && this.queue.length) {
        const head = this.queue[0];
        const count = Math.min(out.length - written, head.length - this.offset);
        out.set(head.subarray(this.offset, this.offset + count), written);
        written += count;
        this.offset += count;
        this.frames -= count;
        this.consumed += count;
        if (this.offset === head.length) { this.queue.shift(); this.offset = 0; }
      }
      if (!this.frames && !this.ended) {
        // Resume as soon as the next phrase arrives, without an extra threshold.
        this.playing = false;
        this.port.postMessage({ type: 'underrun' });
      }
    }
    this.report += out.length;
    if (this.report >= sampleRate / 20 || (this.ended && !this.frames)) {
      this.report = 0;
      this.port.postMessage({ type: 'buffer', consumed: this.consumed });
    }
    if (this.ended && !this.frames) {
      this.finished = true;
      this.port.postMessage({ type: 'done' });
      return false;
    }
    return true;
  }
}
registerProcessor('brown-speech-pcm', SpeechPcmProcessor);
