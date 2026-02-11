// wp-recipe-maker.js - Updated version for correct formatting
const axios = require('axios');
const url = require('url');

/**
 * Add recipe to a post via WordPress API for WP Recipe Maker
 * @param {Object} wpConfig - WordPress configuration
 * @param {Object} wprmConfig - WP Recipe Maker configuration
 * @param {Object} recipeData - Recipe data to add
 * @param {number} postId - WordPress post ID
 * @returns {Object} Recipe API response
 */
async function addRecipeToPost(wpConfig, wprmConfig, recipeData, postId) {
  try {
    if (!wpConfig || !wpConfig.apiUrl || !recipeData || !postId) {
      throw new Error('Missing required parameters for adding recipe to post');
    }
    
    console.log(`Adding WPRM recipe "${recipeData.title}" to post ID: ${postId}`);
    
    // Check the recipe data for debugging
    console.log(`Recipe data check:`, {
      title: recipeData.title,
      hasIngredients: recipeData.ingredients && recipeData.ingredients.length > 0,
      ingredientsCount: recipeData.ingredients ? recipeData.ingredients.length : 0,
      hasInstructions: recipeData.instructions && recipeData.instructions.length > 0,
      instructionsCount: recipeData.instructions ? recipeData.instructions.length : 0,
      hasOriginalIngredients: recipeData._originalIngredients && recipeData._originalIngredients.length > 0,
      originalIngredientsCount: recipeData._originalIngredients ? recipeData._originalIngredients.length : 0,
      hasOriginalInstructions: recipeData._originalInstructions && recipeData._originalInstructions.length > 0,
      originalInstructionsCount: recipeData._originalInstructions ? recipeData._originalInstructions.length : 0,
    });
    
    // Create auth header
    const authString = `${wpConfig.username}:${wpConfig.password}`;
    const encodedAuth = Buffer.from(authString).toString('base64');
    
    // Parse the API URL
    const parsedUrl = url.parse(wpConfig.apiUrl);
    const baseUrl = `${parsedUrl.protocol}//${parsedUrl.hostname}`;
    
    // Use the working endpoint
    const endpoint = '/wp-json/wp/v2/wprm_recipe';
    
    // Extract timing info
    const prepTimeMinutes = extractTimeMinutes(recipeData.prep_time);
    const cookTimeMinutes = extractTimeMinutes(recipeData.cook_time);
    const totalTimeMinutes = prepTimeMinutes + cookTimeMinutes;
    
    // Use original ingredient arrays if available, otherwise use regular arrays
    const ingredientsToUse = recipeData._originalIngredients || recipeData.ingredients || [];
    const instructionsToUse = recipeData._originalInstructions || recipeData.instructions || [];
    
    console.log(`Using ${ingredientsToUse.length} ingredients and ${instructionsToUse.length} instructions`);
    
    // Generate a better description if one isn't provided
    let enhancedDescription = recipeData.description || generateRecipeDescription(recipeData);
    
    // Filter instructions to remove metadata items like "Total Time" and "Enjoy your meal"
    const cleanedInstructions = filterInstructions(instructionsToUse);
    
    // Extract notes from instructions if they exist
    const { filteredInstructions, notes } = extractNotesFromInstructions(cleanedInstructions);
    
    // Format recipe for WP Recipe Maker with proper grouping
    const wprmRecipeData = formatRecipeForWPRM(
      recipeData.title,
      enhancedDescription,
      ingredientsToUse,
      filteredInstructions,
      {
        prepTime: prepTimeMinutes,
        cookTime: cookTimeMinutes,
        totalTime: totalTimeMinutes,
        servings: extractServings(recipeData.yield),
        notes: notes || (Array.isArray(recipeData.notes) ? recipeData.notes.join('\n\n') : (recipeData.notes || '')),
        nutrition: {
          calories: extractNutritionValue(recipeData.nutrition_info?.Calories),
          protein: extractNutritionValue(recipeData.nutrition_info?.Protein),
          carbohydrates: extractNutritionValue(recipeData.nutrition_info?.Carbs),
          fat: extractNutritionValue(recipeData.nutrition_info?.Fat)
        },
        postId: postId
      }
    );
    
    console.log(`Creating recipe at ${baseUrl}${endpoint}`);
    console.log(`WPRM recipe structure:`, JSON.stringify({
      title: wprmRecipeData.title,
      ingredientGroupsCount: wprmRecipeData.recipe.ingredients.length,
      instructionGroupsCount: wprmRecipeData.recipe.instructions.length
    }));
    
    // Create the recipe
    const response = await axios.post(
      `${baseUrl}${endpoint}`,
      wprmRecipeData,
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Basic ${encodedAuth}`
        }
      }
    );
    
    // Extract recipe ID from the WordPress response
    const recipeId = response.data.id;
    
    if (!recipeId) {
      throw new Error('Recipe creation failed - no recipe ID returned');
    }
    
    console.log(`✓ Recipe created with ID: ${recipeId}`);
    
    // Create shortcode
    const shortcode = `[wprm-recipe id="${recipeId}"]`;
    
    // Return the data without adding the shortcode to the post here
    return { 
      success: true, 
      data: response.data,
      recipeId: recipeId,
      shortcode: shortcode
    };
  } catch (error) {
    console.error('Error adding WPRM recipe to post:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
    throw error;
  }
}

/**
 * Generate a meaningful description for the recipe if none is provided
 */
function generateRecipeDescription(recipeData) {
  // Try to use the template system if available
  try {
    const recipeTemplates = require('./recipe-templates');
    const mainIngredients = extractMainIngredients(recipeData.ingredients || []);
    return recipeTemplates.generateTemplatedDescription(recipeData, mainIngredients);
  } catch (error) {
    // Fall back to built-in templates if module not available
    console.log('Recipe templates module not found, using built-in templates');
    
    const title = recipeData.title || "This dish";
    const mainIngredients = extractMainIngredients(recipeData.ingredients || []);
    
    if (title.toLowerCase().includes('cake')) {
      return `This delicious ${title.toLowerCase()} is perfect for special occasions or when you're craving something sweet. Made with ${mainIngredients}, it's a treat that everyone will love.`;
    } else if (title.toLowerCase().includes('soup') || title.toLowerCase().includes('stew')) {
      return `This hearty ${title.toLowerCase()} is comforting and full of flavor. Made with ${mainIngredients}, it's perfect for a cozy meal any day of the week.`;
    } else if (title.toLowerCase().includes('salad')) {
      return `This refreshing ${title.toLowerCase()} is packed with nutrients and flavor. Featuring ${mainIngredients}, it makes a perfect light meal or side dish.`;
    } else if (title.toLowerCase().includes('chicken')) {
      return `This flavorful ${title.toLowerCase()} is a crowd-pleaser that's easy to prepare. Made with ${mainIngredients}, it's perfect for a weeknight dinner or special occasion.`;
    } else {
      return `This delicious ${title.toLowerCase()} is a fantastic dish that's sure to impress. Made with ${mainIngredients}, it combines great flavors and textures for a memorable meal.`;
    }
  }
}

