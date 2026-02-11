// Test the Discord token fix directly
const fs = require('fs');
const path = require('path');

// Replace this with the working Discord token from BuzzWrite
const WORKING_TOKEN = "PASTE_WORKING_TOKEN_HERE";
const ORGANIZATION_ID = "1ff5b9b6-39d3-4c60-b4a0-ade81cf4dfd3";

console.log("🔧 Testing Discord token fix...");
console.log(`Organization: ${ORGANIZATION_ID}`);
console.log(`Working token: ${WORKING_TOKEN.substring(0, 20)}...`);

const dataDir = path.join(__dirname, 'data');
const configFiles = fs.readdirSync(dataDir).filter(file => 
  file.startsWith(`config-${ORGANIZATION_ID}-`) && file.endsWith('.json')
);

console.log(`\n📁 Found ${configFiles.length} config files:`);
configFiles.forEach(file => {
  const filePath = path.join(dataDir, file);
  try {
    const config = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const currentToken = config.discordUserToken;
    console.log(`  ${file}`);
    console.log(`    Current token: ${currentToken ? currentToken.substring(0, 20) + '...' : 'None'}`);
    console.log(`    Needs update: ${currentToken !== WORKING_TOKEN ? 'YES' : 'NO'}`);
  } catch (error) {
    console.log(`  ${file} - Error reading: ${error.message}`);
  }
});

console.log("\n✅ Test completed. If you see 'Needs update: YES', the fix will work.");
console.log("📝 Make sure to put the correct WORKING_TOKEN at the top of this file.");