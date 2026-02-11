// add-website-routes.js
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'server.js');

console.log(`Modifying ${filePath}...`);

// Read the file
fs.readFile(filePath, 'utf8', (err, data) => {
  if (err) {
    console.error('Error reading server.js:', err);
    return;
  }
  
  // Check if website routes are already imported
  if (data.includes('require(\'./website-routes\')') || data.includes('require("./website-routes")')) {
    console.log('Website routes already imported in server.js, skipping');
    return;
  }
  
  // First backup the original file
  fs.writeFile(filePath + '.backup', data, 'utf8', err => {
    if (err) {
      console.error('Error backing up server.js:', err);
      return;
    }
    
    console.log('server.js backed up successfully');
    
    // Add the website routes import - look for other route imports
    let modifiedData = data;
    
    // Try to find where other route imports are
    const routeImportRegex = /const\s+(\w+)Routes\s*=\s*require\(['"]\.\/([\w-]+)['"]|app\.use\(['"]\//;
    const routeImportMatch = routeImportRegex.exec(data);
    
    if (routeImportMatch) {
      // Insert our import near other route imports
      const importStatement = `const websiteRoutes = require('./website-routes');\n`;
      const useStatement = `app.use(websiteRoutes);\n`;
      
      // Find a good spot to add the import
      const importIndex = data.lastIndexOf('const', routeImportMatch.index);
      if (importIndex !== -1) {
        modifiedData = modifiedData.slice(0, importIndex) + importStatement + modifiedData.slice(importIndex);
      } else {
        // Just add it at the beginning
        modifiedData = importStatement + modifiedData;
      }
      
      // Find where routes are used
      const useRegex = /app\.use\(['"]?\//g;
      let useMatch;
      let lastUseIndex = -1;
      
      while ((useMatch = useRegex.exec(modifiedData)) !== null) {
        lastUseIndex = useMatch.index;
      }
      
      if (lastUseIndex !== -1) {
        // Find the end of this app.use statement
        const statementEnd = modifiedData.indexOf(';', lastUseIndex) + 1;
        if (statementEnd !== 0) {
          modifiedData = modifiedData.slice(0, statementEnd) + '\n' + useStatement + modifiedData.slice(statementEnd);
        } else {
          // Add it after a reasonable line
          const newLineIndex = modifiedData.indexOf('\n', lastUseIndex);
          if (newLineIndex !== -1) {
            modifiedData = modifiedData.slice(0, newLineIndex + 1) + useStatement + modifiedData.slice(newLineIndex + 1);
          } else {
            // Just add it at the end
            modifiedData += '\n' + useStatement;
          }
        }
      } else {
        // Just add it near the beginning
        const appUseIndex = modifiedData.indexOf('app.use(');
        if (appUseIndex !== -1) {
          // Find the end of this app.use statement
          const statementEnd = modifiedData.indexOf(';', appUseIndex) + 1;
          if (statementEnd !== 0) {
            modifiedData = modifiedData.slice(0, statementEnd) + '\n' + useStatement + modifiedData.slice(statementEnd);
          } else {
            // Add it after a reasonable line
            const newLineIndex = modifiedData.indexOf('\n', appUseIndex);
            if (newLineIndex !== -1) {
              modifiedData = modifiedData.slice(0, newLineIndex + 1) + useStatement + modifiedData.slice(newLineIndex + 1);
            } else {
              // Just add it at the end
              modifiedData += '\n' + useStatement;
            }
          }
        } else {
          // Just add it near the end
          modifiedData += '\n' + useStatement;
        }
      }
    } else {
      // No existing routes found, just add our code at the end
      const appendCode = `
// Website routes
const websiteRoutes = require('./website-routes');
app.use(websiteRoutes);
`;
      modifiedData += appendCode;
    }
    
    // Write the modified file
    fs.writeFile(filePath, modifiedData, 'utf8', err => {
      if (err) {
        console.error('Error writing modified server.js:', err);
        return;
      }
      
      console.log('Successfully added website routes to server.js');
    });
  });
});