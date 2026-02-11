# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Recipe Content Generator Web Application that creates SEO-optimized content for Pinterest, blogs, and Facebook using AI models. Includes user management, multi-tenant website support, WordPress integration, and Midjourney image generation.

## Development Commands

- **Start server**: `npm start` or `node server.js`
- **Development mode**: `npm run dev` (uses nodemon)
- **Run tests**: `npm test` (Jest)
- **Initialize database**: `npm run init-db` or `node init-db.js`

## Architecture

### Core Components

- **Entry Point**: `server.js` - Express server with session management, authentication, route handling
- **Main Logic**: `app.js` - Content generation functions for Pinterest, blog, Facebook
- **Database**: SQLite (`data/recipes.db`) with multi-tenant support via `website_id` filtering
- **Authentication**: Multi-tier system (admin, employee, user) with organization-based permissions

### Key Modules

- **Database Layer**: `db.js` - SQLite utilities with website filtering, foreign key constraints, cascading deletes
- **User Management**: `models/` - User, organization, and website models
- **Content Generation**: Recipe templates, WordPress integration, AI prompt management
- **Image Processing**: `midjourney/` - Midjourney integration with image cropping (client-side, base64 data URLs)
- **WordPress Integration**: `wordpress.js`, `wordpress-db.js` - WP-Recipe-Maker plugin integration
- **Pinterest Generator**: `pinterest-image-generator.js` - Automatic Midjourney grid detection, quadrant cropping, 22 creative styles

### Database Structure

Multi-tenant architecture where all data is filtered by `website_id`. Key tables:
- `users`, `organizations` - Hierarchical permissions
- `recipes` - Full content (ingredients, instructions, metadata)
- `keywords` - Image URLs, processing status, linked to recipes via `recipe_id`
- `wordpress_publications` - Tracks WP publishing (recipe_id, wp_post_id, wp_post_url, wp_status, website_id)
- `wordpress_settings` - Per-website WP config (website-centric, not user-centric)
- `recipe_images` - Midjourney/Discord image generation status
- `pinterest_variations` - PinClicks data
- `website_permissions` - Employee access control per website
- `activities` - Activity logging

### Settings System

- **File-based storage**: `data/config-{organizationId}-{websiteId}.json`
- **Hierarchical fallback**: Website -> Organization -> Global (`global.promptConfig`)
- **Loaded via**: `promptSettingsDb.loadSettings(organizationId, websiteId)`

### Views and Frontend

- **Template Engine**: EJS with Express layouts
- **Main Views**: `views/` - dashboard, recipes, keywords, settings, admin-dashboard, websites
- **Static Assets**: `public/` - CSS (dark midnight theme), JavaScript, images
- **Key Frontend**: Image cropping (client-side), website switching, sequential keyword processing

### Key Technical Patterns

- **WordPress settings**: Website-centric lookup (by `website_id` only, not user_id). `getSettings()` falls back to global if no website-specific settings found.
- **WordPress publishing routes**: All require `websiteMiddleware.hasWebsiteAccess` and `websiteMiddleware.ensureWebsiteSelected`
- **Keyword processing**: Sequential (one at a time) with 3-second delays between keywords to avoid Discord spam detection. 20-minute timeout per keyword.
- **Image cropping**: Client-side with base64 data URL storage in DB. Cropped images uploaded to ImgBB for Discord/Midjourney compatibility.
- **Database operations**: Use `getOne`/`getAll`/`runQuery` helpers. Foreign key constraints with cascading deletes via `safeDelete`.
- **Pinterest grid processing**: Auto-detects `grid_` prefixed Midjourney images, extracts top-left and bottom-right quadrants for top/bottom Pinterest positions.
- **Organization isolation**: All queries filtered by `organizationId`. Settings stored per org+website combo.

## Environment Configuration

Uses `dotenv`. Key variables control:
- AI model settings and API keys
- Database connections
- WordPress integration settings
- Midjourney/Discord API configuration
- Default language and content settings
