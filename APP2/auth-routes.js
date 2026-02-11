// Full auth-routes.js implementation with updated profile route

const express = require('express');
const router = express.Router();
const userDb = require('./models/user');
const { recipeDb, keywordsDb } = require('./db');
const wordpressDb = require('./wordpress-db');
const { isAuthenticated, isAdmin } = require('./middleware/auth');

// Login page
router.get('/login', (req, res) => {
  // Redirect if already logged in
  if (req.session && req.session.user) {
    return res.redirect('/');
  }
  
  res.render('login', {
    pageTitle: 'Login',
    activePage: '',
    title: 'RecipeGen AI - Login',
    errorMessage: req.session.errorMessage,
    successMessage: req.session.successMessage
  });
  
  // Clear messages
  delete req.session.errorMessage;
  delete req.session.successMessage;
});

// Login form submission
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      req.session.errorMessage = 'Please provide both username and password';
      return res.redirect('/login');
    }
    
    // Authenticate user
    const user = await userDb.authenticateUser(username, password);
    
    if (!user) {
      req.session.errorMessage = 'Invalid username or password';
      return res.redirect('/login');
    }
    
    // Set user in session
    req.session.user = user;
    
    // Redirect to saved returnTo URL or dashboard
    const returnUrl = req.session.returnTo || '/';
    delete req.session.returnTo;
    
    res.redirect(returnUrl);
  } catch (error) {
    console.error('Login error:', error);
    req.session.errorMessage = 'Login failed: ' + error.message;
    res.redirect('/login');
  }
});

// Logout
router.get('/logout', (req, res) => {
  // Destroy session
  req.session.destroy(err => {
    if (err) {
      console.error('Error during logout:', err);
    }
    res.redirect('/login');
  });
});

// User management page (admin only)
router.get('/users', isAuthenticated, isAdmin, async (req, res) => {
  try {
    // Get all users from ONLY the current user's organization
    const users = await userDb.getUsersByOrganization(req.session.user.organizationId);
    
    console.log(`Found ${users.length} users for organization ${req.session.user.organizationId}`);
    
    res.render('users', {
      pageTitle: 'User Management',
      activePage: 'users',
      title: 'RecipeGen AI - User Management',
      users,
      moment: require('moment'),
      errorMessage: req.session.errorMessage,
      successMessage: req.session.successMessage
    });
    
    // Clear messages
    delete req.session.errorMessage;
    delete req.session.successMessage;
  } catch (error) {
    console.error('Error loading users page:', error);
    req.session.errorMessage = 'Failed to load users: ' + error.message;
    res.redirect('/');
  }
});

// Create user (admin only)
router.post('/users', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const { username, password, name, email, role } = req.body;
    
    // Validate required fields
    if (!username || !password || !name || !email || !role) {
      req.session.errorMessage = 'All fields are required';
      return res.redirect('/users');
    }
    
    // Create user WITH organization ID from the admin
    await userDb.createUser({
      username,
      password,
      name,
      email,
      role,
      organizationId: req.session.user.organizationId // CRITICAL: Assign to admin's organization
    });
    
    req.session.successMessage = 'User created successfully';
    res.redirect('/users');
  } catch (error) {
    console.error('Error creating user:', error);
    req.session.errorMessage = 'Failed to create user: ' + error.message;
    res.redirect('/users');
  }
});

// Update user (admin only)
router.post('/users/:id', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, role, password } = req.body;
    
    // First, check if user belongs to admin's organization
    const userToUpdate = await userDb.getUserById(id);
    if (!userToUpdate || userToUpdate.organizationId !== req.session.user.organizationId) {
      req.session.errorMessage = 'User not found or you do not have permission to modify this user';
      
      // Redirect back to where user came from
      const redirectUrl = req.get('Referrer') || '/users';
      return res.redirect(redirectUrl);
    }
    
    // Validate required fields
    if (!name || !email || !role) {
      req.session.errorMessage = 'Name, email and role are required';
      
      // Redirect back to where user came from
      const redirectUrl = req.get('Referrer') || '/users';
      return res.redirect(redirectUrl);
    }
    
    // Update data
    const updateData = { name, email, role };
    
    // Add password if provided
    if (password) {
      updateData.password = password;
    }
    
    // Update user
    await userDb.updateUser(id, updateData);
    
    req.session.successMessage = 'User updated successfully';
    
    // Redirect back to where user came from
    const redirectUrl = req.get('Referrer') || '/users';
    res.redirect(redirectUrl);
  } catch (error) {
    console.error('Error updating user:', error);
    req.session.errorMessage = 'Failed to update user: ' + error.message;
    
    // Redirect back to where user came from
    const redirectUrl = req.get('Referrer') || '/users';
    res.redirect(redirectUrl);
  }
});

