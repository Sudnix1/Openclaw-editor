const axios = require('axios');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp'); // Added Sharp for WebP conversion
require('dotenv').config();

class MidjourneyClient {
  constructor(channelId, userToken, relaxMode = false, debugMode = true) {
    this.channelId = channelId;
    this.userToken = userToken;
    this.apiUrl = 'https://discord.com/api/v10';
    this.applicationId = '936929561302675456'; // Midjourney application ID
    this.relaxMode = relaxMode;
    this.debugMode = debugMode;
    
    // UPDATED: Human-like timing with randomization
    this.baseCheckInterval = relaxMode ? 20000 : 12000; // Base intervals
    this.checkInterval = this.getRandomInterval();
    this.maxImagineAttempts = relaxMode ? 30 : 25; // Increased for slower checking
    this.maxUpscaleAttempts = relaxMode ? 20 : 15;
    
    // NEW: Human behavior patterns
    this.minHumanDelay = 2000; // Min 2 seconds
    this.maxHumanDelay = 8000; // Max 8 seconds
    this.typingDelay = () => Math.random() * 3000 + 1000; // 1-4 seconds "typing"
    
    // NEW: Rate limiting with variation
    this.requestCount = 0;
    this.lastRequestTime = 0;
    this.rateLimitBase = 3000; // Base 3 seconds between requests
    
    // NEW: Concurrent job handling settings
    this.maxConcurrentRetries = 3;
    this.concurrentRetryDelay = 30000; // 30 seconds
    this.rateLimitDelay = 1000; // 1 second between requests
    
    // NEW: WebP compression settings
    this.webpCompressionLevel = process.env.WEBP_COMPRESSION_LEVEL || 'balanced';
    
    this.client = axios.create({
      baseURL: this.apiUrl,
      headers: {
        'Authorization': this.userToken,
        'Content-Type': 'application/json'
      }
    });
    
    // Initialize additional properties
    this.guildId = null;
    this.userId = null;
    this.sessionId = this.generateUUID();
    this.dataId = null;
    this.dataVersion = null;
    
    // Create image storage directory if it doesn't exist
    this.imageDir = path.join(process.cwd(), 'recipe_images');
    if (!fs.existsSync(this.imageDir)) {
      fs.mkdirSync(this.imageDir, { recursive: true });
    }

    if (this.debugMode) {
      console.log(`🎉 [DEBUG] Enhanced MidjourneyClient initialized with human-like behavior`);
      console.log(`📢 [DEBUG] Channel ID: ${this.channelId}`);
      console.log(`⚡ [DEBUG] Relax mode: ${this.relaxMode}`);
      console.log(`⏰ [DEBUG] Base check interval: ${this.baseCheckInterval}ms`);
      console.log(`🔄 [DEBUG] Max imagine attempts: ${this.maxImagineAttempts}`);
      console.log(`🔄 [DEBUG] Max concurrent retries: ${this.maxConcurrentRetries}`);
      console.log(`⏳ [DEBUG] Human delay range: ${this.minHumanDelay}-${this.maxHumanDelay}ms`);
      console.log(`🖼️ [DEBUG] WebP compression level: ${this.webpCompressionLevel}`);
      console.log(`📁 [DEBUG] Image directory: ${this.imageDir}`);
    }
  }

  /**
   * NEW: Get WebP compression settings based on level
   */
  getWebPCompressionSettings(compressionLevel = null) {
    const level = compressionLevel || this.webpCompressionLevel;
    
    const settings = {
      'high_quality': {
        quality: 90,
        effort: 4,
        description: 'High quality, larger files (~4-5MB)'
      },
      'balanced': {
        quality: 85,
        effort: 6,
        description: 'Balanced quality/size (~2-3MB)'
      },
      'small_size': {
        quality: 75,
        effort: 6,
        description: 'Smaller files, good quality (~1-2MB)'
      },
      'minimum_size': {
        quality: 65,
        effort: 6,
        description: 'Minimum size, acceptable quality (~0.8-1.5MB)'
      }
    };

    const selected = settings[level] || settings['balanced'];
    
    this.debugLog(`🎛️ [DEBUG] Using WebP compression: ${level} (${selected.description})`);
    
    return {
      quality: selected.quality,
      effort: selected.effort,
      lossless: false,
      nearLossless: false,
      smartSubsample: true,
      reductionEffort: 6
    };
  }

  /**
   * NEW: Get random interval with human-like variation
   */
  getRandomInterval() {
    // Add 20-50% variation to base interval
    const variation = 0.2 + (Math.random() * 0.3);
    return Math.floor(this.baseCheckInterval * (1 + variation));
  }

