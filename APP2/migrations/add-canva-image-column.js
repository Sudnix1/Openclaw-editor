/**
 * Migration: Add Canva Image URL Column
 * Adds column to store Canva image URL for automatic insertion in blog articles
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
        console.log('\n📊 Adding canva_image_url column to blog_content table...');

        const alterStatement = `ALTER TABLE blog_content ADD COLUMN canva_image_url TEXT DEFAULT NULL`;

        db.run(alterStatement, function(err) {
          if (err) {
            if (!err.message.includes('duplicate column')) {
              console.error(`❌ Error adding column:`, err.message);
              reject(err);
            } else {
              console.log(`⚠️ Column already exists, skipping...`);
              resolve();
            }
          } else {
            console.log(`✅ Added canva_image_url column to blog_content table`);
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
console.log('🚀 Starting Canva Image Column Migration...\n');
runMigration()
  .then(() => {
    console.log('\n✅ Migration successful!');
    console.log('Canva images can now be uploaded and automatically inserted at the bottom of blog articles.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  });
