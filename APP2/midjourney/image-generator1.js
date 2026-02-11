const MidjourneyClient = require('./midjourney-client');
const promptFilter = require('./prompt-filter'); 
const { getOne, getAll, runQuery } = require('../db');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const FormData = require('form-data');

/**
 * Simple translation function using free Google Translate API
 * @param {string} text - Text to translate
 * @param {string} targetLang - Target language (default: 'en')
 * @returns {Promise<string>} - Translated text
 */
async function translateText(text, targetLang = 'en') {
  if (!text || text.length < 3) return text;
  
  try {
    // Use Google Translate API (free version)
    const response = await axios.get('https://translate.googleapis.com/translate_a/single', {
      params: {
        client: 'gtx',
        sl: 'auto',      // auto-detect source language
        tl: targetLang,  // target language (default: English)
        dt: 't',         // return translated text
        q: text          // text to translate
      }
    });
    
    if (response.data && response.data[0]) {
      // Extract translated text
      const translatedText = response.data[0]
        .map(segment => segment[0])
        .join('');
      
      // Get detected source language
      const detectedLang = response.data[2] || 'unknown';
      
      // Only log if not already in target language
      if (detectedLang !== targetLang) {
        console.log(`🌐 [TRANSLATE] "${text}" (${detectedLang}) → "${translatedText}" (${targetLang})`);
      }
      
      return translatedText;
    }
    
    return text; // Fallback to original text
  } catch (error) {
    console.error(`❌ [TRANSLATE] Error translating text: ${error.message}`);
    return text; // Fallback to original text
  }
}

/**
 * Detect and translate recipe components in a prompt to English
 * @param {string} prompt - The complete prompt text
 * @returns {Promise<string>} - Prompt with recipe components translated to English
 */
async function translateRecipeComponentsInPrompt(prompt) {
  if (!prompt) return prompt;
  
  console.log('🌐 [TRANSLATE] Checking prompt for recipe components to translate');
  
  // STEP 1: First translate the entire prompt to identify all text that needs translation
  // This ensures we catch everything, even if the format is unusual
  const completeTranslatedPrompt = await translateText(prompt);
  
  // STEP 2: Identify key sections in both original and translated prompts
  const sections = [
    {
      name: 'recipe title',
      regex: /Recipe:\s*([^.]+)(?:\.|\n|$)/i,
      translationNeeded: true
    },
    {
      name: 'ingredients',
      // Match ingredients section - flexible to catch variations like "ingr", "ingredients:", etc.
      regex: /(?:ingr\w*:?|ingredients:?)\s*((?:(?:[^.]*?,)+[^.]*?)(?:\.|\n|$))/i,
      translationNeeded: true
    },
    {
      name: 'plating description',
      regex: /(A close-up shot[^.]+\.)/i,
      translationNeeded: false // We don't need to translate this part
    },
    {
      name: 'midjourney params',
      regex: /(-+v\s+[\d.]+\s+-+s\s+\d+)/i,
      translationNeeded: false // Don't translate Midjourney parameters
    }
  ];
  
  // Start with the original prompt
  let resultPrompt = prompt;
  
  // Process each section
  for (const section of sections) {
    const originalMatch = prompt.match(section.regex);
    
    if (originalMatch && originalMatch[1]) {
      // If this section needs translation
      if (section.translationNeeded) {
        const originalText = originalMatch[1].trim();
        const translatedText = await translateText(originalText);
        
        if (translatedText !== originalText) {
          console.log(`🌐 [TRANSLATE] ${section.name}: "${originalText}" → "${translatedText}"`);
          
          // Replace in the result prompt
          resultPrompt = resultPrompt.replace(originalMatch[0], originalMatch[0].replace(originalText, translatedText));
        }
      }
    }
  }
  
  // For ingredients specifically, we need to handle individual ingredients too
  const ingredientsSection = sections.find(s => s.name === 'ingredients');
  const ingredientsMatch = prompt.match(ingredientsSection.regex);
  
  if (ingredientsMatch && ingredientsMatch[1]) {
    // Extract the ingredients list
    const ingredientsList = ingredientsMatch[1].trim();
    
    // Split by commas
    const ingredients = ingredientsList.split(',').map(ing => ing.trim()).filter(Boolean);
    
    // Translate each ingredient individually
    let translatedIngredientsList = ingredientsList;
    
    for (const ingredient of ingredients) {
      if (ingredient.length > 2) {
        const translatedIngredient = await translateText(ingredient);
        
        if (translatedIngredient !== ingredient) {
          console.log(`🌐 [TRANSLATE] Ingredient: "${ingredient}" → "${translatedIngredient}"`);
          
          // Replace the ingredient in the ingredients list
          // Use word boundary or ensure we're replacing the exact ingredient
          translatedIngredientsList = translatedIngredientsList.replace(
            new RegExp(`(^|,\\s*)${ingredient.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(,|$)`, 'g'),
            `$1${translatedIngredient}$2`
          );
        }
      }
    }
    
    // Replace the ingredients list in the result prompt
    if (translatedIngredientsList !== ingredientsList) {
      resultPrompt = resultPrompt.replace(ingredientsList, translatedIngredientsList);
    }
  }
  
  // Check if the ingredients prefix needs to be fixed
  const malformedIngredientsPrefixMatch = resultPrompt.match(/\b(ingr\w*:?)\b/i);
  if (malformedIngredientsPrefixMatch && malformedIngredientsPrefixMatch[1] !== 'ingredients:') {
    // Fix the ingredients prefix
    resultPrompt = resultPrompt.replace(malformedIngredientsPrefixMatch[1], 'ingredients:');
    console.log(`🌐 [TRANSLATE] Fixed ingredients prefix: "${malformedIngredientsPrefixMatch[1]}" → "ingredients:"`);
  }
  
  // Final validation and cleaning
  resultPrompt = resultPrompt
    // Remove any double periods
    .replace(/\.\./g, '.')
    // Fix any comma spacing issues
    .replace(/,\s*,/g, ',')
    .replace(/\s+/g, ' ')
    // Fix any artifacts from translation
    .replace(/üsebrühe/g, 'vegetable broth');
  
  return resultPrompt;
}

