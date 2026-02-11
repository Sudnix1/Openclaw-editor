// midjourney/image-routes.js - Fixed Route Organization
const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const sharp = require('sharp');
const { runQuery, getOne, getAll } = require('../db');
const imageGenerator = require('./image-generator');
const MidjourneyClient = require('./midjourney-client');
const auth = require('../middleware/auth');
const imageQueueService = require('../services/image-queue-service');

// Function to get Discord settings from application
async function getDiscordSettingsFromApp(req = null) {
  try {
    if (global.getCurrentDiscordSettings) {
      return await global.getCurrentDiscordSettings(req);
    }
    
    const promptSettingsDb = require('../prompt-settings-db');
    
    if (req && req.session && req.session.user) {
      const organizationId = req.session.user.organizationId;
      const websiteId = req.session.currentWebsiteId;
      
      if (organizationId && websiteId) {
        const settings = promptSettingsDb.loadSettings(organizationId, websiteId);
        
        if (settings && settings.enableDiscord && settings.discordChannelId && settings.discordUserToken) {
          return {
            discordChannelId: settings.discordChannelId,
            discordUserToken: settings.discordUserToken,
            enableDiscord: settings.enableDiscord
          };
        }
      }
    }
    
    return null;
  } catch (error) {
    console.error('Error getting Discord settings from application:', error);
    return null;
  }
}

// Set up authentication middleware
router.use(auth.isAuthenticated);

// 🐛 CONDITIONAL DEBUG MIDDLEWARE - Only in development
if (process.env.NODE_ENV === 'development' || process.env.DEBUG_ROUTES === 'true') {
  router.use((req, res, next) => {
    if (req.path.includes('generate') || req.path.includes('queue')) {
      console.log('\n=== 🐛 IMAGE ROUTE DEBUG ===');
      console.log('📅 Timestamp:', new Date().toISOString());
      console.log('🌐 Method:', req.method);
      console.log('🔗 Original URL:', req.originalUrl);
      console.log('📂 Path:', req.path);
      console.log('🏷️ Params:', JSON.stringify(req.params, null, 2));
      console.log('📦 Body:', JSON.stringify(req.body, null, 2));
      console.log('❓ Query:', JSON.stringify(req.query, null, 2));
      console.log('👤 User ID:', req.session?.user?.id || 'Not found');
      console.log('🏢 Org ID:', req.session?.user?.organizationId || 'Not found');
      console.log('🌐 Website ID:', req.session?.currentWebsiteId || 'Not found');
      console.log('=== 🐛 END DEBUG ===\n');
    }
    next();
  });
}

// ================================
// PAGE ROUTES (HTML responses)
// ================================

// Main recipe images page
router.get('/', async (req, res) => {
  try {
    res.render('recipe-images', { 
      title: 'Recipe Images',
      pageTitle: 'Recipe Images',
      activePage: 'recipe-images'
    });
  } catch (error) {
    console.error('Error rendering recipe images page:', error);
    res.status(500).send('Error loading recipe images');
  }
});

// Route to serve recipe images
router.get('/image/:filename', (req, res) => {
  const filename = req.params.filename;
  const imagePath = path.join(process.cwd(), 'recipe_images', filename);
  
  if (fs.existsSync(imagePath)) {
    res.sendFile(imagePath);
  } else {
    res.status(404).send('Image not found');
  }
});

// ================================
// API ROUTES - SPECIFIC PATHS FIRST
// ================================

// FIXED: More specific routes come first to avoid parameter conflicts

