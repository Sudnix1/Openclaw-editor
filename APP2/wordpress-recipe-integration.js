// wordpress-recipe-integration.js
// Integration layer for WordPress recipe plugins

const recipeFormatter = require('./recipe-formatter');

/**
 * Formats a recipe for WordPress WPRM plugin
 * @param {Object} recipeData - Raw recipe data
 * @returns {Object} - Formatted data ready for WPRM plugin
 */
function formatRecipeForWPRM(recipeData) {
  // Use the formatter to clean all recipe content
  const cleanedRecipe = recipeFormatter.prepareRecipeForWordPress(recipeData);
  
  // Process ingredients to identify section headers and regular ingredients
  const processedIngredients = [];
  let currentSection = '';
  
  cleanedRecipe.ingredients.forEach(ingredient => {
    // Check if this is a section header
    if (isSectionHeader(ingredient)) {
      // Store section header
      currentSection = ingredient;
      processedIngredients.push({ 
        type: 'section', 
        text: currentSection 
      });
    } else {
      // Regular ingredient with reference to its section
      processedIngredients.push({ 
        type: 'ingredient', 
        text: ingredient, 
        section: currentSection 
      });
    }
  });
  
  // Process instructions similarly
  const processedInstructions = [];
  currentSection = '';
  
  cleanedRecipe.instructions.forEach(instruction => {
    // Check if this is a section header
    if (isSectionHeader(instruction)) {
      // Store section header
      currentSection = instruction;
      processedInstructions.push({ 
        type: 'section', 
        text: currentSection 
      });
    } else {
      // Regular instruction with reference to its section
      processedInstructions.push({ 
        type: 'instruction', 
        text: instruction, 
        section: currentSection 
      });
    }
  });
  
  // Group ingredients by section
  const ingredientGroups = [];
  let currentIngredientGroup = null;
  
  processedIngredients.forEach(item => {
    if (item.type === 'section') {
      // Create a new group for this section
      if (currentIngredientGroup && currentIngredientGroup.ingredients.length > 0) {
        ingredientGroups.push(currentIngredientGroup);
      }
      
      currentIngredientGroup = {
        name: item.text,
        ingredients: []
      };
    } else if (item.type === 'ingredient') {
      // Ensure we have a group
      if (!currentIngredientGroup) {
        currentIngredientGroup = {
          name: '',
          ingredients: []
        };
      }
      
      // Add ingredient to current group
      currentIngredientGroup.ingredients.push({
        amount: '',
        unit: '',
        name: item.text,
        notes: ''
      });
    }
  });
  
  // Add the final ingredient group if it has items
  if (currentIngredientGroup && currentIngredientGroup.ingredients.length > 0) {
    ingredientGroups.push(currentIngredientGroup);
  }
  
  // Group instructions by section
  const instructionGroups = [];
  let currentInstructionGroup = null;
  
  processedInstructions.forEach(item => {
    if (item.type === 'section') {
      // Create a new group for this section
      if (currentInstructionGroup && currentInstructionGroup.instructions.length > 0) {
        instructionGroups.push(currentInstructionGroup);
      }
      
      currentInstructionGroup = {
        name: item.text,
        instructions: []
      };
    } else if (item.type === 'instruction') {
      // Ensure we have a group
      if (!currentInstructionGroup) {
        currentInstructionGroup = {
          name: '',
          instructions: []
        };
      }
      
      // Add instruction to current group
      currentInstructionGroup.instructions.push({
        text: item.text,
        image: 0
      });
    }
  });
  
  // Add the final instruction group if it has items
  if (currentInstructionGroup && currentInstructionGroup.instructions.length > 0) {
    instructionGroups.push(currentInstructionGroup);
  }
  
  // Ensure we have at least one group for each
  if (ingredientGroups.length === 0) {
    ingredientGroups.push({
      name: '',
      ingredients: cleanedRecipe.ingredients.map(ingredient => ({
        amount: '',
        unit: '',
        name: ingredient,
        notes: ''
      }))
    });
  }
  
  if (instructionGroups.length === 0) {
    instructionGroups.push({
      name: '',
      instructions: cleanedRecipe.instructions.map(instruction => ({
        text: instruction,
        image: 0
      }))
    });
  }
  
  // Format specifically for WPRM plugin
  return {
    title: cleanedRecipe.title,
    summary: recipeData.summary || '',
    
    // Store the processed groups for use in the WordPress recipe
    _ingredientGroups: ingredientGroups,
    _instructionGroups: instructionGroups,
    
    // Keep the original arrays for backward compatibility
    ingredients: cleanedRecipe.ingredients,
    instructions: cleanedRecipe.instructions,
    
    // Additional metadata
    recipe_cost: recipeData.cost || '',
    servings: recipeData.servings || 4,
    servings_unit: recipeData.servingsUnit || 'servings',
    prep_time: recipeData.prepTime || 15,
    cook_time: recipeData.cookTime || 15,
    total_time: recipeData.totalTime || 30,
    notes: recipeData.notes || '',
    author: recipeData.author || '',
    custom_fields: recipeData.customFields || {}
  };
}

