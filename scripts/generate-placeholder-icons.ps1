Add-Type -AssemblyName System.Drawing

$iconsDir = "D:\Trainers\Grading\trainers-grading\public\icons"

function New-IconPng {
    param(
        [int]$Size,
        [string]$OutPath,
        [bool]$Maskable = $false
    )

    $bmp = New-Object System.Drawing.Bitmap($Size, $Size)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAlias

    $brandBrush = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml('#1a237e'))
    $whiteBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)

    if ($Maskable) {
        $g.FillRectangle($brandBrush, 0, 0, $Size, $Size)
    } else {
        $cornerRadius = [int]($Size * 0.18)
        $d = $cornerRadius * 2
        $gfx = New-Object System.Drawing.Drawing2D.GraphicsPath
        $gfx.AddArc(0, 0, $d, $d, 180, 90)
        $gfx.AddArc($Size - $d, 0, $d, $d, 270, 90)
        $gfx.AddArc($Size - $d, $Size - $d, $d, $d, 0, 90)
        $gfx.AddArc(0, $Size - $d, $d, $d, 90, 90)
        $gfx.CloseFigure()
        $g.FillPath($brandBrush, $gfx)
        $gfx.Dispose()
    }

    $fontSize = if ($Maskable) { [int]($Size * 0.42) } else { [int]($Size * 0.55) }
    $font = New-Object System.Drawing.Font('Segoe UI', $fontSize, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
    $sf = New-Object System.Drawing.StringFormat
    $sf.Alignment = [System.Drawing.StringAlignment]::Center
    $sf.LineAlignment = [System.Drawing.StringAlignment]::Center
    $rect = New-Object System.Drawing.RectangleF(0, 0, $Size, $Size)
    $g.DrawString('T', $font, $whiteBrush, $rect, $sf)

    $bmp.Save($OutPath, [System.Drawing.Imaging.ImageFormat]::Png)

    $font.Dispose()
    $sf.Dispose()
    $brandBrush.Dispose()
    $whiteBrush.Dispose()
    $g.Dispose()
    $bmp.Dispose()
}

New-IconPng -Size 192 -OutPath "$iconsDir\icon-192.png"
New-IconPng -Size 512 -OutPath "$iconsDir\icon-512.png"
New-IconPng -Size 512 -OutPath "$iconsDir\icon-maskable.png" -Maskable $true

Get-ChildItem $iconsDir | Select-Object Name, Length
