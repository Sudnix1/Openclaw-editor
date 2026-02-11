// recipe-template-settings.js
// Module for managing recipe template settings

const fs = require('fs');
const path = require('path');

// Define the settings file path
const SETTINGS_FILE = path.join(__dirname, 'data', 'recipe-template-settings.json');

/**
 * Default template settings
 */
const DEFAULT_SETTINGS = {
  // Description templates
  defaultDescription: "This delicious {title} is a fantastic dish that's sure to impress. Made with {ingredients}, it combines great flavors and textures for a memorable meal.",
  cakeDescription: "This decadent {title} is perfect for special occasions or when you're craving something sweet. Made with {ingredients}, it's a treat that everyone will love.",
  soupDescription: "This hearty {title} is comforting and full of flavor. Made with {ingredients}, it's perfect for a cozy meal any day of the week.",
  saladDescription: "This refreshing {title} is packed with nutrients and flavor. Featuring {ingredients}, it makes a perfect light meal or side dish.",
  chickenDescription: "This flavorful {title} is a crowd-pleaser that's easy to prepare. Made with {ingredients}, it's perfect for a weeknight dinner or special occasion.",
  
  // Notes templates settings
  enableStorageNote: true,
  storageNoteTemplate: "Storage: Store in an airtight container in the refrigerator for up to {days} days.",
  storageDays: 3,
  
  enableMakeAheadNote: false,
  makeAheadTemplate: "Make ahead: This {dishType} can be prepared up to {hours} hours in advance. {extraInstructions}",
  makeAheadHours: 24,
  dishType: "dish",
  extraInstructions: "Cover and refrigerate until ready to serve."
};

/**
 * Load template settings from file
 * @returns {Object} Template settings
 */
function loadTemplateSettings() {
  try {
    // Check if settings file exists
    if (!fs.existsSync(SETTINGS_FILE)) {
      // Create directory if it doesn't exist
      const dir = path.dirname(SETTINGS_FILE);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      // Write default settings
      fs.writeFileSync(SETTINGS_FILE, JSON.stringify(DEFAULT_SETTINGS, null, 2));
      return DEFAULT_SETTINGS;
    }
    
    // Read and parse settings file
    const data = fs.readFileSync(SETTINGS_FILE, 'utf8');
    const settings = JSON.parse(data);
    
    // Merge with defaults to ensure all properties exist
    return { ...DEFAULT_SETTINGS, ...settings };
  } catch (error) {
    console.error('Error loading template settings:', error);
    return DEFAULT_SETTINGS;
  }
}

/**
 * Save template settings to file
 * @param {Object} settings - Template settings to save
 * @returns {boolean} Success status
 */
function saveTemplateSettings(settings) {
  try {
    console.log('Attempting to save settings to:', SETTINGS_FILE);
    
    // Create directory if it doesn't exist
    const dir = path.dirname(SETTINGS_FILE);
    if (!fs.existsSync(dir)) {
      console.log('Creating directory:', dir);
      fs.mkdirSync(dir, { recursive: true });
    }
    
    // Merge with defaults to ensure all required properties exist
    const mergedSettings = { ...DEFAULT_SETTINGS, ...settings };
    
    // Write settings to file with pretty formatting
    const dataToWrite = JSON.stringify(mergedSettings, null, 2);
    console.log('Writing settings data:', dataToWrite);
    
    fs.writeFileSync(SETTINGS_FILE, dataToWrite);
    console.log('Settings file written successfully');
    
    // Try to update the template module with new settings
    try {
      updateTemplateModule(mergedSettings);
    } catch (moduleError) {
      console.error('Error updating template module (non-fatal):', moduleError);
      // Continue even if module update fails
    }
    
    return true;
  } catch (error) {
    console.error('Error saving template settings:', error);
    return false;
  }
}

/**
 * Update the recipe-templates.js file with new settings
 * @param {Object} settings - Template settings
 */
