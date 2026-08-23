// Live speech-to-text using the modern Windows Speech engine (WinRT
// SpeechRecognizer + ContinuousRecognitionSession - the same dictation
// engine that powers Windows voice typing Win+H).
//
// Why a helper process: PowerShell 5.1 cannot project the WinRT speech
// APIs, and the file-based RecognizeFromStreamAsync call belongs to the
// Windows Desktop Extension contract which is not callable from a plain
// desktop process. Live microphone recognition IS available, so Ultron
// streams recognition while the user speaks instead of decoding a file.
//
// A tiny C# helper is compiled once with the bundled .NET compiler and
// cached in %TEMP%\ultron-stt-live. Protocol (stdout lines):
//   READY            - session started, listening
//   RESULT\t<text>   - one finalized phrase
//   FINAL\t<text>    - full transcript after STOP (helper exits 0)
// Stdin: "STOP" ends the session. Exit codes: 0 ok, 2 engine unavailable,
// 3 Windows online-speech privacy policy not accepted.

const { spawn } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const LIVE_HELPER_VERSION = '3';

const CS_LIVE_SOURCE = String.raw`
using System;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Windows.Foundation;
using Windows.Globalization;
using Windows.Media.SpeechRecognition;

class UltronSttLive
{
    static SpeechRecognizer recognizer;
    static SpeechContinuousRecognitionSession session;
    static readonly StringBuilder finalText = new StringBuilder();
    static readonly ManualResetEventSlim completedEvent = new ManualResetEventSlim(false);
    static volatile bool stopping = false;

    static async Task<T> AwaitOp<T>(IAsyncOperation<T> op)
    {
        while (op.Status == AsyncStatus.Started) await Task.Delay(25);
        if (op.Status != AsyncStatus.Completed)
            throw new InvalidOperationException("speech async operation failed");
        return op.GetResults();
    }

    static async Task AwaitAction(IAsyncAction op)
    {
        while (op.Status == AsyncStatus.Started) await Task.Delay(25);
        if (op.Status != AsyncStatus.Completed)
            throw new InvalidOperationException("speech async action failed");
        op.GetResults();
    }

    static void Emit(string line)
    {
        Console.WriteLine(line);
        Console.Out.Flush();
    }

    static int Main(string[] args)
    {
        try
        {
            return Run(args).GetAwaiter().GetResult();
        }
        catch (Exception ex)
        {
            // 0x80045509 = SPERR_SPEECH_PRIVACY_POLICY_DISABLED
            if (ex.HResult == unchecked((int)0x80045509)
                || (ex.InnerException != null && ex.InnerException.HResult == unchecked((int)0x80045509))
                || (ex.Message != null && ex.Message.IndexOf("privacy", StringComparison.OrdinalIgnoreCase) >= 0))
                return 3;
            return 2;
        }
    }

    static async Task TryStartSession()
    {
        await AwaitAction(session.StartAsync(SpeechContinuousRecognitionMode.Default));
    }

    static async Task<int> Run(string[] args)
    {
        string culture = args.Length > 0 ? args[0] : "en-US";

        try { recognizer = new SpeechRecognizer(new Language(culture)); }
        catch
        {
            try { recognizer = new SpeechRecognizer(); }
            catch { return 2; }
        }

        var compileRes = await AwaitOp(recognizer.CompileConstraintsAsync());
        if (compileRes.Status != SpeechRecognitionResultStatus.Success) return 2;

        session = recognizer.ContinuousRecognitionSession;

        session.ResultGenerated += (s, e) =>
        {
            var r = e.Result;
            if (r != null
                && r.Status == SpeechRecognitionResultStatus.Success
                && r.Confidence != SpeechRecognitionConfidence.Rejected
                && !string.IsNullOrWhiteSpace(r.Text))
            {
                string piece = r.Text.Trim();
                lock (finalText)
                {
                    if (finalText.Length > 0) finalText.Append(' ');
                    finalText.Append(piece);
                }
                Emit("RESULT\t" + piece);
            }
        };

        session.Completed += async (s, e) =>
        {
            if (stopping)
            {
                completedEvent.Set();
                return;
            }
            // The engine stops itself after long silence - resume listening.
            try { await TryStartSession(); }
            catch { completedEvent.Set(); }
        };

        await TryStartSession();
        Emit("READY");

        // Read stdin for the STOP command from the host process.
        await Task.Run(() =>
        {
            try
            {
                string line;
                while ((line = Console.ReadLine()) != null)
                {
                    if (line.Trim().ToUpperInvariant() == "STOP") break;
                }
            }
            catch { }
        });

        stopping = true;
        try { await AwaitAction(session.StopAsync()); } catch { completedEvent.Set(); }
        completedEvent.Wait(2500);

        string total;
        lock (finalText) { total = finalText.ToString().Trim(); }
        Emit("FINAL\t" + total);
        return 0;
    }
}
`;

