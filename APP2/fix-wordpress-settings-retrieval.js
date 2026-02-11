// fix-wordpress-settings-retrieval.js
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database(path.join(__dirname, 'data/recipes.db'));

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

async function fixWordPressSettings() {
  console.log('Analyzing WordPress settings...');
  
  try {
    // Check all WordPress settings
    const settings = await new Promise((resolve, reject) => {
      db.all(
        `SELECT id, user_id, website_id, site_url, username, password, default_status FROM wordpress_settings`,
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });
    
    console.log(`Found ${settings.length} WordPress settings records`);
    
    // Group by user_id to find duplicates
    const userIdMap = {};
    settings.forEach(setting => {
      if (!userIdMap[setting.user_id]) {
        userIdMap[setting.user_id] = [];
      }
      userIdMap[setting.user_id].push(setting);
    });
    
    // Process each user's settings
    for (const userId in userIdMap) {
      const userSettings = userIdMap[userId];
      
      if (userSettings.length > 1) {
        console.log(`User ${userId} has ${userSettings.length} settings records - ensuring each has unique website_id`);
        
        // Check if any have null/empty website_id
        const nullWebsiteSettings = userSettings.filter(s => !s.website_id);
        
        if (nullWebsiteSettings.length > 0) {
          // Get this user's information to find their organization
          const user = await getOne(
            `SELECT id, organization_id FROM users WHERE id = ?`,
            [userId]
          );
          
          if (user && user.organization_id) {
            // Get the websites for this organization
            const websites = await new Promise((resolve, reject) => {
              db.all(
                `SELECT id FROM websites WHERE organization_id = ?`,
                [user.organization_id],
                (err, rows) => {
                  if (err) reject(err);
                  else resolve(rows || []);
                }
              );
            });
            
            if (websites.length > 0) {
              const websiteId = websites[0].id;
              console.log(`Assigning null website_id record to first website: ${websiteId}`);
              
              // Update the record
              await runQuery(
                `UPDATE wordpress_settings SET website_id = ? WHERE id = ?`,
                [websiteId, nullWebsiteSettings[0].id]
              );
            } else {
              console.log(`No websites found for organization ${user.organization_id}`);
            }
          }
        }
      }
    }
    
    // Check how many settings have a user_id of 'default'
    const defaultSettings = settings.filter(s => s.user_id === 'default');
    console.log(`Found ${defaultSettings.length} settings with user_id='default'`);
    
    if (defaultSettings.length > 0) {
      // Get all users
      const users = await new Promise((resolve, reject) => {
        db.all(`SELECT id FROM users`, (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        });
      });
      
      if (users.length > 0) {
        // Create settings for each user using the default settings as a template
        for (const user of users) {
          for (const defaultSetting of defaultSettings) {
            // Check if this user + website combo already exists
            const existing = await getOne(
              `SELECT id FROM wordpress_settings WHERE user_id = ? AND website_id = ?`,
              [user.id, defaultSetting.website_id]
            );
            
            if (!existing) {
              console.log(`Creating settings for user ${user.id} and website ${defaultSetting.website_id || 'NULL'} based on default template`);
              
              await runQuery(
                `INSERT INTO wordpress_settings (id, user_id, website_id, site_url, username, password, default_status)
                VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [
                  uuidv4(),
                  user.id,
                  defaultSetting.website_id,
                  defaultSetting.site_url,
                  defaultSetting.username,
                  defaultSetting.password,
                  defaultSetting.default_status
                ]
              );
            }
          }
        }
        
        console.log('Created user-specific settings based on default settings');
      }
    }
    
    console.log('WordPress settings fix complete!');
  } catch (error) {
    console.error('Error fixing WordPress settings:', error);
  } finally {
    db.close();
  }
}

// Generate UUID function since we don't have access to the uuid module
function uuidv4() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

fixWordPressSettings();