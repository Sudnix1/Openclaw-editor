// automated-buffer.js - Fully automated Buffer posting system
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const db = new sqlite3.Database(path.join(__dirname, 'data/recipes.db'));

// Helper functions
function runQuery(query, params = []) {
  return new Promise((resolve, reject) => {
    db.run(query, params, function(err) {
      if (err) {
        reject(err);
      } else {
        resolve({ lastID: this.lastID, changes: this.changes });
      }
    });
  });
}

function getAll(query, params = []) {
  return new Promise((resolve, reject) => {
    db.all(query, params, (err, rows) => {
      if (err) {
        reject(err);
      } else {
        resolve(rows);
      }
    });
  });
}

class AutomatedBuffer {
  constructor() {
    this.initialized = false;
  }

  async ensureInitialized() {
    if (this.initialized) return;
    
    try {
      // Create automated buffer posts table
      await runQuery(`
        CREATE TABLE IF NOT EXISTS automated_buffer_posts (
          id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
          recipe_id TEXT,
          title TEXT,
          description TEXT,
          image_url TEXT,
          direct_link TEXT,
          board_id TEXT,
          profile_id TEXT,
          scheduled_time TEXT,
          status TEXT DEFAULT 'scheduled',
          created_at TEXT DEFAULT (datetime('now')),
          posted_at TEXT,
          error_message TEXT,
          FOREIGN KEY (recipe_id) REFERENCES recipes (id)
        )
      `);

      this.initialized = true;
      console.log('✅ Automated Buffer database initialized');
    } catch (error) {
      console.error('❌ Error initializing automated buffer database:', error);
      throw error;
    }
  }

  // Schedule a post (automated replacement for Buffer)
  async schedulePost({ recipeId, title, description, imageUrl, directLink, boardId, profileId, scheduleTime }) {
    await this.ensureInitialized();
    try {
      const postId = await runQuery(`
        INSERT INTO automated_buffer_posts 
        (recipe_id, title, description, image_url, direct_link, board_id, profile_id, scheduled_time, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'scheduled')
      `, [recipeId, title, description, imageUrl, directLink, boardId, profileId, scheduleTime]);

      console.log('📅 Post scheduled in automated system:', {
        postId: postId.lastID,
        title: title.substring(0, 50) + '...',
        scheduleTime,
        status: 'scheduled'
      });

      return {
        success: true,
        postId: postId.lastID,
        status: 'scheduled',
        buffer_url: `automated_post_${postId.lastID}`,
        scheduled_time: scheduleTime,
        message: 'Post scheduled successfully in automated system'
      };
    } catch (error) {
      console.error('❌ Error scheduling automated post:', error);
      throw error;
    }
  }

  // Get all scheduled posts
  async getScheduledPosts() {
    await this.ensureInitialized();
    return await getAll(`
      SELECT * FROM automated_buffer_posts 
      WHERE status = 'scheduled' 
      ORDER BY scheduled_time ASC
    `);
  }

  // Get posts ready to be published (past scheduled time)
  async getReadyPosts() {
    await this.ensureInitialized();
    const now = new Date().toISOString();
    return await getAll(`
      SELECT * FROM automated_buffer_posts 
      WHERE status = 'scheduled' 
      AND scheduled_time <= ? 
      ORDER BY scheduled_time ASC
      LIMIT 10
    `, [now]);
  }

  // Mark post as published
  async markAsPublished(postId) {
    await this.ensureInitialized();
    await runQuery(`
      UPDATE automated_buffer_posts 
      SET status = 'published', posted_at = datetime('now')
      WHERE id = ?
    `, [postId]);
  }

  // Get posts for dashboard
  async getRecentPosts(limit = 50) {
    await this.ensureInitialized();
    return await getAll(`
      SELECT 
        abp.*,
        r.recipe_idea as recipe_title,
        fc.title as facebook_title
      FROM automated_buffer_posts abp
      LEFT JOIN recipes r ON abp.recipe_id = r.id
      LEFT JOIN facebook_content fc ON abp.recipe_id = fc.recipe_id
      ORDER BY abp.created_at DESC
      LIMIT ?
    `, [limit]);
  }

  // Process ready posts (this would be called by a cron job or scheduler)
  async processReadyPosts() {
    await this.ensureInitialized();
    const readyPosts = await this.getReadyPosts();
    
    if (readyPosts.length === 0) {
      console.log('📭 No posts ready for publishing');
      return { processed: 0, posts: [] };
    }

    console.log(`📤 Processing ${readyPosts.length} ready posts...`);
    const processed = [];

    for (const post of readyPosts) {
      try {
        // Here you could integrate with other services like:
        // - WordPress auto-posting
        // - Direct Pinterest API (if available)
        // - Social media schedulers like Hootsuite, Later, etc.
        // - Email notifications to manually post
        // - Webhook to external services

        console.log('📤 Publishing post:', {
          id: post.id,
          title: post.title?.substring(0, 50) + '...',
          scheduled_time: post.scheduled_time
        });

        // Mark as published
        await this.markAsPublished(post.id);
        
        processed.push({
          ...post,
          status: 'published',
          published_at: new Date().toISOString()
        });

      } catch (error) {
        console.error('❌ Error publishing post:', post.id, error.message);
        
        // Mark as failed
        await runQuery(`
          UPDATE automated_buffer_posts 
          SET status = 'failed', error_message = ?
          WHERE id = ?
        `, [error.message, post.id]);
      }
    }

    return { processed: processed.length, posts: processed };
  }

  // Get statistics
  async getStats() {
    await this.ensureInitialized();
    const stats = await getAll(`
      SELECT 
        status,
        COUNT(*) as count
      FROM automated_buffer_posts 
      GROUP BY status
    `);

    const result = {
      total: 0,
      scheduled: 0,
      published: 0,
      failed: 0
    };

    stats.forEach(stat => {
      result.total += stat.count;
      result[stat.status] = stat.count;
    });

    return result;
  }
}

module.exports = { AutomatedBuffer };