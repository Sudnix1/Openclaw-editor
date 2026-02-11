// recipe-templates.js - Customizable templates for recipe descriptions and notes
// This file allows easy customization of how recipe descriptions and notes are generated

/**
 * Configuration for recipe description templates
 * You can customize these templates to change how descriptions are generated
 */
const descriptionTemplates = {
  // Default template used when no specific template matches
  default: {
    template: "This delicious {title} is a fantastic dish that's sure to impress. Made with {ingredients}, it combines great flavors and textures for a memorable meal.",
    shouldUse: (recipeData) => true // Always matches as fallback
  },
  
  // Template for cake recipes
  cake: {
    template: "This decadent {title} is perfect for special occasions or when you're craving something sweet. Made with {ingredients}, it's a treat that everyone will love.",
    shouldUse: (recipeData) => recipeData.title.toLowerCase().includes('cake')
  },
  
  // Template for soup and stew recipes
  soup: {
    template: "This hearty {title} is comforting and full of flavor. Made with {ingredients}, it's perfect for a cozy meal any day of the week.",
    shouldUse: (recipeData) => {
      const title = recipeData.title.toLowerCase();
      return title.includes('soup') || title.includes('stew');
    }
  },
  
  // Template for salad recipes
  salad: {
    template: "This refreshing {title} is packed with nutrients and flavor. Featuring {ingredients}, it makes a perfect light meal or side dish.",
    shouldUse: (recipeData) => recipeData.title.toLowerCase().includes('salad')
  },
  
  // Template for chicken recipes
  chicken: {
    template: "This flavorful {title} is a crowd-pleaser that's easy to prepare. Made with {ingredients}, it's perfect for a weeknight dinner or special occasion.",
    shouldUse: (recipeData) => recipeData.title.toLowerCase().includes('chicken')
  },
  
  // Template for pasta recipes
  pasta: {
    template: "This delicious {title} combines wonderful flavors and textures. Made with {ingredients}, it's a satisfying dish that's perfect for any pasta lover.",
    shouldUse: (recipeData) => {
      const title = recipeData.title.toLowerCase();
      return title.includes('pasta') || title.includes('spaghetti') || 
             title.includes('fettuccine') || title.includes('linguine') ||
             title.includes('penne') || title.includes('macaroni');
    }
  },
  
  // Template for dessert recipes
  dessert: {
    template: "This irresistible {title} is the perfect way to end any meal. Made with {ingredients}, it's a sweet treat that will satisfy any dessert craving.",
    shouldUse: (recipeData) => {
      const title = recipeData.title.toLowerCase();
      return title.includes('dessert') || title.includes('cookie') || 
             title.includes('brownie') || title.includes('ice cream') ||
             title.includes('pudding') || title.includes('pie');
    }
  },
  
  // Template for breakfast recipes
  breakfast: {
    template: "Start your day right with this delicious {title}. Featuring {ingredients}, it's a satisfying breakfast that will give you energy for the day ahead.",
    shouldUse: (recipeData) => {
      const title = recipeData.title.toLowerCase();
      return title.includes('breakfast') || title.includes('pancake') || 
             title.includes('waffle') || title.includes('omelette') ||
             title.includes('oatmeal') || title.includes('french toast');
    }
  }
  
  // Add more custom templates here!
};

/**
 * Configuration for recipe notes templates
 * You can customize or add to these templates
 */
const notesTemplates = {
  // Storage template
  storage: {
    template: "Storage: {placeholder} Store in an airtight container in the refrigerator for up to {days} days.",
    shouldUse: (recipeData) => true, // Default template
    defaultValues: {
      placeholder: "",
      days: "3"
    }
  },
  
  // Make ahead template
  makeAhead: {
    template: "Make ahead: This {dishType} can be prepared up to {hours} hours in advance. {extraInstructions}",
    shouldUse: (recipeData) => true,
    defaultValues: {
      dishType: "dish",
      hours: "24",
      extraInstructions: "Cover and refrigerate until ready to serve."
    }
  },
  
  // Substitutions template
  substitutions: {
    template: "Substitutions: {ingredients} can be substituted with {alternatives} if needed.",
    shouldUse: (recipeData) => true,
    defaultValues: {
      ingredients: "Some ingredients",
      alternatives: "suitable alternatives"
    }
  },
  
  // Add more custom note templates here!
};

/**
 * Get the appropriate description template for a recipe
 * @param {Object} recipeData - Recipe data object
 * @returns {Object} The matching template object
 */
function getDescriptionTemplate(recipeData) {
  // Find the first matching template based on shouldUse function
  for (const [name, template] of Object.entries(descriptionTemplates)) {
    if (name !== 'default' && template.shouldUse(recipeData)) {
      return template;
    }
  }
  
  // Return default template if no others match
  return descriptionTemplates.default;
}

/**
 * Generate a description for a recipe using templates
 * @param {Object} recipeData - Recipe data
 * @param {string} ingredients - Main ingredients string
 * @returns {string} Formatted description
 */
function generateTemplatedDescription(recipeData, ingredients) {
  // Get appropriate template
  const template = getDescriptionTemplate(recipeData);
  
  // Replace placeholders in template
  return template.template
    .replace('{title}', recipeData.title.toLowerCase())
    .replace('{ingredients}', ingredients);
}

/**
 * Generate notes for a recipe using the selected template
 * @param {string} templateName - Name of the template to use
 * @param {Object} values - Values to substitute in the template
 * @returns {string} Formatted notes
 */
function generateTemplatedNote(templateName, values = {}) {
  // Get the template
  const template = notesTemplates[templateName];
  
  if (!template) {
    return ""; // Template not found
  }
  
  // Combine default values with provided values
  const combinedValues = { ...template.defaultValues, ...values };
  
  // Start with the template
  let result = template.template;
  
  // Replace all placeholders with values
  for (const [key, value] of Object.entries(combinedValues)) {
    result = result.replace(`{${key}}`, value);
  }
  
  return result;
}

/**
 * Combine multiple note templates into a single notes section
 * @param {Array} noteConfigs - Array of {template, values} objects
 * @returns {string} Combined notes
 */
function combineNotes(noteConfigs) {
  return noteConfigs
    .map(config => generateTemplatedNote(config.template, config.values))
    .filter(note => note.trim() !== "")
    .join("\n\n");
}

module.exports = {
  descriptionTemplates,
  notesTemplates,
  getDescriptionTemplate,
  generateTemplatedDescription,
  generateTemplatedNote,
  combineNotes
};