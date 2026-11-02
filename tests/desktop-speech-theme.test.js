const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { parseHTML } = require('linkedom');
const renderer = fs.readFileSync(path.join(__dirname, '../src/renderer/renderer.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '../src/renderer/index.html'), 'utf8');
const { document } = parseHTML(html);
const stored = new Map([['ultron-theme', 'light']]);
const sounds = [];
const btn = document.createElement('button');
btn.className = 'btn-speak-msg';
btn.innerHTML = '<svg viewBox="0 0 24 24"></svg><span>Listen</span>';
document.body.appendChild(btn);
const state = { generation: 0, queue: [], activeButton: btn, onFirstAudio: null, onIdle: null };
const context = vm.createContext({ document, console, setTimeout, clearTimeout,
  localStorage: {setItem:(key,value)=>stored.set(key,value),getItem:key=>stored.get(key)},
  window: { ultronAPI: {setAppTheme:theme=>assert.equal(theme,'dark'),synthesizeSpeech:async()=>({success:true,wavBase64:'audio'})} },
  Audio: class {
    constructor() {sounds.push(this);}
    play() {return Promise.resolve();}
    pause() {this.paused=true;}
  },
  activeNeuralAudio:null, activeSpeechPcmPlayer:null, activeSpeechHighlighter:null, ttsAnalyserNode:null, streamingAutoSpeakState:state,
  _ttsChunkCache:new Map(), _ttsChunkJobs:new Map(),
  _speechPreparationEpoch:0, isVoiceChatModeEnabled:()=>false, isTtsAutoSpeakEnabled:()=>true,
  prepareSpokenSummary:async()=>{},getCachedTtsAudio:()=>({wavBase64:'cached'}),
  connectTtsAudioAnalyser() {}, setVoiceOrbVisualState() {}, startVoiceOrbAnimation() {},
  resolveActiveTtsModelKey:async()=>'kokoro', normalizeTextForSpeech:text=>text,
  yieldToUi:async()=>{},getTtsRate:()=>1,logTrace() {},
  markStreamingSpeechStarted() {context.setSpeakButtonState(btn,'speaking');},
  notifyStreamingAutoSpeakIdle() {context.setSpeakButtonState(btn,'idle');},
});
function include(name, next) {
  const start = renderer.indexOf(`function ${name}(`);
  const prefix = renderer.slice(start-6,start) === 'async ' ? start-6 : start;
  const end = renderer.indexOf(`\n${next}`,start);
  assert(start>=0 && end>start,name);
  vm.runInContext(renderer.slice(prefix,end),context);
}
include('updateLogoSources','function applyAppTheme(');
include('applyAppTheme','window.applyAppTheme');
include('setSpeakButtonState','function setAutoSpeakButtonState(');
include('stopNeuralAudio','function playNeuralAudio(');
include('playNeuralAudio','let _lastAutoSpeakFeedTime');
include('resetStreamingAutoSpeak','function stopTtsSpeech(');
include('stopTtsSpeech','let cachedActiveTtsModelKey');
include('splitTextForSpeechQueue','function getLatestAiMessageText(');
include('synthesizeSpeechChunk','async function drainStreamingAutoSpeak(');
include('drainStreamingAutoSpeak','function beginSpeechPlayback(');
include('beginUnifiedSpeechPlayback','function feedStreamingAutoSpeak(');
include('speakTextAloud','function applyMessageActionButtonStyles(');
(async()=>{
  assert.equal(document.querySelector('[data-tab="appearance"], #tab-appearance, #tsd-appearance-toggle, [data-theme-choice]'),null);
  assert.equal(document.documentElement.getAttribute('data-theme'),'dark');
  for(const legacy of ['light','system','dark']) {
    context.applyAppTheme(legacy,true);
    assert.equal(document.documentElement.getAttribute('data-theme'),'dark');
    assert.equal(stored.get('ultron-theme'),'dark');
  }
  const native = require('../src/main/theme-state');
  native.state.light=true;native.state.splashDone=true;
  assert.equal(native.overlayColors().color,'#1B1B1B');
  native.state.setup=true;assert.equal(native.overlayColors().color,'rgba(0, 0, 0, 0)');native.state.setup=false;
  console.log('PASS: Appearance controls are removed; saved light/system choices and native title bars remain dark.');
  context.setSpeakButtonState(btn,'loading');
  assert(btn.classList.contains('is-loading'));assert.equal(btn.disabled,false);
  assert.equal(btn.getAttribute('aria-busy'),'true');
  await context.beginUnifiedSpeechPlayback('Read this reply');
  await new Promise(resolve=>setTimeout(resolve,10));
  assert(btn.classList.contains('is-loading'),'keep spinner until audio starts');
  sounds[0].onplay();
  assert(btn.classList.contains('speaking'));assert.equal(btn.querySelectorAll('svg rect').length,2);
  assert.equal(btn.querySelector('svg polygon'),null);
  sounds[0].onended();await new Promise(setImmediate);
  assert(!btn.classList.contains('speaking'));assert(btn.querySelector('svg polygon'));
  console.log('PASS: Real audio start displays pause bars; playback completion restores the speaker.');
  context.setSpeakButtonState(btn,'loading');
  const cancelled=context.playNeuralAudio('audio',{onStart:()=>context.setSpeakButtonState(btn,'speaking'),onEnd:()=>context.setSpeakButtonState(btn,'idle')});
  const old=sounds.at(-1);old.onplay();context.stopNeuralAudio();
  assert.equal(await cancelled,false);assert(old.paused);assert(btn.querySelector('svg polygon'));
  assert.equal(old.onplay,null,'cancelled audio cannot restart the pause icon');
  const failed=context.playNeuralAudio('audio',{onEnd:()=>context.setSpeakButtonState(btn,'idle')});
  sounds.at(-1).onerror();assert.equal(await failed,false);assert.equal(context.activeNeuralAudio,null);
  console.log('PASS: Cancellation and playback errors settle audio and reset the control.');
  const cached=context.speakTextAloud('Cached reply',{force:true,button:btn});
  await new Promise(setImmediate);
  assert(btn.classList.contains('is-loading'));
  sounds.at(-1).onplay();assert.equal(btn.querySelectorAll('svg rect').length,2);
  sounds.at(-1).onended();assert.equal(await cached,true);assert(btn.querySelector('svg polygon'));
  context.getCachedTtsAudio=()=>null;
  context.prepareSpokenSummary=()=>{throw new Error('Manual Speak must not wait for a second LLM request');};
  context.beginSpeechPlayback=async()=>false;
  assert.equal(await context.speakTextAloud('Unavailable reply',{force:true,button:btn}),false);
  assert(!btn.classList.contains('is-loading'));
  console.log('PASS: Cached audio follows playback events; unavailable audio does not leave a stuck loader.');
  let highlightCleared=false;
  context.window.BrownSpeechHighlight={};
  context.activeSpeechHighlighter={clear(){highlightCleared=true;}};
  context.stopTtsSpeech();
  assert(highlightCleared);assert.equal(context.activeSpeechHighlighter,null);
  console.log('PASS: Stop clears the active spoken-word highlight.');
})().catch(error=>{console.error(error);process.exitCode=1;});
