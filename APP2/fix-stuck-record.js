// Create fix-stuck-record.js in your project root
// Run with: node fix-stuck-record.js

const { runQuery, getOne, getAll } = require('./db');
const fs = require('fs');
const path = require('path');

const RECIPE_ID = 'f79d20b0-0742-4957-b028-35fc57973d62';
const STUCK_IMAGE_ID = '342b1094-34a9-426a-af12-e3cd97599fec';

async function fixStuckRecord() {
  console.log('🔧 Fixing stuck recipe image record...\n');
  
  try {
    // 1. Check current status
    console.log('1. Checking current status...');
    const currentRecord = await getOne(
      "SELECT * FROM recipe_images WHERE id = ?",
      [STUCK_IMAGE_ID]
    );
    
    if (!currentRecord) {
      console.log('❌ Record not found!');
      return;
    }
    
    console.log('Current record:', {
      id: currentRecord.id,
      status: currentRecord.status,
      image_path: currentRecord.image_path,
      created_at: currentRecord.created_at
    });
    
    // 2. Check if there's an actual image file that matches this recipe
    console.log('\n2. Looking for existing image files...');
    const recipeImagesDir = path.join(__dirname, 'recipe_images');
    
    if (fs.existsSync(recipeImagesDir)) {
      const files = fs.readdirSync(recipeImagesDir);
      
      // Look for files that might belong to this recipe
      const possibleFiles = files.filter(file => {
        // Look for files with recipe ID in name or recent grid files
        return file.includes(RECIPE_ID) || 
               (file.startsWith('grid_') && file.includes('1748057509323'));
      });
      
      console.log('Found possible image files:', possibleFiles);
      
      if (possibleFiles.length > 0) {
        // Use the first matching file
        const imageFile = possibleFiles[0];
        console.log(`✅ Found matching image file: ${imageFile}`);
        
        // Update the record to completed status
        console.log('\n3. Updating record to completed status...');
        
        const updateResult = await runQuery(
          "UPDATE recipe_images SET status = 'completed', image_path = ?, error = NULL WHERE id = ?",
          [imageFile, STUCK_IMAGE_ID]
        );
        
        console.log('Update result:', updateResult);
        
        // Verify the update
        const verifyRecord = await getOne(
          "SELECT * FROM recipe_images WHERE id = ?",
          [STUCK_IMAGE_ID]
        );
        
        console.log('\nVerified updated record:', {
          id: verifyRecord.id,
          status: verifyRecord.status,
          image_path: verifyRecord.image_path
        });
        
        if (verifyRecord.status === 'completed') {
          console.log('\n✅ SUCCESS: Record has been fixed!');
          console.log('🌐 Image should now be available at: /recipe_images/' + imageFile);
        } else {
          console.log('\n❌ UPDATE FAILED: Status still not completed');
        }
        
      } else {
        console.log('❌ No matching image files found');
        console.log('\nAvailable files in recipe_images directory:');
        files.slice(0, 10).forEach(file => console.log(`   - ${file}`));
        
        // Mark as failed since no image exists
        console.log('\n3. Marking as failed (no image file found)...');
        await runQuery(
          "UPDATE recipe_images SET status = 'failed', error = 'No image file found after generation timeout' WHERE id = ?",
          [STUCK_IMAGE_ID]
        );
        
        console.log('✅ Record marked as failed');
      }
    } else {
      console.log('❌ recipe_images directory does not exist!');
    }
    
    // 4. Final verification
    console.log('\n4. Final status check...');
    const finalRecord = await getOne(
      "SELECT id, status, image_path, error FROM recipe_images WHERE id = ?",
      [STUCK_IMAGE_ID]
    );
    
    console.log('Final record status:', finalRecord);
    
  } catch (error) {
    console.error('❌ Error fixing stuck record:', error);
  }
}

// Run the fix
fixStuckRecord().then(() => {
  console.log('\n🏁 Fix attempt complete');
  process.exit(0);
}).catch(error => {
  console.error('❌ Fix failed:', error);
  process.exit(1);
});