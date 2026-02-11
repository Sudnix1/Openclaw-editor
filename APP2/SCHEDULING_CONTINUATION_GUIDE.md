# Scheduling Continuation Feature - Implementation Guide

## Overview

This feature automatically tracks the last scheduled date for each website and continues scheduling from that date, ensuring posts are scheduled sequentially without overlaps or gaps.

## Example Scenario

**Before:** Every time you schedule posts, they start from today's date
**After:** Posts automatically start from the last scheduled date

```
First batch: Schedule 10 posts from 11/12 → 13/12
Second batch: Automatically starts from 14/12 → 16/12
Third batch: Automatically starts from 17/12 → 19/12
```

## Step 1: Run the Migration

First, add the `last_scheduled_date` column to the websites table:

```bash
node migrations/add-last-scheduled-date.js
```

This adds a new column to track the last scheduled date for each website.

## Step 2: Implementation Code Examples

### Helper Function: Get Start Date for Website

Add this function to your scheduling code:

```javascript
/**
 * Get the starting date for scheduling posts for a website
 * @param {string} websiteId - Website ID
 * @returns {Promise<Date>} - Starting date (last scheduled date + 1 day, or today)
 */
async function getSchedulingStartDate(websiteId) {
  const { getOne } = require('./db');

  // Get the website's last scheduled date
  const website = await getOne(`
    SELECT last_scheduled_date
    FROM websites
    WHERE id = ?
  `, [websiteId]);

  if (website && website.last_scheduled_date) {
    // Parse the last scheduled date
    const lastDate = new Date(website.last_scheduled_date);

    // Start from the next day
    lastDate.setDate(lastDate.getDate() + 1);

    console.log(`📅 [SCHEDULING] Continuing from ${lastDate.toISOString().split('T')[0]} for website ${websiteId}`);
    return lastDate;
  } else {
    // No previous scheduling, start from today
    const today = new Date();
    console.log(`📅 [SCHEDULING] Starting fresh from ${today.toISOString().split('T')[0]} for website ${websiteId}`);
    return today;
  }
}
```

### Helper Function: Update Last Scheduled Date

Add this function to update the last scheduled date after scheduling:

```javascript
/**
 * Update the last scheduled date for a website
 * @param {string} websiteId - Website ID
 * @param {Date} lastDate - Last date used for scheduling
 */
async function updateLastScheduledDate(websiteId, lastDate) {
  const { runQuery } = require('./db');

  const dateString = lastDate.toISOString().split('T')[0]; // Format: YYYY-MM-DD

  await runQuery(`
    UPDATE websites
    SET last_scheduled_date = ?
    WHERE id = ?
  `, [dateString, websiteId]);

  console.log(`✅ [SCHEDULING] Updated last scheduled date to ${dateString} for website ${websiteId}`);
}
```

## Step 3: Modify Your Scheduling Logic

### Example: Bulk WordPress Publishing

Here's how to integrate the scheduling continuation into your bulk publishing:

```javascript
app.post('/api/wordpress/bulk-publish', isAuthenticated, async (req, res) => {
  try {
    const { recipeIds, timeInterval, startTime, websiteId } = req.body;

    // STEP 1: Get the starting date for this website
    const startDate = await getSchedulingStartDate(websiteId);

    // STEP 2: Schedule posts starting from that date
    let currentDate = new Date(startDate);
    let lastScheduledDate = currentDate;

    for (let i = 0; i < recipeIds.length; i++) {
      const recipeId = recipeIds[i];

      // Calculate schedule time for this post
      const scheduledDateTime = new Date(currentDate);
      scheduledDateTime.setHours(parseInt(startTime.split(':')[0]));
      scheduledDateTime.setMinutes(parseInt(startTime.split(':')[1]));

      // Publish the post with scheduled date
      await publishPostToWordPress({
        recipeId: recipeId,
        status: 'future',
        scheduleDate: scheduledDateTime.toISOString()
      });

      console.log(`📅 Scheduled post ${i + 1}/${recipeIds.length} for ${scheduledDateTime.toISOString()}`);

      // Move to next time slot
      currentDate.setMinutes(currentDate.getMinutes() + timeInterval);
      lastScheduledDate = new Date(currentDate);
    }

    // STEP 3: Update the last scheduled date for this website
    await updateLastScheduledDate(websiteId, lastScheduledDate);

    res.json({
      success: true,
      message: `Scheduled ${recipeIds.length} posts starting from ${startDate.toISOString().split('T')[0]}`,
      lastScheduledDate: lastScheduledDate.toISOString().split('T')[0]
    });

  } catch (error) {
    console.error('Scheduling error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});
```

### Example: Buffer Scheduling

For Buffer or social media scheduling:

