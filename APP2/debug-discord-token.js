#!/usr/bin/env node

/**
 * Debug script to test Discord token with actual Midjourney API calls
 * Usage: node debug-discord-token.js [organizationId] [websiteId]
 */

const axios = require('axios');
const promptSettingsDb = require('./prompt-settings-db');

async function testDiscordToken(organizationId, websiteId) {
  console.log('🔍 Testing Discord Token for Midjourney API');
  console.log(`Organization: ${organizationId}, Website: ${websiteId}\n`);
  
  try {
    // Load organization settings
    const settings = promptSettingsDb.loadSettings(organizationId, websiteId);
    
    if (!settings || !settings.discordUserToken || !settings.discordChannelId) {
      console.error('❌ No Discord settings found');
      return false;
    }
    
    console.log('📄 Loaded settings:');
    console.log(`   Channel ID: ${settings.discordChannelId}`);
    console.log(`   Token: ${settings.discordUserToken.substring(0, 10)}...`);
    console.log(`   Enable Discord: ${settings.enableDiscord}\n`);
    
    // Test 1: Basic Discord API call
    console.log('🧪 Test 1: Basic Discord API authentication...');
    try {
      const response = await axios.get(`https://discord.com/api/v10/channels/${settings.discordChannelId}`, {
        headers: {
          'Authorization': settings.discordUserToken,
          'Content-Type': 'application/json'
        }
      });
      console.log('✅ Test 1 PASSED: Discord API authentication successful');
      console.log(`   Channel name: ${response.data.name}`);
    } catch (error) {
      console.error('❌ Test 1 FAILED: Discord API authentication failed');
      console.error(`   Status: ${error.response?.status}`);
      console.error(`   Error: ${error.response?.data?.message || error.message}`);
      return false;
    }
    
    // Test 2: Guild info (what Midjourney client does first)
    console.log('\n🧪 Test 2: Guild information retrieval...');
    try {
      const response = await axios.get(`https://discord.com/api/v10/channels/${settings.discordChannelId}`, {
        headers: {
          'Authorization': settings.discordUserToken,
          'Content-Type': 'application/json'
        }
      });
      
      const guildId = response.data.guild_id;
      console.log(`   Guild ID: ${guildId}`);
      
      // Get guild info
      const guildResponse = await axios.get(`https://discord.com/api/v10/guilds/${guildId}`, {
        headers: {
          'Authorization': settings.discordUserToken,
          'Content-Type': 'application/json'
        }
      });
      
      console.log('✅ Test 2 PASSED: Guild information retrieved');
      console.log(`   Guild name: ${guildResponse.data.name}`);
      
    } catch (error) {
      console.error('❌ Test 2 FAILED: Guild information retrieval failed');
      console.error(`   Status: ${error.response?.status}`);
      console.error(`   Error: ${error.response?.data?.message || error.message}`);
      return false;
    }
    
    // Test 3: Check if user can access Midjourney application
    console.log('\n🧪 Test 3: Midjourney application access...');
    try {
      const applicationId = '936929561302675456'; // Midjourney application ID
      
      const response = await axios.get(`https://discord.com/api/v10/channels/${settings.discordChannelId}/application-commands/search?application_id=${applicationId}`, {
        headers: {
          'Authorization': settings.discordUserToken,
          'Content-Type': 'application/json'
        }
      });
      
      console.log('✅ Test 3 PASSED: Can access Midjourney application commands');
      console.log(`   Found ${response.data.application_commands?.length || 0} commands`);
      
    } catch (error) {
      console.error('❌ Test 3 FAILED: Cannot access Midjourney application');
      console.error(`   Status: ${error.response?.status}`);
      console.error(`   Error: ${error.response?.data?.message || error.message}`);
      
      if (error.response?.status === 401) {
        console.error('\n🚨 CRITICAL: 401 Unauthorized - This is the same error as image generation!');
        console.error('   This means the Discord token is invalid, expired, or wrong format');
        console.error('   Solutions:');
        console.error('   1. Get a fresh Discord token from browser F12 -> Network');
        console.error('   2. Make sure token is from the correct Discord account');
        console.error('   3. Ensure token has access to the Midjourney server');
      }
      
      return false;
    }
    
    console.log('\n✅ ALL TESTS PASSED: Discord token is working correctly');
    console.log('   The 401 error must be coming from somewhere else in the pipeline');
    
    return true;
    
  } catch (error) {
    console.error('❌ Script error:', error.message);
    return false;
  }
}

// Get command line arguments
const args = process.argv.slice(2);
if (args.length < 2) {
  console.error('Usage: node debug-discord-token.js [organizationId] [websiteId]');
  console.error('Example: node debug-discord-token.js 123 456');
  process.exit(1);
}

const organizationId = args[0];
const websiteId = args[1];

testDiscordToken(organizationId, websiteId)
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });