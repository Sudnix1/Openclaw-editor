// middleware/website-auth.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Check if websites table exists
async function checkWebsitesTable() {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(path.join(__dirname, '../data/recipes.db'));
    db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='websites'", (err, row) => {
      db.close();
      if (err) {
        reject(err);
      } else {
        resolve(!!row);
      }
    });
  });
}

// Get websites for an organization
async function getWebsitesByOrganization(organizationId) {
  if (!organizationId) {
    return [];
  }
  
  // First check if table exists
  const tableExists = await checkWebsitesTable();
  if (!tableExists) {
    return [];
  }
  
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(path.join(__dirname, '../data/recipes.db'));
    db.all(
      `SELECT * FROM websites WHERE organization_id = ? ORDER BY name ASC`,
      [organizationId],
      (err, rows) => {
        db.close();
        if (err) {
          console.error("Error getting websites:", err);
          resolve([]);
        } else {
          resolve(rows || []);
        }
      }
    );
  });
}

// Get a website by ID
async function getWebsiteById(id) {
  if (!id) {
    return null;
  }
  
  // First check if table exists
  const tableExists = await checkWebsitesTable();
  if (!tableExists) {
    return null;
  }
  
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(path.join(__dirname, '../data/recipes.db'));
    db.get(
      `SELECT * FROM websites WHERE id = ?`,
      [id],
      (err, row) => {
        db.close();
        if (err) {
          console.error("Error getting website by ID:", err);
          resolve(null);
        } else {
          resolve(row || null);
        }
      }
    );
  });
}

// Middleware to attach website to request
async function attachWebsiteToRequest(req, res, next) {
  try {
    // Skip if no user is logged in
    if (!req.session || !req.session.user) {
      return next();
    }
    
    // Get organization ID from session
    const organizationId = req.session.user.organizationId;
    if (!organizationId) {
      return next();
    }
    
    // Check if websites table exists
    const tableExists = await checkWebsitesTable();
    if (!tableExists) {
      console.log("Websites table doesn't exist yet - skipping website attachment");
      return next();
    }
    
    // Set website context from session if exists
    if (req.session.currentWebsiteId) {
      const website = await getWebsiteById(req.session.currentWebsiteId);
      if (website && website.organization_id === organizationId) {
        // Set in global context
        global.currentWebsiteId = req.session.currentWebsiteId;
        
        // Attach to request
        req.website = website;
      } else {
        // Invalid website ID, clear session and global
        delete req.session.currentWebsiteId;
        global.currentWebsiteId = null;
      }
    } else {
      // No website selected, clear global
      global.currentWebsiteId = null;
    }
    
    next();
  } catch (error) {
    console.error('Error in website request middleware:', error);
    next();
  }
}

async function getUserWebsites(req, res, next) {
  try {
    // Always store original URL for return after website switching
    res.locals.originalUrl = req.originalUrl;
    
    // Skip if no user is logged in
    if (!req.session || !req.session.user) {
      res.locals.websites = [];
      res.locals.currentWebsiteId = null;
      return next();
    }
    
    // Get organization ID from session
    const organizationId = req.session.user.organizationId;
    if (!organizationId) {
      res.locals.websites = [];
      res.locals.currentWebsiteId = null;
      return next();
    }
    
    // Check if websites table exists
    const tableExists = await checkWebsitesTable();
    
    // Always attach user to locals for templates
    res.locals.user = req.session.user;
    
    if (!tableExists) {
      console.log("Websites table doesn't exist yet - skipping website list");
      res.locals.websites = [];
      res.locals.currentWebsiteId = null;
      res.locals.needsWebsiteSetup = true;
      return next();
    }
    
    // Get all websites for the organization
    const websites = await getWebsitesByOrganization(organizationId);
    
    // Attach to res.locals for templates
    res.locals.websites = websites || [];
    res.locals.currentWebsiteId = req.session.currentWebsiteId || null;
    res.locals.needsWebsiteSetup = false;
    
    // If websites exist but no current website is selected, auto-select the first one
    // FIXED: Only auto-select if NO websites are selected AND this is not a website switch request
const isWebsiteSwitchRequest = req.path.includes('/websites/switch') || req.body.websiteId;

if (websites && websites.length > 0 && 
    !req.session.currentWebsiteId && 
    !isWebsiteSwitchRequest) {
  
  console.log(`Auto-selecting first website: ${websites[0].id} for user: ${req.session.user.id}`);
  req.session.currentWebsiteId = websites[0].id;
  global.currentWebsiteId = websites[0].id;
  res.locals.currentWebsiteId = websites[0].id;
  
  // IMPORTANT: Save the session immediately
  req.session.save((err) => {
    if (err) {
      console.error('Error saving session after auto-website selection:', err);
    }
  });
}
    
    next();
  } catch (error) {
    console.error('Error in website middleware:', error);
    // Set empty values to avoid template errors
    res.locals.websites = [];
    res.locals.currentWebsiteId = null;
    // Ensure original URL is set even in error case
    res.locals.originalUrl = req.originalUrl;
    next();
  }
}

