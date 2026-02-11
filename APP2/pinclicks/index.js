const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');
const readline = require('readline');

// Configuration
const CONFIG = {
  // Download directory (defaults to ./downloads)
  downloadPath: path.join(__dirname, 'downloads'),

  // Chrome user data directory - using a separate profile for automation
  // This avoids conflicts with your main Chrome profile
  userDataDir: path.join(__dirname, 'chrome-profile'),

  // Browser visibility
  headless: false, // Set to true for headless mode

  // Delays (in milliseconds) to allow page elements to load
  waitTime: 2000,

  // Timeout for waiting for elements (in milliseconds)
  timeout: 30000
};

// Create download directory if it doesn't exist
if (!fs.existsSync(CONFIG.downloadPath)) {
  fs.mkdirSync(CONFIG.downloadPath, { recursive: true });
}

// Function to prompt user for input
function promptUser(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

// Function to format ChatGPT response into organized structure
function formatChatGPTResponse(content) {
  const lines = content.split('\n');
  let formatted = '';
  formatted += '═'.repeat(80) + '\n';
  formatted += '                    PINTEREST PIN SEO ANALYSIS\n';
  formatted += '═'.repeat(80) + '\n\n';

  // Extract data using the new format: **Title N:**, **Description N:**, **Text Overlay N:**
  const titles = [];
  const descriptions = [];
  const overlays = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Match **Title N:** pattern
    const titleMatch = line.match(/^\*\*Title\s+(\d+):\*\*\s*(.+)$/i);
    if (titleMatch) {
      const index = parseInt(titleMatch[1]) - 1;
      titles[index] = titleMatch[2].trim();
      continue;
    }

    // Match **Description N:** pattern
    const descMatch = line.match(/^\*\*Description\s+(\d+):\*\*\s*(.+)$/i);
    if (descMatch) {
      const index = parseInt(descMatch[1]) - 1;
      descriptions[index] = descMatch[2].trim();
      continue;
    }

    // Match **Text Overlay N:** pattern
    const overlayMatch = line.match(/^\*\*Text\s+Overlay\s+(\d+):\*\*\s*(.+)$/i);
    if (overlayMatch) {
      const index = parseInt(overlayMatch[1]) - 1;
      overlays[index] = overlayMatch[2].trim();
      continue;
    }
  }

  // Format output with matched titles, descriptions, and overlays
  const maxItems = Math.max(titles.length, descriptions.length, overlays.length);

  if (maxItems === 0) {
    // Fallback to raw content if no matches found
    formatted += '\n⚠️  Could not parse structured data. Showing raw content:\n\n';
    formatted += content;
    return formatted;
  }

  for (let i = 0; i < maxItems; i++) {
    formatted += `\n${'─'.repeat(80)}\n`;
    formatted += `PIN #${i + 1}\n`;
    formatted += `${'─'.repeat(80)}\n\n`;

    if (titles[i]) {
      formatted += `📌 TITLE:\n${titles[i]}\n\n`;
    }

    if (descriptions[i]) {
      formatted += `📝 DESCRIPTION:\n${descriptions[i]}\n\n`;
    }

    if (overlays[i]) {
      formatted += `🎨 TEXT OVERLAY:\n${overlays[i]}\n\n`;
    }
  }

  formatted += '═'.repeat(80) + '\n';
  formatted += `Total Pins: ${maxItems}\n`;
  formatted += '═'.repeat(80) + '\n';

  return formatted;
}