// Delete user (admin only) - UPDATED WITH SMART REDIRECT
router.post('/users/:id/delete', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    
    // First, check if user belongs to admin's organization
    const userToDelete = await userDb.getUserById(id);
    if (!userToDelete || userToDelete.organizationId !== req.session.user.organizationId) {
      req.session.errorMessage = 'User not found or you do not have permission to delete this user';
      
      // Redirect back to where user came from
      const redirectUrl = req.get('Referrer') || '/users';
      return res.redirect(redirectUrl);
    }
    
    // Don't allow deleting own account
    if (id === req.session.user.id) {
      req.session.errorMessage = 'You cannot delete your own account';
      
      // Redirect back to where user came from
      const redirectUrl = req.get('Referrer') || '/users';
      return res.redirect(redirectUrl);
    }
    
    // Delete user
    await userDb.deleteUser(id);
    
    req.session.successMessage = 'User deleted successfully';
    
    // Redirect back to where user came from (this is the key change!)
    const redirectUrl = req.get('Referrer') || '/users';
    res.redirect(redirectUrl);
    
  } catch (error) {
    console.error('Error deleting user:', error);
    req.session.errorMessage = 'Failed to delete user: ' + error.message;
    
    // Redirect back to where user came from
    const redirectUrl = req.get('Referrer') || '/users';
    res.redirect(redirectUrl);
  }
});

// GET /profile - User profile page (UPDATED)
router.get('/profile', isAuthenticated, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const organizationId = req.session.user.organizationId;
    
    // Get user details
    const user = await userDb.getUserById(userId);
    
    // Initialize default empty stats object to prevent template errors
    let stats = {
      recipeCount: 0,
      keywordCounts: {
        pending: 0,
        processed: 0,
        failed: 0,
        total: 0
      },
      wpPostCount: 0,
      totalContent: 0
    };
    
    // Only try to get real stats if we have a valid user
    if (user) {
      // Get activity stats
      stats.recipeCount = await recipeDb.getRecipeCountByOwner(userId);
      stats.keywordCounts.pending = await keywordsDb.getKeywordsCount('pending', null, userId);
      stats.keywordCounts.processed = await keywordsDb.getKeywordsCount('processed', null, userId);
      stats.keywordCounts.failed = await keywordsDb.getKeywordsCount('failed', null, userId);
      
      // Calculate totals
      stats.keywordCounts.total = stats.keywordCounts.pending + stats.keywordCounts.processed + stats.keywordCounts.failed;
      stats.totalContent = stats.recipeCount + stats.keywordCounts.processed;
      
      // Get WordPress post count if we have WordPress integration
      try {
        stats.wpPostCount = await wordpressDb.getPublicationCount(userId);
      } catch (error) {
        console.log('No WordPress publications found or error counting them:', error.message);
      }
    }
    
    // Get user activity - if activityLogger is defined
    let activity = [];
    try {
      // Check if activityLogger exists before calling
      if (typeof activityLogger !== 'undefined' && activityLogger.getRecentActivity) {
        activity = await activityLogger.getRecentActivity(organizationId, 20, userId);
      }
    } catch (error) {
      console.log('Error getting user activity:', error.message);
    }
    
    res.render('profile', {
      user: user || {},
      stats: stats, // Always pass stats object, even if empty
      activity: activity || [],
      pageTitle: 'User Profile',
      activePage: 'profile',
      title: 'RecipeGen AI - User Profile',
      errorMessage: req.session.errorMessage,
      successMessage: req.session.successMessage
    });
    
    // Clear messages
    delete req.session.errorMessage;
    delete req.session.successMessage;
  } catch (error) {
    console.error('Error loading profile page:', error);
    
    // Even on error, render the page with empty data to avoid template errors
    res.render('profile', {
      user: {},
      stats: {
        recipeCount: 0,
        keywordCounts: {
          pending: 0,
          processed: 0,
          failed: 0,
          total: 0
        },
        wpPostCount: 0,
        totalContent: 0
      },
      activity: [],
      errorMessage: 'Failed to load profile data: ' + error.message,
      pageTitle: 'User Profile',
      activePage: 'profile',
      title: 'RecipeGen AI - Error'
    });
  }
});

// Update profile
router.post('/profile', isAuthenticated, async (req, res) => {
  try {
    const { name, email, currentPassword, newPassword } = req.body;
    
    // Validate required fields
    if (!name || !email) {
      req.session.errorMessage = 'Name and email are required';
      return res.redirect('/profile');
    }
    
    // Update data
    const updateData = { name, email };
    
    // If changing password, validate current password
    if (newPassword) {
      if (!currentPassword) {
        req.session.errorMessage = 'Current password is required to set a new password';
        return res.redirect('/profile');
      }
      
      // Verify current password
      const user = await userDb.authenticateUser(req.session.user.username, currentPassword);
      if (!user) {
        req.session.errorMessage = 'Current password is incorrect';
        return res.redirect('/profile');
      }
      
      // Password is correct, update it
      updateData.password = newPassword;
    }
    
    // Update user
    const updatedUser = await userDb.updateUser(req.session.user.id, updateData);
    
    // Update session
    req.session.user = updatedUser;
    
    req.session.successMessage = 'Profile updated successfully';
    res.redirect('/profile');
  } catch (error) {
    console.error('Error updating profile:', error);
    req.session.errorMessage = 'Failed to update profile: ' + error.message;
    res.redirect('/profile');
  }
});

module.exports = router;