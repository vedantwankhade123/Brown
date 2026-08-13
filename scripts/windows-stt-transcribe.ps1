param(
  [Parameter(Mandatory = $true)][string]$WavPath,
  [string]$Culture = 'en-US'
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path -LiteralPath $WavPath)) {
  Write-Error "WAV file not found: $WavPath"
  exit 2
}

Add-Type -AssemblyName System.Speech

$cultureInfo = [System.Globalization.CultureInfo]::new($Culture)
$engine = New-Object System.Speech.Recognition.SpeechRecognitionEngine($cultureInfo)
$engine.LoadGrammar([System.Speech.Recognition.DictationGrammar]::new())
$engine.SetInputToWaveFile($WavPath)

# Allow longer recordings and reduce premature cut-offs
$engine.InitialSilenceTimeout = [TimeSpan]::FromSeconds(8)
$engine.BabbleTimeout = [TimeSpan]::FromSeconds(0)
$engine.EndSilenceTimeout = [TimeSpan]::FromMilliseconds(350)
$engine.EndSilenceTimeoutAmbiguous = [TimeSpan]::FromMilliseconds(550)

$parts = New-Object System.Collections.Generic.List[string]
while ($true) {
  $result = $engine.Recognize([TimeSpan]::FromSeconds(45))
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
