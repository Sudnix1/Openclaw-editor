// fix-wordpress-settings-constraint.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const db = new sqlite3.Database(path.join(__dirname, 'data/recipes.db'));

async function fixConstraint() {
  console.log('Fixing WordPress settings table constraints...');
  
  try {
    // Check current table structure
    const tableInfo = await new Promise((resolve, reject) => {
      db.all("PRAGMA table_info(wordpress_settings)", (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    
    console.log('Current table structure:');
    console.log(tableInfo.map(row => row.name));
    
    // Get table creation SQL
    const tableSql = await new Promise((resolve, reject) => {
      db.get("SELECT sql FROM sqlite_master WHERE type='table' AND name='wordpress_settings'", (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    
    console.log('Current table SQL:');
    console.log(tableSql.sql);
    
    // Create a backup of the data
    console.log('Creating backup of wordpress_settings data...');
    await new Promise((resolve, reject) => {
      db.run("CREATE TABLE IF NOT EXISTS wordpress_settings_backup AS SELECT * FROM wordpress_settings", (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    
    // Drop the old table
    console.log('Dropping old wordpress_settings table...');
    await new Promise((resolve, reject) => {
      db.run("DROP TABLE IF EXISTS wordpress_settings", (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    
    // Recreate the table with the correct constraint
    console.log('Creating new wordpress_settings table with proper constraints...');
    await new Promise((resolve, reject) => {
      db.run(`
        CREATE TABLE IF NOT EXISTS wordpress_settings (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL DEFAULT 'default',
          website_id TEXT,
          site_url TEXT NOT NULL,
          username TEXT NOT NULL,
          password TEXT NOT NULL,
          default_status TEXT DEFAULT 'draft',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(user_id, website_id)
        )
      `, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    
    // Restore the data
    console.log('Restoring data from backup...');
    await new Promise((resolve, reject) => {
      db.run(`
        INSERT INTO wordpress_settings 
        (id, user_id, website_id, site_url, username, password, default_status, created_at, updated_at)
        SELECT id, user_id, website_id, site_url, username, password, default_status, created_at, updated_at 
        FROM wordpress_settings_backup
      `, (err) => {
        if (err) {
          console.error('Error restoring data:', err);
          reject(err);
        } else {
          resolve();
        }
      });
    });
    
    console.log('Constraint fix complete!');
  } catch (error) {
    console.error('Error fixing constraints:', error);
  } finally {
    db.close();
  }
}

fixConstraint();