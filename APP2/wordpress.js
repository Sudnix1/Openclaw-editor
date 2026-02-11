// wordpress.js - INTEGRATED VERSION WITH ALL UPDATES
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const { cleanRecipeText } = require('./recipe-formatter');

/**
 * Clean and format a recipe for WordPress - IMPROVED VERSION
 * @param {Object} recipeData - Raw recipe data
 * @returns {Object} - Cleaned recipe data for WordPress
 */
function cleanRecipeForWordPress(recipeData) {
  try {
    if (!recipeData) {
      return null;
    }
    
    // Make a deep copy to avoid modifying the original
    const cleanedRecipe = JSON.parse(JSON.stringify(recipeData));
    
    // Universal cleaning function
    const cleanText = (text) => {
      if (!text || typeof text !== 'string') return '';
      
      return text
        .replace(/\*\*/g, '') // Remove bold
        .replace(/\*/g, '') // Remove italics
        .replace(/^[-•·]\s*/gm, '') // Remove bullets
        .replace(/^#+\s*/gm, '') // Remove markdown headers
        .replace(/^(step\s*)?\d+[\.\):\s-]*/gim, '') // Remove step numbers
        .replace(/[🧂🧑‍🍳👨‍🍳👩‍🍳🍽️🥘🍳]/g, '') // Remove emojis
        .replace(/`/g, '') // Remove backticks
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Convert markdown links to text
        .replace(/\s+/g, ' ') // Normalize spaces
        .trim();
    };
    
    // Clean the title
    if (cleanedRecipe.title) {
      cleanedRecipe.title = cleanText(cleanedRecipe.title);
    }
    
    // Clean the ingredients
    if (cleanedRecipe.ingredients && Array.isArray(cleanedRecipe.ingredients)) {
      cleanedRecipe.ingredients = cleanedRecipe.ingredients
        .map(ingredient => {
          if (typeof ingredient !== 'string') return ingredient;
          return cleanText(ingredient);
        })
        .filter(item => item && item.trim().length > 0);
    }
    
    // Clean the instructions
    if (cleanedRecipe.instructions && Array.isArray(cleanedRecipe.instructions)) {
      cleanedRecipe.instructions = cleanedRecipe.instructions
        .map(instruction => {
          if (typeof instruction !== 'string') return instruction;
          return cleanText(instruction);
        })
        .filter(item => item && item.trim().length > 0);
    }
    
    return cleanedRecipe;
  } catch (error) {
    console.error('Error cleaning recipe for WordPress:', error);
    return recipeData;
  }
}

/**
 * Clean HTML document structure and markdown artifacts
 * @param {string} content - Raw content that might include HTML document structure
 * @returns {string} - Cleaned content
 */
function cleanHtmlDocument(content) {
  let cleaned = content;
  
  // Remove markdown code blocks
  cleaned = cleaned.replace(/```html\s*/g, '');
  cleaned = cleaned.replace(/```\s*/g, '');
  
  // Remove HTML document structure
  cleaned = cleaned.replace(/<!DOCTYPE[^>]*>/gi, '');
  cleaned = cleaned.replace(/<html[^>]*>/gi, '');
  cleaned = cleaned.replace(/<\/html>/gi, '');
  cleaned = cleaned.replace(/<head>[\s\S]*?<\/head>/gi, '');
  cleaned = cleaned.replace(/<body[^>]*>/gi, '');
  cleaned = cleaned.replace(/<\/body>/gi, '');
  cleaned = cleaned.replace(/<meta[^>]*>/gi, '');
  
  // Extract body content if it exists
  const bodyMatch = content.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (bodyMatch) {
    cleaned = bodyMatch[1];
  }
  
  // Remove H1 title from the beginning
  cleaned = cleaned.replace(/^\s*<h1[^>]*>[^<]*<\/h1>\s*/i, '');
  
  // Remove empty paragraphs and clean whitespace
  cleaned = cleaned.replace(/<p>\s*<\/p>/g, '');
  cleaned = cleaned.trim();
  
  return cleaned;
}

/**
 * Enhanced content cleaner - Remove HTML document structure, markers, and let WordPress handle the rest
 * @param {string} content - Raw content 
 * @returns {string} - Cleaned content
 */
function cleanContentForWordPress(content) {
  if (!content || typeof content !== 'string') {
    return String(content || '');
  }
  
  console.log('🧹 CLEANING CONTENT FOR WORDPRESS...');
  console.log('📥 INPUT LENGTH:', content.length);
  
  // FIRST - Clean any HTML document structure
  let cleaned = cleanHtmlDocument(content);
  
  // THEN - Remove section markers
  cleaned = cleaned
    .replace(/SECTION:\s*/g, '')
    .replace(/SUBSECTION:\s*/g, '')
    .replace(/SUBSUBSECTION:\s*/g, '');
  
  console.log('✅ CONTENT CLEANED - WordPress will handle HTML to blocks conversion');
  console.log('📤 OUTPUT LENGTH:', cleaned.length);
  
  return cleaned;
}

function extractAndCleanSeoData(content, title) {
  const seoData = {
    title: title || '',
    description: '',
    permalink: '',
    keyword: '',
    // Add Pinterest fields
    pinterestTitle: '',
    pinterestDescription: ''
  };
  
  // Try to extract SEO metadata from content
  const seoMatches = {
    title: content.match(/SEO_TITLE:\s*(.+?)(?:\n|$)/i),
    description: content.match(/SEO_DESCRIPTION:\s*(.+?)(?:\n|$)/i),
    permalink: content.match(/SEO_PERMALINK:\s*(.+?)(?:\n|$)/i),
    keyword: content.match(/SEO_(?:FOCUS_)?KEYWORD:\s*(.+?)(?:\n|$)/i),
    // Add Pinterest extraction patterns
    pinterestTitle: content.match(/PINTEREST_TITLE:\s*(.+?)(?:\n|$)/i),
    pinterestDescription: content.match(/PINTEREST_DESCRIPTION:\s*(.+?)(?:\n|$)/i)
  };
  
  // Extract values if found
  if (seoMatches.title?.[1]) seoData.title = seoMatches.title[1].trim();
  if (seoMatches.description?.[1]) seoData.description = seoMatches.description[1].trim();
  if (seoMatches.permalink?.[1]) seoData.permalink = seoMatches.permalink[1].trim();
  if (seoMatches.keyword?.[1]) seoData.keyword = seoMatches.keyword[1].trim();
  if (seoMatches.pinterestTitle?.[1]) seoData.pinterestTitle = seoMatches.pinterestTitle[1].trim();
  if (seoMatches.pinterestDescription?.[1]) seoData.pinterestDescription = seoMatches.pinterestDescription[1].trim();
  
  // Generate defaults if missing
  if (!seoData.description && title) {
    seoData.description = `Learn how to make delicious ${title} with our easy step-by-step recipe. Perfect for any occasion!`;
  }
  
  if (!seoData.permalink && title) {
    seoData.permalink = title.toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }
  
  if (!seoData.keyword && title) {
    // Extract main keyword from title
    seoData.keyword = title.replace(/[-–—].*/, '').trim();
  }
  
  // Generate Pinterest defaults if missing
  if (!seoData.pinterestTitle && title) {
    seoData.pinterestTitle = `${title} - Easy Recipe`;
  }
  
  if (!seoData.pinterestDescription && title) {
    seoData.pinterestDescription = `Save this delicious ${title} recipe to your Pinterest board! Easy to follow instructions with amazing results.`;
  }
  
  // Remove SEO markers from content
  let cleanContent = content;
  cleanContent = cleanContent.replace(/SEO_TITLE:.+?(?:\n|$)/gi, '');
  cleanContent = cleanContent.replace(/SEO_DESCRIPTION:.+?(?:\n|$)/gi, '');
  cleanContent = cleanContent.replace(/SEO_PERMALINK:.+?(?:\n|$)/gi, '');
  cleanContent = cleanContent.replace(/SEO_(?:FOCUS_)?KEYWORD:.+?(?:\n|$)/gi, '');
  cleanContent = cleanContent.replace(/PINTEREST_TITLE:.+?(?:\n|$)/gi, '');
  cleanContent = cleanContent.replace(/PINTEREST_DESCRIPTION:.+?(?:\n|$)/gi, '');
  
  return { cleanContent: cleanContent.trim(), seoData };
}

/**
 * HTML escape helper
 * @param {string} text - Text to escape
 * @returns {string} - Escaped text
 */
function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  };
  return String(text).replace(/[&<>"']/g, m => map[m]);
}

/**
 * Format content for WordPress Gutenberg blocks (LEGACY - kept for compatibility)
 * @param {string} content - HTML content
 * @returns {string} Formatted content
 */
function formatContentForWordPress(content) {
  try {
    if (!content || typeof content !== 'string') {
      console.warn('Content is not a string, converting to string');
      content = String(content || '');
    }
    
    // Check if the content already has HTML tags
    const hasHtmlTags = /<\/?[a-z][\s\S]*>/i.test(content);
    
    if (hasHtmlTags) {
      // Convert HTML content to WordPress Gutenberg blocks
      return content
        .replace(/<h2>(.*?)<\/h2>/gi, '<!-- wp:heading --><h2>$1</h2><!-- /wp:heading -->')
        .replace(/<h3>(.*?)<\/h3>/gi, '<!-- wp:heading {"level":3} --><h3>$1</h3><!-- /wp:heading -->')
        .replace(/<p>(.*?)<\/p>/gi, '<!-- wp:paragraph --><p>$1</p><!-- /wp:paragraph -->')
        .replace(/<ul>([\s\S]*?)<\/ul>/gi, '<!-- wp:list --><ul>$1</ul><!-- /wp:list -->')
        .replace(/<ol>([\s\S]*?)<\/ol>/gi, '<!-- wp:list {"ordered":true} --><ol>$1</ol><!-- /wp:list -->');
    } else {
      // Format plain text as WordPress blocks
      return content
        .split('\n\n')
        .map(para => para.trim())
        .filter(para => para.length > 0)
        .map(para => {
          if (para.startsWith('# ')) {
            return `<!-- wp:heading --><h2>${para.substring(2)}</h2><!-- /wp:heading -->`;
          } else if (para.startsWith('## ')) {
            return `<!-- wp:heading --><h2>${para.substring(3)}</h2><!-- /wp:heading -->`;
          } else if (para.startsWith('### ')) {
            return `<!-- wp:heading {"level":3} --><h3>${para.substring(4)}</h3><!-- /wp:heading -->`;
          } else {
            return `<!-- wp:paragraph --><p>${para}</p><!-- /wp:paragraph -->`;
          }
        })
        .join('\n\n');
    }
  } catch (error) {
    console.error('Error formatting content:', error);
    return String(content || '');
  }
}

/**
 * Check if post should have a recipe based on keywords and config
 * @param {string} postTitle - Post title 
 * @param {Object} wprmConfig - WP Recipe Maker configuration
 * @returns {boolean} True if recipe should be added
 */
function shouldAddRecipe(postTitle, wprmConfig) {
  // If WPRM integration is not enabled, return false
  if (!wprmConfig || !wprmConfig.enabled) {
    return false;
  }
  
  // If addToAllPosts is enabled, always return true
  if (wprmConfig.addToAllPosts) {
    return true;
  }
  
  // Check keywords
  if (wprmConfig.keywords) {
    const keywordList = wprmConfig.keywords.split(',').map(k => k.trim().toLowerCase());
    const titleLower = postTitle.toLowerCase();
    
    return keywordList.some(keyword => titleLower.includes(keyword));
  }
  
  return false;
}

/**
 * Apply SEO metadata to a WordPress post via Rank Math - UPDATED WITH PINTEREST SUPPORT
 * @param {Object} wpClient - WordPress client instance
 * @param {Object} seoMetadata - SEO metadata (title, description, permalink, keyword, pinterestTitle, pinterestDescription)
 * @param {number|string} postId - WordPress post ID
 * @returns {Object} WordPress API response
 */
async function applySeoMetadataToPost(wpClient, seoMetadata, postId) {
  try {
    if (!wpClient || !seoMetadata || !postId) {
      throw new Error('Missing required parameters for applying SEO metadata');
    }
    
    console.log(`Applying SEO metadata to post ID: ${postId}`);
    
    // Check if this is a temporary ID
    if (typeof postId === 'string' && postId.startsWith('temp_')) {
      console.log('Post ID is temporary. Storing SEO metadata for later use.');
      return {
        success: true,
        message: 'SEO metadata stored for later use',
        isTemporary: true
      };
    }
    
    // Ensure token is available
    if (!wpClient.token) {
      await wpClient.authenticate();
    }
    
    // Get auth headers
    const headers = wpClient.authType === 'jwt'
      ? { 'Authorization': `Bearer ${wpClient.token}` }
      : { 'Authorization': `Basic ${wpClient.token}` };
    
    // Create a copy of the metadata to avoid modifying the original
    const metadataToSend = {...seoMetadata};
    
    // Ensure we have clean data
    metadataToSend.title = metadataToSend.title || '';
    metadataToSend.description = metadataToSend.description || '';
    metadataToSend.keyword = metadataToSend.keyword || '';
    metadataToSend.pinterestTitle = metadataToSend.pinterestTitle || '';
    metadataToSend.pinterestDescription = metadataToSend.pinterestDescription || '';
    
    // These are the meta field names that Rank Math uses
    const metaData = {
      'rank_math_title': metadataToSend.title,
      'rank_math_description': metadataToSend.description,
      'rank_math_focus_keyword': metadataToSend.keyword,
      // Add Pinterest social meta fields - using Open Graph fields that Pinterest reads
      'rank_math_facebook_title': metadataToSend.pinterestTitle,
      'rank_math_facebook_description': metadataToSend.pinterestDescription,
      // OR use dedicated Pinterest fields if you prefer (you may need to register these in Rank Math)
      'rank_math_social_pinterest_title': metadataToSend.pinterestTitle,
      'rank_math_social_pinterest_description': metadataToSend.pinterestDescription
    };
    
    // Log the metadata being sent
    console.log('Setting Rank Math metadata (including Pinterest):');
    console.log(JSON.stringify(metaData, null, 2));
    
    // Update permalink if provided
    if (seoMetadata.permalink) {
      console.log(`Updating post permalink to: ${seoMetadata.permalink}`);
      
      // Clean up the permalink
      const cleanSlug = seoMetadata.permalink
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
      
      try {
        await axios.post(
          `${wpClient.baseUrl}/posts/${postId}`,
          { slug: cleanSlug },
          {
            headers: {
              ...headers,
              'Content-Type': 'application/json'
            }
          }
        );
        console.log(`✓ Post slug updated to: ${cleanSlug}`);
      } catch (slugError) {
        console.error('Error updating slug:', slugError.message);
        // Continue with other updates even if slug update fails
      }
    }
    
    // Update the SEO metadata
    try {
      const metaResponse = await axios.post(
        `${wpClient.baseUrl}/posts/${postId}`,
        { meta: metaData },
        {
          headers: {
            ...headers,
            'Content-Type': 'application/json'
          }
        }
      );
      
      console.log('✓ SEO metadata (including Pinterest) updated successfully');
      
      return {
        success: true,
        data: metaResponse.data
      };
    } catch (metaError) {
      console.error('Error updating post meta:', metaError.message);
      throw metaError;
    }
  } catch (error) {
    console.error('Error applying SEO metadata:', error);
    throw error;
  }
}

class WordPressClientClass {
  constructor(config) {
    this.baseUrl = config.siteUrl.replace(/\/$/, '') + '/wp-json/wp/v2';
    this.username = config.username;
    this.password = config.password;
    this.token = null;
    this.authType = 'basic'; // Default to basic auth
  }

  /**
   * Test the WordPress API connection
   * @returns {Object} Connection test result
   */
  async testConnection() {
    try {
      console.log(`Testing WordPress API connection to ${this.baseUrl}...`);
      
      // Test authentication using WordPress users/me endpoint
      const authString = `${this.username}:${this.password}`;
      const encodedAuth = Buffer.from(authString).toString('base64');
      
      const response = await axios.get(
        `${this.baseUrl}/users/me`,
        {
          headers: {
            'Authorization': `Basic ${encodedAuth}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      console.log(`✓ Authentication successful as: ${response.data.name}`);
      return {
        success: true,
        name: response.data.name,
        roles: response.data.roles,
        description: 'Authentication successful'
      };
    } catch (error) {
      console.error('✗ WordPress connection test failed:', error.message);
      throw new Error('WordPress connection test failed: ' + (error.response?.data?.message || error.message));
    }
  }

  /**
   * Authenticate with WordPress
   * @returns {boolean} Authentication success
   */
  async authenticate() {
    try {
      // First try Basic Auth (more widely supported without plugins)
      this.token = Buffer.from(`${this.username}:${this.password}`).toString('base64');
      this.authType = 'basic';
      
      // Test if Basic Auth works with a simple request
      try {
        const testResponse = await axios.get(
          `${this.baseUrl}/users/me`,
          {
            headers: {
              'Authorization': `Basic ${this.token}`,
              'Content-Type': 'application/json'
            }
          }
        );
        
        console.log('Basic Auth successful:', testResponse.data.name);
        return true;
      } catch (basicAuthError) {
        console.log('Basic Auth failed, trying JWT:', basicAuthError.message);
        
        // Try JWT if Basic Auth fails
        try {
          const authUrl = this.baseUrl.replace('/wp/v2', '') + '/jwt-auth/v1/token';
          const response = await axios.post(authUrl, {
            username: this.username,
            password: this.password
          });
          
          if (response.data && response.data.token) {
            this.token = response.data.token;
            this.authType = 'jwt';
            console.log('JWT Auth successful');
            return true;
          }
        } catch (jwtError) {
          console.error('JWT Auth also failed:', jwtError.message);
          throw new Error('Authentication failed. Please check your WordPress credentials and ensure your user has proper permissions.');
        }
      }
      
      return false;
    } catch (error) {
      console.error('WordPress authentication error:', error.response?.data || error.message);
      throw new Error('Failed to authenticate with WordPress: ' + (error.response?.data?.message || error.message));
    }
  }

  /**
   * Get MIME type from filename
   * @param {string} filename - Filename
   * @returns {string} MIME type
   */
  getMimeType(filename) {
    const ext = path.extname(filename).toLowerCase();
    const mimeTypes = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp'
    };
    return mimeTypes[ext] || 'image/jpeg';
  }

  /**
   * Upload an image to WordPress Media Library
   * @param {string} imagePath - Local path to the image file
   * @param {string} filename - Filename for the uploaded image
   * @param {string} altText - Alt text for the image
   * @returns {Object} WordPress media object
   */
  async uploadImageToMedia(imagePath, filename, altText = '') {
    try {
      if (!this.token) {
        await this.authenticate();
      }

      // Check if file exists
      if (!fs.existsSync(imagePath)) {
        throw new Error(`Image file not found: ${imagePath}`);
      }

      // Read the image file
      const imageBuffer = fs.readFileSync(imagePath);
      const mimeType = this.getMimeType(filename);

      // Determine headers based on auth type
      const headers = this.authType === 'jwt'
        ? { 'Authorization': `Bearer ${this.token}` }
        : { 'Authorization': `Basic ${this.token}` };

      // Add content headers
      headers['Content-Type'] = mimeType;
      headers['Content-Disposition'] = `attachment; filename="${filename}"`;

      console.log(`Uploading image to WordPress: ${filename}`);

      // Upload to WordPress media library
      const response = await axios.post(
        `${this.baseUrl}/media`,
        imageBuffer,
        { headers }
      );

      console.log(`✅ Image uploaded successfully - Media ID: ${response.data.id}`);

      // Update alt text if provided
      if (altText) {
        await this.updateMediaAltText(response.data.id, altText);
      }

      return response.data;
    } catch (error) {
      console.error('Error uploading image to WordPress:', error.message);
      if (error.response) {
        console.error('Response status:', error.response.status);
        console.error('Response data:', error.response.data);
      }
      throw error;
    }
  }

  /**
   * Update alt text for a media item
   * @param {number} mediaId - WordPress media ID
   * @param {string} altText - Alt text to set
   */
  async updateMediaAltText(mediaId, altText) {
    try {
      const headers = this.authType === 'jwt'
        ? { 'Authorization': `Bearer ${this.token}` }
        : { 'Authorization': `Basic ${this.token}` };

      await axios.post(
        `${this.baseUrl}/media/${mediaId}`,
        { alt_text: altText },
        {
          headers: {
            ...headers,
            'Content-Type': 'application/json'
          }
        }
      );

      console.log(`✅ Alt text updated for media ID: ${mediaId}`);
    } catch (error) {
      console.warn('Warning: Could not update alt text:', error.message);
      // Don't throw error as this is not critical
    }
  }

  /**
   * Set featured image for a post
   * @param {number} postId - WordPress post ID
   * @param {number} mediaId - WordPress media ID
   * @param {Object} preserveFields - Optional fields to preserve (status, date, etc.)
   */
  async setFeaturedImage(postId, mediaId, preserveFields = {}) {
    try {
      if (!this.token) {
        await this.authenticate();
      }

      const headers = this.authType === 'jwt'
        ? { 'Authorization': `Bearer ${this.token}` }
        : { 'Authorization': `Basic ${this.token}` };

      console.log(`Setting featured image for post ${postId} - Media ID: ${mediaId}`);

      // Build update object with featured media
      const updateData = { featured_media: mediaId };

      // Preserve status and date if provided (important for scheduled posts)
      if (preserveFields.status) {
        updateData.status = preserveFields.status;
        console.log(`Preserving post status: ${preserveFields.status}`);
      }
      if (preserveFields.date) {
        updateData.date = preserveFields.date;
        console.log(`Preserving scheduled date: ${preserveFields.date}`);
      }

      const response = await axios.post(
        `${this.baseUrl}/posts/${postId}`,
        updateData,
        {
          headers: {
            ...headers,
            'Content-Type': 'application/json'
          }
        }
      );

      console.log(`✅ Featured image set successfully`);
      return response.data;
    } catch (error) {
      console.error('Error setting featured image:', error.message);
      throw error;
    }
  }

  /**
   * Create post with featured image
   * @param {Object} postData - Post data
   * @param {string} imagePath - Path to featured image (optional)
   * @param {string} imageAltText - Alt text for image (optional)
   * @returns {Object} Post creation result
   */
  async createPostWithFeaturedImage(postData, imagePath = null, imageAltText = '') {
    try {
      // Create the post first
      const post = await this.createPost(postData);

      // If image is provided, upload and set as featured image
      if (imagePath && fs.existsSync(imagePath)) {
        try {
          const filename = path.basename(imagePath);
          const altText = imageAltText || postData.title || 'Recipe image';

          // Upload image to WordPress media library
          const mediaObject = await this.uploadImageToMedia(imagePath, filename, altText);

          // Preserve status and date when setting featured image (critical for scheduled posts)
          const preserveFields = {};
          if (postData.status) {
            preserveFields.status = postData.status;
          }
          if (postData.date) {
            preserveFields.date = postData.date;
          }

          // Set as featured image while preserving scheduling info
          await this.setFeaturedImage(post.id, mediaObject.id, preserveFields);

          // Add media info to response
          post.featured_media = mediaObject.id;
          post.featured_image_url = mediaObject.source_url;

          console.log(`✅ Post created with featured image: ${post.link}`);
        } catch (imageError) {
          console.warn('Warning: Post created but featured image failed:', imageError.message);
          // Continue without failing the entire operation
        }
      }

      return post;
    } catch (error) {
      console.error('Error creating post with featured image:', error);
      throw error;
    }
  }

  /**
   * Create a WordPress post - UPDATED WITH NEW CONTENT CLEANING
   * @param {Object} postData - Post data
   * @returns {Object} Created post data
   */
  async createPost(postData) {
    try {
      if (!this.token) {
        await this.authenticate();
      }

      // Determine headers based on auth type
      const headers = this.authType === 'jwt'
        ? { 'Authorization': `Bearer ${this.token}` }
        : { 'Authorization': `Basic ${this.token}` };
      
      console.log('Creating post with auth type:', this.authType);
      
      // Use the new simplified content cleaning approach
      let cleanContent = postData.content;
      
      if (cleanContent && postData.formatContent !== false) {
        console.log('Cleaning content for WordPress...');
        console.log('Original content sample:', cleanContent.substring(0, 200));
        
        // Use the new cleaning function instead of the legacy formatContentForWordPress
        cleanContent = cleanContentForWordPress(cleanContent);
        
        console.log('Cleaned content sample:', cleanContent.substring(0, 200));
      } else if (postData.formatContent === false) {
        console.log('Skipping content formatting as requested');
      }
      
      // Create post data object
      const postDataObject = {
        title: postData.title,
        content: cleanContent,  // WordPress will convert HTML to blocks automatically!
        status: postData.status || 'draft',
        slug: postData.slug || ''
      };

      // Add scheduled date if provided (for future posts)
      if (postData.date) {
        postDataObject.date = postData.date;
        console.log('📅 Adding scheduled date to WordPress post:', postData.date);
      }

      // Only add categories if they exist and are valid
      if (postData.categories && Array.isArray(postData.categories) && postData.categories.length > 0) {
        postDataObject.categories = postData.categories;
      }
      
      // Log the request details (without sensitive info)
      console.log('WordPress post request:', {
        url: `${this.baseUrl}/posts`,
        method: 'POST',
        hasContent: !!postDataObject.content,
        contentLength: postDataObject.content ? postDataObject.content.length : 0,
        title: postDataObject.title
      });
      
      // Make the request with detailed error logging
      try {
        const response = await axios.post(`${this.baseUrl}/posts`, postDataObject, {
          headers: {
            ...headers,
            'Content-Type': 'application/json'
          }
        });
        
        console.log('✅ WordPress post created successfully:', response.data.id);
        return response.data;
      } catch (requestError) {
        // Enhanced error logging
        console.error('WordPress API error details:', {
          message: requestError.message,
          status: requestError.response?.status,
          statusText: requestError.response?.statusText,
          data: requestError.response?.data
        });
        
        if (requestError.response?.data?.message) {
          throw new Error(`WordPress API error: ${requestError.response.data.message}`);
        } else {
          throw requestError;
        }
      }
    } catch (error) {
      console.error('WordPress create post error:', error.message);
      throw new Error('Failed to create WordPress post: ' + (error.response?.data?.message || error.message));
    }
  }

  /**
   * Create a recipe in WordPress
   * @param {Object} recipeData - Recipe data
   * @returns {Object} Create result
   */
  async createRecipe(recipeData) {
    try {
      // Clean the recipe using the function we defined
      const cleanedRecipe = cleanRecipeForWordPress(recipeData);
      
      // Determine headers based on auth type
      const headers = this.authType === 'jwt'
        ? { 'Authorization': `Bearer ${this.token}` }
        : { 'Authorization': `Basic ${this.token}` };
      
      // Use the cleaned data to create the recipe in WordPress
      const response = await axios.post(
        `${this.baseUrl.replace('/wp/v2', '')}/wprm/v1/recipe`, 
        {
          title: cleanedRecipe.title,
          summary: cleanedRecipe.summary,
          ingredients: cleanedRecipe.ingredients,
          instructions: cleanedRecipe.instructions,
          // ... other fields from your original function
        },
        {
          headers: {
            ...headers,
            'Content-Type': 'application/json'
          }
        }
      );
      
      return response.data;
    } catch (error) {
      console.error('Error creating recipe in WordPress:', error);
      throw new Error('Failed to create recipe in WordPress: ' + (error.response?.data?.message || error.message));
    }
  }
/**
   * Apply SEO metadata to a WordPress post using Rank Math - UPDATED WITH PINTEREST SUPPORT
   * @param {number} postId - The WordPress post ID
   * @param {Object} seoMetadata - SEO metadata (title, description, permalink, keyword, pinterestTitle, pinterestDescription)
   * @returns {Object} - Result of the operation
   */
  async applySeoMetadata(postId, seoMetadata) {
    try {
      if (!this.token) {
        await this.authenticate();
      }
      
      // Validate required parameters
      if (!postId || !seoMetadata) {
        throw new Error('Post ID and SEO metadata are required');
      }
      
      console.log(`Applying SEO metadata to post ID: ${postId}`);
      
      // Filter out empty values
      const filteredMetadata = {};
      if (seoMetadata.title && seoMetadata.title !== '[Not provided]') {
        filteredMetadata.title = seoMetadata.title;
      }
      if (seoMetadata.description && seoMetadata.description !== '[Not provided]') {
        filteredMetadata.description = seoMetadata.description;
      }
      if (seoMetadata.keyword && seoMetadata.keyword !== '[Not provided]') {
        filteredMetadata.keyword = seoMetadata.keyword;
      }
      // Add Pinterest filtering
      if (seoMetadata.pinterestTitle && seoMetadata.pinterestTitle !== '[Not provided]') {
        filteredMetadata.pinterestTitle = seoMetadata.pinterestTitle;
      }
      if (seoMetadata.pinterestDescription && seoMetadata.pinterestDescription !== '[Not provided]') {
        filteredMetadata.pinterestDescription = seoMetadata.pinterestDescription;
      }
      
      console.log('SEO Metadata to apply (including Pinterest):', filteredMetadata);
      
      // Create the meta data object for Rank Math
      // In your wordpress.js file, in the applySeoMetadata method, replace this section:

    // Create the meta data object for Rank Math
    const metaData = {};
    if (filteredMetadata.title) metaData['rank_math_title'] = filteredMetadata.title;
    if (filteredMetadata.description) metaData['rank_math_description'] = filteredMetadata.description;
    if (filteredMetadata.keyword) metaData['rank_math_focus_keyword'] = filteredMetadata.keyword;
    
    // Add Pinterest social meta fields
    if (filteredMetadata.pinterestTitle) {
      // Use Open Graph title (which Pinterest reads) and/or dedicated Pinterest field
      metaData['rank_math_facebook_title'] = filteredMetadata.pinterestTitle;
      metaData['rank_math_social_pinterest_title'] = filteredMetadata.pinterestTitle;
    }
    if (filteredMetadata.pinterestDescription) {
      // Use Open Graph description (which Pinterest reads) and/or dedicated Pinterest field
      metaData['rank_math_facebook_description'] = filteredMetadata.pinterestDescription;
      metaData['rank_math_social_pinterest_description'] = filteredMetadata.pinterestDescription;
    }
      
      // Determine headers based on auth type
      const headers = this.authType === 'jwt'
        ? { 'Authorization': `Bearer ${this.token}` }
        : { 'Authorization': `Basic ${this.token}` };
      
      // Update the SEO metadata if we have any
      if (Object.keys(metaData).length > 0) {
        console.log('Sending meta data to WordPress:', metaData);
        
        const response = await axios.post(
          `${this.baseUrl}/posts/${postId}`,
          { meta: metaData },
          {
            headers: {
              ...headers,
              'Content-Type': 'application/json'
            }
          }
        );
        
        console.log('✓ SEO metadata (including Pinterest) updated successfully');
      }
      
      // Update permalink if provided
      if (seoMetadata.permalink && seoMetadata.permalink !== '[Not provided]') {
        const cleanSlug = seoMetadata.permalink
          .toLowerCase()
          .replace(/[^a-z0-9-]/g, '-')
          .replace(/-+/g, '-')
          .replace(/^-|-$/g, '');
        
        if (cleanSlug) {
          await axios.post(
            `${this.baseUrl}/posts/${postId}`,
            { slug: cleanSlug },
            {
              headers: {
                ...headers,
                'Content-Type': 'application/json'
              }
            }
          );
          
          console.log(`✓ Post slug updated to: ${cleanSlug}`);
        }
      }
      
      return {
        success: true,
        appliedData: filteredMetadata
      };
    } catch (error) {
      console.error('Error applying SEO metadata:', error);
      throw new Error(`Failed to apply SEO metadata: ${error.message}`);
    }
  }

  /**
   * Validate WordPress connection
   * @returns {Object} Validation result
   */
  async validateConnection() {
    try {
      if (!this.token) {
        await this.authenticate();
      }
      
      // Check if we're using JWT or basic auth
      const headers = this.authType === 'jwt'
        ? { 'Authorization': `Bearer ${this.token}` }
        : { 'Authorization': `Basic ${this.token}` };
      
      // Try to get site information to validate connection
      const infoUrl = this.baseUrl.replace('/wp/v2', '');
      const response = await axios.get(infoUrl, {
        headers
      });
      
      return {
        success: true,
        name: response.data?.name || 'WordPress Site',
        description: response.data?.description || '',
        url: response.data?.url || this.baseUrl
      };
    } catch (error) {
      console.error('WordPress connection validation error:', error.response?.data || error.message);
      throw new Error('Failed to validate WordPress connection: ' + (error.response?.data?.message || error.message));
    }
  }

  /**
   * Publish a recipe to WordPress
   * @param {Object} postData - Post data
   * @param {Object} recipeData - Recipe data (optional)
   * @param {Object} wprmConfig - WP Recipe Maker configuration (optional)
   * @returns {Object} Publish result
   */
  async publishWithRecipe(postData, recipeData, wprmConfig = null) {
    try {
      if (!this.token) {
        await this.authenticate();
      }

      // Create post first
      const postResult = await this.createPost(postData);
      const postId = postResult.id;
      
      // If we have recipe data and WPRM is enabled, add the recipe
      if (recipeData && (wprmConfig && wprmConfig.enabled)) {
        try {
          // Import recipe helper if it isn't already available
          const recipeHelper = require('./recipe-helper');
          
          // Check if we should add a recipe based on keywords
          const shouldAdd = wprmConfig.addToAllPosts || 
                            shouldAddRecipe(postData.title, wprmConfig);
          
          console.log(`Should add recipe? ${shouldAdd} (addToAllPosts: ${wprmConfig.addToAllPosts})`);
          
          if (shouldAdd) {
            // Clean recipe data using our function
            const cleanedRecipe = cleanRecipeForWordPress(recipeData);
            
            // Make sure original arrays are set
            if (!cleanedRecipe._originalIngredients && cleanedRecipe.ingredients) {
              cleanedRecipe._originalIngredients = [...cleanedRecipe.ingredients];
            }
            
            if (!cleanedRecipe._originalInstructions && cleanedRecipe.instructions) {
              cleanedRecipe._originalInstructions = [...cleanedRecipe.instructions];
            }
            
            // Use our createRecipe method or the recipe helper
            let recipeResult;
            if (typeof this.createRecipe === 'function') {
              recipeResult = await this.createRecipe(cleanedRecipe);
            } else {
              recipeResult = await recipeHelper.addRecipeToPost(
                { 
                  siteUrl: this.baseUrl.replace('/wp-json/wp/v2', ''),
                  username: this.username,
                  password: this.password
                },
                cleanedRecipe,
                postId
              );
            }
            
            return {
              success: true,
              post: postResult,
              recipe: recipeResult
            };
          }
        } catch (recipeError) {
          console.error('Error adding recipe to post:', recipeError);
          // Continue despite recipe error
          return {
            success: true,
            post: postResult,
            recipeError: recipeError.message
          };
        }
      }
      
      return {
        success: true,
        post: postResult
      };
    } catch (error) {
      console.error('WordPress publish with recipe error:', error);
      throw error;
    }
  }
}

// This will make WordPressClient directly importable without object destructuring 
// which matches how it's used in server.js
const WordPressClient = WordPressClientClass;

// Export WordPressClient as the default export
module.exports = WordPressClient;

// Also export the utility functions and class to maintain compatibility with both import styles
module.exports.WordPressClient = WordPressClientClass; 
module.exports.formatContentForWordPress = formatContentForWordPress; // Legacy function kept for compatibility
module.exports.cleanContentForWordPress = cleanContentForWordPress; // New improved function
module.exports.cleanHtmlDocument = cleanHtmlDocument; // New function
module.exports.shouldAddRecipe = shouldAddRecipe;
module.exports.cleanRecipeForWordPress = cleanRecipeForWordPress;
module.exports.applySeoMetadataToPost = applySeoMetadataToPost;
module.exports.escapeHtml = escapeHtml; // New function
module.exports.extractAndCleanSeoData = extractAndCleanSeoData; // New function