/**
 * Generate prompt from recipe data with translation to English for Midjourney
 * @param {Object} recipe - Recipe data
 * @param {string} imageUrl - Optional image URL for reference
 * @returns {Promise<string>} Generated prompt
 */
async function generatePrompt(recipe, imageUrl = null) {
  console.log(`🌐 [TRANSLATE] Starting prompt generation with translation for recipe: ${recipe.recipe_idea}`);
  
  // Use recipe_idea instead of title
  const recipeIdea = recipe.recipe_idea || '';
  
  // Extract ingredients if available (limit to first 3 main ingredients)
  let ingredients = '';
  try {
    if (recipe.ingredients) {
      // Try parsing as JSON if it's stored that way
      const ingredientsData = typeof recipe.ingredients === 'string' 
        ? JSON.parse(recipe.ingredients) 
        : recipe.ingredients;
      
      if (Array.isArray(ingredientsData)) {
        ingredients = ingredientsData
          .slice(0, 3)
          .map(ing => typeof ing === 'string' ? ing : ing.name || ing.ingredient || '')
          .filter(ing => ing)
          .join(', ');
      } else if (typeof recipe.ingredients === 'string') {
        // If it's a plain string, use the first part
        ingredients = recipe.ingredients.split(',').slice(0, 3).join(', ');
      }
    }
  } catch (error) {
    // If JSON parsing fails, try using it as a string
    if (typeof recipe.ingredients === 'string') {
      ingredients = recipe.ingredients.split(',').slice(0, 3).join(', ');
    }
    console.error('Error parsing ingredients:', error.message);
  }
  
  // Translate recipe idea and ingredients to English
  console.log('🌐 [TRANSLATE] Translating recipe text to English for better Midjourney results');
  const translatedRecipeIdea = await translateText(recipeIdea);
  const translatedIngredients = await translateText(ingredients);
  
  // Log translation results
  if (translatedRecipeIdea !== recipeIdea) {
    console.log(`🌐 [TRANSLATE] Recipe idea: "${recipeIdea}" → "${translatedRecipeIdea}"`);
  }
  
  if (translatedIngredients !== ingredients) {
    console.log(`🌐 [TRANSLATE] Ingredients: "${ingredients}" → "${translatedIngredients}"`);
  }
  
  // Create the core prompt with the TRANSLATED recipe idea
  let prompt = `Professional food photography of ${translatedRecipeIdea}`;
  
  // Add TRANSLATED ingredients if available
  if (translatedIngredients) {
    prompt += `, with ${translatedIngredients} visible`;
  }
  
  // Add styling details for better food photography
  prompt += ", on a beautiful plate, soft natural lighting, shallow depth of field, high-end restaurant presentation, professional food photography, 4k, detailed, award-winning food photography";
  
  // FIXED: Correct Midjourney syntax for image URLs
  // Image URL should go at the BEGINNING, not at the end with --seed
  if (imageUrl && imageUrl.trim()) {
    console.log(`🖼️ [PROMPT] Adding reference image URL: ${imageUrl.trim()}`);
    // Put image URL at the start, followed by the prompt, then image weight parameter
    prompt = `${imageUrl.trim()} ${prompt}`;
    console.log(`🖼️ [PROMPT] Final prompt with image: ${prompt}`);
  }
  
  return prompt;
}

/**
 * Filter and sanitize prompt for Midjourney safety
 * @param {string} originalPrompt - Original prompt text
 * @param {Object} options - Filtering options
 * @returns {Object} Filter result with success status and filtered prompt
 */
function filterPromptForMidjourney(originalPrompt, options = {}) {
  try {
    console.log('🔍 [FILTER] Original prompt:', originalPrompt);
    
    const filterResult = promptFilter.filterPrompt(originalPrompt, {
      strictMode: true,
      context: 'photography', // Food photography context
      allowReplacements: true,
      logChanges: true,
      ...options
    });
    
    if (!filterResult.success) {
      console.error('❌ [FILTER] Prompt filtering failed:', filterResult.error);
      return {
        success: false,
        error: filterResult.error,
        originalPrompt: originalPrompt,
        filteredPrompt: null,
        changes: filterResult.changes || [],
        warnings: filterResult.warnings || []
      };
    }
    
    if (filterResult.changes.length > 0) {
      console.log('✅ [FILTER] Prompt successfully filtered with', filterResult.changes.length, 'changes');
      console.log('📝 [FILTER] Filtered prompt:', filterResult.filteredPrompt);
    } else {
      console.log('✅ [FILTER] Prompt passed without changes needed');
    }
    
    return {
      success: true,
      originalPrompt: originalPrompt,
      filteredPrompt: filterResult.filteredPrompt,
      changes: filterResult.changes,
      warnings: filterResult.warnings || []
    };
    
  } catch (error) {
    console.error('💥 [FILTER] Error during prompt filtering:', error);
    return {
      success: false,
      error: 'Prompt filtering system error: ' + error.message,
      originalPrompt: originalPrompt,
      filteredPrompt: originalPrompt, // Use original as fallback
      changes: [],
      warnings: []
    };
  }
}

/**
 * Upload image to ImgBB and get public URL
 * @param {string} imagePath - Local path to image
 * @returns {Promise<string>} Public URL
 */
async function uploadToImgBB(imagePath) {
  try {
    const form = new FormData();
    
    // Read the image file
    const imageData = fs.readFileSync(imagePath);
    const base64Image = imageData.toString('base64');
    
    // ImgBB free API (no key needed for anonymous uploads)
    form.append('image', base64Image);
    
    const response = await axios.post(
      'https://api.imgbb.com/1/upload?key=47dd7be8bc701b74748639c2823c4c94', // Free public key
      form,
      {
        headers: form.getHeaders()
      }
    );
    
    if (response.data && response.data.data && response.data.data.url) {
      console.log('✅ Image uploaded to ImgBB:', response.data.data.url);
      return response.data.data.url;
    }
    
    throw new Error('Failed to get URL from ImgBB');
  } catch (error) {
    console.error('❌ ImgBB upload error:', error.message);
    throw error;
  }
}

