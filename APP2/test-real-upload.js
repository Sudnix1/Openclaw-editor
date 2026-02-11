// test-real-upload.js - Test the actual uploadToImgBB function from image-generator.js
const path = require('path');

async function testRealUpload() {
  console.log('🧪 TESTING REAL UPLOAD FUNCTION');
  console.log('='.repeat(50));
  
  try {
    // Import the actual image-generator module
    const imageGenerator = require('./midjourney/image-generator');
    
    // Test image path (use the same one from your logs)
    const testImagePath = path.join(__dirname, 'recipe_images', 'keyword_8bdcf468-19c0-44ac-84d2-1f08d396e3d3_1748599267132_8e497bd1.jpg');
    
    console.log(`\n📋 Testing with image: ${testImagePath}`);
    
    // Check if we can access the uploadToImgBB function
    // Since it's not exported, we'll test the addImageUrlToPrompt function instead
    // which calls uploadToImgBB internally
    
    const testUrl = 'http://localhost:3000/recipe_images/keyword_8bdcf468-19c0-44ac-84d2-1f08d396e3d3_1748599267132_8e497bd1.jpg';
    const testPrompt = 'Professional food photography of Cowboy Pasta Salad';
    
    console.log(`\n🔍 Testing addImageUrlToPrompt function...`);
    console.log(`   Test URL: ${testUrl}`);
    console.log(`   Test prompt: ${testPrompt}`);
    
    // Call the function that internally uses uploadToImgBB
    const result = await imageGenerator.addImageUrlToPrompt(testPrompt, testUrl);
    
    console.log(`\n📊 Result:`);
    console.log(`   Input prompt: ${testPrompt}`);
    console.log(`   Output prompt: ${result}`);
    
    // Check if the result contains a public URL (indicating successful upload)
    if (result.includes('https://i.ibb.co/')) {
      console.log(`✅ SUCCESS! Image was uploaded to ImgBB`);
      
      // Extract the ImgBB URL
      const urlMatch = result.match(/(https:\/\/i\.ibb\.co\/[^\s]+)/);
      if (urlMatch) {
        console.log(`🎉 ImgBB URL: ${urlMatch[1]}`);
      }
    } else if (result.includes('localhost')) {
      console.log(`⚠️ Upload failed, using localhost URL`);
      console.log(`💡 Check the console output above for upload error details`);
    } else {
      console.log(`❓ Unexpected result format`);
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Full error:', error);
  }
}

// Run the test
testRealUpload().then(() => {
  console.log('\n🎉 Real upload test completed!');
  process.exit(0);
}).catch(error => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});