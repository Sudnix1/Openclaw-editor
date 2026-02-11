// middleware/activity-middleware.js
const activityLogger = require('../activity-logger');

/**
 * Middleware to log user activities
 */
function logActivity(actionType, entityType) {
  return async (req, res, next) => {
    // Store the original send/json method
    const originalSend = res.send;
    const originalJson = res.json;

    // Only proceed if we have an authenticated user
    if (!req.session || !req.session.user) {
      return next();
    }

    const userId = req.session.user.id;
    const organizationId = req.session.user.organizationId;
    
    // Get entity ID from request parameters or body
    let entityId = req.params.id || (req.body && req.body.id);
    
    // Override the send method to capture successful operations
    res.send = function(data) {
      // Only log on successful responses (status 2xx)
      if (res.statusCode >= 200 && res.statusCode < 300) {
        // Try to extract entity details
        let details = null;
        
        // For JSON responses, we might have more info in the response
        if (typeof data === 'string' && data.startsWith('{')) {
          try {
            const jsonData = JSON.parse(data);
            
            // Extract entity ID if not already set
            if (!entityId && jsonData.id) {
              entityId = jsonData.id;
            } else if (!entityId && jsonData.recipeId) {
              entityId = jsonData.recipeId;
            }
            
            // Extract details depending on entity type
            if (entityType === 'recipe' && jsonData.recipeIdea) {
              details = jsonData.recipeIdea;
            } else if (entityType === 'keyword' && jsonData.keyword) {
              details = jsonData.keyword;
            } else if (jsonData.message) {
              details = jsonData.message;
            }
          } catch (e) {
            // Ignore JSON parsing errors
          }
        }
        
        // Log the activity
        activityLogger.logActivity(
          userId,
          organizationId,
          actionType,
          entityType,
          entityId,
          details
        ).catch(err => console.error('Error logging activity:', err));
      }
      
      // Call the original send
      return originalSend.apply(res, arguments);
    };
    
    // Override the json method similarly
    res.json = function(data) {
      // Only log on successful responses
      if (res.statusCode >= 200 && res.statusCode < 300) {
        // Try to extract entity details
        let details = null;
        
        // Extract entity ID if not already set
        if (!entityId && data.id) {
          entityId = data.id;
        } else if (!entityId && data.recipeId) {
          entityId = data.recipeId;
        }
        
        // Extract details depending on entity type
        if (entityType === 'recipe' && data.recipeIdea) {
          details = data.recipeIdea;
        } else if (entityType === 'keyword' && data.keyword) {
          details = data.keyword;
        } else if (data.message) {
          details = data.message;
        } else if (data.success && data.count) {
          details = `Processed ${data.count} items`;
        }
        
        // Log the activity
        activityLogger.logActivity(
          userId,
          organizationId,
          actionType,
          entityType,
          entityId,
          details
        ).catch(err => console.error('Error logging activity:', err));
      }
      
      // Call the original json
      return originalJson.apply(res, arguments);
    };
    
    next();
  };
}

module.exports = { logActivity };