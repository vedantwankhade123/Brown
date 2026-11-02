param([Parameter(Mandatory=$true)][string]$InputPath,[string]$Pages='')
$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null=[Windows.Storage.StorageFile,Windows.Storage,ContentType=WindowsRuntime]
$null=[Windows.Graphics.Imaging.BitmapDecoder,Windows.Graphics.Imaging,ContentType=WindowsRuntime]
$null=[Windows.Media.Ocr.OcrEngine,Windows.Foundation,ContentType=WindowsRuntime]
$null=[Windows.Data.Pdf.PdfDocument,Windows.Data.Pdf,ContentType=WindowsRuntime]
function Await($operation,$resultType){
 $method=[System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {$_.Name -eq 'AsTask' -and $_.IsGenericMethod -and $_.GetParameters().Count -eq 1} | Select-Object -First 1
 $task=$method.MakeGenericMethod($resultType).Invoke($null,@($operation));$task.Wait();return $task.Result
}
function AwaitAction($operation){
 $method=[System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {$_.Name -eq 'AsTask' -and !$_.IsGenericMethod -and $_.GetParameters().Count -eq 1} | Select-Object -First 1
 $task=$method.Invoke($null,@($operation));$task.Wait()
}
$engine=[Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
if(!$engine){throw 'Install a Windows OCR language pack for the document language.'}
function ReadBitmap($stream){
 $decoder=Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
 $transform=New-Object Windows.Graphics.Imaging.BitmapTransform
 $scale=[Math]::Min(1,2000/[Math]::Max($decoder.PixelWidth,$decoder.PixelHeight))
 $transform.ScaledWidth=[uint32][Math]::Max(1,$decoder.PixelWidth*$scale);$transform.ScaledHeight=[uint32][Math]::Max(1,$decoder.PixelHeight*$scale)
 $bitmap=Await ($decoder.GetSoftwareBitmapAsync([Windows.Graphics.Imaging.BitmapPixelFormat]::Bgra8,[Windows.Graphics.Imaging.BitmapAlphaMode]::Ignore,$transform,[Windows.Graphics.Imaging.ExifOrientationMode]::RespectExifOrientation,[Windows.Graphics.Imaging.ColorManagementMode]::DoNotColorManage)) ([Windows.Graphics.Imaging.SoftwareBitmap])
 try{ $recognized=Await ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult]);return $recognized.Text }finally{$bitmap.Dispose()}
}
$file=Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync($InputPath)) ([Windows.Storage.StorageFile])
$segments=@();$warnings=@()
if([IO.Path]::GetExtension($InputPath).ToLowerInvariant() -eq '.pdf'){
 $pdf=Await ([Windows.Data.Pdf.PdfDocument]::LoadFromFileAsync($file)) ([Windows.Data.Pdf.PdfDocument])
 $selected=if($Pages){@($Pages.Split(',') | ForEach-Object {[int]$_})}else{@(1..[Math]::Min(12,$pdf.PageCount))}
 if(!$Pages -and $pdf.PageCount -gt 12){$warnings+='Only the first 12 scanned PDF pages were processed.'}
 foreach($number in $selected){
  if($number -lt 1 -or $number -gt $pdf.PageCount){continue}
  $page=$pdf.GetPage([uint32]($number-1));$stream=New-Object Windows.Storage.Streams.InMemoryRandomAccessStream
  try{$options=New-Object Windows.Data.Pdf.PdfPageRenderOptions;$options.DestinationWidth=1600;AwaitAction ($page.RenderToStreamAsync($stream,$options));$stream.Seek(0);$segments+=@{pageNumber=$number;text=(ReadBitmap $stream)}}finally{$page.Dispose();$stream.Dispose()}
 }
}else{
 $stream=Await ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
 try{$segments+=@{text=(ReadBitmap $stream)}}finally{$stream.Dispose()}
}
[Console]::OutputEncoding=[Text.Encoding]::UTF8
@{segments=@($segments);warnings=@($warnings)} | ConvertTo-Json -Depth 5 -Compress
