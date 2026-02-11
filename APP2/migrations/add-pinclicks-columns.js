/**
 * Migration: Add Pinclicks Content Columns
 * Adds columns to store pinclicks automation results in keywords table
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
        // Add pinclicks-related columns to keywords table
        console.log('\n📊 Adding pinclicks columns to keywords table...');

        const alterStatements = [
          // Flag to indicate if pinclicks automation should be used
          `ALTER TABLE keywords ADD COLUMN use_pinclicks INTEGER DEFAULT 0`,

          // Store pinclicks titles (JSON array)
          `ALTER TABLE keywords ADD COLUMN pinclicks_titles TEXT DEFAULT NULL`,

          // Store pinclicks descriptions (JSON array)
          `ALTER TABLE keywords ADD COLUMN pinclicks_descriptions TEXT DEFAULT NULL`,

          // Store pinclicks text overlays (JSON array)
          `ALTER TABLE keywords ADD COLUMN pinclicks_overlays TEXT DEFAULT NULL`,

          // Store raw ChatGPT response
          `ALTER TABLE keywords ADD COLUMN pinclicks_raw_content TEXT DEFAULT NULL`,

          // Store filenames for reference
          `ALTER TABLE keywords ADD COLUMN pinclicks_csv_file TEXT DEFAULT NULL`,
          `ALTER TABLE keywords ADD COLUMN pinclicks_raw_file TEXT DEFAULT NULL`,

          // Timestamp when pinclicks automation was completed
          `ALTER TABLE keywords ADD COLUMN pinclicks_completed_at DATETIME DEFAULT NULL`,

          // Pinclicks automation status
          `ALTER TABLE keywords ADD COLUMN pinclicks_status TEXT DEFAULT NULL`
        ];

        let completed = 0;
        let errors = [];

        alterStatements.forEach((sql, index) => {
          db.run(sql, function(err) {
            if (err) {
              // Ignore "duplicate column" errors (column already exists)
              if (!err.message.includes('duplicate column')) {
                console.error(`❌ Error on statement ${index + 1}:`, err.message);
                errors.push(err.message);
              } else {
                console.log(`⚠️ Column ${index + 1} already exists, skipping...`);
              }
            } else {
              console.log(`✅ Added column ${index + 1}/${alterStatements.length}`);
            }

            completed++;

            if (completed === alterStatements.length) {
              if (errors.length > 0) {
                console.error(`\n❌ Migration completed with ${errors.length} error(s)`);
                reject(new Error(`Migration errors: ${errors.join(', ')}`));
              } else {
                console.log('\n✅ Migration completed successfully!');
                console.log('\nAdded pinclicks columns:');
                console.log('  - use_pinclicks (flag to enable/disable)');
                console.log('  - pinclicks_titles (JSON array)');
                console.log('  - pinclicks_descriptions (JSON array)');
                console.log('  - pinclicks_overlays (JSON array)');
                console.log('  - pinclicks_raw_content (full ChatGPT response)');
                console.log('  - pinclicks_csv_file (CSV filename)');
                console.log('  - pinclicks_raw_file (raw text filename)');
                console.log('  - pinclicks_completed_at (timestamp)');
                console.log('  - pinclicks_status (automation status)');
                resolve();
              }

              db.close((closeErr) => {
                if (closeErr) {
                  console.error('Error closing database:', closeErr);
                } else {
                  console.log('\n🔒 Database connection closed');
                }
              });
            }
          });
        });
      });
    });
  });
}

// Run migration
console.log('🚀 Starting Pinclicks Columns Migration...\n');
runMigration()
  .then(() => {
    console.log('\n✅ Migration successful!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  });
