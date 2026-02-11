// Debug script to track keyword status changes in real-time
const { getOne, runQuery, getAll } = require('./db');

class StatusTracker {
  constructor() {
    this.trackedKeywords = new Map();
    this.statusLog = [];
  }

  // Track a specific keyword
  async trackKeyword(keywordId, initialContext = 'manual_track') {
    console.log(`🔍 [STATUS TRACKER] Starting to track keyword ${keywordId}`);
    
    const keyword = await getOne(`
      SELECT id, keyword, status, recipe_id, processed_at 
      FROM keywords 
      WHERE id = ?
    `, [keywordId]);

    if (!keyword) {
      console.log(`❌ [STATUS TRACKER] Keyword ${keywordId} not found`);
      return false;
    }

    this.trackedKeywords.set(keywordId, {
      keyword: keyword.keyword,
      startTime: Date.now(),
      initialStatus: keyword.status,
      statusHistory: [{
        status: keyword.status,
        timestamp: new Date().toISOString(),
        context: initialContext,
        recipeId: keyword.recipe_id
      }]
    });

    console.log(`✅ [STATUS TRACKER] Now tracking "${keyword.keyword}" (${keywordId})`);
    console.log(`📊 [STATUS TRACKER] Initial status: ${keyword.status}`);
    
    return true;
  }

  // Check status of all tracked keywords
  async checkAllTrackedKeywords() {
    if (this.trackedKeywords.size === 0) {
      return;
    }

    console.log(`🔄 [STATUS TRACKER] Checking ${this.trackedKeywords.size} tracked keywords...`);

    for (const [keywordId, trackingData] of this.trackedKeywords) {
      await this.checkKeywordStatus(keywordId, 'periodic_check');
    }
  }

  // Check individual keyword status
  async checkKeywordStatus(keywordId, context = 'check') {
    const trackingData = this.trackedKeywords.get(keywordId);
    if (!trackingData) return;

    const keyword = await getOne(`
      SELECT id, keyword, status, recipe_id, processed_at, 
             processing_started_at
      FROM keywords 
      WHERE id = ?
    `, [keywordId]);

    if (!keyword) {
      console.log(`❌ [STATUS TRACKER] Keyword ${keywordId} disappeared from database`);
      return;
    }

    const lastStatus = trackingData.statusHistory[trackingData.statusHistory.length - 1].status;
    
    if (keyword.status !== lastStatus) {
      console.log(`🚨 [STATUS CHANGE] ${trackingData.keyword} (${keywordId})`);
      console.log(`   Old: ${lastStatus} → New: ${keyword.status}`);
      console.log(`   Context: ${context}`);
      console.log(`   Recipe ID: ${keyword.recipe_id}`);
      console.log(`   Processed at: ${keyword.processed_at}`);
      
      trackingData.statusHistory.push({
        status: keyword.status,
        timestamp: new Date().toISOString(),
        context: context,
        recipeId: keyword.recipe_id,
        previousStatus: lastStatus
      });

      // If status changed to failed, investigate further
      if (keyword.status === 'failed') {
        await this.investigateFailure(keywordId);
      }
    }
  }

  // Deep investigation when keyword fails
  async investigateFailure(keywordId) {
    console.log(`🔍 [FAILURE INVESTIGATION] Investigating keyword ${keywordId}`);
    
    const keyword = await getOne(`
      SELECT * FROM keywords WHERE id = ?
    `, [keywordId]);

    console.log(`📋 [FAILURE INVESTIGATION] Full keyword data:`, {
      id: keyword.id,
      keyword: keyword.keyword,
      status: keyword.status,
      recipe_id: keyword.recipe_id,
      processing_started_at: keyword.processing_started_at,
      processed_at: keyword.processed_at
    });

    // Check if recipe exists
    if (keyword.recipe_id) {
      const recipe = await getOne(`
        SELECT id, recipe_idea FROM recipes WHERE id = ?
      `, [keyword.recipe_id]);

      console.log(`🍽️ [FAILURE INVESTIGATION] Recipe exists:`, !!recipe);
      
      if (recipe) {
        // Check image generation status
        const images = await getAll(`
          SELECT id, status, created_at, updated_at 
          FROM recipe_images 
          WHERE recipe_id = ?
          ORDER BY created_at DESC
        `, [keyword.recipe_id]);

        console.log(`🖼️ [FAILURE INVESTIGATION] Images for recipe:`, images.length);
        images.forEach((img, index) => {
          console.log(`   Image ${index + 1}: ${img.status} (${img.created_at})`);
        });
      }
    }

    // Check processing time
    const trackingData = this.trackedKeywords.get(keywordId);
    const totalTime = Date.now() - trackingData.startTime;
    console.log(`⏱️ [FAILURE INVESTIGATION] Total processing time: ${Math.round(totalTime/1000)}s`);
  }

  // Print full report
  printReport() {
    console.log(`\n📊 [STATUS TRACKER REPORT] Tracked ${this.trackedKeywords.size} keywords`);
    
    for (const [keywordId, trackingData] of this.trackedKeywords) {
      console.log(`\n🔍 Keyword: "${trackingData.keyword}" (${keywordId})`);
      console.log(`   Initial status: ${trackingData.initialStatus}`);
      console.log(`   Status history:`);
      
      trackingData.statusHistory.forEach((entry, index) => {
        const prevStatus = entry.previousStatus ? ` (from ${entry.previousStatus})` : '';
        console.log(`     ${index + 1}. ${entry.status}${prevStatus} at ${entry.timestamp} [${entry.context}]`);
      });
      
      const totalTime = Date.now() - trackingData.startTime;
      console.log(`   Total tracking time: ${Math.round(totalTime/1000)}s`);
    }
  }

  // Monitor all pending/processing keywords automatically
  async startAutoMonitoring() {
    console.log(`🚀 [STATUS TRACKER] Starting auto-monitoring...`);
    
    // Find all pending/processing keywords
    const activeKeywords = await getAll(`
      SELECT id, keyword, status 
      FROM keywords 
      WHERE status IN ('pending', 'processing')
      ORDER BY processing_started_at DESC
      LIMIT 10
    `);

    console.log(`📋 [STATUS TRACKER] Found ${activeKeywords.length} active keywords`);
    
    for (const keyword of activeKeywords) {
      await this.trackKeyword(keyword.id, 'auto_monitor');
    }

    // Start periodic checking
    this.checkInterval = setInterval(() => {
      this.checkAllTrackedKeywords();
    }, 5000); // Check every 5 seconds

    console.log(`✅ [STATUS TRACKER] Auto-monitoring started (checking every 5s)`);
  }

  // Stop monitoring
  stopMonitoring() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      console.log(`🛑 [STATUS TRACKER] Monitoring stopped`);
    }
    this.printReport();
  }
}

// Export for use in main application
module.exports = StatusTracker;

// Command line usage
if (require.main === module) {
  const tracker = new StatusTracker();
  
  console.log(`🔧 [STATUS TRACKER] Debug tool started`);
  console.log(`Use: node debug-status-tracker.js`);
  
  // Start auto-monitoring
  tracker.startAutoMonitoring();
  
  // Stop after 10 minutes
  setTimeout(() => {
    tracker.stopMonitoring();
    process.exit(0);
  }, 10 * 60 * 1000);
  
  // Handle Ctrl+C
  process.on('SIGINT', () => {
    console.log(`\n🛑 [STATUS TRACKER] Received SIGINT, stopping...`);
    tracker.stopMonitoring();
    process.exit(0);
  });
}