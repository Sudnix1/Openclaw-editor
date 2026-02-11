// services/scheduling-service.js
// Service for managing automatic scheduling continuation per website

const { getOne, runQuery } = require('../db');

/**
 * Get the starting date for scheduling posts for a website
 * Automatically continues from the last scheduled date, or starts from today if none exists
 *
 * @param {string} websiteId - Website ID
 * @returns {Promise<Date>} - Starting date for scheduling
 *
 * @example
 * const startDate = await getSchedulingStartDate('website-123');
 * // Returns: Date object (e.g., 2025-01-14 if last scheduled was 2025-01-13)
 */
async function getSchedulingStartDate(websiteId) {
  if (!websiteId) {
    throw new Error('Website ID is required');
  }

  try {
    // Get the website's last scheduled date
    const website = await getOne(`
      SELECT last_scheduled_date, name
      FROM websites
      WHERE id = ?
    `, [websiteId]);

    if (!website) {
      throw new Error(`Website not found: ${websiteId}`);
    }

    if (website.last_scheduled_date) {
      // Parse the last scheduled date
      const lastDate = new Date(website.last_scheduled_date);

      // Validate the date
      if (isNaN(lastDate.getTime())) {
        console.warn(`⚠️ [SCHEDULING] Invalid last_scheduled_date for website ${websiteId}, using today`);
        return new Date();
      }

      // Start from the next day
      lastDate.setDate(lastDate.getDate() + 1);

      console.log(`📅 [SCHEDULING] Continuing from ${lastDate.toISOString().split('T')[0]} for website "${website.name}" (${websiteId})`);
      return lastDate;
    } else {
      // No previous scheduling, start from today
      const today = new Date();
      console.log(`📅 [SCHEDULING] Starting fresh from ${today.toISOString().split('T')[0]} for website "${website.name}" (${websiteId})`);
      return today;
    }
  } catch (error) {
    console.error(`❌ [SCHEDULING] Error getting start date for website ${websiteId}:`, error);
    throw error;
  }
}

/**
 * Update the last scheduled date for a website
 * This should be called after successfully scheduling a batch of posts
 *
 * @param {string} websiteId - Website ID
 * @param {Date|string} lastDate - Last date used for scheduling (Date object or YYYY-MM-DD string)
 * @returns {Promise<void>}
 *
 * @example
 * await updateLastScheduledDate('website-123', new Date('2025-01-20'));
 * // or
 * await updateLastScheduledDate('website-123', '2025-01-20');
 */
async function updateLastScheduledDate(websiteId, lastDate) {
  if (!websiteId) {
    throw new Error('Website ID is required');
  }

  if (!lastDate) {
    throw new Error('Last date is required');
  }

  try {
    // Convert to Date object if string
    const dateObj = typeof lastDate === 'string' ? new Date(lastDate) : lastDate;

    // Validate the date
    if (isNaN(dateObj.getTime())) {
      throw new Error(`Invalid date: ${lastDate}`);
    }

    // Format as YYYY-MM-DD
    const dateString = dateObj.toISOString().split('T')[0];

    await runQuery(`
      UPDATE websites
      SET last_scheduled_date = ?
      WHERE id = ?
    `, [dateString, websiteId]);

    console.log(`✅ [SCHEDULING] Updated last scheduled date to ${dateString} for website ${websiteId}`);
  } catch (error) {
    console.error(`❌ [SCHEDULING] Error updating last scheduled date for website ${websiteId}:`, error);
    throw error;
  }
}

/**
 * Get scheduling information for a website
 * Returns the last scheduled date and the next start date
 *
 * @param {string} websiteId - Website ID
 * @returns {Promise<Object>} - Scheduling info object
 *
 * @example
 * const info = await getSchedulingInfo('website-123');
 * // Returns: {
 * //   websiteId: 'website-123',
 * //   websiteName: 'My Blog',
 * //   lastScheduledDate: '2025-01-13',  // or null if never scheduled
 * //   nextStartDate: '2025-01-14',
 * //   isFirstBatch: false
 * // }
 */