/**
 * Upload base64 data URL to ImgBB and get public URL
 * @param {string} dataUrl - Base64 data URL (e.g., from cropped images)
 * @returns {Promise<string>} Public URL
 */
async function uploadBase64ToImgBB(dataUrl) {
  try {
    console.log('🔄 [IMGBB] Uploading base64 data URL to ImgBB...');
    
    // Extract base64 data from data URL (remove data:image/jpeg;base64, prefix)
    const base64Data = dataUrl.split(',')[1];
    if (!base64Data) {
      throw new Error('Invalid data URL format');
    }
    
    const form = new FormData();
    form.append('image', base64Data);
    
    const response = await axios.post(
      'https://api.imgbb.com/1/upload?key=47dd7be8bc701b74748639c2823c4c94', // Free public key
      form,
      {
        headers: form.getHeaders(),
        timeout: 30000 // 30 second timeout
      }
    );
    
    if (response.data && response.data.data && response.data.data.url) {
      console.log('✅ [IMGBB] Cropped image uploaded successfully:', response.data.data.url);
      return response.data.data.url;
    }
    
    throw new Error('Failed to get URL from ImgBB response');
  } catch (error) {
    console.error('❌ [IMGBB] Base64 upload error:', error.message);
    throw new Error(`ImgBB upload failed: ${error.message}`);
  }
}

/**
 * FIXED: Helper function to add image URL to existing prompt with correct syntax
 * @param {string} existingPrompt - The existing prompt text
 * @param {string} imageUrl - The image URL to add
 * @returns {Promise<string>} Updated prompt with correct image URL syntax
 */
async function addImageUrlToPrompt(existingPrompt, imageUrl, forceUpload = false) {
  if (!imageUrl || !imageUrl.trim()) {
    return existingPrompt;
  }

  let cleanImageUrl = imageUrl.trim();
  
  // If it's a local path, localhost URL, or base64 data URL, upload to ImgBB
  if (cleanImageUrl.startsWith('/recipe_images/') || 
      cleanImageUrl.includes('localhost') || 
      cleanImageUrl.includes('127.0.0.1') ||
      cleanImageUrl.startsWith('data:image/') ||
      forceUpload) {
    
    console.log('🔄 Uploading image to ImgBB for public access...');
    
    let uploadResult;
    
    if (cleanImageUrl.startsWith('data:image/')) {
      // Handle base64 data URL (from cropped images)
      console.log('📷 Processing base64 data URL from cropped image...');
      try {
        uploadResult = await uploadBase64ToImgBB(cleanImageUrl);
        cleanImageUrl = uploadResult;
      } catch (error) {
        console.error('❌ Failed to upload base64 data URL:', error.message);
        return existingPrompt;
      }
    } else {
      // Handle file paths (original logic)
      let localPath;
      if (cleanImageUrl.startsWith('/recipe_images/')) {
        localPath = path.join(__dirname, '..', cleanImageUrl);
      } else if (cleanImageUrl.includes('localhost')) {
        // Extract path from localhost URL
        const urlPath = cleanImageUrl.split('localhost:3000')[1];
        localPath = path.join(__dirname, '..', urlPath);
      } else {
        localPath = cleanImageUrl;
      }
      
      try {
        // Upload and get public URL
        cleanImageUrl = await uploadToImgBB(localPath);
      } catch (error) {
        console.error('❌ Failed to upload image file, continuing without image reference');
        return existingPrompt;
      }
    }
  }
  
  // Now add the public URL to the prompt
  if (existingPrompt.startsWith(cleanImageUrl)) {
    return existingPrompt;
  }
  
  if (existingPrompt.startsWith('http')) {
    const firstSpaceIndex = existingPrompt.indexOf(' ');
    if (firstSpaceIndex > 0) {
      const restOfPrompt = existingPrompt.substring(firstSpaceIndex + 1);
      return `${cleanImageUrl} ${restOfPrompt}`;
    }
  }
  
  let cleanPrompt = existingPrompt.replace(/--iw\s+[\d.]+/g, '').trim();
  return `${cleanImageUrl} ${cleanPrompt}`;
}

/**
 * ENHANCED: Generate image for recipe with Discord settings support - FIXED IMAGE URL HANDLING
 * @param {integer} recipeId - Recipe ID
 * @param {Object} discordSettings - Discord settings object
 * @returns {Object} Result with status and image information
 */
// ENHANCED generateImageForRecipeWithSettings function with comprehensive debugging
// Replace your existing function in image-generator.js with this version

