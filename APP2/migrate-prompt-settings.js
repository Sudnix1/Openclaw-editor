// migrate-prompt-settings.js
const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const promptSettingsDb = require('./prompt-settings-db');

// Path to the database
const dbPath = path.join(__dirname, 'data', 'recipes.db');

// Create a database connection
const db = new sqlite3.Database(dbPath);

async function migratePromptSettings() {
  console.log('Starting prompt settings migration...');

  try {
    // 1. Get all websites from the database
    const websites = await new Promise((resolve, reject) => {
      db.all('SELECT id, organization_id FROM websites', (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });

    console.log(`Found ${websites.length} websites in the database`);

    // Group websites by organization
    const websitesByOrg = {};
    websites.forEach(website => {
      if (!websitesByOrg[website.organization_id]) {
        websitesByOrg[website.organization_id] = [];
      }
      websitesByOrg[website.organization_id].push(website.id);
    });

    // 2. Get all organizations
    const organizations = Object.keys(websitesByOrg);
    console.log(`Found ${organizations.length} organizations with websites`);

    // 3. For each organization, look for existing config file
    let migratedCount = 0;
    for (const orgId of organizations) {
      const configPath = path.join(__dirname, 'data', `config-${orgId}.json`);
      
      if (fs.existsSync(configPath)) {
        console.log(`Found existing configuration for organization ${orgId}`);
        
        // Migrate settings to each website
        const websiteIds = websitesByOrg[orgId];
        const result = promptSettingsDb.migrateOrgSettingsToWebsites(orgId, websiteIds);
        
        if (result) {
          console.log(`Successfully migrated settings to ${websiteIds.length} websites for organization ${orgId}`);
          migratedCount++;
        }
      } else {
        console.log(`No configuration found for organization ${orgId}, nothing to migrate`);
      }
    }

    console.log(`Migration complete. Migrated settings for ${migratedCount} organizations.`);
  } catch (error) {
    console.error('Error during prompt settings migration:', error);
  } finally {
    // Close the database connection
    db.close();
  }
}

// Run the migration
migratePromptSettings();