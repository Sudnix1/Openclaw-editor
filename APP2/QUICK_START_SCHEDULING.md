# Quick Start: Automatic Scheduling Continuation

This guide shows you how to quickly add automatic scheduling continuation to your application.

## Step 1: Run the Migration (30 seconds)

```bash
node migrations/add-last-scheduled-date.js
```

Expected output:
```
🔧 Adding last_scheduled_date column to websites table...
✅ last_scheduled_date column added successfully!
```

## Step 2: Import the Service (1 line of code)

At the top of your `server.js`, add:

```javascript
const schedulingService = require('./services/scheduling-service');
```

## Step 3: Update Your Scheduling Endpoint (3 lines of code)

Find your WordPress bulk publishing endpoint (around line 6400 in `server.js`) and modify it:

### Before:
```javascript
app.post('/api/wordpress/bulk-publish', isAuthenticated, async (req, res) => {
  try {
    const { recipeIds, timeInterval, startTime, websiteId } = req.body;

    // Your existing scheduling logic
    let currentDate = new Date(); // ❌ Always starts from today

    // ... rest of your code
  }
});
```

### After:
```javascript
app.post('/api/wordpress/bulk-publish', isAuthenticated, async (req, res) => {
  try {
    const { recipeIds, timeInterval, startTime, websiteId } = req.body;

    // ✅ Get the starting date (continues from last scheduled date automatically)
    let currentDate = await schedulingService.getSchedulingStartDate(websiteId);
    let lastScheduledDate = currentDate;

    // Your existing scheduling logic...
    for (let i = 0; i < recipeIds.length; i++) {
      // ... your scheduling code ...
      lastScheduledDate = new Date(currentDate); // Track the last date
    }

    // ✅ Update the last scheduled date after successful scheduling
    await schedulingService.updateLastScheduledDate(websiteId, lastScheduledDate);

    // ... rest of your code
  }
});
```

## Step 4: Test It!

### Test 1: First Batch
1. Schedule 5 posts from your website
2. They should start from today

### Test 2: Second Batch
1. Schedule 5 more posts for the same website
2. They should automatically start from the day after the last scheduled post!

### Test 3: Different Website
1. Schedule posts for a different website
2. They should start from today (each website tracks independently)

## Optional: Add UI Feedback

Show users where scheduling will start. Add this endpoint to `server.js`:

```javascript
// Get scheduling info for a website
app.get('/api/websites/:websiteId/scheduling-info', isAuthenticated, async (req, res) => {
  try {
    const { websiteId } = req.params;
    const info = await schedulingService.getSchedulingInfo(websiteId);
    res.json(info);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});
```

Then in your frontend (e.g., in WordPress bulk publish modal):

```javascript
// When user opens the scheduling modal
async function loadSchedulingInfo() {
  const websiteId = document.getElementById('currentWebsiteId').value;

  const response = await fetch(`/api/websites/${websiteId}/scheduling-info`);
  const info = await response.json();

  if (info.isFirstBatch) {
    document.getElementById('scheduling-notice').innerHTML = `
      <div class="alert alert-info">
        📅 First batch: Posts will start from <strong>today</strong>
      </div>
    `;
  } else {
    document.getElementById('scheduling-notice').innerHTML = `
      <div class="alert alert-success">
        📅 Continuing: Posts will start from <strong>${info.nextStartDate}</strong>
        <br><small>Last scheduled: ${info.lastScheduledDate}</small>
      </div>
    `;
  }
}
```

## Optional: Reset Feature (Admin Only)

Allow admins to reset scheduling if needed:

```javascript
// Reset scheduling for a website
app.post('/api/websites/:websiteId/reset-scheduling', isAuthenticated, async (req, res) => {
  try {
    // Only admins can reset
    if (req.session.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }

    const { websiteId } = req.params;
    await schedulingService.resetScheduling(websiteId);

    res.json({
      success: true,
      message: 'Scheduling reset. Next posts will start from today.'
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});
```

## Complete Example: WordPress Bulk Publishing

