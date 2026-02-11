// Create this file as registration-routes.js in your root directory

const express = require('express');
const router = express.Router();
const userDb = require('./models/user');
const organizationDb = require('./models/organization');
const { v4: uuidv4 } = require('uuid');

// Registration page
router.get('/register', (req, res) => {
  // Redirect if already logged in
  if (req.session && req.session.user) {
    return res.redirect('/');
  }
  
  res.render('register', {
    pageTitle: 'Register',
    activePage: '',
    title: 'RecipeGen AI - Register',
    errorMessage: req.session.errorMessage,
    successMessage: req.session.successMessage
  });
  
  // Clear messages
  delete req.session.errorMessage;
  delete req.session.successMessage;
});

// Registration form submission - EXACT PATTERN FROM OLD APP
router.post('/register', async (req, res) => {
  try {
    const { 
      organizationName, 
      name, 
      email, 
      username, 
      password, 
      confirmPassword 
    } = req.body;
    
    // Validation
    if (!organizationName || !name || !email || !username || !password || !confirmPassword) {
      req.session.errorMessage = 'All fields are required';
      return res.redirect('/register');
    }
    
    if (password !== confirmPassword) {
      req.session.errorMessage = 'Passwords do not match';
      return res.redirect('/register');
    }
    
    if (password.length < 8) {
      req.session.errorMessage = 'Password must be at least 8 characters long';
      return res.redirect('/register');
    }
    
    // First create the admin user with a temporary ID
    const userId = uuidv4();
    
    // Then create the organization with that admin ID
    const organization = await organizationDb.createOrganization({
      name: organizationName,
      adminId: userId
    });
    
    // Finally create the admin user with the generated organization ID
    const user = await userDb.createUser({
      id: userId,
      username,
      password,
      name,
      email,
      role: 'admin',
      organizationId: organization.id
    });
    
    // Set success message for login
    req.session.successMessage = 'Account created successfully! Please log in.';
    
    // Redirect to login page
    res.redirect('/login');
  } catch (error) {
    console.error('Registration error:', error);
    req.session.errorMessage = error.message || 'Registration failed';
    res.redirect('/register');
  }
});

module.exports = router;