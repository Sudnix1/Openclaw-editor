// recipe-formatter.js - A dedicated module for recipe formatting

/**
 * Cleans recipe text by removing markdown formatting, emojis, and standardizing sections
 * @param {string} recipeText - The raw recipe text
 * @returns {string} - Cleaned recipe text
 */
function cleanRecipeText(recipeText) {
  if (!recipeText) return '';
  
  // Remove markdown formatting characters but retain section headers
  let cleaned = recipeText.trim();
  
  // Split the text into lines
  const lines = cleaned.split('\n');
  
  // Identify and fix section labels
  let currentSection = 'intro';
  let cleanedLines = [];
  
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();
    
    // Skip empty lines
    if (!line) continue;
    
    // Check if this is a main section marker
    if (line.includes('🧂') || line.toLowerCase().includes('ingredients')) {
      currentSection = 'ingredients';
      cleanedLines.push('INGREDIENTS');
      continue;
    } else if (line.includes('🧑‍🍳') || line.toLowerCase().includes('preparation') || 
              line.toLowerCase().includes('instructions') || line.toLowerCase().includes('steps')) {
      currentSection = 'instructions';
      cleanedLines.push('INSTRUCTIONS');
      continue;
    } else if (line.toLowerCase().includes('tip') || line.toLowerCase().includes('note')) {
      currentSection = 'tips';
      cleanedLines.push('TIPS & NOTES');
      continue;
    }
    
    // Check if this is a subsection header (e.g., "For the Burger Patties:")
    const isSubsectionHeader = 
      line.match(/^\*\*For.+:?\*\*$/) || 
      line.match(/^\*\*Assembly.+:?\*\*$/) || 
      line.match(/^\*\*Preparation.+:?\*\*$/);
    
    if (isSubsectionHeader) {
      // Keep subsection headers as special items
      // Remove asterisks but keep the text
      line = line.replace(/\*\*/g, '');
      cleanedLines.push(`SUBSECTION:${line}`);
      continue;
    }
    
    // Clean up list indicators
    if (currentSection === 'ingredients') {
      // For ingredients, handle bullet points consistently
      if (line.startsWith('- ') || line.startsWith('• ')) {
        line = line.substring(2).trim();
      }
      
      // REMOVED THE PROBLEMATIC NUMBERED INGREDIENT CLEANING
      // Ingredients should keep their measurements like "1 pound", "2 cups"
      
      // Remove asterisks from regular ingredients
      line = line.replace(/\*\*/g, '');
      
      // Add a standard bullet point to ingredient items
      line = '• ' + line;
    } else if (currentSection === 'instructions') {
      // For instructions, handle numbered steps consistently
      if (/^\d+[\.\)]/.test(line)) {
        // Already numbered, keep the number but standardize format
        const num = line.match(/^\d+/)[0];
        line = line.replace(/^\d+[\.\)]?\s*/, '').trim();
        // Remove asterisks from instructions
        line = line.replace(/\*\*/g, '');
        line = `${num}. ${line}`;
      } else if (line.startsWith('- ') || line.startsWith('• ')) {
        // Convert bullet points to numbered steps based on position
        line = line.substring(2).trim();
        // Remove asterisks from instructions
        line = line.replace(/\*\*/g, '');
        line = `${cleanedLines.length - 
          cleanedLines.lastIndexOf('INSTRUCTIONS')}. ${line}`;
      } else {
        // Remove asterisks from instructions
        line = line.replace(/\*\*/g, '');
      }
    }
    
    cleanedLines.push(line);
  }
  
  // Join the clean lines back together
  return cleanedLines.join('\n');
}

/**
 * Parses a recipe text into a structured object with title, ingredients, and instructions
 * @param {string} recipe - The recipe text
 * @returns {Object} - Structured recipe object
 */
