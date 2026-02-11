// Simplified script to set up debug monitoring
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'data', 'recipes.db');

async function setupMonitoring() {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(dbPath);
    
    console.log('🔧 Setting up debug monitoring...');
    
    // Step 1: Create the log table
    db.run(`
      CREATE TABLE IF NOT EXISTS keyword_status_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        keyword_id TEXT NOT NULL,
        old_status TEXT,
        new_status TEXT NOT NULL,
        changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        change_source TEXT DEFAULT 'unknown',
        FOREIGN KEY (keyword_id) REFERENCES keywords(id)
      )
    `, (err) => {
      if (err) {
        console.error('❌ Error creating table:', err.message);
        return reject(err);
      }
      console.log('✅ Created keyword_status_log table');
      
      // Step 2: Drop existing trigger
      db.run(`DROP TRIGGER IF EXISTS log_keyword_status_changes`, (err) => {
        if (err) {
          console.error('❌ Error dropping trigger:', err.message);
        } else {
          console.log('✅ Dropped existing trigger (if any)');
        }
        
        // Step 3: Create new trigger
        db.run(`
          CREATE TRIGGER log_keyword_status_changes 
          AFTER UPDATE OF status ON keywords
          FOR EACH ROW
          WHEN OLD.status != NEW.status
          BEGIN
            INSERT INTO keyword_status_log (keyword_id, old_status, new_status, changed_at)
            VALUES (NEW.id, OLD.status, NEW.status, CURRENT_TIMESTAMP);
          END
        `, (err) => {
          if (err) {
            console.error('❌ Error creating trigger:', err.message);
            return reject(err);
          }
          console.log('✅ Created status change trigger');
          
          // Step 4: Test the setup
          db.get(`SELECT COUNT(*) as count FROM keyword_status_log`, (err, row) => {
            if (err) {
              console.error('❌ Error testing table:', err.message);
            } else {
              console.log(`✅ Status log table working (${row.count} existing records)`);
            }
            
            db.close();
            console.log('🎉 Debug monitoring setup complete!');
            resolve();
          });
        });
      });
    });
  });
}

async function queryRecentChanges(limit = 20) {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(dbPath);
    
    db.all(`
      SELECT 
        ksl.id,
        ksl.keyword_id,
        ksl.old_status,
        ksl.new_status,
        ksl.changed_at,
        k.keyword,
        k.recipe_id
      FROM keyword_status_log ksl
      LEFT JOIN keywords k ON ksl.keyword_id = k.id
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

async function monitorKeyword(keywordId) {
  console.log(`🔍 Checking status changes for keyword: ${keywordId}`);
  
  try {
    const changes = await queryRecentChanges(100);
    const keywordChanges = changes.filter(change => change.keyword_id === keywordId);
    
    if (keywordChanges.length === 0) {
      console.log(`📋 No status changes recorded for keyword ${keywordId}`);
      
      // Check current status
      const db = new sqlite3.Database(dbPath);
      db.get(`SELECT id, keyword, status, processed_at FROM keywords WHERE id = ?`, [keywordId], (err, row) => {
        db.close();
        if (err) {
          console.error('❌ Error checking keyword:', err.message);
        } else if (row) {
          console.log(`📊 Current status: "${row.keyword}" (${row.id}) = ${row.status}`);
          console.log(`   Processed at: ${row.processed_at || 'Not processed'}`);
        } else {
          console.log(`❌ Keyword ${keywordId} not found`);
        }
      });
    } else {
      console.log(`📋 Found ${keywordChanges.length} status changes for keyword ${keywordId}:`);
      keywordChanges.forEach((change, index) => {
        const keyword = change.keyword || 'Unknown';
        console.log(`  ${index + 1}. "${keyword}": ${change.old_status} → ${change.new_status} at ${change.changed_at}`);
      });
    }
    
    return keywordChanges;
  } catch (error) {
    console.error('❌ Error monitoring keyword:', error.message);
  }
}

// Command line usage
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args[0] === 'setup') {
    setupMonitoring().catch(console.error);
  } else if (args[0] === 'query') {
    const limit = parseInt(args[1]) || 20;
    queryRecentChanges(limit).then(rows => {
      if (rows.length === 0) {
        console.log('📋 No status changes recorded yet');
      } else {
        console.log(`📋 Recent ${rows.length} status changes:`);
        rows.forEach((row, index) => {
          const keyword = row.keyword || 'Unknown';
          console.log(`${index + 1}. "${keyword}" (${row.keyword_id}): ${row.old_status} → ${row.new_status} at ${row.changed_at}`);
        });
      }
    }).catch(console.error);
  } else if (args[0] === 'monitor' && args[1]) {
    monitorKeyword(args[1]).catch(console.error);
  } else {
    console.log('🔧 Debug Monitoring Tool');
    console.log('Usage:');
    console.log('  node setup-debug-monitoring.js setup           - Set up monitoring');
    console.log('  node setup-debug-monitoring.js query [N]       - Show last N status changes');
    console.log('  node setup-debug-monitoring.js monitor <id>    - Monitor specific keyword');
  }
}

module.exports = {
  setupMonitoring,
  queryRecentChanges,
  monitorKeyword
};