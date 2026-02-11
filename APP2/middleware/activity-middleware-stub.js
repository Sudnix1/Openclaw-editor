// middleware/activity-middleware.js (STUB VERSION)
// Temporary stub to prevent errors until full activity logging is set up

/**
 * Stub middleware that does nothing - for temporary use
 */
function logActivity(actionType, entityType) {
  return async (req, res, next) => {
    // Just pass through without logging
    next();
  };
}

module.exports = { logActivity };
