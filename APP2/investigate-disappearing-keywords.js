// Script to investigate why keywords are disappearing
const { getOne, getAll, runQuery } = require('./db');

async function investigateKeyword(keywordId) {
  console.log(`🔍 Investigating keyword: ${keywordId}`);
  
  try {
    // Check if keyword exists in database
    const keyword = await getOne(`
      SELECT id, keyword, status, recipe_id, processed_at, 
             processing_started_at, organization_id, website_id,
             owner_id, added_at
      FROM keywords 
      WHERE id = ?
    `, [keywordId]);

    if (!keyword) {
      console.log(`❌ Keyword ${keywordId} NOT FOUND in database`);
      
      // Check if it was deleted (if we have deletion logs)
      console.log(`🔍 Checking for any traces...`);
      
      // Check recipes table to see if recipe still exists
      console.log(`🔍 Checking if any recipe might be related...`);
      const recipes = await getAll(`
        SELECT id, recipe_idea, created_at 
        FROM recipes 
        WHERE created_at > datetime('now', '-1 hour')
        ORDER BY created_at DESC
        LIMIT 10
      `);
      
      console.log(`📋 Recent recipes (last hour):`);
      recipes.forEach((recipe, index) => {
        console.log(`  ${index + 1}. "${recipe.recipe_idea}" (${recipe.id}) at ${recipe.created_at}`);
      });
      
      return false;
    }

    console.log(`✅ Keyword found in database:`);
    console.log(`   ID: ${keyword.id}`);
    console.log(`   Keyword: "${keyword.keyword}"`);
    console.log(`   Status: ${keyword.status}`);
    console.log(`   Recipe ID: ${keyword.recipe_id || 'None'}`);
    console.log(`   Organization: ${keyword.organization_id}`);
    console.log(`   Website: ${keyword.website_id}`);
    console.log(`   Owner: ${keyword.owner_id}`);
    console.log(`   Added: ${keyword.added_at}`);
    console.log(`   Processing started: ${keyword.processing_started_at || 'Not started'}`);
    console.log(`   Processed: ${keyword.processed_at || 'Not processed'}`);

    // Check if recipe exists
    if (keyword.recipe_id) {
      const recipe = await getOne(`
        SELECT id, recipe_idea, created_at 
        FROM recipes 
        WHERE id = ?
      `, [keyword.recipe_id]);

      if (recipe) {
        console.log(`✅ Related recipe found: "${recipe.recipe_idea}" (${recipe.id})`);
        
        // Check recipe images
        const images = await getAll(`
          SELECT id, status, created_at, updated_at, image_path
          FROM recipe_images 
          WHERE recipe_id = ?
          ORDER BY created_at DESC
        `, [keyword.recipe_id]);

        console.log(`📸 Recipe images (${images.length}):`);
        images.forEach((img, index) => {
          console.log(`  ${index + 1}. Status: ${img.status}, Created: ${img.created_at}, Path: ${img.image_path || 'None'}`);
        });
      } else {
        console.log(`❌ Related recipe NOT FOUND: ${keyword.recipe_id}`);
      }
    }

    return keyword;
  } catch (error) {
    console.error(`❌ Error investigating keyword:`, error.message);
    return null;
  }
}

async function checkDatabaseTriggers() {
  console.log(`🔍 Checking database triggers...`);
  
  try {
    const triggers = await getAll(`
      SELECT name, sql 
      FROM sqlite_master 
      WHERE type='trigger' AND name LIKE '%keyword%'
    `);

    if (triggers.length === 0) {
      console.log(`❌ No keyword-related triggers found!`);
    } else {
      console.log(`✅ Found ${triggers.length} keyword triggers:`);
      triggers.forEach((trigger, index) => {
        console.log(`  ${index + 1}. ${trigger.name}`);
        console.log(`     SQL: ${trigger.sql.substring(0, 100)}...`);
      });
    }

    // Check if log table exists
    const logTable = await getOne(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name='keyword_status_log'
    `);

    if (logTable) {
      console.log(`✅ keyword_status_log table exists`);
      
      const logCount = await getOne(`SELECT COUNT(*) as count FROM keyword_status_log`);
      console.log(`📊 Status log entries: ${logCount.count}`);
      
      if (logCount.count > 0) {
        const recentLogs = await getAll(`
          SELECT * FROM keyword_status_log 
          ORDER BY changed_at DESC 
          LIMIT 5
        `);
        
        console.log(`📋 Recent status changes:`);
        recentLogs.forEach((log, index) => {
          console.log(`  ${index + 1}. ${log.keyword_id}: ${log.old_status} → ${log.new_status} at ${log.changed_at}`);
        });
      }
    } else {
      console.log(`❌ keyword_status_log table NOT FOUND`);
    }

  } catch (error) {
    console.error(`❌ Error checking triggers:`, error.message);
  }
}

async function testStatusUpdate() {
  console.log(`🧪 Testing status update and trigger...`);
  
  try {
    // Find a test keyword
    const testKeyword = await getOne(`
      SELECT id, status FROM keywords 
      WHERE status = 'pending' 
      LIMIT 1
    `);

    if (!testKeyword) {
      console.log(`❌ No pending keywords found for testing`);
      return;
    }

    console.log(`🎯 Testing with keyword: ${testKeyword.id} (current status: ${testKeyword.status})`);

    // Update status temporarily
    await runQuery(`
      UPDATE keywords 
      SET status = 'test_status' 
      WHERE id = ?
    `, [testKeyword.id]);

    console.log(`✅ Updated status to 'test_status'`);

    // Check if trigger logged it
    const logEntry = await getOne(`
      SELECT * FROM keyword_status_log 
      WHERE keyword_id = ? AND new_status = 'test_status'
      ORDER BY changed_at DESC 
      LIMIT 1
    `, [testKeyword.id]);

    if (logEntry) {
      console.log(`✅ Trigger worked! Logged: ${logEntry.old_status} → ${logEntry.new_status}`);
    } else {
      console.log(`❌ Trigger NOT working - no log entry found`);
    }

    // Restore original status
    await runQuery(`
      UPDATE keywords 
      SET status = ? 
      WHERE id = ?
    `, [testKeyword.status, testKeyword.id]);

    console.log(`✅ Restored original status: ${testKeyword.status}`);

  } catch (error) {
    console.error(`❌ Error testing status update:`, error.message);
  }
}

// Command line usage
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args[0] === 'investigate' && args[1]) {
    investigateKeyword(args[1]).catch(console.error);
  } else if (args[0] === 'triggers') {
    checkDatabaseTriggers().catch(console.error);
  } else if (args[0] === 'test') {
    testStatusUpdate().catch(console.error);
  } else {
    console.log('🔍 Keyword Investigation Tool');
    console.log('Usage:');
    console.log('  node investigate-disappearing-keywords.js investigate <keyword-id>');
    console.log('  node investigate-disappearing-keywords.js triggers');
    console.log('  node investigate-disappearing-keywords.js test');
  }
}

module.exports = {
  investigateKeyword,
  checkDatabaseTriggers,
  testStatusUpdate
};