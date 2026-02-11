// middleware/website-auth.js - DEPLOY THIS TO YOUR CLOUDWAYS SERVER
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

// Get websites for an organization (ADMIN ONLY)
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

// NEW: Get websites that a specific user has permission to access
async function getUserPermittedWebsites(userId, organizationId) {
  if (!userId || !organizationId) {
    console.log('getUserPermittedWebsites: Missing userId or organizationId');
    return [];
  }
  
  // First check if table exists
  const tableExists = await checkWebsitesTable();
  if (!tableExists) {
    return [];
  }

  // Ensure permissions table exists
  await ensureWebsitePermissionsTable();
  
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(path.join(__dirname, '../data/recipes.db'));
    db.all(
      `SELECT w.* FROM websites w
       INNER JOIN website_permissions wp ON w.id = wp.website_id
       WHERE wp.user_id = ? AND w.organization_id = ?
       ORDER BY w.name ASC`,
      [userId, organizationId],
      (err, rows) => {
        db.close();
        if (err) {
          console.error("Error getting user permitted websites:", err);
          resolve([]);
        } else {
          console.log(`Found ${(rows || []).length} permitted websites for user ${userId}`);
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

// Check if user has permission to access a specific website
async function userHasWebsitePermission(userId, websiteId, userRole = 'employee') {
  if (!userId || !websiteId) {
    return false;
  }

  // Admins always have access
  if (userRole === 'admin') {
    return true;
  }

  // Ensure permissions table exists
  await ensureWebsitePermissionsTable();

  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(path.join(__dirname, '../data/recipes.db'));
    db.get(
      `SELECT * FROM website_permissions WHERE user_id = ? AND website_id = ?`,
      [userId, websiteId],
      (err, row) => {
        db.close();
        if (err) {
          console.error("Error checking user website permission:", err);
          resolve(false);
        } else {
          resolve(!!row);
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
        // For employees, also check if they have permission
        if (req.session.user.role !== 'admin') {
          const hasPermission = await userHasWebsitePermission(
            req.session.user.id, 
            req.session.currentWebsiteId, 
            req.session.user.role
          );
          
          if (!hasPermission) {
            console.log(`Employee ${req.session.user.id} does not have permission for website ${req.session.currentWebsiteId}, clearing selection`);
            delete req.session.currentWebsiteId;
            global.currentWebsiteId = null;
            return next();
          }
        }
        
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

// FIXED: Get websites based on user permissions
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

    // FIXED: Get websites based on user role and permissions
    let websites;
    
    if (req.session.user.role === 'admin') {
      // Admins see all websites in their organization
      console.log(`Getting all websites for admin user ${req.session.user.id}`);
      websites = await getWebsitesByOrganization(organizationId);
    } else {
      // Employees only see websites they have explicit permission for
      console.log(`Getting permitted websites for employee user ${req.session.user.id}`);
      websites = await getUserPermittedWebsites(req.session.user.id, organizationId);
    }
    
    console.log(`User ${req.session.user.id} (${req.session.user.role}) has access to ${(websites || []).length} websites`);
    
    // Attach to res.locals for templates
    res.locals.websites = websites || [];
    res.locals.currentWebsiteId = req.session.currentWebsiteId || null;
    res.locals.needsWebsiteSetup = false;
    
    // FIXED: Auto-select logic - only from permitted websites
    const isWebsiteSwitchRequest = req.path.includes('/websites/switch') || req.body.websiteId;

    if (websites && websites.length > 0) {
      // Check if current website is valid and user has permission
      let currentWebsiteValid = false;
      
      if (req.session.currentWebsiteId) {
        currentWebsiteValid = websites.some(w => w.id === req.session.currentWebsiteId);
      }
      
      // If no valid website is selected or current selection is invalid, auto-select first permitted one
      if (!currentWebsiteValid && !isWebsiteSwitchRequest) {
        console.log(`Auto-selecting first permitted website: ${websites[0].id} (${websites[0].name}) for user: ${req.session.user.id}`);
        req.session.currentWebsiteId = websites[0].id;
        global.currentWebsiteId = websites[0].id;
        res.locals.currentWebsiteId = websites[0].id;
        
        // Save the session immediately
        req.session.save((err) => {
          if (err) {
            console.error('Error saving session after auto-website selection:', err);
          }
        });
      }
    } else if (req.session.user.role !== 'admin') {
      // Employee has no website permissions, clear any existing selection
      if (req.session.currentWebsiteId) {
        console.log(`Employee ${req.session.user.id} has no website permissions, clearing current selection`);
        delete req.session.currentWebsiteId;
        global.currentWebsiteId = null;
        res.locals.currentWebsiteId = null;
      }
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
    // Check if employee has access to this website
    const hasPermission = await userHasWebsitePermission(
      req.session.user.id, 
      req.session.currentWebsiteId, 
      req.session.user.role
    );
    
    if (!hasPermission) {
      console.log(`Access denied: User ${req.session.user.id} does not have permission for website ${req.session.currentWebsiteId}`);
      req.session.errorMessage = 'You do not have access to this website. Please contact an administrator.';
      delete req.session.currentWebsiteId;
      global.currentWebsiteId = null;
      return res.redirect('/website-select');
    }
    
    next();
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
  getUserPermittedWebsites,
  getWebsiteById,
  userHasWebsitePermission,
  attachWebsiteToRequest,
  getUserWebsites,
  ensureWebsitePermissionsTable,
  hasWebsiteAccess,
  ensureWebsiteSelected
};