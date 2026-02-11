const Database = require('better-sqlite3');
const path = require('path');

/**
 * Migration to add processing_started_at column to keywords table
 */
function addProcessingStartedAtColumn() {
  const dbPath = path.join(__dirname, 'data', 'recipes.db');
  const db = new Database(dbPath);
  
  try {
    console.log('🔄 Starting migration: Adding processing_started_at column to keywords table...');
    
    // Check if column already exists
    const tableInfo = db.prepare("PRAGMA table_info(keywords)").all();
    const columnExists = tableInfo.some(col => col.name === 'processing_started_at');
    
    if (columnExists) {
      console.log('✅ Column processing_started_at already exists in keywords table');
      return;
    }
    
    // Add the processing_started_at column
    db.prepare(`
      ALTER TABLE keywords 
      ADD COLUMN processing_started_at DATETIME DEFAULT NULL
    `).run();
    
    console.log('✅ Successfully added processing_started_at column to keywords table');
    
    // Verify the column was added
    const updatedTableInfo = db.prepare("PRAGMA table_info(keywords)").all();
    const newColumnExists = updatedTableInfo.some(col => col.name === 'processing_started_at');
    
    if (newColumnExists) {
      console.log('✅ Migration verified: processing_started_at column is now present');
    } else {
      throw new Error('Migration failed: processing_started_at column was not added');
    }
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    db.close();
  }
}

// Run migration if this file is executed directly
if (require.main === module) {
  addProcessingStartedAtColumn();
}

module.exports = { addProcessingStartedAtColumn };