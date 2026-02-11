// add-originalurl.js
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'middleware/auth.js');

console.log(`Checking ${filePath}...`);

// Read the file
fs.readFile(filePath, 'utf8', (err, data) => {
  if (err) {
    console.error(`Error reading ${filePath}:`, err);
    return;
  }
  
  // Check if originalUrl is already being stored
  if (data.includes('res.locals.originalUrl')) {
    console.log('originalUrl already being stored in res.locals, skipping');
    return;
  }
  
  // Find the attachUserToLocals function
  const attachUserToLocalsRegex = /function\s+attachUserToLocals\s*\(\s*req\s*,\s*res\s*,\s*next\s*\)\s*\{/;
  const match = attachUserToLocalsRegex.exec(data);
  
  if (!match) {
    console.log('Could not find attachUserToLocals function, skipping');
    return;
  }
  
  // Find the end of function preamble where we can add our code
  const endOfPreamble = data.indexOf('{', match.index) + 1;
  
  // Create the code to add
  const codeToAdd = `
  // Store the original URL for return after website switching
  res.locals.originalUrl = req.originalUrl;
`;
  
  // Insert the code
  const modifiedData = data.slice(0, endOfPreamble) + codeToAdd + data.slice(endOfPreamble);
  
  // Backup the original file
  fs.writeFile(filePath + '.backup', data, 'utf8', err => {
    if (err) {
      console.error(`Error backing up ${filePath}:`, err);
      return;
    }
    
    console.log(`${filePath} backed up successfully`);
    
    // Write the modified file
    fs.writeFile(filePath, modifiedData, 'utf8', err => {
      if (err) {
        console.error(`Error writing modified ${filePath}:`, err);
        return;
      }
      
      console.log(`Successfully updated ${filePath} to store originalUrl in res.locals`);
    });
  });
});