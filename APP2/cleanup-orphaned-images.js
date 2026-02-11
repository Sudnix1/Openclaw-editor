// cleanup-orphaned-images.js
const db = require('./db');

async function cleanupOrphanedImages() {
  console.log('🧹 Cleaning up orphaned image URLs...\n');
  
  try {
    // Remove image URLs that point to non-existent files
    const result = await db.runQuery(`
      UPDATE keywords 
      SET image_url = NULL 
      WHERE image_url IS NOT NULL 
        AND image_url != ''
        AND id IN (
          SELECT id FROM keywords 
          WHERE image_url LIKE '/recipe_images/%'
        )
    `);
    
    console.log(`✅ Cleaned up ${result.changes} orphaned image URLs`);
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

cleanupOrphanedImages().then(() => process.exit(0));