/**
 * Check if a line is a section header
 */
function isSectionHeader(line) {
  return (
    (line.includes(':') && !line.match(/^\d+\./)) || // Has a colon but not a numbered step
    line.toLowerCase().includes('for the') || // Contains "For the X"
    line.toLowerCase().includes('assembly') || // Contains "Assembly"
    line.toLowerCase().match(/^(ingredients|instructions|preparation|steps)$/) // Is a main section label
  );
}

/**
 * Creates a recipe object for WordPress REST API
 * @param {Object} recipeData - Raw recipe data
 * @returns {Object} - Formatted data for WordPress API
 */
function createWordPressRecipeObject(recipeData) {
  // Get the cleaned recipe data
  const cleanedRecipe = recipeFormatter.prepareRecipeForWordPress(recipeData);
  
  // Format for a generic WordPress recipe
  return {
    title: cleanedRecipe.title,
    content: generateRecipeHTML(cleanedRecipe),
    status: 'publish',
    meta: {
      ingredients: cleanedRecipe.ingredients,
      instructions: cleanedRecipe.instructions,
      prep_time: recipeData.prepTime || 15,
      cook_time: recipeData.cookTime || 15,
      total_time: recipeData.totalTime || 30,
      servings: recipeData.servings || 4
    }
  };
}

/**
 * Generate HTML for a recipe
 * @param {Object} recipeData - Cleaned recipe data
 * @returns {string} - HTML representation of the recipe
 */
function generateRecipeHTML(recipeData) {
  let html = `<h2>${recipeData.title}</h2>\n\n`;
  
  // Add recipe details like prep time, cook time, etc.
  html += `<div class="recipe-details">
    <div class="prep-time">Prep Time: ${recipeData.prepTime || 15} minutes</div>
    <div class="cook-time">Cook Time: ${recipeData.cookTime || 15} minutes</div>
    <div class="total-time">Total Time: ${recipeData.totalTime || 30} minutes</div>
    <div class="servings">Servings: ${recipeData.servings || 4}</div>
  </div>\n\n`;
  
  // Process ingredients with section headers
  html += `<h3>Ingredients</h3>\n`;
  
  let currentSection = '';
  recipeData.ingredients.forEach(ingredient => {
    if (isSectionHeader(ingredient)) {
      // This is a section header
      currentSection = ingredient;
      html += `<h4>${currentSection}</h4>\n<ul>\n`;
    } else {
      // Regular ingredient
      if (currentSection === '' && !html.includes('<ul>')) {
        html += `<ul>\n`;
      }
      html += `  <li>${ingredient}</li>\n`;
    }
  });
  
  // Close the ingredient list if it's open
  if (html.includes('<ul>') && !html.includes('</ul>')) {
    html += `</ul>\n\n`;
  } else {
    html += `\n`;
  }
  
  // Process instructions with section headers
  html += `<h3>Instructions</h3>\n`;
  
  currentSection = '';
  recipeData.instructions.forEach((instruction, index) => {
    if (isSectionHeader(instruction)) {
      // This is a section header
      currentSection = instruction;
      html += `<h4>${currentSection}</h4>\n<ol>\n`;
    } else {
      // Regular instruction
      if (currentSection === '' && !html.includes('<ol>')) {
        html += `<ol>\n`;
      }
      html += `  <li>${instruction}</li>\n`;
    }
  });
  
  // Close the instruction list if it's open
  if (html.includes('<ol>') && !html.includes('</ol>')) {
    html += `</ol>\n\n`;
  } else {
    html += `\n`;
  }
  
  // Add notes if available
  if (recipeData.notes) {
    html += `<h3>Notes</h3>\n<p>${recipeData.notes}</p>\n\n`;
  }
  
  return html;
}

module.exports = {
  formatRecipeForWPRM,
  createWordPressRecipeObject,
  generateRecipeHTML
};