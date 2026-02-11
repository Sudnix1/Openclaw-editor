// models/buffer.js - Buffer integration and posting scheduler
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
const moment = require('moment');
const { HttpsProxyAgent } = require('https-proxy-agent');

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

const bufferDb = {
  // Get Buffer settings for a website
  async getBufferSettings(websiteId) {
    const website = await getOne(`
      SELECT buffer_enabled, buffer_access_token, buffer_profile_ids 
      FROM websites 
      WHERE id = ?
    `, [websiteId]);
    
    if (!website) return null;
    
    return {
      enabled: website.buffer_enabled,
      accessToken: website.buffer_access_token,
      profileIds: website.buffer_profile_ids ? JSON.parse(website.buffer_profile_ids) : []
    };
  },

  // Save Buffer settings for a website
  async saveBufferSettings(websiteId, settings) {
    await runQuery(`
      UPDATE websites 
      SET buffer_enabled = ?, buffer_access_token = ?, buffer_profile_ids = ?
      WHERE id = ?
    `, [
      settings.enabled ? 1 : 0,
      settings.accessToken || null,
      settings.profileIds ? JSON.stringify(settings.profileIds) : null,
      websiteId
    ]);
  },



};

// Buffer API integration
class BufferAPI {
  constructor(accessToken, proxyUrl = null) {
    this.accessToken = accessToken;
    this.baseURL = 'https://api.bufferapp.com/1';
    
    // Set up proxy configuration if provided
    this.axiosConfig = {};
    if (proxyUrl) {
      this.axiosConfig.httpsAgent = new HttpsProxyAgent(proxyUrl);
      this.axiosConfig.proxy = false; // Disable axios built-in proxy when using custom agent
    }
  }

  // Get user's Buffer profiles
  async getProfiles() {
    try {
      const response = await axios.get(`${this.baseURL}/profiles.json`, {
        params: { access_token: this.accessToken },
        ...this.axiosConfig
      });
      return response.data;
    } catch (error) {
      throw new Error(`Buffer API error: ${error.response?.data?.message || error.message}`);
    }
  }

  // Create a new post
  async createPost(profileId, content, imageUrl = null, scheduledAt = null) {
    try {
      const postData = {
        access_token: this.accessToken,
        text: content,
        profile_ids: [profileId]
      };

      if (imageUrl) {
        postData.media = {
          photo: imageUrl
        };
      }

      if (scheduledAt) {
        postData.scheduled_at = Math.floor(new Date(scheduledAt).getTime() / 1000);
      }

      const response = await axios.post(`${this.baseURL}/updates/create.json`, postData, this.axiosConfig);
      return response.data;
    } catch (error) {
      throw new Error(`Buffer API error: ${error.response?.data?.message || error.message}`);
    }
  }

  // Get post status
  async getPost(postId) {
    try {
      const response = await axios.get(`${this.baseURL}/updates/${postId}.json`, {
        params: { access_token: this.accessToken },
        ...this.axiosConfig
      });
      return response.data;
    } catch (error) {
      throw new Error(`Buffer API error: ${error.response?.data?.message || error.message}`);
    }
  }

  // Cancel scheduled post
  async cancelPost(postId) {
    try {
      const response = await axios.post(`${this.baseURL}/updates/${postId}/destroy.json`, {
        access_token: this.accessToken
      }, this.axiosConfig);
      return response.data;
    } catch (error) {
      throw new Error(`Buffer API error: ${error.response?.data?.message || error.message}`);
    }
  }
}

module.exports = { bufferDb, BufferAPI };