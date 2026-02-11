# Pinclicks Automation Tool

Automated tool to search and download annotated interest data from pinclicks.com.

## Features

- Interactive keyword input (no need to edit code!)
- Uses a dedicated Chrome profile for automation
- Searches for specified keywords on Top Pins
- Automatically exports and downloads "Annotated Interests" data
- Visible browser mode for monitoring
- Easy to use

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. First-time setup:
   - Run the script once to create the automation Chrome profile
   - Log in to pinclicks.com when the browser opens
   - The login session will be saved for future runs

## How to Use

### Option 1: Web Interface (Recommended) 🎨

1. Start the web UI:
   ```bash
   npm run ui
   ```

2. Open your browser and go to: **http://localhost:3000**

3. Paste your Pinterest URLs or keywords in the text box (one per line)

4. Click "Start Automation" and watch the progress in real-time!

### Option 2: Command Line

1. Run the automation:
   ```bash
   npm start
   ```

2. Enter one of:
   - **A Pinterest URL** (e.g., `https://pinterest.com/pin/123456789/`)
   - **A keyword** (e.g., `chicken pasta`)
   - **A text file path** with multiple URLs/keywords (e.g., `urls.txt`)

3. For batch processing:
   - Create a text file with one URL or keyword per line
   - Lines starting with `#` are treated as comments
   - Example: `pinterest-urls-example.txt`

4. If you entered a Pinterest URL:
   - The script will extract the pin title automatically
   - Use that title as the search keyword

4. The script will:
   - Open Chrome with automation profile
   - Navigate directly to Top Pins (https://app.pinclicks.com/pins)
   - Search for your keyword
   - Wait for all data to load (15-18 seconds)
   - Click Export
   - Download "Annotated Interests" CSV
   - Navigate to ChatGPT PinClicks Analysis
   - Upload the CSV file
   - Wait for ChatGPT analysis
   - Prompt you to export the results

5. Downloaded files will be saved to the `downloads` folder

## Examples

**Using a Pinterest URL:**
```
Enter Pinterest URL or keyword: https://fr.pinterest.com/pin/703756188738202/
✓ Extracted pin title: "Million Dollar Soup Velvet"
Searching for keyword: "Million Dollar Soup Velvet"
```

**Using a keyword directly:**
```
Enter Pinterest URL, keyword, or path to text file: chicken pasta
Searching for keyword: "chicken pasta"
```

**Batch processing multiple URLs:**
```
Enter Pinterest URL, keyword, or path to text file: urls.txt

Reading URLs from file: urls.txt
✓ Found 5 URLs/keywords in file

════════════════════════════════════════════════════════════════════════════════
Processing 1/5: https://pinterest.com/pin/123456789/
════════════════════════════════════════════════════════════════════════════════

--- Extracting title from Pinterest pin ---
✓ Extracted pin title: "Creamy Pasta Recipe"
...

════════════════════════════════════════════════════════════════════════════════
Processing 2/5: chicken salad
════════════════════════════════════════════════════════════════════════════════
...
```

**Create a batch file (urls.txt):**
```
# My Pinterest URLs and keywords
https://pinterest.com/pin/123456789/
chicken pasta
https://fr.pinterest.com/pin/987654321/
healthy breakfast
```

## Important Notes

- The script uses a **separate Chrome profile** stored in the `chrome-profile` folder
- You only need to log in to **pinclicks.com once** (on first run)
- You may need to log in to **ChatGPT** the first time the script accesses it
- Your main Chrome browser can remain open while running the script
- The script waits 15-18 seconds after searching to ensure all data is loaded
- If any step fails, the script will pause and ask you to complete it manually
- Downloaded CSV files are saved to `./downloads` by default

## Troubleshooting

### Script can't find elements
If the script can't find certain elements (like the search box or export button), you may need to:
1. Run the script and let it fail
2. Inspect the website to find the correct selectors
3. Update the selector arrays in `index.js`

### Not logged in to PinClicks
If you see a login page:
1. Log in to pinclicks.com manually in the browser window
2. The session will be saved in the `chrome-profile` folder
3. Future runs will use the saved session

### ChatGPT Login Required
If the script detects you need to log in to ChatGPT:
1. The script will pause and prompt you to log in
2. Log in to ChatGPT manually
3. Press Enter to continue the automation
4. Your ChatGPT session will be saved for future runs

### Downloads not working
- Check that the `downloads` folder is created
- Verify Chrome download settings allow automatic downloads

## Switching to Headless Mode

Once everything works correctly, you can enable headless mode by changing:
```javascript
headless: true
```

This will run the automation in the background without showing the browser window.

## Advanced Configuration

You can adjust timeouts and delays in the CONFIG object:
- `waitTime`: Delay between actions (default: 2000ms)
- `timeout`: Maximum time to wait for elements (default: 30000ms)
