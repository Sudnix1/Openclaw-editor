// recipe-helper.js - Improved version
const axios = require('axios');
const wpRecipeMaker = require('./wp-recipe-maker');

/**
 * Generate recipe data from Facebook recipe
 * @param {Object} facebookContent - Facebook recipe content from database
 * @returns {Object} Structured recipe data for WP Recipe Maker
 */
function extractRecipeFromFacebookContent(facebookContent) {
  try {
    if (!facebookContent || !facebookContent.recipe_text) {
      throw new Error('Invalid Facebook content provided');
    }
    
    const recipeText = facebookContent.recipe_text;
    const title = facebookContent.title || '';
    
    // Extract ingredients section
    const ingredientsRaw = extractIngredientsSection(recipeText);
    let ingredients = [];
    
    if (ingredientsRaw) {
      ingredients = ingredientsRaw.split('\n')
        .map(line => line.replace(/^[-•🧂\s]*|[🧂]$/g, '').trim())
        .filter(line => line && line.length > 1 && !line.match(/^([🧂#*]+)$/));
    } else {
      console.warn('No ingredients section found in recipe text');
    }
    
    // Extract preparation steps
    const preparationRaw = extractPreparationSection(recipeText);
    let instructions = [];
    
    if (preparationRaw) {
      instructions = preparationRaw.split('\n')
        .map(line => line.replace(/^[\d\.\s🧑‍🍳]*/, '').trim())
        .filter(line => line && line.length > 1 && !line.match(/^([🧑‍🍳#*]+)$/));
    } else {
      console.warn('No instructions section found in recipe text');
    }
    
    // Extract description
    let description = '';
    const lines = recipeText.split('\n');
    if (lines.length > 1) {
      // Extract lines after title and before ingredients section as description
      const titleIndex = 0;
      const ingredientsIndex = findSectionIndex(lines, ['Ingredients', '🧂']);
      
      if (ingredientsIndex > titleIndex + 1) {
        description = lines.slice(titleIndex + 1, ingredientsIndex)
          .join('\n')
          .trim();
      }
    }
    
    // Estimate prep and cook times
    let prepTime = '15 mins';
    let cookTime = '30 mins';
    
    // Try to extract times from instructions
    for (const instruction of instructions) {
      const prepTimeMatch = instruction.match(/prep.*?(\d+)\s*(?:minute|min)/i);
      if (prepTimeMatch) {
        prepTime = `${prepTimeMatch[1]} mins`;
      }
      
      const cookTimeMatch = instruction.match(/cook.*?(\d+)\s*(?:minute|min)/i);
      if (cookTimeMatch) {
        cookTime = `${cookTimeMatch[1]} mins`;
      }
    }
    
    // Create a properly structured recipe object for WP Recipe Maker
    console.log(`Extracted ${ingredients.length} ingredients and ${instructions.length} instructions`);
    
    return {
      title,
      description,
      ingredients,
      instructions,
      prep_time: prepTime,
      cook_time: cookTime,
      yield: '4 servings',
      notes: '',
      nutrition_info: {
        Calories: 'N/A',
        Protein: 'N/A',
        Carbs: 'N/A',
        Fat: 'N/A'
      },
      // Critical: Store original arrays for WP Recipe Maker
      _originalIngredients: ingredients,
      _originalInstructions: instructions
    };
  } catch (error) {
    console.error('Error extracting recipe from Facebook content:', error);
    return null;
  }
}

/**
 * Find the index of a section in recipe lines
 * @param {Array} lines - Array of text lines
 * @param {Array} sectionMarkers - Markers to identify the section
 * @returns {number} - Line index or -1 if not found
 */
function findSectionIndex(lines, sectionMarkers) {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].toLowerCase();
    if (sectionMarkers.some(marker => line.includes(marker.toLowerCase()))) {
      return i;
    }
  }
  return -1;
}

/**
 * Extracts ingredients section from recipe text
 * @param {string} text - Full recipe text
 * @returns {string|null} - Extracted ingredients section or null if not found
 */
function extractIngredientsSection(text) {
  // First try looking for ingredient sections with common labels
  const ingredientLabels = ['Ingredients', 'Zutaten', 'Ingrédients', 'Ingredienti', 'Ingredientes', '🧂 Ingredients', 'Ingredients 🧂'];
  const nextSectionLabels = ['Preparation', 'Préparation', 'Zubereitung', 'Preparazione', 'Preparación', 'Instructions', 'Steps', 'Directions', '🧑‍🍳', 'Method'];
  
  // Create a more robust pattern to detect the next section
  const nextPattern = new RegExp(`(^|\\n)\\s*(${nextSectionLabels.join('|')})\\s*[:\\n🧑‍🍳]`, 'im');

  for (const label of ingredientLabels) {
    // More robust regex to find ingredient section header
    const labelRegex = new RegExp(`(^|\\n)\\s*${label}\\s*[:\\n🧂]`, 'i');
    const match = text.match(labelRegex);
    
    if (match) {
      const startIndex = match.index + match[0].length;
      const afterStart = text.slice(startIndex);
      
      // Find where the next section begins
      const nextSectionMatch = afterStart.match(nextPattern);
      
      if (nextSectionMatch) {
        // Return only the ingredients part, trimming whitespace
        return afterStart.slice(0, nextSectionMatch.index).trim();
      } else {
        // If no next section found, take everything after ingredients but be cautious
        const lines = afterStart.split('\n');
        // Get up to 20 lines or until a blank line followed by what looks like a header
        let ingredientLines = [];
        let emptyLineCount = 0;
        
        for (let i = 0; i < Math.min(20, lines.length); i++) {
          const line = lines[i].trim();
          
          // If we find an empty line, increment counter
          if (!line) {
            emptyLineCount++;
            // If we've seen an empty line and this looks like a header, it might be the start of the next section
            if (emptyLineCount > 0 && 
                lines[i+1] && 
                lines[i+1].length < 30 && 
                !lines[i+1].includes('.') && 
                !lines[i+1].startsWith('-')) {
              break;
            }
            continue;
          }
          
          // Reset empty line counter if we find text
          emptyLineCount = 0;
          ingredientLines.push(line);
        }
        
        return ingredientLines.join('\n').trim();
      }
    }
  }
  
  // If we get here, try an alternative approach - look for bullet points or numbered lists
  const lines = text.split('\n');
  let inIngredientsList = false;
  let ingredientStartIndex = -1;
  let ingredientEndIndex = -1;
  
  // First pass: try to identify ingredients by bullet points or dashes
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Look for potential ingredient markers
    if (line.startsWith('-') || line.startsWith('•') || line.startsWith('*')) {
      if (!inIngredientsList) {
        inIngredientsList = true;
        ingredientStartIndex = i;
      }
    } 
    // If we were in an ingredients list but found a line that looks like instructions (starts with number)
    else if (inIngredientsList && (line.match(/^\d+\./) || line.includes('Instructions') || line.includes('Steps'))) {
      ingredientEndIndex = i;
      break;
    }
  }
  
  if (ingredientStartIndex !== -1) {
    const endIndex = ingredientEndIndex !== -1 ? ingredientEndIndex : lines.length;
    return lines.slice(ingredientStartIndex, endIndex).join('\n').trim();
  }
  
  return null;
}

/**
 * Extracts preparation section from recipe text
 * @param {string} text - Full recipe text
 * @returns {string|null} - Extracted preparation section or null if not found
 */
function extractPreparationSection(text) {
  const prepLabels = ['Preparation', 'Préparation', 'Zubereitung', 'Preparazione', 'Preparación', 'Instructions', 'Steps', 'Directions', '🧑‍🍳', 'Method'];
  const nextSectionLabels = ['Tips', 'Note', 'Enjoy', 'Serving', 'Storage'];
  
  const nextPattern = new RegExp(`(^|\\n)\\s*(${nextSectionLabels.join('|')})\\s*[:\\n]`, 'im');

  for (const label of prepLabels) {
    const labelRegex = new RegExp(`(^|\\n)\\s*${label}\\s*[:\\n🧑‍🍳]`, 'i');
    const match = text.match(labelRegex);
    
    if (match) {
      const startIndex = match.index + match[0].length;
      const afterStart = text.slice(startIndex);
      
      const nextSectionMatch = afterStart.match(nextPattern);
      
      if (nextSectionMatch) {
        return afterStart.slice(0, nextSectionMatch.index).trim();
      } else {
        return afterStart.trim();
      }
    }
  }
  
  // Try alternative approach - look for numbered steps
  const lines = text.split('\n');
  let inInstructionsList = false;
  let instructionsStartIndex = -1;
  let instructionsEndIndex = -1;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Look for numbered instructions (e.g., "1. Preheat oven")
    if (line.match(/^\d+\.\s/)) {
      if (!inInstructionsList) {
        inInstructionsList = true;
        instructionsStartIndex = i;
      }
    } 
    // If we were in instructions list but now hit a different section
    else if (inInstructionsList && (line === '' && i < lines.length - 1 && 
             (lines[i+1].includes('Tips') || lines[i+1].includes('Note') || lines[i+1].includes('Enjoy')))) {
      instructionsEndIndex = i;
      break;
    }
  }
  
  if (instructionsStartIndex !== -1) {
    const endIndex = instructionsEndIndex !== -1 ? instructionsEndIndex : lines.length;
    return lines.slice(instructionsStartIndex, endIndex).join('\n').trim();
  }
  
  return null;
}

/**
 * Add recipe to a WordPress post
 * @param {Object} wpConfig - WordPress configuration
 * @param {Object} recipeData - Recipe data
 * @param {number} postId - WordPress post ID
 * @returns {Object} Recipe creation result
 */
async function addRecipeToPost(wpConfig, recipeData, postId) {
  try {
    console.log(`Adding recipe to post ID: ${postId}`);
    
    // Verify recipe data has ingredients and instructions
    if (!recipeData.ingredients || recipeData.ingredients.length === 0) {
      console.warn('No ingredients found in recipe data');
    }
    
    if (!recipeData.instructions || recipeData.instructions.length === 0) {
      console.warn('No instructions found in recipe data');
    }
    
    console.log(`Recipe data has ${recipeData.ingredients ? recipeData.ingredients.length : 0} ingredients and ${recipeData.instructions ? recipeData.instructions.length : 0} instructions`);
    
    // Add original arrays as special properties if they don't exist
    if (!recipeData._originalIngredients) {
      recipeData._originalIngredients = recipeData.ingredients;
    }
    
    if (!recipeData._originalInstructions) {
      recipeData._originalInstructions = recipeData.instructions;
    }
    
    // Configure WPRM integration
    const wprmConfig = {
      customFormat: {
        enabled: false
      }
    };
    
    // Call the WP Recipe Maker module
    const result = await wpRecipeMaker.addRecipeToPost(
      wpConfig, 
      wprmConfig, 
      recipeData, 
      postId
    );
    
    // If we have a successful result with a recipe ID, add the shortcode to the post
    if (result.success && result.recipeId) {
      await wpRecipeMaker.updatePostWithRecipeShortcode(wpConfig, postId, result.shortcode);
    }
    
    return result;
  } catch (error) {
    console.error('Error adding recipe to post:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Determine if a keyword should have a recipe added
 * @param {string} keyword - The keyword to check
 * @param {Object} recipeConfig - Recipe configuration
 * @returns {boolean} - True if recipe should be added
 */
function shouldAddRecipe(keyword, recipeConfig) {
  if (!recipeConfig || !recipeConfig.enabled) {
    return false;
  }
  
  // If addToAllKeywords is enabled, always return true
  if (recipeConfig.addToAllPosts) {
    return true;
  }
  
  // Convert keywords list to array and normalize
  const recipeKeywords = recipeConfig.keywords
    .split(',')
    .map(k => k.trim().toLowerCase());
  
  // Check if any of the recipe keywords are in the article keyword
  const keywordLower = keyword.toLowerCase();
  
  return recipeKeywords.some(recipeKeyword => 
    keywordLower.includes(recipeKeyword)
  );
}

/**
 * Test the WP Recipe Maker API connection
 * @param {Object} wpConfig - WordPress configuration
 * @returns {Object} Test result
 */
async function testWPRMApiConnection(wpConfig) {
  return await wpRecipeMaker.testWPRMApiConnection(wpConfig);
}

module.exports = {
  extractRecipeFromFacebookContent,
  addRecipeToPost,
  testWPRMApiConnection,
  shouldAddRecipe
};