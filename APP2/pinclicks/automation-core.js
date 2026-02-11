// Export the automation functionality for use by web UI
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

// Import the necessary functions from index.js
const CONFIG = {
  downloadPath: path.join(__dirname, 'downloads'),
  userDataDir: path.join(__dirname, 'chrome-profile'),
  headless: false,
  waitTime: 2000,
  timeout: 30000
};

async function runAutomationWithUI(inputFile, logCallback, progressCallback, resultsCallback, useBatchMode = true) {
  const fileContent = fs.readFileSync(inputFile, 'utf8');
  const inputList = fileContent
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0 && !line.startsWith('#'));

  logCallback(`Found ${inputList.length} URLs/keywords to process\n`, 'info');

  if (useBatchMode) {
    return await runBatchAutomationWithUI(inputList, logCallback, progressCallback, resultsCallback);
  } else {
    return await runLegacyAutomationWithUI(inputList, logCallback, progressCallback, resultsCallback);
  }
}

async function runBatchAutomationWithUI(inputList, logCallback, progressCallback, resultsCallback) {
  const allResults = [];
  const downloadResults = [];

  try {
    // PHASE 1: Download all CSV files from PinClicks
    logCallback('\n📥 PHASE 1: Downloading all CSV files from PinClicks\n', 'info');
    logCallback('═'.repeat(60) + '\n', 'info');

    let browser = await puppeteer.launch({
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

    const client = await page.createCDPSession();
    await client.send('Page.setDownloadBehavior', {
      behavior: 'allow',
      downloadPath: CONFIG.downloadPath
    });

    // Download all keywords (stay on PinClicks page)
    for (let i = 0; i < inputList.length; i++) {
      const keyword = inputList[i];
      const isFirstKeyword = i === 0;

      progressCallback({
        phase: 'download',
        current: i + 1,
        total: inputList.length,
        keyword: keyword
      });

      logCallback(`\n📥 Downloading ${i + 1}/${inputList.length}: ${keyword}\n`, 'info');

      try {
        const csvFileName = await downloadSingleKeywordUI(keyword, page, logCallback, isFirstKeyword);
        downloadResults.push({ keyword, csvFileName, success: true });
        logCallback(`✓ Downloaded: ${csvFileName}\n`, 'success');
      } catch (error) {
        logCallback(`✗ Error: ${error.message}\n`, 'error');
        downloadResults.push({ keyword, error: error.message, success: false });
      }

      // Small delay between downloads (but stay on PinClicks)
      if (i < inputList.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    await browser.close();
    logCallback(`\n✅ Phase 1 Complete: ${downloadResults.filter(r => r.success).length}/${inputList.length} files downloaded\n`, 'success');

    // PHASE 2: Analyze all CSV files with ChatGPT in batches of 5
    logCallback('\n🤖 PHASE 2: Analyzing files with ChatGPT (batches of 5)\n', 'info');
    logCallback('═'.repeat(60) + '\n', 'info');

    const batchSize = 5;
    const batches = [];
    const successfulDownloads = downloadResults.filter(r => r.success);

    for (let i = 0; i < successfulDownloads.length; i += batchSize) {
      batches.push(successfulDownloads.slice(i, i + batchSize));
    }

    logCallback(`Processing ${batches.length} batches (${batchSize} files per batch)\n\n`, 'info');

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];

      progressCallback({
        phase: 'analyze',
        batchCurrent: batchIndex + 1,
        batchTotal: batches.length
      });

      logCallback(`\n🔄 Processing batch ${batchIndex + 1}/${batches.length}\n`, 'info');
      logCallback('─'.repeat(60) + '\n', 'info');

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

      const chatPage = await browser.newPage();

      logCallback('Opening ChatGPT...\n', 'info');
      await chatPage.goto('https://chatgpt.com/g/g-d4MhHvQzg-pin-seo-analysis', {
        waitUntil: 'domcontentloaded',
        timeout: 60000
      });
      await new Promise(resolve => setTimeout(resolve, 5000));

      for (let i = 0; i < batch.length; i++) {
        const item = batch[i];
        logCallback(`\n🔍 Analyzing ${i + 1}/${batch.length} in batch: ${item.keyword}\n`, 'info');

        try {
          const result = await analyzeSingleFileUI(chatPage, item.keyword, item.csvFileName, logCallback);
          allResults.push(result);
          resultsCallback(result);
          logCallback(`✓ Analysis complete\n`, 'success');
        } catch (error) {
          logCallback(`✗ Error: ${error.message}\n`, 'error');
          allResults.push({ keyword: item.keyword, error: error.message });
        }

        if (i < batch.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 3000));
        }
      }

      await browser.close();

      if (batchIndex < batches.length - 1) {
        logCallback('\nWaiting 5 seconds before next batch...\n', 'info');
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }

    logCallback(`\n✅ BATCH AUTOMATION COMPLETE!\n`, 'success');
    logCallback(`   Downloaded: ${downloadResults.filter(r => r.success).length}/${inputList.length}\n`, 'success');
    logCallback(`   Analyzed: ${allResults.filter(r => !r.error).length}/${inputList.length}\n`, 'success');

  } catch (error) {
    logCallback(`Fatal error: ${error.message}\n`, 'error');
    throw error;
  }

  return allResults;
}

async function runLegacyAutomationWithUI(inputList, logCallback, progressCallback, resultsCallback) {
  let browser;
  const allResults = [];

  try {
    logCallback('Launching browser...\n', 'info');
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

    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('Copy button') || text.includes('Clipboard') || text.includes('assistant message')) {
        logCallback(`[Browser Console] ${text}\n`, 'info');
      }
    });

    const client = await page.createCDPSession();
    await client.send('Page.setDownloadBehavior', {
      behavior: 'allow',
      downloadPath: CONFIG.downloadPath
    });

    for (let i = 0; i < inputList.length; i++) {
      const currentInput = inputList[i];

      progressCallback({
        current: i + 1,
        total: inputList.length,
        keyword: currentInput
      });

      logCallback(`\n${'═'.repeat(60)}\n`, 'info');
      logCallback(`Processing ${i + 1}/${inputList.length}: ${currentInput}\n`, 'info');
      logCallback(`${'═'.repeat(60)}\n`, 'info');

      try {
        const result = await processKeywordUI(currentInput, page, logCallback);
        allResults.push(result);
        resultsCallback(result);
      } catch (error) {
        logCallback(`Error: ${error.message}\n`, 'error');
        allResults.push({ keyword: currentInput, error: error.message });
      }

      if (i < inputList.length - 1) {
        logCallback('\nWaiting 5 seconds before next item...\n', 'info');
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }

    logCallback(`\n✅ Completed all ${inputList.length} items!\n`, 'success');

  } catch (error) {
    logCallback(`Fatal error: ${error.message}\n`, 'error');
    throw error;
  } finally {
    if (browser) {
      logCallback('Closing browser...\n', 'info');
      await browser.close();
    }
  }

  return allResults;
}

