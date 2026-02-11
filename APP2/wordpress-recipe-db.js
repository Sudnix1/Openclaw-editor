// wordpress-recipe-db.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// Create a connection to the database
const db = new sqlite3.Database(path.join(__dirname, 'data', 'recipes.db'));

// Helper to run queries as promises
function runQuery(query, params = []) {
  return new Promise((resolve, reject) => {
    db.run(query, params, function(err) {
      if (err) {
        reject(err);
      } else {
        resolve({ lastID: this.lastID, changes: this.changes, id: params[0] });
      }
    });
  });
}

// Helper to get a single row
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

// Ensure the table exists
async function initializeTable() {
  return runQuery(`
    CREATE TABLE IF NOT EXISTS wprm_settings (
      id TEXT PRIMARY KEY,
      enabled BOOLEAN DEFAULT 0,
      add_to_all_posts BOOLEAN DEFAULT 0,
      keywords TEXT,
      last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

// Save or update WP Recipe Maker settings
async function saveSettings(settings) {
  await initializeTable();
  
  // Check if settings already exist
  const existing = await getOne('SELECT id FROM wprm_settings LIMIT 1');
  
  if (existing) {
    // Update existing settings
    return runQuery(
      `UPDATE wprm_settings 
       SET enabled = ?, add_to_all_posts = ?, keywords = ?, last_updated = CURRENT_TIMESTAMP 
       WHERE id = ?`,
      [
        settings.enabled ? 1 : 0,
        settings.addToAllPosts ? 1 : 0,
        settings.keywords || '',
        existing.id
      ]
    );
  } else {
    // Insert new settings
    const id = uuidv4();
    return runQuery(
      `INSERT INTO wprm_settings (id, enabled, add_to_all_posts, keywords)
       VALUES (?, ?, ?, ?)`,
      [
        id,
        settings.enabled ? 1 : 0,
        settings.addToAllPosts ? 1 : 0,
        settings.keywords || ''
      ]
    );
  }
}

// Get WP Recipe Maker settings
async function getSettings() {
  await initializeTable();
  
  const settings = await getOne('SELECT * FROM wprm_settings LIMIT 1');
  
  if (settings) {
    return {
      enabled: settings.enabled === 1,
      addToAllPosts: settings.add_to_all_posts === 1,
      keywords: settings.keywords || ''
    };
  } else {
    // Return default settings if none found
    return {
      enabled: false,
      addToAllPosts: false,
      keywords: ''
    };
  }
}

// Log recipe publication
async function logRecipePublication(data) {
  // Create the log table if it doesn't exist
  await runQuery(`
    CREATE TABLE IF NOT EXISTS wprm_publications (
      id TEXT PRIMARY KEY,
      recipe_id TEXT,
      wp_post_id INTEGER,
      wprm_recipe_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE
    )
  `);
  
  const id = uuidv4();
  return runQuery(
    `INSERT INTO wprm_publications (id, recipe_id, wp_post_id, wprm_recipe_id)
     VALUES (?, ?, ?, ?)`,
    [
      id,
      data.recipeId,
      data.wpPostId,
      data.wprmRecipeId
    ]
  );
}

// Get recipe publication logs
async function getRecipePublications(recipeId) {
  // Create the log table if it doesn't exist
  await runQuery(`
    CREATE TABLE IF NOT EXISTS wprm_publications (
      id TEXT PRIMARY KEY,
      recipe_id TEXT,
      wp_post_id INTEGER,
      wprm_recipe_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE
    )
  `);
  
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT * FROM wprm_publications WHERE recipe_id = ? ORDER BY created_at DESC`,
      [recipeId],
      (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      }
    );
  });
}

module.exports = {
  saveSettings,
  getSettings,
  logRecipePublication,
  getRecipePublications
};