```javascript
async function scheduleToBuffer(posts, websiteId) {
  // Get starting date for this website
  const startDate = await getSchedulingStartDate(websiteId);

  let currentDate = new Date(startDate);
  let lastScheduledDate = currentDate;

  for (const post of posts) {
    // Schedule post at current date/time
    await bufferClient.schedulePost({
      text: post.content,
      scheduledAt: currentDate.toISOString(),
      profileId: post.profileId
    });

    // Move to next day (or whatever interval you want)
    currentDate.setDate(currentDate.getDate() + 1);
    lastScheduledDate = new Date(currentDate);
  }

  // Update last scheduled date
  await updateLastScheduledDate(websiteId, lastScheduledDate);

  return {
    scheduled: posts.length,
    startDate: startDate.toISOString().split('T')[0],
    endDate: lastScheduledDate.toISOString().split('T')[0]
  };
}
```

## Step 4: Frontend Integration (Optional)

Show users the current scheduling status in your UI:

```javascript
// In your EJS template or frontend
async function showSchedulingInfo(websiteId) {
  const response = await fetch(`/api/websites/${websiteId}/scheduling-info`);
  const data = await response.json();

  if (data.lastScheduledDate) {
    document.getElementById('scheduling-info').innerHTML = `
      <div class="alert alert-info">
        📅 Next posts will be scheduled starting from: <strong>${data.nextStartDate}</strong>
        <br>
        <small>Last scheduled: ${data.lastScheduledDate}</small>
      </div>
    `;
  } else {
    document.getElementById('scheduling-info').innerHTML = `
      <div class="alert alert-info">
        📅 This will be your first scheduled post batch. Posts will start from today.
      </div>
    `;
  }
}
```

Backend endpoint for scheduling info:

```javascript
app.get('/api/websites/:websiteId/scheduling-info', isAuthenticated, async (req, res) => {
  const { websiteId } = req.params;
  const { getOne } = require('./db');

  const website = await getOne(`
    SELECT last_scheduled_date, name
    FROM websites
    WHERE id = ?
  `, [websiteId]);

  if (website && website.last_scheduled_date) {
    const lastDate = new Date(website.last_scheduled_date);
    const nextDate = new Date(lastDate);
    nextDate.setDate(nextDate.getDate() + 1);

    res.json({
      lastScheduledDate: lastDate.toISOString().split('T')[0],
      nextStartDate: nextDate.toISOString().split('T')[0],
      websiteName: website.name
    });
  } else {
    const today = new Date();
    res.json({
      lastScheduledDate: null,
      nextStartDate: today.toISOString().split('T')[0],
      websiteName: website?.name || 'Unknown'
    });
  }
});
```

## Step 5: Reset Scheduling (Admin Feature)

Allow admins to reset the scheduling date if needed:

```javascript
app.post('/api/websites/:websiteId/reset-scheduling', isAuthenticated, async (req, res) => {
  const { websiteId } = req.params;
  const { runQuery } = require('./db');

  await runQuery(`
    UPDATE websites
    SET last_scheduled_date = NULL
    WHERE id = ?
  `, [websiteId]);

  res.json({
    success: true,
    message: 'Scheduling reset. Next posts will start from today.'
  });
});
```

## Database Schema

After running the migration, your `websites` table will have:

```sql
CREATE TABLE websites (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  url TEXT,
  organization_id TEXT NOT NULL,
  wordpress_api_url TEXT,
  wordpress_username TEXT,
  wordpress_password TEXT,
  pinterest_url TEXT,
  last_scheduled_date TEXT,  -- NEW COLUMN (Format: YYYY-MM-DD)
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
);
```

## Benefits

✅ **No Date Overlap**: Posts never overlap with previous schedules
✅ **No Manual Date Entry**: System automatically calculates the next available date
✅ **Per-Website Tracking**: Each website maintains its own scheduling timeline
✅ **Flexible**: Works with WordPress, Buffer, or any scheduling system
✅ **Visual Feedback**: Users see where scheduling will start before confirming

## Testing

Test the feature with this workflow:

1. **First Batch**: Schedule 5 posts → They should start from today
2. **Check Database**: Verify `last_scheduled_date` is updated in `websites` table
3. **Second Batch**: Schedule 5 more posts → They should start from day after the last scheduled date
4. **Different Website**: Schedule posts for another website → Should start from today (independent tracking)
5. **Reset**: Test the reset feature → Next batch should start from today again

## Troubleshooting

**Problem**: Posts still starting from today instead of continuing
**Solution**: Ensure you're calling `updateLastScheduledDate()` after successful scheduling

**Problem**: Last date not updating
**Solution**: Check that `websiteId` is correctly passed and exists in the database

**Problem**: Dates seem incorrect
**Solution**: Verify timezone handling - store dates as UTC or your local timezone consistently

## Next Steps

1. Run the migration: `node migrations/add-last-scheduled-date.js`
2. Add the helper functions to your server.js or a separate module
3. Integrate the functions into your existing scheduling endpoints
4. Test with a small batch of posts
5. Optionally add frontend UI to show scheduling info

---

**Date Created**: 2025-01-21
**Feature**: Automatic Scheduling Continuation
**Status**: Ready for Implementation
