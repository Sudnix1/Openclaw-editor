// activity-logger.js (STUB VERSION)
// Temporary stub to prevent errors until full activity logging is set up

/**
 * Stub function that does nothing
 */
async function logActivity(userId, organizationId, actionType, entityType, entityId, details) {
  // Do nothing - just return successfully
  return Promise.resolve();
}

/**
 * Stub function for table creation
 */
async function ensureActivityTableExists() {
  // Do nothing - just return successfully
  return Promise.resolve();
}

/**
 * Stub function for getting activities
 */
async function getRecentActivities(userId, organizationId, limit = 10) {
  // Return empty array
  return [];
}

module.exports = {
  logActivity,
  ensureActivityTableExists,
  getRecentActivities
};
