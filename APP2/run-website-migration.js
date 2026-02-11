// run-website-migration.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const db = new sqlite3.Database(path.join(__dirname, 'data/recipes.db'));

console.log('Starting websites table migration...');

// Run the migration
db.serialize(() => {
  // Create websites table if it doesn't exist
  db.run(`
    CREATE TABLE IF NOT EXISTS websites (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      url TEXT,
      organization_id TEXT NOT NULL,
      wordpress_api_url TEXT,
      wordpress_username TEXT,
      wordpress_password TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
    )
  `, (err) => {
    if (err) {
      console.error('Error creating websites table:', err);
      process.exit(1);
    }
    
    console.log('Websites table created successfully');
    
    // Add default website for each organization if none exists
    db.all(`SELECT id FROM organizations`, [], (err, orgs) => {
      if (err) {
        console.error('Error getting organizations:', err);
        process.exit(1);
      }

      console.log(`Found ${orgs.length} organizations`);
      
      // For each organization, add a default website if none exists
      let completedOrgs = 0;
      orgs.forEach(org => {
        db.get(`SELECT COUNT(*) as count FROM websites WHERE organization_id = ?`, [org.id], (err, result) => {
          if (err) {
            console.error(`Error checking websites for org ${org.id}:`, err);
            return;
          }

          if (result.count === 0) {
            // Insert a default website
            const defaultWebsiteId = uuidv4();
            console.log(`Creating default website for organization ${org.id}`);
            
            db.run(`
              INSERT INTO websites (id, name, url, organization_id) 
              VALUES (?, 'Default Website', '', ?)
            `, [defaultWebsiteId, org.id], (err) => {
              if (err) {
                console.error(`Error creating default website for org ${org.id}:`, err);
              } else {
                console.log(`Created default website (ID: ${defaultWebsiteId}) for org ${org.id}`);
                
                // Update existing recipes/keywords with null website_id to use this default
                db.run(`
                  UPDATE recipes SET website_id = ? 
                  WHERE organization_id = ? AND website_id IS NULL
                `, [defaultWebsiteId, org.id], function(err) {
                  if (err) {
                    console.error(`Error updating recipes:`, err);
                  } else {
                    console.log(`Updated ${this.changes} recipes with default website`);
                  }
                });
                
                db.run(`
                  UPDATE keywords SET website_id = ? 
                  WHERE organization_id = ? AND website_id IS NULL
                `, [defaultWebsiteId, org.id], function(err) {
                  if (err) {
                    console.error(`Error updating keywords:`, err);
                  } else {
                    console.log(`Updated ${this.changes} keywords with default website`);
                  }
                });
              }
              
              completedOrgs++;
              if (completedOrgs === orgs.length) {
                console.log('Website migration completed');
                db.close();
              }
            });
          } else {
            console.log(`Organization ${org.id} already has ${result.count} websites, skipping`);
            completedOrgs++;
            if (completedOrgs === orgs.length) {
              console.log('Website migration completed');
              db.close();
            }
          }
        });
      });
      
      if (orgs.length === 0) {
        console.log('No organizations found');
        db.close();
      }
    });
  });
});