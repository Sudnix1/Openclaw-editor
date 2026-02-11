// migrations/add-auth-tables.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

// Create a connection to the database
const db = new sqlite3.Database(path.join(__dirname, '../data/recipes.db'));

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

// Run migrations
async function runMigration() {
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
        
        // Check if owner_id column exists in recipes table
        let tableInfo = await getAll(`PRAGMA table_info(recipes)`);
        
        const hasOwnerId = tableInfo.some(row => row.name === 'owner_id');
        const hasOrganizationId = tableInfo.some(row => row.name === 'organization_id');
        
        // Add owner_id column if it doesn't exist
        if (!hasOwnerId) {
            await runQuery(`ALTER TABLE recipes ADD COLUMN owner_id TEXT`);
            console.log('Added owner_id column to recipes table');
        }
        
        // Add organization_id column if it doesn't exist
        if (!hasOrganizationId) {
            await runQuery(`ALTER TABLE recipes ADD COLUMN organization_id TEXT`);
            console.log('Added organization_id column to recipes table');
        }
        
        // Check if keywords table exists
        const keywordsTableExists = await getOne(`
            SELECT name FROM sqlite_master 
            WHERE type='table' AND name='keywords'
        `);
        
        if (keywordsTableExists) {
            // Check if owner_id column exists in keywords table
            tableInfo = await getAll(`PRAGMA table_info(keywords)`);
            
            const keywordsHasOwnerId = tableInfo.some(row => row.name === 'owner_id');
            const keywordsHasOrganizationId = tableInfo.some(row => row.name === 'organization_id');
            
            // Add owner_id column if it doesn't exist
            if (!keywordsHasOwnerId) {
                await runQuery(`ALTER TABLE keywords ADD COLUMN owner_id TEXT`);
                console.log('Added owner_id column to keywords table');
            }
            
            // Add organization_id column if it doesn't exist
            if (!keywordsHasOrganizationId) {
                await runQuery(`ALTER TABLE keywords ADD COLUMN organization_id TEXT`);
                console.log('Added organization_id column to keywords table');
            }
        }
        
        // Check if there are any users
        const userCount = await getOne(`SELECT COUNT(*) as count FROM users`);
        
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
            const fs = require('fs').promises;
            const configPath = path.join(__dirname, '../data', configFile);
            
            // Create data directory if it doesn't exist
            await fs.mkdir(path.join(__dirname, '../data'), { recursive: true });
            
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
        
        console.log('Migration completed successfully!');
    } catch (error) {
        console.error('Migration failed:', error);
        throw error;
    }
}

// Run the migration
runMigration()
    .then(() => {
        console.log('All migration tasks completed!');
        db.close();
    })
    .catch(err => {
        console.error('Error during migration:', err);
        db.close();
    });