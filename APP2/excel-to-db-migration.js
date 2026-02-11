// Create excel-to-db-migration.js
const path = require('path');
const XLSX = require('xlsx');
const { recipeDb, keywordsDb } = require('./db');
const fs = require('fs').promises;

async function migrateContent() {
  // Get all organizations
  const orgs = await getAll('SELECT * FROM organizations');
  
  for (const org of orgs) {
    console.log(`Migrating content for organization: ${org.name}`);
    
    // Find old Excel files for this organization
    const oldExcelPath = path.join(__dirname, 'data', org.excel_file || '');
    
    if (await fileExists(oldExcelPath)) {
      console.log(`Found Excel file: ${oldExcelPath}`);
      
      // Read Excel data
      const workbook = XLSX.readFile(oldExcelPath);
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json(sheet);
      
      // Process each row
      for (const row of data) {
        // Add to keywords or recipes tables with correct organization_id
        const keywordId = await keywordsDb.addKeyword({
          keyword: row.Keyword || row.keyword,
          category: row.Category || row.category,
          interests: row.Interests || row.interests,
          ownerId: row.OwnerId || row.owner_id,
          organizationId: org.id
        });
        
        // Handle other content as needed...
      }
    } else {
      console.log(`No Excel file found for organization: ${org.name}`);
    }
  }
}

// Run the migration
migrateContent().then(() => console.log('Content migration complete'));