function parseRecipe(recipe) {
  // Clean the text first
  const cleanedText = cleanRecipeText(recipe);
  
  // Split by lines and process each section
  const lines = cleanedText.split('\n');
  let title = '';
  let ingredients = [];
  let instructions = [];
  let currentSection = 'intro';
  let currentSubsection = '';
  
  // Process each line
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    // Check for section markers
    if (line === 'INGREDIENTS') {
      currentSection = 'ingredients';
      continue;
    } else if (line === 'INSTRUCTIONS') {
      currentSection = 'instructions';
      continue;
    } else if (line === 'TIPS & NOTES') {
      currentSection = 'tips';
      continue;
    } else if (line.startsWith('SUBSECTION:')) {
      // Handle subsection headers
      currentSubsection = line.replace('SUBSECTION:', '');
      
      if (currentSection === 'ingredients') {
        ingredients.push(currentSubsection);
      } else if (currentSection === 'instructions') {
        instructions.push(currentSubsection);
      }
      continue;
    } else if (i === 0 || (!currentSection && !title)) {
      // First non-empty line is likely the title
      title = line.replace(/\*\*/g, '').trim();
      continue;
    }
    
    // Add line to the right section
    if (currentSection === 'ingredients') {
      // Clean up ingredient line
      let ingredient = line;
      if (ingredient.startsWith('• ')) {
        ingredient = ingredient.substring(2);
      }
      
      ingredients.push(ingredient);
    } else if (currentSection === 'instructions') {
      // Clean up instruction line
      let instruction = line;
      if (/^\d+\.\s/.test(instruction)) {
        instruction = instruction.replace(/^\d+\.\s/, '');
      }
      instructions.push(instruction);
    }
  }
  
  return {
    title,
    ingredients,
    instructions
  };
}

/**
 * Extracts clean ingredients from a recipe text
 * @param {string} recipeText - The raw recipe text
 * @returns {Array} - Array of clean ingredients
 */
function extractCleanIngredients(recipeText) {
  const parsed = parseRecipe(recipeText);
  return parsed.ingredients.map(ingredient => {
    // Check if this is a section header
    if (!ingredient.startsWith('•') && !ingredient.match(/^\d+/)) {
      // This is likely a section header - keep it as is
      return ingredient;
    }
    
    // Otherwise clean the ingredient
    return ingredient.replace(/^•\s*/, '') // Remove bullet points
      .replace(/\*\*(.*?)\*\*/g, '$1') // Remove any remaining bold
      .replace(/^\s*[*-]\s*/, '') // Remove any remaining list indicators
      .trim();
  });
}

/**
 * Extracts clean instructions from a recipe text
 * @param {string} recipeText - The raw recipe text
 * @returns {Array} - Array of clean instructions
 */
function extractCleanInstructions(recipeText) {
  const parsed = parseRecipe(recipeText);
  return parsed.instructions.map(instruction => {
    // Check if this is a section header
    if (!instruction.match(/^\d+\./)) {
      // This is likely a section header - keep it as is
      return instruction;
    }
    
    // Otherwise clean the instruction
    return instruction.replace(/^\d+\.\s*/, '') // Remove numbering
      .replace(/\*\*(.*?)\*\*/g, '$1') // Remove any remaining bold
      .trim();
  });
}

/**
 * Cleans a recipe title by removing markdown and formatting
 * @param {string} title - The raw recipe title
 * @returns {string} - Clean title
 */
