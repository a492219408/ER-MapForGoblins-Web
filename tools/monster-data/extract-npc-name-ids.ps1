param(
    [Parameter(Mandatory = $true)][string]$Regulation,
    [Parameter(Mandatory = $true)][string]$SoulsFormats,
    [Parameter(Mandatory = $true)][string]$NpcParamDef,
    [Parameter(Mandatory = $true)][string]$LibZstdDirectory,
    [string]$Output = "runtime/work/monster-data/npc-name-ids.json"
)

$ErrorActionPreference = "Stop"
$regulationPath = (Resolve-Path -LiteralPath $Regulation).Path
$soulsFormatsPath = (Resolve-Path -LiteralPath $SoulsFormats).Path
$npcParamDefPath = (Resolve-Path -LiteralPath $NpcParamDef).Path
$zstdDirectoryPath = (Resolve-Path -LiteralPath $LibZstdDirectory).Path
$outputPath = [System.IO.Path]::GetFullPath($Output, (Get-Location).Path)

$env:PATH = "$zstdDirectoryPath;$env:PATH"
Add-Type -Path $soulsFormatsPath

$binder = [SoulsFormats.SFUtil]::DecryptERRegulation($regulationPath)
$npcFile = $binder.Files | Where-Object { $_.Name -like "*\NpcParam.param" } | Select-Object -First 1
if ($null -eq $npcFile) {
    throw "regulation.bin 中没有 NpcParam.param"
}

$temporaryPath = [System.IO.Path]::Combine(
    [System.IO.Path]::GetTempPath(),
    "mfg-npc-param-$([guid]::NewGuid()).param"
)
try {
    [System.IO.File]::WriteAllBytes($temporaryPath, $npcFile.Bytes.ToArray())
    $parameter = [SoulsFormats.PARAM]::Read($temporaryPath)
    $definition = [SoulsFormats.PARAMDEF]::XmlDeserialize($npcParamDefPath, $false)
    $parameter.ApplyParamdef($definition)

    $mappings = [ordered]@{}
    foreach ($row in $parameter.Rows) {
        $cell = $row.Cells | Where-Object { $_.Def.InternalName -eq "nameId" } | Select-Object -First 1
        if ($null -ne $cell -and [int64]$cell.Value -gt 0) {
            $mappings[[string]$row.ID] = [int64]$cell.Value
        }
    }

    $outputDirectory = [System.IO.Path]::GetDirectoryName($outputPath)
    [System.IO.Directory]::CreateDirectory($outputDirectory) | Out-Null
    [ordered]@{
        schemaVersion = 1
        source = [ordered]@{
            regulation = [System.IO.Path]::GetFileName($regulationPath)
            regulationSha256 = (Get-FileHash -LiteralPath $regulationPath -Algorithm SHA256).Hash.ToLowerInvariant()
            param = "NpcParam"
            field = "nameId"
        }
        mappings = $mappings
    } | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $outputPath -Encoding utf8
    Write-Host "已从官方 regulation.bin 提取 $($mappings.Count) 条 NpcParam.nameId 映射：$outputPath"
}
finally {
    if ([System.IO.File]::Exists($temporaryPath)) {
        [System.IO.File]::Delete($temporaryPath)
    }
}
