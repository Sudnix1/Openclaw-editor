// migrations/comprehensive-recipe-images-fix.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Create database connection
const dbPath = path.join(__dirname, '../data/recipes.db');
const db = new sqlite3.Database(dbPath);

console.log('🔧 Comprehensive fix for recipe_images table...');

// Define the expected schema for recipe_images table
const expectedColumns = [
  { name: 'id', type: 'INTEGER', primaryKey: true, autoIncrement: true },
  { name: 'recipe_id', type: 'INTEGER', notNull: true },
  { name: 'prompt', type: 'TEXT', notNull: true },
  { name: 'image_path', type: 'TEXT', notNull: false }, // Allow NULL during generation
  { name: 'discord_message_id', type: 'TEXT', notNull: false },
  { name: 'status', type: 'TEXT', default: "'pending'" },
  { name: 'error', type: 'TEXT', notNull: false },
  { name: 'filter_changes', type: 'TEXT', notNull: false },
  { name: 'created_at', type: 'DATETIME', default: 'CURRENT_TIMESTAMP' }
];

db.serialize(() => {
  // First, check current table structure
  db.all("PRAGMA table_info(recipe_images)", (err, currentColumns) => {
    if (err) {
      console.error('❌ Error checking table info:', err.message);
      return;
    }
    
    console.log('📋 Current recipe_images table columns:');
    currentColumns.forEach(col => {
      console.log(`   - ${col.name}: ${col.type}${col.notnull ? ' NOT NULL' : ''}${col.dflt_value ? ` DEFAULT ${col.dflt_value}` : ''}`);
    });
    
    // Check for missing columns
    const missingColumns = [];
    
    expectedColumns.forEach(expectedCol => {
      const exists = currentColumns.some(currentCol => currentCol.name === expectedCol.name);
      if (!exists && !expectedCol.primaryKey) { // Skip primary key columns for ALTER TABLE
        missingColumns.push(expectedCol);
      }
    });
    
    if (missingColumns.length === 0) {
      console.log('✅ All expected columns are present - no changes needed');
      db.close();
      return;
    }
    
    console.log(`⚠️ Found ${missingColumns.length} missing columns:`);
    missingColumns.forEach(col => {
      console.log(`   - ${col.name}: ${col.type}`);
    });
    
    // Add missing columns one by one
    let processed = 0;
    
    missingColumns.forEach((col, index) => {
      let alterQuery = `ALTER TABLE recipe_images ADD COLUMN ${col.name} ${col.type}`;
      
      if (col.default) {
        alterQuery += ` DEFAULT ${col.default}`;
      }
      
      console.log(`🔄 Adding column: ${col.name}...`);
      
      db.run(alterQuery, (err) => {
        processed++;
        
        if (err) {
          console.error(`❌ Error adding column ${col.name}:`, err.message);
        } else {
          console.log(`✅ Successfully added column: ${col.name}`);
        }
        
        // If this is the last column, verify the final structure
        if (processed === missingColumns.length) {
          setTimeout(() => {
            db.all("PRAGMA table_info(recipe_images)", (err, finalColumns) => {
              if (err) {
                console.error('❌ Error verifying final table structure:', err.message);
              } else {
                console.log('🎉 Final recipe_images table structure:');
                finalColumns.forEach(col => {
                  console.log(`   - ${col.name}: ${col.type}${col.notnull ? ' NOT NULL' : ''}${col.dflt_value ? ` DEFAULT ${col.dflt_value}` : ''}`);
                });
                
                // Check if all expected columns are now present
                const allPresent = expectedColumns.every(expectedCol => {
                  return expectedCol.primaryKey || finalColumns.some(finalCol => finalCol.name === expectedCol.name);
                });
                
                if (allPresent) {
                  console.log('🎉 Migration completed successfully! All expected columns are now present.');
                } else {
                  console.log('⚠️ Some columns may still be missing. Please check manually.');
                }
              }
              
              db.close();
            });
          }, 500); // Small delay to ensure all ALTER TABLE operations complete
        }
      });
    });
  });
});

// Handle database connection errors
db.on('error', (err) => {
  console.error('❌ Database connection error:', err.message);
});