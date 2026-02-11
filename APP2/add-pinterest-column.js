// Migration script to add pinterest_url column to websites table
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'data/recipes.db');
const db = new sqlite3.Database(dbPath);

console.log('🔧 Adding pinterest_url column to websites table...');

// Check if the column already exists
db.all('PRAGMA table_info(websites)', [], (err, columns) => {
  if (err) {
    console.error('❌ Error checking table structure:', err);
    db.close();
    return;
  }

  const hasColumn = columns.some(col => col.name === 'pinterest_url');
  
  if (hasColumn) {
    console.log('✅ pinterest_url column already exists!');
    db.close();
    return;
  }

  // Add the column
  db.run('ALTER TABLE websites ADD COLUMN pinterest_url TEXT', (err) => {
    if (err) {
      console.error('❌ Error adding pinterest_url column:', err);
    } else {
      console.log('✅ pinterest_url column added successfully!');
      
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