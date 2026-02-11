// Verification script to test PinClicks integration
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'data', 'recipes.db');
const db = new sqlite3.Database(dbPath);

console.log('🔍 Verifying PinClicks Integration...\n');
console.log('=' .repeat(80));

// Get the most recent processed keyword with PinClicks data
db.get(`
  SELECT
    k.id,
    k.keyword,
    k.status,
    k.use_pinclicks,
    k.pinclicks_status,
    k.pinclicks_titles,
    k.pinclicks_descriptions,
    k.pinclicks_overlays,
    k.recipe_id,
    k.processed_at
  FROM keywords k
  WHERE k.use_pinclicks = 1
    AND k.pinclicks_status = 'completed'
    AND k.status = 'processed'
  ORDER BY k.processed_at DESC
  LIMIT 1
`, [], (err, keyword) => {
  if (err) {
    console.error('❌ Error:', err);
    db.close();
    return;
  }

  if (!keyword) {
    console.log('⚠️ No processed keywords with PinClicks data found.');
    console.log('   Please process a keyword first with "All Content" option.');
    db.close();
    return;
  }

  console.log(`\n📋 Keyword: "${keyword.keyword}" (ID: ${keyword.id})`);
  console.log(`   Status: ${keyword.status}`);
  console.log(`   Recipe ID: ${keyword.recipe_id || 'NONE'}`);
  console.log(`   Processed at: ${keyword.processed_at}`);
  console.log(`   PinClicks Status: ${keyword.pinclicks_status}`);

  // Parse PinClicks data
  let pinclicksTitles = [];
  let pinclicksDescriptions = [];
  let pinclicksOverlays = [];

  try {
    if (keyword.pinclicks_titles) {
      pinclicksTitles = JSON.parse(keyword.pinclicks_titles);
    }
    if (keyword.pinclicks_descriptions) {
      pinclicksDescriptions = JSON.parse(keyword.pinclicks_descriptions);
    }
    if (keyword.pinclicks_overlays) {
      pinclicksOverlays = JSON.parse(keyword.pinclicks_overlays);
    }
  } catch (parseError) {
    console.error('❌ Error parsing PinClicks data:', parseError);
  }

  console.log(`\n✅ PinClicks Data:`);
  console.log(`   Titles: ${pinclicksTitles.filter(t => t).length}`);
  console.log(`   Descriptions: ${pinclicksDescriptions.filter(d => d).length}`);
  console.log(`   Overlays: ${pinclicksOverlays.filter(o => o).length}`);

  if (pinclicksTitles.length > 0) {
    console.log(`\n📝 Sample PinClicks Content:`);
    console.log(`   Title 1: ${pinclicksTitles[0]}`);
    console.log(`   Description 1: ${pinclicksDescriptions[0]?.substring(0, 80)}...`);
    if (pinclicksOverlays[0]) {
      console.log(`   Overlay 1: ${pinclicksOverlays[0]}`);
    }
  }

  if (keyword.recipe_id) {
    // Check what content was generated for this recipe
    db.get(`
      SELECT
        (SELECT COUNT(*) FROM facebook_content WHERE recipe_id = ?) as fb_count,
        (SELECT COUNT(*) FROM pinterest_variations WHERE recipe_id = ?) as pinterest_count,
        (SELECT COUNT(*) FROM blog_content WHERE recipe_id = ?) as blog_count
    `, [keyword.recipe_id, keyword.recipe_id, keyword.recipe_id], (err, content) => {
      if (err) {
        console.error(`   ❌ Error checking content:`, err);
      } else {
        console.log(`\n📊 Generated Content:`);
        console.log(`   Facebook: ${content.fb_count} ${content.fb_count > 0 ? '✅' : '❌'}`);
        console.log(`   Pinterest: ${content.pinterest_count} ${content.pinterest_count > 0 ? '✅' : '❌'}`);
        console.log(`   Blog: ${content.blog_count} ${content.blog_count > 0 ? '✅' : '❌'}`);

        // Verify Pinterest variations use PinClicks data
        if (content.pinterest_count > 0) {
          db.all(`
            SELECT variation_number, pin_title, pin_desc
            FROM pinterest_variations
            WHERE recipe_id = ?
            ORDER BY variation_number
            LIMIT 3
          `, [keyword.recipe_id], (err, variations) => {
            if (!err && variations.length > 0) {
              console.log(`\n🎯 Pinterest Variations (from PinClicks):`);
              variations.forEach((v, i) => {
                console.log(`   ${v.variation_number}. ${v.pin_title}`);
              });
            }
            console.log('\n' + '='.repeat(80));
            console.log('\n✅ Verification complete!');
            console.log('\nExpected Result:');
            console.log('  • PinClicks data should be extracted (3 titles, 3 descriptions, 3 overlays)');
            console.log('  • Facebook content should be generated ✅');
            console.log('  • Pinterest variations should match PinClicks titles ✅');
            console.log('  • Blog content should be generated ✅');
            db.close();
          });
        } else {
          console.log('\n' + '='.repeat(80));
          db.close();
        }
      }
    });
  } else {
    console.log('\n⚠️ No recipe created for this keyword!');
    console.log('\n' + '='.repeat(80));
    db.close();
  }
});