async function generateImageForRecipeWithSettings(recipeId, discordSettings = null, passedImageUrl = null) {
  console.log(`🎨 [DEBUG] Starting image generation with Discord settings for recipe ID: ${recipeId}`);
  console.log(`🔍 [DEBUG] Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔍 [DEBUG] Discord settings provided:`, {
    hasSettings: !!discordSettings,
    enableDiscord: discordSettings?.enableDiscord,
    hasChannelId: !!discordSettings?.discordChannelId,
    hasUserToken: !!discordSettings?.discordUserToken,
    hasWebhookUrl: !!discordSettings?.discordWebhookUrl
  });
  
  let imageId = null;
  let processingStartTime = Date.now();
  
  try {
    // STEP 1: Validate Discord settings FIRST - this is critical
    if (!discordSettings) {
      console.error(`❌ [DEBUG] No Discord settings provided - this will cause immediate failure`);
      throw new Error('Discord settings are required for image generation');
    }
    
    if (!discordSettings.enableDiscord) {
      console.error(`❌ [DEBUG] Discord is disabled in settings - this will cause immediate failure`);
      throw new Error('Discord integration is disabled');
    }
    
    if (!discordSettings.discordChannelId || !discordSettings.discordUserToken) {
      console.error(`❌ [DEBUG] Missing Discord credentials:`, {
        hasChannelId: !!discordSettings.discordChannelId,
        hasUserToken: !!discordSettings.discordUserToken
      });
      throw new Error('Discord channel ID and user token are required');
    }
    
    console.log(`✅ [DEBUG] Discord settings validation passed`);
    
    // STEP 2: Get recipe data from the database
    console.log(`🔍 [DEBUG] Fetching recipe data for ID: ${recipeId}`);
    const recipe = await getOne("SELECT * FROM recipes WHERE id = ?", [recipeId]);
    
    if (!recipe) {
      throw new Error(`Recipe not found with ID: ${recipeId}`);
    }
    
    console.log(`✅ [DEBUG] Found recipe: ${recipe.recipe_idea}`);
    
    // STEP 3: Check for existing pending/generating images
    const existingImages = await getAll(
      "SELECT * FROM recipe_images WHERE recipe_id = ? AND status IN ('pending', 'generating') ORDER BY created_at DESC",
      [recipeId]
    );
    
    if (existingImages.length > 0) {
      console.log(`⚠️ [DEBUG] Recipe ${recipeId} already has ${existingImages.length} pending/generating image(s)`);
      // Return existing job info instead of creating new one
      return {
        id: existingImages[0].id,
        success: false,
        error: 'Image generation already in progress',
        existing: true
      };
    }
    
    // STEP 4: Handle image URL
    let imageUrl = passedImageUrl;
    if (imageUrl) {
      console.log(`✅ [DEBUG] Using passed imageUrl: ${imageUrl}`);
    } else {
      console.log(`🔍 [DEBUG] Looking up imageUrl from database`);
      const keyword = await getOne(
        "SELECT * FROM keywords WHERE recipe_id = ? ORDER BY added_at DESC LIMIT 1", 
        [recipeId]
      );
      imageUrl = keyword && keyword.image_url ? keyword.image_url : null;
      
      if (imageUrl) {
        console.log(`✅ [DEBUG] Found imageUrl from database: ${imageUrl}`);
      } else {
        console.log(`ℹ️ [DEBUG] No imageUrl found - proceeding without reference image`);
      }
    }
    
    // STEP 5: Generate or get prompt
    console.log(`🔍 [DEBUG] Getting prompt for image generation`);
    const facebookContent = await getOne(
      "SELECT * FROM facebook_content WHERE recipe_id = ? ORDER BY id DESC LIMIT 1",
      [recipeId]
    );
    
    let originalPrompt = '';
    
    if (facebookContent && facebookContent.mj_prompt) {
      originalPrompt = facebookContent.mj_prompt;
      console.log(`📄 [DEBUG] Using existing mj_prompt from database`);
      
      if (imageUrl) {
        originalPrompt = await addImageUrlToPrompt(originalPrompt, imageUrl);
        console.log(`🖼️ [DEBUG] Added image URL to existing prompt`);
      }
    } else {
      console.log(`🆕 [DEBUG] Generating new prompt`);
      originalPrompt = await generatePrompt(recipe, imageUrl);
    }
    
    console.log(`🎯 [DEBUG] Final prompt length: ${originalPrompt.length} characters`);
    
    // STEP 6: Filter the prompt
    console.log(`🔍 [DEBUG] Filtering prompt for safety`);
    const filterResult = filterPromptForMidjourney(originalPrompt);
    
    if (!filterResult.success) {
      console.error(`❌ [DEBUG] Prompt filtering failed: ${filterResult.error}`);
      throw new Error(`Prompt contains prohibited content: ${filterResult.error}`);
    }
    
    const finalPrompt = filterResult.filteredPrompt;
    console.log(`✅ [DEBUG] Prompt filtering completed successfully`);
    
    // STEP 7: Create database record with UUID
    console.log(`💾 [DEBUG] Creating database record`);
    const recordId = uuidv4();
    imageId = recordId;
    
    console.log(`🆔 [DEBUG] Generated UUID: ${recordId}`);
    
    try {
      const result = await runQuery(
        "INSERT INTO recipe_images (id, recipe_id, prompt, image_path, status, filter_changes) VALUES (?, ?, ?, ?, ?, ?)",
        [recordId, recipeId, finalPrompt, '', 'pending', JSON.stringify(filterResult.changes)]
      );
      
      console.log(`✅ [DEBUG] Database record created successfully`);
      console.log(`📊 [DEBUG] Insert result:`, result);
      
      // Verify the record was created
      const verifyCreation = await getOne(
        "SELECT id, recipe_id, status FROM recipe_images WHERE id = ?",
        [imageId]
      );
      
      if (!verifyCreation) {
        throw new Error(`Failed to verify database record creation with ID ${imageId}`);
      }
      
      console.log(`✅ [DEBUG] Record creation verified:`, verifyCreation);
      
    } catch (dbError) {
      console.error(`❌ [DEBUG] Database record creation failed:`, dbError);
      throw new Error(`Database record creation failed: ${dbError.message}`);
    }
    
    // STEP 8: Initialize Midjourney client with settings
    console.log(`🤖 [DEBUG] Initializing Midjourney client`);
    
    try {
      // Add random delay before starting (human-like behavior)
      const initialDelay = Math.random() * 3000 + 2000; // 2-5 seconds
      console.log(`⏳ [DEBUG] Waiting ${Math.round(initialDelay/1000)}s before starting...`);
      await new Promise(resolve => setTimeout(resolve, initialDelay));
      
      // Reset any existing instance to ensure fresh settings
      MidjourneyClient.resetInstance();
      
      // Get client with Discord settings
      const client = MidjourneyClient.getInstance(discordSettings);
      
      console.log(`✅ [DEBUG] Midjourney client initialized`);
      
      // STEP 9: Update status to 'generating'
      console.log(`🔄 [DEBUG] Updating status to 'generating'`);
      
      await runQuery(
        "UPDATE recipe_images SET status = ? WHERE id = ?",
        ['generating', imageId]
      );
      
      // Verify the status update
      const verifyGenerating = await getOne(
        "SELECT id, status FROM recipe_images WHERE id = ?",
        [imageId]
      );
      
      if (verifyGenerating.status !== 'generating') {
        throw new Error(`Failed to update status to generating - current status: ${verifyGenerating.status}`);
      }
      
      console.log(`✅ [DEBUG] Status updated to 'generating' successfully`);
      
      // STEP 10: Generate image with Midjourney
      console.log(`🎨 [DEBUG] Starting Midjourney image generation...`);
      console.log(`📝 [DEBUG] Prompt: ${finalPrompt.substring(0, 200)}...`);
      
      const mjStartTime = Date.now();
      
      // Translate recipe components in the prompt
      const translatedFinalPrompt = await translateRecipeComponentsInPrompt(finalPrompt);
      if (translatedFinalPrompt !== finalPrompt) {
        console.log(`🌐 [DEBUG] Translated recipe components in prompt`);
      }
      
      // Create the image (this is the long-running operation)
      const mjResult = await client.createImage(translatedFinalPrompt, '--v 6 --q 2', null);
      
      const mjEndTime = Date.now();
      const mjDuration = mjEndTime - mjStartTime;
      
      console.log(`⏱️ [DEBUG] Midjourney generation took: ${mjDuration}ms (${Math.round(mjDuration/1000)}s)`);
      console.log(`📊 [DEBUG] Midjourney result:`, {
        hasResult: !!mjResult,
        hasUpscaledUrl: !!(mjResult && mjResult.upscaled_photo_url),
        hasGridInfo: !!(mjResult && mjResult.grid_info),
        messageId: mjResult ? mjResult.imagine_message_id : null
      });
      
      if (!mjResult) {
        throw new Error('No result returned from Midjourney client');
      }
      
      // STEP 11: Process the result and find the image file
      console.log(`📁 [DEBUG] Processing Midjourney result and locating image file...`);
      
      let imagePath = '';
      let resultImageUrl = '';
      let succeeded = false;
      
      // Check for upscaled_photo_url first (this is the grid image)
      if (mjResult.upscaled_photo_url) {
        console.log(`🖼️ [DEBUG] Processing upscaled_photo_url: ${mjResult.upscaled_photo_url}`);
        resultImageUrl = mjResult.upscaled_photo_url;
        
        if (mjResult.upscaled_photo_url.includes('/recipe_images/')) {
          // This is a local file path already, extract just the filename
          imagePath = mjResult.upscaled_photo_url.split('/').pop();
          succeeded = true;
          console.log(`✅ [DEBUG] Found local image path: ${imagePath}`);
        } else {
          // Look for recently created files that match our pattern
          const recipeImagesDir = path.join(process.cwd(), 'recipe_images');
          console.log(`🔍 [DEBUG] Checking for recently downloaded files in: ${recipeImagesDir}`);
          
          if (fs.existsSync(recipeImagesDir)) {
            const files = fs.readdirSync(recipeImagesDir);
            console.log(`📁 [DEBUG] Found ${files.length} files in recipe_images directory`);
            
            const recentFiles = files.filter(file => {
              if (!file.startsWith('grid_') || !file.endsWith('.webp')) return false;
              const filePath = path.join(recipeImagesDir, file);
              const stats = fs.statSync(filePath);
              const now = Date.now();
              const fileAge = now - stats.mtime.getTime();
              return fileAge < 120000; // Within last 2 minutes (increased from 1 minute)
            }).sort((a, b) => {
              const aPath = path.join(recipeImagesDir, a);
              const bPath = path.join(recipeImagesDir, b);
              const aStats = fs.statSync(aPath);
              const bStats = fs.statSync(bPath);
              return bStats.mtime.getTime() - aStats.mtime.getTime(); // Newest first
            });
            
            console.log(`🔍 [DEBUG] Found ${recentFiles.length} recent grid files:`, recentFiles);
            
            if (recentFiles.length > 0) {
              imagePath = recentFiles[0];
              succeeded = true;
              console.log(`✅ [DEBUG] Using recently downloaded grid image: ${imagePath}`);
            } else {
              console.log(`⚠️ [DEBUG] No recent grid images found, marking as failed`);
              succeeded = false;
            }
          } else {
            console.log(`❌ [DEBUG] Recipe images directory does not exist: ${recipeImagesDir}`);
            succeeded = false;
          }
        }
      } else if (mjResult.grid_info && mjResult.grid_info.grid_url) {
        console.log(`🖼️ [DEBUG] Processing grid_info.grid_url: ${mjResult.grid_info.grid_url}`);
        // Similar logic for grid_info...
        resultImageUrl = mjResult.grid_info.grid_url;
        // [Include similar file checking logic]
      } else {
        console.log(`❌ [DEBUG] No valid image URL found in Midjourney result`);
        succeeded = false;
      }
      
      // STEP 12: Update database with final result
      const finalStatus = succeeded ? 'completed' : 'failed';
      const errorMessage = succeeded ? null : 'Image file not found after generation';
      
      console.log(`💾 [DEBUG] Updating database with final result:`);
      console.log(`   Status: ${finalStatus}`);
      console.log(`   Image Path: ${imagePath || 'None'}`);
      console.log(`   Error: ${errorMessage || 'None'}`);
      
      try {
        const updateResult = await runQuery(
          "UPDATE recipe_images SET image_path = ?, discord_message_id = ?, status = ?, error = ? WHERE id = ?",
          [imagePath, mjResult.imagine_message_id || null, finalStatus, errorMessage, imageId]
        );

        // 🔒 Close any other in-flight rows for this recipe so UI won't stay "Generating"
await runQuery(
  "UPDATE recipe_images " +
  "SET status = 'failed', " +
  "    error = COALESCE(error, 'superseded by newer attempt'), " +
  "    updated_at = CURRENT_TIMESTAMP " +
  "WHERE recipe_id = ? AND id <> ? AND status IN ('pending','generating')",
  [recipeId, imageId]
);

        
        console.log(`📊 [DEBUG] Update result:`, updateResult);
        
        // Verify the update
        const verifiedRecord = await getOne(
          "SELECT id, recipe_id, status, image_path, error FROM recipe_images WHERE id = ?",
          [imageId]
        );
        
        if (!verifiedRecord) {
          throw new Error(`Record ${imageId} not found after update`);
        }
        
        if (verifiedRecord.status !== finalStatus) {
          throw new Error(`Status update failed - expected "${finalStatus}" but got "${verifiedRecord.status}"`);
        }
        
        console.log(`✅ [DEBUG] Database update completed successfully`);
        console.log(`📋 [DEBUG] Final record state:`, verifiedRecord);
        
      } catch (updateError) {
        console.error(`❌ [DEBUG] Database update failed:`, updateError);
        throw new Error(`Database update failed: ${updateError.message}`);
      }
      
      // STEP 13: Return result
      const totalDuration = Date.now() - processingStartTime;
      console.log(`🎉 [DEBUG] Image generation completed in ${totalDuration}ms (${Math.round(totalDuration/1000)}s)`);
      
      if (succeeded) {
        return {
          id: imageId,
          imagePath: imagePath,
          imageUrl: resultImageUrl,
          success: true,
          note: mjResult.note || 'Grid image processed successfully',
          filterResult: filterResult,
          processingTimeMs: totalDuration
        };
      } else {
        return {
          id: imageId,
          error: errorMessage || 'Image generation completed but file not found',
          success: false,
          filterResult: filterResult,
          processingTimeMs: totalDuration
        };
      }
      
    } catch (mjError) {
      console.error(`❌ [DEBUG] Midjourney generation error:`, mjError);
      
      // Update database with error
      try {
        await runQuery(
          "UPDATE recipe_images SET status = ?, error = ? WHERE id = ?",
          ['failed', mjError.message, imageId]
        );
        // Also close any other stale rows for this recipe
await runQuery(
  "UPDATE recipe_images " +
  "SET status = 'failed', " +
  "    error = COALESCE(error, 'stale after error'), " +
  "    updated_at = CURRENT_TIMESTAMP " +
  "WHERE recipe_id = ? AND id <> ? AND status IN ('pending','generating')",
  [recipeId, imageId]
);

        console.log(`📝 [DEBUG] Updated database with Midjourney error`);
      } 
      catch (updateError) {
        console.error(`❌ [DEBUG] Failed to update database with error:`, updateError);
      }
      
      throw mjError;
    }
    
  } catch (error) {
    const totalDuration = Date.now() - processingStartTime;
    console.error(`❌ [DEBUG] Error generating image for recipe ${recipeId} after ${totalDuration}ms:`, error.message);
    console.error(`📚 [DEBUG] Full error stack:`, error.stack);
    
    // If we created a database record, update it with error status
    if (imageId) {
      try {
        await runQuery(
          "UPDATE recipe_images SET status = ?, error = ? WHERE id = ?",
          ['failed', error.message, imageId]
        );

        // Final cleanup to prevent stuck "Generating" in the UI
await runQuery(
  "UPDATE recipe_images " +
  "SET status = 'failed', " +
  "    error = COALESCE(error, 'auto-closed pending after failure'), " +
  "    updated_at = CURRENT_TIMESTAMP " +
  "WHERE recipe_id = ? AND id <> ? AND status IN ('pending','generating')",
  [recipeId, imageId]
);

        console.log(`📝 [DEBUG] Updated database record ${imageId} with failed status`);
      } catch (updateError) {
        console.error(`❌ [DEBUG] Error updating failed status:`, updateError.message);
      }
    }
    
    return {
      id: imageId,
      error: error.message,
      success: false,
      processingTimeMs: totalDuration
    };
  }
}

