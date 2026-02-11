// add-image-url.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.join(__dirname, 'data', 'recipes.db'); // Adjust this path if your database is located elsewhere

console.log(`Opening database at: ${dbPath}`);

// Open the database
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
    process.exit(1);
  }
  console.log('Connected to the SQLite database.');
});

// Add the image_url column to the keywords table
db.run(`ALTER TABLE keywords ADD COLUMN image_url TEXT;`, function(err) {
  if (err) {
    console.error('Error adding column:', err.message);
    
    // Check if the error is because the column already exists
    if (err.message.includes('duplicate column name') || 
        err.message.includes('already exists')) {
      console.log('The image_url column already exists in the keywords table.');
    } else {
      console.error('Failed to add the column.');
    }
  } else {
    console.log('Successfully added image_url column to the keywords table.');
  }
  
  // Close the database connection
  db.close((err) => {
    if (err) {
      console.error('Error closing database:', err.message);
    } else {
      console.log('Database connection closed.');
    }
  });
});