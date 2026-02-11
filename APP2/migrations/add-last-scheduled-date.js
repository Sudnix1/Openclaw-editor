// migrations/add-last-scheduled-date.js
// Migration to add last_scheduled_date column to websites table
// This allows automatic scheduling continuation from the last scheduled date

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '../data/recipes.db');
const db = new sqlite3.Database(dbPath);

console.log('🔧 Adding last_scheduled_date column to websites table...');

// Check if the column already exists
db.all('PRAGMA table_info(websites)', [], (err, columns) => {
  if (err) {
    console.error('❌ Error checking table structure:', err);
    db.close();
    return;
  }

  const hasColumn = columns.some(col => col.name === 'last_scheduled_date');

  if (hasColumn) {
    console.log('✅ last_scheduled_date column already exists!');
    db.close();
    return;
  }

  // Add the column
  db.run(`ALTER TABLE websites ADD COLUMN last_scheduled_date TEXT`, (err) => {
    if (err) {
      console.error('❌ Error adding last_scheduled_date column:', err);
    } else {
      console.log('✅ last_scheduled_date column added successfully!');

      // Verify the column was added
      db.all('PRAGMA table_info(websites)', [], (err, newColumns) => {
        if (err) {
          console.error('❌ Error verifying column:', err);
        } else {
          console.log('📋 Current websites table columns:');
          newColumns.forEach(col => {
            console.log(`   - ${col.name} (${col.type})`);
          });
        }
        db.close();
      });
    }
  });
});
