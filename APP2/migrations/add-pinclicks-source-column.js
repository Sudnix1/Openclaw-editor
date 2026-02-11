/**
 * Migration: Add Pinclicks Source Column
 * Adds column to track whether content came from ChatGPT or OpenAI fallback
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '..', 'data', 'recipes.db');

function runMigration() {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        console.error('❌ Error opening database:', err);
        reject(err);
        return;
      }

      console.log('✅ Connected to database');

      db.serialize(() => {
        console.log('\n📊 Adding pinclicks_source column to keywords table...');

        const sql = `ALTER TABLE keywords ADD COLUMN pinclicks_source TEXT DEFAULT NULL`;

        db.run(sql, function(err) {
          if (err) {
            // Ignore "duplicate column" errors (column already exists)
            if (!err.message.includes('duplicate column')) {
              console.error(`❌ Error adding column:`, err.message);
              reject(err);
            } else {
              console.log(`⚠️ Column 'pinclicks_source' already exists, skipping...`);
              resolve();
            }
          } else {
            console.log(`✅ Added pinclicks_source column`);
            console.log('\nColumn tracks content source:');
            console.log('  - "chatgpt" = Data extracted from ChatGPT');
            console.log('  - "openai-fallback" = Generated via OpenAI API after ChatGPT parsing failed');
            resolve();
          }

          db.close((closeErr) => {
            if (closeErr) {
              console.error('Error closing database:', closeErr);
            } else {
              console.log('\n🔒 Database connection closed');
            }
          });
        });
      });
    });
  });
}

// Run migration
console.log('🚀 Starting Pinclicks Source Column Migration...\n');
runMigration()
  .then(() => {
    console.log('\n✅ Migration successful!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  });
