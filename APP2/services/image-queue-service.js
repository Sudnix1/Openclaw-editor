// services/image-queue-service.js - Enhanced with better Midjourney queue handling and timeout monitoring
const { runQuery, getOne, getAll } = require('../db');
const { v4: uuidv4 } = require('uuid');

class ImageQueueService {
  constructor() {
    this.isProcessing = false;
    this.maxConcurrentJobs = 5; // Allow 3 Midjourney jobs at a time
    this.currentJobs = 0;
    this.retryDelay = 30000; // 30 seconds retry delay
    this.jobDelay = 8000; // 8 seconds between jobs
    this.midjourneyQueueDelay = 120000; // 2 minutes delay for Midjourney queue retries
    
    // Initialize the queue table
    this.initializeTable();
    
    // Start monitoring for stuck jobs
    this.setupJobTimeoutMonitoring();
  }

  async initializeTable() {
    try {
      // Create the table with TEXT recipe_id to support both UUIDs and integers
      await runQuery(`
        CREATE TABLE IF NOT EXISTS image_queue (
          id TEXT PRIMARY KEY,
          recipe_id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          organization_id TEXT NOT NULL,
          website_id TEXT,
          status TEXT DEFAULT 'queued',
          position INTEGER,
          custom_prompt TEXT,
          discord_settings TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          started_at DATETIME,
          completed_at DATETIME,
          error_message TEXT,
          retry_count INTEGER DEFAULT 0,
          midjourney_queued_count INTEGER DEFAULT 0,
          estimated_completion DATETIME
        )
      `);
      
      // Check if the table was created with the old INTEGER recipe_id and needs migration
      const tableInfo = await getAll("PRAGMA table_info(image_queue)");
      const recipeIdColumn = tableInfo.find(col => col.name === 'recipe_id');
      
      if (recipeIdColumn && recipeIdColumn.type === 'INTEGER') {
        console.log('⚠️  Found old INTEGER recipe_id column, migration needed');
        console.log('💡 Run the migration script: node migrations/fix-recipe-id-uuid-support.js');
      } else if (recipeIdColumn && recipeIdColumn.type === 'TEXT') {
        console.log('✅ Recipe ID column is correctly configured as TEXT');
      }
      
      // Check if the new column exists and add it if not (for backward compatibility)
      try {
        await runQuery(`
          ALTER TABLE image_queue ADD COLUMN midjourney_queued_count INTEGER DEFAULT 0
        `);
        console.log('✅ Added midjourney_queued_count column to image_queue table');
      } catch (error) {
        // Column might already exist, which is fine
        if (!error.message.includes('duplicate column name')) {
          console.warn('⚠️ Could not add midjourney_queued_count column:', error.message);
        }
      }
      
      console.log('✅ Image queue table initialized and updated');
    } catch (error) {
      console.error('❌ Error initializing image queue table:', error);
    }
  }

  async setupJobTimeoutMonitoring() {
    // Check for stuck jobs every 2 minutes (more frequent)
    setInterval(async () => {
      try {
        console.log('🔍 Checking for stuck jobs...');
        
        // Mark jobs stuck for more than 5 minutes as failed
        const result = await runQuery(`
          UPDATE image_queue 
          SET status = 'failed', 
              error_message = 'Job timeout - stuck in processing for 5+ minutes',
              completed_at = datetime('now')
          WHERE status = 'processing' 
          AND datetime(started_at) < datetime('now', '-5 minutes')
        `);
        
        if (result.changes > 0) {
          console.log(`⚠️ Marked ${result.changes} stuck jobs as failed (5+ min timeout)`);
          // Reduce current jobs counter for each stuck job found
          this.currentJobs = Math.max(0, this.currentJobs - result.changes);
        }
        
      } catch (error) {
        console.error('Error checking stuck jobs:', error);
      }
    }, 2 * 60 * 1000); // Check every 2 minutes
  }

