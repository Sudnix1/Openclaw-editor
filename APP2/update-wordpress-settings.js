// update-wordpress-settings.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const db = new sqlite3.Database(path.join(__dirname, 'data/recipes.db'));

console.log('Updating WordPress settings to include website IDs...');

// Run the migration
async function updateWordPressSettings() {
  try {
    // First, examine the structure of wordpress_settings table
    const tableInfo = await new Promise((resolve, reject) => {
      db.all("PRAGMA table_info(wordpress_settings)", (err, columns) => {
        if (err) return reject(err);
        resolve(columns || []);
      });
    });
    
    console.log('WordPress settings table structure:');
    console.log(tableInfo.map(col => col.name));
    
    // Get all websites
    const websites = await new Promise((resolve, reject) => {
      db.all("SELECT id, organization_id FROM websites", (err, rows) => {
        if (err) return reject(err);
        resolve(rows || []);
      });
    });
    
    console.log(`Found ${websites.length} websites`);
    
    // Now get all wordpress settings
    const settings = await new Promise((resolve, reject) => {
      db.all("SELECT * FROM wordpress_settings", (err, rows) => {
        if (err) return reject(err);
        resolve(rows || []);
      });
    });
    
    console.log(`Found ${settings.length} WordPress settings records`);
    
    // For each organization, get the first website
    const websitesByOrg = {};
    websites.forEach(website => {
      if (!websitesByOrg[website.organization_id]) {
        websitesByOrg[website.organization_id] = website.id;
      }
    });
    
    // For each wordpress setting without a website_id, try to assign one
    let updatedCount = 0;
    
    // If we have user_id column, use that to associate with organization
    if (tableInfo.some(col => col.name === 'user_id')) {
      console.log('Using user_id to associate settings with websites');
      
      // Get user organization mappings
      const users = await new Promise((resolve, reject) => {
        db.all("SELECT id, organization_id FROM users", (err, rows) => {
          if (err) return reject(err);
          resolve(rows || []);
        });
      });
      
      // Create a map of user_id to organization_id
      const userOrgs = {};
      users.forEach(user => {
        userOrgs[user.id] = user.organization_id;
      });
      
      // Update each setting
      for (const setting of settings) {
        if (!setting.website_id && setting.user_id && userOrgs[setting.user_id]) {
          const orgId = userOrgs[setting.user_id];
          const websiteId = websitesByOrg[orgId];
          
          if (websiteId) {
            await new Promise((resolve, reject) => {
              db.run(
                "UPDATE wordpress_settings SET website_id = ? WHERE id = ?",
                [websiteId, setting.id],
                function(err) {
                  if (err) return reject(err);
                  if (this.changes > 0) updatedCount++;
                  resolve();
                }
              );
            });
          }
        }
      }
    } 
    // Otherwise, just try to update all records with a single website
    else if (websites.length === 1) {
      console.log('Only one website found, updating all settings to use it');
      const websiteId = websites[0].id;
      
      await new Promise((resolve, reject) => {
        db.run(
          "UPDATE wordpress_settings SET website_id = ? WHERE website_id IS NULL OR website_id = ''",
          [websiteId],
          function(err) {
            if (err) return reject(err);
            updatedCount = this.changes;
            resolve();
          }
        );
      });
    }
    
    console.log(`Updated ${updatedCount} WordPress settings records with website IDs`);
    console.log('WordPress settings update complete');
  } catch (error) {
    console.error('Error updating WordPress settings:', error);
  } finally {
    db.close();
  }
}

updateWordPressSettings();