// POST /api/generate-with-prompt - MOVED UP for specificity
router.post('/api/generate-with-prompt', async (req, res) => {
  try {
    console.log('🐛 [PROMPT ROUTE DEBUG]');
    console.log('Body:', JSON.stringify(req.body, null, 2));

    const { recipeId: rawRecipeId, prompt } = req.body;
    
    if (!rawRecipeId || rawRecipeId === 'null' || rawRecipeId === 'undefined') {
      return res.status(400).json({
        success: false,
        error: 'Recipe ID is required in request body',
        received: { rawRecipeId }
      });
    }
    
    if (!prompt || prompt.trim() === '') {
      return res.status(400).json({
        success: false,
        error: 'Prompt is required'
      });
    }
    
    // Handle both UUID and integer recipe IDs
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawRecipeId);
    const isInteger = /^\d+$/.test(rawRecipeId);
    
    let recipeId;
    if (isUUID) {
      recipeId = rawRecipeId;
      console.log(`✅ Detected UUID recipe ID: ${recipeId}`);
    } else if (isInteger) {
      recipeId = parseInt(rawRecipeId);
      console.log(`✅ Detected integer recipe ID: ${recipeId}`);
    } else {
      return res.status(400).json({
        success: false,
        error: `Recipe ID must be either a valid UUID or integer, received: "${rawRecipeId}"`
      });
    }

    console.log(`✅ Validated recipe ID: ${recipeId}, prompt length: ${prompt.length}`);
    
    // Validate recipe access
    const recipe = await getOne("SELECT * FROM recipes WHERE id = ?", [recipeId]);
    if (!recipe) {
      return res.status(404).json({
        success: false,
        error: 'Recipe not found'
      });
    }

    const orgId = req.session.user.organizationId;
    const userId = req.session.user.role === 'employee' ? req.session.user.id : null;
    
    if (recipe.organization_id !== orgId || 
        (userId && recipe.owner_id !== userId)) {
      return res.status(403).json({
        success: false,
        error: 'You do not have permission to generate images for this recipe'
      });
    }

    // Perform safety check
    const performSafetyCheck = (prompt) => {
      try {
        const highRiskTerms = [
          'kill', 'blood', 'gore', 'death', 'suicide', 'murder', 'torture', 
          'explicit', 'nude', 'naked', 'sex', 'sexual', 'porn', 'terrorist', 
          'violent', 'weapon', 'drug', 'assault'
        ];
        
        const foundTerms = [];
        for (const term of highRiskTerms) {
          const regex = new RegExp(`\\b${term}\\b|\\b${term}s\\b|\\b${term}ed\\b|\\b${term}ing\\b`, 'i');
          if (regex.test(prompt)) {
            foundTerms.push(term);
          }
        }
        
        if (foundTerms.length > 0) {
          return {
            passed: false,
            blocked: true,
            terms: foundTerms
          };
        }
        
        return { passed: true };
      } catch (error) {
        console.error('Error in safety check:', error);
        return { passed: false, error: error.message };
      }
    };
    
    const safetyCheck = performSafetyCheck(prompt);
    
    if (!safetyCheck.passed) {
      console.warn('Safety check warning:', safetyCheck);
      return res.json({
        success: false,
        warning: true,
        safetyCheck,
        message: 'Prompt may contain terms that will be blocked by Midjourney'
      });
    }

    

    // Get Discord settings
    const discordSettings = await getDiscordSettingsFromApp(req);
    
    if (!discordSettings || !discordSettings.enableDiscord) {
      return res.status(400).json({
        success: false,
        error: 'Discord integration is not configured. Please check your settings.'
      });
    }

    // Prepare validated job data with correct ID type
    const jobData = {
      recipeId: recipeId,
      userId: req.session.user.id,
      organizationId: req.session.user.organizationId,
      websiteId: req.session.currentWebsiteId,
      customPrompt: prompt,
      discordSettings: discordSettings
    };

    console.log('📝 [QUEUE] Custom prompt job data:', JSON.stringify(jobData, null, 2));

    // Add to queue with custom prompt
    const queueResult = await imageQueueService.addToQueue(jobData);

    res.json({
      success: true,
      message: 'Image generation queued successfully with custom prompt',
      jobId: queueResult.jobId,
      position: queueResult.position,
      estimatedCompletion: queueResult.estimatedCompletion
    });
    
  } catch (error) {
    console.error('❌ Error generating with custom prompt:', error);
    console.error('❌ Error stack:', error.stack);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// POST /api/process-grid-image - Specific action route
router.post('/api/process-grid-image', async (req, res) => {
  try {
    const { imageUrl, quadrantIndex, recipeId, prompt } = req.body;
    
    if (!imageUrl || quadrantIndex === undefined || !recipeId) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required parameters: imageUrl, quadrantIndex, and recipeId are required' 
      });
    }
    
    console.log(`Processing grid image for recipe ${recipeId}, quadrant ${quadrantIndex}`);
    
    // Ensure the recipe_images directory exists
    const outputDir = path.join(process.cwd(), 'recipe_images');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    // Find the source image path
    let sourceImagePath;
    if (imageUrl.startsWith('/recipe_images/')) {
      sourceImagePath = path.join(process.cwd(), imageUrl.substring(1));
    } else {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid image URL format. Must be a path starting with /recipe_images/' 
      });
    }
    
    if (!fs.existsSync(sourceImagePath)) {
      return res.status(404).json({
        success: false,
        error: 'Source image file not found'
      });
    }
    
    // Generate output filename
    const outputFilename = `recipe_${recipeId}_${Date.now()}.webp`;
    const outputPath = path.join(outputDir, outputFilename);
    
    // Process the image with sharp
    const image = sharp(sourceImagePath);
    const metadata = await image.metadata();
    const { width, height } = metadata;
    
    // Calculate the quadrant coordinates
    const halfWidth = Math.floor(width / 2);
    const halfHeight = Math.floor(height / 2);
    
    let cropOptions;
    switch (parseInt(quadrantIndex)) {
      case 0: // Top-left
        cropOptions = { left: 0, top: 0, width: halfWidth, height: halfHeight };
        break;
      case 1: // Top-right
        cropOptions = { left: halfWidth, top: 0, width: halfWidth, height: halfHeight };
        break;
      case 2: // Bottom-left
        cropOptions = { left: 0, top: halfHeight, width: halfWidth, height: halfHeight };
        break;
      case 3: // Bottom-right
        cropOptions = { left: halfWidth, top: halfHeight, width: halfWidth, height: halfHeight };
        break;
      default:
        return res.status(400).json({ error: 'Invalid quadrant index' });
    }
    
    // Calculate target size for 2x upscale while preserving aspect ratio
    const scale = 2.0;
    const aspectRatio = cropOptions.width / cropOptions.height;
    let targetWidth, targetHeight;
    
    if (aspectRatio >= 1) {
      targetHeight = Math.max(1024, cropOptions.height * scale);
      targetWidth = Math.round(targetHeight * aspectRatio);
    } else {
      targetWidth = Math.max(1024, cropOptions.width * scale);
      targetHeight = Math.round(targetWidth / aspectRatio);
    }
    
    // Extract the quadrant, resize, and save directly
    await image
      .extract(cropOptions)
      .resize({
        width: targetWidth,
        height: targetHeight,
        fit: 'fill',
        kernel: 'lanczos3'
      })
      .sharpen()
      .webp({ quality: 90 })
      .toFile(outputPath);
    
    // Add the image to the database
    const promptText = prompt || 'Image selected from Midjourney grid';
    
    const imageResult = await runQuery(
      "INSERT INTO recipe_images (recipe_id, prompt, image_path, status) VALUES (?, ?, ?, ?)",
      [recipeId, promptText, outputFilename, 'completed']
    );
    
    return res.json({
      success: true,
      imageId: imageResult.lastID,
      imagePath: outputFilename,
      recipeId: recipeId,
      message: 'Image quadrant processed and saved successfully'
    });
    
  } catch (error) {
    console.error('Error processing grid image:', error);
    return res.status(500).json({ 
      success: false, 
      error: 'Failed to process grid image',
      message: error.message
    });
  }
});

