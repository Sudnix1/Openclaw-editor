// models/user.js - UPDATED EXACTLY LIKE YOUR OLD APP
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const db = new sqlite3.Database(path.join(__dirname, '../data/recipes.db'));

// Helper functions for database operations
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

function getOne(query, params = []) {
  return new Promise((resolve, reject) => {
    db.get(query, params, (err, row) => {
      if (err) {
        reject(err);
      } else {
        resolve(row);
      }
    });
  });
}

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

// Hash password
function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

// User operations
const userDb = {
  // Get all users
  async getAllUsers() {
    return getAll(`SELECT id, username, name, email, role, organization_id as organizationId, created_at FROM users`);
  },
  
  // Get user by ID
  async getUserById(id) {
    return getOne(
      `SELECT id, username, name, email, role, organization_id as organizationId, created_at FROM users WHERE id = ?`,
      [id]
    );
  },
  
  // Get users by organization - CRITICAL FOR DATA ISOLATION
  async getUsersByOrganization(organizationId) {
    if (!organizationId) {
      console.warn('getUsersByOrganization called with undefined organizationId');
      return [];
    }
    
    console.log(`Getting users for organization: ${organizationId}`);
    return getAll(
      `SELECT id, username, name, email, role, organization_id as organizationId, created_at 
       FROM users WHERE organization_id = ?`,
      [organizationId]
    );
  },
  
  // Authenticate user
  // Authenticate user
async authenticateUser(username, password) {
  const hashedPassword = hashPassword(password);
  const user = await getOne(
    `SELECT id, username, name, email, role, organization_id as organizationId, created_at as createdAt
     FROM users WHERE username = ? AND password = ?`,
    [username, hashedPassword]
  );
  
  console.log('Authenticated user:', user);
  return user;
},
  
  // Create user
  async createUser(userData) {
    const { username, password, name, email, role, organizationId } = userData;
    
    if (!username || !password || !name || !email) {
      throw new Error('Required fields missing: username, password, name, and email are required');
    }
    
    if (!organizationId) {
      throw new Error('Organization ID is required');
    }
    
    // Check if username or email already exists
    const existing = await getOne(
      `SELECT username, email FROM users WHERE username = ? OR email = ?`,
      [username, email]
    );
    
    if (existing) {
      if (existing.username === username) {
        throw new Error('Username already exists');
      } else {
        throw new Error('Email already exists');
      }
    }
    
    const id = userData.id || uuidv4();
    const hashedPassword = hashPassword(password);
    
    console.log(`Creating user ${username} with organization ID ${organizationId}`);
    
    await runQuery(
      `INSERT INTO users (id, username, password, name, email, role, organization_id) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, username, hashedPassword, name, email, role || 'employee', organizationId]
    );
    
    // Return user without password
    return {
      id,
      username,
      name,
      email,
      role: role || 'employee',
      organizationId,
      createdAt: new Date().toISOString()
    };
  },
  
  // Update user
  async updateUser(id, userData) {
    if (!id) {
      throw new Error('User ID is required');
    }
    
    const { name, email, role, password, organizationId } = userData;
    
    // Start building the query and parameters
    let updateFields = [];
    let params = [];
    
    if (name) {
      updateFields.push('name = ?');
      params.push(name);
    }
    
    if (email) {
      // Check if email already exists for another user
      if (email) {
        const existingEmail = await getOne(
          `SELECT id FROM users WHERE email = ? AND id != ?`,
          [email, id]
        );
        
        if (existingEmail) {
          throw new Error('Email already exists');
        }
      }
      
      updateFields.push('email = ?');
      params.push(email);
    }
    
    if (role) {
      updateFields.push('role = ?');
      params.push(role);
    }
    
    if (password) {
      updateFields.push('password = ?');
      params.push(hashPassword(password));
    }
    
    if (organizationId) {
      updateFields.push('organization_id = ?');
      params.push(organizationId);
    }
    
    // Add the ID at the end of params
    params.push(id);
    
    // Execute the update query if we have fields to update
    if (updateFields.length > 0) {
      await runQuery(
        `UPDATE users SET ${updateFields.join(', ')} WHERE id = ?`,
        params
      );
    }
    
    // Return updated user
    return await this.getUserById(id);
  },
  
  // Delete user
  async deleteUser(id) {
    if (!id) {
      throw new Error('User ID is required');
    }
    
    // Check if user exists
    const user = await this.getUserById(id);
    if (!user) {
      throw new Error('User not found');
    }
    
    await runQuery(`DELETE FROM users WHERE id = ?`, [id]);
    return { success: true };
  }
};

module.exports = userDb;