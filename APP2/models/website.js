// models/website.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
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

// Website operations
const websiteDb = {
  // Get all websites for an organization
  async getWebsitesByOrganization(organizationId) {
    if (!organizationId) {
      console.warn('getWebsitesByOrganization called with undefined organizationId');
      return [];
    }
    
    return getAll(
      `SELECT * FROM websites WHERE organization_id = ? ORDER BY name ASC`,
      [organizationId]
    );
  },
  
  // Get website by ID
  async getWebsiteById(id) {
    if (!id) {
      console.warn('getWebsiteById called with undefined id');
      return null;
    }
    
    return getOne(`SELECT * FROM websites WHERE id = ?`, [id]);
  },
  
  // Create website
  async createWebsite(websiteData) {
    const { name, url, organizationId, wordpressApiUrl, wordpressUsername, wordpressPassword } = websiteData;
    
    if (!name || !organizationId) {
      throw new Error('Website name and organization ID are required');
    }
    
    const id = websiteData.id || uuidv4();
    
    await runQuery(
      `INSERT INTO websites (id, name, url, organization_id, wordpress_api_url, wordpress_username, wordpress_password) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, name, url || '', organizationId, wordpressApiUrl || '', wordpressUsername || '', wordpressPassword || '']
    );
    
    return {
      id,
      name,
      url,
      organizationId,
      wordpressApiUrl,
      wordpressUsername,
      wordpressPassword
    };
  },
  
  // Update website
  async updateWebsite(id, websiteData) {
    if (!id) {
      throw new Error('Website ID is required');
    }
    
    const { name, url, wordpressApiUrl, wordpressUsername, wordpressPassword } = websiteData;
    let updateFields = [];
    let params = [];
    
    if (name) {
      updateFields.push('name = ?');
      params.push(name);
    }
    
    if (url !== undefined) {
      updateFields.push('url = ?');
      params.push(url);
    }
    
    if (wordpressApiUrl !== undefined) {
      updateFields.push('wordpress_api_url = ?');
      params.push(wordpressApiUrl);
    }
    
    if (wordpressUsername !== undefined) {
      updateFields.push('wordpress_username = ?');
      params.push(wordpressUsername);
    }
    
    if (wordpressPassword !== undefined && wordpressPassword !== '********') {
      updateFields.push('wordpress_password = ?');
      params.push(wordpressPassword);
    }
    
    // Add the ID at the end of params
    params.push(id);
    
    // Execute the update query if we have fields to update
    if (updateFields.length > 0) {
      await runQuery(
        `UPDATE websites SET ${updateFields.join(', ')} WHERE id = ?`,
        params
      );
    }
    
    return await this.getWebsiteById(id);
  },
  
  // Delete website
  async deleteWebsite(id) {
    if (!id) {
      throw new Error('Website ID is required');
    }
    
    // Check if website exists
    const website = await this.getWebsiteById(id);
    if (!website) {
      throw new Error('Website not found');
    }
    
    await runQuery(`DELETE FROM websites WHERE id = ?`, [id]);
    return { success: true };
  },
  
  // Check if user has access to website
  async hasAccess(userId, websiteId) {
    if (!userId || !websiteId) {
      return false;
    }
    
    const result = await getOne(`
      SELECT w.id 
      FROM websites w
      JOIN users u ON w.organization_id = u.organization_id
      WHERE w.id = ? AND u.id = ?
    `, [websiteId, userId]);
    
    return !!result;
  },
  
  // Get website stats
  async getWebsiteStats(websiteId) {
    if (!websiteId) {
      return {
        recipes: 0,
        pendingKeywords: 0,
        processedKeywords: 0,
        failedKeywords: 0,
        totalKeywords: 0,
        wordpressPosts: 0
      };
    }
    
    // Get count of recipes
    const recipeCount = await getOne(`
      SELECT COUNT(*) as count FROM recipes WHERE website_id = ?
    `, [websiteId]);
    
    // Get counts of keywords by status
    const pendingKeywords = await getOne(`
      SELECT COUNT(*) as count FROM keywords WHERE website_id = ? AND status = 'pending'
    `, [websiteId]);
    
    const processedKeywords = await getOne(`
      SELECT COUNT(*) as count FROM keywords WHERE website_id = ? AND status = 'processed'
    `, [websiteId]);
    
    const failedKeywords = await getOne(`
      SELECT COUNT(*) as count FROM keywords WHERE website_id = ? AND status = 'failed'
    `, [websiteId]);
    
    // Try to get WordPress post count
    let wpPostCount = 0;
    try {
      const wpPosts = await getOne(`
        SELECT COUNT(*) as count 
        FROM wordpress_publications wp
        JOIN recipes r ON wp.recipe_id = r.id
        WHERE r.website_id = ?
      `, [websiteId]);
      
      if (wpPosts) {
        wpPostCount = wpPosts.count;
      }
    } catch (error) {
      console.error('Error getting WordPress post count:', error);
    }
    
    return {
      recipes: recipeCount ? recipeCount.count : 0,
      pendingKeywords: pendingKeywords ? pendingKeywords.count : 0,
      processedKeywords: processedKeywords ? processedKeywords.count : 0,
      failedKeywords: failedKeywords ? failedKeywords.count : 0,
      totalKeywords: (pendingKeywords ? pendingKeywords.count : 0) + 
                     (processedKeywords ? processedKeywords.count : 0) + 
                     (failedKeywords ? failedKeywords.count : 0),
      wordpressPosts: wpPostCount
    };
  }
};

module.exports = websiteDb;