async function getSchedulingInfo(websiteId) {
  if (!websiteId) {
    throw new Error('Website ID is required');
  }

  try {
    const website = await getOne(`
      SELECT id, name, last_scheduled_date
      FROM websites
      WHERE id = ?
    `, [websiteId]);

    if (!website) {
      throw new Error(`Website not found: ${websiteId}`);
    }

    let lastScheduledDate = null;
    let nextStartDate = null;
    let isFirstBatch = true;

    if (website.last_scheduled_date) {
      const lastDate = new Date(website.last_scheduled_date);

      if (!isNaN(lastDate.getTime())) {
        lastScheduledDate = lastDate.toISOString().split('T')[0];

        const nextDate = new Date(lastDate);
        nextDate.setDate(nextDate.getDate() + 1);
        nextStartDate = nextDate.toISOString().split('T')[0];

        isFirstBatch = false;
      }
    }

    if (!nextStartDate) {
      // No valid last date, use today
      const today = new Date();
      nextStartDate = today.toISOString().split('T')[0];
    }

    return {
      websiteId: website.id,
      websiteName: website.name,
      lastScheduledDate: lastScheduledDate,
      nextStartDate: nextStartDate,
      isFirstBatch: isFirstBatch
    };
  } catch (error) {
    console.error(`❌ [SCHEDULING] Error getting scheduling info for website ${websiteId}:`, error);
    throw error;
  }
}

/**
 * Reset the scheduling date for a website
 * Next batch will start from today
 *
 * @param {string} websiteId - Website ID
 * @returns {Promise<void>}
 *
 * @example
 * await resetScheduling('website-123');
 * // Next posts will start from today
 */
async function resetScheduling(websiteId) {
  if (!websiteId) {
    throw new Error('Website ID is required');
  }

  try {
    await runQuery(`
      UPDATE websites
      SET last_scheduled_date = NULL
      WHERE id = ?
    `, [websiteId]);

    console.log(`🔄 [SCHEDULING] Reset scheduling for website ${websiteId} - next batch will start from today`);
  } catch (error) {
    console.error(`❌ [SCHEDULING] Error resetting scheduling for website ${websiteId}:`, error);
    throw error;
  }
}

/**
 * Calculate scheduling dates for a batch of posts
 * Returns an array of dates based on start date and interval
 *
 * @param {string} websiteId - Website ID
 * @param {number} postCount - Number of posts to schedule
 * @param {number} intervalMinutes - Minutes between each post (default: 1440 = 1 day)
 * @param {string} startTime - Start time in HH:MM format (default: '09:00')
 * @returns {Promise<Array<Date>>} - Array of scheduled dates
 *
 * @example
 * const dates = await calculateSchedulingDates('website-123', 10, 1440, '09:00');
 * // Returns array of 10 dates, each 1 day apart, starting at 9:00 AM
 */
async function calculateSchedulingDates(websiteId, postCount, intervalMinutes = 1440, startTime = '09:00') {
  if (!websiteId) {
    throw new Error('Website ID is required');
  }

  if (!postCount || postCount < 1) {
    throw new Error('Post count must be at least 1');
  }

  try {
    // Get the starting date for this website
    const startDate = await getSchedulingStartDate(websiteId);

    // Parse start time
    const [hours, minutes] = startTime.split(':').map(Number);
    if (isNaN(hours) || isNaN(minutes)) {
      throw new Error(`Invalid start time format: ${startTime}. Use HH:MM format.`);
    }

    // Set the time on start date
    startDate.setHours(hours, minutes, 0, 0);

    // Calculate all dates
    const dates = [];
    let currentDate = new Date(startDate);

    for (let i = 0; i < postCount; i++) {
      dates.push(new Date(currentDate));

      // Move to next time slot
      currentDate.setMinutes(currentDate.getMinutes() + intervalMinutes);
    }

    console.log(`📊 [SCHEDULING] Calculated ${postCount} dates from ${dates[0].toISOString()} to ${dates[dates.length - 1].toISOString()}`);

    return dates;
  } catch (error) {
    console.error(`❌ [SCHEDULING] Error calculating scheduling dates:`, error);
    throw error;
  }
}

module.exports = {
  getSchedulingStartDate,
  updateLastScheduledDate,
  getSchedulingInfo,
  resetScheduling,
  calculateSchedulingDates
};
