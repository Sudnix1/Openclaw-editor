// recipe-excel-exporter.js - Fixed version without jimp dependency
const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');

// Make sure the recipe_images directory exists
const recipeImagesDir = path.join(__dirname, 'recipe_images');
if (!fs.existsSync(recipeImagesDir)) {
  fs.mkdirSync(recipeImagesDir, { recursive: true });
  console.log(`Created missing recipe_images directory at ${recipeImagesDir}`);
} else {
  console.log(`Recipe images directory exists at ${recipeImagesDir}`);
  try {
    const files = fs.readdirSync(recipeImagesDir);
    console.log(`Found ${files.length} files in recipe_images directory`);
  } catch (error) {
    console.error(`Error reading recipe_images directory: ${error.message}`);
  }
}

/**
 * Find the best matching image file for a recipe
 * @param {string} recipeId - Recipe ID to find an image for
 * @param {string} originalPath - Original path from database
 * @returns {string|null} - Path to the best matching image or null if not found
 */
function findBestMatchingImage(recipeId, originalPath = null) {
  try {
    if (!fs.existsSync(recipeImagesDir)) {
      return null;
    }
    
    const files = fs.readdirSync(recipeImagesDir);
    console.log(`Searching ${files.length} files for a match to recipe ID ${recipeId}`);
    
    // First try the exact file if specified
    if (originalPath) {
      const exactPath = path.join(recipeImagesDir, path.basename(originalPath));
      if (fs.existsSync(exactPath)) {
        console.log(`Found exact match: ${exactPath}`);
        return exactPath;
      }
      
      // Try changing the extension (.png to .webp or vice versa)
      const baseFilename = path.basename(originalPath, path.extname(originalPath));
      const alternativeExtensions = ['.webp', '.png', '.jpg', '.jpeg'];
      
      for (const ext of alternativeExtensions) {
        const altPath = path.join(recipeImagesDir, `${baseFilename}${ext}`);
        if (fs.existsSync(altPath)) {
          console.log(`Found match with different extension: ${altPath}`);
          return altPath;
        }
      }
    }
    
    // If original path didn't work, try finding any file with the recipe ID
    const matchingFiles = files.filter(file => file.includes(recipeId));
    if (matchingFiles.length > 0) {
      // Sort by creation time (descending) to get the most recent
      const sortedFiles = matchingFiles.sort((a, b) => {
        try {
          const statsA = fs.statSync(path.join(recipeImagesDir, a));
          const statsB = fs.statSync(path.join(recipeImagesDir, b));
          return statsB.mtimeMs - statsA.mtimeMs;
        } catch (e) {
          return 0;
        }
      });
      
      console.log(`Found ${matchingFiles.length} files matching recipe ID, using: ${sortedFiles[0]}`);
      return path.join(recipeImagesDir, sortedFiles[0]);
    }
    
    console.log(`No matching image found for recipe ${recipeId}`);
    return null;
  } catch (error) {
    console.error(`Error finding matching image: ${error.message}`);
    return null;
  }
}

/**
 * Get image extension for ExcelJS
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
 * Export recipes to Excel file with embedded images
 * @param {Array} recipes - Array of recipe objects
 * @returns {Promise<Buffer>} - Excel file as buffer
 */
