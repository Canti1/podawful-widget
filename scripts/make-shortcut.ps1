# Creates a "PodAwful Widget" desktop shortcut with the clickhead icon.
$root = Split-Path -Parent $PSScriptRoot
$assets = Join-Path $root 'assets'
$ico = Join-Path $assets 'clickhead.ico'

# Convert the JPG to a 256x256 PNG-in-ICO (supported by Windows Vista+).
Add-Type -AssemblyName System.Drawing
$src = [Drawing.Image]::FromFile((Join-Path $assets 'clickhead.jpg'))
$bmp = New-Object Drawing.Bitmap 256, 256
$g = [Drawing.Graphics]::FromImage($bmp)
$g.InterpolationMode = 'HighQualityBicubic'
$g.DrawImage($src, 0, 0, 256, 256)
$ms = New-Object IO.MemoryStream
$bmp.Save($ms, [Drawing.Imaging.ImageFormat]::Png)
$png = $ms.ToArray()
$fs = [IO.File]::Create($ico)
$w = New-Object IO.BinaryWriter $fs
$w.Write([UInt16]0); $w.Write([UInt16]1); $w.Write([UInt16]1)        # ICONDIR
$w.Write([Byte]0); $w.Write([Byte]0); $w.Write([Byte]0); $w.Write([Byte]0) # 256x256, no palette
$w.Write([UInt16]1); $w.Write([UInt16]32)                              # planes, bpp
$w.Write([UInt32]$png.Length); $w.Write([UInt32]22)                    # size, offset
$w.Write($png)
$w.Close(); $g.Dispose(); $bmp.Dispose(); $src.Dispose()

$electron = Join-Path $root 'node_modules\electron\dist\electron.exe'
$lnk = Join-Path ([Environment]::GetFolderPath('Desktop')) 'PodAwful Widget.lnk'
$sh = New-Object -ComObject WScript.Shell
$s = $sh.CreateShortcut($lnk)
$s.TargetPath = $electron
$s.Arguments = "`"$root`""
$s.WorkingDirectory = $root
$s.IconLocation = "$ico,0"
$s.Description = 'PodAwful Widget'
$s.Save()
"Shortcut created: $lnk"
