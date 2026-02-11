// website-routes.js
const express = require('express');
const router = express.Router();
const { isAuthenticated, isAdmin } = require('./middleware/auth');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Helper function to check if websites table exists
async function checkWebsitesTable() {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(path.join(__dirname, 'data/recipes.db'));
    db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='websites'", (err, row) => {
      db.close();
      if (err) {
        reject(err);
      } else {
        resolve(row ? true : false);
      }
    });
  });
}

// Helper function to get websites for an organization
async function getWebsitesByOrganization(organizationId) {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(path.join(__dirname, 'data/recipes.db'));
    db.all("SELECT * FROM websites WHERE organization_id = ?", [organizationId], (err, rows) => {
      db.close();
      if (err) {
        reject(err);
      } else {
        resolve(rows || []);
      }
    });
  });
}

// Setup websites page (admin only)
router.get('/setup-websites', isAuthenticated, isAdmin, (req, res) => {
  res.render('setup-websites', {
    pageTitle: 'Setup Websites',
    activePage: 'websites',
    title: 'RecipeGen AI - Setup Website Management',
    errorMessage: req.session.errorMessage,
    successMessage: req.session.successMessage
  });
  
  // Clear messages
  delete req.session.errorMessage;
  delete req.session.successMessage;
});

// Run website migration (admin only)
router.get('/run-website-migration', isAuthenticated, isAdmin, async (req, res) => {
  try {
    // Run the table check first
    const tableExists = await checkWebsitesTable();
    
    // If table exists, just redirect to websites page
    if (tableExists) {
      req.session.successMessage = 'Website management is already set up.';
      return res.redirect('/websites');
    }
    
    const db = new sqlite3.Database(path.join(__dirname, 'data/recipes.db'));
    
    // Manually create the websites table
    await new Promise((resolve, reject) => {
      db.run(`
        CREATE TABLE IF NOT EXISTS websites (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          url TEXT,
          organization_id TEXT NOT NULL,
          wordpress_api_url TEXT,
          wordpress_username TEXT,
          wordpress_password TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
    
    // Close database
    db.close();
    
    // Run the column migration script directly
    require('./add-website-columns');
    
    req.session.successMessage = 'Website management tables created. Please rerun the create-websites-table.js script to complete the setup.';
    res.redirect('/');
  } catch (error) {
    console.error('Error in website migration:', error);
    req.session.errorMessage = 'Error setting up websites: ' + error.message;
    res.redirect('/');
  }
});

// GET route for editing website
router.get('/websites/edit/:id', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const websiteId = req.params.id;
    const db = new sqlite3.Database(path.join(__dirname, 'data/recipes.db'));
    
    // Get website details
    const website = await new Promise((resolve, reject) => {
      db.get(
        `SELECT * FROM websites WHERE id = ? AND organization_id = ?`,
        [websiteId, req.session.user.organizationId],
        (err, row) => {
          if (err) {
            reject(err);
          } else {
            resolve(row);
          }
        }
      );
    });
    
    db.close();
    
    if (!website) {
      req.session.errorMessage = 'Website not found or you do not have permission to edit it.';
      return res.redirect('/websites');
    }
    
    res.render('website-edit', {
      website: website,
      pageTitle: 'Edit Website',
      activePage: 'websites',
      title: 'RecipeGen AI - Edit Website',
      errorMessage: req.session.errorMessage,
      successMessage: req.session.successMessage
    });
    
    // Clear messages
    delete req.session.errorMessage;
    delete req.session.successMessage;
  } catch (error) {
    console.error('Error loading website for edit:', error);
    req.session.errorMessage = error.message || 'Error loading website';
    res.redirect('/websites');
  }
});

// POST route for updating website
router.post('/websites/edit/:id', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const websiteId = req.params.id;
    const { name, url, wordpressApiUrl, wordpressUsername, wordpressPassword } = req.body;
    
    if (!name) {
      req.session.errorMessage = 'Website name is required';
      return res.redirect(`/websites/edit/${websiteId}`);
    }
    
    const db = new sqlite3.Database(path.join(__dirname, 'data/recipes.db'));
    
    // Verify website exists and belongs to user's organization
    const website = await new Promise((resolve, reject) => {
      db.get(
        `SELECT * FROM websites WHERE id = ? AND organization_id = ?`,
        [websiteId, req.session.user.organizationId],
        (err, row) => {
          if (err) {
            reject(err);
          } else {
            resolve(row);
          }
        }
      );
    });
    
    if (!website) {
      db.close();
      req.session.errorMessage = 'Website not found or you do not have permission to edit it.';
      return res.redirect('/websites');
    }
    
    // Prepare the SQL query
    let sql, params;
    if (wordpressPassword && wordpressPassword !== '********') {
      // Update with new password
      sql = `
        UPDATE websites 
        SET name = ?, url = ?, wordpress_api_url = ?, wordpress_username = ?, wordpress_password = ?
        WHERE id = ? AND organization_id = ?
      `;
      params = [name, url || '', wordpressApiUrl || '', wordpressUsername || '', wordpressPassword, websiteId, req.session.user.organizationId];
    } else {
      // Keep existing password
      sql = `
        UPDATE websites 
        SET name = ?, url = ?, wordpress_api_url = ?, wordpress_username = ?
        WHERE id = ? AND organization_id = ?
      `;
      params = [name, url || '', wordpressApiUrl || '', wordpressUsername || '', websiteId, req.session.user.organizationId];
    }
    
    // Update the website
    await new Promise((resolve, reject) => {
      db.run(sql, params, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
    
    db.close();
    
    req.session.successMessage = 'Website updated successfully';
    res.redirect('/websites');
  } catch (error) {
    console.error('Error updating website:', error);
    req.session.errorMessage = error.message || 'Error updating website';
    res.redirect(`/websites/edit/${req.params.id}`);
  }
});

// Add to website-routes.js
// Delete website (admin only)
router.post('/websites/delete/:id', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const websiteId = req.params.id;
    const db = new sqlite3.Database(path.join(__dirname, 'data/recipes.db'));
    
    // Check if this is the only website
    const websiteCount = await new Promise((resolve, reject) => {
      db.get(
        `SELECT COUNT(*) as count FROM websites WHERE organization_id = ?`,
        [req.session.user.organizationId],
        (err, row) => {
          if (err) {
            reject(err);
          } else {
            resolve(row.count);
          }
        }
      );
    });
    
    if (websiteCount <= 1) {
      req.session.errorMessage = 'Cannot delete the only website. Organizations must have at least one website.';
      db.close();
      return res.redirect('/websites');
    }
    
    // Check if the website belongs to this organization
    const website = await new Promise((resolve, reject) => {
      db.get(
        `SELECT * FROM websites WHERE id = ? AND organization_id = ?`,
        [websiteId, req.session.user.organizationId],
        (err, row) => {
          if (err) {
            reject(err);
          } else {
            resolve(row);
          }
        }
      );
    });
    
    if (!website) {
      req.session.errorMessage = 'Website not found or you do not have permission to delete it.';
      db.close();
      return res.redirect('/websites');
    }
    
    // Delete the website
    await new Promise((resolve, reject) => {
      db.run(
        `DELETE FROM websites WHERE id = ?`,
        [websiteId],
        (err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        }
      );
    });
    
    // If this was the current website, switch to another one
    if (req.session.currentWebsiteId === websiteId) {
      // Find another website to switch to
      const anotherWebsite = await new Promise((resolve, reject) => {
        db.get(
          `SELECT id FROM websites WHERE organization_id = ? AND id != ? LIMIT 1`,
          [req.session.user.organizationId, websiteId],
          (err, row) => {
            if (err) {
              reject(err);
            } else {
              resolve(row);
            }
          }
        );
      });
      
      if (anotherWebsite) {
        req.session.currentWebsiteId = anotherWebsite.id;
        global.currentWebsiteId = anotherWebsite.id;
      } else {
        delete req.session.currentWebsiteId;
        global.currentWebsiteId = null;
      }
    }
    
    db.close();
    
    req.session.successMessage = 'Website deleted successfully';
    res.redirect('/websites');
  } catch (error) {
    console.error('Error deleting website:', error);
    req.session.errorMessage = error.message || 'Error deleting website';
    res.redirect('/websites');
  }
});

// Get websites page (admin only)
// Get websites page (admin only)
router.get('/websites', isAuthenticated, isAdmin, async (req, res) => {
  try {
    // Check if table exists
    const tableExists = await checkWebsitesTable();
    
    if (!tableExists) {
      req.session.errorMessage = 'Website management is not set up yet.';
      return res.redirect('/setup-websites');
    }
    
    // Get websites for the organization
    const websites = await getWebsitesByOrganization(req.session.user.organizationId);
    
    // Enhance each website with employee access information
    for (const website of websites) {
      // Get employees with access to this website
      const employeeAccess = await getEmployeesWithAccess(website.id);
      website.employeeAccess = employeeAccess;
    }
    
    res.render('websites', {
      websites: websites,
      currentWebsiteId: req.session.currentWebsiteId,
      pageTitle: 'Manage Websites',
      activePage: 'websites',
      title: 'RecipeGen AI - Manage Websites',
      errorMessage: req.session.errorMessage,
      successMessage: req.session.successMessage
    });
    
    // Clear messages
    delete req.session.errorMessage;
    delete req.session.successMessage;
  } catch (error) {
    console.error('Error loading websites:', error);
    res.render('error', {
      message: 'Failed to load websites: ' + error.message,
      error: error,
      pageTitle: 'Error',
      activePage: '',
      title: 'RecipeGen AI - Error'
    });
  }
});

// Helper function to get employees with access to a website
async function getEmployeesWithAccess(websiteId) {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(path.join(__dirname, 'data/recipes.db'));
    
    db.all(`
      SELECT u.id, u.name, u.email, u.role 
      FROM users u
      JOIN website_permissions wp ON u.id = wp.user_id
      WHERE wp.website_id = ? AND u.role != 'admin'
      ORDER BY u.name
    `, [websiteId], (err, rows) => {
      db.close();
      if (err) {
        reject(err);
      } else {
        resolve(rows || []);
      }
    });
  });
}


// GET route for adding a new website
router.get('/websites/add', isAuthenticated, isAdmin, (req, res) => {
  res.render('website-add', {
    pageTitle: 'Add Website',
    activePage: 'websites',
    title: 'RecipeGen AI - Add Website',
    errorMessage: req.session.errorMessage,
    successMessage: req.session.successMessage
  });
  
  // Clear messages
  delete req.session.errorMessage;
  delete req.session.successMessage;
});

// POST route for adding a new website
router.post('/websites/add', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const { name, url, wordpressApiUrl, wordpressUsername, wordpressPassword } = req.body;
    
    if (!name) {
      req.session.errorMessage = 'Website name is required';
      return res.redirect('/websites/add');
    }
    
    const db = new sqlite3.Database(path.join(__dirname, 'data/recipes.db'));
    const websiteId = require('uuid').v4();
    
    // Create the new website
    await new Promise((resolve, reject) => {
      db.run(
        `INSERT INTO websites (id, name, url, organization_id, wordpress_api_url, wordpress_username, wordpress_password) 
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [websiteId, name, url || '', req.session.user.organizationId, wordpressApiUrl || '', wordpressUsername || '', wordpressPassword || ''],
        (err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        }
      );
    });
    
    db.close();
    
    req.session.successMessage = 'Website added successfully';
    res.redirect('/websites');
  } catch (error) {
    console.error('Error adding website:', error);
    req.session.errorMessage = error.message || 'Error adding website';
    res.redirect('/websites/add');
  }
});

