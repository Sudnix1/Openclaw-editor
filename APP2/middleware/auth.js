const userDb = require('../models/user');
const organizationDb = require('../models/organization');
const fs = require('fs'); // For synchronous methods
const fsPromises = require('fs').promises; // For promise-based methods
const path = require('path');
// Import the database utility functions
const { getOne, getAll } = require('../db');

// Fix for auth.js - Update the isAuthenticated middleware

function isAuthenticated(req, res, next) {
  // For debugging - log authentication state
  console.log('Authentication check:', {
    hasSession: !!req.session,
    hasUser: !!(req.session && req.session.user),
    userRole: req.session && req.session.user ? req.session.user.role : 'none',
    url: req.originalUrl
  });

  if (req.session && req.session.user) {
    return next();
  }
  
  // Store return path for redirect after login
  if (req.session) {
    req.session.returnTo = req.originalUrl;
    req.session.errorMessage = 'Please log in to access this page';
  }

  // For API requests, return JSON
  // Check if: 1) XHR request, 2) Accept header includes JSON, OR 3) URL starts with /api/
  if (req.xhr ||
      (req.headers.accept && req.headers.accept.includes('application/json')) ||
      req.originalUrl.startsWith('/api/')) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required',
      redirect: '/login'
    });
  }

  // For regular requests, redirect to login
  return res.redirect('/login');
}

// Middleware to check if user is an admin
function isAdmin(req, res, next) {
  if (req.session && req.session.user && req.session.user.role === 'admin') {
    return next();
  }
  
  req.session.errorMessage = 'You need admin privileges to access this page';
  
  if (req.session && req.session.user) {
    return res.redirect('/');
  } else {
    return res.redirect('/login');
  }
}

// Middleware to check if user is an employee
function isEmployee(req, res, next) {
  if (req.session && req.session.user && 
     (req.session.user.role === 'employee' || req.session.user.role === 'admin')) {
    return next();
  }
  
  req.session.errorMessage = 'You need employee privileges to access this page';
  
  if (req.session && req.session.user) {
    return res.redirect('/');
  } else {
    return res.redirect('/login');
  }
}

// Middleware to check if user owns the resource or is an admin
function isResourceOwner(req, res, next) {
  // If user is an admin, allow access to all org resources
  if (req.session && req.session.user && req.session.user.role === 'admin') {
    // Set organization filter for admins
    req.orgFilter = req.session.user.organizationId;
    return next();
  }
  
  // For employees, check if they are accessing their own data
  if (req.session && req.session.user && req.session.user.role === 'employee') {
    // Set both organization and owner filters for employees
    req.orgFilter = req.session.user.organizationId;
    req.ownerId = req.session.user.id;
    return next();
  }
  
  // Not authorized
  req.session.errorMessage = 'You do not have permission to access this resource';
  
  if (req.session && req.session.user) {
    return res.redirect('/');
  } else {
    return res.redirect('/login');
  }
}

// Add organization to request
// In auth.js middleware
async function attachOrganizationToRequest(req, res, next) {
  if (req.session && req.session.user) {
    try {
      // Get organization ID, handling both camelCase and snake_case
      const orgId = req.session.user.organizationId;
      
      if (orgId) {
        // Get organization
        const organization = await organizationDb.getOrganizationById(orgId);
        
        if (organization) {
          req.organization = organization;
          
          // Handle both old and new config file formats
          let configPath = path.join(__dirname, '../data', organization.config_file);
          
          // Try old format if file doesn't exist
          if (!fs.existsSync(configPath) && organization.config_file) {
            // Try without dashes
            const oldStyleConfigName = organization.config_file.replace(/-/g, '');
            const oldPath = path.join(__dirname, '../data', oldStyleConfigName);
            
            if (fs.existsSync(oldPath)) {
              configPath = oldPath;
            }
          }
          
          try {
            // Use fsPromises instead of fs for the readFile operation
            const orgConfigData = await fsPromises.readFile(configPath, 'utf8');
            req.orgConfig = JSON.parse(orgConfigData);
          } catch (error) {
            console.log("Could not load organization config:", error.message);
            req.orgConfig = require('../config');
          }
        }
      }
    } catch (error) {
      console.error('Error attaching organization:', error);
    }
  }
  next();
}

// Middleware for user data in views (old version - remove this)
/* function attachUserToLocals(req, res, next) {
  // Store the original URL for return after website switching
  res.locals.originalUrl = req.originalUrl;

  // Check if the session is initialized and user exists
  if (req.session) {
    // Make user and organization data available to all views
    res.locals.user = req.session.user || null;
    res.locals.organization = req.organization || null;
    res.locals.orgConfig = req.orgConfig || null;
    res.locals.isAuthenticated = !!req.session.user;
  } else {
    res.locals.user = null;
    res.locals.organization = null;
    res.locals.orgConfig = null;
    res.locals.isAuthenticated = false;
  }
  
  next();
} */

// Middleware to restrict access to admin-only pages
function adminOnlyPages(req, res, next) {
  const adminOnlyRoutes = [
    '/settings',
    '/wordpress-settings',
    '/wordpress-recipe-settings',
    '/wordpress-recipe-templates',
    '/users',
    '/generate/pinterest',
    '/generate/facebook',
    '/generate/all',
    '/api/generate/pinterest',
    '/api/generate/facebook',
    '/api/generate/all'
  ];
  
  const isAdminRoute = adminOnlyRoutes.some(route => 
    req.path === route || req.path.startsWith(`${route}/`)
  );
  
  if (isAdminRoute && (!req.session.user || req.session.user.role !== 'admin')) {
    req.session.errorMessage = 'You need admin privileges to access this page';
    return res.redirect('/');
  }
  
  next();
}

// Middleware to filter content based on user role
function filterContentByRole(req, res, next) {
  if (req.session && req.session.user && req.session.user.role === 'employee') {
    req.isEmployee = true;
    req.userId = req.session.user.id;
  }
  
  next();
}

// Updated version with getOne function imported from db.js
async function attachUserToLocals(req, res, next) {
  try {
    // TEMPORARY: Skip database queries that might be causing session issues
    if (req.session && req.session.user) {
      console.log('Authenticated user:', req.session.user);
      // Simple copy without database queries
      res.locals.user = { ...req.session.user };
      res.locals.isAuthenticated = true;
      
      // Skip stats for now to avoid database issues
      res.locals.user.stats = {
        recipeCount: 0,
        processedKeywords: 0,
        totalContent: 0
      };
    } else {
      res.locals.user = null;
      res.locals.isAuthenticated = false;
    }
    
    next();
  } catch (error) {
    console.error('Error in attachUserToLocals middleware:', error);
    // Set defaults on error
    res.locals.user = null;
    res.locals.isAuthenticated = false;
    next();
  }
}

module.exports = {
  isAuthenticated,
  isAdmin,
  isEmployee,
  isResourceOwner,
  attachUserToLocals,
  attachOrganizationToRequest,
  adminOnlyPages,
  filterContentByRole
};