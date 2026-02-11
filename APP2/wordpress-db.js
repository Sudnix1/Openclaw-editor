// wordpress-db.js
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

// Create a connection to the database
const db = new sqlite3.Database(path.join(__dirname, 'data', 'recipes.db'));

// Helper to run queries as promises
function runQuery(query, params = []) {
    return new Promise((resolve, reject) => {
        db.run(query, params, function(err) {
            if (err) {
                reject(err);
            } else {
                resolve({ lastID: this.lastID, changes: this.changes, id: params[0] });
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

// Helper to get multiple rows
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

// Create the necessary tables if they don't exist
// Update the initTables function in wordpress-db.js to include website_id column
// Fix for the initTables function in wordpress-db.js

async function initTables() {
  try {
    // WordPress settings table with website_id column
    await runQuery(`
      CREATE TABLE IF NOT EXISTS wordpress_settings (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL DEFAULT 'default',
        website_id TEXT,
        site_url TEXT NOT NULL,
        username TEXT NOT NULL,
        password TEXT NOT NULL,
        default_status TEXT DEFAULT 'draft',
        include_pinterest_images BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, website_id)
      )
    `);

    // Add include_pinterest_images column if it doesn't exist (for existing databases)
    try {
      await runQuery(`ALTER TABLE wordpress_settings ADD COLUMN include_pinterest_images BOOLEAN DEFAULT FALSE`);
      console.log('✅ Added include_pinterest_images column to wordpress_settings table');
    } catch (error) {
      // Column already exists or other error, ignore
      if (error.message.includes('duplicate column name') || error.message.includes('already exists')) {
        console.log('✅ include_pinterest_images column already exists');
      } else {
        console.log('⚠️ Error adding include_pinterest_images column:', error.message);
      }
    }

    // Update any existing records that don't have the include_pinterest_images value set
    try {
      const result = await runQuery(`UPDATE wordpress_settings SET include_pinterest_images = 0 WHERE include_pinterest_images IS NULL`);
      if (result.changes > 0) {
        console.log(`✅ Updated ${result.changes} existing records to set include_pinterest_images = 0`);
      }
    } catch (updateError) {
      console.log('⚠️ Error updating existing records:', updateError.message);
    }

    // WordPress publications history
    await runQuery(`
      CREATE TABLE IF NOT EXISTS wordpress_publications (
        id TEXT PRIMARY KEY,
        recipe_id TEXT NOT NULL,
        wp_post_id TEXT NOT NULL,
        wp_post_url TEXT NOT NULL,
        wp_status TEXT DEFAULT 'draft',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE
      )
    `);

    // Check if website_id column exists in wordpress_publications
    const columnsQuery = await getAll(
      `PRAGMA table_info(wordpress_publications)`
    );
    
    // If website_id column doesn't exist, add it
    const hasWebsiteColumn = columnsQuery && Array.isArray(columnsQuery) && 
                            columnsQuery.some(col => col.name === 'website_id');
    
    if (!hasWebsiteColumn) {
      try {
        await runQuery(`
          ALTER TABLE wordpress_publications 
          ADD COLUMN website_id TEXT
        `);
        console.log('Added website_id column to wordpress_publications table');
      } catch (alterError) {
        console.error('Error adding website_id column:', alterError);
        // Fall back to recreating the table if ALTER TABLE fails
        try {
          // First backup the existing data
          const existingData = await getAll(`SELECT * FROM wordpress_publications`);
          
          // Drop and recreate the table with the new column
          await runQuery(`DROP TABLE IF EXISTS wordpress_publications_backup`);
          await runQuery(`ALTER TABLE wordpress_publications RENAME TO wordpress_publications_backup`);
          
          await runQuery(`
            CREATE TABLE wordpress_publications (
              id TEXT PRIMARY KEY,
              recipe_id TEXT NOT NULL,
              website_id TEXT,
              wp_post_id TEXT NOT NULL,
              wp_post_url TEXT NOT NULL,
              wp_status TEXT DEFAULT 'draft',
              created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
              FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE
            )
          `);
          
          // Restore the data
          if (existingData && existingData.length > 0) {
            for (const row of existingData) {
              await runQuery(
                `INSERT INTO wordpress_publications 
                (id, recipe_id, wp_post_id, wp_post_url, wp_status, created_at)
                VALUES (?, ?, ?, ?, ?, ?)`,
                [
                  row.id,
                  row.recipe_id,
                  row.wp_post_id,
                  row.wp_post_url,
                  row.wp_status,
                  row.created_at
                ]
              );
            }
          }
          
          console.log('Recreated wordpress_publications table with website_id column');
        } catch (recreateError) {
          console.error('Error recreating wordpress_publications table:', recreateError);
        }
      }
    }

    console.log('WordPress tables initialized');
  } catch (error) {
    console.error('Error initializing WordPress tables:', error);
    throw error;
  }
}

// Initialize tables when the module is loaded
initTables();

// WordPress operations
const wordpressDb = {
    // Save or update WordPress settings
    async saveSettings(settings) {
        try {
            // Add website_id to settings if global.currentWebsiteId exists
            if (global.currentWebsiteId) {
                settings.website_id = global.currentWebsiteId;
            }
            
            const userId = settings.userId || 'default';
            const websiteId = settings.website_id || null;
            
            console.log(`Saving WordPress settings for user ${userId} and website ${websiteId || 'NULL'}`);
            
            // Check if we have a record for this specific user+website combination
            let query, params;
            
            if (websiteId) {
                query = `SELECT id FROM wordpress_settings WHERE user_id = ? AND website_id = ?`;
                params = [userId, websiteId];
            } else {
                query = `SELECT id FROM wordpress_settings WHERE user_id = ? AND (website_id IS NULL OR website_id = '')`;
                params = [userId];
            }
            
            const existingRecord = await getOne(query, params);
            
            if (existingRecord) {
                // Update the existing record for this user+website combination
                console.log(`Updating existing record with ID: ${existingRecord.id}`);
                await runQuery(
                    `UPDATE wordpress_settings 
                    SET site_url = ?, username = ?, password = ?, 
                    default_status = ?, include_pinterest_images = ?, updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?`,
                    [
                        settings.siteUrl,
                        settings.username,
                        settings.password,
                        settings.defaultStatus || 'draft',
                        settings.includePinterestImages ? 1 : 0,
                        existingRecord.id
                    ]
                );
                return existingRecord.id;
            } else {
                // Create a new record for this user+website combination
                console.log(`Creating new WordPress settings record for user ${userId} and website ${websiteId || 'NULL'}`);
                const id = uuidv4();
                await runQuery(
                    `INSERT INTO wordpress_settings 
                    (id, user_id, website_id, site_url, username, password, default_status, include_pinterest_images)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        id,
                        userId,
                        websiteId,
                        settings.siteUrl,
                        settings.username,
                        settings.password,
                        settings.defaultStatus || 'draft',
                        settings.includePinterestImages ? 1 : 0
                    ]
                );
                return id;
            }
        } catch (error) {
            console.error('Error saving WordPress settings:', error);
            throw error;
        }
    },
        
    // Get WordPress settings - FIXED FOR MULTI-TENANT
    async getSettings(userId = 'default') {
        try {
            // Check for website_id filter
            const websiteId = global.currentWebsiteId;
            
            console.log(`Getting WordPress settings for user ${userId} and website ${websiteId || 'NULL'}`);
            
            let query, params;
            
            if (websiteId) {
                // For multi-tenant: Get settings for the website, prioritizing current user's settings
                // This allows employees to use WordPress settings configured by admin for the website
                // But if the current user has their own settings, use those instead
                query = `
                    SELECT id, user_id, website_id, site_url, username, password, 
                    default_status, include_pinterest_images, created_at, updated_at
                    FROM wordpress_settings
                    WHERE website_id = ?
                    ORDER BY 
                        CASE WHEN user_id = ? THEN 0 ELSE 1 END,
                        created_at DESC
                    LIMIT 1
                `;
                params = [websiteId, userId];
            } else {
                // Try to get default/global settings (NULL website_id)
                query = `
                    SELECT id, user_id, website_id, site_url, username, password, 
                    default_status, include_pinterest_images, created_at, updated_at
                    FROM wordpress_settings
                    WHERE user_id = ? AND (website_id IS NULL OR website_id = '')
                `;
                params = [userId];
            }
            
            const settings = await getOne(query, params);
            
            if (!settings && websiteId) {
                // If no settings found for this website, fall back to default settings
                console.log(`No settings found for website ${websiteId}, falling back to default settings`);
                
                const fallbackQuery = `
                    SELECT id, user_id, website_id, site_url, username, password, 
                    default_status, include_pinterest_images, created_at, updated_at
                    FROM wordpress_settings
                    WHERE (website_id IS NULL OR website_id = '')
                    ORDER BY created_at DESC
                    LIMIT 1
                `;
                
                return await getOne(fallbackQuery, []);
            }
            
            return settings;
        } catch (error) {
            console.error('Error getting WordPress settings:', error);
            throw error;
        }
    },
        
    // Save publication history
    // Update the savePublication function to include website_id
    // Updated savePublication function
    async savePublication(data) {
        try {
            const id = uuidv4();
            
            // Check if website_id column exists
            const columnsQuery = await getAll(`PRAGMA table_info(wordpress_publications)`);
            const hasWebsiteColumn = columnsQuery && Array.isArray(columnsQuery) && 
                                    columnsQuery.some(col => col.name === 'website_id');
            
            if (hasWebsiteColumn) {
                await runQuery(
                    `INSERT INTO wordpress_publications 
                    (id, recipe_id, wp_post_id, wp_post_url, wp_status, website_id)
                    VALUES (?, ?, ?, ?, ?, ?)`,
                    [
                        id,
                        data.recipeId,
                        data.wpPostId.toString(),
                        data.wpPostUrl,
                        data.wpStatus || 'draft',
                        data.websiteId || null
                    ]
                );
            } else {
                // Fall back to the original query without website_id
                await runQuery(
                    `INSERT INTO wordpress_publications 
                    (id, recipe_id, wp_post_id, wp_post_url, wp_status)
                    VALUES (?, ?, ?, ?, ?)`,
                    [
                        id,
                        data.recipeId,
                        data.wpPostId.toString(),
                        data.wpPostUrl,
                        data.wpStatus || 'draft'
                    ]
                );
            }
            
            return id;
        } catch (error) {
            console.error('Error saving WordPress publication:', error);
            throw error;
        }
    },
        
    // Get publication history for a recipe
    async getPublicationsByRecipeId(recipeId) {
        try {
            return await getAll(
                `SELECT id, recipe_id, wp_post_id, wp_post_url, wp_status, created_at
                FROM wordpress_publications
                WHERE recipe_id = ?
                ORDER BY created_at DESC`,
                [recipeId]
            );
        } catch (error) {
            console.error('Error getting WordPress publications:', error);
            throw error;
        }
    },
        
    // Get count of publications for a user or organization
    // Update the getPublicationCount function in wordpress-db.js
    // Updated getPublicationCount function
    async getPublicationCount(userId = null, organizationId = null, websiteId = null) {
        try {
            let query = `
                SELECT COUNT(*) as count 
                FROM wordpress_publications wp
                JOIN recipes r ON wp.recipe_id = r.id
                WHERE 1=1
            `;
            
            const params = [];
            
            if (userId && organizationId) {
                // Get count for a specific user within an organization
                query += ` AND r.owner_id = ? AND r.organization_id = ?`;
                params.push(userId, organizationId);
            } else if (userId) {
                // Get count for a specific user
                query += ` AND r.owner_id = ?`;
                params.push(userId);
            } else if (organizationId) {
                // Get count for an organization
                query += ` AND r.organization_id = ?`;
                params.push(organizationId);
            }
            
            // Add website filter if specified
            if (websiteId) {
                // Check if the website_id column exists
                const columnsQuery = await getAll(`PRAGMA table_info(wordpress_publications)`);
                const hasWebsiteColumn = columnsQuery && Array.isArray(columnsQuery) && 
                                        columnsQuery.some(col => col.name === 'website_id');
                
                if (hasWebsiteColumn) {
                    query += ` AND wp.website_id = ?`;
                    params.push(websiteId);
                } else {
                    console.warn('wordpress_publications table does not have website_id column, website filtering will not work');
                }
            }
            
            const result = await getOne(query, params);
            return result ? result.count : 0;
        } catch (error) {
            console.error('Error getting WordPress publication count:', error);
            return 0;
        }
    },

    // WordPress publication count with date filtering - TIMEZONE-AWARE VERSION
    async getPublicationCountFiltered(userId = null, organizationId = null, websiteId = null, dateFilter = null) {
        try {
            // First check if the wordpress_publications table exists
            const tableCheck = await getOne(`
                SELECT name FROM sqlite_master 
                WHERE type='table' AND name='wordpress_publications'
            `);
            
            if (!tableCheck) {
                return 0;
            }
            
            let query = `
                SELECT COUNT(*) as count
                FROM wordpress_publications wp
                JOIN recipes r ON wp.recipe_id = r.id
            `;
            
            const params = [];
            let whereAdded = false;
            
            // Add organization filter
            if (organizationId) {
                query += ` WHERE r.organization_id = ?`;
                params.push(organizationId);
                whereAdded = true;
            }
            
            // Add user filter
            if (userId) {
                if (whereAdded) {
                    query += ` AND r.owner_id = ?`;
                } else {
                    query += ` WHERE r.owner_id = ?`;
                    whereAdded = true;
                }
                params.push(userId);
            }
            
            // Add website filter
            if (websiteId) {
                if (whereAdded) {
                    query += ` AND wp.website_id = ?`;
                } else {
                    query += ` WHERE wp.website_id = ?`;
                    whereAdded = true;
                }
                params.push(websiteId);
            } else if (global.currentWebsiteId) {
                if (whereAdded) {
                    query += ` AND wp.website_id = ?`;
                } else {
                    query += ` WHERE wp.website_id = ?`;
                    whereAdded = true;
                }
                params.push(global.currentWebsiteId);
            }
            
            // FIXED: Add proper date filtering with datetime comparison
            if (dateFilter) {
                if (dateFilter.startDate) {
                    if (whereAdded) {
                        query += ` AND datetime(wp.created_at) >= datetime(?)`;
                    } else {
                        query += ` WHERE datetime(wp.created_at) >= datetime(?)`;
                        whereAdded = true;
                    }
                    params.push(dateFilter.startDate.toISOString());
                }
                if (dateFilter.endDate) {
                    if (whereAdded) {
                        query += ` AND datetime(wp.created_at) <= datetime(?)`;
                    } else {
                        query += ` WHERE datetime(wp.created_at) <= datetime(?)`;
                        whereAdded = true;
                    }
                    params.push(dateFilter.endDate.toISOString());
                }
            }
            
            console.log('WordPress filtered count query:', query);
            console.log('WordPress filtered count params:', params);
            
            const result = await getOne(query, params);
            return result ? result.count : 0;
        } catch (error) {
            console.error('Error getting filtered WordPress publication count:', error);
            return 0;
        }
    }
};

// Export functions and the database object
module.exports = {
    ...wordpressDb,
    getOne,
    getAll,
    runQuery
};