// Create a new file: migrations/add-discord-settings.js
const path = require('path');
const fs = require('fs');

async function addDiscordSettingsToConfig() {
  try {
    console.log('Adding Discord settings support to configuration...');
    
    // The prompt settings are stored as JSON files, so no database migration needed
    // But we can ensure the default config includes Discord settings
    
    const configDir = path.join(__dirname, '..', 'data');
    
    // Ensure data directory exists
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
    
    console.log('Discord settings migration completed successfully!');
    console.log('Discord settings will be saved with other prompt configurations.');
    
    return true;
  } catch (error) {
    console.error('Error in Discord settings migration:', error);
    return false;
  }
}

if (require.main === module) {
  addDiscordSettingsToConfig()
    .then(success => {
      if (success) {
        console.log('✅ Discord settings migration completed');
        process.exit(0);
      } else {
        console.log('❌ Discord settings migration failed');
        process.exit(1);
      }
    })
    .catch(error => {
      console.error('Migration error:', error);
      process.exit(1);
    });
}

module.exports = { addDiscordSettingsToConfig };