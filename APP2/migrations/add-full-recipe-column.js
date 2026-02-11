// migrations/add-full-recipe-column.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Connect to database
const dbPath = path.join(__dirname, '..', 'data', 'recipes.db');
const db = new sqlite3.Database(dbPath);

console.log('Adding full_recipe column to keywords table...');

// Add the full_recipe column
db.run(`ALTER TABLE keywords ADD COLUMN full_recipe TEXT`, function(err) {
  if (err) {
    if (err.message.includes('duplicate column name')) {
      console.log('✅ full_recipe column already exists');
    } else {
      console.error('❌ Error adding full_recipe column:', err.message);
    }
  } else {
    console.log('✅ Successfully added full_recipe column to keywords table');
  }
  
  db.close((err) => {
    if (err) {
      console.error('Error closing database:', err.message);
    } else {
      console.log('Database connection closed.');
    }
  });
});