  /**
   * NEW: Add human-like delay
   */
  async addHumanDelay(action = 'default') {
    const delays = {
      'typing': () => Math.random() * 3000 + 1000, // 1-4 seconds
      'reading': () => Math.random() * 2000 + 1000, // 1-3 seconds
      'thinking': () => Math.random() * 5000 + 2000, // 2-7 seconds
      'default': () => Math.random() * 3000 + 1000  // 1-4 seconds
    };
    
    const delay = delays[action] ? delays[action]() : delays.default();
    this.debugLog(`🕐 [HUMAN] Adding ${action} delay: ${Math.round(delay)}ms`);
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  /**
   * NEW: Enforce rate limiting with human-like variation
   */
  async enforceRateLimit() {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    
    // Add variation to rate limit (±30%)
    const variation = 0.7 + (Math.random() * 0.6);
    const requiredDelay = this.rateLimitBase * variation;
    
    if (timeSinceLastRequest < requiredDelay) {
      const waitTime = requiredDelay - timeSinceLastRequest;
      this.debugLog(`⏳ [RATE] Waiting ${Math.round(waitTime)}ms for rate limit`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    this.lastRequestTime = Date.now();
    this.requestCount++;
  }

  /**
   * Enhanced error detection for various Discord/Midjourney errors
   */
  detectErrorType(message) {
    const messageContent = message.toLowerCase();
    
    // Concurrent job limit errors
    if (messageContent.includes('maximum allowed number of concurrent jobs') ||
        messageContent.includes('concurrent jobs') ||
        messageContent.includes('queue') && messageContent.includes('full')) {
      return {
        type: 'CONCURRENT_LIMIT',
        retryable: true,
        delay: this.concurrentRetryDelay
      };
    }
    
    // Rate limit errors
    if (messageContent.includes('rate limit') ||
        messageContent.includes('too many requests') ||
        messageContent.includes('slow down')) {
      return {
        type: 'RATE_LIMIT',
        retryable: true,
        delay: this.rateLimitDelay
      };
    }
    
    // Banned prompt errors
    if (messageContent.includes('banned') ||
        messageContent.includes('inappropriate') ||
        messageContent.includes('violation') ||
        messageContent.includes('policy')) {
      return {
        type: 'BANNED_PROMPT',
        retryable: false,
        delay: 0
      };
    }
    
    // Discord API errors
    if (messageContent.includes('unauthorized') ||
        messageContent.includes('forbidden') ||
        messageContent.includes('invalid token')) {
      return {
        type: 'AUTH_ERROR',
        retryable: false,
        delay: 0
      };
    }
    
    // Server errors (potentially retryable)
    if (messageContent.includes('server error') ||
        messageContent.includes('internal error') ||
        messageContent.includes('service unavailable')) {
      return {
        type: 'SERVER_ERROR',
        retryable: true,
        delay: this.rateLimitDelay
      };
    }
    
    // Unknown error (potentially retryable)
    return {
      type: 'UNKNOWN',
      retryable: true,
      delay: this.rateLimitDelay
    };
  }

  /**
   * Enhanced safety check with better error reporting
   */
  performFinalSafetyCheck(promptText) {
    this.debugLog(`🔒 [SAFETY] Performing enhanced safety check on prompt...`);
    
    const highRiskTerms = [
    'thigh', 'thighs', 'naked', 'nude', 'sexy', 'sexual',
      'blood', 'violence', 'drug', 'porn', 'hate', 'racist', 'death',
      'weapon', 'gun', 'knife', 'explosive', 'terrorist', 'suicide'
    ];
    
    const foundRiskyTerms = [];
    const promptLower = promptText.toLowerCase();
    
    for (const term of highRiskTerms) {
      if (promptLower.includes(term.toLowerCase())) {
        foundRiskyTerms.push(term);
      }
    }
    
    const isSafe = foundRiskyTerms.length === 0;
    
    if (!isSafe) {
      this.debugLog(`❌ [SAFETY] High-risk terms detected: ${foundRiskyTerms.join(', ')}`);
      console.error(`🚨 SAFETY ALERT: Prompt contains high-risk terms: ${foundRiskyTerms.join(', ')}`);
      console.error(`🚨 Original prompt: ${promptText}`);
    } else {
      this.debugLog(`✅ [SAFETY] Prompt passed enhanced safety check`);
    }
    
    return {
      isSafe: isSafe,
      riskyTerms: foundRiskyTerms,
      message: isSafe ? 'Prompt is safe' : `Contains risky terms: ${foundRiskyTerms.join(', ')}`,
      confidence: isSafe ? 1.0 : 0.0
    };
  }

  // Debug logging helper
  debugLog(message, data = null) {
    if (this.debugMode) {
      console.log(message);
      if (data) {
        console.log(data);
      }
    }
  }

  // Generate a unique session ID
  generateUUID() {
    const uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
    this.debugLog(`🆔 [DEBUG] Generated UUID: ${uuid}`);
    return uuid;
  }

  // Initialize client by fetching required IDs
  async initialize() {
    try {
      this.debugLog('🚀 [DEBUG] === STARTING ENHANCED INITIALIZATION ===');
      console.log('Initializing Enhanced Midjourney client...');
      
      // Add human-like delay
      await this.addHumanDelay('thinking');
      
      // Get Guild ID
      this.debugLog('🏢 [DEBUG] Fetching Guild ID from channel...');
      const channelResponse = await this.client.get(`/channels/${this.channelId}`);
      this.guildId = channelResponse.data.guild_id;
      console.log(`Guild ID: ${this.guildId}`);
      this.debugLog(`✅ [DEBUG] Guild ID retrieved: ${this.guildId}`);

      // Add brief human delay
      await this.addHumanDelay('reading');

      // Get User ID
      this.debugLog('👤 [DEBUG] Fetching User ID...');
      const userResponse = await this.client.get('/users/@me');
      this.userId = userResponse.data.id;
      console.log(`User ID: ${this.userId}`);
      this.debugLog(`✅ [DEBUG] User ID retrieved: ${this.userId}`);

      // Another brief human delay
      await this.addHumanDelay('reading');

      // Get application command data
      this.debugLog('⚙️ [DEBUG] Fetching application commands...');
      const commandsResponse = await this.client.get(`/applications/${this.applicationId}/commands`);
      
      if (commandsResponse.data && commandsResponse.data.length > 0) {
        const imagineCommand = commandsResponse.data.find(cmd => cmd.name === 'imagine');
        if (imagineCommand) {
          this.dataId = imagineCommand.id;
          this.dataVersion = imagineCommand.version;
          this.debugLog(`🎯 [DEBUG] Found imagine command - ID: ${this.dataId}, Version: ${this.dataVersion}`);
        } else {
          this.dataId = commandsResponse.data[0].id;
          this.dataVersion = commandsResponse.data[0].version;
          this.debugLog(`⚠️ [DEBUG] Imagine command not found, using first command`);
        }
        console.log(`Command ID: ${this.dataId}, Version: ${this.dataVersion}`);
      } else {
        // Fallback to known values
        this.dataId = '938956540159881230';
        this.dataVersion = '1237876415471554623';
        console.log('Using fallback command data');
        this.debugLog('⚠️ [DEBUG] No commands returned, using fallback values');
      }

      if (this.relaxMode) {
        console.log('Running in RELAX MODE - expect longer processing times');
        this.debugLog('🐌 [DEBUG] RELAX MODE activated - extended timeouts enabled');
      }

      console.log('Enhanced Midjourney client initialized successfully');
      this.debugLog('✅ [DEBUG] === ENHANCED INITIALIZATION COMPLETED ===');
      return true;
    } catch (error) {
      console.error('Initialization error:', error.message);
      this.debugLog('❌ [DEBUG] === INITIALIZATION FAILED ===');
      this.debugLog(`❌ [DEBUG] Error: ${error.message}`);
      
      // Enhanced error reporting
      const errorType = this.detectErrorType(error.message);
      this.debugLog(`🔍 [DEBUG] Error type detected: ${errorType.type}`);
      
      if (error.response) {
        console.error('Response status:', error.response.status);
        console.error('Response data:', error.response.data);
        this.debugLog(`❌ [DEBUG] Response status: ${error.response.status}`);
        this.debugLog(`❌ [DEBUG] Response data:`, error.response.data);
      }
      throw error;
    }
  }

  /**
   * Enhanced imagine method with human-like behavior
   */
  async imagine(promptText, promptTags = '') {
    let retryCount = 0;
    
    while (retryCount <= this.maxConcurrentRetries) {
      try {
        this.debugLog(`\n🚀 [DEBUG] === STARTING ENHANCED IMAGINE PROCESS (Attempt ${retryCount + 1}/${this.maxConcurrentRetries + 1}) ===`);
        
        // Ensure client is initialized
        if (!this.guildId || !this.userId) {
          this.debugLog(`🔄 [DEBUG] Client not initialized, initializing...`);
          await this.initialize();
        }

        // ADD: Human delay before submitting
        await this.addHumanDelay('typing');

        // Create a unique ID to identify this generation
        const uniqueId = Date.now() - Math.floor(Math.random() * 1000);
        
        // FIXED: Clean the prompt text to remove existing parameters to avoid duplicates
        const cleanPromptText = promptText.replace(/--v\s+[\d.]+/g, '').replace(/--q\s+\d+/g, '').replace(/--s\s+\d+/g, '').trim();
        
        // FIXED: Embed unique ID as bare number within prompt text, exactly as shown in working example
        const prompt = `${cleanPromptText} ${uniqueId} ${promptTags}`;
        const originalPromptText = promptText;
        
        // Enhanced safety check
        const safetyCheck = this.performFinalSafetyCheck(promptText);
        if (!safetyCheck.isSafe) {
          console.error('🚨 CRITICAL: Enhanced safety check failed, blocking prompt submission');
          this.debugLog(`🚨 [SAFETY] Blocked prompt: ${promptText}`);
          this.debugLog(`🚨 [SAFETY] Risky terms: ${safetyCheck.riskyTerms.join(', ')}`);
          
          throw new Error(`Prompt blocked by enhanced safety system: ${safetyCheck.message}`);
        }
        
        this.debugLog(`✅ [SAFETY] Enhanced safety check passed, proceeding with submission`);
        this.debugLog(`🎯 [DEBUG] Generated unique ID: ${uniqueId}`);
        this.debugLog(`📝 [DEBUG] Full prompt: ${prompt}`);
        
        console.log(`Submitting prompt with unique ID ${uniqueId} (attempt ${retryCount + 1})`);

        // ADD: Rate limiting with variation
        await this.enforceRateLimit();

        // Submit the prompt with rate limiting
        if (retryCount > 0) {
          this.debugLog(`⏳ [DEBUG] Applying rate limit delay: ${this.rateLimitDelay}ms`);
          await new Promise(resolve => setTimeout(resolve, this.rateLimitDelay));
        }

        const params = {
          type: 2,
          application_id: this.applicationId,
          guild_id: this.guildId,
          channel_id: this.channelId,
          session_id: this.sessionId,
          data: {
            id: this.dataId,
            version: this.dataVersion,
            name: 'imagine',
            type: 1,
            options: [
              {
                type: 3,
                name: 'prompt',
                value: prompt
              }
            ]
          }
        };

        console.log('🔍 [DISCORD DEBUG] Sending to Discord:');
        console.log('   Full prompt:', prompt);
        console.log('   Prompt text:', promptText);
        console.log('   Unique ID:', uniqueId);
        console.log('   Prompt tags:', promptTags);
        console.log('   Contains "very"?', prompt.includes('very'));

        this.debugLog(`📤 [DEBUG] Submitting interaction to Discord...`);
        const response = await this.client.post('/interactions', params);
        console.log('Prompt submitted successfully');
        
        this.debugLog(`✅ [DEBUG] Discord response status: ${response.status}`);
        
        // Wait for initial processing - with random human-like delay
        console.log('Waiting for initial processing...');
        const initialWaitTime = this.checkInterval * (0.8 + Math.random() * 0.4); // ±20% variation
        this.debugLog(`⏳ [DEBUG] Waiting for initial processing (${Math.round(initialWaitTime)}ms)...`);
        await new Promise(resolve => setTimeout(resolve, initialWaitTime));
        
        // Fetch the generated images
        console.log('Checking for generated images...');
        this.debugLog(`🔍 [DEBUG] Starting image detection process...`);
        const imagineMessage = await this.checkImagine(uniqueId, originalPromptText);
        
        this.debugLog(`🎊 [DEBUG] === ENHANCED IMAGINE PROCESS COMPLETED SUCCESSFULLY ===`);
        return imagineMessage;
        
      } catch (error) {
        console.error(`Imagine error (attempt ${retryCount + 1}):`, error.message);
        this.debugLog(`💥 [DEBUG] *** IMAGINE PROCESS FAILED (Attempt ${retryCount + 1}) ***`);
        
        // Detect error type and decide if retryable
        const errorType = this.detectErrorType(error.message);
        this.debugLog(`🔍 [DEBUG] Error type: ${errorType.type}, Retryable: ${errorType.retryable}`);
        
        if (errorType.type === 'CONCURRENT_LIMIT' && retryCount < this.maxConcurrentRetries) {
          retryCount++;
          console.log(`🔄 Concurrent job limit reached, retrying in ${errorType.delay / 1000} seconds... (${retryCount}/${this.maxConcurrentRetries})`);
          this.debugLog(`🔄 [DEBUG] Concurrent limit retry ${retryCount}/${this.maxConcurrentRetries} in ${errorType.delay}ms`);
          
          await new Promise(resolve => setTimeout(resolve, errorType.delay));
          continue; // Retry the request
        }
        
        if (errorType.retryable && retryCount < this.maxConcurrentRetries) {
          retryCount++;
          console.log(`🔄 Retrying due to ${errorType.type} error in ${errorType.delay / 1000} seconds... (${retryCount}/${this.maxConcurrentRetries})`);
          this.debugLog(`🔄 [DEBUG] Retrying for ${errorType.type} error, attempt ${retryCount}/${this.maxConcurrentRetries}`);
          
          await new Promise(resolve => setTimeout(resolve, errorType.delay));
          continue; // Retry the request
        }
        
        // Non-retryable error or max retries reached
        this.debugLog(`💥 [DEBUG] Non-retryable error or max retries reached`);
        
        if (error.response) {
          console.error('Response status:', error.response.status);
          console.error('Response data:', error.response.data);
          this.debugLog(`💥 [DEBUG] Response status: ${error.response.status}`);
          this.debugLog(`💥 [DEBUG] Response data:`, error.response.data);
        }
        
        // Enhance error message with context
        let enhancedErrorMessage = error.message;
        if (errorType.type === 'CONCURRENT_LIMIT') {
          enhancedErrorMessage = `Midjourney concurrent job limit reached after ${this.maxConcurrentRetries} retries. Please try again later.`;
        } else if (errorType.type === 'BANNED_PROMPT') {
          enhancedErrorMessage = `Prompt was rejected by Midjourney content policy: ${error.message}`;
        } else if (errorType.type === 'AUTH_ERROR') {
          enhancedErrorMessage = `Discord authentication error. Please check your Discord settings: ${error.message}`;
        }
        
        throw new Error(enhancedErrorMessage);
      }
    }
  }

// Enhanced checkImagine with removal of fallback prompt, reduced API calls, and delayed retry
async checkImagine(uniqueId, originalPromptText = '') {
  let attempts = 0;
  let imagineMessage = null;
  let progressMessage = null;
  let lastProgressPercent = 0;
  let queueDetected = false;
  let queueStartTime = null;
  const startTime = Date.now();

  // NEW: Extended check interval for relax mode
  let currentCheckInterval = this.getRandomInterval() * 2; // Double the interval
  
  // NEW: Configure reduced checks
  let maxInitialAttempts = this.relaxMode ? 3 : 6; // Reduce to 3 checks in relax mode
  let maxTotalAttempts = this.maxImagineAttempts;
  let retryAfterLongWait = true; // Flag to enable long-wait retry

  this.debugLog(`🔍 [DEBUG] Enhanced image check with reduced API calls for unique ID: ${uniqueId}`);
  console.log(`Looking for image with unique ID: ${uniqueId} (reduced API checks)`);
  
  // REMOVED: Fallback prompt section is completely removed
  
  while (!imagineMessage && attempts < maxInitialAttempts) {
    try {
      // ADD: Human-like reading delay if not first attempt
      if (attempts > 0) {
        await this.addHumanDelay('reading');
      }

      this.debugLog(`\n🔍 [DEBUG] === Enhanced Check Attempt ${attempts + 1}/${maxInitialAttempts} ===`);
      console.log(`Checking for images (attempt ${attempts + 1}/${maxInitialAttempts})...`);
      
      // ADD: Rate limiting
      await this.enforceRateLimit();
      
      const response = await this.client.get(`/channels/${this.channelId}/messages?limit=20`);
      const messages = response.data;
      
      this.debugLog(`📨 [DEBUG] Retrieved ${messages.length} messages from Discord`);

      // Check for concurrent job limit message but don't throw error immediately
      for (const message of messages) {
        const messageContent = message.content.toLowerCase();
        
        // Check if this is a concurrent job limit message for our job
        if ((messageContent.includes('maximum allowed number of concurrent jobs') ||
             messageContent.includes('concurrent jobs') ||
             (messageContent.includes('queue') && messageContent.includes('full')) ||
             messageContent.includes('job queued')) &&
            message.content.includes(uniqueId.toString())) {
          
          if (!queueDetected) {
            queueDetected = true;
            queueStartTime = Date.now();
            // ENHANCED: Increase timeout when queue is detected
            maxInitialAttempts = Math.max(maxInitialAttempts, 4); // Increase to 4 checks for queued jobs
            this.debugLog(`🚫 [DEBUG] QUEUE DETECTED - Job is queued, extending initial checks to ${maxInitialAttempts} attempts`);
            console.log('🔄 Job is queued by Midjourney, waiting for it to start processing...');
          }
          
          // Show queue status
          const queueTime = Math.round((Date.now() - queueStartTime) / 1000);
          console.log(`⏳ Job still queued (waiting ${queueTime}s)...`);
          this.debugLog(`🔄 [DEBUG] Job queued for ${queueTime} seconds`);
          
          // Don't throw error, continue waiting
          break;
        }
      }

      // Look for "job started" or progress messages if we were queued
      if (queueDetected) {
        let jobStarted = false;
        
        for (const message of messages) {
          if (message.content.includes(uniqueId.toString())) {
            // Check if job started processing (progress indicators)
            if (message.content.includes('(0%)') || 
                message.content.includes('(1%)') ||
                (message.content.includes('%') && !message.content.toLowerCase().includes('queue'))) {
              
              jobStarted = true;
              queueDetected = false; // Job is no longer queued
              console.log('✅ Queued job has started processing!');
              this.debugLog(`✅ [DEBUG] Queued job started processing!`);
              break;
            }
          }
        }
      }

      // Look for messages with unique ID (ONLY using ID check, no fallback)
      let foundAnyWithId = false;
      messages.forEach((msg, index) => {
        if (msg.content.includes(uniqueId.toString())) {
          foundAnyWithId = true;
          this.debugLog(`📝 [DEBUG] Message ${index + 1} with unique ID found`);
          
          // Skip queue messages - we handle them above
          const messageContent = msg.content.toLowerCase();
          if (messageContent.includes('queue') || messageContent.includes('concurrent jobs')) {
            return; // Skip processing this message
          }
          
          // Check for other error messages in the content
          const errorType = this.detectErrorType(msg.content);
          if (errorType.type !== 'UNKNOWN' && errorType.type !== 'CONCURRENT_LIMIT' && !errorType.retryable) {
            this.debugLog(`❌ [DEBUG] Error message detected: ${errorType.type}`);
            throw new Error(`Midjourney error: ${msg.content}`);
          }
        }
      });

      // Standard image detection logic continues...
      for (const item of messages) {
        if (item.content.includes(uniqueId.toString())) {
          // Skip queue messages
          const messageContent = item.content.toLowerCase();
          if (messageContent.includes('queue') || messageContent.includes('concurrent jobs')) {
            continue; // Skip queue messages
          }
          
          // Check if message is recent (within last 15 minutes for queued jobs)  
          const messageTime = new Date(item.timestamp).getTime();
          const now = Date.now();
          const messageAge = now - messageTime;
          const maxAge = queueDetected ? 15 * 60 * 1000 : 10 * 60 * 1000; // 15 min for queued, 10 min for normal
          
          if (messageAge > maxAge) {
            this.debugLog(`⏰ [DEBUG] Skipping old message (${Math.round(messageAge / 60000)} minutes old)`);
            continue;
          }
          
          // Check if it's a progress message
          const progressMatch = item.content.match(/\((\d+)%\)/);
          if (progressMatch) {
            const percent = parseInt(progressMatch[1]);
            if (percent > lastProgressPercent) {
              console.log(`Image generation progress: ${percent}%`);
              this.debugLog(`📈 [DEBUG] Progress update: ${percent}%`);
              lastProgressPercent = percent;
              progressMessage = item;
              
              // Reset queue detection once we see progress
              if (queueDetected && percent > 0) {
                queueDetected = false;
                console.log('✅ Job started processing (progress detected)');
                this.debugLog(`✅ [DEBUG] Job started processing (${percent}% progress)`);
              }
            }
          }
          
          // Check if it's a completed message
          const hasUserMention = item.content.includes(`<@${this.userId}>`);
          const notWaitingToStart = !item.content.includes('(Waiting to start)');
          const notPaused = !item.content.includes('(Paused)');
          const hasAttachments = item.attachments && item.attachments.length > 0;
          const hasComponents = item.components && item.components.length > 0;
          const notProcessing = !item.content.match(/\(\d+%\)/);
          
          if (hasUserMention && notWaitingToStart && notPaused && notProcessing && (hasAttachments || hasComponents)) {
            console.log('Found completed message with images!');
            this.debugLog(`🎉 [DEBUG] *** COMPLETION DETECTED! ***`);
            
            return {
              id: item.id,
              raw_message: item
            };
          }
        }
      }

      // REMOVED: Entire fallback prompt section

      // Show queue status in logs
      if (queueDetected) {
        const queueTime = Math.round((Date.now() - queueStartTime) / 1000);
        if (queueTime % 30 === 0) { // Log every 30 seconds
          console.log(`⏳ Still waiting for queued job (${queueTime}s elapsed)...`);
        }
      }

      // Larger interval between checks
      currentCheckInterval = this.getRandomInterval() * 2.5; // 2.5x longer intervals
      
      this.debugLog(`⏰ [ADAPTIVE] Next check in ${Math.round(currentCheckInterval)}ms`);
      await new Promise(resolve => setTimeout(resolve, currentCheckInterval));
      attempts++;
      
    } catch (error) {
      console.error('Enhanced check imagine error:', error.message);
      this.debugLog(`❌ [DEBUG] Enhanced check error: ${error.message}`);
      
      if (error.response) {
        this.debugLog(`❌ [DEBUG] Response status: ${error.response.status}`);
      }
      
      await new Promise(resolve => setTimeout(resolve, this.checkInterval * 2));
      attempts++;
    }
  }

  // NEW: Add extended wait and retry mechanism
  if (!imagineMessage && retryAfterLongWait) {
    const longWaitDuration = 4 * 60 * 1000; // 4 minutes wait
    console.log(`\n⏳ No image found after ${attempts} attempts. Waiting ${longWaitDuration/60000} minutes before final check...`);
    this.debugLog(`⏳ [DEBUG] === ENTERING EXTENDED WAIT PERIOD (${longWaitDuration/60000} min) ===`);
    
    // Wait for 4 minutes
    await new Promise(resolve => setTimeout(resolve, longWaitDuration));
    
    // Try one final check with a larger limit to find older messages
    try {
      console.log(`Performing final check for image with ID ${uniqueId}...`);
      this.debugLog(`🔍 [DEBUG] === PERFORMING FINAL CHECK AFTER EXTENDED WAIT ===`);
      
      // Rate limiting
      await this.enforceRateLimit();
      
      // Use larger limit (30) to find possibly older messages
      const response = await this.client.get(`/channels/${this.channelId}/messages?limit=30`);
      const messages = response.data;
      
      this.debugLog(`📨 [DEBUG] Retrieved ${messages.length} messages for final check`);
      
      // Check all messages for our unique ID
      for (const item of messages) {
        if (item.content.includes(uniqueId.toString())) {
          // Skip queue/error messages
          const messageContent = item.content.toLowerCase();
          if (messageContent.includes('queue') || 
              messageContent.includes('concurrent jobs') ||
              messageContent.includes('error')) {
            continue;
          }
          
          // Check if it's a completed message
          const hasUserMention = item.content.includes(`<@${this.userId}>`);
          const hasAttachments = item.attachments && item.attachments.length > 0;
          const hasComponents = item.components && item.components.length > 0;
          const notProcessing = !item.content.match(/\(\d+%\)/);
          
          if (hasUserMention && notProcessing && (hasAttachments || hasComponents)) {
            console.log('✅ Found completed message with images after extended wait!');
            this.debugLog(`🎉 [DEBUG] *** COMPLETION DETECTED AFTER EXTENDED WAIT! ***`);
            
            return {
              id: item.id,
              raw_message: item
            };
          }
        }
      }
      
      this.debugLog(`❌ [DEBUG] Final check failed to find image`);
    } catch (error) {
      console.error('Final check error:', error.message);
      this.debugLog(`❌ [DEBUG] Final check error: ${error.message}`);
    }
  }

  // Handle progress message or timeout
  if (progressMessage) {
    console.log('Returning partial progress message as we reached timeout');
    this.debugLog(`⚠️ [DEBUG] Returning progress message - timeout reached`);
    return {
      id: progressMessage.id,
      raw_message: progressMessage,
      in_progress: true
    };
  }

  // Better timeout message
  const totalTimeMinutes = Math.round((Date.now() - startTime) / 60000);
  let timeoutMessage = `Failed to generate image after initial ${attempts} attempts and extended wait (${totalTimeMinutes} minutes total)`;
  
  if (queueDetected) {
    timeoutMessage += '. Job was queued by Midjourney but never started processing. This might indicate server issues.';
  }

  this.debugLog(`❌ [DEBUG] *** ENHANCED CHECK TIMEOUT ***`);
  throw new Error(timeoutMessage);
}

  // Extract grid images - WITH DEBUG (FIXED - NO DELAY, DOWNLOAD IMMEDIATELY)
  async extractGridImages(message) {
    this.debugLog(`\n🔍 [DEBUG] === STARTING GRID EXTRACTION ===`);
    
    if (!message || !message.raw_message) {
      console.log('Invalid message object for extractGridImages');
      this.debugLog(`❌ [DEBUG] Invalid message object for extractGridImages`);
      return null;
    }
    
    console.log('Extracting grid images from message...');
    console.log('Message has attachments:', !!message.raw_message.attachments);
    
    this.debugLog(`📨 [DEBUG] Message ID: ${message.id || 'N/A'}`);
    this.debugLog(`📎 [DEBUG] Message has attachments: ${!!message.raw_message.attachments}`);
    this.debugLog(`🔘 [DEBUG] Message has components: ${!!message.raw_message.components}`);
    
    if (message.raw_message.attachments && message.raw_message.attachments.length > 0) {
      console.log(`Found ${message.raw_message.attachments.length} attachments`);
      this.debugLog(`📎 [DEBUG] Found ${message.raw_message.attachments.length} attachments`);
      
      // Log all attachments for debugging
      for (let i = 0; i < message.raw_message.attachments.length; i++) {
        const attachment = message.raw_message.attachments[i];
        console.log(`Attachment ${i + 1}:`);
        console.log(`  URL: ${attachment.url}`);
        console.log(`  Content Type: ${attachment.content_type}`);
        console.log(`  Filename: ${attachment.filename}`);
        
        this.debugLog(`🖼️ [DEBUG] === Attachment ${i + 1} ===`);
        this.debugLog(`   📎 [DEBUG] URL: ${attachment.url}`);
        this.debugLog(`   📄 [DEBUG] Content Type: ${attachment.content_type}`);
        this.debugLog(`   📝 [DEBUG] Filename: ${attachment.filename}`);
        this.debugLog(`   📏 [DEBUG] Size: ${attachment.size || 'unknown'} bytes`);
        this.debugLog(`   📐 [DEBUG] Width: ${attachment.width || 'unknown'}px`);
        this.debugLog(`   📐 [DEBUG] Height: ${attachment.height || 'unknown'}px`);
      }
      
      // Find the grid image (it may not necessarily have "_grid_" in the URL)
      for (const attachment of message.raw_message.attachments) {
        if (attachment.content_type && attachment.content_type.startsWith('image/')) {
          console.log('Found an image attachment, assuming it is the grid image');
          this.debugLog(`🎯 [DEBUG] Found image attachment - processing as grid image`);
          
          // Save the grid image
          const uniqueId = this.extractUniqueId(message) || Date.now();
          const gridFilename = `grid_${uniqueId}.webp`;
          
          this.debugLog(`🆔 [DEBUG] Extracted unique ID: ${uniqueId}`);
          this.debugLog(`📁 [DEBUG] Grid filename: ${gridFilename}`);
          
          // DOWNLOAD IMMEDIATELY - NO DELAY (URLs expire quickly!)
          console.log('Downloading image immediately (URLs expire quickly)...');
          this.debugLog(`💾 [DEBUG] Downloading image immediately - Discord URLs expire quickly!`);
          
          const savedPath = await this.downloadImage(attachment.url, gridFilename);
          
          // Continue even if download failed (e.g., due to expired URL)
          if (!savedPath || savedPath.includes('(URL expired)')) {
            console.log('Grid image download failed or URL expired, continuing with URL reference');
            this.debugLog(`⚠️ [DEBUG] Grid image download failed, using URL reference: ${attachment.url}`);
          }
          
          // Find all upscale buttons
          const options = [];
          
          this.debugLog(`🔍 [DEBUG] === SEARCHING FOR UPSCALE BUTTONS ===`);
          
          if (message.raw_message.components) {
            console.log(`Message has ${message.raw_message.components.length} component rows`);
            this.debugLog(`🔘 [DEBUG] Message has ${message.raw_message.components.length} component rows`);
            
            for (let i = 0; i < message.raw_message.components.length; i++) {
              const rowComponent = message.raw_message.components[i];
              
              if (rowComponent.components) {
                console.log(`Row ${i + 1} has ${rowComponent.components.length} buttons`);
                this.debugLog(`🔘 [DEBUG] Row ${i + 1} has ${rowComponent.components.length} buttons`);
                
                for (let j = 0; j < rowComponent.components.length; j++) {
                  const button = rowComponent.components[j];
                  
                  console.log(`Button ${j + 1}:`);
                  console.log(`  Type: ${button.type}`);
                  console.log(`  Label: ${button.label || 'No Label'}`);
                  console.log(`  Custom ID: ${button.custom_id || 'No Custom ID'}`);
                  
                  this.debugLog(`🔘 [DEBUG] === Button ${j + 1} ===`);
                  this.debugLog(`   🏷️ [DEBUG] Type: ${button.type}`);
                  this.debugLog(`   📝 [DEBUG] Label: ${button.label || 'No Label'}`);
                  this.debugLog(`   🆔 [DEBUG] Custom ID: ${button.custom_id || 'No Custom ID'}`);
                  this.debugLog(`   🎨 [DEBUG] Style: ${button.style || 'No Style'}`);
                  this.debugLog(`   🔗 [DEBUG] URL: ${button.url || 'No URL'}`);
                  
                  if (button.custom_id && 
                      (button.custom_id.includes('MJ::JOB::upsample') || 
                       button.custom_id.includes('MJ::Upscale'))) {
                    
                    this.debugLog(`🎯 [DEBUG] Found upscale button!`);
                    
                    // Extract button index (U1, U2, U3, U4)
                    let buttonIndex = null;
                    if (button.label) {
                      if (button.label.includes('U1')) buttonIndex = 0;
                      else if (button.label.includes('U2')) buttonIndex = 1;
                      else if (button.label.includes('U3')) buttonIndex = 2;
                      else if (button.label.includes('U4')) buttonIndex = 3;
                    }
                    
                    // If label doesn't contain U1-U4, try to extract from custom_id
                    if (buttonIndex === null && button.custom_id) {
                      const indexMatch = button.custom_id.match(/upsample::(\d+)/);
                      if (indexMatch) {
                        buttonIndex = parseInt(indexMatch[1]) - 1; // Convert 1-4 to 0-3
                        this.debugLog(`🔢 [DEBUG] Extracted index from custom_id: ${buttonIndex}`);
                      }
                    }
                    
                    // If still no index, use current position
                    if (buttonIndex === null) {
                      buttonIndex = options.length;
                      this.debugLog(`🔢 [DEBUG] Using fallback index: ${buttonIndex}`);
                    }
                    
                    options.push({
                      index: buttonIndex,
                      custom_id: button.custom_id,
                      label: button.label || `Image ${options.length + 1}`
                    });
                    
                    console.log(`  Found upscale button with index: ${buttonIndex}`);
                    this.debugLog(`✅ [DEBUG] Added upscale option - Index: ${buttonIndex}, Label: ${button.label || `Image ${options.length}`}`);
                  }
                }
              }
            }
          } else {
            console.log('Message has no component rows');
            this.debugLog(`⚠️ [DEBUG] Message has no component rows`);
          }
          
          if (options.length > 0) {
            console.log(`Found ${options.length} upscale buttons`);
            this.debugLog(`✅ [DEBUG] === GRID EXTRACTION COMPLETED ===`);
            this.debugLog(`🎯 [DEBUG] Found ${options.length} upscale buttons`);
            this.debugLog(`🖼️ [DEBUG] Grid URL: ${attachment.url}`);
            this.debugLog(`💾 [DEBUG] Grid saved to: ${savedPath || 'Download failed, using URL'}`);
            
            return { 
              grid_url: attachment.url,
              grid_path: savedPath || attachment.url, // Use URL if download failed
              options: options 
            };
          } else {
            console.log('No upscale buttons found, this might be a completed image');
            this.debugLog(`⚠️ [DEBUG] No upscale buttons found - creating default options`);
            
            return {
              grid_url: attachment.url,
              grid_path: savedPath || attachment.url, // Use URL if download failed
              options: [
                { index: 0, custom_id: null, label: 'Option 1' },
                { index: 1, custom_id: null, label: 'Option 2' },
                { index: 2, custom_id: null, label: 'Option 3' },
                { index: 3, custom_id: null, label: 'Option 4' }
              ]
            };
          }
        }
      }
    }
    
    console.log('No suitable attachments found for grid image');
    this.debugLog(`❌ [DEBUG] === GRID EXTRACTION FAILED ===`);
    this.debugLog(`❌ [DEBUG] No suitable attachments found for grid image`);
    return null;
  }

  // Check for the upscaled image - WITH DEBUG (FIXED - DOWNLOAD IMMEDIATELY)
  async checkUpscale(message, upscaleIndex) {
    this.debugLog(`\n🔍 [DEBUG] === STARTING UPSCALE CHECK ===`);
    
    let attempts = 0;
    let upscaledPhotoUrl = null;
    const messageIndex = upscaleIndex + 1;
    const startTime = Date.now();
    
    // Extract the unique ID from the content
    const uniqueId = this.extractUniqueId(message);
    if (!uniqueId) {
      this.debugLog(`❌ [DEBUG] Could not extract unique ID from message content`);
      throw new Error('Could not extract unique ID from message content');
    }
    
    console.log(`Looking for upscaled image with ID ${uniqueId}, index ${messageIndex}`);
    this.debugLog(`🆔 [DEBUG] Looking for upscaled image with ID: ${uniqueId}`);
    this.debugLog(`🔢 [DEBUG] Message index: ${messageIndex}`);
    this.debugLog(`🔄 [DEBUG] Max attempts: ${this.maxUpscaleAttempts}`);
    this.debugLog(`⏰ [DEBUG] Check interval: ${this.checkInterval}ms`);

    while (!upscaledPhotoUrl && attempts < this.maxUpscaleAttempts) {
      try {
        // Add human-like delay between checks
        if (attempts > 0) {
          await this.addHumanDelay('reading');
        }

        this.debugLog(`\n🔍 [DEBUG] === Upscale Check Attempt ${attempts + 1}/${this.maxUpscaleAttempts} ===`);
        console.log(`Checking for upscaled image (attempt ${attempts + 1}/${this.maxUpscaleAttempts})...`);
        
        // Add small delay for upscale processing (shorter than before)
        if (attempts === 0) {
          console.log('Waiting briefly for upscale processing...');
          this.debugLog(`⏳ [DEBUG] Waiting 5 seconds for upscale processing...`);
          await new Promise(resolve => setTimeout(resolve, 5000)); // Reduced to 5 seconds
        }
        
        // Add rate limiting
        await this.enforceRateLimit();
        
        const response = await this.client.get(`/channels/${this.channelId}/messages?limit=20`);
        const items = response.data;

        this.debugLog(`📨 [DEBUG] Retrieved ${items.length} messages`);

        for (const item of items) {
          // Check for upscaled image message using various patterns
          if (item.content.includes(uniqueId.toString())) {
            this.debugLog(`🎯 [DEBUG] Found message with unique ID: ${item.id}`);
            this.debugLog(`📄 [DEBUG] Content: ${item.content}`);
            this.debugLog(`👤 [DEBUG] Contains user mention: ${item.content.includes(`<@${this.userId}>`)}`);
            this.debugLog(`📎 [DEBUG] Has attachments: ${!!(item.attachments && item.attachments.length > 0)}`);
            
            // Check for standard upscale format
            if (
              (item.content.includes(`Image #${messageIndex}`) && item.content.includes(`<@${this.userId}>`)) ||
              (item.content.includes(`Upscaled by <@${this.userId}>`))
            ) {
              this.debugLog(`✅ [DEBUG] Found standard upscale format message`);
              
              if (item.attachments && item.attachments.length > 0) {
                console.log('Found upscaled image!');
                const url = item.attachments[0].url;
                
                this.debugLog(`🎉 [DEBUG] === UPSCALE FOUND ===`);
                this.debugLog(`🖼️ [DEBUG] Upscaled image URL: ${url}`);
                this.debugLog(`⏱️ [DEBUG] Total time: ${Date.now() - startTime}ms`);
                this.debugLog(`🔄 [DEBUG] Attempts: ${attempts + 1}`);
                
                // DOWNLOAD IMMEDIATELY - NO ADDITIONAL DELAY
                console.log('Downloading upscaled image immediately...');
                this.debugLog(`💾 [DEBUG] Downloading upscaled image immediately - no delay!`);
                
                // Save the upscaled image
                const filename = `upscaled_${uniqueId}_option${upscaleIndex}.webp`;
                this.debugLog(`💾 [DEBUG] Saving as: ${filename}`);
                await this.downloadImage(url, filename);
                
                return url;
              }
            }
            
            // Check for any attachment in messages with our ID
            if (item.attachments && item.attachments.length > 0 && 
                (item.content.includes(`<@${this.userId}>`) || 
                 item.content.includes('Upscaled'))) {
              console.log('Found potential upscaled image');
              const url = item.attachments[0].url;
              
              this.debugLog(`🎯 [DEBUG] Found potential upscaled image: ${url}`);
              
              // DOWNLOAD IMMEDIATELY - NO ADDITIONAL DELAY
              console.log('Downloading potential upscaled image immediately...');
              this.debugLog(`💾 [DEBUG] Downloading potential upscaled image immediately - no delay!`);
              
              // Save the upscaled image
              const filename = `upscaled_${uniqueId}_option${upscaleIndex}.webp`;
              this.debugLog(`💾 [DEBUG] Saving as: ${filename}`);
              await this.downloadImage(url, filename);
              
              return url;
            }
          }
        }

        // NEW: Adaptive check interval - increase delay between checks
        let currentCheckInterval;
        if (attempts < 5) {
          currentCheckInterval = this.checkInterval;
        } else if (attempts < 10) {
          currentCheckInterval = this.checkInterval * 1.5;
        } else {
          currentCheckInterval = this.checkInterval * 2;
        }
        
        this.debugLog(`⏳ [DEBUG] Waiting ${currentCheckInterval}ms before next attempt...`);
        await new Promise(resolve => setTimeout(resolve, currentCheckInterval));
        attempts++;
      } catch (error) {
        console.error('Check upscale error:', error.message);
        this.debugLog(`❌ [DEBUG] Check upscale error: ${error.message}`);
        if (error.response) {
          console.error('Response status:', error.response.status);
          this.debugLog(`❌ [DEBUG] Response status: ${error.response.status}`);
        }
        await new Promise(resolve => setTimeout(resolve, this.checkInterval));
        attempts++;
      }
    }

    this.debugLog(`❌ [DEBUG] === UPSCALE CHECK TIMEOUT ===`);
    this.debugLog(`❌ [DEBUG] Failed after ${attempts} attempts`);
    this.debugLog(`❌ [DEBUG] Total time: ${Date.now() - startTime}ms`);
    throw new Error('Failed to upscale image after multiple attempts');
  }

  // New method to download an image from URL with WebP conversion - UPDATED
  async downloadImage(url, filename) {
    try {
      this.debugLog(`📥 [DEBUG] === STARTING IMAGE DOWNLOAD WITH WEBP CONVERSION ===`);
      this.debugLog(`🌐 [DEBUG] URL: ${url}`);
      this.debugLog(`📁 [DEBUG] Filename: ${filename}`);
      this.debugLog(`📂 [DEBUG] Save directory: ${this.imageDir}`);

      const response = await axios({
        url,
        method: 'GET',
        responseType: 'arraybuffer', // Changed from 'stream' to 'arraybuffer' for Sharp processing
        timeout: 30000 // 30 second timeout
      });
      
      this.debugLog(`✅ [DEBUG] HTTP response received, status: ${response.status}`);
      this.debugLog(`📊 [DEBUG] Content length: ${response.headers['content-length'] || 'unknown'}`);
      this.debugLog(`🗂️ [DEBUG] Content type: ${response.headers['content-type'] || 'unknown'}`);
      
      const filepath = path.join(this.imageDir, filename);
      
      // Check if the filename should be WebP
      const isWebP = filename.toLowerCase().endsWith('.webp');
      
      if (isWebP) {
        this.debugLog(`🔄 [DEBUG] Converting to WebP format with compression...`);
        
        // Convert to WebP with optimal compression settings
        const webpSettings = this.getWebPCompressionSettings();
        const webpBuffer = await sharp(response.data)
          .webp(webpSettings)
          .toBuffer();
        
        // Write the compressed WebP buffer to file
        fs.writeFileSync(filepath, webpBuffer);
        
        // Log compression results
        const originalSize = response.data.length;
        const compressedSize = webpBuffer.length;
        const compressionRatio = ((originalSize - compressedSize) / originalSize * 100).toFixed(1);
        
        this.debugLog(`📊 [DEBUG] Compression results:`);
        this.debugLog(`   📥 Original size: ${(originalSize / 1024 / 1024).toFixed(2)} MB`);
        this.debugLog(`   📤 Compressed size: ${(compressedSize / 1024 / 1024).toFixed(2)} MB`);
        this.debugLog(`   💾 Space saved: ${compressionRatio}%`);
        
        console.log(`✅ Image converted to WebP: ${(originalSize / 1024 / 1024).toFixed(2)}MB → ${(compressedSize / 1024 / 1024).toFixed(2)}MB (${compressionRatio}% reduction)`);
        
      } else {
        // For non-WebP files, save as-is
        this.debugLog(`📝 [DEBUG] Saving as original format (no conversion)`);
        fs.writeFileSync(filepath, response.data);
      }
      
      console.log(`Image saved to: ${filepath}`);
      this.debugLog(`✅ [DEBUG] === IMAGE DOWNLOAD AND CONVERSION COMPLETED ===`);
      this.debugLog(`💾 [DEBUG] File saved successfully: ${filepath}`);
      
      // Check final file size
      try {
        const stats = fs.statSync(filepath);
        this.debugLog(`📏 [DEBUG] Final file size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
      } catch (e) {
        this.debugLog(`⚠️ [DEBUG] Could not get file stats: ${e.message}`);
      }
      
      return filepath;
      
    } catch (error) {
      // Handle 404 errors gracefully - Discord URLs can expire
      if (error.response && error.response.status === 404) {
        console.warn(`⚠️ Discord image URL expired (404): ${url}`);
        this.debugLog(`⚠️ [DEBUG] === IMAGE DOWNLOAD SKIPPED (404) ===`);
        this.debugLog(`⚠️ [DEBUG] Discord URL expired: ${url}`);
        this.debugLog(`⚠️ [DEBUG] This is normal - Discord URLs expire after some time`);
        return `${filename} (URL expired)`;
      }
      
      console.error(`Failed to download and convert image: ${error.message}`);
      this.debugLog(`❌ [DEBUG] === IMAGE DOWNLOAD AND CONVERSION FAILED ===`);
      this.debugLog(`❌ [DEBUG] Error: ${error.message}`);
      if (error.response) {
        this.debugLog(`❌ [DEBUG] Response status: ${error.response.status}`);
        this.debugLog(`❌ [DEBUG] Response headers:`, error.response.headers);
      }
      return null;
    }
  }

  // Get direct image URL from message if available - WITH DEBUG
  async getDirectImageUrl(message) {
    this.debugLog(`\n🔍 [DEBUG] === CHECKING FOR DIRECT IMAGE URL ===`);
    
    if (!message || !message.raw_message) {
      this.debugLog(`❌ [DEBUG] Invalid message object`);
      throw new Error('Invalid message object');
    }
    
    this.debugLog(`📨 [DEBUG] Message ID: ${message.id || 'N/A'}`);
    this.debugLog(`📎 [DEBUG] Has attachments: ${!!(message.raw_message.attachments && message.raw_message.attachments.length > 0)}`);
    this.debugLog(`🖼️ [DEBUG] Has embeds: ${!!(message.raw_message.embeds && message.raw_message.embeds.length > 0)}`);
    
    // Check if the message already has attachments with images
    if (message.raw_message.attachments && message.raw_message.attachments.length > 0) {
      this.debugLog(`📎 [DEBUG] Checking ${message.raw_message.attachments.length} attachments`);
      
      for (let i = 0; i < message.raw_message.attachments.length; i++) {
        const attachment = message.raw_message.attachments[i];
        this.debugLog(`🖼️ [DEBUG] Attachment ${i + 1}: ${attachment.url}`);
        this.debugLog(`   📄 [DEBUG] Content type: ${attachment.content_type}`);
        
        if (attachment.content_type && attachment.content_type.startsWith('image/')) {
          // Skip grid images - these are not upscaled images but the 2x2 grid
          if (attachment.url.includes('_grid_')) {
            console.log('Found grid image, but we want an upscaled version instead');
            this.debugLog(`⏭️ [DEBUG] Skipping grid image: ${attachment.url}`);
            return null;
          }
          
          // Check if this is actually an upscaled image
          if (attachment.url.includes('_upscaled_') || 
              message.raw_message.content.includes('Upscaled') ||
              (message.raw_message.content.includes('Image #') && !message.raw_message.content.includes('%'))) {
            console.log('Found upscaled image in message:', attachment.url);
            this.debugLog(`✅ [DEBUG] Found upscaled image: ${attachment.url}`);
            return attachment.url;
          }
        }
      }
    }
    
    // If no direct attachments, check for embeds
    if (message.raw_message.embeds && message.raw_message.embeds.length > 0) {
      this.debugLog(`🖼️ [DEBUG] Checking ${message.raw_message.embeds.length} embeds`);
      
      for (let i = 0; i < message.raw_message.embeds.length; i++) {
        const embed = message.raw_message.embeds[i];
        this.debugLog(`🖼️ [DEBUG] Embed ${i + 1}:`);
        
        if (embed.image && embed.image.url) {
          this.debugLog(`   🖼️ [DEBUG] Embed image URL: ${embed.image.url}`);
          
          // Skip grid images
          if (embed.image.url.includes('_grid_')) {
            console.log('Found grid image in embed, but we want an upscaled version');
            this.debugLog(`⏭️ [DEBUG] Skipping grid image in embed: ${embed.image.url}`);
            return null;
          }
          
          if (embed.image.url.includes('_upscaled_') || 
              message.raw_message.content.includes('Upscaled')) {
            console.log('Found upscaled image in embed:', embed.image.url);
            this.debugLog(`✅ [DEBUG] Found upscaled image in embed: ${embed.image.url}`);
            return embed.image.url;
          }
        }
      }
    }
    
    this.debugLog(`❌ [DEBUG] No direct image URL found`);
    return null;
  }

  // Monitor for completed image in case of relax mode - WITH DEBUG
  async waitForCompletedImage(uniqueId) {
    this.debugLog(`\n⏳ [DEBUG] === WAITING FOR COMPLETED IMAGE (RELAX MODE) ===`);
    console.log(`Waiting for completed image with ID ${uniqueId} (relax mode)`);
    this.debugLog(`🆔 [DEBUG] Unique ID: ${uniqueId}`);
    this.debugLog(`🔄 [DEBUG] Max attempts: ${this.maxImagineAttempts}`);
    this.debugLog(`⏰ [DEBUG] Check interval: ${this.checkInterval}ms`);
    
    let attempts = 0;
    
    while (attempts < this.maxImagineAttempts) {
      try {
        // Add human-like delay
        if (attempts > 0) {
          await this.addHumanDelay('reading');
        }

        this.debugLog(`\n🔍 [DEBUG] === Relax Wait Attempt ${attempts + 1}/${this.maxImagineAttempts} ===`);
        
        // Add rate limiting
        await this.enforceRateLimit();
        
        const response = await this.client.get(`/channels/${this.channelId}/messages?limit=20`);
        const messages = response.data;
        
        this.debugLog(`📨 [DEBUG] Retrieved ${messages.length} messages`);
        
        for (const item of messages) {
          if (item.content.includes(uniqueId.toString())) {
            this.debugLog(`🎯 [DEBUG] Found message with unique ID: ${item.id}`);
            this.debugLog(`📄 [DEBUG] Content: ${item.content}`);
            
            // Skip progress messages
            if (item.content.includes('(Waiting to start)') || 
                item.content.includes('(Paused)') || 
                item.content.match(/\(\d+%\)/)) {
              const progressMatch = item.content.match(/\((\d+)%\)/);
              if (progressMatch) {
                console.log(`Still processing: ${progressMatch[1]}%`);
                this.debugLog(`📊 [DEBUG] Still processing: ${progressMatch[1]}%`);
              } else {
                this.debugLog(`⏳ [DEBUG] Still waiting or paused`);
              }
              continue;
            }
            
            // Found a message that isn't a progress update
            if (item.attachments && item.attachments.length > 0) {
              console.log('Found completed image with attachments');
              this.debugLog(`✅ [DEBUG] === RELAX MODE COMPLETION DETECTED ===`);
              this.debugLog(`🎉 [DEBUG] Found completed image with attachments`);
              this.debugLog(`📎 [DEBUG] Attachment count: ${item.attachments.length}`);
              return {
                id: item.id,
                raw_message: item
              };
            }
          }
        }
        
        // NEW: Adaptive check interval
        let currentCheckInterval;
        if (attempts < 5) {
          currentCheckInterval = this.getRandomInterval();
        } else if (attempts < 10) {
          currentCheckInterval = this.getRandomInterval() * 1.5;
        } else {
          currentCheckInterval = this.getRandomInterval() * 2;
        }
        
        this.debugLog(`⏳ [DEBUG] Waiting ${currentCheckInterval}ms before next attempt...`);
        await new Promise(resolve => setTimeout(resolve, currentCheckInterval));
        attempts++;
      } catch (error) {
        console.error('Error while waiting for completed image:', error.message);
        this.debugLog(`❌ [DEBUG] Error while waiting: ${error.message}`);
        await new Promise(resolve => setTimeout(resolve, this.checkInterval));
        attempts++;
      }
    }
    
    this.debugLog(`❌ [DEBUG] === RELAX MODE TIMEOUT ===`);
    this.debugLog(`❌ [DEBUG] Timed out after ${attempts} attempts`);
    throw new Error('Timed out waiting for completed image in relax mode');
  }

  // Find upscale button in message components - WITH DEBUG
  findUpscaleButton(message, index = null) {
    this.debugLog(`\n🔍 [DEBUG] === FINDING UPSCALE BUTTON ===`);
    this.debugLog(`🔢 [DEBUG] Requested index: ${index !== null ? index : 'any'}`);
    
    if (!message || !message.raw_message || !message.raw_message.components) {
      this.debugLog(`❌ [DEBUG] Invalid message or no components`);
      return null;
    }

    this.debugLog(`🔘 [DEBUG] Message has ${message.raw_message.components.length} component rows`);

    // Search through all components
    for (let rowIndex = 0; rowIndex < message.raw_message.components.length; rowIndex++) {
      const component = message.raw_message.components[rowIndex];
      this.debugLog(`🔘 [DEBUG] === Row ${rowIndex + 1} ===`);
      
      if (!component.components) {
        this.debugLog(`⚠️ [DEBUG] Row ${rowIndex + 1} has no components`);
        continue;
      }
      
      this.debugLog(`🔘 [DEBUG] Row ${rowIndex + 1} has ${component.components.length} buttons`);
      
      // For specified index (U1, U2, U3, U4)
      if (index !== null && component.components.length > index) {
        const button = component.components[index];
        this.debugLog(`🎯 [DEBUG] Checking specific button at index ${index}:`);
        this.debugLog(`   📝 [DEBUG] Label: ${button.label || 'No Label'}`);
        this.debugLog(`   🆔 [DEBUG] Custom ID: ${button.custom_id || 'No Custom ID'}`);
        
        if (button && button.custom_id && 
           (button.custom_id.includes('MJ::JOB::upsample') || 
            button.custom_id.includes('MJ::Upscale'))) {
          this.debugLog(`✅ [DEBUG] Found upscale button at specific index: ${button.custom_id}`);
          return button.custom_id;
        }
      }
      
      // Or search for any upscale button
      for (let btnIndex = 0; btnIndex < component.components.length; btnIndex++) {
        const button = component.components[btnIndex];
        this.debugLog(`🔘 [DEBUG] Button ${btnIndex + 1}:`);
        this.debugLog(`   📝 [DEBUG] Label: ${button.label || 'No Label'}`);
        this.debugLog(`   🆔 [DEBUG] Custom ID: ${button.custom_id || 'No Custom ID'}`);
        
        if (button && button.custom_id && 
           (button.custom_id.includes('MJ::JOB::upsample') || 
            button.custom_id.includes('MJ::Upscale'))) {
          this.debugLog(`✅ [DEBUG] Found upscale button: ${button.custom_id}`);
          return button.custom_id;
        }
      }
    }
    
    this.debugLog(`❌ [DEBUG] No upscale button found`);
    return null;
  }

  // Extract unique ID from message content - WITH DEBUG
  extractUniqueId(message) {
    this.debugLog(`\n🆔 [DEBUG] === EXTRACTING UNIQUE ID ===`);
    
    if (!message || !message.raw_message || !message.raw_message.content) {
      this.debugLog(`❌ [DEBUG] Invalid message or no content`);
      return null;
    }
    
    this.debugLog(`📄 [DEBUG] Message content: ${message.raw_message.content}`);
    
    const contentMatch = message.raw_message.content.match(/\d{13,}/);
    const uniqueId = contentMatch ? contentMatch[0] : null;
    
    this.debugLog(`🎯 [DEBUG] Extracted unique ID: ${uniqueId || 'None found'}`);
    return uniqueId;
  }

  /**
   * REPLACED: Enhanced createImage method with simplified flow (no upscaling)
   */
  async createImage(promptText, promptTags = '', upscaleIndex = null) {
    try {
      this.debugLog(`\n🚀 [DEBUG] Starting simplified image creation (no upscaling)`);
      console.log(`Generating image for prompt: ${promptText}`);
      
      // ADD: Initial human delay
      await this.addHumanDelay('thinking');
      
      const imagineResult = await this.imagine(promptText, promptTags);
      
      this.debugLog(`📨 [DEBUG] Imagine result received`);
      
      // Extract and save the grid
      const gridResult = await this.extractGridImages(imagineResult);
      
      const result = {
          imagine_message_id: imagineResult.id,
          raw_message: imagineResult.raw_message,
          grid_info: gridResult,
          options: []
      };
      
      if (gridResult) {
          console.log('Successfully extracted grid image');
          this.debugLog(`✅ [DEBUG] Grid image extracted successfully`);
          
          // Return the grid as the final result (no upscaling)
          result.upscaled_photo_url = gridResult.grid_url;
          result.note = "Grid image (4 variations) - users can select/crop as needed";
          
          // Still provide options info for UI
          if (gridResult.options) {
              result.options = gridResult.options.map(opt => ({
                  index: opt.index,
                  label: opt.label || `Option ${opt.index + 1}`
              }));
          }
      } else {
          // Fallback to first attachment
          if (imagineResult.raw_message.attachments && imagineResult.raw_message.attachments.length > 0) {
              const fallbackUrl = imagineResult.raw_message.attachments[0].url;
              result.upscaled_photo_url = fallbackUrl;
              result.note = "Image generated successfully";
          }
      }
      
      this.debugLog(`✅ [DEBUG] Image creation completed (simplified flow)`);
      return result;
      
    } catch (error) {
        console.error('Image creation failed:', error.message);
        this.debugLog(`❌ [DEBUG] === ENHANCED CREATE IMAGE FAILED ===`);
        this.debugLog(`❌ [DEBUG] Error: ${error.message}`);
        
        // Provide enhanced error context
        const errorType = this.detectErrorType(error.message);
        if (errorType.type === 'CONCURRENT_LIMIT') {
          error.message = `Unable to process image request: ${error.message}`;
          error.retryable = true;
          error.retryAfter = this.concurrentRetryDelay;
        }
        
        throw error;
    }
  }

  // Upscale one of the generated images - WITH DEBUG (simplified version)
  async upscale(message, upscaleIndex = null) {
    this.debugLog(`\n🔍 [DEBUG] === STARTING UPSCALE PROCESS ===`);
    
    if (!message || !message.raw_message) {
      this.debugLog(`❌ [DEBUG] Invalid message object for upscale`);
      throw new Error('Invalid message object for upscale');
    }

    this.debugLog(`📨 [DEBUG] Message ID: ${message.id}`);
    this.debugLog(`🔢 [DEBUG] Upscale index: ${upscaleIndex !== null ? upscaleIndex : 'random'}`);
    this.debugLog(`⏳ [DEBUG] In progress: ${!!message.in_progress}`);

    // Add human-like delay
    await this.addHumanDelay('thinking');

    // If the message indicates it's still in progress (relax mode)
    if (message.in_progress) {
      console.log('Image is still being processed (relax mode)');
      this.debugLog(`🐌 [DEBUG] Image still in progress - waiting for completion`);
      
      const uniqueId = this.extractUniqueId(message);
      
      if (!uniqueId) {
        this.debugLog(`❌ [DEBUG] Could not extract unique ID from in-progress message`);
        throw new Error('Could not extract unique ID from in-progress message');
      }
      
      // Wait for the complete image
      console.log('Waiting for image generation to complete...');
      this.debugLog(`⏳ [DEBUG] Waiting for image generation to complete...`);
      message = await this.waitForCompletedImage(uniqueId);
    }

    console.log('Attempting to upscale image...');
    
    // If no upscale index provided, choose randomly
    if (upscaleIndex === null) {
      upscaleIndex = Math.floor(Math.random() * 4);
      this.debugLog(`🎲 [DEBUG] Randomly selected upscale index: ${upscaleIndex}`);
    }

    if (upscaleIndex < 0 || upscaleIndex > 3) {
      this.debugLog(`❌ [DEBUG] Invalid upscale index: ${upscaleIndex} (must be 0-3)`);
      throw new Error('Upscale index must be between 0 and 3');
    }

    try {
      // First check if we already have the final image
      this.debugLog(`🔍 [DEBUG] Checking for direct image URL first...`);
      const directImageUrl = await this.getDirectImageUrl(message);
      if (directImageUrl) {
        console.log('Image is already in final form, no need to upscale');
        this.debugLog(`✅ [DEBUG] Image already in final form: ${directImageUrl}`);
        return directImageUrl;
      }
      
      // Find the upscale button
      this.debugLog(`🔍 [DEBUG] Looking for upscale button at index ${upscaleIndex}...`);
      let upscaleHash = this.findUpscaleButton(message, upscaleIndex);
      
      if (!upscaleHash) {
        this.debugLog(`❌ [DEBUG] No upscale buttons found in message`);
        throw new Error('No upscale buttons found in message');
      }

      console.log(`Using upscale hash: ${upscaleHash}`);
      this.debugLog(`🎯 [DEBUG] Using upscale hash: ${upscaleHash}`);

      // Add human-like typing delay
      await this.addHumanDelay('typing');

      // Add rate limiting
      await this.enforceRateLimit();

      // Submit the upscale request
      const params = {
        type: 3,
        guild_id: this.guildId,
        channel_id: this.channelId,
        message_flags: 0,
        message_id: message.id,
        application_id: this.applicationId,
        session_id: this.sessionId,
        data: {
          component_type: 2,
          custom_id: upscaleHash
        }
      };

      this.debugLog(`📤 [DEBUG] Submitting upscale request...`);
      this.debugLog(`📤 [DEBUG] Upscale params:`, JSON.stringify(params, null, 2));

      await this.client.post('/interactions', params);
      console.log('Upscale request submitted successfully');
      this.debugLog(`✅ [DEBUG] Upscale request submitted successfully`);
      
      // Wait for the upscaled image
      console.log('Waiting for upscaled image...');
      this.debugLog(`⏳ [DEBUG] Waiting for upscaled image...`);
      return await this.checkUpscale(message, upscaleIndex);
    } catch (error) {
      console.error('Upscale error:', error.message);
      this.debugLog(`❌ [DEBUG] === UPSCALE PROCESS FAILED ===`);
      this.debugLog(`❌ [DEBUG] Error: ${error.message}`);
      if (error.response) {
        console.error('Response status:', error.response.status);
        console.error('Response data:', error.response.data);
        this.debugLog(`❌ [DEBUG] Response status: ${error.response.status}`);
        this.debugLog(`❌ [DEBUG] Response data:`, error.response.data);
      }
      throw error;
    }
  }

  // Add method to check current queue status
  async checkQueueStatus() {
    try {
      this.debugLog('🔍 [DEBUG] Checking Midjourney queue status...');
      
      // Add human-like delay
      await this.addHumanDelay('reading');
      
      // Add rate limiting
      await this.enforceRateLimit();
      
      const response = await this.client.get(`/channels/${this.channelId}/messages?limit=10`);
      const messages = response.data;
      
      let queueMessages = [];
      let processingMessages = [];
      
      for (const message of messages) {
        const content = message.content.toLowerCase();
        
        // Look for queue-related messages
        if (content.includes('queue') || content.includes('waiting') || content.includes('processing')) {
          if (content.includes('queue') && content.includes('full')) {
            queueMessages.push(message);
          } else if (content.includes('processing') || content.includes('%')) {
            processingMessages.push(message);
          }
        }
      }
      
      return {
        queueFull: queueMessages.length > 0,
        activeJobs: processingMessages.length,
        lastChecked: new Date().toISOString()
      };
      
    } catch (error) {
      this.debugLog(`❌ [DEBUG] Error checking queue status: ${error.message}`);
      return {
        queueFull: false,
        activeJobs: 0,
        error: error.message,
        lastChecked: new Date().toISOString()
      };
    }
  }

  // Test method to debug Discord interactions
  async testDiscordMessages() {
    try {
      console.log('🧪 Testing Discord message retrieval...');
      
      // Ensure initialized
      if (!this.userId || !this.guildId) {
        await this.initialize();
      }
      
      // Add human-like delay
      await this.addHumanDelay('reading');
      
      // Add rate limiting
      await this.enforceRateLimit();
      
      // Get recent messages
      const response = await this.client.get(`/channels/${this.channelId}/messages?limit=10`);
      const messages = response.data;
      
      console.log(`📨 Retrieved ${messages.length} recent messages:`);
      for (let i = 0; i < messages.length; i++) {
        const msg = messages[i];
        console.log(`\n--- Message ${i + 1} ---`);
        console.log(`ID: ${msg.id}`);
        console.log(`Author: ${msg.author?.username || 'Unknown'} (${msg.author?.id})`);
        console.log(`Content: "${msg.content.substring(0, 150)}${msg.content.length > 150 ? '...' : ''}"`);
        console.log(`Attachments: ${msg.attachments?.length || 0}`);
        console.log(`Components: ${msg.components?.length || 0}`);
        console.log(`Timestamp: ${msg.timestamp}`);
        
        if (msg.attachments && msg.attachments.length > 0) {
          console.log(`First attachment URL: ${msg.attachments[0].url}`);
        }
      }
      
      return { success: true, messageCount: messages.length };
    } catch (error) {
      console.error('❌ Test failed:', error.message);
      return { success: false, error: error.message };
    }
  }
}

// Export singleton with enhanced functionality - FINAL INTEGRATED VERSION
let instance = null;

module.exports = {
  getInstance: (discordSettings = null) => {
    // ALWAYS reset instance if we have new Discord settings
    if (discordSettings && discordSettings.discordChannelId && discordSettings.discordUserToken) {
      console.log('🔄 Resetting Midjourney client instance due to new Discord settings');
      instance = null;
    }
    
    if (!instance) {
      let channelId, userToken;
      let settingsSource = 'unknown';
      
      // PRIORITY 1: Settings passed as parameter (from database/image generation)
      if (discordSettings && discordSettings.discordChannelId && discordSettings.discordUserToken) {
        channelId = discordSettings.discordChannelId;
        userToken = discordSettings.discordUserToken;
        settingsSource = 'parameter (database)';
        console.log('✅ Using Discord settings from parameter (PRIORITY 1)');
      } else {
        // PRIORITY 2: Try global helper function
        if (global.getCurrentDiscordSettings) {
          try {
            const globalSettings = global.getCurrentDiscordSettings();
            if (globalSettings && globalSettings.discordChannelId && globalSettings.discordUserToken) {
              channelId = globalSettings.discordChannelId;
              userToken = globalSettings.discordUserToken;
              settingsSource = 'global helper (files/database)';
              console.log('✅ Using Discord settings from global helper (PRIORITY 2)');
            }
          } catch (error) {
            console.warn('⚠️ Could not get settings from global helper:', error.message);
          }
        }
        
        // PRIORITY 3: Environment variables as final fallback
        if (!channelId || !userToken) {
          channelId = process.env.DISCORD_CHANNEL_ID;
          userToken = process.env.DISCORD_USER_TOKEN;
          
          if (channelId && userToken) {
            settingsSource = 'environment variables';
            console.log('⚠️ FALLBACK: Using Discord settings from environment variables (PRIORITY 3)');
            console.log('💡 Recommend configuring Discord settings in your settings page at /settings');
          }
        }
      }
      
      if (!channelId || !userToken) {
        const errorMsg = [
          'Discord settings not configured for Midjourney integration.',
          '',
          'Please configure Discord settings in one of these ways:',
          '1. 🎯 RECOMMENDED: Go to /settings page and enter Discord Channel ID and User Token',
          '2. 🔧 ALTERNATIVE: Set DISCORD_CHANNEL_ID and DISCORD_USER_TOKEN in your .env file',
          '',
          'Current status:',
          `- Channel ID: ${channelId ? 'SET' : 'NOT SET'}`,
          `- User Token: ${userToken ? 'SET' : 'NOT SET'}`,
          `- Settings source attempted: ${settingsSource}`
        ].join('\n');
        
        throw new Error(errorMsg);
      }
      
      const relaxMode = process.env.MIDJOURNEY_RELAX_MODE === 'true' || true;
      
      console.log('🚀 Creating new Enhanced MidjourneyClient instance...');
      console.log(`📊 Settings summary:`);
      console.log(`   📢 Channel ID: ${channelId.substring(0, 8)}...`);
      console.log(`   🔐 Token: ${userToken.substring(0, 10)}...`);
      console.log(`   📍 Source: ${settingsSource}`);
      console.log(`   🐌 Relax mode: ${relaxMode}`);
      
      instance = new MidjourneyClient(channelId, userToken, relaxMode, true);
    }
    return instance;
  },
  
  resetInstance: () => {
    instance = null;
    console.log('🔄 Enhanced Midjourney client instance reset');
  },
  
  // Force recreation with new settings
  recreateWithSettings: (discordSettings) => {
    console.log('🔄 Force recreating Midjourney client with new settings');
    instance = null;
    return module.exports.getInstance(discordSettings);
  },
  
  // Helper to check if client can be created
  canInitialize: () => {
    try {
      // Test if we can get settings without actually creating the client
      if (global.getCurrentDiscordSettings) {
        const settings = global.getCurrentDiscordSettings();
        if (settings && settings.discordChannelId && settings.discordUserToken) {
          return { canInit: true, source: 'global helper' };
        }
      }
      
      const envChannelId = process.env.DISCORD_CHANNEL_ID;
      const envUserToken = process.env.DISCORD_USER_TOKEN;
      if (envChannelId && envUserToken) {
        return { canInit: true, source: 'environment variables' };
      }
      
      return { canInit: false, reason: 'No Discord settings found' };
    } catch (error) {
      return { canInit: false, reason: error.message };
    }
  },

    // NEW: factory qui n'utilise PAS le singleton (sécurise le multi-utilisateur/concurrence)
  newClient: (discordSettings = null) => {
    let channelId, userToken;
    if (discordSettings?.discordChannelId && discordSettings?.discordUserToken) {
      channelId = discordSettings.discordChannelId;
      userToken = discordSettings.discordUserToken;
    } else if (global.getCurrentDiscordSettings) {
      const s = global.getCurrentDiscordSettings();
      channelId = s?.discordChannelId;
      userToken = s?.discordUserToken;
    } else {
      channelId = process.env.DISCORD_CHANNEL_ID;
      userToken = process.env.DISCORD_USER_TOKEN;
    }

    if (!channelId || !userToken) {
      throw new Error('Discord settings missing for Midjourney client creation (newClient).');
    }

    const relaxMode = process.env.MIDJOURNEY_RELAX_MODE === 'true' || true;
    return new MidjourneyClient(channelId, userToken, relaxMode, true);
  }

};