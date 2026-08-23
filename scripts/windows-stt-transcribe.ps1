param(
  [Parameter(Mandatory = $true)][string]$WavPath,
  [string]$Culture = 'en-US'
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path -LiteralPath $WavPath)) {
  Write-Output ""
  exit 0
}

# Ignore empty or header-only audio files
if ((Get-Item -LiteralPath $WavPath).Length -le 44) {
  Write-Output ""
  exit 0
}

$absPath = (Resolve-Path -LiteralPath $WavPath).ProviderPath

# ------------------------------------------------------------------
# 1) Modern Windows Speech engine (WinRT SpeechRecognizer - the same
#    engine that powers Windows dictation Win+H).
#    PowerShell 5.1 cannot project RecognizeFromStreamAsync, so we
#    compile a tiny C# bridge once (cached in %TEMP%) and reuse it.
#    Exit codes from the helper: 0 = handled (text or no match),
#    2 = engine unavailable (caller may fall back to legacy SAPI).
# ------------------------------------------------------------------
$CS_SOURCE = @'
using System;
using System.IO;
using System.Reflection;
using System.Threading.Tasks;
using Windows.Foundation;
using Windows.Globalization;
using Windows.Media.SpeechRecognition;
using Windows.Storage;

class UltronStt
{
    static int Main(string[] args)
    {
        try
        {
            return Run(args).GetAwaiter().GetResult();
        }
        catch
        {
            return 2;
        }
    }

    // Minimal awaiter for WinRT IAsyncOperation<T>. The AsTask helpers are
    // not reliably available on every .NET 4.x install, so poll instead.
    static async Task<T> AwaitOp<T>(IAsyncOperation<T> op)
    {
        while (op.Status == AsyncStatus.Started) await Task.Delay(25);
        if (op.Status != AsyncStatus.Completed)
            throw new InvalidOperationException("speech async operation failed");
        return op.GetResults();
    }

    static async Task<int> Run(string[] args)
    {
        string wavPath = args.Length > 0 ? args[0] : null;
        string culture = args.Length > 1 ? args[1] : "en-US";
        if (string.IsNullOrEmpty(wavPath) || !File.Exists(wavPath)) return 2;

        SpeechRecognizer recognizer;
        try
        {
            recognizer = new SpeechRecognizer(new Language(culture));
        }
        catch
        {
            try { recognizer = new SpeechRecognizer(); }
            catch { return 2; }
        }

        try
        {
            StorageFile file = await AwaitOp(StorageFile.GetFileFromPathAsync(Path.GetFullPath(wavPath)));
            var stream = await AwaitOp(file.OpenReadAsync());
            SpeechRecognitionResult result;
            try
            {
                // RecognizeFromStreamAsync ships in the Windows Desktop
                // Extension contract, which is absent from the system winmd
                // metadata at compile time - resolve it at runtime instead.
                MethodInfo method = recognizer.GetType().GetMethod("RecognizeFromStreamAsync");
                if (method == null) return 2;
                object opObj = method.Invoke(recognizer, new object[] { stream });
                var op = (IAsyncOperation<SpeechRecognitionResult>)opObj;
                result = await AwaitOp(op);
            }
            finally
            {
                try { stream.Dispose(); } catch { }
                try { recognizer.Dispose(); } catch { }
            }

            if (result != null
                && result.Status == SpeechRecognitionResultStatus.Success
                && result.Confidence != SpeechRecognitionConfidence.Rejected)
            {
                string text = (result.Text ?? "").Trim();
                if (text.Length > 0)
                {
                    Console.Write(text);
                    return 0;
                }
            }
            return 0; // engine ran, no confident match - do not invent text
        }
        catch
        {
            return 2;
        }
    }
}
'@

