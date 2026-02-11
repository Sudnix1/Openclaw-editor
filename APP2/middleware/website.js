// middleware/website.js - Website access control middleware
const websiteDb = require('../models/website');

async function websiteMiddleware(req, res, next) {
  // Skip if no user is logged in
  if (!req.session || !req.session.user) {
    return next();
  }

  try {
    // Set global context for queries
    if (req.session.currentWebsiteId) {
      global.currentWebsiteId = req.session.currentWebsiteId;
    } else {
      // If no website is selected, get the first one for the organization
      const websites = await websiteDb.getWebsitesByOrganization(req.session.user.organizationId);
      if (websites && websites.length > 0) {
        req.session.currentWebsiteId = websites[0].id;
        global.currentWebsiteId = websites[0].id;
      } else {
        global.currentWebsiteId = null;
      }
    }

    // Add websites to res.locals for all templates
    const websites = await websiteDb.getWebsitesByOrganization(req.session.user.organizationId);
    res.locals.websites = websites;
    res.locals.currentWebsiteId = req.session.currentWebsiteId;

    next();
  } catch (error) {
    console.error('Website middleware error:', error);
    next(error);
  }
}

// Additional middleware functions for website access control
websiteMiddleware.hasWebsiteAccess = async function(req, res, next) {
  try {
    const userId = req.session?.user?.id;
    const websiteId = req.params.websiteId || req.body.websiteId || req.session?.selectedWebsite?.id;
    
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }
    
    if (!websiteId) {
      return res.status(400).json({ error: 'Website ID is required' });
    }
    
    // Check if user has access to this website
    const hasAccess = await websiteDb.hasAccess(userId, websiteId);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied to this website' });
    }
    
    // Store website ID in request for use in route handlers
    req.websiteId = websiteId;
    next();
  } catch (error) {
    console.error('Website access middleware error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Ensure a website is selected in the session
websiteMiddleware.ensureWebsiteSelected = function(req, res, next) {
  if (!req.session?.selectedWebsite?.id) {
    if (req.path.startsWith('/api/')) {
      return res.status(400).json({ error: 'No website selected' });
    } else {
      req.session.errorMessage = 'Please select a website to continue';
      return res.redirect('/websites');
    }
  }
  next();
};

// Load website data into res.locals for templates
websiteMiddleware.loadWebsiteData = async function(req, res, next) {
  try {
    if (req.session?.selectedWebsite?.id) {
      const website = await websiteDb.getWebsiteById(req.session.selectedWebsite.id);
      res.locals.currentWebsite = website;
      
      // Load website stats
      const stats = await websiteDb.getWebsiteStats(website.id);
      res.locals.websiteStats = stats;
    }
    next();
  } catch (error) {
    console.error('Load website data middleware error:', error);
    next(); // Continue even if website data loading fails
  }
};

module.exports = websiteMiddleware;