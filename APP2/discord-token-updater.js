// Direct Discord token updater - bypasses broken promptSettingsDb.saveSettings
const fs = require('fs');
const path = require('path');

/**
 * Update Discord token for all websites in an organization using direct file manipulation
 * This bypasses the broken promptSettingsDb.saveSettings function
 */
async function updateDiscordTokenForOrganization(organizationId, newDiscordToken) {
  try {
    console.log(`🔧 [DIRECT] Updating Discord tokens for organization: ${organizationId}`);
    console.log(`🔑 [DIRECT] New token: ${newDiscordToken.substring(0, 20)}...`);

    const dataDir = path.join(__dirname, 'data');
    
    // Find all config files for this organization
    const configFiles = fs.readdirSync(dataDir).filter(file => 
      file.startsWith(`config-${organizationId}-`) && 
      file.endsWith('.json') &&
      !file.includes('[object Object]') // Skip malformed files
    );

    console.log(`📁 [DIRECT] Found ${configFiles.length} config files to update:`);
    configFiles.forEach(file => console.log(`   - ${file}`));

    let updatedCount = 0;
    let createdCount = 0;

    for (const configFile of configFiles) {
      try {
        const filePath = path.join(dataDir, configFile);
        console.log(`\n📄 [DIRECT] Processing: ${configFile}`);
        
        // Read current config
        const configContent = fs.readFileSync(filePath, 'utf8');
        const config = JSON.parse(configContent);
        
        // Always update the Discord token and enable Discord
        const oldToken = config.discordUserToken;
        config.discordUserToken = newDiscordToken;
        config.enableDiscord = true;
        
        // Ensure channel ID exists
        if (!config.discordChannelId) {
          config.discordChannelId = '1374421017333731369'; // Default channel
        }
        
        // Write back to file
        fs.writeFileSync(filePath, JSON.stringify(config, null, 2));
        
        if (oldToken) {
          console.log(`   ✅ Updated existing Discord token`);
          console.log(`     Old: ${oldToken.substring(0, 15)}...`);
          console.log(`     New: ${newDiscordToken.substring(0, 15)}...`);
          updatedCount++;
        } else {
          console.log(`   ✅ Added new Discord token`);
          createdCount++;
        }
        
        // Verify the update
        const verifyContent = fs.readFileSync(filePath, 'utf8');
        const verifyConfig = JSON.parse(verifyContent);
        if (verifyConfig.discordUserToken === newDiscordToken) {
          console.log(`   ✅ Verified: Token updated successfully`);
        } else {
          console.error(`   ❌ Verification failed!`);
        }
        
      } catch (fileError) {
        console.error(`   ❌ Error processing ${configFile}:`, fileError.message);
      }
    }

    const totalUpdated = updatedCount + createdCount;
    console.log(`\n🎉 [DIRECT] Fix completed!`);
    console.log(`   Updated existing: ${updatedCount} files`);
    console.log(`   Added new: ${createdCount} files`);
    console.log(`   Total: ${totalUpdated} files`);

    return {
      success: true,
      totalUpdated,
      updatedCount,
      createdCount,
      filesProcessed: configFiles.length
    };

  } catch (error) {
    console.error('❌ [DIRECT] Error updating Discord tokens:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

module.exports = { updateDiscordTokenForOrganization };