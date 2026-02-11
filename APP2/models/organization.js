// models/organization.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs').promises;
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

// Organization operations
const organizationDb = {
  // Get all organizations
  async getAllOrganizations() {
    return getAll(`SELECT * FROM organizations`);
  },
  
  // Get organization by ID
  async getOrganizationById(id) {
    if (!id) {
      console.warn('getOrganizationById called with undefined id');
      return null;
    }
    
    return getOne(`SELECT * FROM organizations WHERE id = ?`, [id]);
  },
  
  // Get organization by admin ID
  async getOrganizationByAdminId(adminId) {
    if (!adminId) {
      console.warn('getOrganizationByAdminId called with undefined adminId');
      return null;
    }
    
    return getOne(`SELECT * FROM organizations WHERE admin_id = ?`, [adminId]);
  },
  
  // Create organization
  async createOrganization(orgData) {
    const { name, adminId } = orgData;
    
    if (!name || !adminId) {
      throw new Error('Organization name and admin ID are required');
    }
    
    // Check if organization name exists
    const existing = await getOne(
      `SELECT name FROM organizations WHERE name = ?`,
      [name]
    );
    
    if (existing) {
      throw new Error('Organization name already exists');
    }
    
    const id = orgData.id || uuidv4();
    const configFile = `config-${id}.json`;
    
    await runQuery(
      `INSERT INTO organizations (id, name, admin_id, config_file) 
       VALUES (?, ?, ?, ?)`,
      [id, name, adminId, configFile]
    );
    
    // Create organization-specific configuration file
    const dataDir = path.join(__dirname, '../data');
    try {
      // Create config directory if it doesn't exist
      await fs.mkdir(dataDir, { recursive: true });
      
      // Create default config file for the organization
      const defaultConfig = {
        model: process.env.DEFAULT_MODEL || 'gpt-4-turbo-preview',
        temperature: parseFloat(process.env.DEFAULT_TEMPERATURE || '0.7'),
        language: process.env.DEFAULT_LANGUAGE || 'English',
        pinCount: parseInt(process.env.DEFAULT_PIN_COUNT || '10'),
        prompts: {
          // Copy default prompts from existing config
        }
      };
      
      await fs.writeFile(
        path.join(dataDir, configFile),
        JSON.stringify(defaultConfig, null, 2)
      );
      
      console.log(`Created organization config file: ${configFile}`);
    } catch (error) {
      console.error('Error creating organization config file:', error);
    }
    
    return {
      id,
      name,
      adminId,
      configFile
    };
  },
  
  // Update organization
  async updateOrganization(id, orgData) {
    if (!id) {
      throw new Error('Organization ID is required');
    }
    
    const { name, adminId } = orgData;
    let updateFields = [];
    let params = [];
    
    if (name) {
      // Check if name already exists for another organization
      const existingName = await getOne(
        `SELECT id FROM organizations WHERE name = ? AND id != ?`,
        [name, id]
      );
      
      if (existingName) {
        throw new Error('Organization name already exists');
      }
      
      updateFields.push('name = ?');
      params.push(name);
    }
    
    if (adminId) {
      updateFields.push('admin_id = ?');
      params.push(adminId);
    }
    
    // Add the ID at the end of params
    params.push(id);
    
    // Execute the update query if we have fields to update
    if (updateFields.length > 0) {
      await runQuery(
        `UPDATE organizations SET ${updateFields.join(', ')} WHERE id = ?`,
        params
      );
    }
    
    return await this.getOrganizationById(id);
  },
  
  // Delete organization
  async deleteOrganization(id) {
    if (!id) {
      throw new Error('Organization ID is required');
    }
    
    // Get the organization first to know which config file to delete
    const org = await this.getOrganizationById(id);
    
    if (!org) {
      throw new Error('Organization not found');
    }
    
    await runQuery(`DELETE FROM organizations WHERE id = ?`, [id]);
    
    // Delete organization config file
    try {
      await fs.unlink(path.join(__dirname, '../data', org.config_file));
    } catch (error) {
      console.error('Error deleting organization config file:', error);
    }
    
    return { success: true };
  }
};

module.exports = organizationDb;