/**
 * UPDATED: Process a recipe and generate an image (now properly gets Discord settings)
 * @param {integer} recipeId - Recipe ID
 * @returns {Object} Result with status and image information
 */
// FIXED: Replace the generateImageForRecipe function in image-generator.js
async function generateImageForRecipe(recipeId) {
  try {
    console.log(`🎨 Starting image generation for recipe ID: ${recipeId}`);
    
    // CRITICAL FIX: Get Discord settings using the SAME method as the connection test
    let discordSettings = null;
    
    try {
      console.log('🔍 [IMAGE-GEN] Getting Discord settings for image generation...');
      
      // METHOD 1: Try global sync helper first (this should match the connection test)
      if (global.getCurrentDiscordSettings) {
        console.log('🔍 [IMAGE-GEN] Trying global.getCurrentDiscordSettings...');
        discordSettings = global.getCurrentDiscordSettings();
        
        if (discordSettings && discordSettings.discordChannelId && discordSettings.discordUserToken) {
          console.log('✅ [IMAGE-GEN] Got Discord settings from global sync helper');
          console.log(`   📍 Source: ${discordSettings.source}`);
          console.log(`   📺 Channel: ${discordSettings.discordChannelId}`);
          console.log(`   🔐 Token: ${discordSettings.discordUserToken.substring(0, 10)}...`);
          console.log(`   🏢 Organization: ${discordSettings.organizationId}`);
          console.log(`   🌐 Website: ${discordSettings.websiteId}`);
        } else {
          console.log('⚠️ [IMAGE-GEN] Global sync helper returned incomplete settings');
          console.log(`   Available settings:`, discordSettings);
          discordSettings = null;
        }
      }
      
      // METHOD 2: Try direct database access (async version) - ONLY if method 1 failed
      if (!discordSettings) {
        console.log('🔍 [IMAGE-GEN] Trying direct database access...');
        const { getOne } = require('../db');
        
        try {
          const channelId = await getOne(
            "SELECT setting_value FROM app_settings WHERE setting_key = 'discord_channel_id'"
          );
          const userToken = await getOne(
            "SELECT setting_value FROM app_settings WHERE setting_key = 'discord_user_token'"
          );
          const enableDiscord = await getOne(
            "SELECT setting_value FROM app_settings WHERE setting_key = 'enable_discord'"
          );
          
          if (channelId && userToken && channelId.setting_value && userToken.setting_value) {
            discordSettings = {
              discordChannelId: channelId.setting_value.trim(),
              discordUserToken: userToken.setting_value.trim(),
              enableDiscord: enableDiscord ? enableDiscord.setting_value === 'true' : true,
              source: 'database-direct'
            };
            console.log('✅ [IMAGE-GEN] Got Discord settings from direct database access');
            console.log(`   📺 Channel: ${discordSettings.discordChannelId}`);
            console.log(`   🔐 Token: ${discordSettings.discordUserToken.substring(0, 10)}...`);
          } else {
            console.log('⚠️ [IMAGE-GEN] Database query returned incomplete Discord settings');
            console.log(`   Channel ID result:`, channelId);
            console.log(`   User Token result:`, userToken ? 'PRESENT' : 'MISSING');
          }
        } catch (dbError) {
          console.error('❌ [IMAGE-GEN] Database query for Discord settings failed:', dbError.message);
        }
      }
      
      // METHOD 3: Try environment variables as final fallback
      if (!discordSettings) {
        console.log('🔍 [IMAGE-GEN] Trying environment variables...');
        const envChannelId = process.env.DISCORD_CHANNEL_ID;
        const envUserToken = process.env.DISCORD_USER_TOKEN;
        
        if (envChannelId && envUserToken) {
          discordSettings = {
            discordChannelId: envChannelId,
            discordUserToken: envUserToken,
            enableDiscord: true,
            source: 'environment-variables'
          };
          console.log('✅ [IMAGE-GEN] Using Discord settings from environment variables');
          console.log(`   📺 Channel: ${discordSettings.discordChannelId}`);
          console.log(`   🔐 Token: ${discordSettings.discordUserToken.substring(0, 10)}...`);
        } else {
          console.log('❌ [IMAGE-GEN] No Discord settings available from environment variables');
        }
      }
      
      // FINAL VALIDATION WITH DETAILED LOGGING
      if (discordSettings && discordSettings.discordChannelId && discordSettings.discordUserToken) {
        console.log('✅ [IMAGE-GEN] FINAL DISCORD SETTINGS VALIDATION PASSED:');
        console.log(`   📍 Source: ${discordSettings.source}`);
        console.log(`   📺 Channel ID: ${discordSettings.discordChannelId}`);
        console.log(`   🔐 Token Preview: ${discordSettings.discordUserToken.substring(0, 10)}...`);
        console.log(`   ✅ Enabled: ${discordSettings.enableDiscord}`);
        console.log(`   🏢 Organization: ${discordSettings.organizationId || 'Unknown'}`);
        console.log(`   🌐 Website: ${discordSettings.websiteId || 'Unknown'}`);
        
        // Compare with what connection test might have used
        console.log('🔄 [IMAGE-GEN] This should match the Discord account tested in connection test');
      } else {
        console.log('❌ [IMAGE-GEN] FINAL VALIDATION FAILED - No valid Discord settings found');
        console.log(`   Available data:`, discordSettings);
        discordSettings = null;
      }
      
    } catch (settingsError) {
      console.error('❌ [IMAGE-GEN] CRITICAL ERROR getting Discord settings:', settingsError.message);
      console.error('❌ [IMAGE-GEN] Settings error stack:', settingsError.stack);
      discordSettings = null;
    }
    
    // CONTINUE WITH IMAGE GENERATION OR FAIL CLEARLY
    if (!discordSettings) {
      console.error('❌ [IMAGE-GEN] Cannot generate image without Discord settings');
      console.error('❌ [IMAGE-GEN] Recommendation: Go to /settings and test Discord connection first');
      return {
        error: 'Discord integration not configured - image generation requires Discord settings. Please go to /settings and test your Discord connection.',
        success: false,
        troubleshooting: [
          'Go to /settings page',
          'Enter your Discord Channel ID and User Token',
          'Click "Test Discord Connection" to verify',
          'Save settings',
          'Try generating image again'
        ]
      };
    }
    
    console.log('🚀 [IMAGE-GEN] Proceeding with image generation using validated Discord settings');
    console.log(`🎯 [IMAGE-GEN] Using account from: ${discordSettings.source}`);
    
    // Use the settings with the existing function
    return await generateImageForRecipeWithSettings(recipeId, discordSettings);
    
  } catch (error) {
    console.error(`❌ [IMAGE-GEN] Error in generateImageForRecipe: ${error.message}`);
    console.error(`❌ [IMAGE-GEN] Full error stack:`, error.stack);
    return {
      error: error.message,
      success: false,
      troubleshooting: [
        'Check Discord settings in /settings page',
        'Ensure Discord Channel ID and User Token are correct',
        'Test Discord connection before generating images',
        'Check server logs for detailed error information'
      ]
    };
  }
}

