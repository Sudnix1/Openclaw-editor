const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./data/recipes.db');

// Get the most recent WordPress publication attempt
db.all(`
  SELECT
    wp.recipe_id,
    wp.wp_post_url,
    wp.wp_status,
    wp.created_at,
    k.keyword
  FROM wordpress_publications wp
  LEFT JOIN keywords k ON wp.recipe_id = k.id
  ORDER BY wp.created_at DESC
  LIMIT 5
`, (err, pubs) => {
  if (err) {
    console.error('Error:', err);
    db.close();
    return;
  }

  console.log('=== Recent WordPress Publications ===\n');
  pubs.forEach((pub, idx) => {
    console.log(`${idx + 1}. Recipe: ${pub.keyword || 'NOT FOUND'}`);
    console.log(`   Recipe ID: ${pub.recipe_id}`);
    console.log(`   Status: ${pub.wp_status}`);
    console.log(`   URL: ${pub.wp_post_url}`);
    console.log(`   Published: ${pub.created_at}`);
    console.log('');
  });

  // Check if the recipe exists in keywords table
  if (pubs[0]) {
    const recipeId = pubs[0].recipe_id;

    db.get('SELECT id, keyword, status FROM keywords WHERE id = ?', [recipeId], (err, recipe) => {
      console.log('=== Most Recent Publication Details ===');
      console.log('Recipe exists in keywords:', recipe ? 'YES' : 'NO');

      if (recipe) {
        console.log('Recipe name:', recipe.keyword);
        console.log('Recipe status:', recipe.status);

        // Check for Pinterest images
        db.all('SELECT id, keyword, filename FROM pinterest_images WHERE recipe_id = ?', [recipeId], (err, imgs) => {
          console.log('Pinterest images:', imgs ? imgs.length : 0);

          if (imgs && imgs.length > 0) {
            imgs.forEach((img, idx) => {
              console.log(`  ${idx + 1}. ${img.keyword} - ${img.filename}`);
            });
          }

          // Check for blog content
          db.get('SELECT canva_image_url FROM blog_content WHERE recipe_id = ?', [recipeId], (err, blog) => {
            console.log('Has blog content:', blog ? 'YES' : 'NO');
            console.log('Has Canva image:', blog && blog.canva_image_url ? 'YES' : 'NO');
            db.close();
          });
        });
      } else {
        db.close();
      }
    });
  } else {
    console.log('No publications found');
    db.close();
  }
});