/**
 * Extract the main ingredients from the ingredients list for use in the description
 */
function extractMainIngredients(ingredients) {
  // Filter out section headers and extract important ingredients
  const filteredIngredients = ingredients
    .filter(item => !isGroupHeader(item))
    .map(item => {
      // Extract the main ingredient name, removing measurements
      const mainIngredient = item
        .replace(/^[•\-*]\s*/, '')
        .replace(/^\d+(\.\d+)?\s*(cups?|tablespoons?|teaspoons?|pounds?|ounces?|grams?|kilograms?|ml|g|kg|oz|lb)\s+of\s+/i, '')
        .replace(/^\d+(\.\d+)?\s*(cups?|tablespoons?|teaspoons?|pounds?|ounces?|grams?|kilograms?|ml|g|kg|oz|lb)\s+/i, '')
        .replace(/,.+$/, '') // Remove everything after a comma
        .trim()
        .toLowerCase();
      
      return mainIngredient;
    });
  
  // Get unique ingredients and take first few
  const uniqueIngredients = [...new Set(filteredIngredients)];
  const mainOnes = uniqueIngredients
    .filter(ing => ing.length > 2) // Filter out very short items
    .slice(0, 3); // Take top 3
  
  if (mainOnes.length === 0) return "simple ingredients";
  if (mainOnes.length === 1) return mainOnes[0];
  if (mainOnes.length === 2) return `${mainOnes[0]} and ${mainOnes[1]}`;
  return `${mainOnes[0]}, ${mainOnes[1]}, and ${mainOnes[2]}`;
}

/**
 * Filter instructions to remove metadata and footers
 */