/**
 * Test prompt filtering function (for debugging)
 * @param {string} testPrompt - Prompt to test
 * @returns {Object} Filter test results
 */
function testPromptFilter(testPrompt) {
  console.log('\n🧪 [TEST] Testing prompt filter...');
  const result = filterPromptForMidjourney(testPrompt, { logChanges: true });
  console.log('🧪 [TEST] Filter test completed\n');
  return result;
}

/**
 * Get all recipe images from the database
 * @returns {Array} List of recipe images
 */
async function getAllRecipeImages() {
  // Use recipe_idea instead of title based on your schema
  return await getAll(`
    SELECT ri.*, r.recipe_idea as recipe_title 
    FROM recipe_images ri
    LEFT JOIN recipes r ON ri.recipe_id = r.id
    ORDER BY ri.created_at DESC
  `);
}

/**
 * Get images for a specific recipe
 * @param {integer} recipeId - Recipe ID
 * @returns {Array} List of images for the recipe
 */
async function getImagesForRecipe(recipeId) {
  return await getAll(
    "SELECT * FROM recipe_images WHERE recipe_id = ? ORDER BY created_at DESC", 
    [recipeId]
  );
}

/**
 * Export recipe images to CSV
 * @returns {string} CSV content
 */
async function exportImagesToCSV() {
  // Use recipe_idea instead of title based on your schema
  const rows = await getAll(`
    SELECT ri.id, r.recipe_idea as recipe_title, ri.prompt, ri.image_path, ri.status, ri.created_at
    FROM recipe_images ri
    LEFT JOIN recipes r ON ri.recipe_id = r.id
    ORDER BY ri.created_at DESC
  `);
  
  // Create CSV content
  const csvHeader = "ID,Recipe Title,Prompt,Image Path,Status,Created At\n";
  const csvRows = rows.map(row => {
    return `${row.id},"${(row.recipe_title || '').replace(/"/g, '""')}","${row.prompt.replace(/"/g, '""')}",${row.image_path},${row.status},${row.created_at}`;
  }).join("\n");
  
  return csvHeader + csvRows;
}

