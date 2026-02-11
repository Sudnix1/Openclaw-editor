// Reset GPT XLSX keywords to pending status so they can be reprocessed
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./data/recipes.db');

console.log('🔄 Resetting GPT XLSX keywords to pending status...\n');

// Find all GPT XLSX keywords that are marked as processed but have no content
db.all(`
  SELECT
    k.id,
    k.keyword,
    k.status,
    k.recipe_id,
    (SELECT COUNT(*) FROM blog_content WHERE recipe_id = k.recipe_id) as blog_count,
    (SELECT COUNT(*) FROM pinterest_variations WHERE recipe_id = k.recipe_id AND image_url IS NOT NULL) as image_count
  FROM keywords k
  WHERE k.pinclicks_source = 'gpt_xlsx'
    AND k.status = 'processed'
`, async (err, keywords) => {
  if (err) {
    console.error('❌ Error:', err);
    db.close();
    return;
  }

  console.log(`Found ${keywords.length} GPT XLSX keywords with 'processed' status\n`);

  let resetCount = 0;
  let skippedCount = 0;

  for (const kw of keywords) {
    // Check if keyword actually has content
    const hasContent = kw.blog_count > 0 && kw.image_count > 0;

    if (!hasContent) {
      // Reset to pending
      db.run(
        `UPDATE keywords SET status = 'pending', processed_at = NULL WHERE id = ?`,
        [kw.id],
        (updateErr) => {
          if (updateErr) {
            console.error(`❌ Error resetting ${kw.keyword}:`, updateErr);
          } else {
            console.log(`✅ Reset: ${kw.keyword} (had ${kw.blog_count} blogs, ${kw.image_count} images)`);
            resetCount++;
          }
        }
      );
    } else {
      console.log(`⏭️  Skip: ${kw.keyword} (already has content: ${kw.blog_count} blogs, ${kw.image_count} images)`);
      skippedCount++;
    }
  }

  // Wait a bit for all updates to complete
  setTimeout(() => {
    console.log(`\n✅ Reset ${resetCount} keywords to pending status`);
    console.log(`⏭️  Skipped ${skippedCount} keywords that already have content`);
    console.log('\nYou can now process these keywords again with the fixed code!');
    db.close();
  }, 1000);
});
