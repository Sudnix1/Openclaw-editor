// Simple script to find keywords in database
const { getOne, getAll } = require('./db');

async function findKeyword(searchText) {
  console.log(`🔍 Searching for keywords containing: "${searchText}"`);
  
  try {
    // Search all keywords containing the text
    const keywords = await getAll(`
      SELECT id, keyword, status, recipe_id, organization_id, website_id, 
             added_at, processed_at, processing_started_at
      FROM keywords 
      WHERE keyword LIKE ?
      ORDER BY added_at DESC
      LIMIT 20
    `, [`%${searchText}%`]);

    if (keywords.length === 0) {
      console.log(`❌ No keywords found containing "${searchText}"`);
    } else {
      console.log(`✅ Found ${keywords.length} keywords containing "${searchText}":`);
      keywords.forEach((keyword, index) => {
        console.log(`  ${index + 1}. "${keyword.keyword}" (${keyword.id})`);
        console.log(`     Status: ${keyword.status}`);
        console.log(`     Recipe ID: ${keyword.recipe_id || 'None'}`);
        console.log(`     Organization: ${keyword.organization_id}`);
        console.log(`     Website: ${keyword.website_id}`);
        console.log(`     Added: ${keyword.added_at}`);
        console.log(`     Processing started: ${keyword.processing_started_at || 'Not started'}`);
        console.log(`     Processed: ${keyword.processed_at || 'Not processed'}`);
        console.log('');
      });
    }

    // Also search by recipe content
    console.log(`\n🔍 Checking recipes containing "${searchText}":`);
    const recipes = await getAll(`
      SELECT r.id, r.recipe_idea, r.created_at, k.id as keyword_id, k.keyword, k.status
      FROM recipes r
      LEFT JOIN keywords k ON r.id = k.recipe_id
      WHERE r.recipe_idea LIKE ?
      ORDER BY r.created_at DESC
      LIMIT 10
    `, [`%${searchText}%`]);

    if (recipes.length === 0) {
      console.log(`❌ No recipes found containing "${searchText}"`);
    } else {
      console.log(`✅ Found ${recipes.length} recipes containing "${searchText}":`);
      recipes.forEach((recipe, index) => {
        console.log(`  ${index + 1}. Recipe: "${recipe.recipe_idea}" (${recipe.id})`);
        console.log(`     Created: ${recipe.created_at}`);
        if (recipe.keyword_id) {
          console.log(`     Keyword: "${recipe.keyword}" (${recipe.keyword_id}) - Status: ${recipe.status}`);
        } else {
          console.log(`     Keyword: No linked keyword found`);
        }
        console.log('');
      });
    }

    return { keywords, recipes };
  } catch (error) {
    console.error(`❌ Error searching:`, error.message);
  }
}

async function getAllKeywords(limit = 20) {
  console.log(`📋 Getting last ${limit} keywords from database:`);
  
  try {
    const keywords = await getAll(`
      SELECT id, keyword, status, recipe_id, added_at, processed_at
      FROM keywords 
      ORDER BY added_at DESC
      LIMIT ?
    `, [limit]);

    console.log(`✅ Found ${keywords.length} total keywords:`);
    keywords.forEach((keyword, index) => {
      console.log(`  ${index + 1}. "${keyword.keyword}" - ${keyword.status} (${keyword.id})`);
    });

    return keywords;
  } catch (error) {
    console.error(`❌ Error getting keywords:`, error.message);
  }
}

// Command line usage
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args[0] === 'search' && args[1]) {
    findKeyword(args[1]).catch(console.error);
  } else if (args[0] === 'all') {
    const limit = parseInt(args[1]) || 20;
    getAllKeywords(limit).catch(console.error);
  } else {
    console.log('🔍 Keyword Search Tool');
    console.log('Usage:');
    console.log('  node find-keyword.js search <text>    - Search for keywords containing text');
    console.log('  node find-keyword.js all [N]          - Show last N keywords');
  }
}

module.exports = { findKeyword, getAllKeywords };