/**
 * Delete a recipe image
 * @param {integer} imageId - Image ID
 * @returns {boolean} Success status
 */
async function deleteRecipeImage(imageId) {
  try {
    // Get the image information first
    const image = await getOne("SELECT * FROM recipe_images WHERE id = ?", [imageId]);
    
    if (!image) {
      throw new Error('Image not found');
    }
    
    // Delete the image file if it exists
    if (image.image_path) {
      const imagePath = path.join(process.cwd(), 'recipe_images', image.image_path);
      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
      }
    }
    
    // Delete the database record
    await runQuery("DELETE FROM recipe_images WHERE id = ?", [imageId]);
    
    return true;
  } catch (error) {
    console.error(`Error deleting image ${imageId}:`, error.message);
    throw error;
  }
}

/**
 * Generate image for a recipe with a custom prompt
 * @param {string} recipeId - Recipe ID
 * @param {string} customPrompt - Custom Midjourney prompt
 * @returns {Promise<object>} - Result object
 */
async function generateImageForRecipeWithPrompt(recipeId, customPrompt, discordSettings = null) {
  try {
    console.log(`Generating image for recipe ${recipeId} with custom prompt`);
    
    // Try to get Discord settings
    const clientModule = require('./midjourney-client');
const client = clientModule.newClient(discordSettings); // instance dédiée au job

// S’assurer d’initialiser si besoin
if (!client.userId || !client.guildId) {
  await client.initialize();
}
    
    // Make sure it's initialized
    if (!client.userId || !client.guildId) {
      console.log('Client not initialized, initializing now...');
      await client.initialize();
    }
    
    // Check if there's already an image being generated for this recipe
    const pendingImage = await getOne(
      "SELECT id FROM recipe_images WHERE recipe_id = ? AND status = 'pending'",
      [recipeId]
    );
    
    if (pendingImage) {
      console.log(`Recipe ${recipeId} already has a pending image generation`);
      return {
        success: false,
        in_progress: true,
        message: 'Image generation already in progress for this recipe'
      };
    }
    
    // Create the image
    console.log(`Creating image with prompt: ${customPrompt.substring(0, 100)}...`);
    
    try {
      // Translate recipe components in custom prompt
      const translatedPrompt = await translateRecipeComponentsInPrompt(customPrompt);
      if (translatedPrompt !== customPrompt) {
        console.log('🌐 [TRANSLATE] Translated recipe components in custom prompt');
      }
      
      // Create the image with MJ using the translated prompt
      const result = await client.createImage(translatedPrompt, '--v 6 --q 2', null);
      
      if (!result || !result.upscaled_photo_url) {
        throw new Error('Failed to generate image URL');
      }
      
      // Download the image
      const imagePath = await downloadAndSaveImage(result.upscaled_photo_url, recipeId);
      
      // Update the recipe_images record
      await runQuery(
        "UPDATE recipe_images SET image_path = ?, status = ?, error = NULL WHERE recipe_id = ? AND status = 'pending'",
        [imagePath, "completed", recipeId]
      );
      
      return {
        success: true,
        imageUrl: result.upscaled_photo_url,
        imagePath: imagePath
      };
    } catch (error) {
      console.error(`Error generating image with Midjourney: ${error.message}`);
      
      // Update the recipe_images record with error
      await runQuery(
        "UPDATE recipe_images SET status = ?, error = ? WHERE recipe_id = ? AND status = 'pending'",
        ["failed", error.message, recipeId]
      );
      
      throw error;
    }
  } catch (error) {
    console.error(`Error in generateImageForRecipeWithPrompt: ${error.message}`);
    throw error;
  }
}

