// utils/url-helper.js
const { getOne, runQuery } = require('../db');

// Function to get base URL from database settings
async function getBaseUrl() {
  try {
    // Try to get the base URL from database settings first
    const setting = await getOne("SELECT setting_value FROM app_settings WHERE setting_key = 'base_url'");
    
    if (setting && setting.setting_value) {
      return setting.setting_value;
    }
    
    // Fallback to environment variable if available
    if (process.env.APP_URL) {
      return process.env.APP_URL;
    }
    
    // Last resort default (will be updated on first request)
    return 'http://localhost:3000';
  } catch (error) {
    console.error('Error getting base URL:', error);
    return process.env.APP_URL || 'http://localhost:3000';
  }
}

// Update the base URL based on incoming request
async function updateBaseUrl(req) {
  try {
    // Construct base URL from request headers
    const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
    const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:3000';
    const baseUrl = `${protocol}://${host}`;
    
    // Store in database for future use
    await runQuery(
      "INSERT OR REPLACE INTO app_settings (setting_key, setting_value) VALUES (?, ?)",
      ['base_url', baseUrl]
    );
    
    console.log(`✅ Base URL updated: ${baseUrl}`);
    return baseUrl;
  } catch (error) {
    console.error('Error updating base URL:', error);
    return null;
  }
}

module.exports = {
  getBaseUrl,
  updateBaseUrl
};