const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const VOICE_ENGINE_KEY = 'voice-native';
const VOICE_ENGINE_LABEL = 'Ultron Speech (Windows)';
const DEFAULT_CULTURE = 'en-US';

const PS_TRANSCRIBE_SCRIPT = String.raw`
param(
  [Parameter(Mandatory = $true)][string]$WavPath,
  [string]$Culture = 'en-US'
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path -LiteralPath $WavPath)) {
  Write-Output ""
  exit 0
}

if ((Get-Item -LiteralPath $WavPath).Length -le 44) {
  Write-Output ""
  exit 0
}

try {
  Add-Type -AssemblyName System.Speech

  $cultureInfo = [System.Globalization.CultureInfo]::new($Culture)
  $engine = New-Object System.Speech.Recognition.SpeechRecognitionEngine($cultureInfo)
  $engine.LoadGrammar([System.Speech.Recognition.DictationGrammar]::new())

  try {
    $engine.SetInputToWaveFile($WavPath)
  } catch {
    $engine.Dispose()
    Write-Output ""
    exit 0
  }

  $engine.InitialSilenceTimeout = [TimeSpan]::FromMilliseconds(400)
  $engine.BabbleTimeout = [TimeSpan]::FromSeconds(0)
  $engine.EndSilenceTimeout = [TimeSpan]::FromMilliseconds(280)
  $engine.EndSilenceTimeoutAmbiguous = [TimeSpan]::FromMilliseconds(420)

  $parts = New-Object System.Collections.Generic.List[string]
  while ($true) {
    $result = $null
    try {
      $result = $engine.Recognize([TimeSpan]::FromSeconds(6))
    } catch {
      break
    }
    if ($null -eq $result) { break }
    $piece = [string]$result.Text
    if ($piece.Trim().Length -eq 0) { continue }
    if ($result.Confidence -lt 0.05) { continue }
    [void]$parts.Add($piece.Trim())
  }

  $engine.Dispose()
  $text = ($parts -join ' ').Trim()
  Write-Output $text
} catch {
  Write-Output ""
  exit 0
}
`;

let cachedScriptPath = null;
let nativeSttProbeResult = null;
let nativeSttProbePromise = null;

function isWindowsPlatform() {
  return process.platform === 'win32';
}

function isNativeSttAvailable() {
  if (!isWindowsPlatform()) return false;
  if (nativeSttProbeResult === null) return true;
  return nativeSttProbeResult;
}

function getNativeSttProbeState() {
  return {
    probed: nativeSttProbeResult !== null,
    available: isNativeSttAvailable(),
    platform: process.platform
  };
}

function probeNativeSttAvailable() {
  if (!isWindowsPlatform()) {
    nativeSttProbeResult = false;
    return Promise.resolve(false);
  }
  if (nativeSttProbeResult !== null) {
    return Promise.resolve(nativeSttProbeResult);
  }
  if (nativeSttProbePromise) return nativeSttProbePromise;

  nativeSttProbePromise = new Promise((resolve) => {
    const child = spawn('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy', 'Bypass',
      '-Command',
      "Add-Type -AssemblyName System.Speech; $e = New-Object System.Speech.Recognition.SpeechRecognitionEngine([System.Globalization.CultureInfo]::new('en-US')); $e.LoadGrammar([System.Speech.Recognition.DictationGrammar]::new()); $e.Dispose(); 'OK'"
    ], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });

    let stdout = '';
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.on('error', () => {
      nativeSttProbeResult = false;
      resolve(false);
    });
    child.on('close', (code) => {
      nativeSttProbeResult = code === 0 && stdout.includes('OK');
      resolve(nativeSttProbeResult);
    });
  }).finally(() => {
    nativeSttProbePromise = null;
  });

  return nativeSttProbePromise;
}

function getNativeScriptPath() {
  if (cachedScriptPath && fs.existsSync(cachedScriptPath)) return cachedScriptPath;

  const bundled = path.join(__dirname, '..', '..', 'scripts', 'windows-stt-transcribe.ps1');
  if (fs.existsSync(bundled)) {
    cachedScriptPath = bundled;
    return bundled;
  }

  const tmpScript = path.join(os.tmpdir(), 'ultron-windows-stt.ps1');
  fs.writeFileSync(tmpScript, PS_TRANSCRIBE_SCRIPT, 'utf8');
  cachedScriptPath = tmpScript;
  return tmpScript;
}

function runPowerShellTranscribe(wavPath, culture = DEFAULT_CULTURE, timeoutMs = 9000) {
  return new Promise((resolve, reject) => {
    const scriptPath = getNativeScriptPath();
    const args = [
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy', 'Bypass',
      '-File', scriptPath,
      '-WavPath', wavPath,
      '-Culture', culture
    ];

    const child = spawn('powershell.exe', args, {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';
    let settled = false;

    const finish = (err, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (err) reject(err);
      else resolve(value);
    };

    const timer = setTimeout(() => {
      try { child.kill(); } catch (e) { /* ignore */ }
      finish(new Error('Speech recognition timed out. Try speaking for 2–5 seconds and tap done again.'));
    }, timeoutMs);

    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

    child.on('error', (err) => finish(err));

    child.on('close', (code) => {
      if (code !== 0) {
        const detail = stderr.trim() || stdout.trim();
        finish(new Error(detail || `Windows speech recognition failed (exit ${code}).`));
        return;
      }
      finish(null, stdout.trim());
    });
  });
}

async function transcribeWavBuffer(wavBuffer, culture = DEFAULT_CULTURE) {
  if (!isNativeSttAvailable()) {
    return {
      success: false,
      error: 'Built-in speech recognition is available on Windows only.',
      engine: VOICE_ENGINE_KEY
    };
  }

  if (!wavBuffer || !wavBuffer.length) {
    return { success: false, error: 'No audio data provided.', engine: VOICE_ENGINE_KEY };
  }

  const tmpFile = path.join(
    os.tmpdir(),
    `ultron-stt-${Date.now()}-${Math.random().toString(36).slice(2)}.wav`
  );

  try {
    fs.writeFileSync(tmpFile, wavBuffer);
    const text = await runPowerShellTranscribe(tmpFile, culture);
    return {
      success: Boolean(text),
      text,
      engine: VOICE_ENGINE_KEY,
      error: text ? '' : 'No speech detected in the recording.'
    };
  } catch (err) {
    console.error('[voice-stt-native] transcription failed:', err);
    const msg = String(err.message || err);
    if (/could not find|not installed|culture/i.test(msg)) {
      return {
        success: false,
        error: 'Windows speech language pack not found. Install English (US) speech recognition in Windows Settings → Time & language → Speech.',
        engine: VOICE_ENGINE_KEY
      };
    }
    return {
      success: false,
      error: msg || 'Speech recognition failed.',
      engine: VOICE_ENGINE_KEY
    };
  } finally {
    try { fs.unlinkSync(tmpFile); } catch (e) { /* ignore */ }
  }
}

module.exports = {
  VOICE_ENGINE_KEY,
  VOICE_ENGINE_LABEL,
  DEFAULT_CULTURE,
  isWindowsPlatform,
  isNativeSttAvailable,
  getNativeSttProbeState,
  probeNativeSttAvailable,
  transcribeWavBuffer
};
