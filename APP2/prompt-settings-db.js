// prompt-settings-db.js
const fs = require('fs');
const path = require('path');


// Add at the beginning of the file
const DEBUG = true; // Set to false when not debugging

// Add this function
function debugLog(message, data) {
  if (DEBUG) {
    console.log('\x1b[33m%s\x1b[0m', '🔍 DEBUG: ' + message);
    if (data) {
      console.log(JSON.stringify(data, null, 2));
    }
  }
}

// Modify the processPromptTemplate function
function processPromptTemplate(template, variables) {
  if (!template) return '';
  
  debugLog('Original template:', template);
  debugLog('Variables to replace:', variables);
  
  let processedTemplate = template;
  
  // Replace each variable in the template ONLY if value exists and is not empty
  for (const [key, value] of Object.entries(variables)) {
    if (value !== undefined && value !== null && value !== '') {
      // Handle double curly braces {{key}}
      const doubleRegex = new RegExp(`{{${key}}}`, 'g');
      processedTemplate = processedTemplate.replace(doubleRegex, value);
      
      // Handle single curly braces {key}
      const singleRegex = new RegExp(`{${key}}`, 'g');
      processedTemplate = processedTemplate.replace(singleRegex, value);
      
      debugLog(`Replaced ${key} with:`, value);
    }
  }
  
  debugLog('Processed template:', processedTemplate);
  return processedTemplate;
}

// Helper function to get settings file path
function getSettingsFilePath(organizationId, websiteId) {
  // Ensure IDs are strings to prevent [object Object] in filenames
  const orgId = String(organizationId);
  const webId = websiteId ? String(websiteId) : null;
  
  const fileName = webId 
    ? `config-${orgId}-${webId}.json`
    : `config-${orgId}.json`;
  return path.join(__dirname, 'data', fileName);
}

// Load settings for a specific organization and website
function loadSettings(organizationId, websiteId) {
  try {
    // First try to load website-specific settings
    if (websiteId) {
      const websiteFilePath = getSettingsFilePath(organizationId, websiteId);
      if (fs.existsSync(websiteFilePath)) {
        const fileContent = fs.readFileSync(websiteFilePath, 'utf8');
        return JSON.parse(fileContent);
      }
    }
    
    // Fall back to organization-wide settings
    const orgFilePath = getSettingsFilePath(organizationId);
    if (fs.existsSync(orgFilePath)) {
      const fileContent = fs.readFileSync(orgFilePath, 'utf8');
      return JSON.parse(fileContent);
    }
    
    // Return default settings if no file exists
    return {
      model: 'gpt-4-turbo-preview',
      temperature: 0.7,
      language: 'English',
      pinCount: 10,
      prompts: {}
    };
  } catch (error) {
    console.error(`Error loading settings for org ${organizationId} and website ${websiteId}:`, error);
    // Return default settings on error
    return {
      model: 'gpt-4-turbo-preview',
      temperature: 0.7,
      language: 'English',
      pinCount: 10,
      prompts: {}
    };
  }
}

// Save settings for a specific organization and website
function saveSettings(settings, organizationId, websiteId) {
  try {
    console.log('🔧 saveSettings called with:', {
      organizationId,
      websiteId,
      settingsKeys: settings ? Object.keys(settings) : 'null',
      bufferEnabled: settings?.bufferEnabled,
      bufferCookiesTextLength: settings?.bufferCookiesText?.length || 0
    });
    
    const filePath = getSettingsFilePath(organizationId, websiteId);
    console.log('📁 Settings file path:', filePath);
    
    // Create the directory if it doesn't exist
    const dirPath = path.dirname(filePath);
    if (!fs.existsSync(dirPath)) {
      console.log('📁 Creating directory:', dirPath);
      fs.mkdirSync(dirPath, { recursive: true });
    }
    
    // Write settings to file
    const jsonString = JSON.stringify(settings, null, 2);
    console.log('💾 Writing settings to file, length:', jsonString.length);
    fs.writeFileSync(filePath, jsonString);
    
    // Verify file was written
    if (fs.existsSync(filePath)) {
      const fileStats = fs.statSync(filePath);
      console.log('✅ File written successfully, size:', fileStats.size, 'bytes');
    }
    
    return true;
  } catch (error) {
    console.error(`❌ Error saving settings for org ${organizationId} and website ${websiteId}:`, error);
    return false;
  }
}

// Migrate existing organization-wide settings to website-specific settings
// This helps during the transition period
function migrateOrgSettingsToWebsites(organizationId, websiteIds) {
  try {
    // Load org-wide settings
    const orgSettings = loadSettings(organizationId);
    
    // Save the same settings for each website
    websiteIds.forEach(websiteId => {
      saveSettings(orgSettings, organizationId, websiteId);
    });
    
    return true;
  } catch (error) {
    console.error(`Error migrating settings for org ${organizationId}:`, error);
    return false;
  }
}

// Get available variables for prompts
function getAvailablePromptVariables() {
  return {
    recipeTitle: "The title of the recipe",
    language: "The language to generate content in",
    pinCount: "The number of Pinterest variations to generate",
    interest: "The interest associated with the keyword from the keyword manager"
  };
}

// Process prompt template with variables
function processPromptTemplate(template, variables) {
  if (!template) return '';
  
  let processedTemplate = template;
  
  // Replace each variable in the template ONLY if value exists and is not empty
  for (const [key, value] of Object.entries(variables)) {
    if (value !== undefined && value !== null && value !== '') {
      // Handle double curly braces {{key}}
      const doubleRegex = new RegExp(`{{${key}}}`, 'g');
      processedTemplate = processedTemplate.replace(doubleRegex, value);
      
      // Handle single curly braces {key}
      const singleRegex = new RegExp(`{${key}}`, 'g');
      processedTemplate = processedTemplate.replace(singleRegex, value);
    }
  }
  
  return processedTemplate;
}

module.exports = {
  loadSettings,
  saveSettings,
  migrateOrgSettingsToWebsites,
  getAvailablePromptVariables,
  processPromptTemplate
};