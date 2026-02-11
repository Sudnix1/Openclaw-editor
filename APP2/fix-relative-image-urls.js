// fix-relative-image-urls.js
// Run this script once to fix existing relative URLs in your database

const { getAll, runQuery } = require('./db');
require('dotenv').config();

async function fixRelativeImageUrls() {
  try {
    const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
    console.log(`🔧 Using base URL: ${baseUrl}`);
    
    // Get all keywords with relative image URLs
    const keywords = await getAll(
      "SELECT id, image_url FROM keywords WHERE image_url LIKE '/recipe_images/%'"
    );
    
    console.log(`📋 Found ${keywords.length} keywords with relative image URLs`);
    
    // Update each keyword with full URL
    for (const keyword of keywords) {
      const fullUrl = `${baseUrl}${keyword.image_url}`;
      
      await runQuery(
        "UPDATE keywords SET image_url = ? WHERE id = ?",
        [fullUrl, keyword.id]
      );
      
      console.log(`✅ Updated keyword ${keyword.id}: ${keyword.image_url} → ${fullUrl}`);
    }
    
    // Also check facebook_content table if mj_prompt contains relative paths
    const fbContent = await getAll(
      "SELECT id, mj_prompt FROM facebook_content WHERE mj_prompt LIKE '/recipe_images/%'"
    );
    
    console.log(`📋 Found ${fbContent.length} facebook_content entries with relative paths in prompts`);
    
    for (const content of fbContent) {
      // Replace relative paths in the prompt
      let updatedPrompt = content.mj_prompt;
      const match = updatedPrompt.match(/\/recipe_images\/[^\s]+/);
      
      if (match) {
        const relativePath = match[0];
        const fullUrl = `${baseUrl}${relativePath}`;
        updatedPrompt = updatedPrompt.replace(relativePath, fullUrl);
        
        await runQuery(
          "UPDATE facebook_content SET mj_prompt = ? WHERE id = ?",
          [updatedPrompt, content.id]
        );
        
        console.log(`✅ Updated facebook_content ${content.id} prompt`);
      }
    }
    
    console.log('🎉 All relative URLs have been fixed!');
    
  } catch (error) {
    console.error('❌ Error fixing relative URLs:', error);
    process.exit(1);
  }
}

// Run the fix
fixRelativeImageUrls().then(() => {
  console.log('✅ Script completed');
  process.exit(0);
});