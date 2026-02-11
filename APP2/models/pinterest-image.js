// models/pinterest-image.js
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

// Pinterest Images operations
const pinterestImageDb = {
  // Initialize pinterest_images table
  async initTable() {
    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS pinterest_images (
        id TEXT PRIMARY KEY,
        recipe_id TEXT,
        keyword TEXT NOT NULL,
        text_overlay TEXT NOT NULL,
        top_image_url TEXT NOT NULL,
        bottom_image_url TEXT NOT NULL,
        image_path TEXT NOT NULL,
        image_url TEXT NOT NULL,
        filename TEXT NOT NULL,
        width INTEGER DEFAULT 561,
        height INTEGER DEFAULT 1120,
        organization_id TEXT NOT NULL,
        website_id TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        generation_metadata TEXT,
        FOREIGN KEY (recipe_id) REFERENCES recipes(id),
        FOREIGN KEY (website_id) REFERENCES websites(id)
      )
    `;
    
    try {
      await runQuery(createTableQuery);
      console.log('✅ Pinterest images table initialized successfully');
      
      // Also initialize Pinterest templates table
      const templatesTableQuery = `
        CREATE TABLE IF NOT EXISTS pinterest_templates (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          template_data TEXT NOT NULL,
          thumbnail TEXT,
          organizationId TEXT NOT NULL,
          websiteId TEXT NOT NULL,
          userId TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (organizationId) REFERENCES organizations(id),
          FOREIGN KEY (websiteId) REFERENCES websites(id),
          FOREIGN KEY (userId) REFERENCES users(id)
        )
      `;
      
      await runQuery(templatesTableQuery);
      console.log('✅ Pinterest templates table initialized successfully');
    } catch (error) {
      console.error('❌ Error initializing pinterest tables:', error);
      throw error;
    }
  },

  // Create Pinterest image record
  async createPinterestImage(imageData) {
    const {
      recipeId,
      keyword,
      textOverlay,
      topImageUrl,
      bottomImageUrl,
      imagePath,
      imageUrl,
      filename,
      width = 561,
      height = 1120,
      organizationId,
      websiteId,
      generationMetadata = {}
    } = imageData;

    if (!keyword || !textOverlay || !imagePath || !organizationId) {
      throw new Error('Keyword, text overlay, image path, and organization ID are required');
    }

    const id = uuidv4();
    const metadataJson = JSON.stringify(generationMetadata);

    try {
      await runQuery(`
        INSERT INTO pinterest_images (
          id, recipe_id, keyword, text_overlay, top_image_url, bottom_image_url,
          image_path, image_url, filename, width, height, organization_id, 
          website_id, generation_metadata
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        id, recipeId, keyword, textOverlay, topImageUrl, bottomImageUrl,
        imagePath, imageUrl, filename, width, height, organizationId,
        websiteId, metadataJson
      ]);

      return await this.getPinterestImageById(id);
    } catch (error) {
      console.error('❌ Error creating Pinterest image record:', error);
      throw error;
    }
  },

  // Get Pinterest image by ID
  async getPinterestImageById(id) {
    if (!id) {
      throw new Error('Pinterest image ID is required');
    }

    try {
      const image = await getOne(`
        SELECT * FROM pinterest_images WHERE id = ?
      `, [id]);

      if (image && image.generation_metadata) {
        try {
          image.generation_metadata = JSON.parse(image.generation_metadata);
        } catch (e) {
          image.generation_metadata = {};
        }
      }

      return image;
    } catch (error) {
      console.error('❌ Error getting Pinterest image:', error);
      throw error;
    }
  },

  // Get Pinterest images by recipe ID
  async getPinterestImagesByRecipeId(recipeId) {
    if (!recipeId) {
      return [];
    }

    try {
      const images = await getAll(`
        SELECT * FROM pinterest_images 
        WHERE recipe_id = ?
        ORDER BY created_at DESC
      `, [recipeId]);

      return images.map(image => {
        if (image.generation_metadata) {
          try {
            image.generation_metadata = JSON.parse(image.generation_metadata);
          } catch (e) {
            image.generation_metadata = {};
          }
        }
        return image;
      });
    } catch (error) {
      console.error('❌ Error getting Pinterest images by recipe ID:', error);
      throw error;
    }
  },

  // Get Pinterest images by organization
  async getPinterestImagesByOrganization(organizationId, options = {}) {
    const { websiteId, limit = 50, offset = 0 } = options;

    if (!organizationId) {
      return [];
    }

    try {
      let query = `
        SELECT pi.*, r.title as recipe_title, w.name as website_name
        FROM pinterest_images pi
        LEFT JOIN recipes r ON pi.recipe_id = r.id
        LEFT JOIN websites w ON pi.website_id = w.id
        WHERE pi.organization_id = ?
      `;
      const params = [organizationId];

      if (websiteId) {
        query += ` AND pi.website_id = ?`;
        params.push(websiteId);
      }

      query += ` ORDER BY pi.created_at DESC LIMIT ? OFFSET ?`;
      params.push(limit, offset);

      const images = await getAll(query, params);

      return images.map(image => {
        if (image.generation_metadata) {
          try {
            image.generation_metadata = JSON.parse(image.generation_metadata);
          } catch (e) {
            image.generation_metadata = {};
          }
        }
        return image;
      });
    } catch (error) {
      console.error('❌ Error getting Pinterest images by organization:', error);
      throw error;
    }
  },

  // Get Pinterest images by keyword
  async getPinterestImagesByKeyword(keyword, organizationId) {
    if (!keyword || !organizationId) {
      return [];
    }

    try {
      const images = await getAll(`
        SELECT * FROM pinterest_images 
        WHERE keyword LIKE ? AND organization_id = ?
        ORDER BY created_at DESC
      `, [`%${keyword}%`, organizationId]);

      return images.map(image => {
        if (image.generation_metadata) {
          try {
            image.generation_metadata = JSON.parse(image.generation_metadata);
          } catch (e) {
            image.generation_metadata = {};
          }
        }
        return image;
      });
    } catch (error) {
      console.error('❌ Error getting Pinterest images by keyword:', error);
      throw error;
    }
  },

  // Get Pinterest images by keyword ID
  async getPinterestImagesByKeywordId(keywordId) {
    if (!keywordId) {
      return [];
    }

    try {
      // First get the keyword to find the recipe_id
      const { getAll: keywordGetAll } = require('../db');
      const keywords = await keywordGetAll(`
        SELECT recipe_id FROM keywords WHERE id = ?
      `, [keywordId]);

      if (!keywords || keywords.length === 0) {
        return [];
      }

      const recipeId = keywords[0].recipe_id;
      if (!recipeId) {
        return [];
      }

      // Get Pinterest images by recipe_id
      return await this.getPinterestImagesByRecipeId(recipeId);
    } catch (error) {
      console.error('❌ Error getting Pinterest images by keyword ID:', error);
      throw error;
    }
  },

  // Update Pinterest image
  async updatePinterestImage(id, updates) {
    if (!id) {
      throw new Error('Pinterest image ID is required');
    }

    const allowedFields = [
      'keyword', 'text_overlay', 'top_image_url', 'bottom_image_url',
      'image_path', 'image_url', 'filename', 'generation_metadata'
    ];

    const updateFields = [];
    const params = [];

    Object.keys(updates).forEach(field => {
      if (allowedFields.includes(field) && updates[field] !== undefined) {
        updateFields.push(`${field} = ?`);
        if (field === 'generation_metadata') {
          params.push(JSON.stringify(updates[field]));
        } else {
          params.push(updates[field]);
        }
      }
    });

    if (updateFields.length === 0) {
      throw new Error('No valid fields to update');
    }

    updateFields.push('updated_at = CURRENT_TIMESTAMP');
    params.push(id);

    try {
      await runQuery(`
        UPDATE pinterest_images 
        SET ${updateFields.join(', ')}
        WHERE id = ?
      `, params);

      return await this.getPinterestImageById(id);
    } catch (error) {
      console.error('❌ Error updating Pinterest image:', error);
      throw error;
    }
  },

  // Delete Pinterest image
  async deletePinterestImage(id) {
    if (!id) {
      throw new Error('Pinterest image ID is required');
    }

    try {
      const image = await this.getPinterestImageById(id);
      if (!image) {
        throw new Error('Pinterest image not found');
      }

      await runQuery(`DELETE FROM pinterest_images WHERE id = ?`, [id]);
      
      return { success: true, deletedImage: image };
    } catch (error) {
      console.error('❌ Error deleting Pinterest image:', error);
      throw error;
    }
  },

  // Get Pinterest image statistics
  async getPinterestImageStats(organizationId, websiteId = null) {
    if (!organizationId) {
      return {
        total: 0,
        thisMonth: 0,
        thisWeek: 0,
        averagePerDay: 0
      };
    }

    try {
      let baseQuery = `FROM pinterest_images WHERE organization_id = ?`;
      const params = [organizationId];

      if (websiteId) {
        baseQuery += ` AND website_id = ?`;
        params.push(websiteId);
      }

      const [total, thisMonth, thisWeek] = await Promise.all([
        getOne(`SELECT COUNT(*) as count ${baseQuery}`, params),
        getOne(`SELECT COUNT(*) as count ${baseQuery} AND created_at >= date('now', '-30 days')`, params),
        getOne(`SELECT COUNT(*) as count ${baseQuery} AND created_at >= date('now', '-7 days')`, params)
      ]);

      const averagePerDay = thisWeek ? Math.round((thisWeek.count / 7) * 10) / 10 : 0;

      return {
        total: total?.count || 0,
        thisMonth: thisMonth?.count || 0,
        thisWeek: thisWeek?.count || 0,
        averagePerDay
      };
    } catch (error) {
      console.error('❌ Error getting Pinterest image stats:', error);
      return {
        total: 0,
        thisMonth: 0,
        thisWeek: 0,
        averagePerDay: 0
      };
    }
  }
};

module.exports = pinterestImageDb;