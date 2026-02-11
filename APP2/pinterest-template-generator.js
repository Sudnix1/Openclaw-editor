const sharp = require('sharp');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

/**
 * Template-based Pinterest Image Generator
 * Uses pre-designed templates for exact design matching
 */
class PinterestTemplateGenerator {
  constructor() {
    this.canvasWidth = 561;
    this.canvasHeight = 1120;
    this.imageHeight = 400; // Height for top and bottom images
    this.textBoxHeight = 320; // Height for middle text section
    
    // Ensure output directory exists
    this.outputDir = path.join(__dirname, 'public', 'images', 'pinterest');
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  /**
   * Option 1: Create a customizable template overlay
   */
  async createTemplateOverlay(text, width, height, dominantColor) {
    // Use a simplified but exact design that matches your reference
    const svg = `
      <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <!-- Exact diagonal band like your reference -->
          <linearGradient id="bandGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style="stop-color:rgb(${Math.min(255, dominantColor.r + 30)}, ${Math.min(255, dominantColor.g + 30)}, ${Math.min(255, dominantColor.b + 30)});stop-opacity:0.95" />
            <stop offset="50%" style="stop-color:rgb(${dominantColor.r}, ${dominantColor.g}, ${dominantColor.b});stop-opacity:1" />
            <stop offset="100%" style="stop-color:rgb(${Math.max(0, dominantColor.r - 30)}, ${Math.max(0, dominantColor.g - 30)}, ${Math.max(0, dominantColor.b - 30)});stop-opacity:0.95" />
          </linearGradient>
          
          <filter id="textShadow">
            <feDropShadow dx="2" dy="4" stdDeviation="3" flood-color="#000000" flood-opacity="0.7"/>
          </filter>
          
          <filter id="bandShadow">
            <feDropShadow dx="0" dy="8" stdDeviation="6" flood-color="#000000" flood-opacity="0.4"/>
          </filter>
        </defs>
        
        <!-- Thick diagonal band matching your reference EXACTLY -->
        <path d="M -20 ${height * 0.2} L ${width + 20} ${height * 0.1} L ${width + 20} ${height * 0.9} L -20 ${height * 0.8} Z" 
              fill="url(#bandGradient)" 
              filter="url(#bandShadow)"/>
        
        <!-- Text with exact styling from your reference -->
        <text x="${width / 2}" y="${height / 2}" 
              font-family="Permanent Marker, Brush Script MT, Bradley Hand, Marker Felt, fantasy, cursive" 
              font-size="72" 
              font-weight="900"
              fill="#ffffff" 
              text-anchor="middle" 
              dominant-baseline="middle"
              filter="url(#textShadow)"
              stroke="#000000"
              stroke-width="4"
              paint-order="stroke fill">
          ${this.formatTextForTemplate(text)}
        </text>
      </svg>
    `;
    
    return Buffer.from(svg);
  }

  /**
   * Format text to fit the template design
   */
  formatTextForTemplate(text) {
    // Keep it simple - prefer single line, max 2 lines
    const words = text.split(' ');
    
    if (text.length <= 20) {
      return text; // Single line
    }
    
    // Split into 2 lines if needed
    const midPoint = Math.ceil(words.length / 2);
    const line1 = words.slice(0, midPoint).join(' ');
    const line2 = words.slice(midPoint).join(' ');
    
    return `<tspan x="50%" dy="-20">${line1}</tspan><tspan x="50%" dy="50">${line2}</tspan>`;
  }

  /**
   * Option 2: Use a pre-made template image (RECOMMENDED)
   */
  async createFromTemplate(text, topImageUrl, bottomImageUrl, keyword) {
    console.log('🎨 Creating Pinterest image from template...');
    
    // For now, let's use the programmatic approach with exact measurements
    const result = await this.generateWithExactMeasurements(text, topImageUrl, bottomImageUrl, keyword);
    return result;
  }

  /**
   * Generate with exact pixel measurements matching your reference
   */
  async generateWithExactMeasurements(text, topImageUrl, bottomImageUrl, keyword) {
    try {
      // Download and process images (same as before)
      const axios = require('axios');
      
      const downloadImage = async (imageUrl) => {
        let fullUrl = imageUrl;
        if (imageUrl.startsWith('/')) {
          fullUrl = `http://localhost:3000${imageUrl}`;
        }
        
        const response = await axios.get(fullUrl, {
          responseType: 'arraybuffer',
          timeout: 30000
        });
        return Buffer.from(response.data);
      };

      const [topImageBuffer, bottomImageBuffer] = await Promise.all([
        downloadImage(topImageUrl),
        downloadImage(bottomImageUrl)
      ]);

      // Process images to exact dimensions
      const [processedTopImage, processedBottomImage] = await Promise.all([
        sharp(topImageBuffer).resize(561, 400, { fit: 'cover', position: 'center' }).jpeg({ quality: 85 }).toBuffer(),
        sharp(bottomImageBuffer).resize(561, 400, { fit: 'cover', position: 'center' }).jpeg({ quality: 85 }).toBuffer()
      ]);

      // Extract dominant color
      const { dominant } = await sharp(processedTopImage).stats();
      const dominantColor = { r: dominant.r, g: dominant.g, b: dominant.b };

      // Create the overlay with exact template styling
      const textOverlay = await this.createTemplateOverlay(text, 561, 320, dominantColor);
      const textOverlayImage = await sharp(textOverlay).png().toBuffer();

      // Composite final image
      const finalImage = await sharp({
        create: {
          width: 561,
          height: 1120,
          channels: 3,
          background: { r: 255, g: 255, b: 255 }
        }
      })
      .composite([
        { input: processedTopImage, top: 0, left: 0 },
        { input: textOverlayImage, top: 400, left: 0 },
        { input: processedBottomImage, top: 720, left: 0 }
      ])
      .jpeg({ quality: 90 })
      .toBuffer();

      // Save the image
      const imageFilename = `pinterest_template_${keyword.replace(/\s+/g, '_')}_${Date.now()}.jpg`;
      const imagePath = path.join(this.outputDir, imageFilename);
      
      await fs.promises.writeFile(imagePath, finalImage);
      
      const relativeUrl = `/images/pinterest/${imageFilename}`;
      
      console.log('✅ Template-based Pinterest image generated!');
      console.log(`🌐 URL: ${relativeUrl}`);

      return {
        success: true,
        imagePath,
        imageUrl: relativeUrl,
        filename: imageFilename,
        dimensions: { width: 561, height: 1120 },
        metadata: { keyword, text, topImageUrl, bottomImageUrl, generatedAt: new Date().toISOString() }
      };

    } catch (error) {
      console.error('❌ Template generation failed:', error.message);
      throw new Error(`Template generation failed: ${error.message}`);
    }
  }
}

module.exports = PinterestTemplateGenerator;