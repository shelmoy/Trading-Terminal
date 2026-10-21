param([Parameter(Mandatory = $true)][string]$Path)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
function New-RoundedPath([single]$X, [single]$Y, [single]$Width, [single]$Height, [single]$Radius) {
    $shape = New-Object Drawing.Drawing2D.GraphicsPath
    $diameter = $Radius * 2
    $shape.AddArc($X, $Y, $diameter, $diameter, 180, 90)
    $shape.AddArc(($X + $Width - $diameter), $Y, $diameter, $diameter, 270, 90)
    $shape.AddArc(($X + $Width - $diameter), ($Y + $Height - $diameter), $diameter, $diameter, 0, 90)
    $shape.AddArc($X, ($Y + $Height - $diameter), $diameter, $diameter, 90, 90)
    $shape.CloseFigure()
    return $shape
}
$frames = @()
foreach ($size in @(16, 24, 32, 48, 64, 128, 256)) {
    $bitmap = New-Object Drawing.Bitmap($size, $size)
    $graphics = [Drawing.Graphics]::FromImage($bitmap)
    $graphics.SmoothingMode = 'AntiAlias'
    $graphics.Clear([Drawing.Color]::Transparent)
    $graphics.ScaleTransform(($size / 256.0), ($size / 256.0))
    $tile = New-RoundedPath 9 9 238 238 56
    $shadow = New-Object Drawing.SolidBrush([Drawing.Color]::FromArgb(42, 37, 74, 133))
    $shadowPath = New-RoundedPath 12 15 232 238 56
    $graphics.FillPath($shadow, $shadowPath)
    $rect = New-Object Drawing.Rectangle(9, 9, 238, 238)
    $gradient = New-Object Drawing.Drawing2D.LinearGradientBrush($rect, [Drawing.ColorTranslator]::FromHtml('#B7F1FF'), [Drawing.ColorTranslator]::FromHtml('#316CE8'), 65.0)
    $graphics.FillPath($gradient, $tile)
    $rim = New-Object Drawing.Pen([Drawing.Color]::FromArgb(205, 255, 255, 255), 2)
    $graphics.DrawPath($rim, $tile)
    $glass = New-Object Drawing.SolidBrush([Drawing.Color]::FromArgb(213, 255, 255, 255))
    $ink = New-Object Drawing.SolidBrush([Drawing.ColorTranslator]::FromHtml('#3374CB'))
    $led = New-Object Drawing.SolidBrush([Drawing.ColorTranslator]::FromHtml('#15A98D'))
    foreach ($top in @(65, 132)) {
        $rack = New-RoundedPath 49 $top 158 52 16
        $graphics.FillPath($glass, $rack)
        $graphics.DrawPath($rim, $rack)
        $graphics.FillRectangle($ink, 69, ($top + 23), 67, 5)
        $graphics.FillEllipse($led, 166, ($top + 19), 14, 14)
        $rack.Dispose()
    }
    $shine = New-Object Drawing.Drawing2D.LinearGradientBrush($rect, [Drawing.Color]::FromArgb(100, 255, 255, 255), [Drawing.Color]::FromArgb(0, 255, 255, 255), 90.0)
    $graphics.SetClip($tile)
    $graphics.FillEllipse($shine, -30, -100, 360, 230)
    $memory = New-Object IO.MemoryStream
    try { $bitmap.Save($memory, [Drawing.Imaging.ImageFormat]::Png); $frames += ,@($size, $memory.ToArray()) }
    finally {
        $memory.Dispose(); $graphics.Dispose(); $bitmap.Dispose(); $tile.Dispose(); $shadowPath.Dispose()
        $gradient.Dispose(); $shine.Dispose(); $shadow.Dispose(); $rim.Dispose(); $glass.Dispose(); $ink.Dispose(); $led.Dispose()
    }
}
# Explicit ICO directory with PNG frames avoids GetHicon's single-size shell fallback.
$stream = [IO.File]::Create($Path)
$writer = New-Object IO.BinaryWriter($stream)
try {
    $writer.Write([uint16]0); $writer.Write([uint16]1); $writer.Write([uint16]$frames.Count)
    $offset = 6 + 16 * $frames.Count
    foreach ($frame in $frames) {
        $dimension = if ($frame[0] -eq 256) { 0 } else { $frame[0] }
        $writer.Write([byte]$dimension); $writer.Write([byte]$dimension)
        $writer.Write([byte]0); $writer.Write([byte]0); $writer.Write([uint16]1); $writer.Write([uint16]32)
        $writer.Write([uint32]$frame[1].Length); $writer.Write([uint32]$offset)
        $offset += $frame[1].Length
    }
    foreach ($frame in $frames) { $writer.Write([byte[]]$frame[1]) }
} finally { $writer.Dispose(); $stream.Dispose() }