try {
  $helperDir = Join-Path $env:TEMP 'ultron-stt'
  $helperExe = Join-Path $helperDir 'ultron-stt.exe'

  if (-not (Test-Path -LiteralPath $helperExe)) {
    New-Item -ItemType Directory -Path $helperDir -Force | Out-Null
    $csPath = Join-Path $helperDir 'ultron-stt.cs'
    Set-Content -LiteralPath $csPath -Value $CS_SOURCE -Encoding UTF8

    $csc = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
    if (-not (Test-Path -LiteralPath $csc)) {
      $csc = Join-Path $env:WINDIR 'Microsoft.NET\Framework\v4.0.30319\csc.exe'
    }
    $winMd = Join-Path $env:WINDIR 'System32\WinMetadata'

    # WinRT winmds reference types from the portable "System.Runtime" profile.
    # Locate the matching facade assemblies (Facades folder, GAC, or SDK ref
    # assemblies) so the compiler can resolve core types like System.Attribute.
    function Find-Assembly($name) {
      $facadesDir = Join-Path (Split-Path $csc) 'Facades'
      $direct = Join-Path $facadesDir "$name.dll"
      if (Test-Path -LiteralPath $direct) { return $direct }
      $gacDir = Join-Path $env:WINDIR 'Microsoft.NET\assembly\GAC_MSIL'
      $gacHit = Get-ChildItem (Join-Path $gacDir $name) -Recurse -Filter "$name.dll" -ErrorAction SilentlyContinue | Select-Object -First 1
      if ($gacHit) { return $gacHit.FullName }
      foreach ($refDir in @(
        'C:\Program Files (x86)\Reference Assemblies\Microsoft\Framework\.NETCore\v4.5.1',
        'C:\Program Files (x86)\Reference Assemblies\Microsoft\Framework\.NETCore\v4.5')) {
        $refHit = Join-Path $refDir "$name.dll"
        if (Test-Path -LiteralPath $refHit) { return $refHit }
      }
      return $name
    }

    $refRuntime = Find-Assembly 'System.Runtime'
    $refWinRtInterop = Find-Assembly 'System.Runtime.InteropServices.WindowsRuntime'

    # Compiler output must never reach stdout - it would be read as the transcript.
    & $csc /nologo /target:exe /out:"$helperExe" /reference:"$refRuntime" /reference:"$refWinRtInterop" /reference:"$winMd\Windows.Foundation.winmd" /reference:"$winMd\Windows.Globalization.winmd" /reference:"$winMd\Windows.Media.winmd" /reference:"$winMd\Windows.Storage.winmd" "$csPath" > $null 2>&1
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $helperExe)) {
      throw 'modern speech helper could not be compiled'
    }
  }

  $modernText = & $helperExe $absPath $Culture
  $helperExit = $LASTEXITCODE

  if ($helperExit -eq 0) {
    # Modern engine handled the audio (with or without a match).
    # Never fall through to legacy SAPI - it hallucinates wrong text.
    if ($modernText) { Write-Output ([string]$modernText).Trim() } else { Write-Output "" }
    exit 0
  }
  # helperExit 2 => modern engine unavailable; fall through to SAPI.
} catch {
  # Helper build/run failed entirely; fall through to legacy engine.
}

# ------------------------------------------------------------------
# 2) Legacy System.Speech dictation fallback (only when the modern
#    WinRT engine is unavailable on this machine).
# ------------------------------------------------------------------
try {
  Add-Type -AssemblyName System.Speech

  $cultureInfo = [System.Globalization.CultureInfo]::new($Culture)
  $engine = New-Object System.Speech.Recognition.SpeechRecognitionEngine($cultureInfo)
  $engine.LoadGrammar([System.Speech.Recognition.DictationGrammar]::new())

  try {
    $engine.SetInputToWaveFile($WavPath)
  } catch {
    # Audio stream missing or invalid format
    $engine.Dispose()
    Write-Output ""
    exit 0
  }

  # Allow full audio file reading without premature timeouts
  $engine.InitialSilenceTimeout = [TimeSpan]::FromSeconds(30)
  $engine.BabbleTimeout = [TimeSpan]::FromSeconds(0)
  $engine.EndSilenceTimeout = [TimeSpan]::FromMilliseconds(1200)
  $engine.EndSilenceTimeoutAmbiguous = [TimeSpan]::FromMilliseconds(1500)

  $parts = New-Object System.Collections.Generic.List[string]
  while ($true) {
    $result = $null
    try {
      $result = $engine.Recognize([TimeSpan]::FromSeconds(15))
    } catch {
      break
    }
    if ($null -eq $result) { break }
    $piece = [string]$result.Text
    if ($piece.Trim().Length -eq 0) { continue }
    [void]$parts.Add($piece.Trim())
  }

  $engine.Dispose()
  $text = ($parts -join ' ').Trim()
  Write-Output $text
} catch {
  Write-Output ""
  exit 0
}
