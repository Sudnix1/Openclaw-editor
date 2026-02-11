# Pinclicks Integration - Documentation

## Overview

The Pinclicks integration automatically optimizes your Pinterest content using proven high-performing pins from pinclicks.com. Instead of relying solely on AI-generated Pinterest titles and descriptions, you can now leverage real Pinterest data analyzed by ChatGPT for better SEO and engagement.

## How It Works

### 1. **Automated Workflow**

When you run Pinclicks automation for a keyword:

1. **Extracts Keyword** - System automatically uses your recipe title as the search keyword
2. **Searches Pinclicks** - Opens pinclicks.com and searches for top-performing pins
3. **Downloads Data** - Exports "Annotated Interests" CSV data
4. **ChatGPT Analysis** - Uploads data to custom ChatGPT GPT for Pinterest SEO analysis
5. **Stores Results** - Saves optimized titles, descriptions, and text overlays to database
6. **Generates Content** - Uses Pinclicks data instead of AI generation when processing keywords

### 2. **What You Get**

From each Pinclicks automation run, you receive:

- **10 Pinterest Titles** - SEO-optimized titles based on top-performing pins
- **10 Pinterest Descriptions** - Engagement-focused descriptions (100-200 characters)
- **10 Text Overlays** - Suggested text for Pinterest image overlays
- **Raw ChatGPT Analysis** - Full analysis saved for reference

## Usage Instructions

### Method 1: Manual Trigger (Recommended for Testing)

1. **Add your recipe/keyword** to the application (manually or via Excel)
2. Go to the **Keywords** page
3. Find your keyword in the list (status: "pending" or "failed")
4. Click the **"Pinclicks"** button (📌 icon)
5. Confirm the automation (takes 1-2 minutes)
6. Wait for completion - page will auto-refresh
7. Process the keyword normally with "Pinterest" or "All" content option
8. System automatically uses Pinclicks data instead of AI-generated content

### Method 2: Process Existing Keywords

If you have already processed keywords and want to use Pinclicks:

1. Go to **Keywords** page
2. Find the processed keyword
3. Delete the recipe associated with it
4. Keyword returns to "pending" status
5. Click **"Pinclicks"** button
6. Re-process the keyword
7. New content will use Pinclicks data

## Technical Details

### Database Schema

New columns added to `keywords` table:

| Column | Type | Description |
|--------|------|-------------|
| `use_pinclicks` | INTEGER | Flag to enable/disable pinclicks (1 = enabled) |
| `pinclicks_titles` | TEXT | JSON array of 10 Pinterest titles |
| `pinclicks_descriptions` | TEXT | JSON array of 10 descriptions |
| `pinclicks_overlays` | TEXT | JSON array of 10 text overlays |
| `pinclicks_raw_content` | TEXT | Full ChatGPT response |
| `pinclicks_csv_file` | TEXT | Downloaded CSV filename |
| `pinclicks_raw_file` | TEXT | ChatGPT analysis filename |
| `pinclicks_completed_at` | DATETIME | Timestamp of completion |
| `pinclicks_status` | TEXT | Status: running, completed, failed |

### API Endpoints

**POST** `/api/keywords/run-pinclicks/:keywordId`

Triggers Pinclicks automation for a specific keyword.

**Request:**
- URL parameter: `keywordId` - The keyword ID to process

**Response:**
```json
{
  "success": true,
  "message": "Pinclicks automation completed successfully",
  "data": {
    "titlesCount": 10,
    "descriptionsCount": 10,
    "overlaysCount": 10
  }
}
```

### File Structure

```
APP/
├── services/
│   └── pinclicks-service.js          # Pinclicks automation service
├── pinclicks/
│   ├── downloads/                     # CSV and ChatGPT results
│   ├── chrome-profile/                # Browser session storage
│   ├── index.js                       # Standalone pinclicks tool
│   └── automation-core.js             # Core automation logic
├── migrations/
│   └── add-pinclicks-columns.js       # Database migration
└── server.js                          # API endpoints (modified)
```

## Content Generation Logic

### Priority System

When generating Pinterest content, the system follows this priority:

1. **If `use_pinclicks = 1` AND pinclicks data exists:**
   - Uses Pinclicks titles and descriptions
   - Skips AI generation entirely
   - Logs: `🎯 [PROCESS] Using PINCLICKS content`

