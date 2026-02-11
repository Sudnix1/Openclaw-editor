// migrations/add-prompt-filtering-support.js
// Create this file to add filtering support to your database

const { runQuery } = require('../db');

async function up() {
  console.log('Adding prompt filtering support to recipe_images table...');
  
  try {
    // Add column to store filter changes
    await runQuery(`
      ALTER TABLE recipe_images 
      ADD COLUMN filter_changes TEXT DEFAULT NULL
    `);
    
    // Add column to store original prompt before filtering
    await runQuery(`
      ALTER TABLE recipe_images 
      ADD COLUMN original_prompt TEXT DEFAULT NULL
    `);
    
    // Add column to store error messages
    await runQuery(`
      ALTER TABLE recipe_images 
      ADD COLUMN error_message TEXT DEFAULT NULL
    `);
    
    console.log('✅ Successfully added prompt filtering columns');
    
    // Create a table for filter statistics
    await runQuery(`
      CREATE TABLE IF NOT EXISTS prompt_filter_stats (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        total_prompts INTEGER DEFAULT 0,
        filtered_prompts INTEGER DEFAULT 0,
        blocked_prompts INTEGER DEFAULT 0,
        common_changes TEXT DEFAULT NULL,
        last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Insert initial stats record
    await runQuery(`
      INSERT INTO prompt_filter_stats (total_prompts, filtered_prompts, blocked_prompts)
      VALUES (0, 0, 0)
    `);
    
    console.log('✅ Successfully created prompt filter statistics table');
    
  } catch (error) {
    console.error('❌ Error in migration:', error);
    throw error;
  }
}

async function down() {
  console.log('Removing prompt filtering support...');
  
  try {
    await runQuery(`ALTER TABLE recipe_images DROP COLUMN filter_changes`);
    await runQuery(`ALTER TABLE recipe_images DROP COLUMN original_prompt`);
    await runQuery(`ALTER TABLE recipe_images DROP COLUMN error_message`);
    await runQuery(`DROP TABLE IF EXISTS prompt_filter_stats`);
    
    console.log('✅ Successfully removed prompt filtering columns');
  } catch (error) {
    console.error('❌ Error in rollback:', error);
    throw error;
  }
}

module.exports = { up, down };

// ===============================================
// ADD THESE ROUTES TO YOUR image-routes.js FILE
// ===============================================

/*
// Add these new routes to your existing midjourney/image-routes.js file:

// Test prompt filter endpoint
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

// Get filter statistics
router.get('/api/filter-stats', async (req, res) => {
  try {
    const { getOne, getAll } = require('../db');
    
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

// Get banned words list
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

// Add custom banned word
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

// Remove banned word
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

// Test multiple prompts at once
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
*/

// ===============================================
// SAMPLE TESTING SCRIPT
// ===============================================

/*
// test-filter.js - Create this file to test your filter system
const imageGenerator = require('./midjourney/image-generator');

console.log('🧪 Testing Midjourney Prompt Filter System\n');

const testPrompts = [
  'Professional food photography of chicken breasts with herbs',
  'Delicious turkey thighs with vegetables on a plate',
  'Raw beef with blood dripping, very realistic',
  'Naked cake with cream topping, beautiful presentation',
  'Moist chocolate cake with wet frosting',
  'Grilled chicken wings with barbecue sauce',
  'Traditional lamb leg roast with mint sauce',
  'Buffalo wings with spicy sauce, restaurant style',
  'Duck breast sliced and plated elegantly',
  'Pork breast stuffed with herbs and spices'
];

testPrompts.forEach((prompt, index) => {
  console.log(`\n📝 Test ${index + 1}: "${prompt}"`);
  const result = imageGenerator.testPromptFilter(prompt);
  
  if (result.success) {
    if (result.changes.length > 0) {
      console.log('✅ Filtered successfully');
      console.log(`📝 New prompt: "${result.filteredPrompt}"`);
      console.log('🔄 Changes made:');
      result.changes.forEach(change => {
        console.log(`   • "${change.original}" → "${change.replacement}"`);
      });
    } else {
      console.log('✅ No filtering needed');
    }
  } else {
    console.log('❌ Filtering failed:', result.error);
  }
  
  if (result.warnings.length > 0) {
    console.log('⚠️ Warnings:', result.warnings);
  }
});

console.log('\n✅ Filter testing completed!');
*/