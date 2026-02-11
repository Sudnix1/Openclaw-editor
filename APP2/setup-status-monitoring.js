// Script to set up status change monitoring in the database
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, 'data', 'recipes.db');

async function setupStatusMonitoring() {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(dbPath);
    
    console.log('🔧 Setting up status change monitoring...');
    
    // Read the SQL file
    const sqlContent = fs.readFileSync(path.join(__dirname, 'debug-status-monitor.sql'), 'utf8');
    
    // Split by semicolon and execute each statement
    const statements = sqlContent.split(';').filter(stmt => stmt.trim());
    
    let completed = 0;
    const total = statements.length;
    
    statements.forEach((statement, index) => {
      if (statement.trim()) {
        db.run(statement.trim(), (err) => {
          if (err && !err.message.includes('already exists')) {
            console.error(`❌ Error executing statement ${index + 1}:`, err.message);
          } else {
            console.log(`✅ Executed statement ${index + 1}/${total}`);
          }
          
          completed++;
          if (completed === total) {
            console.log('🎉 Status monitoring setup complete!');
            
            // Test query to show it's working
            db.all(`
              SELECT name FROM sqlite_master 
              WHERE type='table' AND name='keyword_status_log'
            `, (err, rows) => {
              if (err) {
                console.error('❌ Error checking table:', err);
              } else if (rows.length > 0) {
                console.log('✅ keyword_status_log table created successfully');
              } else {
                console.log('⚠️ keyword_status_log table not found');
              }
              
              db.close();
              resolve();
            });
          }
        });
      }
    });
  });
}

// Function to query recent status changes
async function queryRecentStatusChanges(limit = 20) {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(dbPath);
    
    db.all(`
      SELECT ksl.*, k.keyword, k.recipe_id
      FROM keyword_status_log ksl
      JOIN keywords k ON ksl.keyword_id = k.id
      ORDER BY ksl.changed_at DESC
      LIMIT ?
    `, [limit], (err, rows) => {
      db.close();
      
      if (err) {
        reject(err);
      } else {
        resolve(rows);
      }
    });
  });
}

// Function to monitor a specific keyword
async function monitorKeyword(keywordId) {
  console.log(`🔍 Monitoring status changes for keyword: ${keywordId}`);
  
  const changes = await queryRecentStatusChanges(50);
  const keywordChanges = changes.filter(change => change.keyword_id === keywordId);
  
  if (keywordChanges.length === 0) {
    console.log(`📋 No status changes found for keyword ${keywordId}`);
  } else {
    console.log(`📋 Found ${keywordChanges.length} status changes for keyword ${keywordId}:`);
    keywordChanges.forEach((change, index) => {
      console.log(`  ${index + 1}. ${change.old_status} → ${change.new_status} at ${change.changed_at}`);
    });
  }
  
  return keywordChanges;
}

// Command line usage
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args[0] === 'setup') {
    setupStatusMonitoring().catch(console.error);
  } else if (args[0] === 'query') {
    const limit = parseInt(args[1]) || 20;
    queryRecentStatusChanges(limit).then(rows => {
      console.log(`📋 Recent ${rows.length} status changes:`);
      rows.forEach((row, index) => {
        console.log(`${index + 1}. "${row.keyword}" (${row.keyword_id}): ${row.old_status} → ${row.new_status} at ${row.changed_at}`);
      });
    }).catch(console.error);
  } else if (args[0] === 'monitor' && args[1]) {
    monitorKeyword(args[1]).catch(console.error);
  } else {
    console.log('Usage:');
    console.log('  node setup-status-monitoring.js setup     - Set up monitoring');
    console.log('  node setup-status-monitoring.js query [N] - Show last N status changes');
    console.log('  node setup-status-monitoring.js monitor <keyword-id> - Monitor specific keyword');
  }
}

module.exports = {
  setupStatusMonitoring,
  queryRecentStatusChanges,
  monitorKeyword
};