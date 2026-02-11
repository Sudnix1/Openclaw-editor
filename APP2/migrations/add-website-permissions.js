// migrations/add-recipe-images-table.js
const db = require('../db');

/**
 * Migration to add recipe_images table for storing Midjourney generated images
 */
function runMigration() {
  return new Promise((resolve, reject) => {
    console.log('Running migration: add-recipe-images-table');

    // Create recipe_images table
    db.run(`
      CREATE TABLE IF NOT EXISTS recipe_images (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        recipe_id INTEGER NOT NULL,
        prompt TEXT NOT NULL,
        image_path TEXT NOT NULL, 
        discord_message_id TEXT,
        status TEXT DEFAULT 'pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE
      )
    `, function(err) {
      if (err) {
        console.error('Error creating recipe_images table:', err);
        return reject(err);
      }
      
      console.log('Created recipe_images table successfully');
      
      // Create index for faster lookups by recipe_id
      db.run(`
        CREATE INDEX IF NOT EXISTS idx_recipe_images_recipe_id ON recipe_images(recipe_id)
      `, function(err) {
        if (err) {
          console.error('Error creating index:', err);
          return reject(err);
        }
        
        console.log('Created index successfully');
        resolve();
      });
    });
  });
}

module.exports = { runMigration };

// Run migration if script is executed directly
if (require.main === module) {
  runMigration()
    .then(() => {
      console.log('Migration completed successfully');
      process.exit(0);
    })
    .catch(err => {
      console.error('Migration failed:', err);
      process.exit(1);
    });
}