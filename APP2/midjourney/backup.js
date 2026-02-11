const axios = require('axios');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

class MidjourneyClient {
  constructor(channelId, userToken, relaxMode = false, debugMode = true) {
    this.channelId = channelId;
    this.userToken = userToken;
    this.apiUrl = 'https://discord.com/api/v10';
    this.applicationId = '936929561302675456'; // Midjourney application ID
    this.relaxMode = relaxMode;
    this.debugMode = debugMode; // Add debug mode flag
    
    // Adjust timeouts based on mode
    this.checkInterval = relaxMode ? 15000 : 8000; // 15 seconds for relax mode
    this.maxImagineAttempts = relaxMode ? 120 : 60; // 30 minutes for relax mode
    this.maxUpscaleAttempts = relaxMode ? 60 : 40;  // 15 minutes for relax mode
    
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
      console.log(`🎉 [DEBUG] MidjourneyClient initialized with debug mode enabled`);
      console.log(`📢 [DEBUG] Channel ID: ${this.channelId}`);
      console.log(`⚡ [DEBUG] Relax mode: ${this.relaxMode}`);
      console.log(`⏰ [DEBUG] Check interval: ${this.checkInterval}ms`);
      console.log(`🔄 [DEBUG] Max imagine attempts: ${this.maxImagineAttempts}`);
      console.log(`🔄 [DEBUG] Max upscale attempts: ${this.maxUpscaleAttempts}`);
      console.log(`📁 [DEBUG] Image directory: ${this.imageDir}`);
    }
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
      this.debugLog('🚀 [DEBUG] === STARTING INITIALIZATION ===');
      console.log('Initializing Midjourney client...');
      
      // Get Guild ID
      this.debugLog('🏢 [DEBUG] Fetching Guild ID from channel...');
      const channelResponse = await this.client.get(`/channels/${this.channelId}`);
      this.guildId = channelResponse.data.guild_id;
      console.log(`Guild ID: ${this.guildId}`);
      this.debugLog(`✅ [DEBUG] Guild ID retrieved: ${this.guildId}`);

      // Get User ID
      this.debugLog('👤 [DEBUG] Fetching User ID...');
      const userResponse = await this.client.get('/users/@me');
      this.userId = userResponse.data.id;
      console.log(`User ID: ${this.userId}`);
      this.debugLog(`✅ [DEBUG] User ID retrieved: ${this.userId}`);

      // Get application command data
      this.debugLog('⚙️ [DEBUG] Fetching application commands...');
      const commandsResponse = await this.client.get(`/applications/${this.applicationId}/commands`);
      
      if (commandsResponse.data && commandsResponse.data.length > 0) {
        this.debugLog(`📋 [DEBUG] Found ${commandsResponse.data.length} commands`);
        
        // Find the "imagine" command
        const imagineCommand = commandsResponse.data.find(cmd => cmd.name === 'imagine');
        if (imagineCommand) {
          this.dataId = imagineCommand.id;
          this.dataVersion = imagineCommand.version;
          this.debugLog(`🎯 [DEBUG] Found imagine command - ID: ${this.dataId}, Version: ${this.dataVersion}`);
        } else {
          this.dataId = commandsResponse.data[0].id;
          this.dataVersion = commandsResponse.data[0].version;
          this.debugLog(`⚠️ [DEBUG] Imagine command not found, using first command - ID: ${this.dataId}, Version: ${this.dataVersion}`);
        }
        console.log(`Command ID: ${this.dataId}, Version: ${this.dataVersion}`);
      } else {
        // Fallback to known values if API doesn't return expected data
        this.dataId = '938956540159881230';
        this.dataVersion = '1237876415471554623';
        console.log('Using fallback command data');
        this.debugLog('⚠️ [DEBUG] No commands returned, using fallback values');
      }

      if (this.relaxMode) {
        console.log('Running in RELAX MODE - expect longer processing times');
        this.debugLog('🐌 [DEBUG] RELAX MODE activated - extended timeouts enabled');
      }

