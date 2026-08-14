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