// Helper function to download and save image
async function downloadAndSaveImage(imageUrl, recipeId) {
  try {
    const axios = require('axios');
    const fs = require('fs');
    const path = require('path');
    
    // Create recipe_images directory if it doesn't exist
    const outputDir = path.join(process.cwd(), 'recipe_images');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    // Generate a unique filename
    const timestamp = Date.now();
    const filename = `recipe_${recipeId}_${timestamp}.webp`;
    const outputPath = path.join(outputDir, filename);
    
    // Download the image
    const response = await axios({
      method: 'GET',
      url: imageUrl,
      responseType: 'stream'
    });
    
    // Save the image
    const writer = fs.createWriteStream(outputPath);
    response.data.pipe(writer);
    
    return new Promise((resolve, reject) => {
      writer.on('finish', () => resolve(filename));
      writer.on('error', reject);
    });
  } catch (error) {
    console.error(`Error downloading image: ${error.message}`);
    throw error;
  }
}

// Export functions
module.exports = {
  generateImageForRecipe,
  generateImageForRecipeWithSettings,
  generateImageForRecipeWithPrompt,
  getAllRecipeImages,
  getImagesForRecipe,
  exportImagesToCSV,
  deleteRecipeImage,
  testPromptFilter,
  filterPromptForMidjourney,
  addImageUrlToPrompt, // Export the helper function for testing
  uploadBase64ToImgBB, // Export the new base64 upload function
  translateText, // Export the translation function for potential use elsewhere
  translateRecipeComponentsInPrompt // Export the recipe component translation function
};