async function downloadSingleKeywordUI(keyword, page, logCallback, isFirstKeyword = false) {
  // Only navigate to PinClicks on the first keyword
  if (isFirstKeyword) {
    await page.goto('https://app.pinclicks.com/pins', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  // Search for keyword
  const searchBox = await page.$('input[type="search"], input[placeholder*="Search"]');
  if (searchBox) {
    await searchBox.click({ clickCount: 3 });
    await searchBox.type(keyword);
    await searchBox.press('Enter');
  }

  await new Promise(resolve => setTimeout(resolve, 3000));

  // Wait for loading to complete (with enhanced logic)
  let loadingComplete = false;
  let attempts = 0;
  const maxAttemptsBeforeRefresh = 90;
  const maxAttemptsTotal = 300;
  let refreshCount = 0;
  const maxRefreshes = 3;

  while (!loadingComplete && attempts < maxAttemptsTotal) {
    const hasLoading = await page.evaluate(() => {
      const cells = Array.from(document.querySelectorAll('td, [role="cell"]'));
      return cells.some(cell => cell.textContent?.trim().toLowerCase() === 'loading...');
    });

    if (!hasLoading) {
      loadingComplete = true;
    } else {
      attempts++;

      if (attempts % 5 === 0) {
        const elapsedMinutes = Math.floor((attempts * 2) / 60);
        const elapsedSeconds = (attempts * 2) % 60;
        logCallback(`⏳ Still loading... (${elapsedMinutes}m ${elapsedSeconds}s)\n`, 'info');
      }

      if (attempts % maxAttemptsBeforeRefresh === 0 && attempts > 0 && refreshCount < maxRefreshes) {
        refreshCount++;
        logCallback(`⚠️ Refreshing page (attempt ${refreshCount}/${maxRefreshes})...\n`, 'warning');

        await page.reload({ waitUntil: 'domcontentloaded' });
        await new Promise(resolve => setTimeout(resolve, 3000));

        const searchBox = await page.$('input[type="search"], input[placeholder*="Search"]');
        if (searchBox) {
          await searchBox.click({ clickCount: 3 });
          await searchBox.type(keyword);
          await searchBox.press('Enter');
          await new Promise(resolve => setTimeout(resolve, 3000));
        }

        attempts = 0;
      }

      if (attempts >= maxAttemptsTotal) {
        logCallback(`⚠️ Loading exceeded 10 minutes. Continuing anyway...\n`, 'warning');
        break;
      }

      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  await new Promise(resolve => setTimeout(resolve, 3000));

  // Export data
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const exportBtn = buttons.find(btn => btn.textContent?.includes('Export'));
    if (exportBtn) exportBtn.click();
  });

  await new Promise(resolve => setTimeout(resolve, 3000));

  // Click Annotated Interests
  await page.evaluate(() => {
    const elements = Array.from(document.querySelectorAll('*'));
    const target = elements.find(el => {
      const text = el.textContent?.trim().toLowerCase();
      return text === 'annotated interests' || text === 'annotated interest';
    });
    if (target) target.click();
  });

  await new Promise(resolve => setTimeout(resolve, 10000));

  // Find downloaded file
  const files = fs.readdirSync(CONFIG.downloadPath);
  const csvFile = files.filter(f => f.endsWith('.csv')).sort((a, b) => {
    return fs.statSync(path.join(CONFIG.downloadPath, b)).mtime -
           fs.statSync(path.join(CONFIG.downloadPath, a)).mtime;
  })[0];

  if (!csvFile) {
    throw new Error('CSV file not downloaded');
  }

  return csvFile;
}

async function analyzeSingleFileUI(page, keyword, csvFileName, logCallback) {
  const csvFilePath = path.join(CONFIG.downloadPath, csvFileName);

  // Upload file
  const fileInput = await page.$('input[type="file"]');
  if (!fileInput) {
    throw new Error('Could not find file upload button');
  }

  await fileInput.uploadFile(csvFilePath);
  await new Promise(resolve => setTimeout(resolve, 8000));

  // Send the message
  await page.keyboard.press('Enter');

  // Wait for ChatGPT to finish responding
  let responseComplete = false;
  let responseAttempts = 0;
  const maxWaitTime = 90;

  while (!responseComplete && responseAttempts < maxWaitTime) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    responseAttempts++;

    const isGenerating = await page.evaluate(() => {
      const stopButton = Array.from(document.querySelectorAll('button'))
        .find(btn => btn.textContent?.toLowerCase().includes('stop'));
      return !!stopButton;
    });

    if (!isGenerating && responseAttempts > 45) {
      responseComplete = true;
    } else if (responseAttempts % 10 === 0) {
      logCallback(`⏳ Waiting for response... (${responseAttempts}s)\n`, 'info');
    }
  }

  await new Promise(resolve => setTimeout(resolve, 3000));

  // Click copy button
  const copyClicked = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const copyButtons = buttons.filter(btn => {
      const ariaLabel = btn.getAttribute('aria-label')?.toLowerCase() || '';
      const title = btn.getAttribute('title')?.toLowerCase() || '';
      const text = btn.textContent?.toLowerCase() || '';
      const copyKeywords = ['copy', 'copier', 'copiar', 'kopieren'];
      return copyKeywords.some(keyword =>
        ariaLabel.includes(keyword) || title.includes(keyword) ||
        (text.includes(keyword) && text.length < 20)
      );
    });
    const copyButton = copyButtons[copyButtons.length - 1];
    if (copyButton) {
      copyButton.click();
      return true;
    }
    return false;
  });

  if (!copyClicked) {
    throw new Error('Could not find copy button');
  }

  await new Promise(resolve => setTimeout(resolve, 2000));

  // Read clipboard
  const copiedContent = await page.evaluate(async () => {
    try {
      const text = await navigator.clipboard.readText();
      return text;
    } catch (err) {
      return null;
    }
  });

  if (!copiedContent || copiedContent.length < 50) {
    throw new Error('Could not read clipboard content');
  }

  // Save raw content
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const rawFileName = `chatgpt-raw-${keyword.replace(/\s+/g, '-').substring(0, 30)}-${timestamp}.txt`;
  fs.writeFileSync(path.join(CONFIG.downloadPath, rawFileName), copiedContent, 'utf8');

  // Parse results
  const parsed = parseResults(copiedContent);

  return {
    keyword: keyword,
    titles: parsed.titles,
    descriptions: parsed.descriptions,
    overlays: parsed.overlays,
    rawContent: copiedContent
  };
}

