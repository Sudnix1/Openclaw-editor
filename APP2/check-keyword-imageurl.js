// check-keyword-imageurl.js
const { getOne, getAll, runQuery } = require('./db');
const keywordsDb = require('./db'); // Adjust path if your keywords functions are elsewhere

async function checkKeywordImageUrl() {
  console.log('🔍 Checking keyword imageurl configuration...\n');

  try {
    // 1. Check if keywords table has imageurl column
    console.log('1️⃣ Checking keywords table schema...');
    const tableInfo = await getAll("PRAGMA table_info(keywords)");
    const hasImageUrlColumn = tableInfo.some(col => col.name === 'imageurl');
    
    console.log('Keywords table columns:');
    tableInfo.forEach(col => {
      console.log(`  - ${col.name} (${col.type})${col.name === 'imageurl' ? ' ✅' : ''}`);
    });
    
    if (!hasImageUrlColumn) {
      console.log('\n❌ WARNING: keywords table does not have imageurl column!');
      console.log('Run this SQL to add it:');
      console.log('ALTER TABLE keywords ADD COLUMN imageurl TEXT;');
    } else {
      console.log('\n✅ keywords table has imageurl column');
    }

    // 2. Get a sample keyword with all fields
    console.log('\n2️⃣ Testing keyword retrieval...');
    const sampleKeyword = await getOne("SELECT * FROM keywords LIMIT 1");
    
    if (sampleKeyword) {
      console.log('\nSample keyword fields:');
      Object.keys(sampleKeyword).forEach(key => {
        const value = sampleKeyword[key];
        console.log(`  - ${key}: ${value ? (typeof value === 'string' && value.length > 50 ? value.substring(0, 50) + '...' : value) : 'null'}`);
      });
      
      if ('imageurl' in sampleKeyword) {
        console.log('\n✅ imageurl field is included in query results');
      } else {
        console.log('\n❌ imageurl field is NOT included in query results');
      }
    } else {
      console.log('No keywords found in database');
    }

    // 3. Test getKeywordsByIds function if it exists
    console.log('\n3️⃣ Testing getKeywordsByIds function...');
    if (keywordsDb.getKeywordsByIds) {
      // Get any keyword ID for testing
      const testKeyword = await getOne("SELECT id FROM keywords WHERE imageurl IS NOT NULL LIMIT 1");
      
      if (testKeyword) {
        const keywords = await keywordsDb.getKeywordsByIds([testKeyword.id]);
        
        if (keywords && keywords.length > 0) {
          console.log('\nFields returned by getKeywordsByIds:');
          Object.keys(keywords[0]).forEach(key => {
            console.log(`  - ${key}`);
          });
          
          if ('imageurl' in keywords[0]) {
            console.log('\n✅ getKeywordsByIds includes imageurl field');
            if (keywords[0].imageurl) {
              console.log(`   Image URL: ${keywords[0].imageurl}`);
            }
          } else {
            console.log('\n❌ getKeywordsByIds does NOT include imageurl field');
            console.log('   You need to update the SELECT statement in getKeywordsByIds to include imageurl');
          }
        }
      } else {
        console.log('No keywords with imageurl found for testing');
      }
    } else {
      console.log('getKeywordsByIds function not found in keywordsDb module');
    }

    // 4. Check for keywords that have imageurl set
    console.log('\n4️⃣ Checking keywords with imageurl...');
    const keywordsWithImage = await getOne(
      "SELECT COUNT(*) as count FROM keywords WHERE imageurl IS NOT NULL AND imageurl != ''"
    );
    console.log(`Keywords with imageurl: ${keywordsWithImage.count}`);

    // 5. Show a sample keyword with imageurl
    if (keywordsWithImage.count > 0) {
      const sampleWithImage = await getOne(
        "SELECT id, keyword, imageurl FROM keywords WHERE imageurl IS NOT NULL AND imageurl != '' LIMIT 1"
      );
      console.log('\nSample keyword with imageurl:');
      console.log(`  ID: ${sampleWithImage.id}`);
      console.log(`  Keyword: ${sampleWithImage.keyword}`);
      console.log(`  Image URL: ${sampleWithImage.imageurl}`);
    }

  } catch (error) {
    console.error('❌ Error during check:', error);
  }
}

// Run the check
checkKeywordImageUrl().then(() => {
  console.log('\n✅ Check complete');
  process.exit(0);
}).catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});