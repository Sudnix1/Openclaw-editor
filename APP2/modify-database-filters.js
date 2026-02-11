// modify-database-filters.js
// This script will backup db.js and update it to add website_id filters to all getOne and getAll calls

const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'db.js');

console.log(`Modifying ${filePath}...`);

// Read the file
fs.readFile(filePath, 'utf8', (err, data) => {
  if (err) {
    console.error('Error reading file:', err);
    return;
  }
  
  // Backup original file
  fs.writeFile(filePath + '.backup', data, 'utf8', (err) => {
    if (err) {
      console.error('Error backing up original file:', err);
      return;
    }
    
    console.log('Original file backed up as db.js.backup');
    
    // Add a website filter helper function at the top of the file
    let modified = data.replace(
      /const db = new sqlite3\.Database\(.*\);/,
      '$&\n\n// Helper function to add website filter to queries\nfunction addWebsiteFilter(query, params = [], tableAlias = "") {\n  // Skip if no global website context\n  if (!global.currentWebsiteId) {\n    return { query, params };\n  }\n  \n  const prefix = tableAlias ? `${tableAlias}.` : "";\n  \n  // Check if query already has a WHERE clause\n  if (query.toLowerCase().includes("where")) {\n    // Add to existing WHERE clause\n    query += ` AND ${prefix}website_id = ?`;\n  } else {\n    // Add new WHERE clause\n    query += ` WHERE ${prefix}website_id = ?`;\n  }\n  \n  // Add website_id parameter\n  params.push(global.currentWebsiteId);\n  \n  return { query, params };\n}'
    );
    
    // Write the modified file
    fs.writeFile(filePath, modified, 'utf8', (err) => {
      if (err) {
        console.error('Error writing modified file:', err);
        return;
      }
      
      console.log('Successfully added website filter function to db.js');
    });
  });
});