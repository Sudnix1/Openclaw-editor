-- Migration: Add Website Templates and Buffer Scheduler
-- Date: 2025-01-22

-- Add Pinterest template assignment to websites
ALTER TABLE websites ADD COLUMN pinterest_style_id INTEGER DEFAULT 1;
ALTER TABLE websites ADD COLUMN buffer_enabled BOOLEAN DEFAULT 0;
ALTER TABLE websites ADD COLUMN buffer_access_token TEXT;
ALTER TABLE websites ADD COLUMN buffer_profile_ids TEXT; -- JSON array of Buffer profile IDs

-- Create Buffer posting schedule table
CREATE TABLE IF NOT EXISTS buffer_posts (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    website_id TEXT NOT NULL,
    recipe_id TEXT,
    post_type TEXT NOT NULL CHECK (post_type IN ('pinterest', 'facebook', 'instagram', 'twitter')),
    content_text TEXT NOT NULL,
    image_url TEXT,
    scheduled_time DATETIME NOT NULL,
    buffer_post_id TEXT, -- Buffer's internal post ID
    status TEXT DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'sent', 'failed', 'cancelled')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_by_user_id TEXT,
    FOREIGN KEY (website_id) REFERENCES websites(id) ON DELETE CASCADE,
    FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE SET NULL,
    FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Create Pinterest style templates table (for easy management)
CREATE TABLE IF NOT EXISTS pinterest_styles (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    preview_image TEXT,
    is_active BOOLEAN DEFAULT 1
);

-- Insert Pinterest style definitions
INSERT OR REPLACE INTO pinterest_styles (id, name, description, is_active) VALUES
(1, 'Simple Text', 'Clean background with simple text overlay', 1),
(2, 'Geometric Border', 'Dotted frame with modern design', 1),
(3, 'Modern Badge', 'Corner label with accent color', 1),
(4, 'Clean Ribbon', 'Accent strips for visual interest', 1),
(5, 'Decorative Frame', 'Corner accents and borders', 1),
(6, 'Gradient Background', 'Smooth gradient overlay', 1),
(7, 'Shadow Box', 'Elevated text with shadows', 1),
(8, 'Vintage Style', 'Classic recipe card design', 1),
(9, 'Modern Minimal', 'Ultra-clean contemporary', 1),
(10, 'Colorful Accent', 'Bright color highlights', 1),
(11, 'Professional', 'Business-style layout', 1),
(12, 'Handwritten Style', 'Script font design', 1),
(13, 'Bold Statement', 'High-impact typography', 1),
(14, 'Rustic Wood Grain', 'Homemade feel with wood texture', 1),
(15, 'Vintage Recipe Card', 'Traditional cookbook style', 1),
(16, 'Modern Minimalist Chef', 'Professional chef quality', 1),
(17, 'Farm Fresh', 'Garden-to-table aesthetic', 1),
(18, 'Cozy Kitchen Warmth', 'Home-cooked comfort', 1),
(19, 'Artisan Craft', 'Handcrafted food artistry', 1),
(20, 'Bakery Flour Dust', 'Fresh baked goods style', 1),
(21, 'Gourmet Restaurant', 'Fine dining presentation', 1),
(22, 'Family Recipe', 'Generational cooking tradition', 1);

-- Create Buffer posting queue for batch operations
CREATE TABLE IF NOT EXISTS buffer_queue (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    website_id TEXT NOT NULL,
    recipe_ids TEXT NOT NULL, -- JSON array of recipe IDs
    post_type TEXT NOT NULL,
    scheduled_start_time DATETIME NOT NULL,
    interval_minutes INTEGER DEFAULT 60, -- Time between posts
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_by_user_id TEXT,
    FOREIGN KEY (website_id) REFERENCES websites(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_buffer_posts_website_id ON buffer_posts(website_id);
CREATE INDEX IF NOT EXISTS idx_buffer_posts_scheduled_time ON buffer_posts(scheduled_time);
CREATE INDEX IF NOT EXISTS idx_buffer_posts_status ON buffer_posts(status);
CREATE INDEX IF NOT EXISTS idx_buffer_queue_website_id ON buffer_queue(website_id);
CREATE INDEX IF NOT EXISTS idx_buffer_queue_status ON buffer_queue(status);