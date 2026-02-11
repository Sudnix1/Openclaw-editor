// pinterest-excel-exporter.js - FIXED VERSION with database lookup
const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');

// Use the same recipe_images directory as your existing system
const recipeImagesDir = path.join(__dirname, 'recipe_images');

/**
 * Find grid images for Pinterest export using DATABASE LOOKUP (FIXED VERSION)
 * @param {string} recipeId - Recipe ID to find grid images for
 * @returns {Promise<Array>} - Array of grid image paths
 */
async function findGridImages(recipeId) {
  try {
    console.log(`🔍 Looking for grid images for recipe ID: ${recipeId}`);
    
    // STEP 1: Query the database for grid images (THIS IS THE FIX!)
    const db = require('./db');
    
    try {
      const gridImages = await db.getAll(
        "SELECT image_path FROM recipe_images WHERE recipe_id = ? AND image_path LIKE 'grid_%' ORDER BY created_at DESC",
        [recipeId]
      );
      
      console.log(`📊 Database query found ${gridImages.length} grid images for recipe ${recipeId}`);
      
      if (gridImages && gridImages.length > 0) {
        // Convert database paths to full file paths and verify they exist
        const validImagePaths = [];
        
        for (const img of gridImages) {
          const fullPath = path.join(recipeImagesDir, img.image_path);
          console.log(`🔍 Checking grid image: ${img.image_path} at ${fullPath}`);
          
          if (fs.existsSync(fullPath)) {
            validImagePaths.push(fullPath);
            console.log(`✅ Found valid grid image: ${img.image_path}`);
          } else {
            console.warn(`⚠️ Grid image file not found: ${fullPath}`);
          }
        }
        
        if (validImagePaths.length > 0) {
          console.log(`✅ Returning ${validImagePaths.length} valid grid images for recipe ${recipeId}`);
          return validImagePaths.slice(0, 2); // Return up to 2 images
        }
      }
    } catch (dbError) {
      console.warn(`⚠️ Database query failed for recipe ${recipeId}:`, dbError.message);
      console.log('📁 Falling back to filesystem search...');
    }
    
    // STEP 2: Fallback - search filesystem (original method)
    if (!fs.existsSync(recipeImagesDir)) {
      console.log(`❌ Recipe images directory not found: ${recipeImagesDir}`);
      return [];
    }
    
    const files = fs.readdirSync(recipeImagesDir);
    console.log(`📁 Searching ${files.length} files for grid images containing recipe ID ${recipeId}`);
    
    // Look for grid images - try multiple patterns
    const gridFiles = files.filter(file => {
      const fileName = file.toLowerCase();
      const recipeIdLower = recipeId.toLowerCase();
      
      // Pattern 1: Contains both recipe ID and 'grid'
      const hasRecipeId = fileName.includes(recipeIdLower);
      const hasGrid = fileName.includes('grid');
      
      return hasRecipeId && hasGrid;
    });
    
    console.log(`📁 Filesystem search found ${gridFiles.length} potential grid files:`, gridFiles);
    
    if (gridFiles.length > 0) {
      // Sort by creation time (descending) to get the most recent first
      const sortedFiles = gridFiles.sort((a, b) => {
        try {
          const statsA = fs.statSync(path.join(recipeImagesDir, a));
          const statsB = fs.statSync(path.join(recipeImagesDir, b));
          return statsB.mtimeMs - statsA.mtimeMs;
        } catch (e) {
          return 0;
        }
      });
      
      console.log(`✅ Found ${gridFiles.length} grid images for recipe ${recipeId}:`, sortedFiles);
      
      // Return full paths for up to 2 grid images
      return sortedFiles.slice(0, 2).map(file => path.join(recipeImagesDir, file));
    }
    
    console.log(`❌ No grid images found for recipe ${recipeId}`);
    return [];
  } catch (error) {
    console.error(`❌ Error finding grid images for recipe ${recipeId}:`, error.message);
    return [];
  }
}

/**
 * Get image extension for ExcelJS (same as your working version)
 * @param {string} imagePath - Path to the image file
 * @returns {string} - Extension without the dot
 */
function getImageExtension(imagePath) {
  const ext = path.extname(imagePath).toLowerCase().substring(1);
  // ExcelJS supports: jpeg, png, gif
  if (ext === 'webp') {
    return 'png'; // fallback for webp
  }
  if (ext === 'jpg') {
    return 'jpeg';
  }
  return ext;
}

/**
 * Export Pinterest data to Excel file with embedded grid images
 * @param {Array} pinterestData - Array of Pinterest data objects
 * @returns {Promise<Buffer>} - Excel file as buffer
 */
