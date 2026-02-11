// Create this file as 'fix-pending-keywords.js' and run it immediately

const { runQuery, getOne, getAll } = require('./db');

async function fixPendingKeywords() {
  try {
    console.log('🔧 [FIX] Starting immediate fix for pending keywords...');
    
    // Get all keywords that are marked as 'pending' but have recipe_id
    const stuckKeywords = await getAll(`
      SELECT 
        k.id, 
        k.keyword, 
        k.status, 
        k.recipe_id, 
        k.website_id,
        k.organization_id,
        r.id as recipe_exists,
        fb.id as facebook_content_exists,
        pv.id as pinterest_content_exists
      FROM keywords k
      LEFT JOIN recipes r ON k.recipe_id = r.id
      LEFT JOIN facebook_content fb ON k.recipe_id = fb.recipe_id
      LEFT JOIN pinterest_variations pv ON k.recipe_id = pv.recipe_id
      WHERE k.status = 'pending' 
        AND k.recipe_id IS NOT NULL
      ORDER BY k.added_at DESC
    `);
    
    console.log(`📊 [FIX] Found ${stuckKeywords.length} keywords with 'pending' status but have recipe_id`);
    
    if (stuckKeywords.length === 0) {
      console.log('✅ [FIX] No stuck keywords found - all statuses are correct!');
      return;
    }
    
    // Show details of stuck keywords
    console.log('\n📋 [FIX] Stuck keywords details:');
    stuckKeywords.forEach(keyword => {
      console.log(`  - ${keyword.keyword} (ID: ${keyword.id})`);
      console.log(`    Recipe: ${keyword.recipe_exists ? '✅' : '❌'}`);
      console.log(`    Facebook: ${keyword.facebook_content_exists ? '✅' : '❌'}`);
      console.log(`    Pinterest: ${keyword.pinterest_content_exists ? '✅' : '❌'}`);
      console.log(`    Website ID: ${keyword.website_id}`);
      console.log('');
    });
    
    let fixedCount = 0;
    let failedCount = 0;
    
    console.log('🔄 [FIX] Starting to fix keyword statuses...\n');
    
    for (const keyword of stuckKeywords) {
      try {
        // Check if keyword has content
        const hasContent = keyword.recipe_exists && 
                          (keyword.facebook_content_exists || keyword.pinterest_content_exists);
        
        if (hasContent) {
          console.log(`✅ [FIX] Keyword "${keyword.keyword}" has content - updating to PROCESSED`);
          
          // Update status to processed - try with direct SQL first
          const result = await runQuery(`
            UPDATE keywords 
            SET status = 'processed', 
                processed_at = CURRENT_TIMESTAMP 
            WHERE id = ?
          `, [keyword.id]);
          
          if (result.changes > 0) {
            fixedCount++;
            console.log(`    ✅ Successfully updated keyword ${keyword.id}`);
            
            // Verify the update
            const verify = await getOne(`SELECT status FROM keywords WHERE id = ?`, [keyword.id]);
            console.log(`    🔍 Verification: Status is now '${verify.status}'`);
          } else {
            failedCount++;
            console.log(`    ❌ Failed to update keyword ${keyword.id} - no rows affected`);
          }
        } else {
          console.log(`⚠️ [FIX] Keyword "${keyword.keyword}" has recipe_id but no content - updating to FAILED`);
          
          const result = await runQuery(`
            UPDATE keywords 
            SET status = 'failed', 
                processed_at = CURRENT_TIMESTAMP 
            WHERE id = ?
          `, [keyword.id]);
          
          if (result.changes > 0) {
            fixedCount++;
            console.log(`    ✅ Updated keyword ${keyword.id} to FAILED`);
          } else {
            failedCount++;
            console.log(`    ❌ Failed to update keyword ${keyword.id}`);
          }
        }
        
      } catch (error) {
        failedCount++;
        console.error(`❌ [FIX] Error processing keyword ${keyword.id}:`, error.message);
      }
    }
    
    console.log('\n📊 [FIX] Summary:');
    console.log(`  ✅ Successfully fixed: ${fixedCount}`);
    console.log(`  ❌ Failed to fix: ${failedCount}`);
    console.log(`  📝 Total processed: ${stuckKeywords.length}`);
    
    // Final verification
    const remainingStuck = await getAll(`
      SELECT COUNT(*) as count
      FROM keywords k
      WHERE k.status = 'pending' 
        AND k.recipe_id IS NOT NULL
    `);
    
    console.log(`\n🔍 [FIX] Remaining stuck keywords: ${remainingStuck[0]?.count || 0}`);
    
    if (remainingStuck[0]?.count === 0) {
      console.log('🎉 [FIX] All keyword statuses are now correct!');
    }
    
  } catch (error) {
    console.error('❌ [FIX] Critical error in fix script:', error);
    throw error;
  }
}

// Also create a function to check current status
async function checkKeywordStatus() {
  try {
    console.log('\n📊 [CHECK] Current keyword status summary:');
    
    const statusSummary = await getAll(`
      SELECT 
        status,
        COUNT(*) as count,
        COUNT(CASE WHEN recipe_id IS NOT NULL THEN 1 END) as with_recipe
      FROM keywords 
      GROUP BY status
      ORDER BY count DESC
    `);
    
    statusSummary.forEach(row => {
      console.log(`  ${row.status.toUpperCase()}: ${row.count} total (${row.with_recipe} with recipe_id)`);
    });
    
    // Check for problematic cases
    const problems = await getAll(`
      SELECT 
        'pending_with_recipe' as issue,
        COUNT(*) as count
      FROM keywords 
      WHERE status = 'pending' AND recipe_id IS NOT NULL
      
      UNION ALL
      
      SELECT 
        'processed_without_recipe' as issue,
        COUNT(*) as count
      FROM keywords 
      WHERE status = 'processed' AND recipe_id IS NULL
    `);
    
    console.log('\n⚠️ [CHECK] Potential issues:');
    problems.forEach(problem => {
      if (problem.count > 0) {
        console.log(`  ${problem.issue}: ${problem.count} keywords`);
      }
    });
    
  } catch (error) {
    console.error('❌ [CHECK] Error checking status:', error);
  }
}

// Run both check and fix
async function main() {
  try {
    await checkKeywordStatus();
    console.log('\n' + '='.repeat(50));
    await fixPendingKeywords();
    console.log('\n' + '='.repeat(50));
    await checkKeywordStatus();
    
    console.log('\n✅ [COMPLETE] Fix script completed successfully!');
    console.log('💡 [TIP] Refresh your browser to see the updated statuses');
    
  } catch (error) {
    console.error('❌ [COMPLETE] Fix script failed:', error);
    process.exit(1);
  }
}

// Run the script
if (require.main === module) {
  main().then(() => {
    console.log('\n🎯 [EXIT] Script finished - you can now refresh your browser');
    process.exit(0);
  }).catch(error => {
    console.error('❌ [EXIT] Script failed:', error);
    process.exit(1);
  });
}

module.exports = { fixPendingKeywords, checkKeywordStatus };