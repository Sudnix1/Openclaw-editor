// Test script to verify GPT XLSX API endpoint
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./data/recipes.db');

console.log('🔍 Testing GPT XLSX List Query...\n');

db.all(`
  SELECT
    k.id,
    k.keyword,
    k.status,
    k.category,
    k.added_at,
    k.organization_id,
    k.website_id,
    (SELECT COUNT(*) FROM pinterest_variations WHERE recipe_id = k.recipe_id) as pin_count
  FROM keywords k
  WHERE k.pinclicks_source = 'gpt_xlsx'
  ORDER BY k.added_at DESC
`, (err, keywords) => {
  if (err) {
    console.error('❌ Error:', err);
    db.close();
    return;
  }

  console.log(`✅ Found ${keywords.length} GPT XLSX keywords\n`);

  if (keywords.length > 0) {
    console.log('📊 First 5 keywords:');
    keywords.slice(0, 5).forEach((kw, i) => {
      console.log(`  ${i + 1}. ${kw.keyword}`);
      console.log(`     Status: ${kw.status}, Pins: ${kw.pin_count}, Category: ${kw.category}`);
      console.log(`     Org: ${kw.organization_id.substring(0, 8)}..., Website: ${kw.website_id.substring(0, 8)}...`);
      console.log('');
    });

    // Test the exact JSON response format
    const response = {
      success: true,
      keywords
    };
    console.log('📤 API Response Format:');
    console.log(`   success: ${response.success}`);
    console.log(`   keywords.length: ${response.keywords.length}`);
    console.log(`   First keyword: ${JSON.stringify(response.keywords[0], null, 2)}`);
  } else {
    console.log('⚠️ No keywords found');
  }

  db.close();
});