Here's a complete example of how to integrate into your existing bulk publishing:

```javascript
app.post('/api/wordpress/bulk-publish',
  isAuthenticated,
  websiteMiddleware.hasWebsiteAccess,
  websiteMiddleware.ensureWebsiteSelected,
  async (req, res) => {
  try {
    const {
      recipeIds,
      timeInterval = 1440, // minutes between posts (default: 1 day)
      startTime = '09:00',  // time to publish (default: 9 AM)
      status = 'future'     // WordPress post status
    } = req.body;

    const websiteId = req.session.currentWebsiteId;

    // Validate
    if (!recipeIds || recipeIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No recipes selected'
      });
    }

    console.log(`📅 [BULK PUBLISH] Starting bulk publish for ${recipeIds.length} recipes`);

    // ✅ STEP 1: Get the starting date for this website
    const startDate = await schedulingService.getSchedulingStartDate(websiteId);

    // Set the time on start date
    const [hours, minutes] = startTime.split(':').map(Number);
    startDate.setHours(hours, minutes, 0, 0);

    console.log(`📅 [BULK PUBLISH] Starting from ${startDate.toISOString()}`);

    // STEP 2: Schedule each post
    let currentDate = new Date(startDate);
    let lastScheduledDate = currentDate;
    const results = [];

    for (let i = 0; i < recipeIds.length; i++) {
      const recipeId = recipeIds[i];

      try {
        // Publish to WordPress with scheduled date
        const result = await wordpress.publishPost({
          recipeId: recipeId,
          status: status,
          scheduleDate: currentDate.toISOString(),
          websiteId: websiteId
        });

        results.push({
          recipeId: recipeId,
          success: true,
          scheduledDate: currentDate.toISOString(),
          postId: result.postId
        });

        console.log(`✅ [BULK PUBLISH] Scheduled post ${i + 1}/${recipeIds.length} for ${currentDate.toISOString()}`);

      } catch (error) {
        console.error(`❌ [BULK PUBLISH] Failed to publish recipe ${recipeId}:`, error);

        results.push({
          recipeId: recipeId,
          success: false,
          error: error.message
        });
      }

      // Move to next time slot
      currentDate.setMinutes(currentDate.getMinutes() + timeInterval);
      lastScheduledDate = new Date(currentDate);
    }

    // ✅ STEP 3: Update the last scheduled date for this website
    await schedulingService.updateLastScheduledDate(websiteId, lastScheduledDate);

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;

    res.json({
      success: true,
      message: `Scheduled ${successCount} posts successfully. ${failCount > 0 ? `${failCount} failed.` : ''}`,
      results: results,
      startDate: startDate.toISOString().split('T')[0],
      endDate: lastScheduledDate.toISOString().split('T')[0],
      nextSchedulingStartDate: new Date(lastScheduledDate.getTime() + 24*60*60*1000).toISOString().split('T')[0]
    });

  } catch (error) {
    console.error('❌ [BULK PUBLISH] Error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});
```

## That's It!

You now have automatic scheduling continuation working! Each website will remember its last scheduled date and automatically continue from there.

## Troubleshooting

**Q: Posts are still starting from today instead of continuing**
**A:** Make sure you're calling `updateLastScheduledDate()` after successful scheduling

**Q: I want to reset a website's scheduling**
**A:** Use the reset endpoint: `POST /api/websites/{websiteId}/reset-scheduling`

**Q: Can I see the current scheduling status?**
**A:** Yes! Use: `GET /api/websites/{websiteId}/scheduling-info`

**Q: Does this work with Buffer/social media scheduling?**
**A:** Yes! The service works with any scheduling system. Just use the same pattern:
1. Get start date: `await schedulingService.getSchedulingStartDate(websiteId)`
2. Schedule your posts
3. Update last date: `await schedulingService.updateLastScheduledDate(websiteId, lastDate)`

## Support

For detailed documentation, see: `SCHEDULING_CONTINUATION_GUIDE.md`

---

**Ready to implement?** Start with Step 1 above!
