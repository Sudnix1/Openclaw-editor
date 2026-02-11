// Simplified API Key Manager - No encryption
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const crypto = require('crypto');

// Create a connection to the database
const db = new sqlite3.Database(path.join(__dirname, 'data', 'recipes.db'));

// Enable foreign key constraints
db.run('PRAGMA foreign_keys = ON;', (err) => {
  if (err) {
    console.error('Error enabling foreign key constraints:', err.message);
  } else {
    console.log('Foreign key constraints enabled');
  }
});

// Helper to run queries as promises
function runQuery(query, params = []) {
  return new Promise((resolve, reject) => {
    db.run(query, params, function(err) {
      if (err) {
        reject(err);
      } else {
        resolve({ lastID: this.lastID, changes: this.changes });
      }
    });
  });
}

// Helper to get a single row
function getOne(query, params = []) {
  return new Promise((resolve, reject) => {
    db.get(query, params, (err, row) => {
      if (err) {
        reject(err);
      } else {
        resolve(row);
      }
    });
  });
}

// Simple base64 encoding/decoding - not secure but prevents casual viewing
// This avoids the key length issues with crypto
function simpleEncode(text) {
  return Buffer.from(text).toString('base64');
}

function simpleDecode(encoded) {
  try {
    return Buffer.from(encoded, 'base64').toString('utf-8');
  } catch (error) {
    console.error('Decoding error:', error);
    return null;
  }
}

// Ensure the api_keys table exists
async function initApiKeyTable() {
  try {
    await runQuery(`
      CREATE TABLE IF NOT EXISTS api_keys (
        id TEXT PRIMARY KEY,
        service TEXT NOT NULL,
        api_key TEXT NOT NULL,
        is_active INTEGER DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    console.log('API keys table initialized');
    
    // Check if OpenAI API key exists in environment, if so, import it
    if (process.env.OPENAI_API_KEY) {
      const existingKey = await getOne(
        `SELECT id FROM api_keys WHERE service = ? AND is_active = 1`,
        ['openai']
      );
      
      if (!existingKey) {
        // Import API key from environment
        await saveApiKey('openai', process.env.OPENAI_API_KEY);
        console.log('Imported OpenAI API key from environment variable');
      }
    }
  } catch (error) {
    console.error('Error initializing API keys table:', error);
  }
}

// Enhanced getApiKey function for api-key-manager.js
// Replace the existing getApiKey function with this one

// Get an API key for a specific service - PRIORITIZE ENVIRONMENT VARIABLES
async function getApiKey(service) {
  try {
    console.log(`Retrieving API key for ${service}...`);
    
    // PRIORITY 1: Check environment variables first (but validate them)
    if (service.toLowerCase() === 'openai') {
      const envKey = process.env.OPENAI_API_KEY;
      if (envKey && envKey.length > 20) {
        // Quick validation - check if it looks like a real key
        if (envKey.startsWith('sk-proj-') && !envKey.includes('hhmMzrw')) {
          console.log('✅ Found valid API key in environment variables');
          return envKey;
        } else {
          console.log('⚠️ Environment API key appears to be a placeholder/invalid, checking database...');
        }
      }
    }
    
    // PRIORITY 2: Check database as fallback
    const row = await getOne(
      `SELECT id, api_key FROM api_keys WHERE service = ? AND is_active = 1 ORDER BY updated_at DESC LIMIT 1`,
      [service.toLowerCase()]
    );
    
    if (row && row.api_key) {
      console.log(`Found API key in database for ${service} (ID: ${row.id.substring(0, 8)}...)`);
      const decoded = simpleDecode(row.api_key);
      
      // Validate database key length
      if (decoded && decoded.length > 20) {
        return decoded;
      } else {
        console.log(`❌ Database API key for ${service} appears invalid (length: ${decoded?.length || 0})`);
      }
    }
    
    console.log(`❌ No valid API key found for ${service}`);
    return null;
  } catch (error) {
    console.error(`Error retrieving API key for ${service}:`, error);
    
    // Final fallback to environment variable
    if (service.toLowerCase() === 'openai') {
      const envKey = process.env.OPENAI_API_KEY;
      if (envKey && envKey.length > 20) {
        console.log('✅ Found API key in environment variables (error fallback)');
        return envKey;
      }
    }
    
    return null;
  }
}

// Add a function to check the database directly
async function checkApiKeyTable() {
  try {
    console.log('Checking API keys table status...');
    
    // Check if the table exists
    const tableExists = await getOne(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='api_keys'`
    );
    
    if (!tableExists) {
      console.log('API keys table does not exist yet');
      return { exists: false, keys: [] };
    }
    
    // Count the number of keys
    const keyCount = await getOne(
      `SELECT COUNT(*) as count FROM api_keys WHERE is_active = 1`
    );
    
    // Get all active keys (just service names and IDs)
    const keys = await new Promise((resolve, reject) => {
      db.all(
        `SELECT id, service, created_at, updated_at FROM api_keys WHERE is_active = 1`,
        (err, rows) => {
          if (err) {
            reject(err);
          } else {
            resolve(rows);
          }
        }
      );
    });
    
    console.log(`Found ${keyCount.count} active API keys in the database`);
    keys.forEach(key => {
      console.log(`- ${key.service} (ID: ${key.id.substring(0, 8)}..., updated: ${key.updated_at})`);
    });
    
    return { exists: true, count: keyCount.count, keys };
  } catch (error) {
    console.error('Error checking API keys table:', error);
    return { exists: false, error: error.message };
  }
}

