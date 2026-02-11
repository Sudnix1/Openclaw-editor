// Buffer Account Information Extractor
// This script runs on Buffer pages to extract account information

class BufferExtractor {
  constructor() {
    this.accountInfo = {
      accountId: null,
      accessToken: null,
      profileId: null,
      userId: null,
      boardIds: [], // Array to store all board IDs
      boardsWithNames: [], // Array to store boards with names: [{id, name}]
      bufferCookies: null, // Buffer cookies for API access
      apiKey: null
    };
    
    // Rate limiting and caching
    this.lastApiCall = 0;
    this.apiCooldown = 5000; // 5 seconds between API calls
    this.cachedBoards = null;
    this.cacheExpiry = 300000; // 5 minutes cache
    this.cacheTimestamp = 0;
  }

  // REVERSE ENGINEER: Find exactly where known IDs are stored
  reverseEngineerKnownIds() {
    console.log('🔧 REVERSE ENGINEERING: Scanning for known ID locations...');
    
    const knownIds = {
      userId: '688526e03accaa916f9dcc6b',
      profileId: '688526fb96f2ca7f1c0fc98d', 
      boardId: '688cbbf56cac34c8300f037e' // This is the ACTUAL working Pinterest board
    };
    
    console.log('🎯 LOOKING FOR WORKING BOARD ID:', knownIds.boardId);
    
    const foundLocations = {};
    
    // 1. Check localStorage
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        const value = localStorage.getItem(key);
        
        Object.entries(knownIds).forEach(([type, id]) => {
          if (value && value.includes(id)) {
            foundLocations[type] = foundLocations[type] || [];
            foundLocations[type].push(`localStorage.${key}`);
            console.log(`🎯 Found ${type} (${id}) in localStorage.${key}`);
            
            // Extract all similar IDs from this location
            this.extractSimilarIds(value, `localStorage.${key}`, type);
          }
        });
      }
    } catch (e) {}
    
    // 2. Check sessionStorage
    try {
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        const value = sessionStorage.getItem(key);
        
        Object.entries(knownIds).forEach(([type, id]) => {
          if (value && value.includes(id)) {
            foundLocations[type] = foundLocations[type] || [];
            foundLocations[type].push(`sessionStorage.${key}`);
            console.log(`🎯 Found ${type} (${id}) in sessionStorage.${key}`);
            
            this.extractSimilarIds(value, `sessionStorage.${key}`, type);
          }
        });
      }
    } catch (e) {}
    
    // 3. Check cookies
    try {
      const cookies = document.cookie.split(';');
      cookies.forEach(cookie => {
        const [name, value] = cookie.trim().split('=');
        if (value) {
          Object.entries(knownIds).forEach(([type, id]) => {
            if (value.includes(id)) {
              foundLocations[type] = foundLocations[type] || [];
              foundLocations[type].push(`cookie.${name}`);
              console.log(`🎯 Found ${type} (${id}) in cookie.${name}`);
              
              this.extractSimilarIds(value, `cookie.${name}`, type);
            }
          });
        }
      });
    } catch (e) {}
    
    // 4. Check page HTML
    try {
      const html = document.documentElement.outerHTML;
      Object.entries(knownIds).forEach(([type, id]) => {
        if (html.includes(id)) {
          foundLocations[type] = foundLocations[type] || [];
          foundLocations[type].push('pageHTML');
          console.log(`🎯 Found ${type} (${id}) in page HTML`);
          
          // Find the specific context where this ID appears
          this.findIdContext(id, type);
        }
      });
    } catch (e) {}
    
    // 5. Check window objects
    try {
      this.searchWindowForIds(knownIds, foundLocations);
    } catch (e) {}
    
    console.log('🔧 REVERSE ENGINEERING COMPLETE:', foundLocations);
    return foundLocations;
  }

  // Extract all similar IDs from the same location where we found a known ID
  extractSimilarIds(content, location, type) {
    try {
      // Find all 24-character hex strings in this content
      const allIds = content.match(/[a-f0-9]{24}/g);
      if (allIds) {
        console.log(`🔍 Found ${allIds.length} total IDs in ${location}:`, allIds);
        
        allIds.forEach(id => {
          if (type === 'boardId' || location.includes('board')) {
            if (!this.accountInfo.boardIds.includes(id)) {
              this.accountInfo.boardIds.push(id);
              console.log(`📌 Added board ID from ${location}: ${id}`);
            }
          } else if (type === 'userId' && !this.accountInfo.userId) {
            this.accountInfo.userId = id;
            console.log(`👤 Set user ID from ${location}: ${id}`);
          } else if (type === 'profileId' && !this.accountInfo.profileId) {
            this.accountInfo.profileId = id;
            console.log(`📱 Set profile ID from ${location}: ${id}`);
          }
        });
      }
    } catch (error) {
      console.warn('Error extracting similar IDs:', error);
    }
  }

  // Find the exact context where an ID appears in HTML
  findIdContext(id, type) {
    try {
      const html = document.documentElement.outerHTML;
      const idIndex = html.indexOf(id);
      
      if (idIndex !== -1) {
        // Get 200 characters before and after the ID
        const start = Math.max(0, idIndex - 200);
        const end = Math.min(html.length, idIndex + id.length + 200);
        const context = html.substring(start, end);
        
        console.log(`🎯 Context for ${type} (${id}):`);
        console.log(context);
        
        // Look for patterns around this ID
        this.analyzeIdContext(context, id, type);
      }
    } catch (error) {
      console.warn('Error finding ID context:', error);
    }
  }

  // Analyze the context around a found ID to understand the pattern
  analyzeIdContext(context, id, type) {
    try {
      // Look for common patterns
      const patterns = [
        /data-[\w-]+="[a-f0-9]{24}"/g,
        /id="[a-f0-9]{24}"/g,
        /value="[a-f0-9]{24}"/g,
        /"[a-f0-9]{24}"/g,
        /[a-f0-9]{24}/g
      ];
      
      patterns.forEach((pattern, index) => {
        const matches = context.match(pattern);
        if (matches) {
          console.log(`🔍 Pattern ${index} found ${matches.length} matches in ${type} context:`, matches);
          
          // Extract all IDs from these matches
          matches.forEach(match => {
            const foundIds = match.match(/[a-f0-9]{24}/g);
            if (foundIds) {
              foundIds.forEach(foundId => {
                if (foundId !== id) { // Don't re-add the same ID
                  if (type === 'boardId') {
                    if (!this.accountInfo.boardIds.includes(foundId)) {
                      this.accountInfo.boardIds.push(foundId);
                      console.log(`📌 Found additional board ID from context: ${foundId}`);
                    }
                  }
                }
              });
            }
          });
        }
      });
    } catch (error) {
      console.warn('Error analyzing ID context:', error);
    }
  }

  // Search window objects for known IDs
  searchWindowForIds(knownIds, foundLocations) {
    try {
      const searchWindow = (obj, path = 'window') => {
        if (!obj || typeof obj !== 'object' || path.split('.').length > 5) return;
        
        for (const [key, value] of Object.entries(obj)) {
          try {
            const currentPath = `${path}.${key}`;
            
            if (typeof value === 'string') {
              Object.entries(knownIds).forEach(([type, id]) => {
                if (value.includes(id)) {
                  foundLocations[type] = foundLocations[type] || [];
                  foundLocations[type].push(currentPath);
                  console.log(`🎯 Found ${type} (${id}) in ${currentPath}`);
                  
                  this.extractSimilarIds(value, currentPath, type);
                }
              });
            } else if (typeof value === 'object' && value !== null) {
              searchWindow(value, currentPath);
            }
          } catch (e) {
            // Skip properties that can't be accessed
          }
        }
      };
      
      searchWindow(window);
    } catch (error) {
      console.warn('Error searching window objects:', error);
    }
  }

  // Extract information from various sources
  async extractAccountInfo() {
    console.log('🔍 Buffer Extractor: Starting extraction...');
    console.log('🔍 Current URL:', window.location.href);
    console.log('🔍 Current domain:', window.location.hostname);
    
    // REVERSE ENGINEERING: Find where known IDs are located first
    this.reverseEngineerKnownIds();
    
    // Method 1: Try to find account info in localStorage
    this.extractFromLocalStorage();
    
    // Method 2: Try to find account info in sessionStorage
    this.extractFromSessionStorage();
    
    // Method 3: Try to extract from page scripts and network requests
    this.extractFromPageScripts();
    
    // Method 4: Try to extract from DOM elements
    this.extractFromDOM();
    
    // Method 5: Monitor network requests for API calls (disabled to reduce spam)
    // this.monitorNetworkRequests();
    
    // Method 6: Try to extract from window objects
    this.extractFromWindowObjects();
    
    // Check if we have enough basic info to skip heavy extraction
    const hasBasicInfo = this.accountInfo.userId && this.accountInfo.profileId;
    
    if (!hasBasicInfo) {
      // Method 7: Look for any 24-character hex strings anywhere on the page
      this.extractAnyHexIds();
      
      // Method 8: Try to extract from cookies
      this.extractFromCookies();
      
      // Method 9: Search specifically for board ID in DOM elements
      this.searchForBoardIdInDOM();
      
      // Method 10: Extract all boards dynamically
      this.extractAllBoards();
      
      // Method 11: Try to trigger Pinterest board discovery
      this.triggerBoardDiscovery();
    } else {
      console.log('✅ Basic info found, skipping heavy extraction methods');
    }
    
    // Method 12: Extract Buffer cookies for API access
    this.extractBufferCookies();
    
    // Method 13: PRIORITY - Direct API call to get correct Pinterest boards
    await this.fetchChannelMetadataDirectly();
    
    console.log('🔍 Buffer Extractor: Extraction complete', this.accountInfo);
    return this.accountInfo;
  }

  // Extract from localStorage
  extractFromLocalStorage() {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        const value = localStorage.getItem(key);
        
        if (key && value) {
          // Look for account-related keys
          if (key.includes('account') || key.includes('user') || key.includes('profile')) {
            try {
              const parsed = JSON.parse(value);
              this.parseAccountData(parsed, 'localStorage');
            } catch (e) {
              // Not JSON, check if it's a direct value
              this.checkDirectValue(key, value, 'localStorage');
            }
          }
          
          // Look for token-related keys
          if (key.includes('token') || key.includes('access') || key.includes('auth')) {
            this.checkDirectValue(key, value, 'localStorage');
          }
        }
      }
    } catch (error) {
      console.warn('Error extracting from localStorage:', error);
    }
  }

  // Extract from sessionStorage
  extractFromSessionStorage() {
    try {
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        const value = sessionStorage.getItem(key);
        
        if (key && value) {
          if (key.includes('account') || key.includes('user') || key.includes('profile') || key.includes('token')) {
            try {
              const parsed = JSON.parse(value);
              this.parseAccountData(parsed, 'sessionStorage');
            } catch (e) {
              this.checkDirectValue(key, value, 'sessionStorage');
            }
          }
        }
      }
    } catch (error) {
      console.warn('Error extracting from sessionStorage:', error);
    }
  }

  // Extract from page scripts - Enhanced for Buffer-specific patterns
  extractFromPageScripts() {
    try {
      const scripts = document.getElementsByTagName('script');
      for (let script of scripts) {
        if (script.innerHTML) {
          const content = script.innerHTML;
          
          // Buffer-specific patterns based on the Python script analysis
          const bufferPatterns = [
            // Look for Buffer initialization data
            /window\.Buffer\s*=\s*({[^}]+})/gi,
            /window\.App\s*=\s*({[^}]+})/gi,
            /window\.Config\s*=\s*({[^}]+})/gi,
            /__INITIAL_STATE__\s*=\s*({.+?});/gi,
            
            // Look for user and profile IDs (24-character hex strings like in Python script)
            /user_id[\"']*\s*[:\=]\s*[\"']([a-f0-9]{24})[\"']/gi,
            /userId[\"']*\s*[:\=]\s*[\"']([a-f0-9]{24})[\"']/gi,
            /profile_id[\"']*\s*[:\=]\s*[\"']([a-f0-9]{24})[\"']/gi,
            /profileId[\"']*\s*[:\=]\s*[\"']([a-f0-9]{24})[\"']/gi,
            /account_id[\"']*\s*[:\=]\s*[\"']([a-f0-9]{24})[\"']/gi,
            /accountId[\"']*\s*[:\=]\s*[\"']([a-f0-9]{24})[\"']/gi,
            
            // Look for access tokens and API keys
            /access_token[\"']*\s*[:\=]\s*[\"']([^\"']{20,})[\"']/gi,
            /accessToken[\"']*\s*[:\=]\s*[\"']([^\"']{20,})[\"']/gi,
            /api_key[\"']*\s*[:\=]\s*[\"']([^\"']{20,})[\"']/gi,
            /apiKey[\"']*\s*[:\=]\s*[\"']([^\"']{20,})[\"']/gi,
            /token[\"']*\s*[:\=]\s*[\"']([^\"']{20,})[\"']/gi,
            
            // Look for Buffer-specific identifiers
            /[\"']([a-f0-9]{24})[\"']/gi  // Any 24-char hex string (Buffer ID format)
          ];

          bufferPatterns.forEach((pattern, index) => {
            let match;
            while ((match = pattern.exec(content)) !== null) {
              if (match[1]) {
                // For initialization objects, parse them
                if (index < 4) {
                  try {
                    const parsed = JSON.parse(match[1]);
                    this.parseAccountData(parsed, 'Buffer initialization');
                  } catch (e) {
                    console.log('Could not parse Buffer init data:', match[1].substring(0, 100));
                  }
                } else {
                  // For direct ID matches, categorize them
                  this.categorizeBufferId(match[1], 'pageScript');
                }
              }
            }
            pattern.lastIndex = 0; // Reset regex
          });
        }
      }
    } catch (error) {
      console.warn('Error extracting from page scripts:', error);
    }
  }

  // Extract from DOM elements
  extractFromDOM() {
    try {
      // Look for data attributes
      const elements = document.querySelectorAll('[data-account-id], [data-user-id], [data-profile-id], [data-access-token]');
      elements.forEach(el => {
        if (el.dataset.accountId) this.accountInfo.accountId = el.dataset.accountId;
        if (el.dataset.userId) this.accountInfo.userId = el.dataset.userId;
        if (el.dataset.profileId) this.accountInfo.profileId = el.dataset.profileId;
        if (el.dataset.accessToken) this.accountInfo.accessToken = el.dataset.accessToken;
      });

      // Look for meta tags
      const metaTags = document.querySelectorAll('meta[name*="account"], meta[name*="user"], meta[name*="profile"], meta[name*="token"]');
      metaTags.forEach(meta => {
        const name = meta.getAttribute('name');
        const content = meta.getAttribute('content');
        if (name && content) {
          this.checkDirectValue(name, content, 'metaTag');
        }
      });
    } catch (error) {
      console.warn('Error extracting from DOM:', error);
    }
  }

  // Monitor network requests - Enhanced for Board ID detection
  monitorNetworkRequests() {
    const self = this;
    
    // Override fetch to capture API requests
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      const response = await originalFetch(...args);
      
      // Check request URL for account info
      if (args[0] && typeof args[0] === 'string') {
        console.log('🌐 Fetch request:', args[0]);
        self.parseURLForInfo(args[0]);
        
        // Look for board-related API calls
        if (args[0].includes('pinterest') || args[0].includes('board') || args[0].includes('channel')) {
          console.log('🎯 Pinterest/Board related request:', args[0]);
          
          // Try to read response for board data
          try {
            const responseClone = response.clone();
            const responseText = await responseClone.text();
            console.log('📄 Response preview:', responseText.substring(0, 200));
            
            // Look for our specific board ID in the response
            if (responseText.includes('688cbbf56cac34c8300f037e')) {
              self.accountInfo.boardId = '688cbbf56cac34c8300f037e';
              console.log('🎯 Found board ID in API response!');
            }
            
            // Look for any board IDs in response
            const boardIds = responseText.match(/[a-f0-9]{24}/g);
            if (boardIds) {
              console.log('🔍 Found IDs in response:', boardIds);
              boardIds.forEach(id => {
                if (id === '688cbbf56cac34c8300f037e') {
                  self.accountInfo.boardId = id;
                  console.log('🎯 Found known board ID in response:', id);
                }
              });
            }
          } catch (e) {
            console.log('Could not read response:', e.message);
          }
        }
      }
      
      // Check request headers
      if (args[1] && args[1].headers) {
        self.parseHeadersForInfo(args[1].headers);
      }
      
      return response;
    };

    // Override XMLHttpRequest
    const originalOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(method, url, async, user, password) {
      this.addEventListener('load', function() {
        if (url) {
          console.log('🌐 XHR request:', url);
          // Extract info from URL
          self.parseURLForInfo(url);
          
          if (url.includes('pinterest') || url.includes('board') || url.includes('channel')) {
            console.log('🎯 Pinterest/Board XHR:', url);
            try {
              const responseText = this.responseText;
              if (responseText && responseText.includes('688cbbf56cac34c8300f037e')) {
                self.accountInfo.boardId = '688cbbf56cac34c8300f037e';
                console.log('🎯 Found board ID in XHR response!');
              }
            } catch (e) {
              console.log('Could not read XHR response:', e.message);
            }
          }
        }
      });
      return originalOpen.apply(this, arguments);
    };
    
    console.log('🌐 Network monitoring active - watching for board ID...');
  }

  // Parse account data from objects
  parseAccountData(data, source) {
    if (typeof data === 'object' && data !== null) {
      // Recursively search for account information
      for (const [key, value] of Object.entries(data)) {
        const lowerKey = key.toLowerCase();
        
        if (lowerKey.includes('accountid') || lowerKey === 'account_id') {
          this.accountInfo.accountId = value;
          console.log(`Found accountId in ${source}:`, value);
        } else if (lowerKey.includes('accesstoken') || lowerKey === 'access_token') {
          this.accountInfo.accessToken = value;
          console.log(`Found accessToken in ${source}:`, value);
        } else if (lowerKey.includes('profileid') || lowerKey === 'profile_id') {
          this.accountInfo.profileId = value;
          console.log(`Found profileId in ${source}:`, value);
        } else if (lowerKey.includes('userid') || lowerKey === 'user_id') {
          this.accountInfo.userId = value;
          console.log(`Found userId in ${source}:`, value);
        } else if (lowerKey.includes('apikey') || lowerKey === 'api_key') {
          this.accountInfo.apiKey = value;
          console.log(`Found apiKey in ${source}:`, value);
        } else if (typeof value === 'object') {
          // Recursively search nested objects
          this.parseAccountData(value, source);
        }
      }
    }
  }

  // Check direct string values
  checkDirectValue(key, value, source) {
    const lowerKey = key.toLowerCase();
    
    if (lowerKey.includes('accountid') || lowerKey.includes('account_id')) {
      this.accountInfo.accountId = value;
      console.log(`Found accountId in ${source}:`, value);
    } else if (lowerKey.includes('accesstoken') || lowerKey.includes('access_token')) {
      this.accountInfo.accessToken = value;
      console.log(`Found accessToken in ${source}:`, value);
    } else if (lowerKey.includes('profileid') || lowerKey.includes('profile_id')) {
      this.accountInfo.profileId = value;
      console.log(`Found profileId in ${source}:`, value);
    } else if (lowerKey.includes('userid') || lowerKey.includes('user_id')) {
      this.accountInfo.userId = value;
      console.log(`Found userId in ${source}:`, value);
    }
  }

  // Assign values based on regex patterns
  assignValue(pattern, value, source) {
    if (pattern.includes('accountId') || pattern.includes('account_id')) {
      this.accountInfo.accountId = value;
      console.log(`Found accountId in ${source}:`, value);
    } else if (pattern.includes('accessToken') || pattern.includes('access_token')) {
      this.accountInfo.accessToken = value;
      console.log(`Found accessToken in ${source}:`, value);
    } else if (pattern.includes('profileId') || pattern.includes('profile_id')) {
      this.accountInfo.profileId = value;
      console.log(`Found profileId in ${source}:`, value);
    } else if (pattern.includes('userId') || pattern.includes('user_id')) {
      this.accountInfo.userId = value;
      console.log(`Found userId in ${source}:`, value);
    }
  }

  // Parse URL for account information
  parseURLForInfo(url) {
    try {
      const urlObj = new URL(url);
      
      // Check URL path for IDs
      const pathParts = urlObj.pathname.split('/');
      pathParts.forEach((part, index) => {
        if (part.match(/^[a-f0-9]{24}$/i) || part.match(/^\d+$/)) {
          // Looks like an ID
          if (pathParts[index - 1]) {
            const context = pathParts[index - 1].toLowerCase();
            if (context.includes('account')) this.accountInfo.accountId = part;
            if (context.includes('profile')) this.accountInfo.profileId = part;
            if (context.includes('user')) this.accountInfo.userId = part;
          }
        }
      });
      
      // Check URL parameters
      const params = urlObj.searchParams;
      for (const [key, value] of params) {
        this.checkDirectValue(key, value, 'URL parameter');
      }
    } catch (error) {
      console.warn('Error parsing URL:', error);
    }
  }

  // Parse headers for auth tokens
  parseHeadersForInfo(headers) {
    for (const [key, value] of Object.entries(headers)) {
      const lowerKey = key.toLowerCase();
      if (lowerKey.includes('authorization') || lowerKey.includes('token')) {
        this.accountInfo.accessToken = value;
        console.log('Found accessToken in headers:', value);
      }
    }
  }

  // Categorize Buffer IDs dynamically (no hardcoded values)
  categorizeBufferId(id, source) {
    // Store any board IDs we find
    if (source.includes('board') || source.includes('pinterest')) {
      if (!this.accountInfo.boardIds.includes(id)) {
        this.accountInfo.boardIds.push(id);
        console.log(`Found board ID in ${source}:`, id);
      }
    } else {
      // Try to categorize based on context or assign as account ID if none set
      if (!this.accountInfo.accountId) {
        this.accountInfo.accountId = id;
        console.log(`Found potential accountId in ${source}:`, id);
      } else if (!this.accountInfo.userId) {
        this.accountInfo.userId = id;
        console.log(`Found potential userId in ${source}:`, id);
      } else if (!this.accountInfo.profileId) {
        this.accountInfo.profileId = id;
        console.log(`Found potential profileId in ${source}:`, id);
      }
    }
  }

  // Search specifically for board ID in DOM elements and page structure
  searchForBoardIdInDOM() {
    try {
      console.log('🔍 Searching specifically for Board ID in DOM...');
      
      // Method 1: Look for all elements with IDs that might be board IDs
      const allElements = document.querySelectorAll('*[id]');
      allElements.forEach(element => {
        const id = element.id;
        if (id && id.match(/^[a-f0-9]{24}$/)) {
          // Check if this element or its content suggests it's a board
          const elementText = element.textContent?.toLowerCase() || '';
          const elementHTML = element.outerHTML.toLowerCase();
          
          if (elementHTML.includes('pinterest') || elementHTML.includes('board') || 
              elementHTML.includes('channel') || elementText.includes('pinterest') ||
              element.closest('[data-channel]') || element.closest('.channel')) {
            
            if (!this.accountInfo.boardIds.includes(id)) {
              this.accountInfo.boardIds.push(id);
              console.log(`📌 Found board ID as element ID: ${id} (${elementText.substring(0, 50)})`);
            }
          }
        }
      });
      
      // Method 2: Look for elements with data attributes containing board IDs
      const dataElements = document.querySelectorAll('*[data-channel-id], *[data-board-id], *[data-pinterest-id]');
      dataElements.forEach(element => {
        ['data-channel-id', 'data-board-id', 'data-pinterest-id'].forEach(attr => {
          const value = element.getAttribute(attr);
          if (value && value.match(/^[a-f0-9]{24}$/)) {
            if (!this.accountInfo.boardIds.includes(value)) {
              this.accountInfo.boardIds.push(value);
              console.log(`📌 Found board ID in ${attr}: ${value}`);
            }
          }
        });
      });
      
      // Method 3: Look for channel/board containers specifically
      const channelContainers = document.querySelectorAll('.channel, .board, [class*="channel"], [class*="board"], [id*="channel"], [id*="board"]');
      channelContainers.forEach(container => {
        // Check all attributes for board IDs
        for (const attr of container.attributes) {
          if (attr.value.match(/^[a-f0-9]{24}$/)) {
            if (!this.accountInfo.boardIds.includes(attr.value)) {
              this.accountInfo.boardIds.push(attr.value);
              console.log(`📌 Found board ID in channel container ${attr.name}: ${attr.value}`);
            }
          }
        }
        
        // Check for board IDs in the container's HTML
        const containerHTML = container.innerHTML;
        const foundIds = containerHTML.match(/[a-f0-9]{24}/g);
        if (foundIds) {
          foundIds.forEach(id => {
            if (!this.accountInfo.boardIds.includes(id)) {
              this.accountInfo.boardIds.push(id);
              console.log(`📌 Found board ID in channel container HTML: ${id}`);
            }
          });
        }
      });
      
      // Method 4: Look for specific Buffer UI elements that contain Pinterest channel info
      const bufferSelectors = [
        '.publish_channelItem_cklpP',
        '.channel-item',
        '.pinterest-channel',
        '[data-sidebar="item"]',
        '.sidebar-item'
      ];
      
      bufferSelectors.forEach(selector => {
        const elements = document.querySelectorAll(selector);
        elements.forEach(element => {
          console.log(`🔍 Checking Buffer element: ${selector}`, element);
          
          // Check for board IDs in this specific Buffer element
          for (const attr of element.attributes) {
            if (attr.value.match(/^[a-f0-9]{24}$/)) {
              if (!this.accountInfo.boardIds.includes(attr.value)) {
                this.accountInfo.boardIds.push(attr.value);
                console.log(`📌 Found board ID in Buffer UI ${attr.name}: ${attr.value}`);
              }
            }
          }
          
          // Check for Pinterest text indicators
          const elementText = element.textContent?.toLowerCase() || '';
          const elementHTML = element.outerHTML.toLowerCase();
          
          if (elementText.includes('pinterest') || elementHTML.includes('pinterest')) {
            console.log(`🎯 Found Pinterest element:`, element);
            
            // Extract any IDs from this Pinterest element
            const pinterestIds = element.outerHTML.match(/[a-f0-9]{24}/g);
            if (pinterestIds) {
              pinterestIds.forEach(id => {
                if (!this.accountInfo.boardIds.includes(id)) {
                  this.accountInfo.boardIds.push(id);
                  console.log(`📌 Found board ID in Pinterest element: ${id}`);
                }
              });
            }
          }
        });
      });
      
      // Method 5: Based on your console output, look for the specific pattern that contains profileId
      const profileElements = document.querySelectorAll(`[id="${this.accountInfo.profileId}"]`);
      profileElements.forEach(element => {
        console.log(`🎯 Found element with profileId:`, element);
        
        // Look for sibling elements or parent elements that might contain board info
        const parent = element.parentElement;
        if (parent) {
          const siblingElements = parent.children;
          Array.from(siblingElements).forEach(sibling => {
            const siblingIds = sibling.outerHTML.match(/[a-f0-9]{24}/g);
            if (siblingIds) {
              siblingIds.forEach(id => {
                if (id !== this.accountInfo.profileId && !this.accountInfo.boardIds.includes(id)) {
                  this.accountInfo.boardIds.push(id);
                  console.log(`📌 Found board ID near profileId element: ${id}`);
                }
              });
            }
          });
        }
      });
      
    } catch (error) {
      console.warn('Error searching for board ID in DOM:', error);
    }
  }

  // Extract from window objects
  extractFromWindowObjects() {
    try {
      console.log('🔍 Checking window objects...');
      
      // Check common window properties
      const windowProps = ['Buffer', 'App', 'Config', 'User', 'Profile', 'Account', '__INITIAL_STATE__'];
      
      windowProps.forEach(prop => {
        if (window[prop]) {
          console.log(`🔍 Found window.${prop}:`, window[prop]);
          if (typeof window[prop] === 'object') {
            this.parseAccountData(window[prop], `window.${prop}`);
          }
        }
      });
      
      // Check for React or Angular state
      if (window.__REACT_DEVTOOLS_GLOBAL_HOOK__) {
        console.log('🔍 Found React DevTools - checking for state...');
      }
      
      // Check for any global variables containing IDs
      for (const key in window) {
        if (typeof window[key] === 'string' && key.toLowerCase().includes('id')) {
          const value = window[key];
          if (value && value.match(/^[a-f0-9]{24}$/)) {
            console.log(`🔍 Found potential ID in window.${key}:`, value);
            this.categorizeBufferId(value, `window.${key}`);
          }
        }
      }
    } catch (error) {
      console.warn('Error extracting from window objects:', error);
    }
  }

  // Look for any 24-character hex strings anywhere on the page
  extractAnyHexIds() {
    try {
      console.log('🔍 Scanning entire page for hex IDs...');
      
      // Get all text content from the page
      const pageText = document.body.innerText || document.body.textContent || '';
      const htmlContent = document.documentElement.outerHTML;
      
      // Look for 24-character hex strings
      const hexPattern = /[a-f0-9]{24}/gi;
      
      // Check page text
      let matches = pageText.match(hexPattern);
      if (matches) {
        console.log(`🔍 Found ${matches.length} hex IDs in page text:`, matches);
        matches.forEach(id => this.categorizeBufferId(id, 'pageText'));
      }
      
      // Check HTML content
      matches = htmlContent.match(hexPattern);
      if (matches) {
        console.log(`🔍 Found ${matches.length} hex IDs in HTML:`, matches.slice(0, 10)); // Show first 10
        matches.slice(0, 20).forEach(id => this.categorizeBufferId(id, 'HTML')); // Process first 20
      }
    } catch (error) {
      console.warn('Error extracting hex IDs:', error);
    }
  }

  // Extract from cookies
  extractFromCookies() {
    try {
      console.log('🔍 Checking cookies...');
      
      const cookies = document.cookie.split(';');
      cookies.forEach(cookie => {
        const [name, value] = cookie.trim().split('=');
        if (name && value) {
          // Look for account-related cookies
          if (name.toLowerCase().includes('user') || 
              name.toLowerCase().includes('account') || 
              name.toLowerCase().includes('profile') ||
              name.toLowerCase().includes('token')) {
            console.log(`🔍 Found relevant cookie ${name}:`, value.substring(0, 50));
            
            // Check if cookie value is a hex ID
            if (value.match(/^[a-f0-9]{24}$/)) {
              this.categorizeBufferId(value, `cookie.${name}`);
            }
            
            // Try to decode if it's base64 or URL encoded
            try {
              const decoded = decodeURIComponent(value);
              if (decoded !== value) {
                console.log(`🔍 Decoded cookie ${name}:`, decoded.substring(0, 100));
                this.parseAccountData({ [name]: decoded }, `decodedCookie.${name}`);
              }
            } catch (e) {
              // Not URL encoded
            }
          }
        }
      });
    } catch (error) {
      console.warn('Error extracting from cookies:', error);
    }
  }

  // Extract all boards dynamically for any account
  extractAllBoards() {
    try {
      console.log('🔍 Extracting all boards dynamically...');
      
      // Method 1: Check current URL for board/channel ID patterns
      this.extractBoardFromURL();
      
      // Method 2: Look for board selection dropdowns or lists
      const boardSelectors = [
        'select[name*="board"]',
        'select[id*="board"]',
        'select[name*="pinterest"]',
        'select[id*="pinterest"]',
        '[data-testid*="board"]',
        '[data-testid*="pinterest"]',
        '.board-selector',
        '.board-list',
        '.pinterest-board',
        '.channel-selector',
        '.pinterest-channel'
      ];
      
      boardSelectors.forEach(selector => {
        const elements = document.querySelectorAll(selector);
        elements.forEach(element => {
          console.log(`🔍 Checking element: ${selector}`, element);
          
          // Check for board IDs in options or data attributes
          if (element.tagName === 'SELECT') {
            Array.from(element.options).forEach(option => {
              const value = option.value;
              const text = option.text || option.textContent;
              console.log(`🔍 Option found: ${value} - ${text}`);
              
              if (value && value.match(/^[a-f0-9]{24}$/)) {
                if (!this.accountInfo.boardIds.includes(value)) {
                  this.accountInfo.boardIds.push(value);
                  console.log(`📌 Found board ID in dropdown: ${value} (${text})`);
                }
              }
            });
          }
          
          // Check data attributes
          for (const attr of element.attributes) {
            if ((attr.name.includes('board') || attr.name.includes('pinterest') || attr.name.includes('channel')) && 
                attr.value.match(/^[a-f0-9]{24}$/)) {
              if (!this.accountInfo.boardIds.includes(attr.value)) {
                this.accountInfo.boardIds.push(attr.value);
                console.log(`📌 Found board ID in ${attr.name}: ${attr.value}`);
              }
            }
          }
        });
      });
      
      // Method 3: Look for any links or buttons with Pinterest/board IDs
      this.extractBoardsFromLinks();
      
      // Method 4: Look for board data in JavaScript variables
      this.extractBoardsFromScripts();
      
      // Method 5: Look for board APIs in network requests
      this.monitorBoardAPIs();
      
      // Method 6: Look for boards in localStorage/sessionStorage with context
      this.extractBoardsFromStorage();
      
      console.log(`🎯 Total boards found: ${this.accountInfo.boardIds.length}`, this.accountInfo.boardIds);
      
    } catch (error) {
      console.warn('Error extracting all boards:', error);
    }
  }

  // Extract board ID from current URL
  extractBoardFromURL() {
    try {
      const url = window.location.href;
      console.log('🔍 Extracting board from URL:', url);
      
      // Look for board/channel ID patterns in URL
      const urlPatterns = [
        /\/channels\/([a-f0-9]{24})/i,
        /\/board\/([a-f0-9]{24})/i,
        /\/pinterest\/([a-f0-9]{24})/i,
        /boardId=([a-f0-9]{24})/i,
        /channelId=([a-f0-9]{24})/i
      ];
      
      urlPatterns.forEach(pattern => {
        const match = url.match(pattern);
        if (match && match[1]) {
          if (!this.accountInfo.boardIds.includes(match[1])) {
            this.accountInfo.boardIds.push(match[1]);
            console.log(`📌 Found board ID in URL: ${match[1]}`);
          }
        }
      });
    } catch (error) {
      console.warn('Error extracting board from URL:', error);
    }
  }

  // Look for board IDs in links and buttons
  extractBoardsFromLinks() {
    try {
      console.log('🔍 Extracting boards from links...');
      
      // Look for links that might contain board IDs
      const links = document.querySelectorAll('a[href*="board"], a[href*="pinterest"], a[href*="channel"]');
      links.forEach(link => {
        const href = link.href;
        const boardIds = href.match(/[a-f0-9]{24}/g);
        if (boardIds) {
          boardIds.forEach(id => {
            if (!this.accountInfo.boardIds.includes(id)) {
              this.accountInfo.boardIds.push(id);
              console.log(`📌 Found board ID in link: ${id} (${link.textContent?.trim()})`);
            }
          });
        }
      });
      
      // Look for buttons with board-related data attributes
      const buttons = document.querySelectorAll('button[data-board], button[data-pinterest], button[data-channel]');
      buttons.forEach(button => {
        for (const attr of button.attributes) {
          if (attr.value.match(/^[a-f0-9]{24}$/)) {
            if (!this.accountInfo.boardIds.includes(attr.value)) {
              this.accountInfo.boardIds.push(attr.value);
              console.log(`📌 Found board ID in button ${attr.name}: ${attr.value}`);
            }
          }
        }
      });
    } catch (error) {
      console.warn('Error extracting boards from links:', error);
    }
  }

  // Extract boards from storage with more context
  extractBoardsFromStorage() {
    try {
      console.log('🔍 Extracting boards from storage with context...');
      
      // Check localStorage for board-related keys
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        const value = localStorage.getItem(key);
        
        if (key && value && (key.includes('board') || key.includes('pinterest') || key.includes('channel'))) {
          console.log(`🔍 Found board-related localStorage key: ${key}`);
          
          // Extract board IDs from this value
          const boardIds = value.match(/[a-f0-9]{24}/g);
          if (boardIds) {
            boardIds.forEach(id => {
              if (!this.accountInfo.boardIds.includes(id)) {
                this.accountInfo.boardIds.push(id);
                console.log(`📌 Found board ID in localStorage.${key}: ${id}`);
              }
            });
          }
        }
      }
      
      // Check sessionStorage for board-related keys
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        const value = sessionStorage.getItem(key);
        
        if (key && value && (key.includes('board') || key.includes('pinterest') || key.includes('channel'))) {
          console.log(`🔍 Found board-related sessionStorage key: ${key}`);
          
          // Extract board IDs from this value
          const boardIds = value.match(/[a-f0-9]{24}/g);
          if (boardIds) {
            boardIds.forEach(id => {
              if (!this.accountInfo.boardIds.includes(id)) {
                this.accountInfo.boardIds.push(id);
                console.log(`📌 Found board ID in sessionStorage.${key}: ${id}`);
              }
            });
          }
        }
      }
    } catch (error) {
      console.warn('Error extracting boards from storage:', error);
    }
  }

  // Extract boards from JavaScript variables and API responses
  extractBoardsFromScripts() {
    try {
      console.log('🔍 Extracting boards from scripts...');
      const scripts = document.getElementsByTagName('script');
      
      for (let script of scripts) {
        if (script.innerHTML) {
          const content = script.innerHTML;
          
          // Look for board arrays or objects with enhanced patterns
          const boardPatterns = [
            // Generic board patterns
            /boards?\s*[:\=]\s*\[([^\]]+)\]/gi,
            /pinterest[_-]?boards?\s*[:\=]\s*\[([^\]]+)\]/gi,
            /"boards?":\s*\[([^\]]+)\]/gi,
            /"board":\s*"([a-f0-9]{24})"/gi,
            
            // Channel patterns (Buffer uses channels for Pinterest boards)
            /channels?\s*[:\=]\s*\[([^\]]+)\]/gi,
            /"channels?":\s*\[([^\]]+)\]/gi,
            /"channel":\s*"([a-f0-9]{24})"/gi,
            /"channelId":\s*"([a-f0-9]{24})"/gi,
            
            // ID patterns in objects
            /"id"\s*:\s*"([a-f0-9]{24})"/gi,
            /"_id"\s*:\s*"([a-f0-9]{24})"/gi,
            
            // Pinterest-specific patterns
            /pinterest[_-]?channel[_-]?id[\"']*\s*[:\=]\s*[\"']([a-f0-9]{24})[\"']/gi,
            /board[_-]?id[\"']*\s*[:\=]\s*[\"']([a-f0-9]{24})[\"']/gi,
            
            // Buffer-specific patterns
            /profile[_-]?channels[\"']*\s*[:\=]/gi,
            /"service":\s*"pinterest"/gi
          ];
          
          boardPatterns.forEach((pattern, index) => {
            let match;
            while ((match = pattern.exec(content)) !== null) {
              if (match[1]) {
                console.log(`🔍 Pattern ${index} matched:`, match[1].substring(0, 100));
                
                // For direct ID patterns (single capture groups)
                if (match[1].match(/^[a-f0-9]{24}$/)) {
                  if (!this.accountInfo.boardIds.includes(match[1])) {
                    this.accountInfo.boardIds.push(match[1]);
                    console.log(`📌 Found board ID in script (pattern ${index}): ${match[1]}`);
                  }
                } else {
                  // For array patterns (multiple IDs in captured content)
                  const boardIds = match[1].match(/[a-f0-9]{24}/g);
                  if (boardIds) {
                    boardIds.forEach(id => {
                      if (!this.accountInfo.boardIds.includes(id)) {
                        this.accountInfo.boardIds.push(id);
                        console.log(`📌 Found board ID in script array (pattern ${index}): ${id}`);
                      }
                    });
                  }
                }
              }
            }
            pattern.lastIndex = 0;
          });
          
          // Special handling for Pinterest service blocks
          if (content.includes('"service":"pinterest"') || content.includes("'service':'pinterest'")) {
            console.log('🎯 Found Pinterest service block, analyzing...');
            
            // Look for IDs near Pinterest service definitions
            const pinterestBlocks = content.split(/service.*pinterest/i);
            pinterestBlocks.forEach((block, index) => {
              if (index > 0) { // Skip first split (before first Pinterest reference)
                const ids = block.substring(0, 500).match(/[a-f0-9]{24}/g); // Look in next 500 chars
                if (ids) {
                  ids.forEach(id => {
                    if (!this.accountInfo.boardIds.includes(id)) {
                      this.accountInfo.boardIds.push(id);
                      console.log(`📌 Found board ID near Pinterest service: ${id}`);
                    }
                  });
                }
              }
            });
          }
        }
      }
    } catch (error) {
      console.warn('Error extracting boards from scripts:', error);
    }
  }

  // Monitor API calls for board data
  monitorBoardAPIs() {
    const self = this;
    
    // Enhanced network monitoring specifically for Buffer channel metadata
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      const response = await originalFetch(...args);
      
      if (args[0] && typeof args[0] === 'string') {
        const url = args[0];
        
        // Monitor ALL API calls and check for our target board ID
        try {
          const responseClone = response.clone();
          const responseText = await responseClone.text();
          
          // Check if this response contains our target board ID
          if (responseText.includes('688cbbf56cac34c8300f037e')) {
            console.log('🎉🎉🎉 FOUND TARGET BOARD IN API CALL!');
            console.log('🔗 API URL:', url);
            console.log('📄 Response containing target board:', responseText.substring(0, 1000));
            
            // Add it to our list
            if (!self.accountInfo.boardIds.includes('688cbbf56cac34c8300f037e')) {
              self.accountInfo.boardIds.push('688cbbf56cac34c8300f037e');
              console.log('📌 SUCCESSFULLY CAPTURED TARGET BOARD!');
              alert('🎉 SUCCESS! Found your Pinterest board: 688cbbf56cac34c8300f037e');
            }
          }
          
        } catch (e) {
          // Couldn't read response, continue
        }
        
        // Look for Buffer channel info API calls
        if (url.includes('buffer.com') && (url.includes('GetChannelInfo') || url.includes('channel'))) {
          console.log('🎯 Buffer Channel API call detected:', url);
          
          try {
            const responseClone = response.clone();
            const responseText = await responseClone.text();
            
            try {
              const jsonResponse = JSON.parse(responseText);
              
              // Extract boards from the specific metadata structure we discovered
              if (jsonResponse.data && jsonResponse.data.channel && jsonResponse.data.channel.metadata && jsonResponse.data.channel.metadata.boards) {
                const boards = jsonResponse.data.channel.metadata.boards;
                console.log('📋 Found boards in channel metadata:', boards);
                
                boards.forEach((board, index) => {
                  if (board.id && board.id.match(/^[a-f0-9]{24}$/)) {
                    if (!self.accountInfo.boardIds.includes(board.id)) {
                      self.accountInfo.boardIds.push(board.id);
                      console.log(`📌 Added board from metadata[${index}]: ${board.id} (${board.name || 'Unknown'})`);
                      
                      // Special log for target board
                      if (board.id === '688cbbf56cac34c8300f037e') {
                        console.log('🎉 SUCCESS! Found target board in metadata:', board);
                        alert('🎉 SUCCESS! Found your Pinterest board in metadata!');
                      }
                    }
                  }
                });
              }
              
              // Also extract from general API response structure
              self.extractBoardsFromAPIResponse(jsonResponse);
              
            } catch (e) {
              console.log('Could not parse JSON response');
            }
            
          } catch (e) {
            console.log('Could not read channel API response:', e.message);
          }
        }
        
        // Monitor ALL other API calls for Pinterest/board content
        else if (url.includes('pinterest') || url.includes('board') || url.includes('publish') || url.includes('compose')) {
          console.log('🎯 Potential Pinterest API call detected:', url);
          
          try {
            const responseClone = response.clone();
            const responseText = await responseClone.text();
            
            // Look for board IDs in API response
            const boardIds = responseText.match(/[a-f0-9]{24}/g);
            if (boardIds) {
              console.log('📋 Found board IDs in API response:', boardIds);
              boardIds.forEach(id => {
                if (!self.accountInfo.boardIds.includes(id)) {
                  self.accountInfo.boardIds.push(id);
                  console.log(`📌 Added board ID from API: ${id}`);
                  
                  // Check if this is our target
                  if (id === '688cbbf56cac34c8300f037e') {
                    console.log('🎉 SUCCESS! Found target board in Pinterest API!');
                    alert('🎉 SUCCESS! Found your Pinterest board in API response!');
                  }
                }
              });
            }
            
            // Look for board objects with names
            try {
              const jsonResponse = JSON.parse(responseText);
              self.extractBoardsFromAPIResponse(jsonResponse);
            } catch (e) {
              // Not valid JSON, continue
            }
            
          } catch (e) {
            console.log('Could not read Pinterest API response:', e.message);
          }
        }
      }
      
      return response;
    };
    
    console.log('🎯 SUPER Enhanced Board API monitoring active - watching ALL requests for target board...');
  }

  // Extract boards from structured API responses
  extractBoardsFromAPIResponse(data) {
    try {
      if (Array.isArray(data)) {
        data.forEach(item => this.extractBoardsFromAPIResponse(item));
      } else if (typeof data === 'object' && data !== null) {
        for (const [key, value] of Object.entries(data)) {
          if (key.toLowerCase().includes('board') && typeof value === 'string' && value.match(/^[a-f0-9]{24}$/)) {
            if (!this.accountInfo.boardIds.includes(value)) {
              this.accountInfo.boardIds.push(value);
              console.log(`Found board ID in API object.${key}: ${value}`);
            }
          } else if (typeof value === 'object') {
            this.extractBoardsFromAPIResponse(value);
          }
        }
      }
    } catch (error) {
      console.warn('Error extracting boards from API response:', error);
    }
  }

  // Try to trigger discovery of Pinterest boards by simulating user interactions
  triggerBoardDiscovery() {
    try {
      console.log('🎯 TRIGGERING BOARD DISCOVERY for working board: 688cbbf56cac34c8300f037e');
      
      // Method 1: Look for "New Post" or "Create Post" buttons that might trigger board selection
      const postButtons = document.querySelectorAll('button, a');
      postButtons.forEach(button => {
        const text = button.textContent?.toLowerCase() || '';
        if (text.includes('new post') || text.includes('create') || text.includes('compose')) {
          console.log('🔍 Found potential post creation button:', button);
          
          // Don't actually click, but check if clicking would reveal board data
          button.addEventListener('click', () => {
            setTimeout(() => {
              console.log('🎯 Post button clicked, re-scanning for boards...');
              this.scanForNewBoards();
            }, 1000);
          });
        }
      });
      
      // Method 2: Look for Pinterest channel/board selection dropdowns
      const selectors = document.querySelectorAll('select, .dropdown, .board-selector');
      selectors.forEach(selector => {
        console.log('🔍 Checking selector for Pinterest boards:', selector);
        
        // Check if this selector has Pinterest-related options
        if (selector.tagName === 'SELECT') {
          Array.from(selector.options).forEach(option => {
            const text = option.textContent?.toLowerCase() || '';
            if (text.includes('pinterest') || text.includes('board')) {
              console.log('🎯 Found Pinterest option:', option.value, option.textContent);
              
              // Check if this option value is our target board
              if (option.value === '688cbbf56cac34c8300f037e') {
                console.log('🎉 FOUND TARGET BOARD in dropdown!', option);
                if (!this.accountInfo.boardIds.includes(option.value)) {
                  this.accountInfo.boardIds.push(option.value);
                  console.log('📌 Added target board ID from dropdown:', option.value);
                }
              }
            }
          });
        }
      });
      
      // Method 3: Navigate to compose/new post page if we're not already there
      if (!window.location.href.includes('compose') && !window.location.href.includes('create')) {
        console.log('🔍 Not on compose page, looking for navigation to compose...');
        
        // Look for compose/new post links
        const composeLinks = document.querySelectorAll('a[href*="compose"], a[href*="create"], button');
        composeLinks.forEach(link => {
          const text = link.textContent?.toLowerCase() || '';
          const href = link.href || '';
          
          if ((text.includes('new post') || text.includes('compose') || text.includes('create')) ||
              (href.includes('compose') || href.includes('create'))) {
            console.log('🔍 Found compose navigation link:', link);
            
            // Store the link for manual user action
            link.dataset.bufferExtractorCompose = 'true';
            link.style.border = '2px solid red';
            link.title = 'Buffer Extractor: Click here to discover Pinterest boards';
          }
        });
      }
      
      // Method 4: Monitor for dynamic loading of board data
      this.setupMutationObserver();
      
      // Method 5: Try to find board data in any forms on the page
      this.scanFormsForBoardData();
      
    } catch (error) {
      console.warn('Error triggering board discovery:', error);
    }
  }

  // Scan for new boards after page changes
  scanForNewBoards() {
    console.log('🔍 Re-scanning for new boards after page interaction...');
    
    // Re-run board extraction methods
    this.extractBoardFromURL();
    this.extractBoardsFromStorage();
    this.searchForBoardIdInDOM();
    
    console.log(`🎯 Updated board list: ${this.accountInfo.boardIds.length} boards found:`, this.accountInfo.boardIds);
    
    // Check if we found our target
    if (this.accountInfo.boardIds.includes('688cbbf56cac34c8300f037e')) {
      console.log('🎉 SUCCESS! Found target board ID: 688cbbf56cac34c8300f037e');
    }
  }

  // Setup mutation observer to watch for dynamic content changes
  setupMutationObserver() {
    const observer = new MutationObserver((mutations) => {
      let shouldRescan = false;
      
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            // Check if new elements contain board information
            const element = node;
            const html = element.outerHTML || '';
            
            if (html.includes('688cbbf56cac34c8300f037e')) {
              console.log('🎯 TARGET BOARD ID appeared in new DOM element!', element);
              if (!this.accountInfo.boardIds.includes('688cbbf56cac34c8300f037e')) {
                this.accountInfo.boardIds.push('688cbbf56cac34c8300f037e');
                console.log('📌 Added target board ID from new DOM element');
                
                // Notify the user!
                console.log('🎉🎉🎉 SUCCESS! FOUND YOUR TARGET BOARD: 688cbbf56cac34c8300f037e');
                alert('✅ Target Pinterest board found! Board ID: 688cbbf56cac34c8300f037e');
              }
              shouldRescan = true;
            }
            
            // Check for Pinterest-related elements
            if (html.includes('pinterest') || html.includes('board') || 
                element.querySelector && element.querySelector('select, .dropdown')) {
              shouldRescan = true;
            }
          }
        });
      });
      
      if (shouldRescan) {
        console.log('🔄 DOM changed with potentially relevant content, rescanning...');
        setTimeout(() => this.scanForNewBoards(), 500);
      }
    });
    
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
    
    console.log('👀 Mutation observer active - watching for Pinterest board data...');
  }

  // Scan forms for hidden board data
  scanFormsForBoardData() {
    const forms = document.querySelectorAll('form');
    forms.forEach(form => {
      // Check form action and hidden inputs
      const formData = new FormData(form);
      for (const [key, value] of formData.entries()) {
        if (typeof value === 'string' && value.match(/^[a-f0-9]{24}$/)) {
          console.log(`🔍 Found potential board ID in form ${key}:`, value);
          
          if (value === '688cbbf56cac34c8300f037e') {
            console.log('🎉 FOUND TARGET BOARD in form data!');
            if (!this.accountInfo.boardIds.includes(value)) {
              this.accountInfo.boardIds.push(value);
              console.log('📌 Added target board ID from form data');
            }
          }
        }
      }
      
      // Check hidden inputs specifically
      const hiddenInputs = form.querySelectorAll('input[type="hidden"]');
      hiddenInputs.forEach(input => {
        if (input.value && input.value.match(/^[a-f0-9]{24}$/)) {
          console.log(`🔍 Found potential board ID in hidden input ${input.name}:`, input.value);
          
          if (input.value === '688cbbf56cac34c8300f037e') {
            console.log('🎉 FOUND TARGET BOARD in hidden input!');
            if (!this.accountInfo.boardIds.includes(input.value)) {
              this.accountInfo.boardIds.push(input.value);
              console.log('📌 Added target board ID from hidden input');
            }
          }
        }
      });
    });
  }

  // Directly fetch channel metadata from Buffer API
  async fetchChannelMetadataDirectly() {
    try {
      console.log('🔗 Checking Pinterest boards...');
      
      // Use the profile ID we already found to get channel info
      if (!this.accountInfo.profileId) {
        console.log('⚠️ No profile ID found, cannot fetch channel metadata');
        return;
      }
      
      // Check if we already have the target board and complete info - skip API call
      const hasTargetBoard = this.accountInfo.boardIds.includes('688cbbf56cac34c8300f037e');
      const hasBasicInfo = this.accountInfo.userId && this.accountInfo.profileId;
      const hasMultipleBoards = this.accountInfo.boardIds.length >= 3;
      
      if (hasTargetBoard && hasBasicInfo && hasMultipleBoards) {
        console.log('✅ Already have target board and complete info - skipping API call!');
        console.log('🎯 Target "Lunch Ideas" board found:', '688cbbf56cac34c8300f037e');
        console.log('📋 Current boards:', this.accountInfo.boardIds);
        return;
      }
      
      // Check cache first
      const now = Date.now();
      if (this.cachedBoards && (now - this.cacheTimestamp) < this.cacheExpiry) {
        console.log('📋 Using cached Pinterest boards (avoiding API spam)');
        this.accountInfo.boardIds = [...this.cachedBoards];
        console.log('✅ Loaded cached boards:', this.cachedBoards);
        return;
      }
      
      // Rate limiting check
      const timeSinceLastCall = now - this.lastApiCall;
      if (timeSinceLastCall < this.apiCooldown) {
        const waitTime = this.apiCooldown - timeSinceLastCall;
        console.log(`⏳ Rate limiting: waiting ${waitTime}ms before API call`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
      
      const channelId = this.accountInfo.profileId;
      const apiUrl = `https://graph.buffer.com/?_o=GetChannelInfo`;
      
      console.log(`🔗 Making rate-limited API call for channel: ${channelId}`);
      this.lastApiCall = Date.now();
      
      // Make the API call with proper authentication
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          query: `query GetChannelInfo($input: ChannelInput!) {
            channel(input: $input) {
              id
              name
              service
              metadata {
                ... on PinterestMetadata {
                  boards {
                    id
                    name
                  }
                }
              }
            }
          }`,
          variables: {
            input: {
              id: channelId
            }
          }
        })
      });
      
      if (response.ok) {
        const data = await response.json();
        console.log('📄 Direct API response:', data);
        
        // Extract boards from the response
        if (data.data && data.data.channel && data.data.channel.metadata && data.data.channel.metadata.boards) {
          const boards = data.data.channel.metadata.boards;
          console.log('📋 Found Pinterest boards in direct API call:', boards);
          
          // Clear existing board data and add the correct ones from API
          this.accountInfo.boardIds = [];
          this.accountInfo.boardsWithNames = [];
          
          boards.forEach((board, index) => {
            if (board.id && board.id.match(/^[a-f0-9]{24}$/)) {
              this.accountInfo.boardIds.push(board.id);
              this.accountInfo.boardsWithNames.push({
                id: board.id,
                name: board.name || 'Unknown Board'
              });
              
              console.log(`📌 Added Pinterest board[${index}]: ${board.id} (${board.name || 'Unknown'})`);
              
              // Special handling for target board
              if (board.id === '688cbbf56cac34c8300f037e') {
                console.log('🎉🎉🎉 SUCCESS! Found target "Lunch Ideas" board via direct API!');
                console.log(`🎯 Board Details: ${board.name} (${board.id})`);
              }
            }
          });
          
          // Cache the successful result
          this.cachedBoards = [...this.accountInfo.boardIds];
          this.cacheTimestamp = Date.now();
          
          console.log(`✅ Successfully extracted ${boards.length} Pinterest boards!`);
          console.log('📋 All Pinterest boards:', this.accountInfo.boardIds);
          console.log('💾 Cached boards for 5 minutes to prevent API spam');
          
        } else {
          console.log('⚠️ No Pinterest boards found in API response structure');
          console.log('📄 Full response for debugging:', JSON.stringify(data, null, 2));
        }
      } else {
        console.log('❌ Direct API call failed:', response.status, response.statusText);
      }
      
    } catch (error) {
      console.warn('❌ Error in direct API call:', error);
      
      // Fallback: try simpler approach
      this.trySimpleChannelFetch();
    }
  }

  // Simpler approach to trigger the GetChannelInfo API call
  async trySimpleChannelFetch() {
    try {
      console.log('🔄 Trying simple channel fetch approach...');
      
      // Look for existing fetch calls and trigger a new one
      const originalFetch = window.fetch;
      
      // Check if there are any existing channel API patterns we can reuse
      const scripts = document.getElementsByTagName('script');
      for (let script of scripts) {
        if (script.innerHTML && script.innerHTML.includes('GetChannelInfo')) {
          console.log('📋 Found existing GetChannelInfo pattern in script');
          
          // Try to trigger a similar call
          setTimeout(() => {
            console.log('🔄 Triggering channel info refresh...');
            // Force a page interaction that might trigger the API call
            window.dispatchEvent(new Event('focus'));
            window.dispatchEvent(new Event('resize'));
          }, 1000);
          
          break;
        }
      }
      
    } catch (error) {
      console.warn('❌ Error in simple channel fetch:', error);
    }
  }

  // Extract Buffer cookies for API authentication
  extractBufferCookies() {
    try {
      console.log('🍪 Extracting Buffer cookies...');
      
      // Get all cookies for buffer.com domain
      const allCookies = document.cookie;
      
      if (!allCookies) {
        console.log('⚠️ No cookies found on this page');
        return;
      }
      
      // Format cookies for Buffer API use (Netscape TSV format)
      const cookieLines = [];
      cookieLines.push('# Netscape HTTP Cookie File');
      cookieLines.push('# This is a generated file! Do not edit.');
      
      // Parse cookies and convert to TSV format
      const cookies = allCookies.split(';');
      cookies.forEach(cookie => {
        const [name, value] = cookie.trim().split('=');
        if (name && value) {
          // Format: domain, domainFlag, path, secure, expiry, name, value
          const line = [
            '.buffer.com', // domain
            'TRUE',        // domain flag
            '/',           // path
            'FALSE',       // secure
            '0',           // expiry (0 = session)
            name.trim(),   // cookie name
            value.trim()   // cookie value
          ].join('\t');
          
          cookieLines.push(line);
        }
      });
      
      const formattedCookies = cookieLines.join('\n');
      this.accountInfo.bufferCookies = formattedCookies;
      
      console.log('✅ Buffer cookies extracted successfully');
      console.log(`🍪 Total cookies: ${cookies.length}, formatted length: ${formattedCookies.length}`);
      console.log('🔧 Cookie preview:', formattedCookies.substring(0, 200) + '...');
      
    } catch (error) {
      console.warn('❌ Error extracting Buffer cookies:', error);
    }
  }
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('🔧 Content script received message:', request);
  
  if (request.action === 'ping') {
    sendResponse({ pong: true });
    return;
  }
  
  if (request.action === 'extractAccountInfo') {
    (async () => {
      try {
        const extractor = new BufferExtractor();
        const accountInfo = await extractor.extractAccountInfo();
        
        console.log('🔧 Extracted account info:', accountInfo);
        sendResponse({ success: true, data: accountInfo });
      } catch (error) {
        console.error('🔧 Content script error:', error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    
    return true; // Keep message channel open for async response
  }
  
  return true;
});

// Auto-extract on page load
window.addEventListener('load', () => {
  setTimeout(async () => {
    try {
      const extractor = new BufferExtractor();
      const accountInfo = await extractor.extractAccountInfo();
      
      // Store extracted info for popup access
      chrome.storage.local.set({ bufferAccountInfo: accountInfo });
      console.log('✅ Auto-extraction completed and stored:', accountInfo);
    } catch (error) {
      console.error('❌ Auto-extraction failed:', error);
    }
  }, 3000); // Wait 3 seconds for page to fully load and API calls to be ready
});

console.log('🔧 Buffer Account Extractor: Content script loaded');

// Add a global function for manual board extraction
window.getBufferBoards = async function() {
  console.log('🔗 Manual board extraction started...');
  
  // Get profile ID from URL or localStorage
  let profileId = null;
  
  // Method 1: From URL
  const urlMatch = window.location.href.match(/\/channels\/([a-f0-9]{24})/);
  if (urlMatch) {
    profileId = urlMatch[1];
  }
  
  // Method 2: From localStorage
  if (!profileId) {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        const value = localStorage.getItem(key);
        if (key.includes('persist') && value.includes('688526fb96f2ca7f1c0fc98d')) {
          profileId = '688526fb96f2ca7f1c0fc98d';
          break;
        }
      }
    } catch (e) {}
  }
  
  if (!profileId) {
    console.log('❌ Could not find profile ID');
    return;
  }
  
  console.log(`🔗 Using profile ID: ${profileId}`);
  
  try {
    // Make the direct API call
    const response = await fetch('https://graph.buffer.com/?_o=GetChannelInfo', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: `query GetChannelInfo($input: ChannelInput!) {
          channel(input: $input) {
            id
            name
            service
            metadata {
              ... on PinterestMetadata {
                boards {
                  id
                  name
                }
              }
            }
          }
        }`,
        variables: {
          input: {
            id: profileId
          }
        }
      })
    });
    
    if (response.ok) {
      const data = await response.json();
      console.log('📄 API Response:', data);
      
      if (data.data && data.data.channel && data.data.channel.metadata && data.data.channel.metadata.boards) {
        const boards = data.data.channel.metadata.boards;
        console.log('📋 ALL YOUR PINTEREST BOARDS:');
        
        boards.forEach((board, index) => {
          console.log(`${index}: ${board.id} - ${board.name}`);
          
          if (board.id === '688cbbf56cac34c8300f037e') {
            console.log(`🎉 FOUND YOUR TARGET BOARD: ${board.name} (${board.id})`);
          }
        });
        
        return boards;
      } else {
        console.log('❌ No boards found in response structure');
      }
    } else {
      console.log('❌ API call failed:', response.status);
    }
  } catch (error) {
    console.log('❌ Error making API call:', error);
  }
};

console.log('💡 TIP: Run getBufferBoards() in console to manually extract all your Pinterest boards!');
console.log('🎯 Extension now automatically extracts Pinterest boards including "Lunch Ideas" board!');