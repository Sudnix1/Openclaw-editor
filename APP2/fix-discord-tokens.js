// Fix Discord tokens by directly updating config files
const fs = require('fs');
const path = require('path');

// Get working Discord token from BuzzWrite or database
async function getWorkingDiscordToken() {
  // You need to put the working Discord token here
  // This is the token that works on BuzzWrite
  return "MTIzMDUxNjM2NTM3MTExNzU4OA.G-pIlX.HggwfnMxZVk9d1CRPDNaP_8bEaN3huD6Qum4Vk";
}

// Fix all Discord tokens for an organization
async function fixDiscordTokensForOrganization(organizationId) {
  try {
    const workingToken = await getWorkingDiscordToken();
    console.log(`🔧 Fixing Discord tokens for organization: ${organizationId}`);
    console.log(`🔑 Working token: ${workingToken.substring(0, 20)}...`);

    const dataDir = path.join(__dirname, 'data');
    const configFiles = fs.readdirSync(dataDir).filter(file => 
      file.startsWith(`config-${organizationId}-`) && file.endsWith('.json')
    );

    console.log(`📁 Found ${configFiles.length} config files to update:`);
    configFiles.forEach(file => console.log(`   - ${file}`));

    let updatedCount = 0;
    for (const configFile of configFiles) {
      try {
        const filePath = path.join(dataDir, configFile);
        console.log(`\n📄 Processing: ${configFile}`);
        
        // Read current config
        const configContent = fs.readFileSync(filePath, 'utf8');
        const config = JSON.parse(configContent);
        
        // Check if Discord token exists and is different
        if (config.discordUserToken) {
          console.log(`   Current token: ${config.discordUserToken.substring(0, 20)}...`);
          
          if (config.discordUserToken !== workingToken) {
            // Update the token
            config.discordUserToken = workingToken;
            config.enableDiscord = true;
            
            // Write back to file
            fs.writeFileSync(filePath, JSON.stringify(config, null, 2));
            console.log(`   ✅ Updated Discord token`);
            updatedCount++;
            
            // Verify the update
            const verifyContent = fs.readFileSync(filePath, 'utf8');
            const verifyConfig = JSON.parse(verifyContent);
            if (verifyConfig.discordUserToken === workingToken) {
              console.log(`   ✅ Verified: Token updated successfully`);
            } else {
              console.log(`   ❌ Verification failed!`);
            }
          } else {
            console.log(`   ✅ Token already correct`);
          }
        } else {
          console.log(`   ℹ️  No Discord token in this config`);
        }
        
      } catch (fileError) {
        console.error(`   ❌ Error processing ${configFile}:`, fileError.message);
      }
    }

    console.log(`\n🎉 Fix completed! Updated ${updatedCount} config files.`);
    return updatedCount;

  } catch (error) {
    console.error('❌ Error fixing Discord tokens:', error);
    return 0;
  }
}

module.exports = { fixDiscordTokensForOrganization };

// If run directly
if (require.main === module) {
  const organizationId = '1ff5b9b6-39d3-4c60-b4a0-ade81cf4dfd3';
  fixDiscordTokensForOrganization(organizationId);
}