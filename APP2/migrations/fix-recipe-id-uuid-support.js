// Create this file as: migrations/fix-recipe-id-uuid-support.js
// Copy and paste this entire code into the new file

const { runQuery, getOne, getAll } = require('../db');

async function migrateRecipeIdToText() {
  try {
    console.log('🔄 Starting migration to support UUID recipe IDs...');

    // Check current schema
    const tableInfo = await getAll("PRAGMA table_info(image_queue)");
    console.log('📋 Current image_queue schema:', tableInfo);

    const recipeIdColumn = tableInfo.find(col => col.name === 'recipe_id');
    
    if (recipeIdColumn && recipeIdColumn.type === 'TEXT') {
      console.log('✅ Recipe ID column is already TEXT, no migration needed');
      return;
    }

    console.log('🔄 Recipe ID column needs to be updated to TEXT...');

    // Step 1: Create new table with TEXT recipe_id
    await runQuery(`
      CREATE TABLE IF NOT EXISTS image_queue_new (
        id TEXT PRIMARY KEY,
        recipe_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        organization_id TEXT NOT NULL,
        website_id TEXT,
        status TEXT DEFAULT 'queued',
        position INTEGER,
        custom_prompt TEXT,
        discord_settings TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        started_at DATETIME,
        completed_at DATETIME,
        error_message TEXT,
        retry_count INTEGER DEFAULT 0,
        midjourney_queued_count INTEGER DEFAULT 0,
        estimated_completion DATETIME
      )
    `);

    console.log('✅ Created new table with TEXT recipe_id');

    // Step 2: Copy existing data
    const existingData = await getAll("SELECT * FROM image_queue");
    
    if (existingData.length > 0) {
      console.log(`🔄 Copying ${existingData.length} existing records...`);
      
      for (const row of existingData) {
        await runQuery(`
          INSERT INTO image_queue_new (
            id, recipe_id, user_id, organization_id, website_id,
            status, position, custom_prompt, discord_settings,
            created_at, started_at, completed_at, error_message,
            retry_count, midjourney_queued_count, estimated_completion
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          row.id,
          String(row.recipe_id), // Convert to string to support both types
          row.user_id,
          row.organization_id,
          row.website_id,
          row.status,
          row.position,
          row.custom_prompt,
          row.discord_settings,
          row.created_at,
          row.started_at,
          row.completed_at,
          row.error_message,
          row.retry_count || 0,
          row.midjourney_queued_count || 0,
          row.estimated_completion
        ]);
      }
      
      console.log('✅ Copied all existing records');
    }

    // Step 3: Drop old table and rename new one
    await runQuery("DROP TABLE image_queue");
    await runQuery("ALTER TABLE image_queue_new RENAME TO image_queue");

    console.log('✅ Migration completed successfully');

    // Step 4: Verify the migration
    const newTableInfo = await getAll("PRAGMA table_info(image_queue)");
    const newRecipeIdColumn = newTableInfo.find(col => col.name === 'recipe_id');
    
    console.log('📋 New recipe_id column type:', newRecipeIdColumn.type);
    
    if (newRecipeIdColumn.type === 'TEXT') {
      console.log('✅ Migration verification successful - recipe_id is now TEXT');
    } else {
      console.error('❌ Migration verification failed - recipe_id type is still:', newRecipeIdColumn.type);
    }

  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
}

// Run migration if this file is executed directly
if (require.main === module) {
  migrateRecipeIdToText()
    .then(() => {
      console.log('🎉 Migration completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Migration failed:', error);
      process.exit(1);
    });
}

module.exports = { migrateRecipeIdToText };