// GET /api/queue-status - Queue status endpoint
router.get('/api/queue-status', async (req, res) => {
  try {
    const userId = req.session.user.id;
    const organizationId = req.session.user.organizationId;
    
    const queueStatus = await imageQueueService.getQueueStatus(userId, organizationId);
    
    res.json({
      success: true,
      ...queueStatus,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error getting queue status:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// GET /api/test-discord-setup - Discord testing endpoint
router.get('/api/test-discord-setup', async (req, res) => {
  try {
    console.log('🧪 Testing Discord setup...');
    
    let discordSettings = await getDiscordSettingsFromApp(req);
    
    if (!discordSettings) {
      return res.json({
        success: false,
        error: 'Discord settings not found. Please configure Discord in your settings.',
        timestamp: new Date().toISOString()
      });
    }

    MidjourneyClient.resetInstance();
    const client = MidjourneyClient.getInstance(discordSettings);
    
    const envCheck = {
      DISCORD_CHANNEL_ID: !!discordSettings?.discordChannelId,
      DISCORD_USER_TOKEN: !!discordSettings?.discordUserToken,
      channelIdValue: discordSettings?.discordChannelId,
      tokenLength: discordSettings?.discordUserToken ? discordSettings.discordUserToken.length : 0
    };
    
    console.log('Environment check:', envCheck);
    
    await client.initialize();
    let initResult = {
      success: true,
      data: {
        userId: client.userId,
        guildId: client.guildId,
        channelId: client.channelId,
        dataId: client.dataId,
        dataVersion: client.dataVersion
      }
    };
    
    let channelTest = { success: false, error: null };
    try {
      const response = await client.client.get(`/channels/${client.channelId}/messages?limit=1`);
      channelTest = { success: true, messageCount: response.data.length };
    } catch (channelError) {
      channelTest = { 
        success: false, 
        error: channelError.response?.data?.message || channelError.message,
        status: channelError.response?.status
      };
    }
    
    res.json({
      success: true,
      environment: envCheck,
      initialization: initResult,
      channelAccess: channelTest,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Test Discord setup error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// GET /api/images - Get all recipe images
router.get('/api/images', async (req, res) => {
  try {
    const images = await imageGenerator.getAllRecipeImages();
    res.json({ success: true, images });
  } catch (error) {
    console.error('Error getting recipe images:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/admin/queue-stats - Admin queue statistics
router.get('/api/admin/queue-stats', auth.isAdmin, async (req, res) => {
  try {
    const stats = await getAll(`
      SELECT 
        status,
        COUNT(*) as count,
        AVG(CASE 
          WHEN completed_at IS NOT NULL AND started_at IS NOT NULL 
          THEN (julianday(completed_at) - julianday(started_at)) * 24 * 60 * 60 
        END) as avg_processing_time_seconds
      FROM image_queue 
      WHERE created_at > datetime('now', '-7 days')
      GROUP BY status
    `);

    const recentJobs = await getAll(`
      SELECT iq.*, r.recipe_idea, u.name as user_name
      FROM image_queue iq
      LEFT JOIN recipes r ON iq.recipe_id = r.id
      LEFT JOIN users u ON iq.user_id = u.id
      WHERE iq.created_at > datetime('now', '-24 hours')
      ORDER BY iq.created_at DESC
      LIMIT 20
    `);

    res.json({
      success: true,
      stats: stats,
      recentJobs: recentJobs,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error getting admin queue stats:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// ================================
// FILTER ROUTES
// ================================

// POST /api/test-prompt-filter - Test prompt filtering
router.post('/api/test-prompt-filter', async (req, res) => {
  try {
    const { prompt } = req.body;
    
    if (!prompt) {
      return res.status(400).json({
        success: false,
        message: 'Prompt text is required'
      });
    }
    
    const imageGenerator = require('./image-generator');
    const result = imageGenerator.testPromptFilter(prompt);
    
    res.json({
      success: true,
      result: result
    });
  } catch (error) {
    console.error('Error testing prompt filter:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// GET /api/filter-stats - Get filter statistics
router.get('/api/filter-stats', async (req, res) => {
  try {
    // Get overall stats
    const stats = await getOne('SELECT * FROM prompt_filter_stats ORDER BY id DESC LIMIT 1');
    
    // Get recent filtered images
    const recentFiltered = await getAll(`
      SELECT ri.*, r.recipe_idea 
      FROM recipe_images ri
      LEFT JOIN recipes r ON ri.recipe_id = r.id
      WHERE ri.filter_changes IS NOT NULL 
        AND ri.filter_changes != '[]'
      ORDER BY ri.created_at DESC 
      LIMIT 10
    `);
    
    // Parse filter changes for analysis
    const changeAnalysis = {};
    recentFiltered.forEach(image => {
      try {
        const changes = JSON.parse(image.filter_changes || '[]');
        changes.forEach(change => {
          const key = `${change.original} → ${change.replacement}`;
          changeAnalysis[key] = (changeAnalysis[key] || 0) + 1;
        });
      } catch (e) {
        // Skip invalid JSON
      }
    });
    
    res.json({
      success: true,
      stats: stats || {
        total_prompts: 0,
        filtered_prompts: 0,
        blocked_prompts: 0
      },
      recentFiltered: recentFiltered,
      commonChanges: changeAnalysis
    });
  } catch (error) {
    console.error('Error getting filter stats:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// GET /api/banned-words - Get banned words list
router.get('/api/banned-words', async (req, res) => {
  try {
    const promptFilter = require('./prompt-filter');
    const bannedWords = promptFilter.getBannedWords();
    
    res.json({
      success: true,
      bannedWords: bannedWords,
      count: Object.keys(bannedWords).length
    });
  } catch (error) {
    console.error('Error getting banned words:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// POST /api/banned-words - Add custom banned word
router.post('/api/banned-words', async (req, res) => {
  try {
    const { word, replacements } = req.body;
    
    if (!word || !replacements) {
      return res.status(400).json({
        success: false,
        message: 'Word and replacements are required'
      });
    }
    
    const promptFilter = require('./prompt-filter');
    promptFilter.addBannedWord(word, replacements);
    
    res.json({
      success: true,
      message: `Added "${word}" to banned words list`
    });
  } catch (error) {
    console.error('Error adding banned word:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// DELETE /api/banned-words/:word - Remove banned word
router.delete('/api/banned-words/:word', async (req, res) => {
  try {
    const word = req.params.word;
    
    const promptFilter = require('./prompt-filter');
    promptFilter.removeBannedWord(word);
    
    res.json({
      success: true,
      message: `Removed "${word}" from banned words list`
    });
  } catch (error) {
    console.error('Error removing banned word:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// POST /api/test-batch-filter - Test multiple prompts at once
router.post('/api/test-batch-filter', async (req, res) => {
  try {
    const { prompts } = req.body;
    
    if (!Array.isArray(prompts) || prompts.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Array of prompts is required'
      });
    }
    
    const promptFilter = require('./prompt-filter');
    const results = promptFilter.filterPrompts(prompts, {
      strictMode: true,
      context: 'photography',
      allowReplacements: true,
      logChanges: false // Don't spam console for batch operations
    });
    
    const stats = promptFilter.getFilterStats(results);
    
    res.json({
      success: true,
      results: results,
      stats: stats
    });
  } catch (error) {
    console.error('Error in batch filter test:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// ================================
// API ROUTES - PARAMETERIZED PATHS
// ================================

// POST /api/generate/:recipeId - Main image generation endpoint
router.post('/api/generate/:recipeId', async (req, res) => {
  try {
    console.log('🐛 [GENERATE ROUTE DEBUG]');
    console.log('URL:', req.originalUrl);
    console.log('Method:', req.method);
    console.log('Params:', JSON.stringify(req.params, null, 2));
    console.log('Body:', JSON.stringify(req.body, null, 2));

    // Extract recipe ID (don't parse as integer yet)
    const rawRecipeId = req.params.recipeId;
    
    console.log(`🔍 Raw recipe ID from params: "${rawRecipeId}" (type: ${typeof rawRecipeId})`);
    
    // Check if recipe ID is missing or invalid
    if (!rawRecipeId || rawRecipeId === 'null' || rawRecipeId === 'undefined') {
      console.error('❌ Recipe ID is missing or invalid from URL parameters');
      return res.status(400).json({
        success: false,
        error: 'Recipe ID is required in URL path. Expected format: /api/generate/{recipeId}',
        received: {
          rawRecipeId: rawRecipeId,
          params: req.params,
          url: req.originalUrl
        }
      });
    }
    
    // Determine if it's a UUID or integer ID
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawRecipeId);
    const isInteger = /^\d+$/.test(rawRecipeId);
    
    let recipeId;
    if (isUUID) {
      recipeId = rawRecipeId;
      console.log(`✅ Detected UUID recipe ID: ${recipeId}`);
    } else if (isInteger) {
      recipeId = parseInt(rawRecipeId);
      console.log(`✅ Detected integer recipe ID: ${recipeId}`);
    } else {
      console.error(`❌ Recipe ID "${rawRecipeId}" is neither a valid UUID nor integer`);
      return res.status(400).json({
        success: false,
        error: `Recipe ID must be either a valid UUID or integer, received: "${rawRecipeId}"`
      });
    }
    
    const customPrompt = req.body.customPrompt || null;

    // Query database with appropriate ID type
    console.log(`🔍 Searching for recipe with ID: ${recipeId} (${isUUID ? 'UUID' : 'integer'})`);
    const recipe = await getOne("SELECT * FROM recipes WHERE id = ?", [recipeId]);
    
    if (!recipe) {
      console.error(`❌ Recipe ${recipeId} not found in database`);
      
      const sampleRecipes = await getAll("SELECT id, recipe_idea FROM recipes LIMIT 5");
      console.log('📋 Sample recipes in database:', sampleRecipes);
      
      return res.status(404).json({
        success: false,
        error: 'Recipe not found',
        searchedId: recipeId,
        idType: isUUID ? 'UUID' : 'integer'
      });
    }

    console.log(`✅ Found recipe: ${recipe.recipe_idea || recipe.title || 'Untitled'}`);

    // Check if user has access to this recipe
    const orgId = req.session.user.organizationId;
    const userId = req.session.user.role === 'employee' ? req.session.user.id : null;
    
    if (recipe.organization_id !== orgId || 
        (userId && recipe.owner_id !== userId)) {
      return res.status(403).json({
        success: false,
        error: 'You do not have permission to generate images for this recipe'
      });
    }

    // Check if there's already a pending/processing job for this recipe
    // Optional: Check for existing jobs but allow multiple
const existingJob = await getOne(`
  SELECT * FROM image_queue 
  WHERE recipe_id = ? AND status IN ('queued', 'processing')
`, [recipeId]);

if (existingJob) {
  console.log(`Recipe ${recipeId} already has a pending job, but allowing regeneration`);
}

    // Get Discord settings for this user's session
    console.log('✅ Retrieved Discord settings from user session');
    const discordSettings = await getDiscordSettingsFromApp(req);
    
    if (!discordSettings || !discordSettings.enableDiscord) {
      return res.status(400).json({
        success: false,
        error: 'Discord integration is not configured. Please check your settings.'
      });
    }

    // Prepare job data with correct ID type
    const jobData = {
      recipeId: recipeId,
      userId: req.session.user.id,
      organizationId: req.session.user.organizationId,
      websiteId: req.session.currentWebsiteId,
      customPrompt: customPrompt,
      discordSettings: discordSettings
    };

    console.log('📝 [QUEUE] Job data being sent to queue:', JSON.stringify(jobData, null, 2));
    
    // Validate all required fields are present
    if (!jobData.recipeId || !jobData.userId || !jobData.organizationId) {
      console.error('❌ Missing required fields for queue job:', {
        hasRecipeId: !!jobData.recipeId,
        hasUserId: !!jobData.userId,
        hasOrgId: !!jobData.organizationId
      });
      return res.status(400).json({
        success: false,
        error: 'Missing required user session data'
      });
    }

    // Add job to queue
    const queueResult = await imageQueueService.addToQueue(jobData);

    console.log(`✅ Successfully added recipe ${recipeId} to image generation queue`);

    res.json({
      success: true,
      message: 'Image generation queued successfully',
      jobId: queueResult.jobId,
      position: queueResult.position,
      estimatedCompletion: queueResult.estimatedCompletion,
      queueLength: queueResult.queueLength,
      recipeId: recipeId,
      recipeTitle: recipe.recipe_idea || recipe.title || 'Untitled'
    });
    
  } catch (error) {
    console.error('❌ Error queuing image generation:', error);
    console.error('❌ Error stack:', error.stack);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to queue image generation'
    });
  }
});

// POST /api/cancel-job/:jobId - Cancel a queued job
router.post('/api/cancel-job/:jobId', async (req, res) => {
  try {
    const jobId = req.params.jobId;
    const userId = req.session.user.id;
    
    const result = await imageQueueService.cancelJob(jobId, userId);
    
    if (result.success) {
      res.json({
        success: true,
        message: result.message
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.message
      });
    }
  } catch (error) {
    console.error('Error cancelling job:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// GET /api/recipe/:recipeId - Get images for a specific recipe (ENHANCED)
router.get('/api/recipe/:recipeId', async (req, res) => {
  try {
    const recipeId = req.params.recipeId;
    
    console.log(`🔍 [API] Checking images for recipe ID: ${recipeId}`);
    
    // STEP 1: Validate that the recipe exists first
    const recipe = await getOne("SELECT id, recipe_idea, organization_id FROM recipes WHERE id = ?", [recipeId]);
    
    if (!recipe) {
      console.log(`❌ [API] Recipe ${recipeId} not found in database`);
      return res.status(404).json({ 
        success: false, 
        error: 'Recipe not found',
        code: 'RECIPE_NOT_FOUND'
      });
    }
    
    console.log(`✅ [API] Recipe found: ${recipe.recipe_idea || 'Untitled'}`);
    
    // STEP 2: Check user permissions
    if (req.session && req.session.user) {
      const userOrgId = req.session.user.organizationId;
      const userId = req.session.user.role === 'employee' ? req.session.user.id : null;
      
      if (recipe.organization_id !== userOrgId) {
        console.log(`🚫 [API] User org ${userOrgId} doesn't match recipe org ${recipe.organization_id}`);
        return res.status(403).json({ 
          success: false, 
          error: 'Access denied',
          code: 'ACCESS_DENIED'
        });
      }
    }
    
    // STEP 3: Get all images for this recipe
    const images = await imageGenerator.getImagesForRecipe(recipeId);
    
    console.log(`📊 [API] Found ${images.length} images for recipe ${recipeId}`);
    
    // STEP 4: Check if there are any pending/generating jobs for this recipe
    const pendingJobs = await getAll(`
      SELECT status, created_at, started_at, error_message 
      FROM image_queue 
      WHERE recipe_id = ? AND status IN ('queued', 'processing')
      ORDER BY created_at DESC
    `, [recipeId]);
    
    console.log(`⏳ [API] Found ${pendingJobs.length} pending jobs for recipe ${recipeId}`);
    
    // STEP 5: Determine the overall status and provide appropriate response
    if (images.length > 0) {
      // Sort images by creation date (newest first)
      images.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      
      console.log(`✅ [API] Returning ${images.length} images for recipe ${recipeId}`);
      
      return res.json({ 
        success: true, 
        images,
        count: images.length,
        hasPendingJobs: pendingJobs.length > 0,
        pendingJobs: pendingJobs
      });
      
    } else if (pendingJobs.length > 0) {
      // No images yet, but generation is in progress
      const latestJob = pendingJobs[0];
      
      console.log(`⚙️ [API] No images yet, but generation in progress. Latest job status: ${latestJob.status}`);
      
      return res.json({
        success: true,
        images: [],
        count: 0,
        status: 'generating',
        message: 'Image generation in progress',
        generationStatus: {
          status: latestJob.status,
          startedAt: latestJob.started_at,
          createdAt: latestJob.created_at,
          error: latestJob.error_message
        }
      });
      
    } else {
      // No images and no pending jobs - check if generation was attempted recently
      const recentFailedJobs = await getAll(`
        SELECT status, created_at, error_message, retry_count
        FROM image_queue 
        WHERE recipe_id = ? AND status IN ('failed', 'cancelled')
        AND created_at > datetime('now', '-1 hour')
        ORDER BY created_at DESC
        LIMIT 1
      `, [recipeId]);
      
      if (recentFailedJobs.length > 0) {
        const failedJob = recentFailedJobs[0];
        
        console.log(`❌ [API] Recent failed job found for recipe ${recipeId}: ${failedJob.error_message}`);
        
        return res.json({
          success: true,
          images: [],
          count: 0,
          status: 'failed',
          message: 'Recent image generation failed',
          lastError: {
            status: failedJob.status,
            error: failedJob.error_message,
            retryCount: failedJob.retry_count,
            createdAt: failedJob.created_at
          }
        });
      }
      
      // Truly no images and no recent activity
      console.log(`📭 [API] No images found for recipe ${recipeId}, no pending jobs, no recent failures`);
      
      return res.json({
        success: true,
        images: [],
        count: 0,
        status: 'none',
        message: 'No images generated for this recipe yet'
      });
    }
    
  } catch (error) {
    console.error(`❌ [API] Error getting recipe images for ${req.params.recipeId}:`, error);
    
    // Check if it's a database connection error
    if (error.message.includes('database') || error.code === 'SQLITE_BUSY') {
      return res.status(503).json({ 
        success: false, 
        error: 'Database temporarily unavailable, please try again',
        code: 'DATABASE_BUSY',
        retry: true
      });
    }
    
    // Check if it's a connection/network error
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      return res.status(503).json({ 
        success: false, 
        error: 'Service temporarily unavailable',
        code: 'SERVICE_UNAVAILABLE',
        retry: true
      });
    }
    
    // Generic error
    return res.status(500).json({ 
      success: false, 
      error: error.message,
      code: 'INTERNAL_ERROR'
    });
  }
});

// GET /api/prompt/:recipeId - Get current prompt for a recipe
router.get('/api/prompt/:recipeId', async (req, res) => {
  try {
    const recipeId = req.params.recipeId;
    
    // First check if there are any images with prompts
    const recipeImage = await getOne(
      "SELECT * FROM recipe_images WHERE recipe_id = ? ORDER BY created_at DESC LIMIT 1",
      [recipeId]
    );
    
    if (recipeImage && recipeImage.prompt) {
      return res.json({
        success: true,
        prompt: recipeImage.prompt,
        status: recipeImage.status
      });
    }
    
    // If no image with prompt, get the Facebook content to extract MJ prompt
    const facebookContent = await getOne(
      "SELECT mj_prompt FROM facebook_content WHERE recipe_id = ?",
      [recipeId]
    );
    
    if (facebookContent && facebookContent.mj_prompt) {
      return res.json({
        success: true,
        prompt: facebookContent.mj_prompt,
        source: 'facebook'
      });
    }
    
    // If still no prompt, get the recipe and create a generic prompt
    const recipe = await getOne(
      "SELECT recipe_idea FROM recipes WHERE id = ?",
      [recipeId]
    );
    
    if (recipe) {
      const genericPrompt = `Professional food photography of ${recipe.recipe_idea}, natural lighting, food styling, shallow depth of field, mouth-watering, magazine quality, top view, soft shadows, textured background, garnished beautifully`;
      
      return res.json({
        success: true,
        prompt: genericPrompt,
        source: 'generic'
      });
    }
    
    // No recipe found
    return res.status(404).json({
      success: false,
      error: 'Recipe not found'
    });
    
  } catch (error) {
    console.error('Error getting recipe prompt:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// DELETE /api/images/:imageId - Delete a recipe image
router.delete('/api/images/:imageId', async (req, res) => {
  try {
    const imageId = req.params.imageId;
    await imageGenerator.deleteRecipeImage(imageId);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting image:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ================================
// EXPORT ROUTES
// ================================

// GET /export/csv - Export images to CSV
router.get('/export/csv', async (req, res) => {
  try {
    const csvData = await imageGenerator.exportImagesToCSV();
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=recipe-images.csv');
    res.send(csvData);
  } catch (error) {
    console.error('Error exporting images to CSV:', error);
    res.status(500).send('Error exporting images to CSV');
  }
});

// ================================
// TEST/DEBUG ROUTES (Development Only)
// ================================

if (process.env.NODE_ENV === 'development' || process.env.ENABLE_TEST_ROUTES === 'true') {
  
  // 🧪 Test route for parameters
  router.post('/api/test-route/:recipeId', (req, res) => {
    console.log('🧪 Test route called');
    console.log('Recipe ID from params:', req.params.recipeId);
    console.log('Type:', typeof req.params.recipeId);
    
    res.json({
      success: true,
      recipeId: req.params.recipeId,
      type: typeof req.params.recipeId,
      params: req.params,
      message: 'Test route working correctly'
    });
  });

  // 🧪 Test route for body data
  router.post('/api/test-body', (req, res) => {
    console.log('🧪 Test body route called');
    console.log('Body:', req.body);
    
    res.json({
      success: true,
      body: req.body,
      message: 'Test body route working correctly'
    });
  });

  // GET /api/test-simple-generation - Test simple generation
  router.get('/api/test-simple-generation', async (req, res) => {
    try {
      console.log('🧪 Testing simple image generation...');
      
      const client = MidjourneyClient.getInstance();
      
      // Ensure initialization
      if (!client.userId || !client.guildId) {
        console.log('⚠️ Client needs initialization...');
        await client.initialize();
      }
      
      // Add the test method if it doesn't exist
      if (!client.testDiscordInteraction) {
        client.testDiscordInteraction = async function() {
          try {
            console.log('🧪 Testing Discord interaction...');
            
            const testId = Date.now();
            const testPrompt = `test simple prompt ${testId}`;
            
            console.log(`🔍 Test unique ID: ${testId}`);
            
            // Submit test prompt
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
                    value: testPrompt
                  }
                ]
              }
            };
            
            console.log('📤 Submitting test interaction...');
            const response = await this.client.post('/interactions', params);
            
            console.log('✅ Interaction response:', response.status);
            
            // Wait and check for message
            console.log('⏳ Waiting 5 seconds then checking for message...');
            await new Promise(resolve => setTimeout(resolve, 5000));
            
            const messagesResponse = await this.client.get(`/channels/${this.channelId}/messages?limit=10`);
            const messages = messagesResponse.data;
            
            console.log(`📨 Retrieved ${messages.length} recent messages`);
            
            let found = false;
            for (let i = 0; i < messages.length; i++) {
              const msg = messages[i];
              console.log(`📝 Message ${i + 1}: ${msg.content.substring(0, 80)}...`);
              
              if (msg.content.includes(testId.toString())) {
                console.log('✅ SUCCESS: Test message found in Discord!');
                found = true;
                break;
              }
            }
            
            if (!found) {
              console.log('❌ PROBLEM: Test message NOT found in Discord');
            }
            
            return { success: found, testId: testId, messages: messages.length };
            
          } catch (error) {
            console.error('❌ Test failed:', error.message);
            return { success: false, error: error.message };
          }
        };
      }
      
      // Run the test
      const result = await client.testDiscordInteraction();
      
      res.json({
        success: true,
        testResult: result,
        message: result.success ? 
          'Discord interaction working correctly!' : 
          'Discord interaction has issues - check server logs'
      });
      
    } catch (error) {
      console.error('Test endpoint error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });
}

// ================================
// CLEANUP TASKS
// ================================

// Schedule periodic cleanup of old queue jobs
setInterval(async () => {
  try {
    const cleanedCount = await imageQueueService.cleanupOldJobs(7);
    if (cleanedCount > 0) {
      console.log(`🧹 Cleaned up ${cleanedCount} old image queue jobs`);
    }
  } catch (error) {
    console.error('Error in periodic queue cleanup:', error);
  }
}, 24 * 60 * 60 * 1000); // Run daily

module.exports = router;