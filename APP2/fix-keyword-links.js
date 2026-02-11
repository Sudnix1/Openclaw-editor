// fix-keyword-links.js - Fix the keyword-recipe relationship
const { getOne, getAll, runQuery } = require('./db');

async function fixKeywordLinks() {
  console.log('🔧 FIXING KEYWORD-RECIPE LINKS');
  console.log('='.repeat(50));

  try {
    // 1. Fix the specific problematic keyword first
    const problematicKeyword = '8bdcf468-19c0-44ac-84d2-1f08d396e3d3';
    const targetRecipe = '9ee0cd1c-95bc-4d3e-bafa-1e20f5855ef3';
    
    console.log(`\n🎯 Fixing specific keyword: ${problematicKeyword}`);
    console.log(`🎯 Linking to recipe: ${targetRecipe}`);
    
    const updateResult = await runQuery(
      `UPDATE keywords SET recipe_id = ? WHERE id = ?`,
      [targetRecipe, problematicKeyword]
    );
    
    console.log(`✅ Updated ${updateResult.changes} keyword(s)`);
    
    // Verify the fix
    const verifyKeyword = await getOne(`SELECT * FROM keywords WHERE id = ?`, [problematicKeyword]);
    if (verifyKeyword && verifyKeyword.recipe_id === targetRecipe) {
      console.log(`✅ Verification successful: Keyword now linked to recipe`);
    } else {
      console.log(`❌ Verification failed: Keyword still not linked properly`);
    }

    // 2. Find other unlinked keywords that could be linked
    console.log(`\n🔍 Finding other unlinked keywords that could be matched...`);
    
    const unlinkedKeywords = await getAll(`
      SELECT k.*, r.id as potential_recipe_id, r.recipe_idea
      FROM keywords k
      LEFT JOIN recipes r ON LOWER(TRIM(k.keyword)) = LOWER(TRIM(r.recipe_idea))
      WHERE k.recipe_id IS NULL 
      AND r.id IS NOT NULL
      ORDER BY k.added_at DESC
      LIMIT 20
    `);
    
    console.log(`Found ${unlinkedKeywords.length} keywords that could be auto-linked:`);
    
    let autoLinked = 0;
    for (const item of unlinkedKeywords) {
      console.log(`\n--- Potential Match ---`);
      console.log(`Keyword: "${item.keyword}" (ID: ${item.id})`);
      console.log(`Recipe: "${item.recipe_idea}" (ID: ${item.potential_recipe_id})`);
      console.log(`Has Image URL: ${item.image_url ? 'YES' : 'NO'}`);
      
      // Auto-link if names match closely
      const keywordClean = item.keyword.toLowerCase().trim();
      const recipeClean = item.recipe_idea.toLowerCase().trim();
      
      if (keywordClean === recipeClean) {
        console.log(`🔗 Auto-linking (exact match)...`);
        
        await runQuery(
          `UPDATE keywords SET recipe_id = ? WHERE id = ?`,
          [item.potential_recipe_id, item.id]
        );
        
        autoLinked++;
        console.log(`✅ Linked keyword ${item.id} to recipe ${item.potential_recipe_id}`);
      } else {
        console.log(`⏭️ Skipping (not exact match)`);
      }
    }
    
    console.log(`\n📊 Auto-linked ${autoLinked} additional keywords`);

    // 3. Show summary of current state
    console.log(`\n📊 CURRENT DATABASE STATE:`);
    console.log('-'.repeat(30));
    
    const totalKeywords = await getOne(`SELECT COUNT(*) as count FROM keywords`);
    const linkedKeywords = await getOne(`SELECT COUNT(*) as count FROM keywords WHERE recipe_id IS NOT NULL`);
    const keywordsWithImages = await getOne(`SELECT COUNT(*) as count FROM keywords WHERE image_url IS NOT NULL`);
    const linkedKeywordsWithImages = await getOne(`
      SELECT COUNT(*) as count FROM keywords 
      WHERE recipe_id IS NOT NULL AND image_url IS NOT NULL
    `);
    
    console.log(`Total keywords: ${totalKeywords.count}`);
    console.log(`Linked keywords: ${linkedKeywords.count}`);
    console.log(`Keywords with images: ${keywordsWithImages.count}`);
    console.log(`Linked keywords with images: ${linkedKeywordsWithImages.count}`);
    
    // 4. Test the specific lookup that was failing
    console.log(`\n🧪 TESTING THE FIXED LOOKUP:`);
    console.log('-'.repeat(30));
    
    const testRecipeId = '9ee0cd1c-95bc-4d3e-bafa-1e20f5855ef3';
    const testKeyword = await getOne(
      "SELECT * FROM keywords WHERE recipe_id = ? ORDER BY added_at DESC LIMIT 1", 
      [testRecipeId]
    );
    
    if (testKeyword) {
      console.log(`✅ SUCCESS: Found keyword for recipe ${testRecipeId}`);
      console.log(`   Keyword: "${testKeyword.keyword}"`);
      console.log(`   Has Image URL: ${testKeyword.image_url ? 'YES' : 'NO'}`);
      if (testKeyword.image_url) {
        console.log(`   Image URL: ${testKeyword.image_url.substring(0, 80)}...`);
      }
    } else {
      console.log(`❌ STILL FAILING: No keyword found for recipe ${testRecipeId}`);
    }
    
    console.log(`\n✅ Keyword link fixing completed!`);
    
  } catch (error) {
    console.error('❌ Error fixing keyword links:', error.message);
    console.error('Full error:', error);
  }
}

// Run the fix
fixKeywordLinks().then(() => {
  console.log('\n🎉 Keyword linking process completed!');
  process.exit(0);
}).catch(error => {
  console.error('❌ Failed to fix keyword links:', error);
  process.exit(1);
});