function filterInstructions(instructions) {
  if (!instructions || !Array.isArray(instructions)) return [];
  
  // Patterns to identify metadata and footers that should be removed
  const metadataPatterns = [
    /total time/i,
    /total:/i,
    /enjoy your meal/i,
    /#recipe/i,
    /^enjoy/i,
    /bon appétit/i,
    /serves \d+/i
  ];
  
  return instructions.filter(instruction => {
    // Skip empty instructions
    if (!instruction || instruction.trim() === '') return false;
    
    // Check if this matches any metadata pattern
    for (const pattern of metadataPatterns) {
      if (pattern.test(instruction)) {
        return false;
      }
    }
    
    return true;
  });
}

/**
 * Extract notes from the end of instructions
 */
function extractNotesFromInstructions(instructions) {
  if (!instructions || !Array.isArray(instructions) || instructions.length === 0) {
    return { filteredInstructions: instructions, notes: '' };
  }
  
  // Patterns that could indicate notes
  const noteIdentifiers = [
    /^note:/i,
    /^tip:/i,
    /^chef('s)? tip:/i,
    /^serving suggestion:/i
  ];
  
  let noteStartIndex = -1;
  
  // Identify where notes start
  for (let i = 0; i < instructions.length; i++) {
    const instruction = instructions[i];
    
    for (const pattern of noteIdentifiers) {
      if (pattern.test(instruction)) {
        noteStartIndex = i;
        break;
      }
    }
    
    if (noteStartIndex !== -1) break;
  }
  
  // If no explicit notes found, check the last item for possible notes
  if (noteStartIndex === -1 && instructions.length > 0) {
    const lastItem = instructions[instructions.length - 1];
    if (lastItem.includes('can be') || 
        lastItem.includes('store') || 
        lastItem.includes('refrigerate') || 
        lastItem.includes('leftovers')) {
      noteStartIndex = instructions.length - 1;
    }
  }
  
  // If notes were found, separate them from instructions
  if (noteStartIndex !== -1) {
    const filteredInstructions = instructions.slice(0, noteStartIndex);
    const notesArray = instructions.slice(noteStartIndex);
    const notes = notesArray.join('\n\n');
    
    return { filteredInstructions, notes };
  }
  
  // Try to use the template system for notes if available
  try {
    const recipeTemplates = require('./recipe-templates');
    // Generate default storage note
    const templateNotes = recipeTemplates.combineNotes([
      { template: 'storage', values: { days: '3' } }
    ]);
    
    // Return original instructions with template note
    return { filteredInstructions: instructions, notes: templateNotes };
  } catch (error) {
    // Module not found, continue without template notes
  }
  
  // No notes found and no templates available
  return { filteredInstructions: instructions, notes: '' };
}

/**
 * Format recipe data for WP Recipe Maker with proper grouping
 */
function formatRecipeForWPRM(title, description, ingredients, instructions, options) {
  // Group ingredients by sections
  const { ingredientGroups, instructionGroups } = groupRecipeSections(ingredients, instructions);
  
  // Format the recipe data
  return {
    title: title,
    status: 'publish',
    content: description,
    
    // Recipe data goes in recipe object
    recipe: {
      // Basic recipe info
      parent_post_id: options.postId,
      image_id: 0,
      name: title,
      summary: description || "",
      
      // Servings
      servings: options.servings || 4,
      servings_unit: "servings",
      
      // Times
      prep_time: options.prepTime || 15,
      cook_time: options.cookTime || 15,
      total_time: options.totalTime || 30,
      
      // Notes
      notes: '', // Always empty - no notes will be added
      
      // Use the properly grouped ingredients and instructions
      ingredients: ingredientGroups,
      instructions: instructionGroups,
      
      // Nutrition
      nutrition: options.nutrition || {
        calories: 0,
        protein: 0,
        carbohydrates: 0,
        fat: 0
      }
    }
  };
}

/**
 * Group ingredients and instructions into sections
 */
function groupRecipeSections(ingredients, instructions) {
  // Initialize result with default groups
  const ingredientGroups = [];
  const instructionGroups = [];
  
  // Process ingredients
  let currentIngredientGroup = {
    name: "",
    uid: 1,
    ingredients: []
  };
  
  ingredients.forEach((ingredient, index) => {
    // Check if this is a section header
    if (isGroupHeader(ingredient)) {
      // If we have items in the current group, add it to the results
      if (currentIngredientGroup.ingredients.length > 0) {
        ingredientGroups.push(currentIngredientGroup);
      }
      
      // Start a new group with this header
      currentIngredientGroup = {
        name: ingredient, // The header becomes the group name
        uid: ingredientGroups.length + 1,
        ingredients: []
      };
    } else {
      // Regular ingredient - add to current group
      currentIngredientGroup.ingredients.push({
        uid: index,
        amount: "",
        unit: "",
        name: ingredient,
        notes: ""
      });
    }
  });
  
  // Add the final ingredient group if it has items
  if (currentIngredientGroup.ingredients.length > 0) {
    ingredientGroups.push(currentIngredientGroup);
  }
  
  // Process instructions
  let currentInstructionGroup = {
    name: "",
    uid: 1,
    instructions: []
  };
  
  instructions.forEach((instruction, index) => {
    // Check if this is a section header
    if (isGroupHeader(instruction)) {
      // If we have items in the current group, add it to the results
      if (currentInstructionGroup.instructions.length > 0) {
        instructionGroups.push(currentInstructionGroup);
      }
      
      // Start a new group with this header
      currentInstructionGroup = {
        name: instruction, // The header becomes the group name
        uid: instructionGroups.length + 1,
        instructions: []
      };
    } else {
      // Regular instruction - add to current group
      currentInstructionGroup.instructions.push({
        uid: index,
        name: "",
        text: `<p>${instruction}</p>`,
        image: 0,
        ingredients: []
      });
    }
  });
  
  // Add the final instruction group if it has items
  if (currentInstructionGroup.instructions.length > 0) {
    instructionGroups.push(currentInstructionGroup);
  }
  
  // If no groups were created, create default ones
  if (ingredientGroups.length === 0 && ingredients.length > 0) {
    ingredientGroups.push({
      name: "",
      uid: 1,
      ingredients: ingredients.map((ingredient, index) => ({
        uid: index,
        amount: "",
        unit: "",
        name: ingredient,
        notes: ""
      }))
    });
  }
  
  if (instructionGroups.length === 0 && instructions.length > 0) {
    instructionGroups.push({
      name: "",
      uid: 1,
      instructions: instructions.map((instruction, index) => ({
        uid: index,
        name: "",
        text: `<p>${instruction}</p>`,
        image: 0,
        ingredients: []
      }))
    });
  }
  
  return { ingredientGroups, instructionGroups };
}

/**
 * Check if a line is a group header
 */
function isGroupHeader(line) {
  // Return true if the line is a section header
  return (
    (line.includes(':') && !line.match(/^\d+\./)) || // Has a colon but not a numbered step
    line.toLowerCase().includes('for the') || // Contains "For the X"
    line.toLowerCase().includes('assembly') || // Contains "Assembly"
    line.toLowerCase().match(/^(ingredients|instructions|preparation|steps)$/) // Is a main section label
  );
}

/**
 * Update post content with recipe shortcode, ensuring it's at the end and not duplicated
 * @param {Object} wpConfig - WordPress configuration
 * @param {number} postId - Post ID
 * @param {string} shortcode - Recipe shortcode
 */
async function updatePostWithRecipeShortcode(wpConfig, postId, shortcode) {
  try {
    console.log(`Adding shortcode ${shortcode} to post ${postId}`);
    
    // Create auth header
    const authString = `${wpConfig.username}:${wpConfig.password}`;
    const encodedAuth = Buffer.from(authString).toString('base64');
    
    // Get the current post content
    const postResponse = await axios.get(
      `${wpConfig.apiUrl}/posts/${postId}`,
      {
        headers: {
          'Authorization': `Basic ${encodedAuth}`
        }
      }
    );
    
    // Extract current content
    let currentContent = '';
    
    if (postResponse.data.content && postResponse.data.content.raw) {
      currentContent = postResponse.data.content.raw;
    } else if (postResponse.data.content && postResponse.data.content.rendered) {
      currentContent = postResponse.data.content.rendered
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#039;/g, "'")
        .replace(/&amp;/g, '&');
    } else if (typeof postResponse.data.content === 'string') {
      currentContent = postResponse.data.content;
    }
    
    // Log what we fetched from WordPress
    console.log(`📥 Fetched content from WordPress (length: ${currentContent.length})`);
    console.log(`🔍 Content includes Canva: ${currentContent.includes('canva-image') || currentContent.includes('i.ibb.co')}`);

    // Check for any existing recipe shortcodes and remove them
    const shortcodeRegex = /\[wprm-recipe[^\]]*\]/g;
    const existingShortcodes = currentContent.match(shortcodeRegex) || [];

    // If any recipe shortcodes exist, remove them all
    if (existingShortcodes.length > 0) {
      console.log(`Found ${existingShortcodes.length} existing recipe shortcode(s), removing them`);

      for (const existingShortcode of existingShortcodes) {
        currentContent = currentContent.replace(existingShortcode, '');
      }

      // Clean up any empty lines after removal
      currentContent = currentContent.replace(/\n\n\n+/g, '\n\n');
    }
    
    // Add the shortcode at the end with clear separation
    const newContent = currentContent.trim() + '\n\n<!-- WP Recipe Maker Recipe -->\n' + shortcode + '\n\n';
    
    // Update the post
    await axios.put(
      `${wpConfig.apiUrl}/posts/${postId}`,
      {
        content: newContent
      },
      {
        headers: {
          'Authorization': `Basic ${encodedAuth}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    console.log('✓ Post updated with recipe shortcode');
    return true;
  } catch (error) {
    console.error('Error updating post with shortcode:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
    throw error;
  }
}

/**
 * Test the WP Recipe Maker API connection using WordPress API
 * @param {Object} wpConfig - WordPress configuration
 * @returns {Object} Test result
 */
async function testWPRMApiConnection(wpConfig) {
  try {
    // Basic validation
    if (!wpConfig || !wpConfig.apiUrl) {
      throw new Error('Missing required parameters for testing WPRM API connection');
    }
    
    // Parse the API URL
    const parsedUrl = url.parse(wpConfig.apiUrl);
    const baseUrl = `${parsedUrl.protocol}//${parsedUrl.hostname}`;
    
    // Use the endpoint for WPRM recipes
    const testEndpoint = '/wp-json/wp/v2/wprm_recipe';
    
    // Create auth header
    const authString = `${wpConfig.username}:${wpConfig.password}`;
    const encodedAuth = Buffer.from(authString).toString('base64');
    
    console.log(`Testing WP Recipe Maker API connection to: ${baseUrl}${testEndpoint}`);
    
    // Use axios for the request - test with a GET request
    const response = await axios.get(
      `${baseUrl}${testEndpoint}`,
      {
        headers: {
          'Authorization': `Basic ${encodedAuth}`
        }
      }
    );
    
    console.log('WP Recipe Maker API connection test successful');
    return { success: true };
  } catch (error) {
    // Special handling for empty lists (which are valid)
    if (error.response && error.response.status === 200) {
      console.log('WP Recipe Maker API connection test successful (empty recipe list)');
      return { success: true };
    }
    
    console.error('WP Recipe Maker API connection test failed:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
    throw error;
  }
}

/**
 * Extract minutes from time string
 * @param {string} timeString - Time string (e.g., "30 mins", "1 hour 15 minutes")
 * @returns {number} Time in minutes
 */
function extractTimeMinutes(timeString) {
  if (!timeString || timeString === 'N/A') return 0;
  
  let minutes = 0;
  
  // Extract hours
  const hoursMatch = timeString.match(/(\d+)\s*(?:hour|hr)s?/i);
  if (hoursMatch) {
    minutes += parseInt(hoursMatch[1], 10) * 60;
  }
  
  // Extract minutes
  const minutesMatch = timeString.match(/(\d+)\s*(?:minute|min)s?/i);
  if (minutesMatch) {
    minutes += parseInt(minutesMatch[1], 10);
  }
  
  return minutes;
}

/**
 * Extract numeric value from nutrition string
 * @param {string} nutritionString - Nutrition string (e.g., "300 kcal", "25g")
 * @returns {number} Numeric value
 */
function extractNutritionValue(nutritionString) {
  if (!nutritionString || nutritionString === 'N/A') return 0;
  
  const match = nutritionString.match(/(\d+(?:\.\d+)?)/);
  return match ? parseFloat(match[1]) : 0;
}

/**
 * Extract servings from yield string
 * @param {string} yieldString - Yield string (e.g., "4 servings", "4-6 people")
 * @returns {number} Number of servings
 */
function extractServings(yieldString) {
  if (!yieldString || yieldString === 'N/A') return 4; // Default to 4 servings
  
  // Handle range (e.g., "4-6 servings")
  const rangeMatch = yieldString.match(/(\d+)\s*-\s*(\d+)/);
  if (rangeMatch) {
    // Take the average of the range
    return Math.round((parseInt(rangeMatch[1], 10) + parseInt(rangeMatch[2], 10)) / 2);
  }
  
  // Handle single number
  const numberMatch = yieldString.match(/(\d+)/);
  return numberMatch ? parseInt(numberMatch[1], 10) : 4;
}

module.exports = {
  addRecipeToPost,
  updatePostWithRecipeShortcode,
  testWPRMApiConnection
};