      console.log('Midjourney client initialized successfully');
      this.debugLog('✅ [DEBUG] === INITIALIZATION COMPLETED SUCCESSFULLY ===');
      return true;
    } catch (error) {
      console.error('Initialization error:', error.message);
      this.debugLog('❌ [DEBUG] === INITIALIZATION FAILED ===');
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

  // Submit a prompt to Midjourney - WITH DEBUG (UPDATED TO PASS PROMPT TEXT)
  async imagine(promptText, promptTags = '') {
    try {
      this.debugLog(`\n🚀 [DEBUG] === STARTING IMAGINE PROCESS ===`);
      
      // Ensure client is initialized
      if (!this.guildId || !this.userId) {
        this.debugLog(`🔄 [DEBUG] Client not initialized, initializing...`);
        await this.initialize();
      }

      // Create a unique ID to identify this generation
      const uniqueId = Date.now() - Math.floor(Math.random() * 1000);
      const prompt = `${promptText} ${uniqueId} ${promptTags}`;
      
      // Store original prompt text for fallback
      const originalPromptText = promptText;
      
      this.debugLog(`🎯 [DEBUG] Generated unique ID: ${uniqueId}`);
      this.debugLog(`📝 [DEBUG] Original prompt: ${promptText}`);
      this.debugLog(`🏷️ [DEBUG] Prompt tags: ${promptTags}`);
      this.debugLog(`📝 [DEBUG] Full prompt: ${prompt}`);
      this.debugLog(`📏 [DEBUG] Prompt length: ${prompt.length} characters`);
      this.debugLog(`⚙️ [DEBUG] Using application ID: ${this.applicationId}`);
      this.debugLog(`🏢 [DEBUG] Using guild ID: ${this.guildId}`);
      this.debugLog(`📢 [DEBUG] Using channel ID: ${this.channelId}`);
      
      console.log(`Submitting prompt with unique ID ${uniqueId}`);

      // Submit the prompt
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

      this.debugLog(`📤 [DEBUG] Submitting interaction to Discord...`);
      this.debugLog(`📤 [DEBUG] Interaction params:`, JSON.stringify(params, null, 2));

      const response = await this.client.post('/interactions', params);
      console.log('Prompt submitted successfully');
      
      this.debugLog(`✅ [DEBUG] Discord response status: ${response.status} ${response.statusText}`);
      this.debugLog(`✅ [DEBUG] Discord response data:`, response.data);
      this.debugLog(`✅ [DEBUG] Prompt submitted successfully`);
      
      // Wait for initial processing
      console.log('Waiting for initial processing...');
      this.debugLog(`⏳ [DEBUG] Waiting for initial processing (${this.checkInterval}ms)...`);
      await new Promise(resolve => setTimeout(resolve, this.checkInterval));
      
      // Fetch the generated images - NOW PASSING ORIGINAL PROMPT TEXT
      console.log('Checking for generated images...');
      this.debugLog(`🔍 [DEBUG] Starting image detection process...`);
      const imagineMessage = await this.checkImagine(uniqueId, originalPromptText);
      
      this.debugLog(`🎊 [DEBUG] === IMAGINE PROCESS COMPLETED ===`);
      this.debugLog(`🎊 [DEBUG] Returned message ID: ${imagineMessage.id}`);
      this.debugLog(`🎊 [DEBUG] In progress: ${!!imagineMessage.in_progress}`);
      
      return imagineMessage;
    } catch (error) {
      console.error('Imagine error:', error.message);
      this.debugLog(`💥 [DEBUG] *** IMAGINE PROCESS FAILED ***`);
      this.debugLog(`💥 [DEBUG] Error: ${error.message}`);
      if (error.response) {
        console.error('Response status:', error.response.status);
        console.error('Response data:', error.response.data);
        this.debugLog(`💥 [DEBUG] Response status: ${error.response.status}`);
        this.debugLog(`💥 [DEBUG] Response data:`, error.response.data);
      }
      this.debugLog(`💥 [DEBUG] Stack trace:`, error.stack);
      throw error;
    }
  }

// Check for the generated image message - WITH DEBUG (FIXED VERSION WITH PROMPT FALLBACK)
  async checkImagine(uniqueId, originalPromptText = '') {
    let attempts = 0;
    let imagineMessage = null;
    let progressMessage = null;
    let lastProgressPercent = 0;
    const startTime = Date.now();

    this.debugLog(`🔍 [DEBUG] Looking for image with unique ID: ${uniqueId}`);
    this.debugLog(`📝 [DEBUG] Original prompt text for fallback: ${originalPromptText}`);
    this.debugLog(`👤 [DEBUG] My User ID: ${this.userId}`);
    this.debugLog(`⚡ [DEBUG] Relax mode: ${this.relaxMode}`);
    this.debugLog(`⏰ [DEBUG] Check interval: ${this.checkInterval}ms`);
    this.debugLog(`🔄 [DEBUG] Max attempts: ${this.maxImagineAttempts}`);
    
    console.log(`Looking for image with unique ID: ${uniqueId}`);
    
    // For fallback, we'll search for the exact prompt text or a significant portion of it
    const promptTextForSearch = originalPromptText.trim();
    const promptPreview = promptTextForSearch.substring(0, 100); // First 100 chars for matching
    
    this.debugLog(`🔍 [DEBUG] Exact prompt text for fallback: "${promptTextForSearch}"`);
    this.debugLog(`🔍 [DEBUG] Prompt preview for matching: "${promptPreview}"`);
    
    while (!imagineMessage && attempts < this.maxImagineAttempts) {
      try {
        this.debugLog(`\n🔍 [DEBUG] === Attempt ${attempts + 1}/${this.maxImagineAttempts} ===`);
        console.log(`Checking for images (attempt ${attempts + 1}/${this.maxImagineAttempts})...`);
        const response = await this.client.get(`/channels/${this.channelId}/messages?limit=20`);
        const messages = response.data;
        
        this.debugLog(`📨 [DEBUG] Retrieved ${messages.length} messages from Discord`);

        // First try: Look for messages with unique ID (original method)
        let foundAnyWithId = false;
        messages.forEach((msg, index) => {
          if (msg.content.includes(uniqueId.toString())) {
            foundAnyWithId = true;
            this.debugLog(`\n📝 [DEBUG] === Message ${index + 1} with unique ID ===`);
            this.debugLog(`🆔 [DEBUG] Message ID: ${msg.id}`);
            this.debugLog(`📄 [DEBUG] Content: ${msg.content}`);
            this.debugLog(`👤 [DEBUG] Contains user mention (<@${this.userId}>): ${msg.content.includes(`<@${this.userId}>`)}`);
            this.debugLog(`⏳ [DEBUG] Contains "Waiting to start": ${msg.content.includes('(Waiting to start)')}`);
            this.debugLog(`⏸️ [DEBUG] Contains "Paused": ${msg.content.includes('(Paused)')}`);
            this.debugLog(`📊 [DEBUG] Contains percentage: ${!!msg.content.match(/\(\d+%\)/)}`);
            this.debugLog(`📎 [DEBUG] Has attachments: ${!!(msg.attachments && msg.attachments.length > 0)}`);
            this.debugLog(`🔘 [DEBUG] Has components: ${!!(msg.components && msg.components.length > 0)}`);
          }
        });
        
        // FIRST PASS: Check messages with unique ID
        for (const item of messages) {
          if (item.content.includes(uniqueId.toString())) {
            // Check if message is recent (within last 10 minutes)
            const messageTime = new Date(item.timestamp).getTime();
            const now = Date.now();
            const messageAge = now - messageTime;
            const maxAge = 10 * 60 * 1000; // 10 minutes in milliseconds
            
            this.debugLog(`⏰ [DEBUG] Message timestamp: ${item.timestamp}`);
            this.debugLog(`⏰ [DEBUG] Message age: ${Math.round(messageAge / 1000)} seconds`);
            this.debugLog(`⏰ [DEBUG] Max allowed age: ${Math.round(maxAge / 1000)} seconds`);
            this.debugLog(`⏰ [DEBUG] Message is recent: ${messageAge <= maxAge}`);
            
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
                this.debugLog(`📈 [DEBUG] Progress update: ${percent}% (was ${lastProgressPercent}%)`);
                lastProgressPercent = percent;
                progressMessage = item;
              }
            }
            
            // Check if it's a completed message with the final images
            this.debugLog(`\n🧪 [DEBUG] === Testing completion conditions for message ${item.id} (UNIQUE ID METHOD) ===`);
            
            const hasUserMention = item.content.includes(`<@${this.userId}>`);
            const notWaitingToStart = !item.content.includes('(Waiting to start)');
            const notPaused = !item.content.includes('(Paused)');
            const hasAttachments = item.attachments && item.attachments.length > 0;
            const hasComponents = item.components && item.components.length > 0;
            
            // NEW: Check that it's not still processing (no percentage indicators)
            const notProcessing = !item.content.match(/\(\d+%\)/);
            const notRelaxedProcessing = !item.content.includes('(relaxed)') || !item.content.match(/\(\d+%\)/);
            
            this.debugLog(`   ✅ [DEBUG] Has user mention: ${hasUserMention}`);
            this.debugLog(`   ✅ [DEBUG] Not waiting to start: ${notWaitingToStart}`);
            this.debugLog(`   ✅ [DEBUG] Not paused: ${notPaused}`);
            this.debugLog(`   ✅ [DEBUG] Has attachments: ${hasAttachments}`);
            this.debugLog(`   ✅ [DEBUG] Has components: ${hasComponents}`);
            this.debugLog(`   ✅ [DEBUG] Not processing (no %): ${notProcessing}`);
            this.debugLog(`   ✅ [DEBUG] Not in relaxed processing: ${notRelaxedProcessing}`);
            this.debugLog(`   ✅ [DEBUG] Has attachments OR components: ${hasAttachments || hasComponents}`);
            
            const allConditionsMet = hasUserMention && 
                                    notWaitingToStart &&
                                    notPaused &&
                                    notProcessing &&
                                    (hasAttachments || hasComponents);
            
            this.debugLog(`   🎯 [DEBUG] ALL CONDITIONS MET: ${allConditionsMet}`);
            
            if (allConditionsMet) {
              console.log('Found completed message with images! (Unique ID method)');
              this.debugLog(`🎉 [DEBUG] *** COMPLETION DETECTED (UNIQUE ID METHOD)! ***`);
              this.debugLog(`🎉 [DEBUG] Found completed message with images!`);
              this.debugLog(`🎉 [DEBUG] Message ID: ${item.id}`);
              this.debugLog(`🎉 [DEBUG] Total time elapsed: ${Date.now() - startTime}ms`);
              this.debugLog(`🎉 [DEBUG] Attempts taken: ${attempts + 1}`);
              
              return {
                id: item.id,
                raw_message: item
              };
            } else {
              this.debugLog(`⏭️ [DEBUG] Conditions not met, continuing search...`);
            }
          }
        }

        // SECOND PASS: If unique ID method failed, try exact prompt text fallback
        if (!foundAnyWithId && promptTextForSearch.length > 0) {
          this.debugLog(`🔄 [DEBUG] === UNIQUE ID NOT FOUND - TRYING EXACT PROMPT TEXT FALLBACK ===`);
          console.log('Unique ID not found, trying exact prompt text fallback...');
          
          for (const item of messages) {
            // Check if message contains the exact prompt text or a significant portion of it
            const messageContent = item.content;
            
            // Try exact match first
            const hasExactMatch = messageContent.includes(promptTextForSearch);
            
            // Try partial match (first 100 characters) if exact fails
            const hasPartialMatch = messageContent.includes(promptPreview);
            
            // Try even more flexible match (first 80 characters, case insensitive)
            const flexiblePrompt = promptPreview.substring(0, 80).toLowerCase();
            const messageContentLower = messageContent.toLowerCase();
            const hasFlexibleMatch = messageContentLower.includes(flexiblePrompt);
            
            const hasGoodMatch = hasExactMatch || hasPartialMatch || hasFlexibleMatch;
            
            this.debugLog(`\n🔍 [DEBUG] === Checking message ${item.id} for prompt text match ===`);
            this.debugLog(`📄 [DEBUG] Content preview: ${item.content.substring(0, 100)}...`);
            this.debugLog(`🎯 [DEBUG] Exact match: ${hasExactMatch}`);
            this.debugLog(`📝 [DEBUG] Partial match (100 chars): ${hasPartialMatch}`);
            this.debugLog(`🔍 [DEBUG] Flexible match (80 chars): ${hasFlexibleMatch}`);
            this.debugLog(`✅ [DEBUG] Has good match: ${hasGoodMatch}`);
            
            if (hasGoodMatch) {
              // Check if message is recent (within last 10 minutes)
              const messageTime = new Date(item.timestamp).getTime();
              const now = Date.now();
              const messageAge = now - messageTime;
              const maxAge = 10 * 60 * 1000; // 10 minutes in milliseconds
              
              this.debugLog(`⏰ [DEBUG] Message timestamp: ${item.timestamp}`);
              this.debugLog(`⏰ [DEBUG] Message age: ${Math.round(messageAge / 1000)} seconds`);
              this.debugLog(`⏰ [DEBUG] Message is recent: ${messageAge <= maxAge}`);
              
              if (messageAge > maxAge) {
                this.debugLog(`⏰ [DEBUG] Skipping old message (${Math.round(messageAge / 60000)} minutes old)`);
                continue;
              }
              
              // Check if it's a progress message
              const progressMatch = item.content.match(/\((\d+)%\)/);
              if (progressMatch) {
                const percent = parseInt(progressMatch[1]);
                if (percent > lastProgressPercent) {
                  console.log(`Image generation progress: ${percent}% (via prompt fallback)`);
                  this.debugLog(`📈 [DEBUG] Progress update via fallback: ${percent}% (was ${lastProgressPercent}%)`);
                  lastProgressPercent = percent;
                  progressMessage = item;
                }
              }
              
              // Check if it's a completed message
              this.debugLog(`\n🧪 [DEBUG] === Testing completion conditions for message ${item.id} (PROMPT FALLBACK METHOD) ===`);
              
              const hasUserMention = item.content.includes(`<@${this.userId}>`);
              const notWaitingToStart = !item.content.includes('(Waiting to start)');
              const notPaused = !item.content.includes('(Paused)');
              const hasAttachments = item.attachments && item.attachments.length > 0;
              const hasComponents = item.components && item.components.length > 0;
              
              // NEW: Check that it's not still processing (no percentage indicators)
              const notProcessing = !item.content.match(/\(\d+%\)/);
              const notRelaxedProcessing = !item.content.includes('(relaxed)') || !item.content.match(/\(\d+%\)/);
              
              this.debugLog(`   ✅ [DEBUG] Has user mention: ${hasUserMention}`);
              this.debugLog(`   ✅ [DEBUG] Not waiting to start: ${notWaitingToStart}`);
              this.debugLog(`   ✅ [DEBUG] Not paused: ${notPaused}`);
              this.debugLog(`   ✅ [DEBUG] Has attachments: ${hasAttachments}`);
              this.debugLog(`   ✅ [DEBUG] Has components: ${hasComponents}`);
              this.debugLog(`   ✅ [DEBUG] Not processing (no %): ${notProcessing}`);
              this.debugLog(`   ✅ [DEBUG] Not in relaxed processing: ${notRelaxedProcessing}`);
              this.debugLog(`   ✅ [DEBUG] Has attachments OR components: ${hasAttachments || hasComponents}`);
              
              const allConditionsMet = hasUserMention && 
                                      notWaitingToStart &&
                                      notPaused &&
                                      notProcessing &&
                                      (hasAttachments || hasComponents);
              
              this.debugLog(`   🎯 [DEBUG] ALL CONDITIONS MET: ${allConditionsMet}`);
              
              if (allConditionsMet) {
                console.log('Found completed message with images! (Prompt text fallback method)');
                this.debugLog(`🎉 [DEBUG] *** COMPLETION DETECTED (PROMPT TEXT FALLBACK METHOD)! ***`);
                this.debugLog(`🎉 [DEBUG] Found completed message with images via prompt text fallback!`);
                this.debugLog(`🎉 [DEBUG] Message ID: ${item.id}`);
                this.debugLog(`🎉 [DEBUG] Match type: ${hasExactMatch ? 'Exact' : hasPartialMatch ? 'Partial (100 chars)' : 'Flexible (80 chars)'}`);
                this.debugLog(`🎉 [DEBUG] Total time elapsed: ${Date.now() - startTime}ms`);
                this.debugLog(`🎉 [DEBUG] Attempts taken: ${attempts + 1}`);
                
                return {
                  id: item.id,
                  raw_message: item
                };
              } else {
                this.debugLog(`⏭️ [DEBUG] Conditions not met for prompt text match, continuing search...`);
              }
            }
          }
          
          this.debugLog(`⚠️ [DEBUG] No good prompt text matches found in this batch`);
        }
        
        if (!foundAnyWithId) {
          this.debugLog(`⚠️ [DEBUG] No messages found with unique ID ${uniqueId} in this batch`);
          this.debugLog(`🔍 [DEBUG] Sample message previews:`);
          messages.slice(0, 3).forEach((msg, i) => {
            this.debugLog(`   ${i + 1}: ${msg.content.substring(0, 80)}...`);
          });
        }

        // Wait and try again
        this.debugLog(`⏳ [DEBUG] Waiting ${this.checkInterval}ms before next attempt...`);
        await new Promise(resolve => setTimeout(resolve, this.checkInterval));
        attempts++;
      } catch (error) {
        console.error('Check imagine error:', error.message);
        this.debugLog(`❌ [DEBUG] Check imagine error: ${error.message}`);
        if (error.response) {
          console.error('Response status:', error.response.status);
          this.debugLog(`❌ [DEBUG] Response status: ${error.response.status}`);
          this.debugLog(`❌ [DEBUG] Response data:`, error.response.data);
        }
        await new Promise(resolve => setTimeout(resolve, this.checkInterval));
        attempts++;
      }
    }

    if (progressMessage) {
      console.log('Returning partial progress message as we reached timeout');
      this.debugLog(`⚠️ [DEBUG] Returning partial progress message as we reached timeout`);
      this.debugLog(`⚠️ [DEBUG] Last progress: ${lastProgressPercent}%`);
      this.debugLog(`⚠️ [DEBUG] Total time: ${Date.now() - startTime}ms`);
      return {
        id: progressMessage.id,
        raw_message: progressMessage,
        in_progress: true
      };
    }

    this.debugLog(`❌ [DEBUG] *** TIMEOUT REACHED ***`);
    this.debugLog(`❌ [DEBUG] Total attempts: ${attempts}`);
    this.debugLog(`❌ [DEBUG] Total time: ${Date.now() - startTime}ms`);
    this.debugLog(`❌ [DEBUG] Last progress: ${lastProgressPercent}%`);

    throw new Error('Failed to generate image after multiple attempts');
  }

  // Submit a prompt to Midjourney - WITH DEBUG (UPDATED TO PASS PROMPT TEXT)
  async imagine(promptText, promptTags = '') {
    try {
      this.debugLog(`\n🚀 [DEBUG] === STARTING IMAGINE PROCESS ===`);
      
      // Ensure client is initialized
      if (!this.guildId || !this.userId) {
        this.debugLog(`🔄 [DEBUG] Client not initialized, initializing...`);
        await this.initialize();
      }

      // Create a unique ID to identify this generation
      const uniqueId = Date.now() - Math.floor(Math.random() * 1000);
      const prompt = `${promptText} ${uniqueId} ${promptTags}`;
      
      // Store original prompt text for fallback
      const originalPromptText = promptText;
      
      this.debugLog(`🎯 [DEBUG] Generated unique ID: ${uniqueId}`);
      this.debugLog(`📝 [DEBUG] Original prompt: ${promptText}`);
      this.debugLog(`🏷️ [DEBUG] Prompt tags: ${promptTags}`);
      this.debugLog(`📝 [DEBUG] Full prompt: ${prompt}`);
      this.debugLog(`📏 [DEBUG] Prompt length: ${prompt.length} characters`);
      this.debugLog(`⚙️ [DEBUG] Using application ID: ${this.applicationId}`);
      this.debugLog(`🏢 [DEBUG] Using guild ID: ${this.guildId}`);
      this.debugLog(`📢 [DEBUG] Using channel ID: ${this.channelId}`);
      
      console.log(`Submitting prompt with unique ID ${uniqueId}`);

      // Submit the prompt
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

      this.debugLog(`📤 [DEBUG] Submitting interaction to Discord...`);
      this.debugLog(`📤 [DEBUG] Interaction params:`, JSON.stringify(params, null, 2));

      const response = await this.client.post('/interactions', params);
      console.log('Prompt submitted successfully');
      
      this.debugLog(`✅ [DEBUG] Discord response status: ${response.status} ${response.statusText}`);
      this.debugLog(`✅ [DEBUG] Discord response data:`, response.data);
      this.debugLog(`✅ [DEBUG] Prompt submitted successfully`);
      
      // Wait for initial processing
      console.log('Waiting for initial processing...');
      this.debugLog(`⏳ [DEBUG] Waiting for initial processing (${this.checkInterval}ms)...`);
      await new Promise(resolve => setTimeout(resolve, this.checkInterval));
      
      // Fetch the generated images - NOW PASSING ORIGINAL PROMPT TEXT
      console.log('Checking for generated images...');
      this.debugLog(`🔍 [DEBUG] Starting image detection process...`);
      const imagineMessage = await this.checkImagine(uniqueId, originalPromptText);
      
      this.debugLog(`🎊 [DEBUG] === IMAGINE PROCESS COMPLETED ===`);
      this.debugLog(`🎊 [DEBUG] Returned message ID: ${imagineMessage.id}`);
      this.debugLog(`🎊 [DEBUG] In progress: ${!!imagineMessage.in_progress}`);
      
      return imagineMessage;
    } catch (error) {
      console.error('Imagine error:', error.message);
      this.debugLog(`💥 [DEBUG] *** IMAGINE PROCESS FAILED ***`);
      this.debugLog(`💥 [DEBUG] Error: ${error.message}`);
      if (error.response) {
        console.error('Response status:', error.response.status);
        console.error('Response data:', error.response.data);
        this.debugLog(`💥 [DEBUG] Response status: ${error.response.status}`);
        this.debugLog(`💥 [DEBUG] Response data:`, error.response.data);
      }
      this.debugLog(`💥 [DEBUG] Stack trace:`, error.stack);
      throw error;
    }
  }

  // Submit a prompt to Midjourney - WITH DEBUG (UPDATED TO PASS PROMPT TEXT)
  async imagine(promptText, promptTags = '') {
    try {
      this.debugLog(`\n🚀 [DEBUG] === STARTING IMAGINE PROCESS ===`);
      
      // Ensure client is initialized
      if (!this.guildId || !this.userId) {
        this.debugLog(`🔄 [DEBUG] Client not initialized, initializing...`);
        await this.initialize();
      }

      // Create a unique ID to identify this generation
      const uniqueId = Date.now() - Math.floor(Math.random() * 1000);
      const prompt = `${promptText} ${uniqueId} ${promptTags}`;
      
      // Store original prompt text for fallback
      const originalPromptText = promptText;
      
      this.debugLog(`🎯 [DEBUG] Generated unique ID: ${uniqueId}`);
      this.debugLog(`📝 [DEBUG] Original prompt: ${promptText}`);
      this.debugLog(`🏷️ [DEBUG] Prompt tags: ${promptTags}`);
      this.debugLog(`📝 [DEBUG] Full prompt: ${prompt}`);
      this.debugLog(`📏 [DEBUG] Prompt length: ${prompt.length} characters`);
      this.debugLog(`⚙️ [DEBUG] Using application ID: ${this.applicationId}`);
      this.debugLog(`🏢 [DEBUG] Using guild ID: ${this.guildId}`);
      this.debugLog(`📢 [DEBUG] Using channel ID: ${this.channelId}`);
      
      console.log(`Submitting prompt with unique ID ${uniqueId}`);

      // Submit the prompt
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

      this.debugLog(`📤 [DEBUG] Submitting interaction to Discord...`);
      this.debugLog(`📤 [DEBUG] Interaction params:`, JSON.stringify(params, null, 2));

      const response = await this.client.post('/interactions', params);
      console.log('Prompt submitted successfully');
      
      this.debugLog(`✅ [DEBUG] Discord response status: ${response.status} ${response.statusText}`);
      this.debugLog(`✅ [DEBUG] Discord response data:`, response.data);
      this.debugLog(`✅ [DEBUG] Prompt submitted successfully`);
      
      // Wait for initial processing
      console.log('Waiting for initial processing...');
      this.debugLog(`⏳ [DEBUG] Waiting for initial processing (${this.checkInterval}ms)...`);
      await new Promise(resolve => setTimeout(resolve, this.checkInterval));
      
      // Fetch the generated images - NOW PASSING ORIGINAL PROMPT TEXT
      console.log('Checking for generated images...');
      this.debugLog(`🔍 [DEBUG] Starting image detection process...`);
      const imagineMessage = await this.checkImagine(uniqueId, originalPromptText);
      
      this.debugLog(`🎊 [DEBUG] === IMAGINE PROCESS COMPLETED ===`);
      this.debugLog(`🎊 [DEBUG] Returned message ID: ${imagineMessage.id}`);
      this.debugLog(`🎊 [DEBUG] In progress: ${!!imagineMessage.in_progress}`);
      
      return imagineMessage;
    } catch (error) {
      console.error('Imagine error:', error.message);
      this.debugLog(`💥 [DEBUG] *** IMAGINE PROCESS FAILED ***`);
      this.debugLog(`💥 [DEBUG] Error: ${error.message}`);
      if (error.response) {
        console.error('Response status:', error.response.status);
        console.error('Response data:', error.response.data);
        this.debugLog(`💥 [DEBUG] Response status: ${error.response.status}`);
        this.debugLog(`💥 [DEBUG] Response data:`, error.response.data);
      }
      this.debugLog(`💥 [DEBUG] Stack trace:`, error.stack);
      throw error;
    }
  }

  // Submit a prompt to Midjourney - WITH DEBUG (UPDATED TO PASS PROMPT TEXT)
  async imagine(promptText, promptTags = '') {
    try {
      this.debugLog(`\n🚀 [DEBUG] === STARTING IMAGINE PROCESS ===`);
      
      // Ensure client is initialized
      if (!this.guildId || !this.userId) {
        this.debugLog(`🔄 [DEBUG] Client not initialized, initializing...`);
        await this.initialize();
      }

      // Create a unique ID to identify this generation
      const uniqueId = Date.now() - Math.floor(Math.random() * 1000);
      const prompt = `${promptText} ${uniqueId} ${promptTags}`;
      
      // Store original prompt text for fallback
      const originalPromptText = promptText;
      
      this.debugLog(`🎯 [DEBUG] Generated unique ID: ${uniqueId}`);
      this.debugLog(`📝 [DEBUG] Original prompt: ${promptText}`);
      this.debugLog(`🏷️ [DEBUG] Prompt tags: ${promptTags}`);
      this.debugLog(`📝 [DEBUG] Full prompt: ${prompt}`);
      this.debugLog(`📏 [DEBUG] Prompt length: ${prompt.length} characters`);
      this.debugLog(`⚙️ [DEBUG] Using application ID: ${this.applicationId}`);
      this.debugLog(`🏢 [DEBUG] Using guild ID: ${this.guildId}`);
      this.debugLog(`📢 [DEBUG] Using channel ID: ${this.channelId}`);
      
      console.log(`Submitting prompt with unique ID ${uniqueId}`);

      // Submit the prompt
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

      this.debugLog(`📤 [DEBUG] Submitting interaction to Discord...`);
      this.debugLog(`📤 [DEBUG] Interaction params:`, JSON.stringify(params, null, 2));

      const response = await this.client.post('/interactions', params);
      console.log('Prompt submitted successfully');
      
      this.debugLog(`✅ [DEBUG] Discord response status: ${response.status} ${response.statusText}`);
      this.debugLog(`✅ [DEBUG] Discord response data:`, response.data);
      this.debugLog(`✅ [DEBUG] Prompt submitted successfully`);
      
      // Wait for initial processing
      console.log('Waiting for initial processing...');
      this.debugLog(`⏳ [DEBUG] Waiting for initial processing (${this.checkInterval}ms)...`);
      await new Promise(resolve => setTimeout(resolve, this.checkInterval));
      
      // Fetch the generated images - NOW PASSING ORIGINAL PROMPT TEXT
      console.log('Checking for generated images...');
      this.debugLog(`🔍 [DEBUG] Starting image detection process...`);
      const imagineMessage = await this.checkImagine(uniqueId, originalPromptText);
      
      this.debugLog(`🎊 [DEBUG] === IMAGINE PROCESS COMPLETED ===`);
      this.debugLog(`🎊 [DEBUG] Returned message ID: ${imagineMessage.id}`);
      this.debugLog(`🎊 [DEBUG] In progress: ${!!imagineMessage.in_progress}`);
      
      return imagineMessage;
    } catch (error) {
      console.error('Imagine error:', error.message);
      this.debugLog(`💥 [DEBUG] *** IMAGINE PROCESS FAILED ***`);
      this.debugLog(`💥 [DEBUG] Error: ${error.message}`);
      if (error.response) {
        console.error('Response status:', error.response.status);
        console.error('Response data:', error.response.data);
        this.debugLog(`💥 [DEBUG] Response status: ${error.response.status}`);
        this.debugLog(`💥 [DEBUG] Response data:`, error.response.data);
      }
      this.debugLog(`💥 [DEBUG] Stack trace:`, error.stack);
      throw error;
    }
  }

  // Submit a prompt to Midjourney - WITH DEBUG (UPDATED TO PASS PROMPT TEXT)
  async imagine(promptText, promptTags = '') {
    try {
      this.debugLog(`\n🚀 [DEBUG] === STARTING IMAGINE PROCESS ===`);
      
      // Ensure client is initialized
      if (!this.guildId || !this.userId) {
        this.debugLog(`🔄 [DEBUG] Client not initialized, initializing...`);
        await this.initialize();
      }

      // Create a unique ID to identify this generation
      const uniqueId = Date.now() - Math.floor(Math.random() * 1000);
      const prompt = `${promptText} ${uniqueId} ${promptTags}`;
      
      // Store original prompt text for fallback
      const originalPromptText = promptText;
      
      this.debugLog(`🎯 [DEBUG] Generated unique ID: ${uniqueId}`);
      this.debugLog(`📝 [DEBUG] Original prompt: ${promptText}`);
      this.debugLog(`🏷️ [DEBUG] Prompt tags: ${promptTags}`);
      this.debugLog(`📝 [DEBUG] Full prompt: ${prompt}`);
      this.debugLog(`📏 [DEBUG] Prompt length: ${prompt.length} characters`);
      this.debugLog(`⚙️ [DEBUG] Using application ID: ${this.applicationId}`);
      this.debugLog(`🏢 [DEBUG] Using guild ID: ${this.guildId}`);
      this.debugLog(`📢 [DEBUG] Using channel ID: ${this.channelId}`);
      
      console.log(`Submitting prompt with unique ID ${uniqueId}`);

      // Submit the prompt
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

      this.debugLog(`📤 [DEBUG] Submitting interaction to Discord...`);
      this.debugLog(`📤 [DEBUG] Interaction params:`, JSON.stringify(params, null, 2));

      const response = await this.client.post('/interactions', params);
      console.log('Prompt submitted successfully');
      
      this.debugLog(`✅ [DEBUG] Discord response status: ${response.status} ${response.statusText}`);
      this.debugLog(`✅ [DEBUG] Discord response data:`, response.data);
      this.debugLog(`✅ [DEBUG] Prompt submitted successfully`);
      
      // Wait for initial processing
      console.log('Waiting for initial processing...');
      this.debugLog(`⏳ [DEBUG] Waiting for initial processing (${this.checkInterval}ms)...`);
      await new Promise(resolve => setTimeout(resolve, this.checkInterval));
      
      // Fetch the generated images - NOW PASSING ORIGINAL PROMPT TEXT
      console.log('Checking for generated images...');
      this.debugLog(`🔍 [DEBUG] Starting image detection process...`);
      const imagineMessage = await this.checkImagine(uniqueId, originalPromptText);
      
      this.debugLog(`🎊 [DEBUG] === IMAGINE PROCESS COMPLETED ===`);
      this.debugLog(`🎊 [DEBUG] Returned message ID: ${imagineMessage.id}`);
      this.debugLog(`🎊 [DEBUG] In progress: ${!!imagineMessage.in_progress}`);
      
      return imagineMessage;
    } catch (error) {
      console.error('Imagine error:', error.message);
      this.debugLog(`💥 [DEBUG] *** IMAGINE PROCESS FAILED ***`);
      this.debugLog(`💥 [DEBUG] Error: ${error.message}`);
      if (error.response) {
        console.error('Response status:', error.response.status);
        console.error('Response data:', error.response.data);
        this.debugLog(`💥 [DEBUG] Response status: ${error.response.status}`);
        this.debugLog(`💥 [DEBUG] Response data:`, error.response.data);
      }
      this.debugLog(`💥 [DEBUG] Stack trace:`, error.stack);
      throw error;
    }
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
          const gridFilename = `grid_${uniqueId}.png`;
          
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
        this.debugLog(`\n🔍 [DEBUG] === Upscale Check Attempt ${attempts + 1}/${this.maxUpscaleAttempts} ===`);
        console.log(`Checking for upscaled image (attempt ${attempts + 1}/${this.maxUpscaleAttempts})...`);
        
        // Add small delay for upscale processing (shorter than before)
        if (attempts === 0) {
          console.log('Waiting briefly for upscale processing...');
          this.debugLog(`⏳ [DEBUG] Waiting 5 seconds for upscale processing...`);
          await new Promise(resolve => setTimeout(resolve, 5000)); // Reduced to 5 seconds
        }
        
        const response = await this.client.get(`/channels/${this.channelId}/messages?limit=20`);
        const items = response.data;

        this.debugLog(`📨 [DEBUG] Retrieved ${items.length} messages`);

        for (const item of items) {
          // Check for upscaled image message using various patterns
          if (item.content.includes(uniqueId)) {
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
                const filename = `upscaled_${uniqueId}_option${upscaleIndex}.png`;
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
              const filename = `upscaled_${uniqueId}_option${upscaleIndex}.png`;
              this.debugLog(`💾 [DEBUG] Saving as: ${filename}`);
              await this.downloadImage(url, filename);
              
              return url;
            }
          }
        }

        // Wait and try again
        this.debugLog(`⏳ [DEBUG] Waiting ${this.checkInterval}ms before next attempt...`);
        await new Promise(resolve => setTimeout(resolve, this.checkInterval));
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

  // New method to download an image from URL - WITH DEBUG
  async downloadImage(url, filename) {
    try {
      this.debugLog(`📥 [DEBUG] === STARTING IMAGE DOWNLOAD ===`);
      this.debugLog(`🌐 [DEBUG] URL: ${url}`);
      this.debugLog(`📁 [DEBUG] Filename: ${filename}`);
      this.debugLog(`📂 [DEBUG] Save directory: ${this.imageDir}`);

      const response = await axios({
        url,
        method: 'GET',
        responseType: 'stream',
        timeout: 30000 // 30 second timeout
      });
      
      this.debugLog(`✅ [DEBUG] HTTP response received, status: ${response.status}`);
      this.debugLog(`📊 [DEBUG] Content length: ${response.headers['content-length'] || 'unknown'}`);
      this.debugLog(`🗂️ [DEBUG] Content type: ${response.headers['content-type'] || 'unknown'}`);
      
      const filepath = path.join(this.imageDir, filename);
      const writer = fs.createWriteStream(filepath);
      
      this.debugLog(`📝 [DEBUG] Created write stream for: ${filepath}`);
      
      response.data.pipe(writer);
      
      return new Promise((resolve, reject) => {
        writer.on('finish', () => {
          console.log(`Image saved to: ${filepath}`);
          this.debugLog(`✅ [DEBUG] === IMAGE DOWNLOAD COMPLETED ===`);
          this.debugLog(`💾 [DEBUG] File saved successfully: ${filepath}`);
          
          // Check file size
          try {
            const stats = fs.statSync(filepath);
            this.debugLog(`📏 [DEBUG] File size: ${stats.size} bytes`);
          } catch (e) {
            this.debugLog(`⚠️ [DEBUG] Could not get file stats: ${e.message}`);
          }
          
          resolve(filepath);
        });
        writer.on('error', (err) => {
          console.error(`Error saving image: ${err.message}`);
          this.debugLog(`❌ [DEBUG] === IMAGE DOWNLOAD FAILED ===`);
          this.debugLog(`❌ [DEBUG] Write stream error: ${err.message}`);
          reject(err);
        });
      });
    } catch (error) {
      // Handle 404 errors gracefully - Discord URLs can expire
      if (error.response && error.response.status === 404) {
        console.warn(`⚠️ Discord image URL expired (404): ${url}`);
        this.debugLog(`⚠️ [DEBUG] === IMAGE DOWNLOAD SKIPPED (404) ===`);
        this.debugLog(`⚠️ [DEBUG] Discord URL expired: ${url}`);
        this.debugLog(`⚠️ [DEBUG] This is normal - Discord URLs expire after some time`);
        // Return a placeholder path instead of null to indicate the URL was valid but expired
        return `${filename} (URL expired)`;
      }
      
      console.error(`Failed to download image: ${error.message}`);
      this.debugLog(`❌ [DEBUG] === IMAGE DOWNLOAD FAILED ===`);
      this.debugLog(`❌ [DEBUG] HTTP request error: ${error.message}`);
      if (error.response) {
        this.debugLog(`❌ [DEBUG] Response status: ${error.response.status}`);
        this.debugLog(`❌ [DEBUG] Response headers:`, error.response.headers);
      }
      return null;
    }
  }

  // Extract grid images - WITH DEBUG (UPDATED WITH DELAY FIX)
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
          const gridFilename = `grid_${uniqueId}.png`;
          
          this.debugLog(`🆔 [DEBUG] Extracted unique ID: ${uniqueId}`);
          this.debugLog(`📁 [DEBUG] Grid filename: ${gridFilename}`);
          
          // ADD DELAY HERE - Wait for image to fully process before downloading
          console.log('Waiting for image to fully process before downloading...');
          this.debugLog(`⏳ [DEBUG] Waiting 10 seconds for image to fully process...`);
          await new Promise(resolve => setTimeout(resolve, 10000)); // 10 second delay
          
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
        this.debugLog(`\n🔍 [DEBUG] === Relax Wait Attempt ${attempts + 1}/${this.maxImagineAttempts} ===`);
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
        
        this.debugLog(`⏳ [DEBUG] Waiting ${this.checkInterval}ms before next attempt...`);
        await new Promise(resolve => setTimeout(resolve, this.checkInterval));
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

  // Main method to create an image from a prompt - WITH DEBUG
  async createImage(promptText, promptTags = '', upscaleIndex = null) {
    try {
      this.debugLog(`\n🚀 [DEBUG] === STARTING CREATE IMAGE PROCESS ===`);
      console.log(`Generating image for prompt: ${promptText}`);
      this.debugLog(`📝 [DEBUG] Prompt text: ${promptText}`);
      this.debugLog(`🏷️ [DEBUG] Prompt tags: ${promptTags}`);
      this.debugLog(`🔢 [DEBUG] Upscale index: ${upscaleIndex !== null ? upscaleIndex : 'none (will use grid image)'}`);
      
      const imagineResult = await this.imagine(promptText, promptTags);
      
      // Save the raw message for debugging
      console.log('Got message with ID:', imagineResult.id);
      console.log('Message has components:', !!imagineResult.raw_message.components);
      console.log('Message has attachments:', !!imagineResult.raw_message.attachments);
      
      this.debugLog(`📨 [DEBUG] === IMAGINE RESULT ===`);
      this.debugLog(`🆔 [DEBUG] Message ID: ${imagineResult.id}`);
      this.debugLog(`🔘 [DEBUG] Has components: ${!!imagineResult.raw_message.components}`);
      this.debugLog(`📎 [DEBUG] Has attachments: ${!!imagineResult.raw_message.attachments}`);
      this.debugLog(`⏳ [DEBUG] In progress: ${!!imagineResult.in_progress}`);
      
      if (imagineResult.raw_message.attachments) {
        console.log(`Number of attachments: ${imagineResult.raw_message.attachments.length}`);
        this.debugLog(`📎 [DEBUG] Number of attachments: ${imagineResult.raw_message.attachments.length}`);
      }
      
      // First extract and save the grid with all 4 options
      this.debugLog(`🔍 [DEBUG] === EXTRACTING GRID IMAGES ===`);
      const gridResult = await this.extractGridImages(imagineResult);
      
      // Save the grid information to a result object
      const result = {
        imagine_message_id: imagineResult.id,
        raw_message: imagineResult.raw_message, // Add this for debugging
        grid_info: gridResult,
        options: []
      };
      
      if (gridResult) {
        console.log('Successfully extracted grid with options:');
        this.debugLog(`✅ [DEBUG] Successfully extracted grid`);
        for (const option of gridResult.options) {
          console.log(`- Option ${option.index + 1}: ${option.label}`);
          this.debugLog(`   🔢 [DEBUG] Option ${option.index + 1}: ${option.label} (${option.custom_id || 'No ID'})`);
          result.options.push({
            index: option.index,
            custom_id: option.custom_id,
            label: option.label
          });
        }
        
        // Always use the grid image as the final result
        console.log('Using grid image as final result');
        this.debugLog(`✅ [DEBUG] Using grid image as final result: ${gridResult.grid_url}`);
        result.upscaled_photo_url = gridResult.grid_url;
        result.note = "Grid image used as final result (upscaling disabled)";
        
      } else {
        console.log('Failed to extract grid images');
        this.debugLog(`❌ [DEBUG] Failed to extract grid images`);
        
        // Fallback: use the first attachment if available
        if (imagineResult.raw_message.attachments && imagineResult.raw_message.attachments.length > 0) {
          const fallbackUrl = imagineResult.raw_message.attachments[0].url;
          console.log('Using first attachment as fallback');
          this.debugLog(`🔄 [DEBUG] Using first attachment as fallback: ${fallbackUrl}`);
          result.upscaled_photo_url = fallbackUrl;
          result.note = "First attachment used as fallback";
        }
      }
      
      this.debugLog(`✅ [DEBUG] === CREATE IMAGE COMPLETED (GRID ONLY) ===`);
      return result;
    } catch (error) {
      console.error('Image creation failed:', error.message);
      this.debugLog(`❌ [DEBUG] === CREATE IMAGE FAILED ===`);
      this.debugLog(`❌ [DEBUG] Error: ${error.message}`);
      this.debugLog(`❌ [DEBUG] Stack trace:`, error.stack);
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

  // Check for the upscaled image - WITH DEBUG (UPDATED WITH DELAY FIX)
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
        this.debugLog(`\n🔍 [DEBUG] === Upscale Check Attempt ${attempts + 1}/${this.maxUpscaleAttempts} ===`);
        console.log(`Checking for upscaled image (attempt ${attempts + 1}/${this.maxUpscaleAttempts})...`);
        const response = await this.client.get(`/channels/${this.channelId}/messages?limit=20`);
        const items = response.data;

        this.debugLog(`📨 [DEBUG] Retrieved ${items.length} messages`);

        for (const item of items) {
          // Check for upscaled image message using various patterns
          if (item.content.includes(uniqueId)) {
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
                
                // ADD DELAY HERE - Wait for image to fully process before downloading
                console.log('Waiting for upscaled image to fully process before downloading...');
                this.debugLog(`⏳ [DEBUG] Waiting 8 seconds for upscaled image to fully process...`);
                await new Promise(resolve => setTimeout(resolve, 8000)); // 8 second delay
                
                // Save the upscaled image
                const filename = `upscaled_${uniqueId}_option${upscaleIndex}.png`;
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
              
              // ADD DELAY HERE - Wait for image to fully process before downloading
              console.log('Waiting for potential upscaled image to fully process before downloading...');
              this.debugLog(`⏳ [DEBUG] Waiting 8 seconds for potential upscaled image to fully process...`);
              await new Promise(resolve => setTimeout(resolve, 8000)); // 8 second delay
              
              // Save the upscaled image
              const filename = `upscaled_${uniqueId}_option${upscaleIndex}.png`;
              this.debugLog(`💾 [DEBUG] Saving as: ${filename}`);
              await this.downloadImage(url, filename);
              
              return url;
            }
          }
        }

        // Wait and try again
        this.debugLog(`⏳ [DEBUG] Waiting ${this.checkInterval}ms before next attempt...`);
        await new Promise(resolve => setTimeout(resolve, this.checkInterval));
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

  // Test method to debug Discord interactions
  async testDiscordMessages() {
    try {
      console.log('🧪 Testing Discord message retrieval...');
      
      // Ensure initialized
      if (!this.userId || !this.guildId) {
        await this.initialize();
      }
      
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

// Export a singleton instance to match existing code structure
let instance = null;

module.exports = {
  getInstance: () => {
    if (!instance) {
      // Get Discord settings from environment variables
      const channelId = process.env.DISCORD_CHANNEL_ID;
      const userToken = process.env.DISCORD_USER_TOKEN;
      const relaxMode = process.env.MIDJOURNEY_RELAX_MODE === 'true' || true; // Default to relax mode
      
      if (!channelId || !userToken) {
        throw new Error('DISCORD_CHANNEL_ID and DISCORD_USER_TOKEN must be set in environment variables');
      }
      
      console.log('Creating new MidjourneyClient instance...');
      instance = new MidjourneyClient(channelId, userToken, relaxMode, true); // Enable debug mode
    }
    return instance;
  }
};