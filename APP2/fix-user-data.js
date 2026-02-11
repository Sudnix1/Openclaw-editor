// fix-user-data.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs').promises;

// Create a connection to the database
const db = new sqlite3.Database(path.join(__dirname, 'data', 'recipes.db'));

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

function getAll(query, params = []) {
    return new Promise((resolve, reject) => {
        db.all(query, params, (err, rows) => {
            if (err) {
                reject(err);
            } else {
                resolve(rows);
            }
        });
    });
}

// Fix user data issues
async function fixUserData() {
    try {
        console.log('Starting data repair...');
        
        // Get all users
        const users = await getAll(`SELECT * FROM users`);
        console.log(`Found ${users.length} users`);
        
        // Get all organizations 
        const organizations = await getAll(`SELECT * FROM organizations`);
        console.log(`Found ${organizations.length} organizations`);
        
        // If no organizations, but have users, create default organization
        if (organizations.length === 0 && users.length > 0) {
            console.log('No organizations found but users exist - creating default organization');
            
            // Find admin user
            const adminUser = users.find(user => user.role === 'admin');
            
            if (adminUser) {
                const orgId = uuidv4();
                const configFile = `config-${orgId}.json`;
                
                // Create organization
                await runQuery(
                    `INSERT INTO organizations (id, name, admin_id, config_file)
                     VALUES (?, ?, ?, ?)`,
                    [orgId, 'Default Organization', adminUser.id, configFile]
                );
                
                // Update all users to belong to this organization
                await runQuery(
                    `UPDATE users SET organization_id = ?`,
                    [orgId]
                );
                
                // Create default config file
                const configPath = path.join(__dirname, 'data', configFile);
                const defaultConfig = {
                    model: process.env.DEFAULT_MODEL || 'gpt-4-turbo-preview',
                    temperature: 0.7,
                    language: 'English',
                    pinCount: 10,
                    prompts: {}
                };
                
                await fs.mkdir(path.join(__dirname, 'data'), { recursive: true });
                await fs.writeFile(configPath, JSON.stringify(defaultConfig, null, 2));
                
                console.log(`Created default organization with ID ${orgId} and assigned all users to it`);
            } else {
                console.warn('No admin user found - cannot create default organization');
            }
        }
        
        // Fix missing organization IDs in users
        for (const user of users) {
            if (!user.organization_id && organizations.length > 0) {
                console.log(`User ${user.username} has no organization ID - assigning to first organization`);
                
                await runQuery(
                    `UPDATE users SET organization_id = ? WHERE id = ?`,
                    [organizations[0].id, user.id]
                );
            }
        }
        
        // Fix mismatched organization admin IDs
        for (const org of organizations) {
            const adminExists = users.some(user => 
                user.id === org.admin_id && 
                user.organization_id === org.id && 
                user.role === 'admin'
            );
            
            if (!adminExists) {
                console.log(`Organization ${org.name} has invalid admin ID - fixing`);
                
                // Find an admin in this organization
                const orgAdmin = users.find(user => 
                    user.organization_id === org.id && 
                    user.role === 'admin'
                );
                
                if (orgAdmin) {
                    await runQuery(
                        `UPDATE organizations SET admin_id = ? WHERE id = ?`,
                        [orgAdmin.id, org.id]
                    );
                    
                    console.log(`Updated admin ID to ${orgAdmin.id} for organization ${org.name}`);
                } else {
                    // If no admin in org, create one
                    console.log(`No admin found for organization ${org.name} - creating one`);
                    
                    // Make first user in org an admin
                    const orgUser = users.find(user => user.organization_id === org.id);
                    
                    if (orgUser) {
                        await runQuery(
                            `UPDATE users SET role = 'admin' WHERE id = ?`,
                            [orgUser.id]
                        );
                        
                        await runQuery(
                            `UPDATE organizations SET admin_id = ? WHERE id = ?`,
                            [orgUser.id, org.id]
                        );
                        
                        console.log(`Promoted user ${orgUser.username} to admin for organization ${org.name}`);
                    }
                }
            }
        }
        
        // Verify config files exist
        for (const org of organizations) {
            const configPath = path.join(__dirname, 'data', org.config_file);
            
            try {
                await fs.access(configPath);
            } catch (error) {
                console.log(`Config file ${org.config_file} missing for organization ${org.name} - creating`);
                
                const defaultConfig = {
                    model: process.env.DEFAULT_MODEL || 'gpt-4-turbo-preview',
                    temperature: 0.7,
                    language: 'English',
                    pinCount: 10,
                    prompts: {}
                };
                
                await fs.writeFile(configPath, JSON.stringify(defaultConfig, null, 2));
            }
        }
        
        console.log('Data repair completed successfully!');
    } catch (error) {
        console.error('Data repair failed:', error);
    } finally {
        db.close();
    }
}

// Add to fix-user-data.js
function normalizeId(id) {
  // Check if already UUID format
  if (id && id.includes('-')) return id;
  
  // Convert hex string to UUID format if needed
  if (id && id.length === 32) {
    return [
      id.substr(0, 8),
      id.substr(8, 4),
      id.substr(12, 4),
      id.substr(16, 4),
      id.substr(20, 12)
    ].join('-');
  }
  
  // Generate new UUID if invalid
  return uuidv4();
}

// Then use normalizeId when updating/checking IDs in your script

// Add this to fix-user-data.js
async function ensureOrganizationConsistency() {
  // Get all users and organizations
  const users = await getAll(`SELECT * FROM users`);
  const orgs = await getAll(`SELECT * FROM organizations`);
  
  // Track changes
  let changesCount = 0;
  
  // Check each organization has a valid admin
  for (const org of orgs) {
    const adminExists = users.some(user => 
      user.id === org.admin_id && 
      user.organization_id === org.id
    );
    
    if (!adminExists) {
      console.log(`Organization ${org.name} has invalid admin - fixing`);
      
      // Find any user in this org
      const orgUser = users.find(user => user.organization_id === org.id);
      
      if (orgUser) {
        // Make them admin
        await runQuery(
          `UPDATE users SET role = 'admin' WHERE id = ?`,
          [orgUser.id]
        );
        
        // Update org admin_id
        await runQuery(
          `UPDATE organizations SET admin_id = ? WHERE id = ?`,
          [orgUser.id, org.id]
        );
        
        changesCount++;
      } else {
        console.log(`No users found for org ${org.name} - cannot fix admin relationship`);
      }
    }
  }
  
  console.log(`Made ${changesCount} fixes to organization-admin relationships`);
}

// Run the repair function
fixUserData().then(() => {
    console.log('Database fix script completed!');
}).catch(error => {
    console.error('Error running fix script:', error);
});