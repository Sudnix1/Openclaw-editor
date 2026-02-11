// migrations/add-recipe-images-table.js
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./data/recipes.db');

db.serialize(() => {
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
  `);
  
  // Add index for faster lookups
  db.run(`CREATE INDEX IF NOT EXISTS idx_recipe_images_recipe_id ON recipe_images(recipe_id)`);
  
  console.log('Recipe images table created successfully');
});