router.post('/websites/switch', isAuthenticated, async (req, res) => {
  try {
    const { websiteId, returnUrl } = req.body;
    
    if (!websiteId) {
      console.log('❌ Website switch failed: No website ID provided');
      req.session.errorMessage = 'No website selected';
      
      if (req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'))) {
        return res.status(400).json({ success: false, message: 'Website ID required' });
      }
      return res.redirect(returnUrl || '/');
    }
    
    console.log(`🔄 Switching to website: ${websiteId} for user: ${req.session.user.id} (${req.session.user.role})`);
    
    const db = new sqlite3.Database(path.join(__dirname, 'data/recipes.db'));
    
    // First verify website exists and belongs to user's organization
    const website = await new Promise((resolve, reject) => {
      db.get(
        `SELECT * FROM websites 
         WHERE id = ? AND organization_id = ?`,
        [websiteId, req.session.user.organizationId],
        (err, row) => {
          if (err) {
            reject(err);
          } else {
            resolve(row);
          }
        }
      );
    });
    
    if (!website) {
      db.close();
      console.log('❌ Website switch failed: Website not found or not in user organization');
      req.session.errorMessage = 'Invalid website selection';
      
      if (req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'))) {
        return res.status(404).json({ success: false, message: 'Invalid website selection' });
      }
      return res.redirect(returnUrl || '/');
    }
    
    // Check if user has permission to access this website
    if (req.session.user.role !== 'admin') {
      const hasPermission = await new Promise((resolve, reject) => {
        db.get(
          `SELECT * FROM website_permissions 
           WHERE website_id = ? AND user_id = ?`,
          [websiteId, req.session.user.id],
          (err, row) => {
            if (err) {
              reject(err);
            } else {
              resolve(!!row);
            }
          }
        );
      });
      
      if (!hasPermission) {
        db.close();
        console.log(`❌ Website switch failed: Employee ${req.session.user.id} does not have permission for website ${websiteId}`);
        req.session.errorMessage = 'You do not have permission to access this website. Please contact an administrator.';
        
        if (req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'))) {
          return res.status(403).json({ success: false, message: 'You do not have permission to access this website' });
        }
        return res.redirect(returnUrl || '/website-select');
      }
    }
    
    db.close();
    
    // Update session and global context
    req.session.currentWebsiteId = websiteId;
    global.currentWebsiteId = websiteId;
    
    console.log(`✅ Successfully switched to website: ${websiteId} (${website.name}) for user: ${req.session.user.id}`);
    
    // CRITICAL: Save the session before responding
    req.session.save((err) => {
      if (err) {
        console.error('❌ Error saving session during website switch:', err);
        req.session.errorMessage = 'Session save failed';
        
        if (req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'))) {
          return res.status(500).json({ success: false, message: 'Session save failed' });
        }
        return res.redirect(returnUrl || '/');
      }
      
      // Determine redirect URL
      const redirectUrl = returnUrl || '/keywords';
      
      // Handle both AJAX and regular requests
      if (req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'))) {
        return res.json({ 
          success: true, 
          redirectUrl: redirectUrl,
          websiteId: websiteId,
          websiteName: website.name
        });
      } else {
        return res.redirect(redirectUrl);
      }
    });
    
  } catch (error) {
    console.error('❌ Error switching website:', error);
    req.session.errorMessage = 'Error switching website: ' + error.message;
    
    if (req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'))) {
      return res.status(500).json({ success: false, message: error.message });
    }
    res.redirect(req.body.returnUrl || '/');
  }
});