let liveChild = null;
let livePartialHandler = null;
let liveStopResolver = null;
let liveFinalText = '';
let liveStdoutBuffer = '';
let helperBuildPromise = null;

function isWindowsPlatform() {
  return process.platform === 'win32';
}

function findCsc() {
  const windir = process.env.WINDIR || 'C:\\Windows';
  const candidates = [
    path.join(windir, 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe'),
    path.join(windir, 'Microsoft.NET', 'Framework', 'v4.0.30319', 'csc.exe')
  ];
  return candidates.find((p) => fs.existsSync(p)) || null;
}

// WinRT winmds reference the portable "System.Runtime" profile; locate the
// facade assemblies (Facades folder, GAC, or SDK reference assemblies).
function findFacade(name, cscPath) {
  try {
    const facadesDir = path.join(path.dirname(cscPath), 'Facades');
    const direct = path.join(facadesDir, `${name}.dll`);
    if (fs.existsSync(direct)) return direct;

    const windir = process.env.WINDIR || 'C:\\Windows';
    const gacNameDir = path.join(windir, 'Microsoft.NET', 'assembly', 'GAC_MSIL', name);
    if (fs.existsSync(gacNameDir)) {
      const versions = fs.readdirSync(gacNameDir);
      for (const v of versions) {
        const hit = path.join(gacNameDir, v, `${name}.dll`);
        if (fs.existsSync(hit)) return hit;
      }
    }

    const refDirs = [
      'C:\\Program Files (x86)\\Reference Assemblies\\Microsoft\\Framework\\.NETCore\\v4.5.1',
      'C:\\Program Files (x86)\\Reference Assemblies\\Microsoft\\Framework\\.NETCore\\v4.5'
    ];
    for (const dir of refDirs) {
      const hit = path.join(dir, `${name}.dll`);
      if (fs.existsSync(hit)) return hit;
    }
  } catch (e) { /* fall through */ }
  return null;
}

function getHelperDir() {
  return path.join(os.tmpdir(), 'ultron-stt-live');
}

function ensureLiveHelper() {
  if (!isWindowsPlatform()) return Promise.resolve(null);
  if (helperBuildPromise) return helperBuildPromise;

  helperBuildPromise = new Promise((resolve) => {
    try {
      const helperDir = getHelperDir();
      const helperExe = path.join(helperDir, 'ultron-stt-live.exe');
      const versionFile = path.join(helperDir, 'version.txt');

      if (fs.existsSync(helperExe)) {
        let version = '';
        try { version = fs.readFileSync(versionFile, 'utf8').trim(); } catch (e) { /* ignore */ }
        if (version === LIVE_HELPER_VERSION) return resolve(helperExe);
      }

      const csc = findCsc();
      if (!csc) return resolve(null);

      fs.mkdirSync(helperDir, { recursive: true });
      const csPath = path.join(helperDir, 'ultron-stt-live.cs');
      fs.writeFileSync(csPath, CS_LIVE_SOURCE, 'utf8');

      const winMd = path.join(process.env.WINDIR || 'C:\\Windows', 'System32', 'WinMetadata');
      const refRuntime = findFacade('System.Runtime', csc);
      const refInterop = findFacade('System.Runtime.InteropServices.WindowsRuntime', csc);
      if (!refRuntime || !refInterop) return resolve(null);

      const args = [
        '/nologo', '/target:exe', `/out:${helperExe}`,
        `/reference:${refRuntime}`,
        `/reference:${refInterop}`,
        `/reference:${path.join(winMd, 'Windows.Foundation.winmd')}`,
        `/reference:${path.join(winMd, 'Windows.Globalization.winmd')}`,
        `/reference:${path.join(winMd, 'Windows.Media.winmd')}`,
        `/reference:${path.join(winMd, 'Windows.Storage.winmd')}`,
        csPath
      ];

      const compile = spawn(csc, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
      let stderr = '';
      compile.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
      compile.on('error', () => resolve(null));
      compile.on('close', (code) => {
        if (code === 0 && fs.existsSync(helperExe)) {
          try { fs.writeFileSync(versionFile, LIVE_HELPER_VERSION, 'utf8'); } catch (e) { /* ignore */ }
          resolve(helperExe);
        } else {
          console.warn('[voice-stt-live] helper compile failed:', stderr.slice(0, 500));
          resolve(null);
        }
      });
    } catch (err) {
      console.warn('[voice-stt-live] helper build error:', err.message);
      resolve(null);
    }
  }).finally(() => {
    // Allow future rebuilds after this one settles.
    setTimeout(() => { helperBuildPromise = null; }, 0);
  });

  return helperBuildPromise;
}

function handleStdoutChunk(chunk) {
  liveStdoutBuffer += chunk.toString();
  let newlineIndex;
  while ((newlineIndex = liveStdoutBuffer.indexOf('\n')) >= 0) {
    const line = liveStdoutBuffer.slice(0, newlineIndex).replace(/\r$/, '');
    liveStdoutBuffer = liveStdoutBuffer.slice(newlineIndex + 1);

    if (line === 'READY') {
      if (liveStartResolver) {
        liveStartResolver({ success: true });
        liveStartResolver = null;
      }
    } else if (line.startsWith('RESULT\t')) {
      const text = line.slice(7).trim();
      if (text && livePartialHandler) {
        try { livePartialHandler(text); } catch (e) { /* ignore */ }
      }
    } else if (line.startsWith('FINAL\t')) {
      liveFinalText = line.slice(6).trim();
    }
  }
}

let liveStartResolver = null;

async function startLiveStt(culture, onPartial) {
  if (!isWindowsPlatform()) {
    return { success: false, code: 'unsupported', error: 'Live Windows Speech is available on Windows only.' };
  }
  if (liveChild) {
    return { success: true, alreadyRunning: true };
  }

  const helperExe = await ensureLiveHelper();
  if (!helperExe) {
    return { success: false, code: 'unavailable', error: 'Windows speech helper could not be built on this device.' };
  }

  livePartialHandler = typeof onPartial === 'function' ? onPartial : null;
  liveFinalText = '';
  liveStdoutBuffer = '';

  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      liveStartResolver = null;
      resolve(value);
    };

    liveStartResolver = (value) => finish(value);

    const timer = setTimeout(() => {
      if (liveChild) {
        try { liveChild.kill(); } catch (e) { /* ignore */ }
        liveChild = null;
      }
      finish({ success: false, code: 'timeout', error: 'Windows speech engine did not start in time.' });
    }, 15000);

    try {
      liveChild = spawn(helperExe, [culture || 'en-US'], {
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe']
      });
    } catch (err) {
      finish({ success: false, code: 'unavailable', error: err.message });
      return;
    }

    liveChild.stdout.on('data', handleStdoutChunk);
    liveChild.stderr.on('data', () => { /* diagnostics only */ });
    liveChild.on('error', (err) => {
      liveChild = null;
      finish({ success: false, code: 'unavailable', error: err.message });
    });
    liveChild.on('close', (code) => {
      liveChild = null;
      if (!settled) {
        if (code === 3) {
          finish({
            success: false,
            code: 'privacy',
            error: 'Windows online speech recognition is turned off. Enable it in Windows Settings → Privacy & security → Speech.'
          });
        } else {
          finish({ success: false, code: 'unavailable', error: `Windows speech engine is unavailable (exit ${code}).` });
        }
      } else if (liveStopResolver) {
        const resolver = liveStopResolver;
        liveStopResolver = null;
        resolver({ success: true, text: liveFinalText });
      }
    });
  });
}