async function processKeywordUI(userInput, page, logCallback) {
  let searchKeyword = userInput.trim();
  const isPinterestUrl = userInput.includes('pinterest.com');

  // Extract Pinterest title if URL
  if (isPinterestUrl) {
    logCallback('Extracting Pinterest title...\n', 'info');
    try {
      await page.goto(userInput, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await new Promise(resolve => setTimeout(resolve, 5000));

      const pinTitle = await page.evaluate(() => {
        const h1 = document.querySelector('h1');
        if (h1?.textContent) return h1.textContent.trim();
        const metaTitle = document.querySelector('meta[property="og:title"]');
        if (metaTitle) return metaTitle.getAttribute('content');
        return document.title.split(' - ')[0].trim();
      });

      if (pinTitle) {
        searchKeyword = pinTitle;
        logCallback(`✓ Extracted title: "${searchKeyword}"\n`, 'success');
      }
    } catch (error) {
      logCallback(`Warning: Could not extract title\n`, 'warning');
    }
  }

  // Navigate to PinClicks and search
  logCallback(`Searching on PinClicks for: "${searchKeyword}"\n`, 'info');
  await page.goto('https://app.pinclicks.com/pins', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Search
  const searchBox = await page.$('input[type="search"], input[placeholder*="Search"]');
  if (searchBox) {
    await searchBox.click({ clickCount: 3 });
    await searchBox.type(searchKeyword);
    await searchBox.press('Enter');
    logCallback('Search initiated\n', 'info');
  }

  // Wait for data to load with enhanced retry logic
  logCallback('Waiting for data to load...\n', 'info');
  await new Promise(resolve => setTimeout(resolve, 3000));

  // Wait for loading to complete with retry mechanism
  let loadingComplete = false;
  let attempts = 0;
  const maxAttemptsBeforeRefresh = 90; // 3 minutes (90 * 2s = 180s)
  const maxAttemptsTotal = 300; // 10 minutes (300 * 2s = 600s)
  let refreshCount = 0;
  const maxRefreshes = 3;

  while (!loadingComplete && attempts < maxAttemptsTotal) {
    const hasLoading = await page.evaluate(() => {
      const cells = Array.from(document.querySelectorAll('td, [role="cell"]'));
      return cells.some(cell => cell.textContent?.trim().toLowerCase() === 'loading...');
    });

    if (!hasLoading) {
      loadingComplete = true;
      logCallback('✓ Data loaded successfully\n', 'success');
    } else {
      attempts++;

      // Progress update every 10 seconds
      if (attempts % 5 === 0) {
        const elapsedMinutes = Math.floor((attempts * 2) / 60);
        const elapsedSeconds = (attempts * 2) % 60;
        logCallback(`Still loading... (${elapsedMinutes}m ${elapsedSeconds}s elapsed)\n`, 'info');
      }

      // Refresh page after 3 minutes of loading
      if (attempts % maxAttemptsBeforeRefresh === 0 && attempts > 0 && refreshCount < maxRefreshes) {
        refreshCount++;
        logCallback(`⚠️ Data still loading after ${attempts * 2}s. Refreshing page (attempt ${refreshCount}/${maxRefreshes})...\n`, 'warning');

        await page.reload({ waitUntil: 'domcontentloaded' });
        await new Promise(resolve => setTimeout(resolve, 3000));

        // Re-search after refresh
        const searchBox = await page.$('input[type="search"], input[placeholder*="Search"]');
        if (searchBox) {
          await searchBox.click({ clickCount: 3 });
          await searchBox.type(searchKeyword);
          await searchBox.press('Enter');
          logCallback('Search re-initiated after refresh\n', 'info');
          await new Promise(resolve => setTimeout(resolve, 3000));
        }

        // Reset attempts counter after refresh
        attempts = 0;
      }

      // Notify user if loading exceeds 10 minutes
      if (attempts >= maxAttemptsTotal) {
        logCallback(`\n⚠️ WARNING: Data has been loading for over 10 minutes!\n`, 'warning');
        logCallback(`This may indicate a PinClicks issue. Proceeding anyway...\n`, 'warning');
        logCallback(`Please verify the data manually if needed.\n\n`, 'warning');
        break;
      }

      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  // Extra wait to ensure everything is rendered
  await new Promise(resolve => setTimeout(resolve, 3000));

  // Click Export and download
  logCallback('Exporting data...\n', 'info');

  // Export button click logic (simplified)
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const exportBtn = buttons.find(btn => btn.textContent?.includes('Export'));
    if (exportBtn) exportBtn.click();
  });

  await new Promise(resolve => setTimeout(resolve, 3000));

  // Click Annotated Interests
  await page.evaluate(() => {
    const elements = Array.from(document.querySelectorAll('*'));
    const target = elements.find(el => {
      const text = el.textContent?.trim().toLowerCase();
      return text === 'annotated interests' || text === 'annotated interest';
    });
    if (target) target.click();
  });

  logCallback('Download started\n', 'success');
  await new Promise(resolve => setTimeout(resolve, 10000));

  // Find downloaded file
  const files = fs.readdirSync(CONFIG.downloadPath);
  const csvFile = files.filter(f => f.endsWith('.csv')).sort((a, b) => {
    return fs.statSync(path.join(CONFIG.downloadPath, b)).mtime -
           fs.statSync(path.join(CONFIG.downloadPath, a)).mtime;
  })[0];

  // Upload to ChatGPT and get results
  logCallback('Uploading to ChatGPT...\n', 'info');

  await page.goto('https://chatgpt.com/g/g-d4MhHvQzg-pin-seo-analysis',
    { waitUntil: 'domcontentloaded', timeout: 60000 });
  await new Promise(resolve => setTimeout(resolve, 5000));

  const fileInput = await page.$('input[type="file"]');
  if (fileInput) {
    logCallback('Uploading file to ChatGPT...\n', 'info');
    await fileInput.uploadFile(path.join(CONFIG.downloadPath, csvFile));

    // Wait longer for file to attach
    logCallback('Waiting for file to attach...\n', 'info');
    await new Promise(resolve => setTimeout(resolve, 8000)); // Increased from 3s to 8s

    // Send the message
    await page.keyboard.press('Enter');
    logCallback('File sent, waiting for ChatGPT response...\n', 'info');

    // Wait for ChatGPT to finish responding (look for stop generating button to disappear)
    let responseComplete = false;
    let attempts = 0;
    const maxWaitTime = 90; // 90 seconds max

    while (!responseComplete && attempts < maxWaitTime) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      attempts++;

      // Check if ChatGPT is still generating
      const isGenerating = await page.evaluate(() => {
        const stopButton = Array.from(document.querySelectorAll('button'))
          .find(btn => btn.textContent?.toLowerCase().includes('stop'));
        return !!stopButton;
      });

      if (!isGenerating && attempts > 45) { // Wait at least 45 seconds
        responseComplete = true;
        logCallback('✓ ChatGPT finished responding\n', 'success');
      } else if (attempts % 10 === 0) {
        logCallback(`Still waiting for response... (${attempts}s)\n`, 'info');
      }
    }

    if (!responseComplete) {
      logCallback('⚠️ Response may not be complete, continuing anyway...\n', 'warning');
    }

    // Extra wait to ensure everything is rendered
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Try to click copy button
    logCallback('Looking for copy button...\n', 'info');

    const copyClicked = await page.evaluate(() => {
      // Find all buttons
      const buttons = Array.from(document.querySelectorAll('button'));

      // Find all potential copy buttons (look for aria-label, title, or text)
      const copyButtons = buttons.filter(btn => {
        const ariaLabel = btn.getAttribute('aria-label')?.toLowerCase() || '';
        const title = btn.getAttribute('title')?.toLowerCase() || '';
        const text = btn.textContent?.toLowerCase() || '';

        // Check for copy-related attributes in multiple languages
        const copyKeywords = ['copy', 'copier', 'copiar', 'kopieren'];
        const hasAriaLabel = copyKeywords.some(keyword => ariaLabel.includes(keyword));
        const hasTitle = copyKeywords.some(keyword => title.includes(keyword));
        const hasText = copyKeywords.some(keyword => text.includes(keyword) && text.length < 20);

        return hasAriaLabel || hasTitle || hasText;
      });

      console.log('Found copy buttons:', copyButtons.length);

      // Get the last copy button (most recent message)
      const copyButton = copyButtons[copyButtons.length - 1];

      if (copyButton) {
        console.log('Clicking copy button:', copyButton.getAttribute('aria-label') || copyButton.getAttribute('title'));
        copyButton.click();
        return true;
      }

      return false;
    });

    if (copyClicked) {
      logCallback('✓ Clicked copy button\n', 'success');
    } else {
      logCallback('⚠️ Could not find copy button\n', 'warning');
    }

    await new Promise(resolve => setTimeout(resolve, 2000));

    // Try to read clipboard
    const copiedContent = await page.evaluate(async () => {
      try {
        const text = await navigator.clipboard.readText();
        console.log('Clipboard content length:', text?.length);
        return text;
      } catch (err) {
        console.error('Clipboard error:', err);
        return null;
      }
    });

    if (copiedContent && copiedContent.length > 50) {
      logCallback(`✓ Got ${copiedContent.length} characters from clipboard\n`, 'success');

      // Save raw content to file
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      const rawFileName = `chatgpt-raw-${searchKeyword.replace(/\s+/g, '-').substring(0, 30)}-${timestamp}.txt`;
      fs.writeFileSync(path.join(CONFIG.downloadPath, rawFileName), copiedContent, 'utf8');
      logCallback(`✓ Saved raw content to: ${rawFileName}\n`, 'success');

      // Parse the results
      const parsed = parseResults(copiedContent);

      logCallback(`Found ${parsed.titles.filter(t=>t).length} titles, ${parsed.descriptions.filter(d=>d).length} descriptions, ${parsed.overlays.filter(o=>o).length} overlays\n`, 'info');

      return {
        keyword: searchKeyword,
        ...parsed,
        rawContent: copiedContent
      };
    } else {
      logCallback('⚠️ No content copied from clipboard\n', 'warning');
      logCallback('Clipboard content: ' + (copiedContent || 'null') + '\n', 'warning');
    }
  } else {
    logCallback('⚠️ Could not find file upload button\n', 'warning');
  }

  return { keyword: searchKeyword, error: 'Could not get results from ChatGPT' };
}

function parseResults(content) {
  const titles = [];
  const descriptions = [];
  const overlays = [];

  const lines = content.split('\n');
  for (const line of lines) {
    const trimmedLine = line.trim();

    // Match **Title N:** format (more flexible)
    const titleMatch = trimmedLine.match(/^\*\*Title\s+(\d+):\*\*\s*(.+)/i);
    if (titleMatch) {
      const index = parseInt(titleMatch[1]) - 1;
      titles[index] = titleMatch[2].trim();
      console.log(`Found title ${index + 1}: ${titleMatch[2].trim()}`);
    }

    // Match **Description N:** format
    const descMatch = trimmedLine.match(/^\*\*Description\s+(\d+):\*\*\s*(.+)/i);
    if (descMatch) {
      const index = parseInt(descMatch[1]) - 1;
      descriptions[index] = descMatch[2].trim();
      console.log(`Found description ${index + 1}: ${descMatch[2].trim().substring(0, 50)}...`);
    }

    // Match **Text Overlay N:** format
    const overlayMatch = trimmedLine.match(/^\*\*Text\s+Overlay\s+(\d+):\*\*\s*(.+)/i);
    if (overlayMatch) {
      const index = parseInt(overlayMatch[1]) - 1;
      overlays[index] = overlayMatch[2].trim();
      console.log(`Found overlay ${index + 1}: ${overlayMatch[2].trim()}`);
    }
  }

  console.log(`Parse summary - Titles: ${titles.filter(t=>t).length}, Descriptions: ${descriptions.filter(d=>d).length}, Overlays: ${overlays.filter(o=>o).length}`);

  return { titles, descriptions, overlays };
}

module.exports = { runAutomationWithUI };