// Permissions management routes
router.get('/websites/permissions/:id', isAuthenticated, isAdmin, async (req, res) => {
  try {

    await ensureWebsitePermissionsTable();

    const websiteId = req.params.id;
    const db = new sqlite3.Database(path.join(__dirname, 'data/recipes.db'));
    
    // Get website details
    const website = await new Promise((resolve, reject) => {
      db.get(
        `SELECT * FROM websites WHERE id = ? AND organization_id = ?`,
        [websiteId, req.session.user.organizationId],
        (err, row) => {
          if (err) {
            reject(err);
          } else {
            resolve(row);
          }
        }
      );
    });
    
    if (!website) {
      db.close();
      req.session.errorMessage = 'Website not found or you do not have permission to manage it.';
      return res.redirect('/websites');
    }
    
    // Get all users in the organization
    const users = await new Promise((resolve, reject) => {
      db.all(
        `SELECT * FROM users WHERE organization_id = ?`,
        [req.session.user.organizationId],
        (err, rows) => {
          if (err) {
            reject(err);
          } else {
            resolve(rows || []);
          }
        }
      );
    });
    
    // Get permissions for this website
    const permissions = await new Promise((resolve, reject) => {
      db.all(
        `SELECT * FROM website_permissions WHERE website_id = ?`,
        [websiteId],
        (err, rows) => {
          if (err) {
            reject(err);
          } else {
            resolve(rows || []);
          }
        }
      );
    });
    
    // Mark users who have access
    const usersWithAccessInfo = users.map(user => {
      const hasAccess = user.role === 'admin' || 
                        permissions.some(p => p.user_id === user.id);
      return { ...user, hasAccess };
    });
    
    db.close();
    
    res.render('website-permissions', {
      website: website,
      users: usersWithAccessInfo,
      pageTitle: 'Website Permissions',
      activePage: 'websites',
      title: 'RecipeGen AI - Website Permissions',
      errorMessage: req.session.errorMessage,
      successMessage: req.session.successMessage
    });
    
    // Clear messages
    delete req.session.errorMessage;
    delete req.session.successMessage;
  } catch (error) {
    console.error('Error loading website permissions:', error);
    req.session.errorMessage = error.message || 'Error loading permissions';
    res.redirect('/websites');
  }
});

