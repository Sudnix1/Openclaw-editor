// migrations/add-pinterest-board-column.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '..', 'data', 'recipes.db');
const db = new sqlite3.Database(dbPath);

console.log('📌 Adding pinterest_board column to keywords table...');

db.run(`ALTER TABLE keywords ADD COLUMN pinterest_board TEXT DEFAULT 'Dinner'`, (err) => {
  if (err) {
    if (err.message.includes('duplicate column')) {
      console.log('✅ Column pinterest_board already exists');
    } else {
      console.error('❌ Error adding column:', err.message);
    }
  } else {
    console.log('✅ Successfully added pinterest_board column to keywords table');
  }

  db.close((closeErr) => {
    if (closeErr) {
      console.error('Error closing database:', closeErr);
    }
    process.exit(err ? 1 : 0);
  });
});
