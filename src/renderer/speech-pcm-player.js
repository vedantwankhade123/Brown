(function (root) {
  'use strict';
  const workletUrl = new URL('speech-pcm-worklet.js', document.currentScript.src).href;

  class SpeechPcmPlayer {
    static trimSilence(samples, rate) {
      // Kokoro adds silence on both sides of every independently generated phrase.
      // Retain phoneme padding and a natural sentence pause; never trim internally.
      let first = 0, last = samples.length - 1;
      while (first < samples.length && Math.abs(samples[first]) < 0.0001) first++;
      if (first === samples.length) return samples;
      while (last > first && Math.abs(samples[last]) < 0.0001) last--;
      const start = Math.min(Math.max(0, first - Math.round(rate * 0.04)), Math.round(rate * 0.25));
      const end = samples.length - Math.min(Math.max(0, samples.length - 1 - last - Math.round(rate * 0.1)), Math.round(rate * 0.4));
      return samples.subarray(start, end);
    }

    static async create(options = {}) {
      const context = new (root.AudioContext || root.webkitAudioContext)({ latencyHint: 'interactive' });
      try {
        await context.audioWorklet.addModule(workletUrl);
        await context.resume();
        if (context.state !== 'running') throw new Error('Speech audio output is suspended.');
        return new SpeechPcmPlayer(context, options);
      } catch (error) {
        await context.close();
        throw error;
      }
    }

    constructor(context, { onStart, onAnalyser, onUnderrun, onProgress } = {}) {
      this.context = context;
      this.stopped = false;
      this.bufferedSeconds = 0;
      this.sentFrames = 0;
      this.sentChunks = 0;
      this.segments = [];
      this.waiters = new Set();
      this.done = new Promise(resolve => { this.resolveDone = resolve; });
      this.node = new AudioWorkletNode(context, 'brown-speech-pcm', {
        numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [1]
      });
      this.analyser = context.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.75;
      this.node.connect(this.analyser);
      this.analyser.connect(context.destination);
      onAnalyser?.(this.analyser);
      let started = false;
      this.node.port.onmessage = ({ data }) => {
        if (this.stopped) return;
        if (data.type === 'playing' && !started) { started = true; onStart?.(); }
        if (data.type === 'underrun') onUnderrun?.();
        if (data.type === 'buffer') {
          this.bufferedSeconds = Math.max(0, this.sentFrames - data.consumed) / context.sampleRate;
          while (this.segments.length > 1 && data.consumed >= this.segments[0].end) this.segments.shift();
          const segment = this.segments[0];
          if (segment && data.consumed >= segment.start) {
            onProgress?.(segment.text, Math.min(1, (data.consumed - segment.start) / (segment.end - segment.start)), segment.start);
          }
          this.wake();
        }
        if (data.type === 'done') {
          // The final render quantum still has to reach the physical device.
          const tail = Math.max(0.03, (context.baseLatency || 0) + (context.outputLatency || 0) + 128 / context.sampleRate);
          this.finishTimer = setTimeout(() => this.stop(true), tail * 1000);
        }
      };
      this.node.onprocessorerror = () => this.stop(false);
    }

    wake() { for (const resolve of this.waiters) resolve(); this.waiters.clear(); }

    async waitForCapacity() {
      while (!this.stopped && this.sentChunks >= 2 && this.bufferedSeconds >= 12) {
        await new Promise(resolve => this.waiters.add(resolve));
      }
    }

    async append(audio, { text = '' } = {}) {
      if (this.stopped) return;
      let samples, rate;
      if (audio.pcm) {
        samples = audio.pcm instanceof Float32Array ? audio.pcm : new Float32Array(audio.pcm);
        rate = audio.sampleRate;
      } else {
        const bytes = Uint8Array.from(atob(audio.wavBase64), c => c.charCodeAt(0));
        const buffer = await this.context.decodeAudioData(bytes.buffer);
        samples = buffer.getChannelData(0);
        rate = buffer.sampleRate;
      }
      if (this.stopped) return;
      if (!samples.length || !Number.isFinite(rate) || rate <= 0) throw new Error('Invalid speech audio.');
      if (audio.pcm) samples = SpeechPcmPlayer.trimSilence(samples, rate);
      const targetRate = this.context.sampleRate;
      // Kokoro emits mono 24 kHz; match the output device without changing pitch.
      const output = new Float32Array(Math.round(samples.length * targetRate / rate));
      for (let i = 0; i < output.length; i++) {
        const position = i * rate / targetRate;
        const left = Math.min(Math.floor(position), samples.length - 1);
        const right = Math.min(left + 1, samples.length - 1);
        output[i] = samples[left] + (samples[right] - samples[left]) * (position - left);
      }
      this.bufferedSeconds += output.length / targetRate;
      this.segments.push({ text, start: this.sentFrames, end: this.sentFrames + output.length });
      this.sentFrames += output.length;
      this.sentChunks++;
      this.node.port.postMessage({ type: 'push', samples: output }, [output.buffer]);
    }

    end() { if (!this.stopped) this.node.port.postMessage({ type: 'end' }); return this.done; }

    stop(ok = false) {
      if (this.stopped) return;
      this.stopped = true;
      clearTimeout(this.finishTimer);
      this.node.port.onmessage = null;
      this.node.disconnect();
      this.analyser.disconnect();
      this.node.port.close();
      this.context.close().catch(() => {});
      this.wake();
      this.resolveDone(ok);
    }
  }
  root.BrownSpeechPcmPlayer = SpeechPcmPlayer;
})(window);
