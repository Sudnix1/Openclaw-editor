// Database initialization script
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

// Ensure data directory exists
const dataDir = path.join(__dirname, 'data');
if (!fsSync.existsSync(dataDir)){
    fsSync.mkdirSync(dataDir, { recursive: true });
}

// Create a connection to the database
const db = new sqlite3.Database(path.join(dataDir, 'recipes.db'));

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

// Helper to get data as promises
function getQuery(query, params = []) {
    return new Promise((resolve, reject) => {
        db.get(query, params, function(err, row) {
            if (err) {
                reject(err);
            } else {
                resolve(row);
            }
        });
    });
}

// Helper to get all rows as promises
function getAllQuery(query, params = []) {
    return new Promise((resolve, reject) => {
        db.all(query, params, function(err, rows) {
            if (err) {
                reject(err);
            } else {
                resolve(rows);
            }
        });
    });
}

// Run migrations
async function initDatabase() {
    try {
        // Enable foreign keys
        await runQuery('PRAGMA foreign_keys = ON');
        
        // Create users table
        await runQuery(`
            CREATE TABLE IF NOT EXISTS users (
              id TEXT PRIMARY KEY,
              username TEXT UNIQUE NOT NULL,
              password TEXT NOT NULL,
              name TEXT,
              email TEXT UNIQUE NOT NULL,
              role TEXT CHECK(role IN ('admin', 'employee')) NOT NULL DEFAULT 'employee',
              organization_id TEXT,
              created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        // Create organizations table
        await runQuery(`
            CREATE TABLE IF NOT EXISTS organizations (
              id TEXT PRIMARY KEY,
              name TEXT NOT NULL,
              admin_id TEXT NOT NULL,
              config_file TEXT NOT NULL,
              excel_file TEXT,
              created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        // Add index for organization_id in users table
        await runQuery(`
            CREATE INDEX IF NOT EXISTS idx_users_organization
            ON users(organization_id)
        `);
        
        // Create recipes table (if it doesn't exist)
        await runQuery(`
            CREATE TABLE IF NOT EXISTS recipes (
                id TEXT PRIMARY KEY,
                recipe_idea TEXT NOT NULL,
                category TEXT,
                interests TEXT,
                language TEXT,
                owner_id TEXT,
                organization_id TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        // Create facebook_content table
        await runQuery(`
            CREATE TABLE IF NOT EXISTS facebook_content (
                id TEXT PRIMARY KEY,
                recipe_id TEXT NOT NULL,
                recipe_text TEXT NOT NULL,
                title TEXT NOT NULL,
                ingredients TEXT,
                fb_caption TEXT,
                mj_prompt TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE
            )
        `);
        
        // Create pinterest_content table
        await runQuery(`
            CREATE TABLE IF NOT EXISTS pinterest_variations (
                id TEXT PRIMARY KEY,
                recipe_id TEXT NOT NULL,
                variation_number INTEGER NOT NULL,
                pin_title TEXT NOT NULL,
                pin_description TEXT,
                overlay_text TEXT,
                meta_title TEXT,
                meta_description TEXT,
                meta_slug TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE
            )
        `);
        
        // Create blog_content table
        await runQuery(`
            CREATE TABLE IF NOT EXISTS blog_content (
                id TEXT PRIMARY KEY,
                recipe_id TEXT NOT NULL,
                pinterest_variation_id TEXT,
                html_content TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE,
                FOREIGN KEY (pinterest_variation_id) REFERENCES pinterest_variations(id) ON DELETE SET NULL
            )
        `);
        
        // Create keywords table
        await runQuery(`
            CREATE TABLE IF NOT EXISTS keywords (
                id TEXT PRIMARY KEY,
                keyword TEXT NOT NULL,
                category TEXT,
                interests TEXT,
                status TEXT DEFAULT 'pending',
                recipe_id TEXT,
                owner_id TEXT,
                organization_id TEXT,
                added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                processed_at DATETIME,
                FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE SET NULL
            )
        `);
        
        // Create API keys table
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
        
        // Create indexes for API keys table
        await runQuery('CREATE INDEX IF NOT EXISTS idx_api_keys_service ON api_keys(service)');
        await runQuery('CREATE INDEX IF NOT EXISTS idx_api_keys_active ON api_keys(is_active)');
        
        // Create indexes for recipes table
        await runQuery(`CREATE INDEX IF NOT EXISTS idx_recipes_recipe_idea ON recipes(recipe_idea)`);
        await runQuery(`CREATE INDEX IF NOT EXISTS idx_facebook_recipe_id ON facebook_content(recipe_id)`);
        await runQuery(`CREATE INDEX IF NOT EXISTS idx_pinterest_recipe_id ON pinterest_variations(recipe_id)`);
        await runQuery(`CREATE INDEX IF NOT EXISTS idx_blog_recipe_id ON blog_content(recipe_id)`);
        await runQuery(`CREATE INDEX IF NOT EXISTS idx_pinterest_variation ON pinterest_variations(recipe_id, variation_number)`);
        
        // Create indexes for keywords table
        await runQuery(`CREATE INDEX IF NOT EXISTS idx_keywords_status ON keywords(status)`);
        await runQuery(`CREATE INDEX IF NOT EXISTS idx_keywords_keyword ON keywords(keyword)`);
        
        // Check for owner_id and organization_id columns in recipes and keywords tables
        // and add them if they don't exist
        
        // For recipes table
        const recipesTableInfo = await getAllQuery(`PRAGMA table_info(recipes)`);
        
        const hasOwnerIdInRecipes = recipesTableInfo.some(row => row.name === 'owner_id');
        const hasOrgIdInRecipes = recipesTableInfo.some(row => row.name === 'organization_id');
        
        if (!hasOwnerIdInRecipes) {
            await runQuery(`ALTER TABLE recipes ADD COLUMN owner_id TEXT`);
            console.log('Added owner_id column to recipes table');
        }
        
        if (!hasOrgIdInRecipes) {
            await runQuery(`ALTER TABLE recipes ADD COLUMN organization_id TEXT`);
            console.log('Added organization_id column to recipes table');
        }
        
        // For keywords table
        const keywordsTableExists = await getQuery(`SELECT name FROM sqlite_master WHERE type='table' AND name='keywords'`);
        
        if (keywordsTableExists) {
            const keywordsTableInfo = await getAllQuery(`PRAGMA table_info(keywords)`);
            
            const hasOwnerIdInKeywords = keywordsTableInfo.some(row => row.name === 'owner_id');
            const hasOrgIdInKeywords = keywordsTableInfo.some(row => row.name === 'organization_id');
            
            if (!hasOwnerIdInKeywords) {
                await runQuery(`ALTER TABLE keywords ADD COLUMN owner_id TEXT`);
                console.log('Added owner_id column to keywords table');
            }
            
            if (!hasOrgIdInKeywords) {
                await runQuery(`ALTER TABLE keywords ADD COLUMN organization_id TEXT`);
                console.log('Added organization_id column to keywords table');
            }
        }
        
        // Check if there are any users and create a default admin if none exist
        const userCount = await getQuery(`SELECT COUNT(*) as count FROM users`);
        
        if (userCount.count === 0) {
            // Create default organization and admin
            const orgId = uuidv4();
            const adminId = uuidv4();
            const configFile = `config-${orgId}.json`;
            const hashedPassword = crypto.createHash('sha256').update('admin123').digest('hex');
            
            // Create default organization
            await runQuery(`
                INSERT INTO organizations (id, name, admin_id, config_file)
                VALUES (?, ?, ?, ?)
            `, [orgId, 'Default Organization', adminId, configFile]);
            
            // Create default admin user
            await runQuery(`
                INSERT INTO users (id, username, password, name, email, role, organization_id)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `, [adminId, 'admin', hashedPassword, 'Administrator', 'admin@example.com', 'admin', orgId]);
            
            console.log('Created default admin user (username: admin, password: admin123)');
            
            // Create default config file
            const configPath = path.join(dataDir, configFile);
            
            // Create default config file
            await fs.writeFile(configPath, JSON.stringify({
                model: process.env.DEFAULT_MODEL || 'gpt-4-turbo-preview',
                temperature: parseFloat(process.env.DEFAULT_TEMPERATURE || '0.7'),
                language: process.env.DEFAULT_LANGUAGE || 'English',
                pinCount: parseInt(process.env.DEFAULT_PIN_COUNT || '10'),
                prompts: {}
            }, null, 2));
            
            console.log(`Created default organization config file: ${configPath}`);
        }
        
        console.log('Database initialization completed successfully!');
    } catch (error) {
        console.error('Database initialization failed:', error);
        throw error;
    }
}

// Run the initialization
initDatabase()
    .then(() => {
        console.log('All database initialization tasks completed!');
        db.close();
    })
    .catch(err => {
        console.error('Error during database initialization:', err);
        db.close();
    });

module.exports = { initDatabase, runQuery, getQuery, getAllQuery };