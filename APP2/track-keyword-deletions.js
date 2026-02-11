// Script to track keyword deletions
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'data', 'recipes.db');

async function setupDeletionTracking() {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(dbPath);
    
    console.log('🔧 Setting up keyword deletion tracking...');
    
    // Create deletion log table
    db.run(`
      CREATE TABLE IF NOT EXISTS keyword_deletion_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        keyword_id TEXT NOT NULL,
        keyword_text TEXT,
        status_at_deletion TEXT,
        recipe_id TEXT,
        organization_id TEXT,
        website_id TEXT,
        deleted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        deletion_source TEXT DEFAULT 'unknown'
      )
    `, (err) => {
      if (err) {
        console.error('❌ Error creating deletion log table:', err.message);
        return reject(err);
      }
      console.log('✅ Created keyword_deletion_log table');
      
      // Drop existing deletion trigger
      db.run(`DROP TRIGGER IF EXISTS log_keyword_deletions`, (err) => {
        if (err) {
          console.error('❌ Error dropping trigger:', err.message);
        } else {
          console.log('✅ Dropped existing deletion trigger (if any)');
        }
        
        // Create deletion tracking trigger
        db.run(`
          CREATE TRIGGER log_keyword_deletions 
          BEFORE DELETE ON keywords
          FOR EACH ROW
          BEGIN
            INSERT INTO keyword_deletion_log (
              keyword_id, 
              keyword_text, 
              status_at_deletion, 
              recipe_id,
              organization_id,
              website_id,
              deleted_at
            )
            VALUES (
              OLD.id, 
              OLD.keyword, 
              OLD.status, 
              OLD.recipe_id,
              OLD.organization_id,
              OLD.website_id,
              CURRENT_TIMESTAMP
            );
          END
        `, (err) => {
          if (err) {
            console.error('❌ Error creating deletion trigger:', err.message);
            return reject(err);
          }
          console.log('✅ Created keyword deletion tracking trigger');
          
          db.close();
          console.log('🎉 Keyword deletion tracking setup complete!');
          resolve();
        });
      });
    });
  });
}

async function queryRecentDeletions(limit = 20) {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(dbPath);
    
    db.all(`
      SELECT *
      FROM keyword_deletion_log
      ORDER BY deleted_at DESC
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

async function trackSpecificKeyword(keywordText) {
  console.log(`🔍 Checking deletion log for keyword: "${keywordText}"`);
  
  try {
    const deletions = await queryRecentDeletions(100);
    const keywordDeletions = deletions.filter(deletion => 
      deletion.keyword_text && deletion.keyword_text.toLowerCase().includes(keywordText.toLowerCase())
    );
    
    if (keywordDeletions.length === 0) {
      console.log(`📋 No deletions found for keyword containing "${keywordText}"`);
    } else {
      console.log(`📋 Found ${keywordDeletions.length} deletions for keywords containing "${keywordText}":`)
      keywordDeletions.forEach((deletion, index) => {
        console.log(`  ${index + 1}. "${deletion.keyword_text}" (${deletion.keyword_id})`);
        console.log(`     Status: ${deletion.status_at_deletion}`);
        console.log(`     Recipe: ${deletion.recipe_id}`);
        console.log(`     Deleted: ${deletion.deleted_at}`);
        console.log('');
      });
    }
    
    return keywordDeletions;
  } catch (error) {
    console.error('❌ Error tracking keyword:', error.message);
  }
}

// Command line usage
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args[0] === 'setup') {
    setupDeletionTracking().catch(console.error);
  } else if (args[0] === 'query') {
    const limit = parseInt(args[1]) || 20;
    queryRecentDeletions(limit).then(rows => {
      if (rows.length === 0) {
        console.log('📋 No keyword deletions recorded yet');
      } else {
        console.log(`📋 Recent ${rows.length} keyword deletions:`);
        rows.forEach((row, index) => {
          console.log(`${index + 1}. "${row.keyword_text}" (${row.keyword_id})`);
          console.log(`   Status: ${row.status_at_deletion} | Recipe: ${row.recipe_id}`);
          console.log(`   Deleted: ${row.deleted_at}`);
          console.log('');
        });
      }
    }).catch(console.error);
  } else if (args[0] === 'track' && args[1]) {
    trackSpecificKeyword(args[1]).catch(console.error);
  } else {
    console.log('🔍 Keyword Deletion Tracking Tool');
    console.log('Usage:');
    console.log('  node track-keyword-deletions.js setup           - Set up deletion tracking');
    console.log('  node track-keyword-deletions.js query [N]       - Show last N deletions');
    console.log('  node track-keyword-deletions.js track <text>    - Track deletions containing text');
  }
}

module.exports = {
  setupDeletionTracking,
  queryRecentDeletions,
  trackSpecificKeyword
};