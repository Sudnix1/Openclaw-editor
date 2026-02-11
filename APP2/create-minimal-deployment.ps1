# Create MINIMAL deployment zip (only essential runtime files)
$sourcePath = "C:\Users\benar\Downloads\APP\APP2"
$deploymentPath = "C:\Users\benar\Downloads\APP2-minimal"
$zipPath = "C:\Users\benar\Downloads\APP2-minimal.zip"

Write-Host "Creating MINIMAL deployment package..."

# Remove old deployment folder
if (Test-Path $deploymentPath) {
    Remove-Item $deploymentPath -Recurse -Force
}
New-Item -ItemType Directory -Path $deploymentPath | Out-Null

# ESSENTIAL FILES TO INCLUDE (whitelist approach)
$essentialFiles = @(
    "package.json",
    "package-lock.json",
    ".env.example",
    ".npmrc",
    "server.js",
    "app.js",
    "db.js",
    "init-db.js",
    "api-key-manager.js",
    "wordpress.js",
    "wordpress-db.js",
    "prompt-settings-db.js",
    "pinterest-image-generator.js",
    "wp-recipe-maker.js",
    "CLAUDE.md"
)

# ESSENTIAL FOLDERS TO INCLUDE (copy entire folder)
$essentialFolders = @(
    "middleware",
    "models",
    "services",
    "views",
    "migrations",
    "utils"
)

# PUBLIC FOLDER - Copy only essential assets (not images)
$publicEssentials = @(
    "public\css",
    "public\js",
    "public\fonts"
)

# MIDJOURNEY FOLDER - Only essential files
$midjourneyFiles = @(
    "midjourney\image-generator.js",
    "midjourney\midjourney-client.js"
)

# Copy essential root files
Write-Host "Copying essential root files..."
foreach ($file in $essentialFiles) {
    $sourcefile = Join-Path $sourcePath $file
    $destFile = Join-Path $deploymentPath $file
    if (Test-Path $sourceFile) {
        Copy-Item $sourceFile $destFile -Force
    }
}

# Copy essential folders
Write-Host "Copying essential folders..."
foreach ($folder in $essentialFolders) {
    $sourceFolder = Join-Path $sourcePath $folder
    $destFolder = Join-Path $deploymentPath $folder
    if (Test-Path $sourceFolder) {
        Copy-Item $sourceFolder $destFolder -Recurse -Force
    }
}

# Copy public assets (not images)
Write-Host "Copying public assets..."
foreach ($publicPath in $publicEssentials) {
    $sourcePub = Join-Path $sourcePath $publicPath
    $destPub = Join-Path $deploymentPath $publicPath
    if (Test-Path $sourcePub) {
        $destDir = Split-Path $destPub -Parent
        if (-not (Test-Path $destDir)) {
            New-Item -ItemType Directory -Path $destDir -Force | Out-Null
        }
        Copy-Item $sourcePub $destPub -Recurse -Force
    }
}

# Copy midjourney files
Write-Host "Copying Midjourney files..."
$midjourneyDir = Join-Path $deploymentPath "midjourney"
New-Item -ItemType Directory -Path $midjourneyDir -Force | Out-Null
foreach ($mjFile in $midjourneyFiles) {
    $sourceMj = Join-Path $sourcePath $mjFile
    $destMj = Join-Path $deploymentPath $mjFile
    if (Test-Path $sourceMj) {
        Copy-Item $sourceMj $destMj -Force
    }
}

# Create empty data directory
$dataDir = Join-Path $deploymentPath "data"
New-Item -ItemType Directory -Path $dataDir -Force | Out-Null

# Create fonts directory if needed
$fontsDir = Join-Path $sourcePath "fonts"
$destFontsDir = Join-Path $deploymentPath "fonts"
if (Test-Path $fontsDir) {
    Copy-Item $fontsDir $destFontsDir -Recurse -Force
}

# Create deployment README
$readmeContent = @"
# Minimal Deployment Package

## Installation
1. Extract files
2. Run: npm install
3. Copy .env.example to .env and configure
4. Run: npm run init-db
5. Run: npm start

## What's Included
- Core application files
- Views and templates
- Public assets (CSS, JS, fonts)
- Migration scripts
- Essential services

## What's NOT Included (run npm install)
- node_modules
- Database files
- Test/debug files
- Documentation files
- Backup files
"@

Set-Content -Path (Join-Path $deploymentPath "DEPLOYMENT_README.md") -Value $readmeContent

# Create the zip
Write-Host "Creating zip file..."
if (Test-Path $zipPath) {
    Remove-Item $zipPath -Force
}

Compress-Archive -Path "$deploymentPath\*" -DestinationPath $zipPath -CompressionLevel Optimal

$zipSize = (Get-Item $zipPath).Length / 1MB
$zipSizeFormatted = [math]::Round($zipSize, 2)

Write-Host ""
Write-Host "SUCCESS! Minimal deployment created"
Write-Host "Location: $zipPath"
Write-Host "Size: $zipSizeFormatted MB"

if ($zipSizeFormatted -gt 10) {
    Write-Host ""
    Write-Host "WARNING: Still larger than 10MB"
    Write-Host "Consider splitting into multiple parts"
} else {
    Write-Host ""
    Write-Host "Ready for upload!"
}
