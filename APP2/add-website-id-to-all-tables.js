// add-website-id-to-all-tables.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const db = new sqlite3.Database(path.join(__dirname, 'data/recipes.db'));

async function addWebsiteIdToAllTables() {
  console.log('Starting comprehensive website_id column addition to all content tables...');
  
  try {
    // Get all tables in the database
    const tables = await new Promise((resolve, reject) => {
      db.all("SELECT name FROM sqlite_master WHERE type='table'", (err, rows) => {
        if (err) reject(err);
        else resolve(rows.map(row => row.name));
      });
    });
    
    console.log(`Found ${tables.length} tables in the database`);
    
    // List of content-related tables we should check (add more if needed)
    const contentTables = [
      'facebook_content',
      'pinterest_content',
      'blog_content', 
      'recipe_variations',
      'pinterest_variations',
      'content_generations',
      'recipe_content',
      'social_media_content',
      'instagram_content',
      'twitter_content'
    ];
    
    // Process each table
    for (const table of tables) {
      // If the table name contains words like 'content', 'variations', etc.,
      // or is in our list of known content tables, check and add the column
      if (
        contentTables.includes(table) || 
        table.includes('content') || 
        table.includes('variations') ||
        table.includes('social') ||
        table.includes('post') ||
        table.includes('recipe')
      ) {
        console.log(`Checking table: ${table}`);
        
        // Check if website_id column exists
        const columns = await new Promise((resolve, reject) => {
          db.all(`PRAGMA table_info(${table})`, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
          });
        });
        
        const hasWebsiteIdColumn = columns.some(col => col.name === 'website_id');
        
        if (hasWebsiteIdColumn) {
          console.log(`Table ${table} already has website_id column, skipping...`);
        } else {
          console.log(`Adding website_id column to table: ${table}`);
          try {
            await new Promise((resolve, reject) => {
              db.run(`ALTER TABLE ${table} ADD COLUMN website_id TEXT`, (err) => {
                if (err) {
                  console.error(`Error adding column to ${table}:`, err.message);
                  // Continue despite error
                  resolve();
                } else {
                  console.log(`✅ Successfully added website_id column to ${table}`);
                  resolve();
                }
              });
            });
          } catch (error) {
            console.error(`Failed to add column to ${table}:`, error.message);
            // Continue with next table
          }
        }
      }
    }
    
    console.log('Migration completed successfully');
  } catch (error) {
    console.error('Error during migration:', error);
  } finally {
    db.close();
  }
}

addWebsiteIdToAllTables();