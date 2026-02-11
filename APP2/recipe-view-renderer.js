// recipe-view-renderer.js - Updated for better recipe display formatting
// This module handles rendering recipes with clean formatting

const recipeRenderer = {
  // Main function to generate recipe HTML for display
  generateRecipeHTML(recipe) {
    if (!recipe) return '<p>No recipe available</p>';
    
    const parsedRecipe = this.parseRecipe(recipe);
    
    // Generate a better description if one isn't available
    if (!parsedRecipe.description || parsedRecipe.description === 'A delicious recipe.') {
      parsedRecipe.description = this.generateRecipeDescription(parsedRecipe);
    }
    
    return `
      <div class="recipe-container">
        <div class="recipe-header">
          <h2>${parsedRecipe.title}</h2>
          <p class="recipe-intro">${parsedRecipe.description}</p>
          
          <div class="recipe-print-button">
            <button class="btn btn-success" onclick="window.print()">
              <i class="bi bi-printer"></i> Print Recipe
            </button>
          </div>
          
          <div class="recipe-meta">
            <div class="meta-item">
              <i class="bi bi-clock"></i>
              <div>
                <div class="meta-label">PREP TIME</div>
                <div class="meta-value">${parsedRecipe.prepTime || '15 mins'}</div>
              </div>
            </div>
            <div class="meta-item">
              <i class="bi bi-fire"></i>
              <div>
                <div class="meta-label">COOK TIME</div>
                <div class="meta-value">${parsedRecipe.cookTime || '30 mins'}</div>
              </div>
            </div>
            <div class="meta-item">
              <i class="bi bi-hourglass"></i>
              <div>
                <div class="meta-label">TOTAL TIME</div>
                <div class="meta-value">${parsedRecipe.totalTime || '45 mins'}</div>
              </div>
            </div>
            <div class="meta-item">
              <i class="bi bi-people"></i>
              <div>
                <div class="meta-label">SERVINGS</div>
                <div class="meta-value">${parsedRecipe.servings || '4 servings'}</div>
              </div>
            </div>
          </div>
        </div>

        <div class="recipe-content">
          <div class="recipe-ingredients">
            <h3>INGREDIENTS</h3>
            ${this.renderIngredients(parsedRecipe.ingredients)}
          </div>

          <div class="recipe-instructions">
            <h3>INSTRUCTIONS</h3>
            ${this.renderInstructions(parsedRecipe.instructions)}
          </div>
          
          ${parsedRecipe.notes ? `
          <div class="recipe-notes">
            <h3>NOTES</h3>
            <div class="notes-content">${parsedRecipe.notes}</div>
          </div>
          ` : ''}
        </div>
      </div>
    `;
  },
  
  // Generate a meaningful description for the recipe if none is provided
  generateRecipeDescription(recipe) {
    // Try to use the template system if available
    try {
      const recipeTemplates = require('./recipe-templates');
      const mainIngredients = this.extractMainIngredients(recipe.ingredients || []);
      return recipeTemplates.generateTemplatedDescription(recipe, mainIngredients);
    } catch (error) {
      // Fall back to built-in templates if module not available
      console.log('Recipe templates module not found, using built-in templates');
      
      const title = recipe.title || "This dish";
      const mainIngredients = this.extractMainIngredients(recipe.ingredients || []);
      
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
  },
  
  // Extract the main ingredients from the ingredients list for use in the description
  extractMainIngredients(ingredients) {
    // Filter out section headers and extract important ingredients
    const filteredIngredients = ingredients
      .filter(item => !this.isSectionHeader(item))
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
  },
  
  // Render ingredients with proper section headers
  renderIngredients(ingredients) {
    if (!ingredients || ingredients.length === 0) {
      return '<p>No ingredients available</p>';
    }
    
    let html = '<ul>';
    let inSection = false;
    
    ingredients.forEach(item => {
      // Check if this is a section header
      if (this.isSectionHeader(item)) {
        // If we're already in a section, close the previous list
        if (inSection) {
          html += '</ul>';
        }
        
        // Add the section header
        html += `<h4>${item}</h4><ul>`;
        inSection = true;
      } else {
        // Add regular ingredient
        html += `<li>${item}</li>`;
      }
    });
    
    // Close the final list
    html += '</ul>';
    
    return html;
  },
  
  // Render instructions with proper section headers and numbering
  renderInstructions(instructions) {
    if (!instructions || instructions.length === 0) {
      return '<p>No instructions available</p>';
    }
    
    // First, filter out metadata and footer lines
    const cleanedInstructions = this.filterInstructionsMetadata(instructions);
    
    let html = '<ol>';
    let inSection = false;
    let stepNumber = 1;
    
    cleanedInstructions.forEach(item => {
      // Check if this is a section header
      if (this.isSectionHeader(item)) {
        // If we're already in a section, close the previous list
        if (inSection) {
          html += '</ol>';
        }
        
        // Add the section header
        html += `<h4>${item}</h4><ol>`;
        inSection = true;
        stepNumber = 1; // Reset step counter for each section
      } else {
        // Add regular instruction with step number
        html += `<li>${item}</li>`;
        stepNumber++;
      }
    });
    
    // Close the final list
    html += '</ol>';
    
    return html;
  },
  
  // Filter out metadata and footers from instructions
  filterInstructionsMetadata(instructions) {
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
  },
  
  // Check if a line is a section header
  isSectionHeader(line) {
    return (
      (line.includes(':') && !line.match(/^\d+\./)) || // Has a colon but not a numbered step
      line.toLowerCase().includes('for the') || // Contains "For the X"
      line.toLowerCase().includes('assembly') || // Contains "Assembly"
      line.toLowerCase().match(/^(ingredients|instructions|preparation|steps)$/) // Is a main section label
    );
  },
  
  // Parse the recipe text into a structured object
  parseRecipe(recipeText) {
    // Ensure we're working with a string
    const text = typeof recipeText === 'string' ? recipeText : JSON.stringify(recipeText);
    
    // Clean and normalize the text
    const cleanText = this.cleanRecipeText(text);
    
    // Attempt to parse JSON if the input is a JSON string
    let recipeObj = {};
    try {
      recipeObj = typeof recipeText === 'object' ? recipeText : JSON.parse(text);
    } catch (e) {
      // Not JSON, continue with text parsing
    }
    
    // Initialize result with values from object or defaults
    const result = {
      title: recipeObj.title || '',
      description: recipeObj.description || '',
      ingredients: recipeObj.ingredients || [],
      instructions: recipeObj.instructions || [],
      prepTime: recipeObj.prep_time || '15 mins',
      cookTime: recipeObj.cook_time || '30 mins',
      totalTime: recipeObj.total_time || '45 mins',
      servings: recipeObj.servings || '4',
      notes: recipeObj.notes || ''
    };
    
    // If we have arrays already, use them
    if (result.ingredients.length > 0 && result.instructions.length > 0) {
      return result;
    }
    
    // Otherwise parse from text
    const lines = cleanText.split('\n');
    let currentSection = null;
    
    // Process each line
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      
      // Check for section markers
      if (line === 'INGREDIENTS' || line.toLowerCase().includes('ingredients')) {
        currentSection = 'ingredients';
        continue;
      } else if (line === 'INSTRUCTIONS' || line.toLowerCase().includes('instructions') || 
                line.toLowerCase().includes('directions') || line.toLowerCase().includes('steps')) {
        currentSection = 'instructions';
        continue;
      } else if (line === 'NOTES' || line.toLowerCase().includes('notes') || 
                line.toLowerCase().includes('tips')) {
        currentSection = 'notes';
        continue;
      } else if (i === 0 && !result.title) {
        // First non-empty line is the title
        result.title = line;
        continue;
      }
      
      // Add content to appropriate section
      if (currentSection === 'ingredients') {
        // Clean ingredient line
        let ingredient = line;
        // Remove bullet points, numbers, etc.
        ingredient = ingredient.replace(/^[•\-*0-9]+\.?\s*/g, '');
        result.ingredients.push(ingredient);
      } else if (currentSection === 'instructions') {
        // Clean instruction line
        let instruction = line;
        // Remove numbering
        instruction = instruction.replace(/^[0-9]+\.?\s*/g, '');
        result.instructions.push(instruction);
      } else if (currentSection === 'notes') {
        // Add to notes
        result.notes += (result.notes ? '\n' : '') + line;
      } else if (!currentSection && !result.description && result.title) {
        // Lines before any section marker are the description
        result.description += (result.description ? ' ' : '') + line;
      }
    }
    
    return result;
  },
  
  // Clean the recipe text to remove markdown and standardize formatting
  cleanRecipeText(text) {
    if (!text) return '';
    
    // Remove markdown formatting
    let cleaned = text
      .replace(/\*\*(.*?)\*\*/g, '$1') // Remove bold
      .replace(/\*(.*?)\*/g, '$1') // Remove italic
      .replace(/#{1,6}\s/g, '') // Remove heading markers
      .replace(/\n{3,}/g, '\n\n') // Normalize multiple line breaks
      .trim();
    
    return cleaned;
  }
};

module.exports = recipeRenderer;