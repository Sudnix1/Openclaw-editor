// Create this file: emergency-discord-fix.js

const { runQuery, getOne } = require('./db');

async function emergencyDiscordFix() {
  try {
    console.log('🚨 EMERGENCY DISCORD SETTINGS FIX');
    console.log('==================================');
    
    // STEP 1: Check current state
    console.log('\n1️⃣ Checking current Discord settings...');
    
    try {
      const channelId = await getOne(
        "SELECT setting_value FROM app_settings WHERE setting_key = 'discord_channel_id'"
      );
      const userToken = await getOne(
        "SELECT setting_value FROM app_settings WHERE setting_key = 'discord_user_token'"
      );
      const enabled = await getOne(
        "SELECT setting_value FROM app_settings WHERE setting_key = 'enable_discord'"
      );
      
      console.log('📊 Current Settings:');
      console.log(`   Channel ID: ${channelId?.setting_value || 'NOT SET'}`);
      console.log(`   User Token: ${userToken?.setting_value ? 'SET (hidden)' : 'NOT SET'}`);
      console.log(`   Enabled: ${enabled?.setting_value || 'NOT SET'}`);
      
    } catch (dbError) {
      console.log('❌ Database access failed, will create table...');
      
      // Create app_settings table if it doesn't exist
      await runQuery(`
        CREATE TABLE IF NOT EXISTS app_settings (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          setting_key TEXT UNIQUE NOT NULL,
          setting_value TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);
      
      console.log('✅ Created app_settings table');
    }
    
    // STEP 2: Set Discord settings from environment variables or prompt
    console.log('\n2️⃣ Setting Discord configuration...');
    
    const envChannelId = process.env.DISCORD_CHANNEL_ID;
    const envUserToken = process.env.DISCORD_USER_TOKEN;
    
    if (envChannelId && envUserToken) {
      console.log('📝 Using Discord settings from environment variables...');
      
      // Insert or update Discord settings
      await runQuery(`
        INSERT OR REPLACE INTO app_settings (setting_key, setting_value, updated_at) 
        VALUES ('discord_channel_id', ?, CURRENT_TIMESTAMP)
      `, [envChannelId]);
      
      await runQuery(`
        INSERT OR REPLACE INTO app_settings (setting_key, setting_value, updated_at) 
        VALUES ('discord_user_token', ?, CURRENT_TIMESTAMP)
      `, [envUserToken]);
      
      await runQuery(`
        INSERT OR REPLACE INTO app_settings (setting_key, setting_value, updated_at) 
        VALUES ('enable_discord', 'true', CURRENT_TIMESTAMP)
      `);
      
      console.log('✅ Discord settings saved from environment variables');
      
    } else {
      console.log('❌ No environment variables found');
      console.log('💡 Please set DISCORD_CHANNEL_ID and DISCORD_USER_TOKEN in your environment');
      console.log('💡 Or configure them through the Settings page in your application');
      
      // Create empty entries so the table structure exists
      const settings = [
        ['discord_channel_id', ''],
        ['discord_user_token', ''],
        ['discord_webhook_url', ''],
        ['enable_discord', 'false']
      ];
      
      for (const [key, value] of settings) {
        await runQuery(`
          INSERT OR REPLACE INTO app_settings (setting_key, setting_value, updated_at) 
          VALUES (?, ?, CURRENT_TIMESTAMP)
        `, [key, value]);
      }
      
      console.log('✅ Created default Discord settings entries');
    }
    
    // STEP 3: Test the fix
    console.log('\n3️⃣ Testing Discord settings fix...');
    
    const finalChannelId = await getOne(
      "SELECT setting_value FROM app_settings WHERE setting_key = 'discord_channel_id'"
    );
    const finalUserToken = await getOne(
      "SELECT setting_value FROM app_settings WHERE setting_key = 'discord_user_token'"
    );
    const finalEnabled = await getOne(
      "SELECT setting_value FROM app_settings WHERE setting_key = 'enable_discord'"
    );
    
    const isConfigured = finalChannelId?.setting_value && 
                        finalUserToken?.setting_value && 
                        finalChannelId.setting_value.trim() !== '' &&
                        finalUserToken.setting_value.trim() !== '';
    
    console.log('\n📊 FINAL STATUS:');
    console.log(`   Discord Configuration: ${isConfigured ? '✅ COMPLETE' : '❌ INCOMPLETE'}`);
    console.log(`   Channel ID: ${finalChannelId?.setting_value ? '✅ SET' : '❌ NOT SET'}`);
    console.log(`   User Token: ${finalUserToken?.setting_value ? '✅ SET' : '❌ NOT SET'}`);
    console.log(`   Enabled: ${finalEnabled?.setting_value || 'false'}`);
    
    if (isConfigured) {
      console.log('\n🎉 SUCCESS! Discord settings are now properly configured.');
      console.log('🚀 Image generation should now work correctly.');
    } else {
      console.log('\n⚠️  INCOMPLETE: You still need to configure Discord settings.');
      console.log('📝 Options:');
      console.log('   1. Set environment variables: DISCORD_CHANNEL_ID and DISCORD_USER_TOKEN');
      console.log('   2. Configure through the Settings page in your application');
      console.log('   3. Contact support for assistance');
    }
    
    return isConfigured;
    
  } catch (error) {
    console.error('💥 Emergency fix failed:', error);
    console.error('🔍 Error details:', error.stack);
    throw error;
  }
}

// Run the emergency fix
if (require.main === module) {
  console.log('🚨 Starting Emergency Discord Settings Fix...\n');
  
  emergencyDiscordFix()
    .then(success => {
      if (success) {
        console.log('\n✅ Emergency fix completed successfully!');
        process.exit(0);
      } else {
        console.log('\n⚠️  Emergency fix completed but Discord not fully configured.');
        console.log('💡 Please configure Discord settings manually.');
        process.exit(1);
      }
    })
    .catch(error => {
      console.error('\n💥 Emergency fix failed:', error.message);
      process.exit(1);
    });
}

module.exports = { emergencyDiscordFix };