async function automatepinclicks() {
  console.log('Starting Pinclicks automation...');

  // Prompt user for Pinterest URL, keyword, or file path
  const userInput = await promptUser('\nEnter Pinterest URL, keyword, or path to text file with multiple URLs: ');

  if (!userInput || userInput.trim() === '') {
    console.error('Error: No input provided. Exiting...');
    return;
  }

  // Check if input is a file path
  let inputList = [];
  if (userInput.trim().endsWith('.txt') || fs.existsSync(userInput.trim())) {
    try {
      const filePath = userInput.trim();
      console.log(`\nReading URLs from file: ${filePath}`);
      const fileContent = fs.readFileSync(filePath, 'utf8');
      inputList = fileContent
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0 && !line.startsWith('#')); // Skip empty lines and comments

      console.log(`✓ Found ${inputList.length} URLs/keywords in file\n`);
    } catch (error) {
      console.error('Error reading file:', error.message);
      return;
    }
  } else {
    // Single URL or keyword
    inputList = [userInput.trim()];
  }

  // Launch browser once for all items
  let browser;
  try {
    console.log('Launching browser with user profile...');
    browser = await puppeteer.launch({
      headless: CONFIG.headless,
      executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      userDataDir: CONFIG.userDataDir,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--remote-debugging-port=0'
      ],
      defaultViewport: null
    });

    const page = await browser.newPage();

    // Set download behavior
    const client = await page.createCDPSession();
    await client.send('Page.setDownloadBehavior', {
      behavior: 'allow',
      downloadPath: CONFIG.downloadPath
    });

    // Process each URL/keyword
    for (let i = 0; i < inputList.length; i++) {
      const currentInput = inputList[i];
      console.log(`\n${'═'.repeat(80)}`);
      console.log(`Processing ${i + 1}/${inputList.length}: ${currentInput}`);
      console.log('═'.repeat(80) + '\n');

      try {
        await processKeyword(currentInput, page);
      } catch (error) {
        console.error(`Error processing "${currentInput}":`, error.message);
        console.log('Continuing to next item...\n');
      }

      // Small delay between items
      if (i < inputList.length - 1) {
        console.log('\nWaiting 5 seconds before processing next item...');
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }

    console.log(`\n${'═'.repeat(80)}`);
    console.log(`✓ Batch processing complete! Processed ${inputList.length} items.`);
    console.log('═'.repeat(80) + '\n');

  } catch (error) {
    console.error('Error during automation:', error.message);
    console.error('Full error:', error);
  } finally {
    if (browser) {
      console.log('Closing browser...');
      await browser.close();
    }
  }
}