  async addToQueue(jobData) {
    try {
      // Enhanced validation and debugging
      console.log('📝 [QUEUE] Adding job to queue with data:', JSON.stringify(jobData, null, 2));
      
      // Validate required fields
      const requiredFields = ['recipeId', 'userId', 'organizationId'];
      const missingFields = [];
      
      for (const field of requiredFields) {
        if (!jobData[field] && jobData[field] !== 0) { // Allow 0 as valid value
          missingFields.push(field);
        }
      }
      
      if (missingFields.length > 0) {
        const error = new Error(`Missing required fields: ${missingFields.join(', ')}`);
        console.error('❌ [QUEUE] Validation failed:', error.message);
        console.error('❌ [QUEUE] Received jobData:', jobData);
        throw error;
      }
      
      // Check for alternative property names (defensive programming)
      const recipeId = jobData.recipeId || jobData.recipe_id || jobData.id;
      const userId = jobData.userId || jobData.user_id;
      const organizationId = jobData.organizationId || jobData.organization_id;
      
      if (!recipeId) {
        const error = new Error('Recipe ID is required but not found in jobData (checked recipeId, recipe_id, and id properties)');
        console.error('❌ [QUEUE] Recipe ID validation failed');
        console.error('❌ [QUEUE] Available properties:', Object.keys(jobData));
        throw error;
      }
      
      // ✅ ENHANCED: Handle both UUID and integer recipe IDs
      const isUUID = typeof recipeId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(recipeId);
      const isInteger = typeof recipeId === 'number' || (typeof recipeId === 'string' && /^\d+$/.test(recipeId));
      
      let finalRecipeId;
      if (isUUID) {
        finalRecipeId = recipeId; // Keep as UUID string
        console.log(`✅ [QUEUE] Using UUID recipe ID: ${finalRecipeId}`);
      } else if (isInteger) {
        finalRecipeId = typeof recipeId === 'number' ? recipeId : parseInt(recipeId);
        console.log(`✅ [QUEUE] Using integer recipe ID: ${finalRecipeId}`);
      } else {
        const error = new Error(`Recipe ID must be either a valid UUID or integer, received: "${recipeId}" (type: ${typeof recipeId})`);
        console.error('❌ [QUEUE] Recipe ID type validation failed');
        throw error;
      }
      
      console.log(`✅ [QUEUE] Validated data - Recipe ID: ${finalRecipeId}, User ID: ${userId}, Org ID: ${organizationId}`);
      
      const jobId = uuidv4();
      const position = await this.getNextQueuePosition();
      const estimatedCompletion = this.calculateEstimatedCompletion(position);
      
      console.log(`📋 [QUEUE] Creating job ${jobId} for recipe ${finalRecipeId} at position ${position}`);
      
      await runQuery(`
        INSERT INTO image_queue (
          id, recipe_id, user_id, organization_id, website_id, 
          status, position, custom_prompt, discord_settings, estimated_completion
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        jobId,
        finalRecipeId, // Use the validated recipe ID (UUID or integer)
        userId,
        organizationId,
        jobData.websiteId || jobData.website_id || null,
        'queued',
        position,
        jobData.customPrompt || jobData.custom_prompt || null,
        jobData.discordSettings ? JSON.stringify(jobData.discordSettings) : null,
        estimatedCompletion
      ]);

      console.log(`✅ [QUEUE] Successfully added job ${jobId} to queue at position ${position}`);
      
      // Start processing if not already running
      if (!this.isProcessing) {
        console.log('🚀 [QUEUE] Starting queue processing...');
        this.startProcessing();
      }

      return {
        success: true, 
        jobId: jobId,
        position: position,
        estimatedCompletion: estimatedCompletion,
        queueLength: position
      };
    } catch (error) {
      console.error('❌ [QUEUE] Error adding job to queue:', error);
      console.error('❌ [QUEUE] Error details:', {
        message: error.message,
        code: error.code,
        errno: error.errno
      });
      console.error('❌ [QUEUE] JobData that caused error:', JSON.stringify(jobData, null, 2));
      throw error;
    }
  }

  async getNextQueuePosition() {
    try {
      const result = await getOne(`
        SELECT MAX(position) as max_position 
        FROM image_queue 
        WHERE status IN ('queued', 'processing')
      `);
      
      return (result?.max_position || 0) + 1;
    } catch (error) {
      console.error('Error getting next queue position:', error);
      return 1;
    }
  }

  calculateEstimatedCompletion(position) {
    const avgJobTime = 120000; // 2 minutes average per job (accounting for Midjourney queues)
    const estimatedMs = position * avgJobTime;
    return new Date(Date.now() + estimatedMs).toISOString();
  }

  async startProcessing() {
    if (this.isProcessing) {
      console.log('⚠️ Queue processing already running');
      return;
    }

    this.isProcessing = true;
    console.log('🚀 Starting enhanced image queue processing');

    try {
      while (await this.hasQueuedJobs()) {
        if (this.currentJobs >= this.maxConcurrentJobs) {
          console.log(`⏳ Max concurrent jobs reached (${this.currentJobs}/${this.maxConcurrentJobs}), waiting...`);
          await this.wait(5000);
          continue;
        }

        const nextJob = await this.getNextJob();
        if (!nextJob) {
          await this.wait(2000);
          continue;
        }

        // Process job without waiting for completion
        this.processJob(nextJob);
        
        // Add delay between job starts
        await this.wait(this.jobDelay);
      }
    } catch (error) {
      console.error('❌ Error in queue processing:', error);
    } finally {
      this.isProcessing = false;
      console.log('⏹️ Queue processing stopped');
    }
  }

  async hasQueuedJobs() {
    try {
      const result = await getOne(`
        SELECT COUNT(*) as count 
        FROM image_queue 
        WHERE status = 'queued'
      `);
      return result.count > 0;
    } catch (error) {
      console.error('Error checking queued jobs:', error);
      return false;
    }
  }

  async getNextJob() {
    try {
      return await getOne(`
        SELECT * FROM image_queue 
        WHERE status = 'queued' 
        ORDER BY position ASC 
        LIMIT 1
      `);
    } catch (error) {
      console.error('Error getting next job:', error);
      return null;
    }
  }

  async processJob(job) {
    this.currentJobs++;
    console.log(`🎨 Processing job ${job.id} for recipe ${job.recipe_id} (${this.currentJobs}/${this.maxConcurrentJobs})`);
    
    // CRITICAL DEBUG: Log all job data to see what fields are available
    console.log(`🔍 [QUEUE DEBUG] Job data for ${job.id}:`, {
      organization_id: job.organization_id,
      website_id: job.website_id,
      user_id: job.user_id,
      discord_settings: job.discord_settings ? 'PRESENT' : 'MISSING',
      discord_settings_length: job.discord_settings ? job.discord_settings.length : 0
    });

    // ADD: Random delay before processing (1-5 seconds)
    const preProcessDelay = Math.random() * 4000 + 1000;
    console.log(`⏳ Pre-process delay: ${Math.round(preProcessDelay/1000)}s for job ${job.id}`);
    await this.wait(preProcessDelay);

    // Add timeout for individual jobs
    const jobTimeout = setTimeout(async () => {
      console.log(`⏰ Job ${job.id} timed out after 5 minutes`);
      await this.updateJobStatus(job.id, 'failed', {
        error_message: 'Individual job timeout after 5 minutes',
        completed_at: new Date().toISOString()
      });
      this.currentJobs--;
    }, 5 * 60 * 1000); // 5 minute timeout per job

    try {
      // Update job status to processing
      await this.updateJobStatus(job.id, 'processing', {
        started_at: new Date().toISOString()
      });

      // Get the image generator
      const imageGenerator = require('../midjourney/image-generator');
      
      // Parse Discord settings if available, or load from organization context
      let discordSettings = null;
      if (job.discord_settings) {
        try {
          discordSettings = JSON.parse(job.discord_settings);
          console.log(`✅ [QUEUE] Using Discord settings from job data for job ${job.id}`);
        } catch (e) {
          console.warn('Could not parse Discord settings for job:', job.id);
        }
      }
      
      // CRITICAL FIX: If no Discord settings in job, load from organization context
      if (!discordSettings && job.organization_id && job.website_id) {
        console.log(`🔍 [QUEUE] No Discord settings in job ${job.id}, loading from org context...`);
        console.log(`   📋 Loading settings for org: ${job.organization_id}, website: ${job.website_id}`);
        try {
          const promptSettingsDb = require('../prompt-settings-db');
          const orgSettings = promptSettingsDb.loadSettings(job.organization_id, job.website_id);
          
          console.log(`📄 [QUEUE] Loaded org settings:`, {
            hasSettings: !!orgSettings,
            enableDiscord: orgSettings?.enableDiscord,
            hasChannelId: !!orgSettings?.discordChannelId,
            hasUserToken: !!orgSettings?.discordUserToken,
            tokenPreview: orgSettings?.discordUserToken?.substring(0, 10) + '...'
          });
          
          if (orgSettings && orgSettings.enableDiscord && orgSettings.discordChannelId && orgSettings.discordUserToken) {
            discordSettings = {
              discordChannelId: orgSettings.discordChannelId,
              discordUserToken: orgSettings.discordUserToken,
              discordWebhookUrl: orgSettings.discordWebhookUrl || '',
              enableDiscord: true,
              source: `org-${job.organization_id}-website-${job.website_id}`
            };
            console.log(`✅ [QUEUE] SUCCESS: Loaded Discord settings from organization context for job ${job.id}`);
            console.log(`   📺 Channel: ${discordSettings.discordChannelId}`);
            console.log(`   🔐 Token: ${discordSettings.discordUserToken.substring(0, 10)}...`);
            console.log(`   🏢 Source: ${discordSettings.source}`);
          } else {
            console.log(`❌ [QUEUE] FAILED: No valid Discord settings found for org ${job.organization_id}, website ${job.website_id}`);
            
            // Additional debugging - check what we actually got
            if (orgSettings) {
              console.log(`   📋 Settings file exists but incomplete:`);
              console.log(`      enableDiscord: ${orgSettings.enableDiscord}`);
              console.log(`      discordChannelId: ${orgSettings.discordChannelId ? 'PRESENT' : 'MISSING'}`);
              console.log(`      discordUserToken: ${orgSettings.discordUserToken ? 'PRESENT' : 'MISSING'}`);
            } else {
              console.log(`   📋 No settings file found for this org/website combination`);
            }
          }
        } catch (loadError) {
          console.error(`❌ [QUEUE] Error loading organization Discord settings for job ${job.id}:`, loadError.message);
          console.error(`   Full error:`, loadError.stack);
        }
      }

      // Generate the image
      let result;
      if (job.custom_prompt) {
        result = await imageGenerator.generateImageForRecipeWithPrompt(
          job.recipe_id, 
          job.custom_prompt,
          discordSettings // <-- IMPORTANT

        );
      } else {
        result = await imageGenerator.generateImageForRecipeWithSettings(
          job.recipe_id, 
          discordSettings
        );
      }

      if (result.success) {
        await this.updateJobStatus(job.id, 'completed', {
          completed_at: new Date().toISOString()
        });
        console.log(`✅ Job ${job.id} completed successfully`);
        
        // ADD: Random delay after completion (3-8 seconds)
        const postProcessDelay = Math.random() * 5000 + 3000;
        console.log(`⏳ Post-process delay: ${Math.round(postProcessDelay/1000)}s for job ${job.id}`);
        await this.wait(postProcessDelay);
      } else {
        throw new Error(result.error || 'Image generation failed');
      }

      // Clear timeout if job completes normally
      clearTimeout(jobTimeout);

    } catch (error) {
      clearTimeout(jobTimeout);
      
      console.error(`❌ Job ${job.id} failed:`, error.message);
      
      // ENHANCED: Better handling of Midjourney queue messages
      if (this.isMidjourneyQueueError(error.message)) {
        console.log(`🔄 Midjourney queue detected for job ${job.id}, handling appropriately`);
        await this.handleMidjourneyQueue(job, error.message);
      } else if (this.isConcurrentJobError(error.message)) {
        console.log(`🔄 Concurrent job limit hit, requeueing job ${job.id}`);
        await this.requeueJob(job);
      } else {
        // Handle other errors with retry logic
        await this.handleFailedJob(job, error.message);
      }
    } finally {
      this.currentJobs--;
    }
  }

  // NEW: Check if error is related to Midjourney's internal queue
  isMidjourneyQueueError(errorMessage) {
    const message = errorMessage.toLowerCase();
    return message.includes('job was queued by midjourney') ||
           message.includes('still waiting for queued job') ||
           (message.includes('queue') && message.includes('midjourney')) ||
           message.includes('job queued');
  }

  // NEW: Check if error is related to concurrent job limits
  isConcurrentJobError(errorMessage) {
    const message = errorMessage.toLowerCase();
    return message.includes('maximum allowed number of concurrent jobs') ||
           message.includes('concurrent jobs') ||
           (message.includes('concurrent') && message.includes('limit'));
  }

  // NEW: Handle Midjourney queue situations
  async handleMidjourneyQueue(job, errorMessage) {
    try {
      const midjourneyQueuedCount = (job.midjourney_queued_count || 0) + 1;
      const maxMidjourneyQueue = 3; // Allow 3 Midjourney queue attempts

      if (midjourneyQueuedCount > maxMidjourneyQueue) {
        await this.updateJobStatus(job.id, 'failed', {
          error_message: `Job failed after ${maxMidjourneyQueue} Midjourney queue attempts: ${errorMessage}`,
          midjourney_queued_count: midjourneyQueuedCount
        });
        console.log(`❌ Job ${job.id} failed after ${maxMidjourneyQueue} Midjourney queue attempts`);
        return;
      }

      // Requeue with longer delay for Midjourney queue
      const newPosition = await this.getNextQueuePosition();
      const newEstimatedCompletion = this.calculateEstimatedCompletion(newPosition);
      
      await runQuery(`
        UPDATE image_queue 
        SET status = 'queued', 
            position = ?, 
            estimated_completion = ?,
            midjourney_queued_count = ?,
            started_at = NULL,
            error_message = ?
        WHERE id = ?
      `, [
        newPosition, 
        newEstimatedCompletion, 
        midjourneyQueuedCount, 
        `Midjourney queue attempt ${midjourneyQueuedCount}: ${errorMessage}`,
        job.id
      ]);

      console.log(`🔄 Job ${job.id} requeued due to Midjourney queue (attempt ${midjourneyQueuedCount}/${maxMidjourneyQueue})`);
      
      // Add extra delay for Midjourney queue situations
      await this.wait(this.midjourneyQueueDelay);
      
    } catch (error) {
      console.error('Error handling Midjourney queue:', error);
      await this.updateJobStatus(job.id, 'failed', {
        error_message: 'Failed to handle Midjourney queue: ' + error.message
      });
    }
  }

  async requeueJob(job) {
    try {
      const retryCount = (job.retry_count || 0) + 1;
      const maxRetries = 3;

      if (retryCount > maxRetries) {
        await this.updateJobStatus(job.id, 'failed', {
          error_message: 'Max retries exceeded due to concurrent job limits',
          retry_count: retryCount
        });
        return;
      }

      // Reset to queued with new position
      const newPosition = await this.getNextQueuePosition();
      const newEstimatedCompletion = this.calculateEstimatedCompletion(newPosition);
      
      await runQuery(`
        UPDATE image_queue 
        SET status = 'queued', 
            position = ?, 
            estimated_completion = ?,
            retry_count = ?,
            started_at = NULL,
            error_message = 'Requeued due to concurrent job limit'
        WHERE id = ?
      `, [newPosition, newEstimatedCompletion, retryCount, job.id]);

      console.log(`🔄 Job ${job.id} requeued at position ${newPosition} (retry ${retryCount}/${maxRetries})`);
      
      // Add extra delay before processing requeued jobs
      await this.wait(this.retryDelay);
      
    } catch (error) {
      console.error('Error requeueing job:', error);
      await this.updateJobStatus(job.id, 'failed', {
        error_message: 'Failed to requeue job: ' + error.message
      });
    }
  }

  async handleFailedJob(job, errorMessage) {
    try {
      const retryCount = (job.retry_count || 0) + 1;
      const maxRetries = 2;

      if (retryCount <= maxRetries) {
        // Retry the job
        const newPosition = await this.getNextQueuePosition();
        const newEstimatedCompletion = this.calculateEstimatedCompletion(newPosition);
        
        await runQuery(`
          UPDATE image_queue 
          SET status = 'queued', 
              position = ?, 
              estimated_completion = ?,
              retry_count = ?,
              started_at = NULL,
              error_message = ?
          WHERE id = ?
        `, [newPosition, newEstimatedCompletion, retryCount, `Retry ${retryCount}: ${errorMessage}`, job.id]);

        console.log(`🔄 Job ${job.id} scheduled for retry ${retryCount}/${maxRetries}`);
      } else {
        // Mark as failed
        await this.updateJobStatus(job.id, 'failed', {
          error_message: errorMessage,
          retry_count: retryCount
        });
        console.log(`❌ Job ${job.id} failed permanently after ${retryCount} attempts`);
      }
    } catch (error) {
      console.error('Error handling failed job:', error);
    }
  }

  async updateJobStatus(jobId, status, additionalData = {}) {
    try {
      const updateFields = [];
      const updateValues = [];

      updateFields.push('status = ?');
      updateValues.push(status);

      if (additionalData.started_at) {
        updateFields.push('started_at = ?');
        updateValues.push(additionalData.started_at);
      }

      if (additionalData.completed_at) {
        updateFields.push('completed_at = ?');
        updateValues.push(additionalData.completed_at);
      }

      if (additionalData.error_message) {
        updateFields.push('error_message = ?');
        updateValues.push(additionalData.error_message);
      }

      if (additionalData.retry_count !== undefined) {
        updateFields.push('retry_count = ?');
        updateValues.push(additionalData.retry_count);
      }

      if (additionalData.midjourney_queued_count !== undefined) {
        updateFields.push('midjourney_queued_count = ?');
        updateValues.push(additionalData.midjourney_queued_count);
      }

      updateValues.push(jobId);

      await runQuery(`
        UPDATE image_queue 
        SET ${updateFields.join(', ')} 
        WHERE id = ?
      `, updateValues);

    } catch (error) {
      console.error('Error updating job status:', error);
    }
  }

  async getQueueStatus(userId, organizationId) {
    try {
      // Get user's jobs
      const userJobs = await getAll(`
        SELECT * FROM image_queue 
        WHERE user_id = ? AND organization_id = ? 
        AND status IN ('queued', 'processing')
        ORDER BY position ASC
      `, [userId, organizationId]);

      // Get total queue stats
      const queueStats = await getOne(`
        SELECT 
          COUNT(*) as total_queued,
          COUNT(CASE WHEN status = 'processing' THEN 1 END) as processing,
          MIN(position) as next_position
        FROM image_queue 
        WHERE status IN ('queued', 'processing')
      `);

      return {
        userJobs: userJobs.map(job => ({
          id: job.id,
          recipeId: job.recipe_id,
          status: job.status,
          position: job.position,
          estimatedCompletion: job.estimated_completion,
          retryCount: job.retry_count || 0,
          midjourneyQueuedCount: job.midjourney_queued_count || 0,
          errorMessage: job.error_message
        })),
        queueStats: {
          totalQueued: queueStats?.total_queued || 0,
          processing: queueStats?.processing || 0,
          nextPosition: queueStats?.next_position || 1
        }
      };
    } catch (error) {
      console.error('Error getting queue status:', error);
      return { userJobs: [], queueStats: { totalQueued: 0, processing: 0, nextPosition: 1 } };
    }
  }

  async cancelJob(jobId, userId) {
    try {
      const job = await getOne(`
        SELECT * FROM image_queue 
        WHERE id = ? AND user_id = ? AND status IN ('queued', 'processing')
      `, [jobId, userId]);

      if (!job) {
        return { success: false, message: 'Job not found or cannot be cancelled' };
      }

      await this.updateJobStatus(jobId, 'cancelled');
      
      console.log(`🚫 Job ${jobId} cancelled by user ${userId}`);
      return { success: true, message: 'Job cancelled successfully' };
    } catch (error) {
      console.error('Error cancelling job:', error);
      return { success: false, message: 'Failed to cancel job' };
    }
  }

  async cleanupOldJobs(olderThanDays = 7) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

      const result = await runQuery(`
        DELETE FROM image_queue 
        WHERE status IN ('completed', 'failed', 'cancelled') 
        AND created_at < ?
      `, [cutoffDate.toISOString()]);

      console.log(`🧹 Cleaned up ${result.changes || 0} old queue jobs`);
      return result.changes || 0;
    } catch (error) {
      console.error('Error cleaning up old jobs:', error);
      return 0;
    }
  }

  wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Export singleton instance
const imageQueueService = new ImageQueueService();
module.exports = imageQueueService;