function stopLiveStt(timeoutMs = 6000) {
  return new Promise((resolve) => {
    if (!liveChild) {
      livePartialHandler = null;
      resolve({ success: true, text: '' });
      return;
    }

    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      livePartialHandler = null;
      resolve(value);
    };

    liveStopResolver = finish;

    const timer = setTimeout(() => {
      if (liveChild) {
        try { liveChild.kill(); } catch (e) { /* ignore */ }
        liveChild = null;
      }
      liveStopResolver = null;
      finish({ success: true, text: liveFinalText });
    }, timeoutMs);

    try {
      liveChild.stdin.write('STOP\n');
      liveChild.stdin.end();
    } catch (e) {
      if (liveChild) {
        try { liveChild.kill(); } catch (k) { /* ignore */ }
        liveChild = null;
      }
      liveStopResolver = null;
      finish({ success: true, text: liveFinalText });
    }
  });
}

function cleanupLiveStt() {
  if (liveChild) {
    try { liveChild.kill(); } catch (e) { /* ignore */ }
    liveChild = null;
  }
  livePartialHandler = null;
  liveStopResolver = null;
}

module.exports = {
  isLiveSttActive: () => Boolean(liveChild),
  startLiveStt,
  stopLiveStt,
  cleanupLiveStt,
  ensureLiveHelper
};