async function exportRecipesToExcel(recipes) {
  // Create a new workbook
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Recipes');
  
  // Set up columns
  worksheet.columns = [
    { header: 'Recipe Title', key: 'title', width: 30 },
    { header: 'Ingredient 1', key: 'ingredient1', width: 30 },
    { header: 'Ingredient 2', key: 'ingredient2', width: 30 },
    { header: 'Ingredient 3', key: 'ingredient3', width: 30 },
    { header: 'Image', key: 'image', width: 30 }
  ];
  
  // Style the header row
  worksheet.getRow(1).font = { bold: true };
  worksheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE6E6FA' }
  };
  
  // Set the row height for images
  const imageRowHeight = 120;
  
  console.log(`Processing ${recipes.length} recipes for Excel export with embedded images`);
  
  // Add recipe data
  for (let i = 0; i < recipes.length; i++) {
    const recipe = recipes[i];
    console.log(`Processing recipe: ${recipe.recipe_idea} (ID: ${recipe.id})`);
    
    // Extract title from recipe
    let title = '';
    
    // Try to extract title from generated recipe text first
    if (recipe.facebook && recipe.facebook.recipe_text) {
      try {
        const recipeFormatter = require('./recipe-formatter');
        const parsedRecipe = recipeFormatter.parseRecipe(recipe.facebook.recipe_text);
        title = parsedRecipe.title || '';
        console.log(`Parsed title from recipe_text: "${title}"`);
      } catch (error) {
        console.error(`Error parsing recipe text for title: ${error.message}`);
      }
    }
    
    // Fallback to original recipe idea if no title could be extracted
    if (!title) {
      title = recipe.recipe_idea || '';
      console.log(`Using fallback title from recipe_idea: "${title}"`);
    }
    
    // Extract ingredients
    
    // Extract ingredients
    let ingredientsList = [];
    if (recipe.facebook && recipe.facebook.ingredientsList) {
      // If we have a Facebook post with ingredients
      ingredientsList = recipe.facebook.ingredientsList;
      console.log(`Using ingredient list from facebook.ingredientsList: ${ingredientsList.length} ingredients`);
    } else if (recipe.facebook && recipe.facebook.recipe_text) {
      // Try to parse ingredients from recipe text
      try {
        const recipeFormatter = require('./recipe-formatter');
        const parsedRecipe = recipeFormatter.parseRecipe(recipe.facebook.recipe_text);
        ingredientsList = parsedRecipe.ingredients || [];
        console.log(`Parsed ingredients from recipe_text: ${ingredientsList.length} ingredients`);
      } catch (error) {
        console.error(`Error parsing recipe text for ingredients: ${error.message}`);
        ingredientsList = [];
      }
    }
    
    // Ensure we have at least 3 elements (even if empty)
    while (ingredientsList.length < 3) {
      ingredientsList.push('');
    }
    
    // Take only the first 3 ingredients
    ingredientsList = ingredientsList.slice(0, 3);
    
// Clean the ingredients (remove bullet points, etc.) - FIXED VERSION
    ingredientsList = ingredientsList.map(ingredient => {
      // Remove bullet points and dashes at the start, but preserve measurements
      return ingredient
        .replace(/^[•\-]\s*/, '') // Remove bullet or dash followed by optional space at start
        .replace(/\s*$/, '') // Remove whitespace at end
        .trim(); // Final trim for any remaining whitespace
    });
    
    // Set row index (row 1 is header, so data starts at row 2)
    const rowIndex = i + 2;
    
    // Add text data to the row
    worksheet.getRow(rowIndex).getCell('title').value = title;
    worksheet.getRow(rowIndex).getCell('ingredient1').value = ingredientsList[0] || '';
    worksheet.getRow(rowIndex).getCell('ingredient2').value = ingredientsList[1] || '';
    worksheet.getRow(rowIndex).getCell('ingredient3').value = ingredientsList[2] || '';
    
    // Set row height to accommodate images
    worksheet.getRow(rowIndex).height = imageRowHeight;
    
    // Look for the image
    let imagePath = null;
    
    // Check for recipe images directly from the database
    if (recipe.recipe_images && recipe.recipe_images.length > 0) {
      console.log(`Found ${recipe.recipe_images.length} images in recipe_images array for recipe ${recipe.id}`);
      
      const imageRecord = recipe.recipe_images[0]; // Use the first (most recent) image
      
      try {
        // Try to get the image path from the database record
        if (imageRecord.image_path) {
          imagePath = findBestMatchingImage(recipe.id, imageRecord.image_path);
        } else if (imageRecord.filename) {
          imagePath = findBestMatchingImage(recipe.id, imageRecord.filename);
        }
      } catch (error) {
        console.error(`Error getting image path: ${error.message}`);
      }
    }
    
    // If we still don't have an image, try one last directory scan
    if (!imagePath) {
      console.log(`Searching for any image files for recipe ${recipe.id}`);
      imagePath = findBestMatchingImage(recipe.id);
    }
    
    // Add image to worksheet if found
    if (imagePath && fs.existsSync(imagePath)) {
      try {
        console.log(`Adding image to Excel: ${imagePath}`);
        
        // Get the image extension for ExcelJS
        const imageExtension = getImageExtension(imagePath);
        
        // Standard image dimensions for the cell (keeping aspect ratio will be handled by Excel)
        const imageWidth = 120;
        const imageHeight = 120;
        
        // Add the image to the worksheet
        const imageId = workbook.addImage({
          filename: imagePath,
          extension: imageExtension
        });
        
        // Calculate cell address for image (column E is the image column)
        const imageCell = worksheet.getCell('E' + rowIndex);
        const colNumber = imageCell.col - 1; // Convert to 0-based
        const rowNumber = imageCell.row - 1; // Convert to 0-based
        
        // Add image to worksheet with proper positioning
        worksheet.addImage(imageId, {
          tl: { col: colNumber + 0.1, row: rowNumber + 0.1 }, // Small offset from cell border
          ext: { width: imageWidth, height: imageHeight },
          editAs: 'oneCell'
        });
        
        console.log(`Image added successfully to row ${rowIndex}`);
      } catch (error) {
        console.error(`Error adding image to Excel: ${error.message}`);
        
        // Add a placeholder text if image fails to load
        worksheet.getRow(rowIndex).getCell('image').value = `Image: ${path.basename(imagePath)}`;
      }
    } else {
      console.log(`No image found for recipe ${recipe.id}`);
      worksheet.getRow(rowIndex).getCell('image').value = 'No image available';
    }
    
    // Add some styling to the row
    worksheet.getRow(rowIndex).alignment = { vertical: 'top', wrapText: true };
  }
  
  // Auto-fit columns (except image column)
  worksheet.columns.forEach((column, index) => {
    if (index < 4) { // Don't auto-fit the image column
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
  
  // Generate Excel file
  console.log('Generating Excel file with embedded images');
  const buffer = await workbook.xlsx.writeBuffer();
  console.log(`Excel file generated successfully: ${buffer.length} bytes`);
  
  return buffer;
}

/**
 * Export a single recipe to Excel
 * @param {Object} recipe - Recipe object to export
 * @returns {Promise<Buffer>} - Excel file as buffer
 */
async function exportRecipeToExcel(recipe) {
  return exportRecipesToExcel([recipe]);
}

// Export functions
module.exports = {
  exportRecipesToExcel,
  exportRecipeToExcel
};