function updateTemplateModule(settings) {
  try {
    // Check if recipe-templates.js exists
    const templateFile = path.join(__dirname, 'recipe-templates.js');
    if (!fs.existsSync(templateFile)) {
      console.log('Recipe templates module not found, skipping update');
      return;
    }
    
    // Read the template module
    let moduleContent = fs.readFileSync(templateFile, 'utf8');
    
    // Update description templates
    moduleContent = updateDescriptionTemplate(moduleContent, 'default', settings.defaultDescription);
    moduleContent = updateDescriptionTemplate(moduleContent, 'cake', settings.cakeDescription);
    moduleContent = updateDescriptionTemplate(moduleContent, 'soup', settings.soupDescription);
    moduleContent = updateDescriptionTemplate(moduleContent, 'salad', settings.saladDescription);
    moduleContent = updateDescriptionTemplate(moduleContent, 'chicken', settings.chickenDescription);
    
    // Update note templates
    moduleContent = updateNoteTemplate(moduleContent, 'storage', settings.storageNoteTemplate);
    moduleContent = updateNoteTemplate(moduleContent, 'makeAhead', settings.makeAheadTemplate);
    
    // Write the updated module
    fs.writeFileSync(templateFile, moduleContent);
    
    console.log('Recipe templates module updated with new settings');
  } catch (error) {
    console.error('Error updating template module:', error);
  }
}

/**
 * Update a description template in the module content
 * @param {string} content - Module content
 * @param {string} templateName - Template name
 * @param {string} newTemplate - New template string
 * @returns {string} Updated module content
 */
function updateDescriptionTemplate(content, templateName, newTemplate) {
  if (!newTemplate) return content;
  
  // Escape special regex characters in the template name
  const escapedName = templateName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  
  // Create regex to find the template
  const templateRegex = new RegExp(`(${escapedName}:\\s*{[\\s\\S]*?template:\\s*)"([^"]*)"`, 'i');
  
  // Replace the template string
  return content.replace(templateRegex, (match, prefix, oldTemplate) => {
    return `${prefix}"${newTemplate}"`;
  });
}

/**
 * Update a note template in the module content
 * @param {string} content - Module content
 * @param {string} templateName - Template name
 * @param {string} newTemplate - New template string
 * @returns {string} Updated module content
 */
function updateNoteTemplate(content, templateName, newTemplate) {
  if (!newTemplate) return content;
  
  // Escape special regex characters in the template name
  const escapedName = templateName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  
  // Create regex to find the template
  const templateRegex = new RegExp(`(${escapedName}:\\s*{[\\s\\S]*?template:\\s*)"([^"]*)"`, 'i');
  
  // Replace the template string
  return content.replace(templateRegex, (match, prefix, oldTemplate) => {
    return `${prefix}"${newTemplate}"`;
  });
}

/**
 * Generate notes for a recipe based on current settings
 * @param {Object} recipeData - Recipe data
 * @returns {string} Generated notes
 */
function generateNotesFromSettings(recipeData) {
  // Load settings
  const settings = loadTemplateSettings();
  
  let notes = '';
  
  // Add storage note if enabled
  if (settings.enableStorageNote) {
    notes += settings.storageNoteTemplate.replace('{days}', settings.storageDays);
  }
  
  // Add make ahead note if enabled
  if (settings.enableMakeAheadNote) {
    if (notes) notes += '\n\n';
    
    notes += settings.makeAheadTemplate
      .replace('{dishType}', settings.dishType)
      .replace('{hours}', settings.makeAheadHours)
      .replace('{extraInstructions}', settings.extraInstructions);
  }
  
  return notes;
}

/**
 * Apply template settings to a recipe
 * @param {Object} recipeData - Recipe data
 * @returns {Object} Updated recipe data
 */
function applyTemplateSettings(recipeData) {
  // Make a copy of the recipe data
  const updatedRecipe = { ...recipeData };
  
  // Load settings
  const settings = loadTemplateSettings();
  
  // Add notes if none exist and notes templates are enabled
  if (!updatedRecipe.notes && (settings.enableStorageNote || settings.enableMakeAheadNote)) {
    updatedRecipe.notes = generateNotesFromSettings(recipeData);
  }
  
  return updatedRecipe;
}

module.exports = {
  loadTemplateSettings,
  saveTemplateSettings,
  applyTemplateSettings,
  generateNotesFromSettings,
  DEFAULT_SETTINGS
};