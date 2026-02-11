// fix-prompt-config.js
const fs = require('fs');
const path = require('path');

// Function to get the website-specific config file path
function getConfigPath(organizationId, websiteId) {
  if (websiteId) {
    return path.join(__dirname, 'data', `config-${organizationId}-${websiteId}.json`);
  } else {
    return path.join(__dirname, 'data', `config-${organizationId}.json`);
  }
}

// Function to load the website-specific config
function loadWebsiteConfig(organizationId, websiteId) {
  try {
    // First try website-specific config
    if (websiteId) {
      const websiteConfigPath = getConfigPath(organizationId, websiteId);
      if (fs.existsSync(websiteConfigPath)) {
        const configData = fs.readFileSync(websiteConfigPath, 'utf8');
        return JSON.parse(configData);
      }
    }
    
    // Fall back to organization config
    const orgConfigPath = getConfigPath(organizationId);
    if (fs.existsSync(orgConfigPath)) {
      const configData = fs.readFileSync(orgConfigPath, 'utf8');
      return JSON.parse(configData);
    }
    
    // Return default config if nothing found
    return {
      model: 'gpt-4-turbo-preview',
      temperature: 0.7,
      language: 'English',
      pinCount: 10,
      prompts: {}
    };
  } catch (error) {
    console.error('Error loading website config:', error);
    return null;
  }
}

// Function to save website-specific config
function saveWebsiteConfig(config, organizationId, websiteId) {
  try {
    const configPath = getConfigPath(organizationId, websiteId);
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    return true;
  } catch (error) {
    console.error('Error saving website config:', error);
    return false;
  }
}

// Monkey-patch app.js to always use the current website's config
function patchAppJs() {
  try {
    // Get the app.js module
    const appModule = require('./app');
    const originalUpdateConfig = appModule.updateConfig;
    
    // Replace the updateConfig function with our own version
    appModule.updateConfig = function(config) {
      // Call the original function
      originalUpdateConfig.call(this, config);
      
      // Store the config for the current website
      if (global.currentWebsiteId && global.currentOrganizationId) {
        saveWebsiteConfig(config, global.currentOrganizationId, global.currentWebsiteId);
      }
    };
    
    // Add a new function to get the current website's config
    appModule.getCurrentConfig = function() {
      if (global.currentWebsiteId && global.currentOrganizationId) {
        const websiteConfig = loadWebsiteConfig(global.currentOrganizationId, global.currentWebsiteId);
        if (websiteConfig) {
          // Update the app's config with the website-specific one
          this.updateConfig(websiteConfig);
          return websiteConfig;
        }
      }
      
      // Return the current config if no website config is found
      return this.config;
    };
    
    // Patch the generation functions to always use the current config
    const originalGenFunctions = [
      'generatePinterestContent',
      'generateBlogPost',
      'generateFacebookContent'
    ];
    
    originalGenFunctions.forEach(funcName => {
      if (typeof appModule[funcName] === 'function') {
        const originalFunc = appModule[funcName];
        
        appModule[funcName] = function(...args) {
          // Always get the current website's config before generating
          this.getCurrentConfig();
          
          // Call the original function
          return originalFunc.apply(this, args);
        };
      }
    });
    
    console.log('Successfully patched app.js to use website-specific configs');
    return true;
  } catch (error) {
    console.error('Error patching app.js:', error);
    return false;
  }
}

// Patch server.js to set global.currentOrganizationId
function patchServerJs() {
  try {
    // Add code to set global.currentOrganizationId in the middleware
    const serverJsPath = path.join(__dirname, 'server.js');
    let serverCode = fs.readFileSync(serverJsPath, 'utf8');
    
    // Find the middleware that sets global.currentWebsiteId
    const targetCode = `app.use((req, res, next) => {
  // Set global currentWebsiteId if it exists in session
  if (req.session && req.session.currentWebsiteId) {
    global.currentWebsiteId = req.session.currentWebsiteId;
  }
  next();
});`;
    
    // Replace with code that also sets global.currentOrganizationId
    const replacementCode = `app.use((req, res, next) => {
  // Set global currentWebsiteId if it exists in session
  if (req.session && req.session.currentWebsiteId) {
    global.currentWebsiteId = req.session.currentWebsiteId;
    
    // Also set global currentOrganizationId if available
    if (req.session.user && req.session.user.organizationId) {
      global.currentOrganizationId = req.session.user.organizationId;
    }
  }
  next();
});`;
    
    // Make the replacement
    const newServerCode = serverCode.replace(targetCode, replacementCode);
    
    // Only write the file if we actually made a change
    if (newServerCode !== serverCode) {
      // Create a backup of the original file
      fs.writeFileSync(serverJsPath + '.backup', serverCode);
      
      // Write the new file
      fs.writeFileSync(serverJsPath, newServerCode);
      console.log('Successfully patched server.js to set global.currentOrganizationId');
    } else {
      console.log('No changes needed to server.js');
    }
    
    return true;
  } catch (error) {
    console.error('Error patching server.js:', error);
    return false;
  }
}

// Run the patches
console.log('Fixing prompt configuration...');
patchAppJs();
patchServerJs();
console.log('Done. Please restart the server for changes to take effect.');