$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$projectRoot = Split-Path -Parent $PSScriptRoot
$assetRoot = Join-Path $projectRoot 'build/appx'
New-Item -ItemType Directory -Force -Path $assetRoot | Out-Null
$source = [System.Drawing.Image]::FromFile((Join-Path $projectRoot 'Assets/browny_white.png'))
try {
    foreach ($asset in @(@('StoreLogo.png', 50, 50), @('Square150x150Logo.png', 150, 150), @('Square44x44Logo.png', 44, 44), @('Wide310x150Logo.png', 310, 150))) {
        $bitmap = New-Object System.Drawing.Bitmap ([int]$asset[1]), ([int]$asset[2])
        $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
        try {
            $graphics.Clear([System.Drawing.Color]::Black)
            $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
            $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
            $scale = [Math]::Min($bitmap.Width / $source.Width, $bitmap.Height / $source.Height) * 0.95
            $width = [int]($source.Width * $scale)
            $height = [int]($source.Height * $scale)
            $graphics.DrawImage($source, [int](($bitmap.Width - $width) / 2), [int](($bitmap.Height - $height) / 2), $width, $height)
            $bitmap.Save((Join-Path $assetRoot $asset[0]), [System.Drawing.Imaging.ImageFormat]::Png)
        } finally { $graphics.Dispose(); $bitmap.Dispose() }
    }
} finally { $source.Dispose() }
Write-Output "Prepared branded Store tiles in $assetRoot"
