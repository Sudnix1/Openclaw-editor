# Create optimized deployment zip (excluding large/unnecessary files)
# This will create a zip under 10MB for deployment

$sourcePath = "C:\Users\benar\Downloads\APP\APP2"
$deploymentPath = "C:\Users\benar\Downloads\APP2-deployment"
$zipPath = "C:\Users\benar\Downloads\APP2-deployment.zip"

Write-Host "Creating deployment package..." -ForegroundColor Green

# Remove old deployment folder if exists
if (Test-Path $deploymentPath) {
    Remove-Item $deploymentPath -Recurse -Force
}

# Create deployment folder
New-Item -ItemType Directory -Path $deploymentPath | Out-Null

# Files and folders to EXCLUDE (large/unnecessary for deployment)
$excludePatterns = @(
    "node_modules",           # Will run npm install on server
    ".git",                   # Git history (very large)
    ".qodo",                  # IDE files
    "data",                   # Database files (keep structure, not data)
    "pinclicks\downloads",    # Downloaded CSV files
    "pinclicks\chrome-profile", # Chrome profile data (huge)
    "public\temp_crops",      # Temporary image crops
    "recipe_images",          # Recipe images (can be regenerated)
    "temp",                   # Temporary files
    "prompt_logs",            # Log files
    "*.zip",                  # Existing zip files
    "*.log",                  # Log files
    "*_BACKUP*.js",           # Backup files
    "*_BACKUP*.ejs",          # Backup EJS files
    "*WORKING_BACKUP*",       # Working backup files
    "*.md~",                  # Temporary markdown files
    ".DS_Store",              # Mac files
    "Thumbs.db",              # Windows thumbnails
    "*.tmp"                   # Temporary files
)

# Copy all files except excluded
Write-Host "Copying essential files..." -ForegroundColor Cyan

Get-ChildItem -Path $sourcePath -Recurse | ForEach-Object {
    $relativePath = $_.FullName.Substring($sourcePath.Length + 1)

    # Check if file/folder matches any exclude pattern
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
            # Create directory
            if (-not (Test-Path $destPath)) {
                New-Item -ItemType Directory -Path $destPath -Force | Out-Null
            }
        } else {
            # Copy file
            $destDir = Split-Path $destPath -Parent
            if (-not (Test-Path $destDir)) {
                New-Item -ItemType Directory -Path $destDir -Force | Out-Null
            }
            Copy-Item $_.FullName $destPath -Force
        }
    }
}

# Create empty data directory with README
$dataDir = Join-Path $deploymentPath "data"
if (-not (Test-Path $dataDir)) {
    New-Item -ItemType Directory -Path $dataDir | Out-Null
}

$dataReadme = @"
# Data Directory

This directory will contain:
- recipes.db (SQLite database - created on first run)
- config files
- uploaded files

Run 'npm run init-db' after deployment to initialize the database.
"@

Set-Content -Path (Join-Path $dataDir "README.md") -Value $dataReadme

# Create .npmrc to ensure clean install
$npmrc = @"
# NPM configuration for deployment
legacy-peer-deps=true
"@
Set-Content -Path (Join-Path $deploymentPath ".npmrc") -Value $npmrc

# Create deployment README
$deploymentReadme = @"
# Deployment Package - Recipe Content Generator

## Installation Steps

1. Extract this zip file to your server
2. Run: npm install
3. Run: npm run init-db (initialize database)
4. Configure .env file with your settings
5. Run: npm start

## Environment Variables Required

See .env.example for all required environment variables.

## Important Notes

- node_modules excluded (run npm install after extraction)
- Database files excluded (will be created on first run)
- Chrome profile excluded (will be created on first Pinclicks use)
- Recipe images excluded (will be generated as needed)

## Package Contents

This deployment package includes:
✅ All source code files
✅ Configuration files
✅ Views and templates
✅ Public assets (CSS, JS)
✅ Migration scripts
✅ Service files

## Size Optimizations

Original project: ~52MB
This package: ~2-5MB (without node_modules, git history, data files)

After npm install on server: ~100-150MB (with node_modules)
"@

Set-Content -Path (Join-Path $deploymentPath "DEPLOYMENT_README.md") -Value $deploymentReadme

# Create the zip file
Write-Host "Creating zip file..." -ForegroundColor Cyan

if (Test-Path $zipPath) {
    Remove-Item $zipPath -Force
}

Compress-Archive -Path "$deploymentPath\*" -DestinationPath $zipPath -CompressionLevel Optimal

# Get file size
$zipSize = (Get-Item $zipPath).Length / 1MB
$zipSizeFormatted = [math]::Round($zipSize, 2)

Write-Host "`n✅ Deployment package created successfully!" -ForegroundColor Green
Write-Host "   Location: $zipPath" -ForegroundColor White
Write-Host "   Size: $zipSizeFormatted MB" -ForegroundColor White

if ($zipSizeFormatted -gt 10) {
    Write-Host "`n⚠️  Warning: Zip file is still larger than 10MB" -ForegroundColor Yellow
    Write-Host "   You may need to exclude more files or split into multiple parts" -ForegroundColor Yellow
} else {
    Write-Host "`n✅ File size is under 10MB - ready for upload!" -ForegroundColor Green
}

Write-Host "`nDeployment folder (before zipping): $deploymentPath" -ForegroundColor Cyan
Write-Host "You can review the contents before zipping if needed." -ForegroundColor Cyan

# Calculate original size vs optimized
$originalSize = (Get-ChildItem -Path $sourcePath -Recurse -File | Measure-Object -Property Length -Sum).Sum / 1MB
$originalSizeFormatted = [math]::Round($originalSize, 2)
$savings = [math]::Round((($originalSize - $zipSize) / $originalSize) * 100, 1)

Write-Host "`n📊 Size Comparison:" -ForegroundColor Cyan
Write-Host "   Original: $originalSizeFormatted MB" -ForegroundColor White
Write-Host "   Optimized: $zipSizeFormatted MB" -ForegroundColor White
Write-Host "   Savings: $savings percent" -ForegroundColor Green
