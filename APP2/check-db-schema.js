// Run this script to show your database schema
// Save as check-db-schema.js and run with: node check-db-schema.js

const { getAll, getOne } = require('./db'); // Adjust path as needed

async function checkDatabaseSchema() {
  try {
    console.log('=== CHECKING DATABASE SCHEMA FOR SETTINGS ===\n');
    
    // Get all tables
    console.log('📋 All tables in database:');
    const tables = await getAll("SELECT name FROM sqlite_master WHERE type='table'");
    tables.forEach(table => console.log(`  - ${table.name}`));
    
    console.log('\n🔍 Looking for settings-related tables...\n');
    
    // Check for prompt_settings table
    try {
      const promptSettings = await getAll("PRAGMA table_info(prompt_settings)");
      if (promptSettings.length > 0) {
        console.log('✅ Found prompt_settings table:');
        promptSettings.forEach(col => {
          console.log(`  - ${col.name} (${col.type}${col.notnull ? ', NOT NULL' : ''}${col.pk ? ', PRIMARY KEY' : ''})`);
        });
        
        // Show sample data
        const sampleData = await getAll("SELECT * FROM prompt_settings LIMIT 3");
        console.log('\n📊 Sample data from prompt_settings:');
        console.log(JSON.stringify(sampleData, null, 2));
      }
    } catch (e) {
      console.log('❌ No prompt_settings table found');
    }
    
    // Check for settings table
    try {
      const settings = await getAll("PRAGMA table_info(settings)");
      if (settings.length > 0) {
        console.log('\n✅ Found settings table:');
        settings.forEach(col => {
          console.log(`  - ${col.name} (${col.type}${col.notnull ? ', NOT NULL' : ''}${col.pk ? ', PRIMARY KEY' : ''})`);
        });
        
        // Show sample data
        const sampleData = await getAll("SELECT * FROM settings LIMIT 3");
        console.log('\n📊 Sample data from settings:');
        console.log(JSON.stringify(sampleData, null, 2));
      }
    } catch (e) {
      console.log('❌ No settings table found');
    }
    
    // Check for website_settings table
    try {
      const websiteSettings = await getAll("PRAGMA table_info(website_settings)");
      if (websiteSettings.length > 0) {
        console.log('\n✅ Found website_settings table:');
        websiteSettings.forEach(col => {
          console.log(`  - ${col.name} (${col.type}${col.notnull ? ', NOT NULL' : ''}${col.pk ? ', PRIMARY KEY' : ''})`);
        });
        
        // Show sample data
        const sampleData = await getAll("SELECT * FROM website_settings LIMIT 3");
        console.log('\n📊 Sample data from website_settings:');
        console.log(JSON.stringify(sampleData, null, 2));
      }
    } catch (e) {
      console.log('❌ No website_settings table found');
    }
    
    // Check for any table with 'discord' in column names
    console.log('\n🔍 Searching for Discord-related columns in all tables...\n');
    
    for (const table of tables) {
      try {
        const columns = await getAll(`PRAGMA table_info(${table.name})`);
        const discordColumns = columns.filter(col => 
          col.name.toLowerCase().includes('discord') ||
          col.name.toLowerCase().includes('channel') ||
          col.name.toLowerCase().includes('token')
        );
        
        if (discordColumns.length > 0) {
          console.log(`📍 Found Discord-related columns in ${table.name}:`);
          discordColumns.forEach(col => {
            console.log(`  - ${col.name} (${col.type})`);
          });
          
          // Show sample data for this table
          try {
            const sampleData = await getAll(`SELECT * FROM ${table.name} LIMIT 2`);
            if (sampleData.length > 0) {
              console.log(`📊 Sample data from ${table.name}:`);
              console.log(JSON.stringify(sampleData, null, 2));
            }
          } catch (e) {
            console.log(`  ⚠️ Could not read sample data from ${table.name}`);
          }
        }
      } catch (e) {
        console.log(`⚠️ Could not check table ${table.name}: ${e.message}`);
      }
    }
    
  } catch (error) {
    console.error('❌ Error checking database schema:', error.message);
  }
}

checkDatabaseSchema().then(() => {
  console.log('\n=== SCHEMA CHECK COMPLETE ===');
  process.exit(0);
}).catch(error => {
  console.error('Script error:', error);
  process.exit(1);
});