// Enhance the saveApiKey function to provide more debugging
async function saveApiKey(service, apiKey) {
  try {
    console.log(`Saving API key for ${service}...`);
    
    if (!apiKey) {
      console.error('Cannot save empty API key');
      return false;
    }
    
    // Trim any whitespace from the API key
    const trimmedKey = apiKey.trim();
    
    // Minimal validation for OpenAI keys
    if (service.toLowerCase() === 'openai' && !trimmedKey.startsWith('sk-')) {
      console.warn('Warning: OpenAI API key does not start with "sk-"');
    }
    
    const id = crypto.randomUUID();
    const encodedKey = simpleEncode(trimmedKey);
    
    // Check if a key already exists for this service
    const existingKey = await getOne(
      `SELECT id FROM api_keys WHERE service = ? AND is_active = 1`,
      [service.toLowerCase()]
    );
    
    if (existingKey) {
      // Update existing key
      await runQuery(
        `UPDATE api_keys SET api_key = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [encodedKey, existingKey.id]
      );
      console.log(`Updated API key for ${service} (ID: ${existingKey.id.substring(0, 8)}...)`);
    } else {
      // Insert new key
      await runQuery(
        `INSERT INTO api_keys (id, service, api_key) VALUES (?, ?, ?)`,
        [id, service.toLowerCase(), encodedKey]
      );
      console.log(`Saved new API key for ${service} (ID: ${id.substring(0, 8)}...)`);
    }
    
    // Verify the key was saved correctly
    await checkApiKeyTable();
    
    return true;
  } catch (error) {
    console.error(`Error saving API key for ${service}:`, error);
    return false;
  }
}

// Export the new function
module.exports = {
  getApiKey,
  saveApiKey,
  deleteApiKey,
  getActiveApiKeyServices,
  isApiKeyMissing,
  checkApiKeyTable
};

// Save an API key for a specific service
async function saveApiKey(service, apiKey) {
  try {
    const id = crypto.randomUUID();
    const encodedKey = simpleEncode(apiKey);
    
    // Check if a key already exists for this service
    const existingKey = await getOne(
      `SELECT id FROM api_keys WHERE service = ? AND is_active = 1`,
      [service.toLowerCase()]
    );
    
    if (existingKey) {
      // Update existing key
      await runQuery(
        `UPDATE api_keys SET api_key = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [encodedKey, existingKey.id]
      );
      console.log(`Updated API key for ${service}`);
    } else {
      // Insert new key
      await runQuery(
        `INSERT INTO api_keys (id, service, api_key) VALUES (?, ?, ?)`,
        [id, service.toLowerCase(), encodedKey]
      );
      console.log(`Saved new API key for ${service}`);
    }
    
    return true;
  } catch (error) {
    console.error(`Error saving API key for ${service}:`, error);
    return false;
  }
}

// Delete an API key for a specific service
async function deleteApiKey(service) {
  try {
    await runQuery(
      `UPDATE api_keys SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE service = ? AND is_active = 1`,
      [service.toLowerCase()]
    );
    
    console.log(`Deactivated API key for ${service}`);
    return true;
  } catch (error) {
    console.error(`Error deleting API key for ${service}:`, error);
    return false;
  }
}

// Get all active API keys (service names only, not the actual keys)
async function getActiveApiKeyServices() {
  try {
    const rows = await new Promise((resolve, reject) => {
      db.all(
        `SELECT service, created_at, updated_at FROM api_keys WHERE is_active = 1 ORDER BY service`,
        (err, rows) => {
          if (err) {
            reject(err);
          } else {
            resolve(rows);
          }
        }
      );
    });
    
    return rows;
  } catch (error) {
    console.error('Error retrieving active API key services:', error);
    return [];
  }
}

// Check if an API key is required but missing
async function isApiKeyMissing(service) {
  // TEMPORARY: Bypass API key check in production mode
  if (process.env.NODE_ENV === 'production' && service.toLowerCase() === 'openai') {
    console.log('BYPASS: Skipping API key check in production mode');
    return false;
  }
  
  // Check environment variables first
  if (service.toLowerCase() === 'openai') {
    const envKey = process.env.OPENAI_API_KEY;
    if (envKey && envKey.length > 0) {
      console.log(`Found ${service} API key in environment variables (length: ${envKey.length})`);
      return false;
    }
  }
  
  // Fall back to database check
  const key = await getApiKey(service);
  const missing = key === null || key === '';
  console.log(`API key missing check for ${service}: ${missing}`);
  return missing;
}

// Initialize the API key table when this module is loaded
initApiKeyTable().catch(console.error);

module.exports = {
  getApiKey,
  saveApiKey,
  deleteApiKey,
  getActiveApiKeyServices,
  isApiKeyMissing
};