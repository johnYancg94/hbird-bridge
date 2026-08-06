param(
    [ValidatePattern('^[0-9A-Za-z.-]+$')]
    [string]$Version = '1.11.2',
    [string]$OutputDirectory = ''
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if ([string]::IsNullOrWhiteSpace($OutputDirectory)) {
    $OutputDirectory = Join-Path $repoRoot 'dist'
} elseif (-not [System.IO.Path]::IsPathRooted($OutputDirectory)) {
    $OutputDirectory = Join-Path $repoRoot $OutputDirectory
}

$outputRoot = [System.IO.Path]::GetFullPath($OutputDirectory).TrimEnd('\')
if ($outputRoot.Equals($repoRoot.TrimEnd('\'), [System.StringComparison]::OrdinalIgnoreCase)) {
    throw '发布输出目录不能直接使用仓库根目录。'
}

$packageName = "Hbird-Bridge-v$Version"
$stageRoot = [System.IO.Path]::GetFullPath((Join-Path $outputRoot $packageName))
$zipPath = [System.IO.Path]::GetFullPath((Join-Path $outputRoot "$packageName.zip"))
$checksumPath = "$zipPath.sha256"
$outputPrefix = $outputRoot + [System.IO.Path]::DirectorySeparatorChar

foreach ($target in @($stageRoot, $zipPath, $checksumPath)) {
    if (-not $target.StartsWith($outputPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "发布目标超出输出目录：$target"
    }
}

New-Item -ItemType Directory -Path $outputRoot -Force | Out-Null
if (Test-Path -LiteralPath $stageRoot) {
    Remove-Item -LiteralPath $stageRoot -Recurse -Force
}
foreach ($filePath in @($zipPath, $checksumPath)) {
    if (Test-Path -LiteralPath $filePath) {
        Remove-Item -LiteralPath $filePath -Force
    }
}
New-Item -ItemType Directory -Path $stageRoot -Force | Out-Null

$releaseFiles = @(
    'index.html',
    '一键安装.bat',
    '安装说明.txt',
    'README.md',
    'CHANGELOG.md',
    'CSXS\manifest.xml',
    'css\style.css',
    'js\CSInterface.js',
    'js\asset-utils.js',
    'js\browser-download-utils.js',
    'js\directory-history-utils.js',
    'js\main.js',
    'js\marquee-ratio-utils.js'
)

foreach ($fileName in $releaseFiles) {
    $sourcePath = Join-Path $repoRoot $fileName
    if (-not (Test-Path -LiteralPath $sourcePath -PathType Leaf)) {
        throw "缺少发布文件：$fileName"
    }
    $destinationPath = Join-Path $stageRoot $fileName
    $destinationDirectory = Split-Path -Parent $destinationPath
    if (-not (Test-Path -LiteralPath $destinationDirectory)) {
        New-Item -ItemType Directory -Path $destinationDirectory -Force | Out-Null
    }
    Copy-Item -LiteralPath $sourcePath -Destination $destinationPath -Force
}

$unexpected = @(Get-ChildItem -LiteralPath $stageRoot -Recurse -Force | Where-Object {
    $_.Name -like '*.bak*' -or
    $_.Name -in @('.debug', '.gitignore') -or
    $_.FullName -like '*\tests\*' -or
    $_.FullName -like '*\.github\*' -or
    $_.FullName -like '*\scripts\*'
})
if ($unexpected.Count -gt 0) {
    $unexpected.FullName | ForEach-Object { Write-Error "发布包包含开发文件：$_" }
    throw '发布包内容检查失败。'
}

Compress-Archive -Path (Join-Path $stageRoot '*') -DestinationPath $zipPath -CompressionLevel Optimal
Remove-Item -LiteralPath $stageRoot -Recurse -Force

$hash = (Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash.ToLowerInvariant()
$checksumLine = "$hash  $([System.IO.Path]::GetFileName($zipPath))`r`n"
[System.IO.File]::WriteAllText($checksumPath, $checksumLine, [System.Text.UTF8Encoding]::new($false))

Write-Output "发布包：$zipPath"
Write-Output "校验文件：$checksumPath"
Write-Output "SHA-256：$hash"
