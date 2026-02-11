// fix-template-variables.js
// Add this to your middleware/auth.js file

function fixAttachUserToLocals(req, res, next) {
  // Always attach user variables to locals for templates
  if (req.session && req.session.user) {
    res.locals.user = req.session.user;
    res.locals.isAuthenticated = true;
    res.locals.isAdmin = req.session.user.role === 'admin';
    res.locals.isEmployee = req.session.user.role === 'employee';
  } else {
    res.locals.user = null;
    res.locals.isAuthenticated = false;
    res.locals.isAdmin = false;
    res.locals.isEmployee = false;
  }
  next();
}

// Export to be used in server.js
module.exports = fixAttachUserToLocals;