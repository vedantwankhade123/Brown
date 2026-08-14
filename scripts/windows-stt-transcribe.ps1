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

  # Allow longer recordings and reduce premature cut-offs
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
    # Skip only extremely low-confidence noise
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

