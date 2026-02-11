// Buffer Account Extractor - Popup Script
// Handles the popup interface interactions

class BufferExtractorPopup {
  constructor() {
    this.extractBtn = document.getElementById('extractBtn');
    this.copyBtn = document.getElementById('copyBtn');
    this.accountInfo = document.getElementById('accountInfo');
    this.status = document.getElementById('status');
    
    this.accountData = {
      accountId: null,
      accessToken: null,
      profileId: null,
      userId: null,
      boardIds: [],
      bufferCookies: null,
      boardsWithNames: []
    };
    
    this.init();
  }

  init() {
    // Bind event listeners
    this.extractBtn.addEventListener('click', () => this.extractAccountInfo());
    this.copyBtn.addEventListener('click', () => this.copyToClipboard());
    
    // Check if we're on a Buffer page
    this.checkBufferPage();
    
    // Load any previously extracted data
    this.loadStoredData();
  }

  async checkBufferPage() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (!tab.url.includes('buffer.com')) {
        this.showStatus('Please navigate to buffer.com first', 'error');
        this.extractBtn.disabled = true;
        this.extractBtn.textContent = '❌ Not on Buffer.com';
        return false;
      }
      
      this.showStatus('Ready to extract Buffer account info', 'info');
      return true;
    } catch (error) {
      this.showStatus('Error checking current page', 'error');
      console.error('Error checking page:', error);
      return false;
    }
  }

  async loadStoredData() {
    try {
      const result = await chrome.storage.local.get(['bufferAccountInfo']);
      if (result.bufferAccountInfo) {
        this.accountData = result.bufferAccountInfo;
        this.displayAccountInfo();
      }
    } catch (error) {
      console.warn('Error loading stored data:', error);
    }
  }

  async extractAccountInfo() {
    this.extractBtn.disabled = true;
    this.extractBtn.textContent = '🔍 Extracting...';
    this.showStatus('Extracting account information...', 'info');

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      console.log('🔧 Current tab:', tab.url);
      
      // Method 1: Try to use existing content script
      try {
        console.log('🔧 Attempting to ping existing content script...');
        await chrome.tabs.sendMessage(tab.id, { action: 'ping' });
        console.log('🔧 Content script already loaded, sending extraction request...');
        
        const response = await chrome.tabs.sendMessage(tab.id, { 
          action: 'extractAccountInfo' 
        });
        
        if (response && response.success) {
          this.handleSuccessfulExtraction(response.data);
          return;
        }
      } catch (pingError) {
        console.log('🔧 Content script not responding:', pingError.message);
      }
      
      // Method 2: Inject content script manually
      try {
        console.log('🔧 Injecting content script manually...');
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content.js']
        });
        
        // Wait for script to load and initialize
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        console.log('🔧 Sending extraction request to injected script...');
        const response = await chrome.tabs.sendMessage(tab.id, { 
          action: 'extractAccountInfo' 
        });
        
        if (response && response.success) {
          this.handleSuccessfulExtraction(response.data);
          return;
        }
      } catch (injectionError) {
        console.log('🔧 Manual injection failed:', injectionError.message);
      }
      
      // Method 3: Direct extraction via executeScript
      console.log('🔧 Trying direct extraction via executeScript...');
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: this.directExtraction
      });
      
      if (results && results[0] && results[0].result) {
        this.handleSuccessfulExtraction(results[0].result);
        return;
      }
      
      throw new Error('All extraction methods failed');
      
    } catch (error) {
      console.error('🔧 Extraction error:', error);
      
      if (error.message.includes('Could not establish connection')) {
        this.showStatus('❌ Extension communication error. Please refresh the Buffer page and try again.', 'error');
      } else if (error.message.includes('Cannot access')) {
        this.showStatus('❌ Cannot access this page. Make sure you\'re on buffer.com and logged in.', 'error');
      } else {
        this.showStatus(`❌ Error: ${error.message}`, 'error');
      }
    } finally {
      this.extractBtn.disabled = false;
      this.extractBtn.textContent = '🔍 Extract Buffer Account Info';
    }
  }

  // Direct extraction function that runs in the page context
  directExtraction() {
    try {
      console.log('🔧 Running direct extraction in page context...');
      
      const accountInfo = {
        accountId: null,
        accessToken: null,
        profileId: null,
        userId: null,
        boardIds: []
      };
      
      // Quick extraction of basic IDs from localStorage
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          const value = localStorage.getItem(key);
          
          if (key === 'ajs_user_id' && value) {
            accountInfo.userId = value.replace(/['"]/g, '');
          }
        }
      } catch (e) {}
      
      // Extract profile ID from URL if available
      const url = window.location.href;
      const profileMatch = url.match(/\/channels\/([a-f0-9]{24})/);
      if (profileMatch) {
        accountInfo.profileId = profileMatch[1];
      }
      
      // Look for any 24-character hex IDs in the page
      const html = document.documentElement.outerHTML;
      const allIds = html.match(/[a-f0-9]{24}/g);
      if (allIds) {
        // Remove duplicates and filter
        const uniqueIds = [...new Set(allIds)];
        accountInfo.boardIds = uniqueIds.slice(0, 10); // Limit to first 10 unique IDs
      }
      
      console.log('🔧 Direct extraction result:', accountInfo);
      return accountInfo;
      
    } catch (error) {
      console.error('🔧 Direct extraction failed:', error);
      return null;
    }
  }

  handleSuccessfulExtraction(data) {
    this.accountData = data;
    
    // Store the data
    chrome.storage.local.set({ bufferAccountInfo: this.accountData });
    
    // Display the results
    this.displayAccountInfo();
    
    // Check if we found any useful data
    const foundData = (data.userId && data.userId !== 'Not found') || 
                     (data.profileId && data.profileId !== 'Not found') ||
                     (data.boardIds && data.boardIds.length > 0);
    
    if (foundData) {
      this.showStatus('✅ Account information extracted successfully!', 'success');
    } else {
      this.showStatus('⚠️ Limited data found. Try creating a Pinterest post to load board information.', 'error');
    }
  }

  displayAccountInfo() {
    // Update the display elements
    document.getElementById('accountId').textContent = this.accountData.accountId || 'Not found';
    document.getElementById('accessToken').textContent = this.accountData.accessToken || 'Not found';
    document.getElementById('profileId').textContent = this.accountData.profileId || 'Not found';
    document.getElementById('userId').textContent = this.accountData.userId || 'Not found';
    
    // Handle board IDs array (legacy support)
    const boardIdsElement = document.getElementById('boardIds');
    if (this.accountData.boardsWithNames && this.accountData.boardsWithNames.length > 0) {
      // Show boards with names: "Board Name (ID)"
      const boardDisplayList = this.accountData.boardsWithNames.map(board => 
        `${board.name} (${board.id})`
      );
      boardIdsElement.textContent = boardDisplayList.join(', ');
    } else if (this.accountData.boardIds && this.accountData.boardIds.length > 0) {
      // Fallback to old format
      boardIdsElement.textContent = this.accountData.boardIds.join(', ');
    } else {
      boardIdsElement.textContent = 'Not found';
    }
    
    // Handle Buffer cookies
    const bufferCookiesElement = document.getElementById('bufferCookies');
    if (this.accountData.bufferCookies && this.accountData.bufferCookies.trim() !== '') {
      // Show truncated cookies for display
      const cookiesPreview = this.accountData.bufferCookies.split('\n').length - 1; // Count actual cookie lines
      bufferCookiesElement.textContent = `${cookiesPreview} cookies extracted`;
    } else {
      bufferCookiesElement.textContent = 'Not found';
    }
    
    // Show the account info section
    this.accountInfo.classList.remove('hidden');
  }

  async copyToClipboard() {
    try {
      // Format the data for copying
      const formattedData = this.formatDataForCopy();
      
      // Copy to clipboard
      await navigator.clipboard.writeText(formattedData);
      
      // Show success feedback
      const originalText = this.copyBtn.textContent;
      this.copyBtn.textContent = '✅ Copied!';
      this.copyBtn.style.background = '#4CAF50';
      
      setTimeout(() => {
        this.copyBtn.textContent = originalText;
        this.copyBtn.style.background = '#2196F3';
      }, 2000);
      
      this.showStatus('Account info copied to clipboard!', 'success');
    } catch (error) {
      console.error('Copy error:', error);
      this.showStatus('Failed to copy to clipboard', 'error');
    }
  }

  formatDataForCopy() {
    const data = [];
    
    if (this.accountData.accountId && this.accountData.accountId !== 'Not found') {
      data.push(`Account ID: ${this.accountData.accountId}`);
    }
    
    if (this.accountData.accessToken && this.accountData.accessToken !== 'Not found') {
      data.push(`Access Token: ${this.accountData.accessToken}`);
    }
    
    if (this.accountData.profileId && this.accountData.profileId !== 'Not found') {
      data.push(`Profile ID: ${this.accountData.profileId}`);
    }
    
    if (this.accountData.userId && this.accountData.userId !== 'Not found') {
      data.push(`User ID: ${this.accountData.userId}`);
    }
    
    // Enhanced board information with names
    if (this.accountData.boardsWithNames && this.accountData.boardsWithNames.length > 0) {
      data.push(''); // Empty line for separation
      data.push('Pinterest Boards:');
      this.accountData.boardsWithNames.forEach(board => {
        data.push(`  - ${board.name}: ${board.id}`);
      });
    } else if (this.accountData.boardIds && this.accountData.boardIds.length > 0) {
      data.push(`Board IDs: ${this.accountData.boardIds.join(', ')}`);
    }
    
    // Buffer cookies (full format for copying)
    if (this.accountData.bufferCookies && this.accountData.bufferCookies.trim() !== '') {
      data.push(''); // Empty line for separation
      data.push('Buffer Cookies (Netscape format):');
      data.push('---');
      data.push(this.accountData.bufferCookies);
      data.push('---');
    }
    
    if (data.length === 0) {
      return 'No Buffer account information found.';
    }
    
    return `Buffer Account Information:\n\n${data.join('\n')}\n\n(Extracted by Buffer Account Extractor)`;
  }

  showStatus(message, type) {
    this.status.textContent = message;
    this.status.className = `status ${type}`;
    this.status.classList.remove('hidden');
    
    // Auto-hide info messages after 3 seconds
    if (type === 'info') {
      setTimeout(() => {
        this.status.classList.add('hidden');
      }, 3000);
    }
  }
}

// Initialize the popup when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new BufferExtractorPopup();
});

console.log('🔧 Buffer Account Extractor: Popup script loaded');