2. **Otherwise:**
   - Uses AI generation as before
   - Logs: `📌 [PROCESS] Generating Pinterest content using AI`

### Example Log Output

```
🎯 [PINCLICKS] Starting automation for keyword: "Carrot Cake Cheesecake"
🌐 [PINCLICKS] Launching browser...
📍 [PINCLICKS] Navigating to PinClicks...
🔍 [PINCLICKS] Searching for keyword...
✅ [PINCLICKS] Data loaded successfully
📤 [PINCLICKS] Exporting data...
🤖 [PINCLICKS] Uploading to ChatGPT...
✅ [PINCLICKS] Parsed 10 titles, 10 descriptions, 10 overlays
💾 [PINCLICKS] Saved results to database

--- Later during content generation ---
🎯 [PROCESS] Using PINCLICKS content for: "Carrot Cake Cheesecake"
✅ [PROCESS] Loaded 10 Pinterest variations from PINCLICKS data
```

## Requirements

### Browser Requirements

- **Chrome** installed at: `C:\Program Files\Google\Chrome\Application\chrome.exe`
- Chrome will use a separate profile stored in `pinclicks/chrome-profile/`

### Account Requirements

- **Pinclicks.com** - You need to be logged in (first-time setup)
- **ChatGPT Plus** - Access to custom GPT: `pin-clicks-analysis`

### First-Time Setup

1. Run Pinclicks automation for the first time
2. Browser will open automatically
3. Log in to **pinclicks.com** if prompted
4. Session will be saved for future runs
5. Log in to **ChatGPT** if prompted
6. Session will be saved for future runs

## Performance

- **Average Duration:** 90-120 seconds per keyword
- **Browser Mode:** Visible (set `headless: false` for monitoring)
- **Concurrent Processing:** One keyword at a time (prevents rate limiting)

## Troubleshooting

### "Could not find search box"

- **Cause:** Pinclicks.com updated their UI
- **Fix:** Update selectors in `services/pinclicks-service.js`

### "Could not find copy button"

- **Cause:** ChatGPT updated their UI
- **Fix:** Check copy button detection logic in pinclicks service

### "CSV file not downloaded"

- **Cause:** Download blocked or slow network
- **Fix:** Check `pinclicks/downloads/` folder, ensure Chrome allows downloads

### "Clipboard content too short"

- **Cause:** ChatGPT didn't respond completely
- **Fix:** Increase wait time in `services/pinclicks-service.js` (line 226)

## Benefits

### Content Quality
- ✅ **Proven Performance** - Based on real top-performing pins
- ✅ **SEO Optimized** - ChatGPT analyzes annotated interests
- ✅ **Higher CTR** - Titles and descriptions designed for engagement

### Efficiency
- ✅ **One-Click Automation** - No manual work required
- ✅ **Batch Processing** - Process multiple keywords sequentially
- ✅ **Reusable Data** - Pinclicks data stored for future use

### Flexibility
- ✅ **Optional** - Can still use AI generation if preferred
- ✅ **Per-Keyword Control** - Enable/disable per keyword
- ✅ **Fallback System** - Automatically falls back to AI if no pinclicks data

## Best Practices

1. **Run Pinclicks First** - Before processing keywords with content generation
2. **Review Results** - Check downloaded files in `pinclicks/downloads/`
3. **Keep Sessions Active** - Don't log out of Pinclicks/ChatGPT
4. **Monitor Browser** - Watch automation in visible mode first time
5. **Backup Data** - Save important ChatGPT analysis files

## Migration

To add Pinclicks to existing installation:

```bash
# 1. Run database migration
node migrations/add-pinclicks-columns.js

# 2. Install dependencies (if needed)
cd pinclicks
npm install
cd ..

# 3. Restart application
npm start

# 4. Test with one keyword first
```

## Version History

- **v1.0** (2025-01-30) - Initial Pinclicks integration
  - Automated pinclicks.com search and data export
  - ChatGPT analysis integration
  - Database storage for titles/descriptions/overlays
  - UI buttons for manual triggering
  - Automatic content generation using pinclicks data

## Support

For issues or questions:
1. Check logs in console for detailed error messages
2. Review `pinclicks/downloads/` for raw files
3. Verify Chrome and ChatGPT sessions are active
4. Test pinclicks standalone tool: `cd pinclicks && npm start`

---

**Status:** ✅ Production Ready
**Last Updated:** 2025-01-30
**Tested:** ✅ Full workflow tested and working