router.get('/website-select', isAuthenticated, async (req, res) => {
  try {
    // Ensure the permissions table exists
    await ensureWebsitePermissionsTable();
    
    const db = new sqlite3.Database(path.join(__dirname, 'data/recipes.db'));
    
    // Get websites this user has access to based on their role
    let websites;
    
    if (req.session.user.role === 'admin') {
      // Admins see all websites in their organization
      console.log(`Loading website selection for admin user ${req.session.user.id}`);
      websites = await new Promise((resolve, reject) => {
        db.all(
          `SELECT * FROM websites WHERE organization_id = ? ORDER BY name ASC`,
          [req.session.user.organizationId],
          (err, rows) => {
            if (err) {
              reject(err);
            } else {
              resolve(rows || []);
            }
          }
        );
      });
    } else {
      // Employees only see websites they have explicit permission for
      console.log(`Loading website selection for employee user ${req.session.user.id}`);
      websites = await new Promise((resolve, reject) => {
        db.all(
          `SELECT w.* FROM websites w
           INNER JOIN website_permissions wp ON w.id = wp.website_id
           WHERE wp.user_id = ? AND w.organization_id = ?
           ORDER BY w.name ASC`,
          [req.session.user.id, req.session.user.organizationId],
          (err, rows) => {
            if (err) {
              reject(err);
            } else {
              resolve(rows || []);
            }
          }
        );
      });
    }
    
    db.close();
    
    console.log(`User ${req.session.user.id} (${req.session.user.role}) can select from ${(websites || []).length} websites`);
    
    // If employee has no websites, show appropriate message
    if (req.session.user.role !== 'admin' && (!websites || websites.length === 0)) {
      req.session.errorMessage = 'You do not have access to any websites. Please contact an administrator to grant you access.';
    }
    
    res.render('website-select', {
      websites: websites || [],
      pageTitle: 'Select Website',
      activePage: '',
      title: 'RecipeGen AI - Select Website',
      errorMessage: req.session.errorMessage,
      successMessage: req.session.successMessage
    });
    
    // Clear messages
    delete req.session.errorMessage;
    delete req.session.successMessage;
  } catch (error) {
    console.error('Error loading website selection:', error);
    res.render('error', {
      message: 'Failed to load website selection: ' + error.message,
      error: error,
      pageTitle: 'Error',
      activePage: '',
      title: 'RecipeGen AI - Error'
    });
  }
});

