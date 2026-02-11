// activity-logger.js
const { v4: uuidv4 } = require('uuid');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const db = new sqlite3.Database(path.join(__dirname, 'data', 'recipes.db'));

// Helper to run queries as promises
function runQuery(query, params = []) {
  return new Promise((resolve, reject) => {
    db.run(query, params, function(err) {
      if (err) {
        reject(err);
      } else {
        resolve({ lastID: this.lastID, changes: this.changes });
      }
    });
  });
}

// Ensure the activity_logs table exists
async function ensureActivityTableExists() {
  try {
    await runQuery(`
      CREATE TABLE IF NOT EXISTS activity_logs (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        organization_id TEXT NOT NULL,
        action_type TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT,
        details TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
      )
    `);
    
    // Create indexes
    await runQuery(`
      CREATE INDEX IF NOT EXISTS idx_activity_user ON activity_logs(user_id)
    `);
    
    await runQuery(`
      CREATE INDEX IF NOT EXISTS idx_activity_org ON activity_logs(organization_id)
    `);
    
    await runQuery(`
      CREATE INDEX IF NOT EXISTS idx_activity_created ON activity_logs(created_at)
    `);
    
    console.log('Activity logging table is ready');
    return true;
  } catch (error) {
    console.error('Error ensuring activity table exists:', error);
    return false;
  }
}

// Log an activity
async function logActivity(userId, organizationId, actionType, entityType, entityId = null, details = null) {
  try {
    if (!userId || !organizationId || !actionType || !entityType) {
      console.error('Missing required parameters for activity logging');
      return false;
    }
    
    // Ensure the table exists
    await ensureActivityTableExists();
    
    const id = uuidv4();
    
    // Convert details object to JSON string if it's an object
    if (details && typeof details === 'object') {
      details = JSON.stringify(details);
    }
    
    await runQuery(
      `INSERT INTO activity_logs (id, user_id, organization_id, action_type, entity_type, entity_id, details)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, userId, organizationId, actionType, entityType, entityId, details]
    );
    
    return true;
  } catch (error) {
    console.error('Error logging activity:', error);
    return false;
  }
}

// Get recent activity for an organization or user
async function getRecentActivity(organizationId, limit = 10, userId = null) {
  try {
    let query = `
      SELECT al.*, u.name as user_name 
      FROM activity_logs al
      JOIN users u ON al.user_id = u.id
      WHERE al.organization_id = ?
    `;
    
    const params = [organizationId];
    
    if (userId) {
      query += ` AND al.user_id = ?`;
      params.push(userId);
    }
    
    query += ` ORDER BY al.created_at DESC LIMIT ?`;
    params.push(limit);
    
    return await getAll(query, params);
  } catch (error) {
    console.error('Error getting activity logs:', error);
    return [];
  }
}

// Helper to get multiple rows
function getAll(query, params = []) {
  return new Promise((resolve, reject) => {
    db.all(query, params, (err, rows) => {
      if (err) {
        reject(err);
      } else {
        resolve(rows);
      }
    });
  });
}

module.exports = {
  logActivity,
  getRecentActivity,
  ensureActivityTableExists
};