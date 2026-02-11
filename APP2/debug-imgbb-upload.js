// debug-imgbb-upload.js - Debug ImgBB upload issues
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');

async function debugImgBBUpload() {
  console.log('🔍 DEBUGGING IMGBB UPLOAD ISSUE');
  console.log('='.repeat(50));
  
  try {
    // Test with the specific image URL from your logs
    const testImageUrl = 'http://localhost:3000/recipe_images/keyword_8bdcf468-19c0-44ac-84d2-1f08d396e3d3_1748599267132_8e497bd1.jpg';
    
    console.log(`\n📋 Test Image URL: ${testImageUrl}`);
    
    // Step 1: Extract local path (same logic as your code)
    console.log('\n🔍 Step 1: Extracting local path...');
    
    let localPath;
    if (testImageUrl.includes('localhost')) {
      const urlPath = testImageUrl.split('localhost:3000')[1];
      localPath = path.join(__dirname, urlPath); // Note: removed '..' since we're in root
      console.log(`   URL path extracted: ${urlPath}`);
      console.log(`   Local path constructed: ${localPath}`);
    }
    
    // Step 2: Check if file exists
    console.log('\n🔍 Step 2: Checking if file exists...');
    
    if (fs.existsSync(localPath)) {
      const stats = fs.statSync(localPath);
      console.log(`✅ File exists!`);
      console.log(`   Size: ${Math.round(stats.size / 1024)}KB`);
      console.log(`   Modified: ${stats.mtime}`);
      
      // Check if it's a valid image
      const fileExtension = path.extname(localPath).toLowerCase();
      console.log(`   Extension: ${fileExtension}`);
      
      if (!['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'].includes(fileExtension)) {
        console.log('❌ Invalid image extension');
        return;
      }
    } else {
      console.log(`❌ File does not exist at: ${localPath}`);
      
      // Try alternative paths
      console.log('\n🔍 Trying alternative paths...');
      
      const alt1 = path.join(__dirname, 'recipe_images', path.basename(testImageUrl));
      const alt2 = path.join(process.cwd(), 'recipe_images', path.basename(testImageUrl));
      
      console.log(`   Alternative 1: ${alt1} - ${fs.existsSync(alt1) ? 'EXISTS' : 'NOT FOUND'}`);
      console.log(`   Alternative 2: ${alt2} - ${fs.existsSync(alt2) ? 'EXISTS' : 'NOT FOUND'}`);
      
      if (fs.existsSync(alt1)) {
        localPath = alt1;
        console.log(`✅ Using alternative path 1`);
      } else if (fs.existsSync(alt2)) {
        localPath = alt2;
        console.log(`✅ Using alternative path 2`);
      } else {
        console.log('❌ No valid path found');
        return;
      }
    }
    
    // Step 3: Test reading the image
    console.log('\n🔍 Step 3: Testing image read...');
    
    try {
      const imageData = fs.readFileSync(localPath);
      console.log(`✅ Successfully read image (${imageData.length} bytes)`);
      
      // Check if it starts with valid image headers
      const header = imageData.slice(0, 10);
      console.log(`   Header bytes: ${Array.from(header).map(b => b.toString(16).padStart(2, '0')).join(' ')}`);
      
      // Check for common image signatures
      if (imageData[0] === 0xFF && imageData[1] === 0xD8) {
        console.log('✅ Valid JPEG header detected');
      } else if (imageData[0] === 0x89 && imageData[1] === 0x50) {
        console.log('✅ Valid PNG header detected');
      } else {
        console.log('⚠️ Unrecognized image format');
      }
      
    } catch (readError) {
      console.log(`❌ Error reading image: ${readError.message}`);
      return;
    }
    
    // Step 4: Test base64 encoding
    console.log('\n🔍 Step 4: Testing base64 encoding...');
    
    const imageData = fs.readFileSync(localPath);
    const base64Image = imageData.toString('base64');
    
    console.log(`✅ Base64 encoded (${base64Image.length} chars)`);
    console.log(`   First 50 chars: ${base64Image.substring(0, 50)}...`);
    console.log(`   Last 10 chars: ...${base64Image.substring(base64Image.length - 10)}`);
    
    // Step 5: Test FormData creation
    console.log('\n🔍 Step 5: Testing FormData creation...');
    
    const form = new FormData();
    form.append('image', base64Image);
    
    console.log(`✅ FormData created`);
    console.log(`   Headers:`, form.getHeaders());
    
    // Step 6: Test ImgBB API call with better error handling
    console.log('\n🔍 Step 6: Testing ImgBB API call...');
    
    try {
      const response = await axios.post(
        'https://api.imgbb.com/1/upload?key=6d207e02198a847aa98d0a2a901485a5',
        form,
        {
          headers: form.getHeaders(),
          timeout: 30000
        }
      );
      
      console.log(`✅ ImgBB API call successful!`);
      console.log(`   Status: ${response.status}`);
      console.log(`   Response data:`, response.data);
      
      if (response.data && response.data.data && response.data.data.url) {
        console.log(`🎉 Upload successful! URL: ${response.data.data.url}`);
      }
      
    } catch (apiError) {
      console.log(`❌ ImgBB API error:`, apiError.message);
      
      if (apiError.response) {
        console.log(`   Status: ${apiError.response.status}`);
        console.log(`   Status text: ${apiError.response.statusText}`);
        console.log(`   Response data:`, apiError.response.data);
      }
      
      // Try with file stream instead of base64
      console.log('\n🔄 Trying alternative upload method (file stream)...');
      
      try {
        const formStream = new FormData();
        formStream.append('image', fs.createReadStream(localPath));
        
        const streamResponse = await axios.post(
          'https://api.imgbb.com/1/upload?key=6d207e02198a847aa98d0a2a901485a5',
          formStream,
          {
            headers: formStream.getHeaders(),
            timeout: 30000
          }
        );
        
        console.log(`✅ Stream upload successful!`);
        console.log(`   URL: ${streamResponse.data.data.url}`);
        
      } catch (streamError) {
        console.log(`❌ Stream upload also failed:`, streamError.message);
        
        if (streamError.response) {
          console.log(`   Status: ${streamError.response.status}`);
          console.log(`   Response data:`, streamError.response.data);
        }
      }
    }
    
    console.log('\n✨ DEBUG COMPLETED');
    console.log('='.repeat(30));
    
  } catch (error) {
    console.error('❌ Debug script failed:', error.message);
    console.error('Full error:', error);
  }
}

// Run the debug
debugImgBBUpload().then(() => {
  console.log('\n🎉 Debug completed!');
  process.exit(0);
}).catch(error => {
  console.error('❌ Debug failed:', error);
  process.exit(1);
});