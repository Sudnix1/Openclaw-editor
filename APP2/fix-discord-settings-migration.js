// Create this file: fix-discord-settings-migration.js

const { runQuery, getOne } = require('./db');

async function ensureDiscordSettingsTable() {
  try {
    console.log('🔧 Ensuring Discord settings are properly configured...');
    
    // Check if app_settings table exists
    const tableExists = await getOne(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name='app_settings'
    `);
    
    if (!tableExists) {
      console.log('📝 Creating app_settings table...');
      await runQuery(`
        CREATE TABLE IF NOT EXISTS app_settings (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          setting_key TEXT UNIQUE NOT NULL,
          setting_value TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);
    }
    
    // Check if Discord settings exist, if not create default entries
    const discordSettings = [
      'discord_channel_id',
      'discord_user_token', 
      'discord_webhook_url',
      'enable_discord'
    ];
    
    for (const setting of discordSettings) {
      const exists = await getOne(
        "SELECT setting_key FROM app_settings WHERE setting_key = ?",
        [setting]
      );
      
      if (!exists) {
        console.log(`📝 Creating default entry for ${setting}...`);
        await runQuery(
          "INSERT INTO app_settings (setting_key, setting_value) VALUES (?, ?)",
          [setting, setting === 'enable_discord' ? 'false' : '']
        );
      }
    }
    
    // Show current Discord settings status
    console.log('\n📊 Current Discord Settings Status:');
    for (const setting of discordSettings) {
      const result = await getOne(
        "SELECT setting_value FROM app_settings WHERE setting_key = ?",
        [setting]
      );
      
      const value = result ? result.setting_value : 'NOT_FOUND';
      const status = value && value.trim() !== '' ? '✅ SET' : '❌ EMPTY';
      
      console.log(`   ${setting}: ${status}`);
    }
    
    console.log('\n✅ Discord settings table setup complete!');
    console.log('💡 Configure your Discord settings in the Settings page to enable image generation.');
    
    return true;
  } catch (error) {
    console.error('❌ Error setting up Discord settings:', error);
    throw error;
  }
}

// Helper function to manually set Discord settings (for emergency use)
async function setDiscordSettings(channelId, userToken, enableDiscord = true) {
  try {
    console.log('🔧 Manually setting Discord settings...');
    
    await runQuery(
      "UPDATE app_settings SET setting_value = ?, updated_at = CURRENT_TIMESTAMP WHERE setting_key = 'discord_channel_id'",
      [channelId]
    );
    
    await runQuery(
      "UPDATE app_settings SET setting_value = ?, updated_at = CURRENT_TIMESTAMP WHERE setting_key = 'discord_user_token'", 
      [userToken]
    );
    
    await runQuery(
      "UPDATE app_settings SET setting_value = ?, updated_at = CURRENT_TIMESTAMP WHERE setting_key = 'enable_discord'",
      [enableDiscord ? 'true' : 'false']
    );
    
    console.log('✅ Discord settings updated successfully!');
    return true;
  } catch (error) {
    console.error('❌ Error setting Discord settings:', error);
    throw error;
  }
}

// Test function to verify Discord settings
async function testDiscordSettings() {
  try {
    console.log('🧪 Testing Discord settings retrieval...');
    
    const channelId = await getOne(
      "SELECT setting_value FROM app_settings WHERE setting_key = 'discord_channel_id'"
    );
    const userToken = await getOne(
      "SELECT setting_value FROM app_settings WHERE setting_key = 'discord_user_token'"
    );
    const enabled = await getOne(
      "SELECT setting_value FROM app_settings WHERE setting_key = 'enable_discord'"
    );
    
    console.log('📊 Discord Settings Test Results:');
    console.log(`   Channel ID: ${channelId ? 'SET' : 'NOT SET'}`);
    console.log(`   User Token: ${userToken ? 'SET' : 'NOT SET'}`);
    console.log(`   Enabled: ${enabled ? enabled.setting_value : 'NOT SET'}`);
    
    const isComplete = channelId && userToken && 
                      channelId.setting_value && channelId.setting_value.trim() !== '' &&
                      userToken.setting_value && userToken.setting_value.trim() !== '';
    
    console.log(`\n🎯 Discord Configuration: ${isComplete ? '✅ COMPLETE' : '❌ INCOMPLETE'}`);
    
    return isComplete;
  } catch (error) {
    console.error('❌ Error testing Discord settings:', error);
    return false;
  }
}

if (require.main === module) {
  ensureDiscordSettingsTable()
    .then(() => testDiscordSettings())
    .then(() => {
      console.log('\n🎉 Discord settings migration completed!');
      process.exit(0);
    })
    .catch(error => {
      console.error('💥 Migration failed:', error);
      process.exit(1);
    });
}

module.exports = { 
  ensureDiscordSettingsTable, 
  setDiscordSettings, 
  testDiscordSettings 
};