// Helper function to check if website_permissions table exists
async function ensureWebsitePermissionsTable() {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(path.join(__dirname, '../data/recipes.db'));
    
    // First check if the table exists
    db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='website_permissions'", (err, row) => {
      if (err) {
        db.close();
        return reject(err);
      }
      
      if (row) {
        // Table exists
        db.close();
        return resolve(true);
      }
      
      // Table doesn't exist, create it
      db.run(`
        CREATE TABLE IF NOT EXISTS website_permissions (
          id TEXT PRIMARY KEY,
          website_id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (website_id) REFERENCES websites(id),
          FOREIGN KEY (user_id) REFERENCES users(id),
          UNIQUE(website_id, user_id)
        )
      `, (err) => {
        db.close();
        if (err) {
          console.error('Error creating website_permissions table:', err);
          reject(err);
        } else {
          console.log('website_permissions table created successfully');
          resolve(true);
        }
      });
    });
  });
}

// Middleware to check if user has access to the current website
async function hasWebsiteAccess(req, res, next) {
  // If no user is logged in, redirect to login
  if (!req.session.user) {
    return res.redirect('/login');
  }
  
  // If no current website is selected, proceed (they'll be asked to select one)
  if (!req.session.currentWebsiteId) {
    return next();
  }
  
  // Admins always have access to all websites
  if (req.session.user.role === 'admin') {
    return next();
  }
  
  try {
    // Ensure the permissions table exists
    await ensureWebsitePermissionsTable();
    
    // Check if employee has access to this website
    const db = new sqlite3.Database(path.join(__dirname, '../data/recipes.db'));
    
    db.get(
      `SELECT * FROM website_permissions 
       WHERE website_id = ? AND user_id = ?`,
      [req.session.currentWebsiteId, req.session.user.id],
      (err, row) => {
        db.close();
        
        if (err) {
          console.error('Error checking website access:', err);
          req.session.errorMessage = 'Error checking website access';
          return res.redirect('/');
        }
        
        if (!row) {
          req.session.errorMessage = 'You do not have access to this website. Please contact an administrator.';
          return res.redirect('/website-select');
        }
        
        next();
      }
    );
  } catch (error) {
    console.error('Error in website access middleware:', error);
    req.session.errorMessage = 'Error checking website access';
    return res.redirect('/');
  }
}

// Middleware to ensure a website is selected
function ensureWebsiteSelected(req, res, next) {
  if (!req.session.currentWebsiteId) {
    return res.redirect('/website-select');
  }
  next();
}

module.exports = {
  checkWebsitesTable,
  getWebsitesByOrganization,
  getWebsiteById,
  attachWebsiteToRequest,
  getUserWebsites,
  ensureWebsitePermissionsTable,
  hasWebsiteAccess,
  ensureWebsiteSelected
};