async function exportPinterestToExcel(pinterestData) {
  // Create a new workbook (same pattern as your working exporter)
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Pinterest Export');
  
  // Set up columns
  worksheet.columns = [
    { header: 'Image 1 (Grid)', key: 'image1', width: 30 },
    { header: 'Image 2 (Grid)', key: 'image2', width: 30 },
    { header: 'Overlay Text', key: 'overlayText', width: 40 }
  ];
  
  // Style the header row (Pinterest theme)
  worksheet.getRow(1).font = { bold: true };
  worksheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE60023' } // Pinterest red
  };
  
  // Set the row height for images (same as your working version)
  const imageRowHeight = 120;
  
  console.log(`Processing ${pinterestData.length} Pinterest items for Excel export with embedded images`);
  
  // Add Pinterest data
  for (let i = 0; i < pinterestData.length; i++) {
    const item = pinterestData[i];
    console.log(`Processing Pinterest item: ${item.recipeTitle} (Recipe ID: ${item.recipeId})`);
    
    // Set row index (row 1 is header, so data starts at row 2)
    const rowIndex = i + 2;
    
    // Add text data to the row
    worksheet.getRow(rowIndex).getCell('overlayText').value = item.overlayText || '';
    
    // Set row height to accommodate images (same as your working version)
    worksheet.getRow(rowIndex).height = imageRowHeight;
    
    // Look for grid images using FIXED database lookup
    const gridImagePaths = await findGridImages(item.recipeId);
    
    // Use the same grid image for both columns (FIXED - duplicate same image)
    const gridImageToUse = gridImagePaths.length > 0 ? gridImagePaths[0] : null;
    
    // Add Image 1 (same grid image)
    if (gridImageToUse && fs.existsSync(gridImageToUse)) {
      try {
        console.log(`Adding Image 1 to Excel: ${gridImageToUse}`);
        
        // Get the image extension for ExcelJS
        const imageExtension = getImageExtension(gridImageToUse);
        
        // Standard image dimensions for the cell
        const imageWidth = 120;
        const imageHeight = 120;
        
        // Add the image to the workbook for column 1
        const imageId1 = workbook.addImage({
          filename: gridImageToUse,
          extension: imageExtension
        });
        
        // Calculate cell address for image (column A is the first image column)
        const imageCell1 = worksheet.getCell('A' + rowIndex);
        const colNumber1 = imageCell1.col - 1; // Convert to 0-based
        const rowNumber1 = imageCell1.row - 1; // Convert to 0-based
        
        // Add image to worksheet with proper positioning
        worksheet.addImage(imageId1, {
          tl: { col: colNumber1 + 0.1, row: rowNumber1 + 0.1 }, // Small offset from cell border
          ext: { width: imageWidth, height: imageHeight },
          editAs: 'oneCell'
        });
        
        console.log(`Image 1 added successfully to row ${rowIndex}`);
      } catch (error) {
        console.error(`Error adding image 1 to Excel: ${error.message}`);
        
        // Add a placeholder text if image fails to load
        worksheet.getRow(rowIndex).getCell('image1').value = `Image: ${path.basename(gridImageToUse)}`;
      }
    } else {
      console.log(`No Image 1 found for recipe ${item.recipeId}`);
      worksheet.getRow(rowIndex).getCell('image1').value = 'No grid image 1';
    }
    
    // Add Image 2 (SAME grid image as Image 1)
    if (gridImageToUse && fs.existsSync(gridImageToUse)) {
      try {
        console.log(`Adding Image 2 to Excel (same as Image 1): ${gridImageToUse}`);
        
        // Get the image extension for ExcelJS
        const imageExtension = getImageExtension(gridImageToUse);
        
        // Standard image dimensions for the cell
        const imageWidth = 120;
        const imageHeight = 120;
        
        // Add the SAME image to the workbook for column 2 (need separate image ID)
        const imageId2 = workbook.addImage({
          filename: gridImageToUse,
          extension: imageExtension
        });
        
        // Calculate cell address for image (column B is the second image column)
        const imageCell2 = worksheet.getCell('B' + rowIndex);
        const colNumber2 = imageCell2.col - 1; // Convert to 0-based
        const rowNumber2 = imageCell2.row - 1; // Convert to 0-based
        
        // Add image to worksheet with proper positioning
        worksheet.addImage(imageId2, {
          tl: { col: colNumber2 + 0.1, row: rowNumber2 + 0.1 }, // Small offset from cell border
          ext: { width: imageWidth, height: imageHeight },
          editAs: 'oneCell'
        });
        
        console.log(`Image 2 (duplicate) added successfully to row ${rowIndex}`);
      } catch (error) {
        console.error(`Error adding image 2 to Excel: ${error.message}`);
        
        // Add a placeholder text if image fails to load
        worksheet.getRow(rowIndex).getCell('image2').value = `Image: ${path.basename(gridImageToUse)}`;
      }
    } else {
      console.log(`No Image 2 found for recipe ${item.recipeId}`);
      worksheet.getRow(rowIndex).getCell('image2').value = 'No grid image 2';
    }
    
    // Add some styling to the row (same as your working version)
    worksheet.getRow(rowIndex).alignment = { vertical: 'top', wrapText: true };
  }
  
  // Auto-fit columns (same as your working version)
  worksheet.columns.forEach((column, index) => {
    if (index < 2) { // Don't auto-fit the image columns
      let maxLength = 0;
      column.eachCell({ includeEmpty: true }, (cell) => {
        const columnLength = cell.value ? cell.value.toString().length : 10;
        if (columnLength > maxLength) {
          maxLength = columnLength;
        }
      });
      column.width = Math.min(maxLength < 10 ? 10 : maxLength, 50);
    }
  });
  
  // Generate Excel file (same as your working version)
  console.log('Generating Pinterest Excel file with embedded images');
  const buffer = await workbook.xlsx.writeBuffer();
  console.log(`Pinterest Excel file generated successfully: ${buffer.length} bytes`);
  
  return buffer;
}

// Export functions (same pattern as your working exporter)
module.exports = {
  exportPinterestToExcel
};