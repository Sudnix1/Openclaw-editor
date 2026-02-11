// Create this file: fix-recipe-images.js
const { getAll, runQuery } = require('./db');

async function fixRecipeImages() {
  try {
    console.log('🔧 Checking and fixing recipe_images table...');
    
    // Check if table exists
    console.log('Checking if recipe_images table exists...');
    const tableExists = await getAll(`SELECT name FROM sqlite_master WHERE type='table' AND name='recipe_images'`);
    console.log('Table exists:', tableExists.length > 0);
    
    if (tableExists && tableExists.length > 0) {
      console.log('✅ recipe_images table exists');
      
      // Get current structure
      try {
        const columns = await getAll(`PRAGMA table_info(recipe_images)`);
        console.log('Current table structure:');
        columns.forEach(col => {
          console.log(`  - ${col.name}: ${col.type} ${col.notnull ? 'NOT NULL' : 'NULL'}`);
        });
        
        // Check if image_path is nullable
        const imagePathColumn = columns.find(col => col.name === 'image_path');
        
        if (!imagePathColumn) {
          console.log('❌ image_path column does not exist, table needs to be recreated');
          
          // Drop and recreate table
          console.log('🔄 Dropping and recreating table...');
          await runQuery(`DROP TABLE recipe_images`);
          await createTable();
          
        } else if (imagePathColumn.notnull === 1) {
          console.log('⚠️ image_path column is NOT NULL, needs to be fixed');
          
          // Recreate table with nullable image_path
          console.log('🔄 Recreating table with nullable image_path...');
          
          // Backup existing data
          const existingData = await getAll(`SELECT * FROM recipe_images`);
          console.log(`Found ${existingData.length} existing records to preserve`);
          
          // Drop old table
          await runQuery(`DROP TABLE recipe_images`);
          
          // Create new table
          await createTable();
          
          // Restore data (only if we have any)
          if (existingData.length > 0) {
            console.log('Restoring existing data...');
            for (const row of existingData) {
              try {
                await runQuery(`
                  INSERT INTO recipe_images (id, recipe_id, prompt, image_path, status, created_at)
                  VALUES (?, ?, ?, ?, ?, ?)
                `, [
                  row.id,
                  row.recipe_id,
                  row.prompt,
                  row.image_path,
                  row.status || 'pending',
                  row.created_at
                ]);
              } catch (insertError) {
                console.warn(`Failed to restore record ${row.id}:`, insertError.message);
              }
            }
            console.log('✅ Data restoration completed');
          }
          
        } else {
          console.log('✅ image_path column is already nullable - no changes needed!');
          return true;
        }
        
      } catch (pragmaError) {
        console.error('Error getting table info:', pragmaError);
        console.log('🔄 Recreating table due to structure issues...');
        
        try {
          await runQuery(`DROP TABLE recipe_images`);
        } catch (dropError) {
          console.log('Table drop failed (might not exist)');
        }
        
        await createTable();
      }
      
    } else {
      console.log('📝 recipe_images table does not exist, creating it...');
      await createTable();
    }
    
    // Verify final structure
    console.log('🔍 Verifying final table structure...');
    const finalColumns = await getAll(`PRAGMA table_info(recipe_images)`);
    console.log('Final table structure:');
    finalColumns.forEach(col => {
      console.log(`  - ${col.name}: ${col.type} ${col.notnull ? 'NOT NULL' : 'NULL'}`);
    });
    
    return true;
    
  } catch (error) {
    console.error('❌ Error fixing recipe_images table:', error);
    return false;
  }
}

async function createTable() {
  console.log('📝 Creating recipe_images table...');
  
  await runQuery(`
    CREATE TABLE recipe_images (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-a' || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
      recipe_id TEXT NOT NULL,
      prompt TEXT,
      image_path TEXT, -- Nullable
      status TEXT DEFAULT 'pending',
      error TEXT,
      filter_changes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE
    )
  `);
  
  console.log('✅ Created recipe_images table with nullable image_path!');
}

// Run if called directly
if (require.main === module) {
  fixRecipeImages()
    .then(success => {
      if (success) {
        console.log('✅ Recipe images table fix completed successfully!');
        console.log('You can now restart your server and test Midjourney integration.');
        process.exit(0);
      } else {
        console.log('❌ Recipe images table fix failed');
        process.exit(1);
      }
    })
    .catch(error => {
      console.error('Error:', error);
      process.exit(1);
    });
}