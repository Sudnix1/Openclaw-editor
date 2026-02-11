# Create optimized deployment zip
$sourcePath = "C:\Users\benar\Downloads\APP\APP2"
$deploymentPath = "C:\Users\benar\Downloads\APP2-deployment"
$zipPath = "C:\Users\benar\Downloads\APP2-deployment.zip"

Write-Host "Creating deployment package..."

# Remove old deployment folder if exists
if (Test-Path $deploymentPath) {
    Remove-Item $deploymentPath -Recurse -Force
}

# Create deployment folder
New-Item -ItemType Directory -Path $deploymentPath | Out-Null

# Files and folders to EXCLUDE
$excludePatterns = @(
    "node_modules",
    ".git",
    ".qodo",
    "data\*.db",
    "data\recipes.db",
    "pinclicks\downloads",
    "pinclicks\chrome-profile",
    "public\temp_crops",
    "recipe_images",
    "temp",
    "prompt_logs",
    "*.zip",
    "*.log",
    "*_BACKUP*.js",
    "*_BACKUP*.ejs",
    "*WORKING_BACKUP*",
    "*.md~",
    ".DS_Store",
    "Thumbs.db"
)

Write-Host "Copying essential files..."

# Copy files
Get-ChildItem -Path $sourcePath -Recurse | ForEach-Object {
    $relativePath = $_.FullName.Substring($sourcePath.Length + 1)
    $shouldExclude = $false

    foreach ($pattern in $excludePatterns) {
        if ($relativePath -like "*$pattern*") {
            $shouldExclude = $true
            break
        }
    }

    if (-not $shouldExclude) {
        $destPath = Join-Path $deploymentPath $relativePath

        if ($_.PSIsContainer) {
            if (-not (Test-Path $destPath)) {
                New-Item -ItemType Directory -Path $destPath -Force | Out-Null
            }
        } else {
            $destDir = Split-Path $destPath -Parent
            if (-not (Test-Path $destDir)) {
                New-Item -ItemType Directory -Path $destDir -Force | Out-Null
            }
            Copy-Item $_.FullName $destPath -Force
        }
    }
}

Write-Host "Creating zip file..."

if (Test-Path $zipPath) {
    Remove-Item $zipPath -Force
}

Compress-Archive -Path "$deploymentPath\*" -DestinationPath $zipPath -CompressionLevel Optimal

$zipSize = (Get-Item $zipPath).Length / 1MB
$zipSizeFormatted = [math]::Round($zipSize, 2)

Write-Host ""
Write-Host "SUCCESS! Deployment package created"
Write-Host "Location: $zipPath"
Write-Host "Size: $zipSizeFormatted MB"

if ($zipSizeFormatted -gt 10) {
    Write-Host ""
    Write-Host "WARNING: Zip file is still larger than 10MB"
    Write-Host "You may need to exclude more files"
} else {
    Write-Host ""
    Write-Host "File size is under 10MB - ready for upload!"
}