// Toggle permission for a user
router.post('/websites/permissions/:id/toggle', isAuthenticated, isAdmin, async (req, res) => {
  try {

    await ensureWebsitePermissionsTable();

    const websiteId = req.params.id;
    const { userId } = req.body;
    
    if (!userId) {
      req.session.errorMessage = 'User ID is required';
      return res.redirect(`/websites/permissions/${websiteId}`);
    }
    
    const db = new sqlite3.Database(path.join(__dirname, 'data/recipes.db'));
    
    // Check if user belongs to this organization
    const user = await new Promise((resolve, reject) => {
      db.get(
        `SELECT * FROM users WHERE id = ? AND organization_id = ?`,
        [userId, req.session.user.organizationId],
        (err, row) => {
          if (err) {
            reject(err);
          } else {
            resolve(row);
          }
        }
      );
    });
    
    if (!user || user.role === 'admin') {
      db.close();
      req.session.errorMessage = 'Invalid user selection or user is an admin (admins always have access)';
      return res.redirect(`/websites/permissions/${websiteId}`);
    }
    
    // Check if permission already exists
    const existingPermission = await new Promise((resolve, reject) => {
      db.get(
        `SELECT * FROM website_permissions WHERE website_id = ? AND user_id = ?`,
        [websiteId, userId],
        (err, row) => {
          if (err) {
            reject(err);
          } else {
            resolve(row);
          }
        }
      );
    });
    
    if (existingPermission) {
      // Remove permission
      await new Promise((resolve, reject) => {
        db.run(
          `DELETE FROM website_permissions WHERE website_id = ? AND user_id = ?`,
          [websiteId, userId],
          (err) => {
            if (err) {
              reject(err);
            } else {
              resolve();
            }
          }
        );
      });
      
      req.session.successMessage = `Access removed for ${user.name}`;
    } else {
      // Add permission
      const permissionId = require('uuid').v4();
      await new Promise((resolve, reject) => {
        db.run(
          `INSERT INTO website_permissions (id, website_id, user_id) VALUES (?, ?, ?)`,
          [permissionId, websiteId, userId],
          (err) => {
            if (err) {
              reject(err);
            } else {
              resolve();
            }
          }
        );
      });
      
      req.session.successMessage = `Access granted to ${user.name}`;
    }
    
    db.close();
    res.redirect(`/websites/permissions/${websiteId}`);
  } catch (error) {
    console.error('Error toggling website permission:', error);
    req.session.errorMessage = error.message || 'Error updating permission';
    res.redirect(`/websites/permissions/${req.params.id}`);
  }
});

// Helper function to check if website_permissions table exists
async function ensureWebsitePermissionsTable() {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(path.join(__dirname, 'data/recipes.db'));
    
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
module.exports = router;