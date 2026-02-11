/**
 * Migration: Add discord_image_url column to keywords table
 *
 * This allows users to manually provide a Discord image URL as a fallback
 * when the original image_url fails to load or is not working.
 *
 * Date: 2025-12-08
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '..', 'data', 'recipes.db');

console.log('📦 [MIGRATION] Adding discord_image_url column to keywords table...');

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('❌ [MIGRATION] Error connecting to database:', err);
    process.exit(1);
  }
  console.log('✅ [MIGRATION] Connected to database');
});

// Add the discord_image_url column
db.run(`ALTER TABLE keywords ADD COLUMN discord_image_url TEXT;`, function(err) {
  if (err) {
    if (err.message.includes('duplicate column name')) {
      console.log('ℹ️  [MIGRATION] Column discord_image_url already exists, skipping...');
    } else {
      console.error('❌ [MIGRATION] Error adding column:', err);
      db.close();
      process.exit(1);
    }
  } else {
    console.log('✅ [MIGRATION] Successfully added discord_image_url column');
  }

  db.close((err) => {
    if (err) {
      console.error('❌ [MIGRATION] Error closing database:', err);
    } else {
      console.log('✅ [MIGRATION] Migration complete!');
      console.log('\n📋 Usage:');
      console.log('   1. When an image URL fails, you can provide a Discord image URL');
      console.log('   2. Upload image to Discord');
      console.log('   3. Copy the Discord image URL');
      console.log('   4. Paste it in the keyword\'s discord_image_url field');
      console.log('   5. The system will use this URL as fallback for Midjourney');
    }
  });
});