async function processKeyword(userInput, page) {
  let searchKeyword = userInput.trim();
  let isPinterestUrl = userInput.includes('pinterest.com');

  // If Pinterest URL, extract the title first
    if (isPinterestUrl) {
      console.log('\n--- Extracting title from Pinterest pin ---');
      console.log(`Navigating to: ${userInput}`);

      try {
        await page.goto(userInput, {
          waitUntil: 'domcontentloaded',
          timeout: 60000
        });

        console.log('Waiting for pin to load...');
        await new Promise(resolve => setTimeout(resolve, 5000));

        // Extract the pin title
        const pinTitle = await page.evaluate(() => {
          // Try multiple selectors for the pin title
          // Pinterest uses h1 for the title
          const h1 = document.querySelector('h1');
          if (h1 && h1.textContent) {
            return h1.textContent.trim();
          }

          // Fallback to meta tags
          const metaTitle = document.querySelector('meta[property="og:title"]');
          if (metaTitle) {
            return metaTitle.getAttribute('content');
          }

          // Fallback to page title
          return document.title.split(' - ')[0].trim();
        });

        if (pinTitle) {
          searchKeyword = pinTitle;
          console.log(`✓ Extracted pin title: "${searchKeyword}"`);
        } else {
          console.log('Warning: Could not extract pin title automatically');
          searchKeyword = await promptUser('Please enter the keyword manually: ');
        }

      } catch (error) {
        console.error('Error extracting Pinterest title:', error.message);
        searchKeyword = await promptUser('Please enter the keyword manually: ');
      }
    }

    console.log(`\nSearching for keyword: "${searchKeyword}"\n`);

    // Set download behavior
    const client = await page.createCDPSession();
    await client.send('Page.setDownloadBehavior', {
      behavior: 'allow',
      downloadPath: CONFIG.downloadPath
    });

    console.log(`Navigating to Top Pins page...`);
    try {
      await page.goto('https://app.pinclicks.com/pins', {
        waitUntil: 'domcontentloaded', // Changed from networkidle2 for faster load
        timeout: 60000 // Increased timeout to 60 seconds
      });
      console.log('Page loaded successfully');
    } catch (error) {
      console.log('Warning: Page load timeout, but continuing anyway...');
    }

    console.log('Waiting for page to fully render...');
    await new Promise(resolve => setTimeout(resolve, CONFIG.waitTime));

    // Find and interact with search bar
    console.log(`Searching for keyword: "${searchKeyword}"...`);
    const searchSelectors = [
      'input[type="search"]',
      'input[placeholder*="Search"]',
      'input[placeholder*="search"]',
      'input[name*="search"]',
      '[data-testid*="search"] input',
      '.search-input',
      '#search'
    ];

    let searchBox = null;
    for (const selector of searchSelectors) {
      try {
        searchBox = await page.waitForSelector(selector, { timeout: 5000 });
        if (searchBox) {
          console.log(`Found search box with selector: ${selector}`);
          break;
        }
      } catch (error) {
        continue;
      }
    }

    if (!searchBox) {
      throw new Error('Could not find search box. Please update the selector in the script.');
    }

    // Clear any existing text and type the keyword
    await searchBox.click({ clickCount: 3 }); // Select all
    await searchBox.type(searchKeyword);
    await searchBox.press('Enter');

    console.log('Waiting for search results to load...');

    // Wait for initial results to appear
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Wait for the table to be populated with data (check for pin rows)
    try {
      console.log('Waiting for data table to appear...');
      await page.waitForFunction(
        () => {
          // Check if there are pin/result rows in the table
          const rows = document.querySelectorAll('tbody tr, [role="row"]');
          return rows.length > 0;
        },
        { timeout: 15000 }
      );

      console.log('Table appeared, waiting for all data to finish loading...');

      // Wait for "Loading..." text to disappear (indicating data is fully loaded)
      let loadingComplete = false;
      let attempts = 0;
      const maxAttempts = 60; // 60 attempts * 2 seconds = 2 minutes max wait

      while (!loadingComplete && attempts < maxAttempts) {
        const hasLoadingText = await page.evaluate(() => {
          // Check if any table cells contain "Loading..." text
          const cells = Array.from(document.querySelectorAll('td, [role="cell"]'));
          return cells.some(cell => {
            const text = cell.textContent?.trim().toLowerCase();
            return text === 'loading...' || text === 'loading';
          });
        });

        if (!hasLoadingText) {
          loadingComplete = true;
          console.log('✓ All data loaded successfully!');
        } else {
          attempts++;
          if (attempts % 5 === 0) {
            console.log(`Still loading data... (${attempts * 2} seconds elapsed)`);
          }
          await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds between checks
        }
      }

      if (!loadingComplete) {
        console.log('Warning: Data may still be loading after 2 minutes, continuing anyway...');
      }

      // Extra wait to ensure everything is rendered
      console.log('Waiting 3 more seconds for final rendering...');
      await new Promise(resolve => setTimeout(resolve, 3000));
      console.log('All search results should be fully loaded now');

    } catch (error) {
      console.log('Warning: Could not detect data table, continuing with extended wait...');
      await new Promise(resolve => setTimeout(resolve, 12000));
    }

    // Look for and click the Export button
    console.log('Looking for Export button...');

    try {
      // Wait for any button containing "Export" text
      await page.waitForFunction(
        () => {
          const buttons = Array.from(document.querySelectorAll('button'));
          return buttons.some(btn => btn.textContent && btn.textContent.includes('Export'));
        },
        { timeout: 10000 }
      );

      // Click the Export button directly in the page context (same method as Annotated Interests)
      const clicked = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const exportBtn = buttons.find(btn => btn.textContent && btn.textContent.includes('Export'));
        if (exportBtn) {
          exportBtn.click();
          return true;
        }
        return false;
      });

      if (clicked) {
        console.log('Clicked Export button - waiting for dropdown to appear...');

        // Wait specifically for the dropdown menu items to appear
        try {
          await page.waitForFunction(
            () => {
              const elements = Array.from(document.querySelectorAll('*'));
              // Look for "Pin Data" which is the first item in the dropdown
              return elements.some(el => {
                if (!el.textContent || el.offsetParent === null) return false;
                const text = el.textContent.trim().toLowerCase();
                return text === 'pin data';
              });
            },
            { timeout: 10000 }
          );
          console.log('Dropdown appeared successfully');
          await new Promise(resolve => setTimeout(resolve, 1000)); // Extra wait for animation
        } catch (err) {
          console.log('Warning: Could not detect dropdown appearance, continuing anyway...');
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      } else {
        throw new Error('Export button found but could not click');
      }
    } catch (error) {
      console.log('Could not find Export button automatically.');
      console.log('Please click on the Export button manually and wait for dropdown...');
      await new Promise(resolve => setTimeout(resolve, 4000));
    }

    // Look for "Annotated Interests" option in export menu dropdown
    console.log('Looking for "Annotated Interests" option in dropdown...');

    // First, let's see what's in the dropdown for debugging
    const dropdownContents = await page.evaluate(() => {
      const elements = Array.from(document.querySelectorAll('*'));
      const visible = elements.filter(el =>
        el.offsetParent !== null &&
        el.textContent &&
        el.textContent.trim().length > 0 &&
        el.textContent.trim().length < 50 // Avoid long text blocks
      );
      return visible.map(el => el.textContent.trim()).filter((v, i, a) => a.indexOf(v) === i);
    });
    console.log('Visible elements in page:', dropdownContents.slice(0, 20)); // Show first 20

    try {
      // Wait for the dropdown menu to appear and find "Annotated Interests" (flexible matching)
      await page.waitForFunction(
        () => {
          const elements = Array.from(document.querySelectorAll('*'));
          return elements.some(el => {
            if (!el.textContent || el.offsetParent === null) return false;
            const text = el.textContent.trim().toLowerCase();
            // Match "annotated interest" or "annotated interests"
            return text === 'annotated interests' || text === 'annotated interest';
          });
        },
        { timeout: 10000 }
      );

      // Click "Annotated Interests" using page.evaluate for reliable clicking
      const clicked = await page.evaluate(() => {
        const elements = Array.from(document.querySelectorAll('*'));
        const target = elements.find(el => {
          if (!el.textContent || el.offsetParent === null) return false;
          const text = el.textContent.trim().toLowerCase();
          return text === 'annotated interests' || text === 'annotated interest';
        });
        if (target) {
          target.click();
          return true;
        }
        return false;
      });

      if (clicked) {
        console.log('Clicked "Annotated Interests" - download should start...');
      } else {
        throw new Error('Element found but could not click');
      }

    } catch (error) {
      console.log('Could not find "Annotated Interests" option automatically.');
      await promptUser('Please click on "Annotated Interests" to download manually, then press Enter: ');
    }

    // Wait for download to complete and get the filename
    console.log(`Download will be saved to: ${CONFIG.downloadPath}`);
    console.log('Waiting for download to complete...');

    // Get list of files before download
    const filesBefore = fs.readdirSync(CONFIG.downloadPath);

    // Wait for new file to appear
    let downloadedFile = null;
    let attempts = 0;
    while (!downloadedFile && attempts < 20) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      const filesAfter = fs.readdirSync(CONFIG.downloadPath);
      const newFiles = filesAfter.filter(f => !filesBefore.includes(f) && f.endsWith('.csv'));

      if (newFiles.length > 0) {
        downloadedFile = newFiles[0];
        console.log(`✓ Downloaded: ${downloadedFile}`);
        break;
      }
      attempts++;
    }

    if (!downloadedFile) {
      console.log('Warning: Could not detect downloaded file. Continuing anyway...');
      // Find the most recent CSV file
      const csvFiles = fs.readdirSync(CONFIG.downloadPath)
        .filter(f => f.endsWith('.csv'))
        .map(f => ({
          name: f,
          time: fs.statSync(path.join(CONFIG.downloadPath, f)).mtime.getTime()
        }))
        .sort((a, b) => b.time - a.time);

      if (csvFiles.length > 0) {
        downloadedFile = csvFiles[0].name;
        console.log(`Using most recent CSV file: ${downloadedFile}`);
      } else {
        throw new Error('No CSV files found in downloads folder');
      }
    }

    const downloadedFilePath = path.join(CONFIG.downloadPath, downloadedFile);
    console.log(`File path: ${downloadedFilePath}`);

    // Step 2: Navigate to ChatGPT and upload the file
    console.log('\n--- Uploading to ChatGPT for analysis ---');
    console.log('Navigating to ChatGPT Pin SEO Analysis...');

    try {
      await page.goto('https://chatgpt.com/g/g-d4MhHvQzg-pin-seo-analysis', {
        waitUntil: 'domcontentloaded',
        timeout: 60000
      });
    } catch (error) {
      console.log('Warning: ChatGPT page load timeout, continuing...');
    }

    // Wait for ChatGPT page to load
    console.log('Waiting for ChatGPT to load...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    console.log('ChatGPT loaded (using saved login session)');

    // Find and click the file upload button
    console.log('Looking for file upload button...');
    try {
      // ChatGPT uses an input[type="file"] for attachments
      const fileInput = await page.$('input[type="file"]');

      if (fileInput) {
        console.log('Uploading CSV file...');
        await fileInput.uploadFile(downloadedFilePath);
        console.log('✓ File uploaded successfully!');

        // Wait for file to be processed
        console.log('Waiting for file to be attached...');
        await new Promise(resolve => setTimeout(resolve, 3000));

        // Press Enter or click Send to submit
        console.log('Sending file to ChatGPT for analysis...');
        await page.keyboard.press('Enter');

        // Wait for ChatGPT to process and respond
        console.log('Waiting for ChatGPT analysis (this may take 30-60 seconds)...');
        await new Promise(resolve => setTimeout(resolve, 45000)); // Wait 45 seconds for analysis

        console.log('\n✓ ChatGPT analysis should be complete!');
        console.log('Looking for Copy button...');

        // Wait a bit more to ensure response is fully rendered
        await new Promise(resolve => setTimeout(resolve, 5000));

        // Debug: Check what buttons are available
        const buttonInfo = await page.evaluate(() => {
          const buttons = Array.from(document.querySelectorAll('button'));
          return buttons.slice(-10).map(btn => ({
            ariaLabel: btn.getAttribute('aria-label'),
            title: btn.getAttribute('title'),
            text: btn.textContent?.slice(0, 50),
            hasSvg: !!btn.querySelector('svg')
          }));
        });
        console.log('Available buttons (last 10):', JSON.stringify(buttonInfo, null, 2));

        // Find and click the Copy button
        try {
          const copyClicked = await page.evaluate(() => {
            // Look for copy button - ChatGPT uses icon buttons
            const buttons = Array.from(document.querySelectorAll('button'));

            // Find all potential copy buttons (look for aria-label, title, or SVG icons)
            const copyButtons = buttons.filter(btn => {
              const ariaLabel = btn.getAttribute('aria-label')?.toLowerCase() || '';
              const title = btn.getAttribute('title')?.toLowerCase() || '';
              const text = btn.textContent?.toLowerCase() || '';

              // Check for copy-related attributes in multiple languages
              // English: "copy", French: "copier", Spanish: "copiar", German: "kopieren"
              const copyKeywords = ['copy', 'copier', 'copiar', 'kopieren'];
              const hasAriaLabel = copyKeywords.some(keyword => ariaLabel.includes(keyword));
              const hasTitle = copyKeywords.some(keyword => title.includes(keyword));
              const hasText = copyKeywords.some(keyword => text.includes(keyword) && text.length < 20);

              return hasAriaLabel || hasTitle || hasText;
            });

            // Get the last copy button (most recent message)
            const copyButton = copyButtons[copyButtons.length - 1];

            if (copyButton) {
              copyButton.click();
              return true;
            }
            return false;
          });

          if (copyClicked) {
            console.log('✓ Clicked Copy button!');
            await new Promise(resolve => setTimeout(resolve, 1000));

            // Get the content from clipboard using page context
            const copiedContent = await page.evaluate(async () => {
              try {
                const text = await navigator.clipboard.readText();
                return text;
              } catch (err) {
                return null;
              }
            });

            if (copiedContent) {
              // Parse and format the content
              const formattedContent = formatChatGPTResponse(copiedContent);

              // Save both raw and formatted content
              const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
              const baseFileName = `chatgpt-analysis-${searchKeyword.replace(/\s+/g, '-')}-${timestamp}`;

              // Save raw content
              const rawFileName = `${baseFileName}-raw.txt`;
              const rawFilePath = path.join(CONFIG.downloadPath, rawFileName);
              fs.writeFileSync(rawFilePath, copiedContent, 'utf8');

              // Save formatted content
              const formattedFileName = `${baseFileName}-formatted.txt`;
              const formattedFilePath = path.join(CONFIG.downloadPath, formattedFileName);
              fs.writeFileSync(formattedFilePath, formattedContent, 'utf8');

              console.log(`✓ Saved ChatGPT analysis:`);
              console.log(`  - Raw: ${rawFileName}`);
              console.log(`  - Formatted: ${formattedFileName}`);
            } else {
              console.log('Warning: Could not read clipboard content');
              console.log('The content has been copied to your clipboard - paste it manually if needed');
            }
          } else {
            console.log('Could not find Copy button automatically.');
            await promptUser('Please click Copy manually and press Enter when done: ');
          }
        } catch (error) {
          console.error('Error clicking Copy button:', error.message);
          await promptUser('Please click Copy manually and press Enter when done: ');
        }

      } else {
        console.log('Could not find file upload button automatically.');
        console.log(`File location: ${downloadedFilePath}`);
        await promptUser('Please upload the file manually, then press Enter when done: ');
      }
    } catch (error) {
      console.error('Error uploading to ChatGPT:', error.message);
      await promptUser('Please upload the file manually and press Enter to continue: ');
    }

  console.log(`\n✓ Completed processing: "${searchKeyword}"`);
  console.log(`Downloaded file: ${downloadedFilePath}`);
}

// Run the automation
automatepinclicks().catch(console.error);