function cleanRecipeTitle(title) {
  return title
    .replace(/\*\*(.*?)\*\*/g, '$1') // Remove bold formatting
    .replace(/\*(.*?)\*/g, '$1') // Remove italic formatting
    .replace(/#{1,6}\s/, '') // Remove heading markers
    .replace(/[\u2700-\u27BF\uE000-\uF8FF\uD800-\uDFFF]+/g, '') // Remove emojis
    .trim();
}

/**
 * Prepares a recipe for WordPress by cleaning and formatting all components
 * @param {Object} recipeData - Raw recipe data
 * @returns {Object} - Cleaned recipe data ready for WordPress
 */
function prepareRecipeForWordPress(recipeData) {
  // Initialize with empty structures if not provided
  const recipe = recipeData.recipe || '';
  const title = recipeData.title || recipe.split('\n')[0] || '';
  const rawIngredients = recipeData.ingredients || [];
  const rawInstructions = recipeData.instructions || [];
  
  // Clean the title
  const cleanTitle = cleanRecipeTitle(title);
  
  // Process ingredients
  let cleanIngredients = [];
  if (rawIngredients.length > 0) {
    // If ingredients array is provided, clean each item
    cleanIngredients = rawIngredients.map(ingredient => {
      // Check if this is a section header (doesn't start with bullet or number)
      if (!ingredient.startsWith('•') && 
          !ingredient.startsWith('-') && 
          !ingredient.match(/^\d+/) &&
          (ingredient.includes(':') || ingredient.toLowerCase().includes('for the'))) {
        // This is a section header - keep it as is but remove formatting
        return ingredient.replace(/\*\*/g, '').trim();
      }
      
      // Otherwise clean the ingredient
      return ingredient.replace(/^•\s*/, '') // Remove bullet points
        .replace(/\*\*(.*?)\*\*/g, '$1') // Clean bold but keep the text
        .replace(/^\s*[*-]\s*/, '') // Remove any remaining list indicators
        .replace(/🧂|🧑‍🍳/g, '') // Remove emojis
        .trim();
    });
  } else if (recipe) {
    // If no ingredients array but we have the full recipe, extract them
    cleanIngredients = extractCleanIngredients(recipe);
  }
  
  // Process instructions
  let cleanInstructions = [];
  if (rawInstructions.length > 0) {
    // If instructions array is provided, clean each item
    cleanInstructions = rawInstructions.map(instruction => {
      // Check if this is a section header (doesn't start with number)
      if (!instruction.match(/^\d+\./) &&
          (instruction.includes(':') || instruction.toLowerCase().includes('assembly'))) {
        // This is a section header - keep it as is but remove formatting
        return instruction.replace(/\*\*/g, '').trim();
      }
      
      // Otherwise clean the instruction
      return instruction.replace(/^\d+\.\s*/, '') // Remove numbering
        .replace(/\*\*(.*?)\*\*/g, '$1') // Clean bold but keep the text
        .replace(/^["'](.*)["']$/, '$1') // Remove quotes
        .replace(/🧂|🧑‍🍳/g, '') // Remove emojis
        .trim();
    });
  } else if (recipe) {
    // If no instructions array but we have the full recipe, extract them
    cleanInstructions = extractCleanInstructions(recipe);
  }
  
  return {
    title: cleanTitle,
    ingredients: cleanIngredients,
    instructions: cleanInstructions
  };
}



/**
 * Parses a recipe text into a structured object with title, ingredients, and instructions
 * @param {string} recipe - The recipe text
 * @returns {Object} - Structured recipe object
 */
function parseRecipe(recipe) {
  // Clean the text first
  const cleanedText = cleanRecipeText(recipe);
  
  // Split by lines and process each section
  const lines = cleanedText.split('\n');
  let title = '';
  let ingredients = [];
  let instructions = [];
  let currentSection = 'intro';
  let currentSubsection = '';
  
  // Process each line
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    // Check for section markers
    if (line === 'INGREDIENTS') {
      currentSection = 'ingredients';
      continue;
    } else if (line === 'INSTRUCTIONS') {
      currentSection = 'instructions';
      continue;
    } else if (line === 'TIPS & NOTES') {
      currentSection = 'tips';
      continue;
    } else if (line.startsWith('SUBSECTION:')) {
      // Handle subsection headers
      currentSubsection = line.replace('SUBSECTION:', '');
      
      if (currentSection === 'ingredients') {
        ingredients.push(currentSubsection);
      } else if (currentSection === 'instructions') {
        instructions.push(currentSubsection);
      }
      continue;
    } else if (i === 0 || (!currentSection && !title)) {
      // First non-empty line is likely the title
      title = line.replace(/\*\*/g, '').trim();
      continue;
    }
    
    // Add line to the right section
    if (currentSection === 'ingredients') {
      // Clean up ingredient line
      let ingredient = line;
      if (ingredient.startsWith('• ')) {
        ingredient = ingredient.substring(2);
      }
      
      ingredients.push(ingredient);
    } else if (currentSection === 'instructions') {
      // Clean up instruction line
      let instruction = line;
      if (/^\d+\.\s/.test(instruction)) {
        instruction = instruction.replace(/^\d+\.\s/, '');
      }
      instructions.push(instruction);
    }
  }
  
  return {
    title,
    ingredients,
    instructions
  };
}

/**
 * Extracts clean ingredients from a recipe text
 * @param {string} recipeText - The raw recipe text
 * @returns {Array} - Array of clean ingredients
 */
function extractCleanIngredients(recipeText) {
  const parsed = parseRecipe(recipeText);
  return parsed.ingredients.map(ingredient => {
    // Check if this is a section header
    if (!ingredient.startsWith('•') && !ingredient.match(/^\d+/)) {
      // This is likely a section header - keep it as is
      return ingredient;
    }
    
    // Otherwise clean the ingredient
    return ingredient.replace(/^•\s*/, '') // Remove bullet points
      .replace(/\*\*(.*?)\*\*/g, '$1') // Remove any remaining bold
      .replace(/^\s*[*-]\s*/, '') // Remove any remaining list indicators
      .trim();
  });
}

/**
 * Extracts clean instructions from a recipe text
 * @param {string} recipeText - The raw recipe text
 * @returns {Array} - Array of clean instructions
 */
function extractCleanInstructions(recipeText) {
  const parsed = parseRecipe(recipeText);
  return parsed.instructions.map(instruction => {
    // Check if this is a section header
    if (!instruction.match(/^\d+\./)) {
      // This is likely a section header - keep it as is
      return instruction;
    }
    
    // Otherwise clean the instruction
    return instruction.replace(/^\d+\.\s*/, '') // Remove numbering
      .replace(/\*\*(.*?)\*\*/g, '$1') // Remove any remaining bold
      .trim();
  });
}

/**
 * Cleans a recipe title by removing markdown and formatting
 * @param {string} title - The raw recipe title
 * @returns {string} - Clean title
 */
function cleanRecipeTitle(title) {
  return title
    .replace(/\*\*(.*?)\*\*/g, '$1') // Remove bold formatting
    .replace(/\*(.*?)\*/g, '$1') // Remove italic formatting
    .replace(/#{1,6}\s/, '') // Remove heading markers
    .replace(/[\u2700-\u27BF\uE000-\uF8FF\uD800-\uDFFF]+/g, '') // Remove emojis
    .trim();
}

/**
 * Prepares a recipe for WordPress by cleaning and formatting all components
 * @param {Object} recipeData - Raw recipe data
 * @returns {Object} - Cleaned recipe data ready for WordPress
 */
function prepareRecipeForWordPress(recipeData) {
  // Initialize with empty structures if not provided
  const recipe = recipeData.recipe || '';
  const title = recipeData.title || recipe.split('\n')[0] || '';
  const rawIngredients = recipeData.ingredients || [];
  const rawInstructions = recipeData.instructions || [];
  
  // Clean the title
  const cleanTitle = cleanRecipeTitle(title);
  
  // Process ingredients
  let cleanIngredients = [];
  if (rawIngredients.length > 0) {
    // If ingredients array is provided, clean each item
    cleanIngredients = rawIngredients.map(ingredient => {
      // Check if this is a section header (doesn't start with bullet or number)
      if (!ingredient.startsWith('•') && 
          !ingredient.startsWith('-') && 
          !ingredient.match(/^\d+/) &&
          (ingredient.includes(':') || ingredient.toLowerCase().includes('for the'))) {
        // This is a section header - keep it as is but remove formatting
        return ingredient.replace(/\*\*/g, '').trim();
      }
      
      // Otherwise clean the ingredient
      return ingredient.replace(/^•\s*/, '') // Remove bullet points
        .replace(/\*\*(.*?)\*\*/g, '$1') // Clean bold but keep the text
        .replace(/^\s*[*-]\s*/, '') // Remove any remaining list indicators
        .replace(/🧂|🧑‍🍳/g, '') // Remove emojis
        .trim();
    });
  } else if (recipe) {
    // If no ingredients array but we have the full recipe, extract them
    cleanIngredients = extractCleanIngredients(recipe);
  }
  
  // Process instructions
  let cleanInstructions = [];
  if (rawInstructions.length > 0) {
    // If instructions array is provided, clean each item
    cleanInstructions = rawInstructions.map(instruction => {
      // Check if this is a section header (doesn't start with number)
      if (!instruction.match(/^\d+\./) &&
          (instruction.includes(':') || instruction.toLowerCase().includes('assembly'))) {
        // This is a section header - keep it as is but remove formatting
        return instruction.replace(/\*\*/g, '').trim();
      }
      
      // Otherwise clean the instruction
      return instruction.replace(/^\d+\.\s*/, '') // Remove numbering
        .replace(/\*\*(.*?)\*\*/g, '$1') // Clean bold but keep the text
        .replace(/^["'](.*)["']$/, '$1') // Remove quotes
        .replace(/🧂|🧑‍🍳/g, '') // Remove emojis
        .trim();
    });
  } else if (recipe) {
    // If no instructions array but we have the full recipe, extract them
    cleanInstructions = extractCleanInstructions(recipe);
  }
  
  return {
    title: cleanTitle,
    ingredients: cleanIngredients,
    instructions: cleanInstructions
  };
}

module.exports = {
  cleanRecipeText,
  parseRecipe,
  extractCleanIngredients,
  extractCleanInstructions,
  cleanRecipeTitle,
  prepareRecipeForWordPress
};