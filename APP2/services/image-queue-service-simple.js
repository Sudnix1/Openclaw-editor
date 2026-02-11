// Simple version of the queue service fix without special characters
// Add this debug code to your processJob function around line 293-305

async processJob(job) {
  this.currentJobs++;
  console.log(`Processing job ${job.id} for recipe ${job.recipe_id} (${this.currentJobs}/${this.maxConcurrentJobs})`);
  
  // CRITICAL DEBUG: Log all job data to see what fields are available
  console.log(`[QUEUE DEBUG] Job data for ${job.id}:`, {
    organization_id: job.organization_id,
    website_id: job.website_id,  
    user_id: job.user_id,
    discord_settings: job.discord_settings ? 'PRESENT' : 'MISSING',
    discord_settings_length: job.discord_settings ? job.discord_settings.length : 0
  });

  // ADD: Random delay before processing (1-5 seconds)
  const preProcessDelay = Math.random() * 4000 + 1000;
  console.log(`Pre-process delay: ${Math.round(preProcessDelay/1000)}s for job ${job.id}`);
  await this.wait(preProcessDelay);

  // Add timeout for individual jobs
  const jobTimeout = setTimeout(async () => {
    console.log(`Job ${job.id} timed out after 5 minutes`);
    await this.updateJobStatus(job.id, 'failed', {
      error_message: 'Individual job timeout after 5 minutes',
      completed_at: new Date().toISOString()
    });
  }, 300000); // 5 minutes

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
        console.log(`[QUEUE] Using Discord settings from job data for job ${job.id}`);
      } catch (e) {
        console.warn('Could not parse Discord settings for job:', job.id);
      }
    }
    
    // CRITICAL FIX: If no Discord settings in job, load from organization context
    if (!discordSettings && job.organization_id && job.website_id) {
      console.log(`[QUEUE] No Discord settings in job ${job.id}, loading from org context...`);
      console.log(`   Loading settings for org: ${job.organization_id}, website: ${job.website_id}`);
      try {
        const promptSettingsDb = require('../prompt-settings-db');
        const orgSettings = promptSettingsDb.loadSettings(job.organization_id, job.website_id);
        
        console.log(`[QUEUE] Loaded org settings:`, {
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
          console.log(`[QUEUE] SUCCESS: Loaded Discord settings from organization context for job ${job.id}`);
          console.log(`   Channel: ${discordSettings.discordChannelId}`);
          console.log(`   Token: ${discordSettings.discordUserToken.substring(0, 10)}...`);
          console.log(`   Source: ${discordSettings.source}`);
        } else {
          console.log(`[QUEUE] FAILED: No valid Discord settings found for org ${job.organization_id}, website ${job.website_id}`);
          
          // Additional debugging - check what we actually got
          if (orgSettings) {
            console.log(`   Settings file exists but incomplete:`);
            console.log(`      enableDiscord: ${orgSettings.enableDiscord}`);
            console.log(`      discordChannelId: ${orgSettings.discordChannelId ? 'PRESENT' : 'MISSING'}`);
            console.log(`      discordUserToken: ${orgSettings.discordUserToken ? 'PRESENT' : 'MISSING'}`);
          } else {
            console.log(`   No settings file found for this org/website combination`);
          }
        }
      } catch (loadError) {
        console.error(`[QUEUE] Error loading organization Discord settings for job ${job.id}:`, loadError.message);
        console.error(`   Full error:`, loadError.stack);
      }
    }

    // Generate the image
    let result;
    if (job.custom_prompt) {
      result = await imageGenerator.generateImageForRecipeWithPrompt(
        job.recipe_id, 
        job.custom_prompt,
        discordSettings
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
      console.log(`Job ${job.id} completed successfully`);
    } else {
      await this.updateJobStatus(job.id, 'failed', {
        error_message: result.error || 'Image generation failed',
        completed_at: new Date().toISOString()
      });
      console.log(`Job ${job.id} failed:`, result.error);
    }

  } catch (error) {
    console.error(`Error processing job ${job.id}:`, error);
    await this.updateJobStatus(job.id, 'failed', {
      error_message: error.message,
      completed_at: new Date().toISOString()
    });
  } finally {
    clearTimeout(jobTimeout);
    this.currentJobs--;
  }
}