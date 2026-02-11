// fix-wordpress-user-id.js
const path = require('path');
const fs = require('fs');

// Function to patch the server.js file
function patchServerFile() {
  const serverPath = path.join(__dirname, 'server.js');
  let content = fs.readFileSync(serverPath, 'utf8');
  
  // Find and replace instances where getSettings() is called without user ID
  const replacements = [
    {
      find: /const settings = await wordpressDb\.getSettings\(\);/g,
      replace: 'const settings = await wordpressDb.getSettings(req.session.user.id);'
    },
    {
      find: /const wpSettings = await wordpressDb\.getSettings\(\);/g,
      replace: 'const wpSettings = await wordpressDb.getSettings(req.session.user.id);'
    },
    {
      find: /const settings = await wordpressDb\.getSettings\('default'\);/g,
      replace: 'const settings = await wordpressDb.getSettings(req.session.user.id);'
    }
  ];
  
  let replacementCount = 0;
  
  // Apply each replacement
  for (const { find, replace } of replacements) {
    const matches = content.match(find);
    if (matches) {
      replacementCount += matches.length;
      content = content.replace(find, replace);
    }
  }
  
  if (replacementCount > 0) {
    // Backup original file
    fs.writeFileSync(`${serverPath}.backup`, fs.readFileSync(serverPath));
    
    // Write patched content
    fs.writeFileSync(serverPath, content);
    
    console.log(`✓ Patched ${replacementCount} instances of wordpressDb.getSettings() calls in server.js`);
  } else {
    console.log('No changes needed in server.js');
  }
}

// Run the patch
patchServerFile();