// Create this file: debug-discord-accounts.js
const path = require('path');
const fs = require('fs');
const { getAll, getOne } = require('./db');

async function debugDiscordAccounts() {
  try {
    console.log('🔍 DISCORD ACCOUNTS DIAGNOSTIC TOOL');
    console.log('=====================================\n');
    
    // 1. Check database settings
    console.log('1️⃣ DATABASE DISCORD SETTINGS:');
    try {
      const dbChannelId = await getOne("SELECT setting_value FROM app_settings WHERE setting_key = 'discord_channel_id'");
      const dbUserToken = await getOne("SELECT setting_value FROM app_settings WHERE setting_key = 'discord_user_token'");
      const dbWebhookUrl = await getOne("SELECT setting_value FROM app_settings WHERE setting_key = 'discord_webhook_url'");
      const dbEnabled = await getOne("SELECT setting_value FROM app_settings WHERE setting_key = 'enable_discord'");
      
      if (dbChannelId || dbUserToken) {
        console.log('   Found database Discord settings:');
        console.log(`   Channel ID: ${dbChannelId?.setting_value || 'NOT SET'}`);
        console.log(`   User Token: ${dbUserToken?.setting_value ? dbUserToken.setting_value.substring(0, 10) + '...' : 'NOT SET'}`);
        console.log(`   Webhook URL: ${dbWebhookUrl?.setting_value ? 'SET' : 'NOT SET'}`);
        console.log(`   Enabled: ${dbEnabled?.setting_value || 'NOT SET'}`);
      } else {
        console.log('   ❌ No Discord settings in database');
      }
    } catch (dbError) {
      console.log(`   ❌ Error reading database: ${dbError.message}`);
    }
    
    console.log('\n');
    
    // 2. Check file-based settings for each organization/website
    console.log('2️⃣ FILE-BASED DISCORD SETTINGS:');
    const dataDir = path.join(__dirname, 'data');
    
    if (fs.existsSync(dataDir)) {
      const configFiles = fs.readdirSync(dataDir).filter(file => file.startsWith('config-') && file.endsWith('.json'));
      
      if (configFiles.length > 0) {
        console.log(`   Found ${configFiles.length} configuration files:`);
        
        configFiles.forEach(file => {
          try {
            const configPath = path.join(dataDir, file);
            const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            
            if (config.discordChannelId || config.discordUserToken) {
              console.log(`\n   📁 ${file}:`);
              console.log(`      Channel ID: ${config.discordChannelId || 'NOT SET'}`);
              console.log(`      User Token: ${config.discordUserToken ? config.discordUserToken.substring(0, 10) + '...' : 'NOT SET'}`);
              console.log(`      Webhook URL: ${config.discordWebhookUrl ? 'SET' : 'NOT SET'}`);
              console.log(`      Enabled: ${config.enableDiscord || 'NOT SET'}`);
              
              // Try to identify which organization/website this belongs to
              const filenameParts = file.replace('config-', '').replace('.json', '').split('-');
              if (filenameParts.length >= 2) {
                console.log(`      Organization: ${filenameParts[0]}`);
                console.log(`      Website: ${filenameParts[1]}`);
              }
            }
          } catch (error) {
            console.log(`   ❌ Error reading ${file}: ${error.message}`);
          }
        });
      } else {
        console.log('   ❌ No configuration files found');
      }
    } else {
      console.log('   ❌ Data directory not found');
    }
    
    console.log('\n');
    
    // 3. Check environment variables
    console.log('3️⃣ ENVIRONMENT VARIABLES:');
    const envChannelId = process.env.DISCORD_CHANNEL_ID;
    const envUserToken = process.env.DISCORD_USER_TOKEN;
    const envWebhookUrl = process.env.DISCORD_WEBHOOK_URL;
    
    if (envChannelId || envUserToken) {
      console.log('   Found environment Discord settings:');
      console.log(`   Channel ID: ${envChannelId || 'NOT SET'}`);
      console.log(`   User Token: ${envUserToken ? envUserToken.substring(0, 10) + '...' : 'NOT SET'}`);
      console.log(`   Webhook URL: ${envWebhookUrl ? 'SET' : 'NOT SET'}`);
    } else {
      console.log('   ❌ No Discord environment variables set');
    }
    
    console.log('\n');
    
    // 4. Test settings retrieval for different contexts
    console.log('4️⃣ TESTING SETTINGS RETRIEVAL:');
    
    // Get all organizations and websites from the database
    try {
      const organizations = await getAll("SELECT DISTINCT organization_id FROM users WHERE organization_id IS NOT NULL");
      const websites = await getAll("SELECT DISTINCT website_id FROM keywords WHERE website_id IS NOT NULL");
      
      console.log(`   Found ${organizations.length} organizations and ${websites.length} websites`);
      
      // Test some combinations
      for (const org of organizations.slice(0, 3)) { // Test first 3 orgs
        for (const website of websites.slice(0, 2)) { // Test first 2 websites per org
          try {
            console.log(`\n   🧪 Testing context: Org=${org.organization_id}, Website=${website.website_id}`);
            
            // Simulate the settings loading
            const promptSettingsDb = require('./prompt-settings-db');
            const settings = promptSettingsDb.loadSettings(org.organization_id, website.website_id);
            
            if (settings && settings.discordChannelId) {
              console.log(`      ✅ Found Discord settings`);
              console.log(`      Channel: ${settings.discordChannelId}`);
              console.log(`      Token: ${settings.discordUserToken ? settings.discordUserToken.substring(0, 10) + '...' : 'NOT SET'}`);
              console.log(`      Enabled: ${settings.enableDiscord}`);
            } else {
              console.log(`      ❌ No Discord settings for this context`);
            }
          } catch (testError) {
            console.log(`      ❌ Error testing context: ${testError.message}`);
          }
        }
      }
    } catch (contextError) {
      console.log(`   ❌ Error getting context information: ${contextError.message}`);
    }
    
    console.log('\n');
    
    // 5. Recommendations
    console.log('5️⃣ RECOMMENDATIONS:');
    console.log('   1. Check which Discord account is being used in your tests vs actual usage');
    console.log('   2. Ensure each website has its own Discord configuration');
    console.log('   3. Use the debug middleware to track which account is selected');
    console.log('   4. Consider consolidating to one Discord configuration method');
    console.log('   5. Check that website switching is working correctly');
    
    console.log('\n=====================================');
    console.log('✅ Discord diagnostic completed');
    
  } catch (error) {
    console.error('❌ Diagnostic failed:', error);
  }
}

// Run the diagnostic
if (require.main === module) {
  debugDiscordAccounts().then(() => {
    console.log('\n🎯 Run this diagnostic anytime you have Discord account issues');
    process.exit(0);
  }).catch(error => {
    console.error('Diagnostic error:', error);
    process.exit(1);
  });
}

module.exports = { debugDiscordAccounts };