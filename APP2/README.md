# Recipe Content Generator Web Application

A comprehensive web application for generating SEO-optimized content for Pinterest, blogs, and Facebook using AI models. Features user management, multi-tenant website support, WordPress integration, and Midjourney image generation capabilities.

## 🌟 Features

- **AI-Powered Content Generation** - Create recipe content with OpenAI
- **Pinterest Image Generation** - 22+ creative Pinterest templates
- **Midjourney Integration** - Automatic image generation with Discord
- **Buffer Integration** - Schedule social media posts automatically
- **WordPress Publishing** - Direct integration with WP-Recipe-Maker
- **Multi-Tenant Support** - Organization and website management
- **Image Cropping** - Client-side image processing
- **User Management** - Admin, employee, and user roles

## 🚀 Quick Deploy to Railway

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/template/...)

## 📋 Prerequisites

- Node.js 18+ 
- OpenAI API Key
- Buffer API credentials (optional)
- Discord Bot Token (for Midjourney)
- ImgBB API Key (for image hosting)

## 🛠️ Installation

### 1. Clone the Repository
```bash
git clone https://github.com/BENMOU98/recipe-content-generator.git
cd recipe-content-generator
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Environment Setup
```bash
# Copy the example environment file
cp .env.example .env

# Edit .env with your API keys
nano .env
```

### 4. Initialize Database
```bash
npm run init-db
```

### 5. Start the Application
```bash
# Development mode
npm run dev

# Production mode
npm start
```

## 🌐 Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `OPENAI_API_KEY` | OpenAI API key for content generation | ✅ |
| `BUFFER_ACCESS_TOKEN` | Buffer API token for social media | ❌ |
| `DISCORD_TOKEN` | Discord bot token for Midjourney | ❌ |
| `IMGBB_API_KEY` | ImgBB API key for image hosting | ❌ |
| `SESSION_SECRET` | Secret for session management | ✅ |
| `PORT` | Application port (default: 3000) | ❌ |

## 📚 Usage

1. **Register an Account** - Create admin account
2. **Set up Organization** - Configure your organization settings
3. **Add Websites** - Create websites to manage
4. **Configure APIs** - Set up Buffer, Discord, WordPress integrations
5. **Generate Content** - Start creating recipes and content
6. **Publish to Social Media** - Use Buffer integration for scheduling

## 🎨 Pinterest Templates

Choose from 22+ professional Pinterest templates:
- Geometric Border designs
- Modern badge layouts
- Clean ribbon styles
- Decorative frames
- Themed designs (Rustic, Vintage, Minimalist, etc.)

## 🤖 AI Models Supported

- GPT-4 Turbo
- GPT-4o-mini
- Custom prompts for different content types

## 📱 Social Media Integration

- **Buffer** - Schedule posts to multiple platforms
- **Pinterest** - Optimized pin generation
- **Facebook** - Page and group posting
- **WordPress** - Direct blog publishing

## 🔐 Security Features

- Role-based access control
- Multi-tenant data isolation
- Session management
- Environment variable protection

## 📊 Analytics & Management

- Admin dashboard with team performance
- Employee analytics and tracking
- Website performance monitoring
- 15-day salary period calculations

## 🛠️ Development

### Commands
```bash
npm start        # Start server
npm run dev      # Development with nodemon
npm test         # Run tests
npm run init-db  # Initialize database
```

### Database Migrations
```bash
node migrations/[migration-file].js
```

## 🚀 Deployment

### Railway (Recommended)
1. Push to GitHub
2. Connect to Railway
3. Set environment variables
4. Deploy automatically

### Manual Deployment
1. Set up Node.js environment
2. Install dependencies
3. Configure environment variables
4. Run database migrations
5. Start the application

## 📝 License

MIT License - see LICENSE file for details

## 🤝 Contributing

1. Fork the repository
2. Create feature branch
3. Commit changes
4. Push to branch
5. Open pull request

## 📞 Support

For support, please contact [your-email] or open an issue on GitHub.

## 🔗 Links

- [Live Demo](https://your-app-url.railway.app)
- [Documentation](https://github.com/BENMOU98/recipe-content-generator/wiki)
- [Issues](https://github.com/BENMOU98/recipe-content-generator/issues)