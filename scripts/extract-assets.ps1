$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$source = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../assets/craft-pix'))
$packs = @{ '180537'='characters'; '189510'='grassland'; '219768'='fishing-icons'; '255216'='ui'; '596440'='fishing'; '885927'='village' }
foreach ($archive in Get-ChildItem -LiteralPath $source -Filter *.zip) {
  $id = [regex]::Match($archive.Name, '\d{6}').Value
  if (-not $packs.ContainsKey($id)) { continue }
  $destination = [IO.Path]::GetFullPath((Join-Path $source ('extracted/' + $packs[$id])))
  [IO.Directory]::CreateDirectory($destination) | Out-Null
  $zip = [IO.Compression.ZipFile]::OpenRead($archive.FullName)
  try {
    foreach ($entry in $zip.Entries) {
      if ($entry.FullName -match '__MACOSX|\.DS_Store' -or $entry.FullName.EndsWith('/')) { continue }
      $target = [IO.Path]::GetFullPath((Join-Path $destination $entry.FullName))
      if (-not $target.StartsWith($destination + [IO.Path]::DirectorySeparatorChar)) { throw 'Invalid archive path' }
      [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($target)) | Out-Null
      [IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $target, $true)
    }
  } finally { $zip.Dispose() }
  Write-Output ('Extracted ' + $packs[$id])
}
