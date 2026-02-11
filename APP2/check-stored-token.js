#!/usr/bin/env node

/**
 * Check what's actually stored in the Discord settings file
 */

const fs = require('fs');
const path = require('path');

const orgId = '1ff5b9b6-39d3-4c60-b4a0-ade81cf4dfd3';
const websiteId = 'bcbd6ac7-6628-4c8e-99d7-abb17c8e24c2';

const filePath = path.join(__dirname, 'data', `config-${orgId}-${websiteId}.json`);

console.log('🔍 Checking stored Discord token...');
console.log(`File path: ${filePath}`);

try {
  if (fs.existsSync(filePath)) {
    const fileContent = fs.readFileSync(filePath, 'utf8');
    console.log('\n📄 Raw file content:');
    console.log(fileContent);
    
    const settings = JSON.parse(fileContent);
    console.log('\n🔍 Parsed settings:');
    console.log('Discord Channel ID:', settings.discordChannelId);
    console.log('Enable Discord:', settings.enableDiscord);
    
    if (settings.discordUserToken) {
      console.log('\n🔐 Discord Token Analysis:');
      console.log('Token length:', settings.discordUserToken.length);
      console.log('Token starts with:', settings.discordUserToken.substring(0, 20));
      console.log('Token ends with:', settings.discordUserToken.substring(-20));
      console.log('Full token:', settings.discordUserToken);
      
      // Check if it's a proper Discord token format
      if (settings.discordUserToken.length < 50) {
        console.log('\n❌ PROBLEM: Token is too short!');
        console.log('   Discord tokens should be 70+ characters long');
        console.log('   This token is only', settings.discordUserToken.length, 'characters');
      } else if (!settings.discordUserToken.includes('.')) {
        console.log('\n❌ PROBLEM: Token missing dots (.)!');
        console.log('   Discord tokens should have format: ABC.DEF.GHI');
      } else {
        console.log('\n✅ Token format looks correct');
        console.log('   Length:', settings.discordUserToken.length, 'characters');
        console.log('   Contains dots: Yes');
      }
    } else {
      console.log('\n❌ No Discord token found in settings');
    }
    
    // Test the actual token
    console.log('\n🧪 Testing stored token...');
    const axios = require('axios');
    
    axios.get(`https://discord.com/api/v10/channels/${settings.discordChannelId}`, {
      headers: {
        'Authorization': settings.discordUserToken,
        'Content-Type': 'application/json'
      }
    })
    .then(response => {
      console.log('✅ Token test PASSED - stored token is valid');
      console.log('   Channel name:', response.data.name);
    })
    .catch(error => {
      console.log('❌ Token test FAILED - stored token is invalid');
      console.log('   Status:', error.response?.status);
      console.log('   Error:', error.response?.data?.message || error.message);
      
      if (error.response?.status === 401) {
        console.log('\n🚨 This confirms the stored token is invalid/expired!');
      }
    });
    
  } else {
    console.log('❌ Settings file does not exist');
  }
  
} catch (error) {
  console.error('❌ Error reading file:', error.message);
}