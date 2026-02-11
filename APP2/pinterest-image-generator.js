const sharp = require('sharp');
const axios = require('axios');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { createCanvas, loadImage, registerFont, Image } = require('canvas');

/**
 * Pinterest Image Generator
 * Creates 561x1120 Pinterest-optimized images with:
 * - Top image (561x400)
 * - Text overlay box in the middle (561x320)
 * - Bottom image (561x400)
 */
class PinterestImageGenerator {
  constructor() {
    this.canvasWidth = 561;
    this.canvasHeight = 1120;
    this.imageHeight = 480; // Even taller images - no white space
    this.textBoxHeight = 160; // Even smaller text box - just like reference
    this.topImageHeight = 480; // Top image height
    this.bottomImageHeight = 480; // Bottom image height (1120 - 160 = 960, split evenly: 480 each)
    
    // Ensure output directory exists
    this.outputDir = path.join(__dirname, 'public', 'images', 'pinterest');
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }

    // Fonts directory for downloaded Google Fonts
    this.fontsDir = path.join(__dirname, 'fonts');
    if (!fs.existsSync(this.fontsDir)) {
      fs.mkdirSync(this.fontsDir, { recursive: true });
    }

    // Initialize fonts on startup
    this.initializeFonts();
  }

  /**
   * Download and register Google Fonts for Canvas rendering
   */
  async initializeFonts() {
    try {
      // Try to register with TTF format for better compatibility
      await this.downloadAndRegisterFont('Permanent Marker', 'https://fonts.gstatic.com/s/permanentmarker/v16/Fh4uPib9Iyv2ucM6pGQMWimMp004La2Cfw.ttf', 'ttf');
      console.log('✅ Google Fonts initialized for Pinterest generation');
    } catch (error) {
      console.warn('⚠️ Could not initialize Google Fonts, using fallback fonts:', error.message);
      // Continue without font registration - Canvas will use fallback fonts
    }
  }

  /**
   * Download font file and register it with Canvas
   */
  async downloadAndRegisterFont(fontName, fontUrl, format = 'woff2') {
    const fontPath = path.join(this.fontsDir, `${fontName.replace(/\s+/g, '')}.${format}`);
    
    // Skip if font already exists and try to register it
    if (fs.existsSync(fontPath)) {
      try {
        registerFont(fontPath, { family: fontName });
        console.log(`✅ Font registered from cache: ${fontName}`);
        return;
      } catch (error) {
        console.warn(`⚠️ Could not register cached font, will try to re-download`);
        // Delete corrupted font file and continue to re-download
        fs.unlinkSync(fontPath);
      }
    }

    try {
      console.log(`📥 Downloading font: ${fontName} (${format})`);
      
      // For TTF, we need to use the correct Google Fonts URL
      let actualUrl = fontUrl;
      if (format === 'ttf') {
        // Use direct TTF download from Google Fonts
        actualUrl = `https://fonts.googleapis.com/css2?family=${fontName.replace(' ', '+')}:wght@400;700;900&display=swap`;
        
        // First get the CSS to find the actual font URL
        const cssResponse = await axios.get(actualUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        });
        
        // Extract font URL from CSS (simplified - you might need better parsing)
        const fontUrlMatch = cssResponse.data.match(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+\.ttf)\)/);
        if (fontUrlMatch) {
          actualUrl = fontUrlMatch[1];
        } else {
          throw new Error('Could not extract TTF URL from Google Fonts CSS');
        }
      }
      
      const response = await axios.get(actualUrl, { 
        responseType: 'arraybuffer',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      
      fs.writeFileSync(fontPath, response.data);
      
      // Try to register the font
      try {
        registerFont(fontPath, { family: fontName });
        console.log(`✅ Font downloaded and registered: ${fontName}`);
        
        // Test if font is actually available by creating a small test canvas
        try {
          const testCanvas = createCanvas(100, 50);
          const testCtx = testCanvas.getContext('2d');
          testCtx.font = `20px "${fontName}"`;
          const testActualFont = testCtx.font;
          console.log(`🧪 Font test - Requested: "20px ${fontName}", Got: "${testActualFont}"`);
        } catch (testError) {
          console.warn(`⚠️ Font test failed:`, testError.message);
        }
      } catch (registerError) {
        console.warn(`⚠️ Font downloaded but could not register: ${registerError.message}`);
        // Keep the font file for potential future use
      }
    } catch (error) {
      console.warn(`⚠️ Could not download font ${fontName}:`, error.message);
    }
  }

  /**
   * Download image from URL and return buffer
   */
  async downloadImage(imageUrl) {
    try {
      // FIXED: Check if it's a local file first (more reliable than HTTP)
      if (imageUrl.startsWith('/recipe_images/') || imageUrl.includes('recipe_images/')) {
        // Extract filename and build local path
        const filename = imageUrl.replace(/^.*recipe_images\//, '');
        const localPath = path.join(__dirname, 'recipe_images', filename);
        
        // Check if file exists locally
        if (fs.existsSync(localPath)) {
          console.log(`📁 Reading image from local file: ${localPath}`);
          return fs.readFileSync(localPath);
        }
      }
      
      // Fallback to HTTP download for non-local files
      let fullUrl = imageUrl;
      if (imageUrl.startsWith('/')) {
        // Use localhost or base URL - in production this should be your domain
        fullUrl = `http://localhost:4000${imageUrl}`;
      }
      
      console.log(`📥 Downloading image from: ${fullUrl}`);
      
      const response = await axios.get(fullUrl, {
        responseType: 'arraybuffer',
        timeout: 30000
      });
      return Buffer.from(response.data);
    } catch (error) {
      console.error('Error downloading image:', error.message);
      throw new Error(`Failed to download image from ${imageUrl}: ${error.message}`);
    }
  }

  /**
   * Crop individual image from Midjourney grid (2x2 layout)
   * Position: 0=top-left, 1=top-right, 2=bottom-left, 3=bottom-right
   */
  async cropFromMidjourneyGrid(imageBuffer, position = 0) {
    try {
      const image = sharp(imageBuffer);
      const metadata = await image.metadata();
      
      // Midjourney grids are typically square, divided into 2x2
      const gridWidth = metadata.width;
      const gridHeight = metadata.height;
      const cellWidth = Math.floor(gridWidth / 2);
      const cellHeight = Math.floor(gridHeight / 2);
      
      // Calculate crop coordinates based on position
      let left, top;
      switch(position) {
        case 0: // top-left
          left = 0;
          top = 0;
          break;
        case 1: // top-right
          left = cellWidth;
          top = 0;
          break;
        case 2: // bottom-left
          left = 0;
          top = cellHeight;
          break;
        case 3: // bottom-right
          left = cellWidth;
          top = cellHeight;
          break;
        default:
          left = 0;
          top = 0;
      }
      
      console.log(`✂️ Cropping grid position ${position} from ${gridWidth}x${gridHeight} at (${left},${top}) size ${cellWidth}x${cellHeight}`);
      
      return await image
        .extract({ 
          left: left,
          top: top, 
          width: cellWidth, 
          height: cellHeight 
        })
        .jpeg({ quality: 90 })
        .toBuffer();
        
    } catch (error) {
      console.error('Error cropping from grid:', error.message);
      throw new Error('Failed to crop image from grid');
    }
  }

  /**
   * Resize and crop image to specified dimensions
   */
  async processImage(imageBuffer, width, height) {
    try {
      return await sharp(imageBuffer)
        .resize(width, height, {
          fit: 'cover',
          position: 'center'
        })
        .jpeg({ quality: 85 })
        .toBuffer();
    } catch (error) {
      console.error('Error processing image:', error.message);
      throw new Error('Failed to process image');
    }
  }

  /**
   * Extract dominant color from image buffer with better color sampling
   */
  async extractDominantColor(imageBuffer) {
    try {
      console.log(`🔍 Extracting color from image buffer (${imageBuffer.length} bytes)`);
      
      // Get image metadata and raw pixel data
      const image = sharp(imageBuffer);
      const { width, height } = await image.metadata();
      
      // Resize to smaller size for faster processing and get raw pixel data
      const { data } = await image
        .resize(100, 100, { fit: 'cover' })
        .raw()
        .toBuffer({ resolveWithObject: true });
      
      // Sample pixels to find the most common colors
      const colorCounts = {};
      const tolerance = 30; // Group similar colors together
      
      // Process every pixel (RGB values)
      for (let i = 0; i < data.length; i += 3) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        
        // Skip very dark pixels (likely shadows/text)
        if (r + g + b < 60) continue;
        
        // Group similar colors together
        const colorKey = `${Math.floor(r / tolerance) * tolerance},${Math.floor(g / tolerance) * tolerance},${Math.floor(b / tolerance) * tolerance}`;
        
        if (!colorCounts[colorKey]) {
          colorCounts[colorKey] = { count: 0, r, g, b };
        }
        colorCounts[colorKey].count++;
      }
      
      // Find the most common color (excluding very dark ones)
      let dominantColor = null;
      let maxCount = 0;
      
      for (const [key, color] of Object.entries(colorCounts)) {
        if (color.count > maxCount) {
          maxCount = color.count;
          dominantColor = { r: color.r, g: color.g, b: color.b };
        }
      }
      
      // Fallback to Sharp's dominant color if sampling failed
      if (!dominantColor) {
        console.log(`⚠️ Pixel sampling failed, using Sharp's dominant color`);
        const { dominant } = await sharp(imageBuffer).stats();
        dominantColor = dominant;
      }
      
      console.log(`📊 Sampled dominant color:`, dominantColor);
      
      // Check if color is very dark (likely shadows/background) and adjust
      const totalBrightness = dominantColor.r + dominantColor.g + dominantColor.b;
      console.log(`💡 Color brightness total: ${totalBrightness}`);
      
      let finalColor = dominantColor;
      
      // Only adjust if color is extremely dark (likely pure black/shadows)
      if (totalBrightness < 30) {
        console.log(`⚠️ Color extremely dark (${totalBrightness}), brightening while preserving hue`);
        // Brighten while keeping the color ratios
        const brightnessFactor = 120 / totalBrightness; // Target brightness of 120
        finalColor = {
          r: Math.min(255, Math.round(dominantColor.r * brightnessFactor)),
          g: Math.min(255, Math.round(dominantColor.g * brightnessFactor)),
          b: Math.min(255, Math.round(dominantColor.b * brightnessFactor))
        };
      } else if (totalBrightness < 60) {
        // Slightly brighten very dark colors but keep the hue
        console.log(`🔆 Slightly brightening dark color (${totalBrightness})`);
        const factor = 1.8;
        finalColor = {
          r: Math.min(255, Math.round(dominantColor.r * factor)),
          g: Math.min(255, Math.round(dominantColor.g * factor)), 
          b: Math.min(255, Math.round(dominantColor.b * factor))
        };
      }
      
      console.log(`🎨 Using final color for extraction:`, finalColor);
      
      // Convert RGB to HSL for better color selection
      const r = finalColor.r / 255;
      const g = finalColor.g / 255;  
      const b = finalColor.b / 255;
      
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      let h, s, l = (max + min) / 2;
      
      if (max === min) {
        h = s = 0; // achromatic
      } else {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
          case r: h = (g - b) / d + (g < b ? 6 : 0); break;
          case g: h = (b - r) / d + 2; break;
          case b: h = (r - g) / d + 4; break;
        }
        h /= 6;
      }
      
      // Keep colors more natural - don't over-saturate
      if (s < 0.3) s = 0.5; // Moderate saturation to preserve natural colors
      if (l > 0.8) l = 0.7; // Darken if too light for text readability  
      if (l < 0.25) l = 0.35; // Brighten if too dark for visibility
      
      // Convert back to RGB
      const hslToRgb = (h, s, l) => {
        let r, g, b;
        if (s === 0) {
          r = g = b = l; // achromatic
        } else {
          const hue2rgb = (p, q, t) => {
            if (t < 0) t += 1;
            if (t > 1) t -= 1;
            if (t < 1/6) return p + (q - p) * 6 * t;
            if (t < 1/2) return q;
            if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
            return p;
          };
          const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
          const p = 2 * l - q;
          r = hue2rgb(p, q, h + 1/3);
          g = hue2rgb(p, q, h);
          b = hue2rgb(p, q, h - 1/3);
        }
        return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
      };
      
      const [red, green, blue] = hslToRgb(h, s, l);
      finalColor = { r: red, g: green, b: blue };
      console.log(`✅ Final processed color: rgb(${red}, ${green}, ${blue})`);
      return finalColor;
      
    } catch (error) {
      console.warn('Could not extract dominant color, using default:', error.message);
      // Default to a vibrant orange if extraction fails
      const defaultColor = { r: 255, g: 120, b: 0 };
      console.log(`🔶 Using default color: rgb(${defaultColor.r}, ${defaultColor.g}, ${defaultColor.b})`);
      return defaultColor;
    }
  }

  /**
   * Create HTML canvas-based text overlay with Google Fonts support
   */
  async createTextOverlayWithGoogleFont(text, width, height, dominantColor = { r: 255, g: 120, b: 0 }, variation = 1, fontFamily = 'Permanent Marker') {
    // Create HTML template that renders text with Google Fonts
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <link href="https://fonts.googleapis.com/css2?family=${fontFamily.replace(' ', '+')}:wght@400;700;900&display=swap" rel="stylesheet">
        <style>
          body { margin: 0; padding: 0; }
          .text-overlay {
            width: ${width}px;
            height: ${height}px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-family: "${fontFamily}", cursive;
            font-weight: 900;
            font-size: ${this.calculateOptimalFontSize(text, width)}px;
            color: white;
            text-align: center;
            text-shadow: 2px 2px 4px rgba(0,0,0,0.8);
            -webkit-text-stroke: 2px black;
            letter-spacing: 2px;
            line-height: 1.1;
            word-wrap: break-word;
            background: ${this.createCSSBackground(dominantColor, variation)};
          }
        </style>
      </head>
      <body>
        <div class="text-overlay">${text}</div>
      </body>
      </html>
    `;

    // This would ideally use a headless browser like Puppeteer
    // For now, return SVG fallback but structured for future browser rendering
    return this.createTextOverlay(text, width, height, dominantColor, variation);
  }

  /**
   * Calculate optimal font size based on text length and container width
   */
  calculateOptimalFontSize(text, width) {
    const baseSize = 52;
    const textLength = text.length;
    
    if (textLength <= 10) return Math.min(baseSize, width / 7);
    if (textLength <= 20) return Math.min(44, width / 9);
    if (textLength <= 30) return Math.min(36, width / 11);
    return Math.max(28, width / 15);
  }

  /**
   * Create CSS background for different variations
   */
  createCSSBackground(dominantColor, variation) {
    const { r, g, b } = dominantColor;
    const baseColor = `rgb(${r}, ${g}, ${b})`;
    const lightColor = `rgb(${Math.min(255, r + 60)}, ${Math.min(255, g + 60)}, ${Math.min(255, b + 60)})`;
    
    switch (variation) {
      case 1:
        return `linear-gradient(90deg, ${baseColor} 0%, ${lightColor} 100%)`;
      case 2:
        return `linear-gradient(180deg, ${baseColor} 0%, ${lightColor} 50%, ${baseColor} 100%)`;
      case 3:
        return `repeating-linear-gradient(45deg, ${baseColor} 0px, ${lightColor} 10px, ${baseColor} 20px)`;
      case 4:
        return `radial-gradient(circle, ${lightColor} 0%, ${baseColor} 100%)`;
      case 5:
        return `linear-gradient(135deg, ${baseColor} 0%, ${lightColor} 50%, ${baseColor} 100%)`;
      default:
        return baseColor;
    }
  }

  /**
   * Create text overlay using Canvas
   */
  async createCanvasTextOverlay(text, width, height, dominantColor = { r: 255, g: 120, b: 0 }, variation = 1) {
    console.log(`🎨 createCanvasTextOverlay called with variation: ${variation}`);
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // Calculate MUCH larger font size to match reference image
    const textLength = text.length;
    let fontSize;
    
    console.log(`🔍 FONT DEBUG START:`);
    console.log(`🔍 Canvas width: ${width}`);
    console.log(`🔍 Text: "${text}"`);
    console.log(`🔍 Text length: ${textLength}`);
    console.log(`🔍 Variation: ${variation}`);
    
    // The text "Quick & Easy: 30-Minute Dinner" is 34 characters, so it's hitting the long text case
    if (textLength <= 10) {
      const calculated = Math.min(40, width / 12);
      console.log(`🔍 Short text case: Math.min(40, ${width}/12) = Math.min(40, ${width/12}) = ${calculated}`);
      fontSize = calculated;
    } else if (textLength <= 20) {
      const calculated = Math.min(36, width / 14);
      console.log(`🔍 Medium text case: Math.min(36, ${width}/14) = Math.min(36, ${width/14}) = ${calculated}`);
      fontSize = calculated;
    } else {
      const calculated = Math.min(30, width / 18);
      console.log(`🔍 Long text case: Math.min(30, ${width}/18) = Math.min(30, ${width/18}) = ${calculated}`);
      fontSize = calculated;
    }
    
    console.log(`🔍 Before Math.max: fontSize = ${fontSize}`);
    fontSize = 32; // Fixed 42px font size
    console.log(`🔍 After Math.max(28, ${fontSize}): fontSize = ${fontSize}`);
    
    console.log(`🔍 FINAL CALCULATED FONT SIZE: ${fontSize}px`);

    // Use the extracted dominant color for background
    console.log(`🎨 Using extracted dominant color for background:`, dominantColor);
    
    this.createCanvasBackground(ctx, width, height, dominantColor, variation);

    // Set up text styling - simple Arial Bold
    const fontString = `bold ${fontSize}px Arial, sans-serif`;
    console.log(`🔍 FONT APPLICATION DEBUG:`);
    console.log(`🔍 About to set font: "${fontString}"`);
    
    ctx.font = fontString;
    console.log(`🔍 Font set on context: ctx.font = "${ctx.font}"`);
    
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    
    console.log(`🔍 Text properties set: align=center, baseline=middle, color=#ffffff`);
    
    // Test font measurement
    const testMeasurement = ctx.measureText('Test');
    console.log(`🔍 Font measurement test: "Test" measures ${testMeasurement.width}px wide`);
    
    console.log(`🎨 Canvas font applied: ${fontString}`);

    // Add text stroke (outline)
    ctx.strokeStyle = '#000000';
    const strokeWidth = 4;
    ctx.lineWidth = strokeWidth;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    // Handle multi-line text with more conservative wrapping
    const words = text.split(' ');
    const maxWidth = width - 120; // More padding to prevent overflow
    let lines = [];
    let currentLine = words[0];

    for (let i = 1; i < words.length; i++) {
      const testLine = currentLine + ' ' + words[i];
      const metrics = ctx.measureText(testLine);
      if (metrics.width > maxWidth && currentLine.length > 0) {
        lines.push(currentLine);
        currentLine = words[i];
      } else {
        currentLine = testLine;
      }
    }
    lines.push(currentLine);

    // Draw text with stroke and fill - COMPACT line spacing for templates
    const lineHeight = variation >= 2 ? fontSize * 1.05 : fontSize * 1.1; // Tighter line spacing for templates
    let startY = (height / 2) - ((lines.length - 1) * lineHeight / 2);
    
    console.log(`🎨 Line spacing debug: fontSize=${fontSize}, lineHeight=${lineHeight}, variation=${variation}, totalLines=${lines.length}`);
    
    // For variation 2 (template style), position text inside the recipe box with proper spacing
    if (variation === 2 && ctx.recipeBoxArea) {
      const boxArea = ctx.recipeBoxArea;
      const textAreaY = boxArea.badgeY + boxArea.badgeHeight + 35; // More space below badge
      const textAreaHeight = boxArea.height - (boxArea.badgeY + boxArea.badgeHeight + 50); // More available space
      startY = textAreaY + (textAreaHeight / 2) - ((lines.length - 1) * lineHeight / 2);
      console.log(`🎨 Style 2: Positioning text with spacing - Badge ends at ${boxArea.badgeY + boxArea.badgeHeight}, text starts at ${textAreaY}`);
    }

    // First, add decorative elements (backgrounds) BEFORE text
    this.addCanvasDecorations(ctx, width, height, variation, dominantColor);

    // NOW draw text ON TOP of all backgrounds
    lines.forEach((line, index) => {
      const y = startY + (index * lineHeight);
      
      // UNIVERSAL PURE WHITE TEXT for ALL variations (2, 3, 4, 5, 6)
      if (variation >= 2) {
        console.log(`🔍 TEXT RENDERING DEBUG for line ${index}: "${line}"`);
        console.log(`🔍 Current ctx.font before rendering: "${ctx.font}"`);
        
        // Reset any previous settings that might affect color
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1.0;
        
        // ENSURE FONT IS NOT OVERRIDDEN
        const expectedFont = `bold ${fontSize}px Arial, sans-serif`;
        if (ctx.font !== expectedFont) {
          console.log(`🚨 FONT MISMATCH! Expected: "${expectedFont}", Actual: "${ctx.font}"`);
          ctx.font = expectedFont;
          console.log(`🔧 Font corrected to: "${ctx.font}"`);
        }
        
        // Draw text with ORIGINAL style but PURE WHITE color
        // Add text shadow for depth (like original)
        ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
        ctx.shadowOffsetX = 2;
        ctx.shadowOffsetY = 3;
        ctx.shadowBlur = 4;
        
        // Draw PURE WHITE text - ensuring white color
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText(line, width / 2, y);
        
        // Reset shadow for stroke
        ctx.shadowColor = 'transparent';
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
        ctx.shadowBlur = 0;
        
        // Draw stroke (original thickness)
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 4;
        ctx.strokeText(line, width / 2, y);
        
        // Draw final white fill on top
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText(line, width / 2, y);
        
      } else {
        // Style 1: Original text styling
        ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
        ctx.shadowOffsetX = 2;
        ctx.shadowOffsetY = 3;
        ctx.shadowBlur = 4;
        ctx.fillText(line, width / 2, y);
        
        ctx.shadowColor = 'transparent';
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
        ctx.shadowBlur = 0;
        
        ctx.strokeText(line, width / 2, y);
        ctx.fillText(line, width / 2, y);
      }
    });

    return canvas.toBuffer('image/png');
  }

  /**
   * Create background gradient for Canvas
   */
  createCanvasBackground(ctx, width, height, dominantColor, variation) {
    console.log(`🎨 createCanvasBackground called with variation: ${variation}`);
    
    let gradient;
    switch (variation) {
      case 1: // Simple Layout - Horizontal gradient using dominant color
        const { r, g, b } = dominantColor;
        const baseColor = `rgb(${r}, ${g}, ${b})`;
        const lightColor = `rgb(${Math.min(255, r + 60)}, ${Math.min(255, g + 60)}, ${Math.min(255, b + 60)})`;
        
        gradient = ctx.createLinearGradient(0, 0, width, 0);
        gradient.addColorStop(0, baseColor);
        gradient.addColorStop(1, lightColor);
        break;
        
      case 2: // Template Style - Clean neutral background for the recipe box overlay
        // Use a subtle neutral gradient that won't interfere with the recipe box
        gradient = ctx.createLinearGradient(0, 0, width, height);
        gradient.addColorStop(0, '#f8f9fa');  // Very light gray
        gradient.addColorStop(0.5, '#e9ecef'); // Light gray
        gradient.addColorStop(1, '#dee2e6');   // Slightly darker gray
        break;
        
      default:
        // Fallback to solid color
        gradient = '#f0f0f0';
    }

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
  }

  /**
   * Add decorative elements to Canvas
   */
  addCanvasDecorations(ctx, width, height, variation, dominantColor = { r: 255, g: 120, b: 0 }) {
    console.log(`🎨 addCanvasDecorations called with variation: ${variation}`);
    
    ctx.strokeStyle = '#ffffff';
    ctx.globalAlpha = 0.8;

    // Creative recipe box variations with color matching
    switch (variation) {
      case 1:
        // Style 1: Simple dashed lines top and bottom
        ctx.setLineDash([25, 10]);
        ctx.lineWidth = 8;
        ctx.beginPath();
        ctx.moveTo(0, 15);
        ctx.lineTo(width, 15);
        ctx.moveTo(0, height - 15);
        ctx.lineTo(width, height - 15);
        ctx.stroke();
        break;
      case 2:
        // Style 2: Geometric Border Design (inspired by HEALTHY HUMMINGBIRD CAKE BOWL)
        this.createGeometricBorderStyle(ctx, width, height, dominantColor);
        break;
      case 3:
        // Style 3: Modern Badge Style (inspired by EASY PEPPER JELLY)
        this.createModernBadgeStyle(ctx, width, height, dominantColor);
        break;
      case 4:
        // Style 4: Clean Ribbon Style (inspired by EASY BANANA COBBLER)
        this.createCleanRibbonStyle(ctx, width, height, dominantColor);
        break;
      case 5:
        // Style 5: Decorative Frame Style 
        this.createDecorativeFrameStyle(ctx, width, height, dominantColor);
        break;
      case 6:
        // Style 6: Elegant Overlay Style
        this.createElegantOverlayStyle(ctx, width, height, dominantColor);
        break;
      case 7:
        // Style 7: Decorative Border Pattern (Like Reference Image)
        this.createDecorativeBorderStyle(ctx, width, height, dominantColor);
        break;
      case 8:
        // Style 8: Electric Lightning Strike
        this.createLightningStrikeStyle(ctx, width, height, dominantColor);
        break;
      case 9:
        // Style 9: Crystal Gem Faceted
        this.createCrystalGemStyle(ctx, width, height, dominantColor);
        break;
      case 10:
        // Style 10: Sakura Cherry Blossom
        this.createSakuraBlossomStyle(ctx, width, height, dominantColor);
        break;
      case 11:
        // Style 11: Spicy Fire Flames
        this.createSpicyFlamesStyle(ctx, width, height, dominantColor);
        break;
      case 12:
        // Style 12: Ocean Wave Splash
        this.createOceanWaveStyle(ctx, width, height, dominantColor);
        break;
      case 13:
        // Style 13: Fresh Garden Leaves
        this.createGardenLeavesStyle(ctx, width, height, dominantColor);
        break;
      case 14:
        // Style 14: Rustic Wood Grain
        this.createRusticWoodGrainStyle(ctx, width, height, dominantColor);
        break;
      case 15:
        // Style 15: Vintage Recipe Card
        this.createVintageRecipeCardStyle(ctx, width, height, dominantColor);
        break;
      case 16:
        // Style 16: Modern Minimalist Chef
        this.createModernMinimalistStyle(ctx, width, height, dominantColor);
        break;
      case 17:
        // Style 17: Tropical Fruit Paradise
        this.createTropicalFruitStyle(ctx, width, height, dominantColor);
        break;
      case 18:
        // Style 18: Cozy Kitchen Warmth
        this.createCozyKitchenStyle(ctx, width, height, dominantColor);
        break;
      case 19:
        // Style 19: Italian Pasta Swirls
        this.createItalianPastaStyle(ctx, width, height, dominantColor);
        break;
      case 20:
        // Style 20: Bakery Flour Dust
        this.createBakeryFlourStyle(ctx, width, height, dominantColor);
        break;
      case 21:
        // Style 21: Fresh Herb Garden
        this.createFreshHerbStyle(ctx, width, height, dominantColor);
        break;
      case 22:
        // Style 22: Grill Master BBQ
        this.createGrillMasterStyle(ctx, width, height, dominantColor);
        break;
      case 23:
        // Style 23: Modern Magazine
        this.createModernMagazineStyle(ctx, width, height, dominantColor);
        break;
      case 24:
        // Style 24: Handwritten Charm
        this.createHandwrittenCharmStyle(ctx, width, height, dominantColor);
        break;
      case 25:
        // Style 25: Bold Minimalist
        this.createBoldMinimalistStyle(ctx, width, height, dominantColor);
        break;
      case 26:
        // Style 26: Alternating Dots (Style 2 Variation)
        this.createVintageLabelStyle(ctx, width, height, dominantColor);
        break;
      case 27:
        // Style 27: Dash & Dot Combo (Style 2 Variation)
        this.createNeonPopStyle(ctx, width, height, dominantColor);
        break;
      case 28:
        // Style 28: Triple Dot Rows (Style 2 Variation)
        this.createRusticFarmhouseStyle(ctx, width, height, dominantColor);
        break;
      case 29:
        // Style 29: Circle Outline Dots (Style 2 Variation)
        this.createDigitalGlassStyle(ctx, width, height, dominantColor);
        break;
      case 30:
        // Style 30: Star Dot Pattern (Style 2 Variation)
        this.createWatercolorArtistStyle(ctx, width, height, dominantColor);
        break;
    }

    ctx.globalAlpha = 1;
    ctx.setLineDash([]);
  }

  /**
   * Style 2: Geometric Border Design (inspired by HEALTHY HUMMINGBIRD CAKE BOWL)
   */
  createGeometricBorderStyle(ctx, width, height, dominantColor) {
    const { r, g, b } = dominantColor;
    
    // Full-width colored background
    const boxWidth = width;
    const boxHeight = 200;
    const boxX = 0;
    const boxY = (height - boxHeight) / 2;
    
    // Enhanced dominant color
    const baseColor = `rgb(${Math.min(255, r + 20)}, ${Math.min(255, g + 20)}, ${Math.min(255, b + 20)})`;
    
    // Draw main background
    ctx.fillStyle = baseColor;
    ctx.fillRect(boxX, boxY, boxWidth, boxHeight);
    
    // Draw geometric border pattern (dots/circles like reference)
    ctx.fillStyle = '#000000';
    const dotSize = 8;
    const spacing = 20;
    
    // Top border dots
    for (let x = spacing; x < width - spacing; x += spacing) {
      ctx.beginPath();
      ctx.arc(x, boxY + 15, dotSize / 2, 0, 2 * Math.PI);
      ctx.fill();
    }
    
    // Bottom border dots
    for (let x = spacing; x < width - spacing; x += spacing) {
      ctx.beginPath();
      ctx.arc(x, boxY + boxHeight - 15, dotSize / 2, 0, 2 * Math.PI);
      ctx.fill();
    }
    
    // Create corner label (like "HEALTHY")
    const labelWidth = 100;
    const labelHeight = 25;
    const labelX = 20;
    const labelY = boxY - 10;
    
    // Label background
    ctx.fillStyle = '#F4D03F'; // Golden yellow
    ctx.fillRect(labelX, labelY, labelWidth, labelHeight);
    
    // Label text
    ctx.fillStyle = '#000000';
    ctx.font = 'bold 12px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('QUICK', labelX + labelWidth/2, labelY + labelHeight/2);
    
    // Store area for text positioning
    ctx.recipeBoxArea = {
      x: boxX, y: boxY, width: boxWidth, height: boxHeight,
      badgeY: labelY, badgeHeight: labelHeight
    };
  }

  /**
   * Style 3: Modern Badge Style (inspired by EASY PEPPER JELLY)
   */
  createModernBadgeStyle(ctx, width, height, dominantColor) {
    const { r, g, b } = dominantColor;
    
    // Full-width colored background
    const boxWidth = width;
    const boxHeight = 180;
    const boxX = 0;
    const boxY = (height - boxHeight) / 2;
    
    // Rich dominant color
    const baseColor = `rgb(${r}, ${g}, ${b})`;
    
    // Draw main background
    ctx.fillStyle = baseColor;
    ctx.fillRect(boxX, boxY, boxWidth, boxHeight);
    
    // Create prominent corner badge (like "EASY")
    const badgeWidth = 80;
    const badgeHeight = 30;
    const badgeX = 15;
    const badgeY = boxY + 15;
    
    // Badge background (complementary color)
    const badgeColor = r > 128 ? '#2C3E50' : '#F39C12'; // Dark or orange based on base color
    ctx.fillStyle = badgeColor;
    ctx.fillRect(badgeX, badgeY, badgeWidth, badgeHeight);
    
    // Badge text
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 14px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('EINFACH', badgeX + badgeWidth/2, badgeY + badgeHeight/2);
    
    // Add subtle border accents
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.lineWidth = 2;
    ctx.strokeRect(boxX + 5, boxY + 5, boxWidth - 10, boxHeight - 10);
    
    // Store area for text positioning
    ctx.recipeBoxArea = {
      x: boxX, y: boxY, width: boxWidth, height: boxHeight,
      badgeY: badgeY, badgeHeight: badgeHeight
    };
  }

  /**
   * Style 4: Clean Ribbon Style (inspired by EASY BANANA COBBLER)
   */
  createCleanRibbonStyle(ctx, width, height, dominantColor) {
    const { r, g, b } = dominantColor;
    
    // Full-width colored background
    const boxWidth = width;
    const boxHeight = 160;
    const boxX = 0;
    const boxY = (height - boxHeight) / 2;
    
    // Enhanced dominant color
    const baseColor = `rgb(${Math.min(255, r + 30)}, ${Math.min(255, g + 30)}, ${Math.min(255, b + 30)})`;
    
    // Draw main background
    ctx.fillStyle = baseColor;
    ctx.fillRect(boxX, boxY, boxWidth, boxHeight);
    
    // Add top and bottom accent strips
    const stripHeight = 8;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.fillRect(boxX, boxY, boxWidth, stripHeight);
    ctx.fillRect(boxX, boxY + boxHeight - stripHeight, boxWidth, stripHeight);
    
    // Add darker accent strips
    ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
    ctx.fillRect(boxX, boxY + stripHeight, boxWidth, 3);
    ctx.fillRect(boxX, boxY + boxHeight - stripHeight - 3, boxWidth, 3);
    
    // Simple, clean design - no badge needed
    ctx.recipeBoxArea = {
      x: boxX, y: boxY, width: boxWidth, height: boxHeight,
      badgeY: boxY + 20, badgeHeight: 0
    };
  }

  /**
   * Style 5: Decorative Frame Style
   */
  createDecorativeFrameStyle(ctx, width, height, dominantColor) {
    const { r, g, b } = dominantColor;
    
    // Full-width colored background
    const boxWidth = width;
    const boxHeight = 190;
    const boxX = 0;
    const boxY = (height - boxHeight) / 2;
    
    // Rich dominant color gradient
    const gradient = ctx.createLinearGradient(boxX, boxY, boxX, boxY + boxHeight);
    gradient.addColorStop(0, `rgb(${Math.min(255, r + 40)}, ${Math.min(255, g + 40)}, ${Math.min(255, b + 40)})`);
    gradient.addColorStop(1, `rgb(${r}, ${g}, ${b})`);
    
    // Draw main background
    ctx.fillStyle = gradient;
    ctx.fillRect(boxX, boxY, boxWidth, boxHeight);
    
    // Add decorative corner elements
    const cornerSize = 25;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    
    // Top-left corner
    ctx.beginPath();
    ctx.moveTo(boxX, boxY);
    ctx.lineTo(boxX + cornerSize, boxY);
    ctx.lineTo(boxX, boxY + cornerSize);
    ctx.fill();
    
    // Top-right corner
    ctx.beginPath();
    ctx.moveTo(boxX + boxWidth, boxY);
    ctx.lineTo(boxX + boxWidth - cornerSize, boxY);
    ctx.lineTo(boxX + boxWidth, boxY + cornerSize);
    ctx.fill();
    
    // Add center decorative badge
    const badgeWidth = 110;
    const badgeHeight = 35;
    const badgeX = (boxWidth - badgeWidth) / 2;
    const badgeY = boxY + 20;
    
    // Badge with contrasting color
    ctx.fillStyle = r > 100 ? '#FFFFFF' : '#2C3E50';
    ctx.fillRect(badgeX, badgeY, badgeWidth, badgeHeight);
    
    // Badge border
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.lineWidth = 2;
    ctx.strokeRect(badgeX, badgeY, badgeWidth, badgeHeight);
    
    // Badge text
    ctx.fillStyle = r > 100 ? '#2C3E50' : '#FFFFFF';
    ctx.font = 'bold 13px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('KÖSTLICH', badgeX + badgeWidth/2, badgeY + badgeHeight/2);
    
    ctx.recipeBoxArea = {
      x: boxX, y: boxY, width: boxWidth, height: boxHeight,
      badgeY: badgeY, badgeHeight: badgeHeight
    };
  }

  /**
   * Style 6: Elegant Overlay Style
   */
  createElegantOverlayStyle(ctx, width, height, dominantColor) {
    const { r, g, b } = dominantColor;
    
    // Full-width colored background
    const boxWidth = width;
    const boxHeight = 170;
    const boxX = 0;
    const boxY = (height - boxHeight) / 2;
    
    // Sophisticated color treatment
    const baseColor = `rgb(${r}, ${g}, ${b})`;
    const overlayColor = `rgba(${Math.min(255, r + 50)}, ${Math.min(255, g + 50)}, ${Math.min(255, b + 50)}, 0.8)`;
    
    // Draw main background
    ctx.fillStyle = baseColor;
    ctx.fillRect(boxX, boxY, boxWidth, boxHeight);
    
    // Add elegant overlay pattern
    ctx.fillStyle = overlayColor;
    ctx.fillRect(boxX, boxY, boxWidth, boxHeight);
    
    // Add sophisticated borders
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 3;
    ctx.strokeRect(boxX + 10, boxY + 10, boxWidth - 20, boxHeight - 20);
    
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.lineWidth = 1;
    ctx.strokeRect(boxX + 15, boxY + 15, boxWidth - 30, boxHeight - 30);
    
    // Elegant center badge
    const badgeWidth = 90;
    const badgeHeight = 28;
    const badgeX = (boxWidth - badgeWidth) / 2;
    const badgeY = boxY + 25;
    
    // Refined badge
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.fillRect(badgeX, badgeY, badgeWidth, badgeHeight);
    
    ctx.fillStyle = '#2C3E50';
    ctx.font = 'bold 12px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('AMAZING', badgeX + badgeWidth/2, badgeY + badgeHeight/2);
    
    ctx.recipeBoxArea = {
      x: boxX, y: boxY, width: boxWidth, height: boxHeight,
      badgeY: badgeY, badgeHeight: badgeHeight
    };
  }



  /**
   * Style 7: Decorative Border Pattern (Like Reference Image)  
   */
  createDecorativeBorderStyle(ctx, width, height, dominantColor) {
    const { r, g, b } = dominantColor;
    const boxWidth = width;
    const boxHeight = 185;
    const boxX = 0;
    const boxY = (height - boxHeight) / 2;
    
    // Modern gradient background
    const gradient = ctx.createLinearGradient(0, boxY, 0, boxY + boxHeight);
    gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.95)`);
    gradient.addColorStop(0.5, `rgb(${Math.min(255, r + 30)}, ${Math.min(255, g + 30)}, ${Math.min(255, b + 30)})`);
    gradient.addColorStop(1, `rgba(${Math.max(0, r - 20)}, ${Math.max(0, g - 20)}, ${Math.max(0, b - 20)}, 0.95)`);
    ctx.fillStyle = gradient;
    ctx.fillRect(boxX, boxY, boxWidth, boxHeight);
    
    // Create modern geometric frame with chevron patterns
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.lineWidth = 6;
    
    // Top chevron pattern border
    ctx.beginPath();
    const chevronSize = 25;
    const chevronCount = Math.floor(width / chevronSize);
    
    for (let i = 0; i < chevronCount; i++) {
      const x = i * chevronSize;
      const centerX = x + chevronSize / 2;
      
      // Draw chevron pointing down
      ctx.moveTo(x + 5, boxY + 8);
      ctx.lineTo(centerX, boxY + 18);
      ctx.lineTo(x + chevronSize - 5, boxY + 8);
    }
    ctx.stroke();
    
    // Bottom chevron pattern border (pointing up)
    ctx.beginPath();
    for (let i = 0; i < chevronCount; i++) {
      const x = i * chevronSize;
      const centerX = x + chevronSize / 2;
      
      // Draw chevron pointing up
      ctx.moveTo(x + 5, boxY + boxHeight - 8);
      ctx.lineTo(centerX, boxY + boxHeight - 18);
      ctx.lineTo(x + chevronSize - 5, boxY + boxHeight - 8);
    }
    ctx.stroke();
    
    // Side geometric patterns
    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    
    // Left side diamond pattern
    for (let i = 0; i < 6; i++) {
      const y = boxY + 35 + (i * 25);
      const size = 8;
      
      ctx.beginPath();
      ctx.moveTo(15, y);
      ctx.lineTo(15 + size, y - size);
      ctx.lineTo(15 + size * 2, y);
      ctx.lineTo(15 + size, y + size);
      ctx.fill();
    }
    
    // Right side diamond pattern
    for (let i = 0; i < 6; i++) {
      const y = boxY + 35 + (i * 25);
      const size = 8;
      
      ctx.beginPath();
      ctx.moveTo(width - 15, y);
      ctx.lineTo(width - 15 - size, y - size);
      ctx.lineTo(width - 15 - size * 2, y);
      ctx.lineTo(width - 15 - size, y + size);
      ctx.fill();
    }
    
    // Modern banner-style badge with top margin
    const badgeWidth = 140;
    const badgeHeight = 40;
    const badgeX = (width - badgeWidth) / 2; // Center horizontally
    const badgeY = boxY + 12; // Added top margin
    
    // Badge with modern angled design
    ctx.fillStyle = '#E74C3C'; // Modern red color
    ctx.beginPath();
    
    // Create angled badge shape
    ctx.moveTo(badgeX + 15, badgeY);
    ctx.lineTo(badgeX + badgeWidth - 15, badgeY);
    ctx.lineTo(badgeX + badgeWidth, badgeY + badgeHeight / 2);
    ctx.lineTo(badgeX + badgeWidth - 15, badgeY + badgeHeight);
    ctx.lineTo(badgeX + 15, badgeY + badgeHeight);
    ctx.lineTo(badgeX, badgeY + badgeHeight / 2);
    ctx.closePath();
    ctx.fill();
    
    // Badge shadow for depth
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.beginPath();
    ctx.moveTo(badgeX + 18, badgeY + 3);
    ctx.lineTo(badgeX + badgeWidth - 12, badgeY + 3);
    ctx.lineTo(badgeX + badgeWidth + 3, badgeY + badgeHeight / 2 + 3);
    ctx.lineTo(badgeX + badgeWidth - 12, badgeY + badgeHeight + 3);
    ctx.lineTo(badgeX + 18, badgeY + badgeHeight + 3);
    ctx.lineTo(badgeX + 3, badgeY + badgeHeight / 2 + 3);
    ctx.closePath();
    ctx.fill();
    
    // Badge highlight
    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.beginPath();
    ctx.moveTo(badgeX + 15, badgeY);
    ctx.lineTo(badgeX + badgeWidth - 15, badgeY);
    ctx.lineTo(badgeX + badgeWidth - 20, badgeY + 8);
    ctx.lineTo(badgeX + 20, badgeY + 8);
    ctx.closePath();
    ctx.fill();
    
    // Badge text
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 16px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('FRESH', badgeX + badgeWidth/2, badgeY + badgeHeight/2);
    
    // Corner accent triangles
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    const triangleSize = 20;
    
    // Top corners
    ctx.beginPath();
    ctx.moveTo(boxX + 25, boxY + 25);
    ctx.lineTo(boxX + 25 + triangleSize, boxY + 25);
    ctx.lineTo(boxX + 25, boxY + 25 + triangleSize);
    ctx.fill();
    
    ctx.beginPath();
    ctx.moveTo(boxX + boxWidth - 25, boxY + 25);
    ctx.lineTo(boxX + boxWidth - 25 - triangleSize, boxY + 25);
    ctx.lineTo(boxX + boxWidth - 25, boxY + 25 + triangleSize);
    ctx.fill();
    
    // Bottom corners
    ctx.beginPath();
    ctx.moveTo(boxX + 25, boxY + boxHeight - 25);
    ctx.lineTo(boxX + 25 + triangleSize, boxY + boxHeight - 25);
    ctx.lineTo(boxX + 25, boxY + boxHeight - 25 - triangleSize);
    ctx.fill();
    
    ctx.beginPath();
    ctx.moveTo(boxX + boxWidth - 25, boxY + boxHeight - 25);
    ctx.lineTo(boxX + boxWidth - 25 - triangleSize, boxY + boxHeight - 25);
    ctx.lineTo(boxX + boxWidth - 25, boxY + boxHeight - 25 - triangleSize);
    ctx.fill();
    
    ctx.recipeBoxArea = { x: boxX, y: boxY, width: boxWidth, height: boxHeight, badgeY: badgeY, badgeHeight: badgeHeight };
  }

  /**
   * Style 8: Electric Lightning Strike
   */
  createLightningStrikeStyle(ctx, width, height, dominantColor) {
    const { r, g, b } = dominantColor;
    const boxWidth = width; // Full width, no whitespace
    const boxHeight = 190;
    const boxX = 0;
    const boxY = (height - boxHeight) / 2;
    
    // Dark electric background gradient
    const bgGradient = ctx.createRadialGradient(width/2, boxY + boxHeight/2, 0, width/2, boxY + boxHeight/2, width/2);
    bgGradient.addColorStop(0, `rgb(${Math.min(255, r + 40)}, ${Math.min(255, g + 40)}, ${Math.min(255, b + 60)})`);
    bgGradient.addColorStop(0.6, `rgb(${r}, ${g}, ${b})`);
    bgGradient.addColorStop(1, `rgb(${Math.max(0, r - 60)}, ${Math.max(0, g - 60)}, ${Math.max(0, b - 40)})`);
    ctx.fillStyle = bgGradient;
    ctx.fillRect(boxX, boxY, boxWidth, boxHeight);
    
    // Lightning bolt patterns at top
    ctx.strokeStyle = 'rgba(255, 255, 100, 0.9)';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    const boltCount = 8;
    for (let i = 0; i < boltCount; i++) {
      const startX = (i * width / boltCount) + Math.random() * 20;
      const endX = startX + Math.random() * 60 - 30;
      
      ctx.beginPath();
      ctx.moveTo(startX, boxY + 5);
      ctx.lineTo(startX + 15, boxY + 12);
      ctx.lineTo(startX - 8, boxY + 20);
      ctx.lineTo(endX, boxY + 25);
      ctx.stroke();
    }
    
    // Lightning bolts at bottom
    for (let i = 0; i < boltCount; i++) {
      const startX = (i * width / boltCount) + Math.random() * 20;
      const endX = startX + Math.random() * 60 - 30;
      
      ctx.beginPath();
      ctx.moveTo(startX, boxY + boxHeight - 5);
      ctx.lineTo(startX + 15, boxY + boxHeight - 12);
      ctx.lineTo(startX - 8, boxY + boxHeight - 20);
      ctx.lineTo(endX, boxY + boxHeight - 25);
      ctx.stroke();
    }
    
    // Electric glow effects
    ctx.fillStyle = 'rgba(255, 255, 150, 0.2)';
    for (let i = 0; i < 15; i++) {
      const x = Math.random() * width;
      const y = boxY + Math.random() * boxHeight;
      const size = Math.random() * 8 + 3;
      
      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.fill();
    }
    
    // Thunder cloud badge with proper top margin
    const badgeWidth = 130;
    const badgeHeight = 42;
    const badgeX = (width - badgeWidth) / 2;
    const badgeY = boxY + 12; // Top margin
    
    // Cloud shape badge
    ctx.fillStyle = '#4A4A4A';
    ctx.beginPath();
    ctx.arc(badgeX + 25, badgeY + 15, 15, 0, Math.PI * 2);
    ctx.arc(badgeX + 45, badgeY + 10, 20, 0, Math.PI * 2);
    ctx.arc(badgeX + 70, badgeY + 12, 18, 0, Math.PI * 2);
    ctx.arc(badgeX + 90, badgeY + 18, 16, 0, Math.PI * 2);
    ctx.arc(badgeX + 105, badgeY + 15, 15, 0, Math.PI * 2);
    ctx.fill();
    
    // Lightning on cloud
    ctx.strokeStyle = '#FFD700';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(badgeX + 65, badgeY + 25);
    ctx.lineTo(badgeX + 75, badgeY + 32);
    ctx.lineTo(badgeX + 65, badgeY + 38);
    ctx.lineTo(badgeX + 80, badgeY + 45);
    ctx.stroke();
    
    // Badge text
    ctx.fillStyle = '#FFD700';
    ctx.font = 'bold 14px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('SIZZLING', badgeX + badgeWidth/2, badgeY + badgeHeight - 8);
    
    ctx.recipeBoxArea = { x: boxX, y: boxY, width: boxWidth, height: boxHeight, badgeY: badgeY, badgeHeight: badgeHeight };
  }

  /**
   * Style 9: Crystal Gem Faceted
   */
  createCrystalGemStyle(ctx, width, height, dominantColor) {
    const { r, g, b } = dominantColor;
    const boxWidth = width; // Full width, no whitespace
    const boxHeight = 185;
    const boxX = 0;
    const boxY = (height - boxHeight) / 2;
    
    // Metallic gradient background
    const bgGradient = ctx.createLinearGradient(0, boxY, width, boxY + boxHeight);
    bgGradient.addColorStop(0, `rgb(${Math.min(255, r + 50)}, ${Math.min(255, g + 50)}, ${Math.min(255, b + 50)})`);
    bgGradient.addColorStop(0.3, `rgb(${r + 20}, ${g + 20}, ${b + 20})`);
    bgGradient.addColorStop(0.7, `rgb(${r}, ${g}, ${b})`);
    bgGradient.addColorStop(1, `rgb(${Math.max(0, r - 30)}, ${Math.max(0, g - 30)}, ${Math.max(0, b - 30)})`);
    ctx.fillStyle = bgGradient;
    ctx.fillRect(boxX, boxY, boxWidth, boxHeight);
    
    // Crystal facet patterns
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.lineWidth = 2;
    
    // Top crystal facets
    const facetCount = 12;
    for (let i = 0; i < facetCount; i++) {
      const x = (i * width / facetCount);
      const facetWidth = width / facetCount;
      
      ctx.beginPath();
      ctx.moveTo(x, boxY);
      ctx.lineTo(x + facetWidth/2, boxY + 20);
      ctx.lineTo(x + facetWidth, boxY);
      ctx.stroke();
    }
    
    // Bottom crystal facets
    for (let i = 0; i < facetCount; i++) {
      const x = (i * width / facetCount);
      const facetWidth = width / facetCount;
      
      ctx.beginPath();
      ctx.moveTo(x, boxY + boxHeight);
      ctx.lineTo(x + facetWidth/2, boxY + boxHeight - 20);
      ctx.lineTo(x + facetWidth, boxY + boxHeight);
      ctx.stroke();
    }
    
    // Side crystal patterns
    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
    for (let i = 0; i < 6; i++) {
      const y = boxY + 35 + (i * 22);
      
      // Left diamonds
      ctx.beginPath();
      ctx.moveTo(12, y);
      ctx.lineTo(22, y - 8);
      ctx.lineTo(32, y);
      ctx.lineTo(22, y + 8);
      ctx.fill();
      
      // Right diamonds
      ctx.beginPath();
      ctx.moveTo(width - 12, y);
      ctx.lineTo(width - 22, y - 8);
      ctx.lineTo(width - 32, y);
      ctx.lineTo(width - 22, y + 8);
      ctx.fill();
    }
    
    // Sparkle effects
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    for (let i = 0; i < 20; i++) {
      const x = Math.random() * width;
      const y = boxY + Math.random() * boxHeight;
      const size = Math.random() * 4 + 2;
      
      // Star sparkles
      ctx.beginPath();
      ctx.moveTo(x, y - size);
      ctx.lineTo(x + size/2, y - size/2);
      ctx.lineTo(x + size, y);
      ctx.lineTo(x + size/2, y + size/2);
      ctx.lineTo(x, y + size);
      ctx.lineTo(x - size/2, y + size/2);
      ctx.lineTo(x - size, y);
      ctx.lineTo(x - size/2, y - size/2);
      ctx.fill();
    }
    
    // Gem-cut badge with proper top margin
    const badgeWidth = 140;
    const badgeHeight = 40;
    const badgeX = (width - badgeWidth) / 2;
    const badgeY = boxY + 12; // Top margin
    
    // Diamond-shaped badge
    ctx.fillStyle = '#9B59B6';
    ctx.beginPath();
    ctx.moveTo(badgeX + badgeWidth/2, badgeY);
    ctx.lineTo(badgeX + badgeWidth - 15, badgeY + badgeHeight/2);
    ctx.lineTo(badgeX + badgeWidth/2, badgeY + badgeHeight);
    ctx.lineTo(badgeX + 15, badgeY + badgeHeight/2);
    ctx.closePath();
    ctx.fill();
    
    // Gem facet lines on badge
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(badgeX + badgeWidth/2, badgeY);
    ctx.lineTo(badgeX + badgeWidth/2, badgeY + badgeHeight);
    ctx.moveTo(badgeX + 15, badgeY + badgeHeight/2);
    ctx.lineTo(badgeX + badgeWidth - 15, badgeY + badgeHeight/2);
    ctx.stroke();
    
    // Badge text
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 15px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('GOURMET', badgeX + badgeWidth/2, badgeY + badgeHeight/2);
    
    ctx.recipeBoxArea = { x: boxX, y: boxY, width: boxWidth, height: boxHeight, badgeY: badgeY, badgeHeight: badgeHeight };
  }

  /**
   * Style 10: Sakura Cherry Blossom
   */
  createSakuraBlossomStyle(ctx, width, height, dominantColor) {
    const { r, g, b } = dominantColor;
    const boxWidth = width; // Full width, no whitespace
    const boxHeight = 180;
    const boxX = 0;
    const boxY = (height - boxHeight) / 2;
    
    // Soft pink gradient background
    const bgGradient = ctx.createRadialGradient(width/2, boxY + boxHeight/2, 0, width/2, boxY + boxHeight/2, width);
    bgGradient.addColorStop(0, `rgba(${Math.min(255, r + 60)}, ${Math.min(255, g + 40)}, ${Math.min(255, b + 80)}, 0.9)`);
    bgGradient.addColorStop(0.7, `rgb(${r + 20}, ${g + 10}, ${b + 30})`);
    bgGradient.addColorStop(1, `rgb(${r}, ${g}, ${b})`);
    ctx.fillStyle = bgGradient;
    ctx.fillRect(boxX, boxY, boxWidth, boxHeight);
    
    // Cherry blossom petals as border decoration
    ctx.fillStyle = 'rgba(255, 192, 203, 0.7)';
    
    // Top flowing petals
    for (let i = 0; i < 15; i++) {
      const x = (i * width / 15) + Math.random() * 20;
      const y = boxY + Math.random() * 25 + 5;
      this.drawSakuraPetal(ctx, x, y, 8);
    }
    
    // Bottom flowing petals
    for (let i = 0; i < 15; i++) {
      const x = (i * width / 15) + Math.random() * 20;
      const y = boxY + boxHeight - Math.random() * 25 - 5;
      this.drawSakuraPetal(ctx, x, y, 8);
    }
    
    // Floating petals throughout
    ctx.fillStyle = 'rgba(255, 182, 193, 0.5)';
    for (let i = 0; i < 25; i++) {
      const x = Math.random() * width;
      const y = boxY + Math.random() * boxHeight;
      const size = Math.random() * 6 + 4;
      this.drawSakuraPetal(ctx, x, y, size);
    }
    
    // Branch silhouettes on sides
    ctx.strokeStyle = 'rgba(101, 67, 33, 0.6)';
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    
    // Left branch
    ctx.beginPath();
    ctx.moveTo(15, boxY + 40);
    ctx.quadraticCurveTo(35, boxY + 60, 25, boxY + 90);
    ctx.quadraticCurveTo(45, boxY + 110, 35, boxY + 140);
    ctx.stroke();
    
    // Right branch
    ctx.beginPath();
    ctx.moveTo(width - 15, boxY + 40);
    ctx.quadraticCurveTo(width - 35, boxY + 60, width - 25, boxY + 90);
    ctx.quadraticCurveTo(width - 45, boxY + 110, width - 35, boxY + 140);
    ctx.stroke();
    
    // Flower-shaped badge with proper top margin
    const badgeWidth = 120;
    const badgeHeight = 38;
    const badgeX = (width - badgeWidth) / 2;
    const badgeY = boxY + 12; // Top margin
    
    // Flower petals badge background
    ctx.fillStyle = '#FF69B4';
    for (let i = 0; i < 5; i++) {
      const angle = (i * Math.PI * 2 / 5) - Math.PI / 2;
      const petalX = badgeX + badgeWidth/2 + Math.cos(angle) * 15;
      const petalY = badgeY + badgeHeight/2 + Math.sin(angle) * 15;
      
      ctx.beginPath();
      ctx.arc(petalX, petalY, 18, 0, Math.PI * 2);
      ctx.fill();
    }
    
    // Center circle
    ctx.fillStyle = '#FFD700';
    ctx.beginPath();
    ctx.arc(badgeX + badgeWidth/2, badgeY + badgeHeight/2, 20, 0, Math.PI * 2);
    ctx.fill();
    
    // Badge text
    ctx.fillStyle = '#8B4513';
    ctx.font = 'bold 14px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('BLOOM', badgeX + badgeWidth/2, badgeY + badgeHeight/2);
    
    ctx.recipeBoxArea = { x: boxX, y: boxY, width: boxWidth, height: boxHeight, badgeY: badgeY, badgeHeight: badgeHeight };
  }

  // Helper method for drawing sakura petals
  drawSakuraPetal(ctx, x, y, size) {
    ctx.beginPath();
    ctx.arc(x, y - size/2, size/2, 0, Math.PI * 2);
    ctx.arc(x - size/3, y + size/4, size/3, 0, Math.PI * 2);
    ctx.arc(x + size/3, y + size/4, size/3, 0, Math.PI * 2);
    ctx.fill();
  }

  /**
   * Style 11: Spicy Fire Flames
   */
  createSpicyFlamesStyle(ctx, width, height, dominantColor) {
    const { r, g, b } = dominantColor;
    const boxWidth = width;
    const boxHeight = 185;
    const boxX = 0;
    const boxY = (height - boxHeight) / 2;
    
    // Fiery gradient background
    const bgGradient = ctx.createRadialGradient(width/2, boxY + boxHeight, 0, width/2, boxY + boxHeight, boxHeight);
    bgGradient.addColorStop(0, `rgb(255, 100, 0)`);
    bgGradient.addColorStop(0.3, `rgb(${Math.min(255, r + 80)}, ${Math.max(0, g - 20)}, 0)`);
    bgGradient.addColorStop(0.7, `rgb(${r}, ${g}, ${b})`);
    bgGradient.addColorStop(1, `rgb(${Math.max(0, r - 40)}, ${Math.max(0, g - 40)}, ${Math.max(0, b - 20)})`);
    ctx.fillStyle = bgGradient;
    ctx.fillRect(boxX, boxY, boxWidth, boxHeight);
    
    // Flame patterns at top
    ctx.fillStyle = 'rgba(255, 69, 0, 0.7)';
    for (let i = 0; i < 20; i++) {
      const x = (i * width / 20) + Math.random() * 15;
      const flameHeight = Math.random() * 25 + 15;
      
      ctx.beginPath();
      ctx.moveTo(x, boxY + flameHeight);
      ctx.quadraticCurveTo(x + 8, boxY, x + 16, boxY + flameHeight);
      ctx.quadraticCurveTo(x + 8, boxY + flameHeight - 8, x, boxY + flameHeight);
      ctx.fill();
    }
    
    // Flame patterns at bottom
    for (let i = 0; i < 20; i++) {
      const x = (i * width / 20) + Math.random() * 15;
      const flameHeight = Math.random() * 25 + 15;
      
      ctx.beginPath();
      ctx.moveTo(x, boxY + boxHeight - flameHeight);
      ctx.quadraticCurveTo(x + 8, boxY + boxHeight, x + 16, boxY + boxHeight - flameHeight);
      ctx.quadraticCurveTo(x + 8, boxY + boxHeight - flameHeight + 8, x, boxY + boxHeight - flameHeight);
      ctx.fill();
    }
    
    // Chili pepper badge
    const badgeWidth = 130;
    const badgeHeight = 40;
    const badgeX = (width - badgeWidth) / 2;
    const badgeY = boxY + 12;
    
    // Chili shape
    ctx.fillStyle = '#DC143C';
    ctx.beginPath();
    ctx.ellipse(badgeX + 30, badgeY + badgeHeight/2, 25, 15, 0, 0, Math.PI * 2);
    ctx.ellipse(badgeX + 70, badgeY + badgeHeight/2, 30, 12, 0, 0, Math.PI * 2);
    ctx.ellipse(badgeX + 100, badgeY + badgeHeight/2, 20, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    
    // Chili stem
    ctx.fillStyle = '#228B22';
    ctx.fillRect(badgeX + 15, badgeY + badgeHeight/2 - 3, 12, 6);
    
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 14px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('SCHARF', badgeX + badgeWidth/2, badgeY + badgeHeight/2);
    
    ctx.recipeBoxArea = { x: boxX, y: boxY, width: boxWidth, height: boxHeight, badgeY: badgeY, badgeHeight: badgeHeight };
  }

  /**
   * Style 12: Ocean Wave Splash
   */
  createOceanWaveStyle(ctx, width, height, dominantColor) {
    const { r, g, b } = dominantColor;
    const boxWidth = width;
    const boxHeight = 180;
    const boxX = 0;
    const boxY = (height - boxHeight) / 2;
    
    // Ocean gradient background
    const bgGradient = ctx.createLinearGradient(0, boxY, 0, boxY + boxHeight);
    bgGradient.addColorStop(0, `rgb(0, 191, 255)`);
    bgGradient.addColorStop(0.4, `rgb(${Math.max(0, r - 50)}, ${Math.min(255, g + 100)}, ${Math.min(255, b + 150)})`);
    bgGradient.addColorStop(1, `rgb(${r}, ${g}, ${b})`);
    ctx.fillStyle = bgGradient;
    ctx.fillRect(boxX, boxY, boxWidth, boxHeight);
    
    // Wave patterns
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    for (let wave = 0; wave < 3; wave++) {
      ctx.beginPath();
      ctx.moveTo(0, boxY + 20 + wave * 15);
      for (let x = 0; x <= width; x += 20) {
        const waveHeight = Math.sin((x / width) * Math.PI * 3 + wave) * 8;
        ctx.lineTo(x, boxY + 20 + wave * 15 + waveHeight);
      }
      ctx.lineTo(width, boxY + 35 + wave * 15);
      ctx.lineTo(0, boxY + 35 + wave * 15);
      ctx.fill();
    }
    
    // Bottom waves
    for (let wave = 0; wave < 3; wave++) {
      ctx.beginPath();
      ctx.moveTo(0, boxY + boxHeight - 20 - wave * 15);
      for (let x = 0; x <= width; x += 20) {
        const waveHeight = Math.sin((x / width) * Math.PI * 3 + wave + Math.PI) * 8;
        ctx.lineTo(x, boxY + boxHeight - 20 - wave * 15 + waveHeight);
      }
      ctx.lineTo(width, boxY + boxHeight - 35 - wave * 15);
      ctx.lineTo(0, boxY + boxHeight - 35 - wave * 15);
      ctx.fill();
    }
    
    // Seashell badge
    const badgeWidth = 120;
    const badgeHeight = 38;
    const badgeX = (width - badgeWidth) / 2;
    const badgeY = boxY + 12;
    
    // Shell shape
    ctx.fillStyle = '#F0E68C';
    ctx.beginPath();
    ctx.arc(badgeX + badgeWidth/2, badgeY + badgeHeight/2, badgeHeight/2, 0, Math.PI * 2);
    ctx.fill();
    
    // Shell ridges
    ctx.strokeStyle = '#DDD';
    ctx.lineWidth = 1;
    for (let i = 0; i < 5; i++) {
      const angle = (i * Math.PI * 2 / 5);
      ctx.beginPath();
      ctx.moveTo(badgeX + badgeWidth/2, badgeY + badgeHeight/2);
      ctx.lineTo(badgeX + badgeWidth/2 + Math.cos(angle) * 15, badgeY + badgeHeight/2 + Math.sin(angle) * 15);
      ctx.stroke();
    }
    
    ctx.fillStyle = '#4682B4';
    ctx.font = 'bold 13px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('FRESH CATCH', badgeX + badgeWidth/2, badgeY + badgeHeight/2);
    
    ctx.recipeBoxArea = { x: boxX, y: boxY, width: boxWidth, height: boxHeight, badgeY: badgeY, badgeHeight: badgeHeight };
  }

  /**
   * Style 13: Fresh Garden Leaves
   */
  createGardenLeavesStyle(ctx, width, height, dominantColor) {
    const { r, g, b } = dominantColor;
    const boxWidth = width;
    const boxHeight = 175;
    const boxX = 0;
    const boxY = (height - boxHeight) / 2;
    
    // Garden gradient background
    const bgGradient = ctx.createLinearGradient(0, boxY, 0, boxY + boxHeight);
    bgGradient.addColorStop(0, `rgb(144, 238, 144)`);
    bgGradient.addColorStop(0.5, `rgb(${Math.max(0, r - 30)}, ${Math.min(255, g + 50)}, ${Math.max(0, b - 30)})`);
    bgGradient.addColorStop(1, `rgb(${r}, ${g}, ${b})`);
    ctx.fillStyle = bgGradient;
    ctx.fillRect(boxX, boxY, boxWidth, boxHeight);
    
    // Leaf patterns
    ctx.fillStyle = 'rgba(34, 139, 34, 0.7)';
    for (let i = 0; i < 25; i++) {
      const leafX = (i * width / 25) + Math.random() * 20;
      const leafY = boxY + Math.random() * 30 + 5;
      this.drawLeaf(ctx, leafX, leafY, 12);
    }
    
    // Bottom leaves
    for (let i = 0; i < 25; i++) {
      const leafX = (i * width / 25) + Math.random() * 20;
      const leafY = boxY + boxHeight - Math.random() * 30 - 5;
      this.drawLeaf(ctx, leafX, leafY, 12);
    }
    
    // Vine borders
    ctx.strokeStyle = 'rgba(85, 107, 47, 0.8)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(0, boxY + 25);
    for (let x = 0; x <= width; x += 30) {
      const vineY = boxY + 25 + Math.sin(x / 50) * 10;
      ctx.lineTo(x, vineY);
    }
    ctx.stroke();
    
    // Bottom vine
    ctx.beginPath();
    ctx.moveTo(0, boxY + boxHeight - 25);
    for (let x = 0; x <= width; x += 30) {
      const vineY = boxY + boxHeight - 25 + Math.sin(x / 50 + Math.PI) * 10;
      ctx.lineTo(x, vineY);
    }
    ctx.stroke();
    
    // Garden basket badge
    const badgeWidth = 125;
    const badgeHeight = 35;
    const badgeX = (width - badgeWidth) / 2;
    const badgeY = boxY + 12;
    
    // Basket shape
    ctx.fillStyle = '#8B4513';
    ctx.fillRect(badgeX + 10, badgeY + 8, badgeWidth - 20, badgeHeight - 8);
    
    // Basket weave pattern
    ctx.strokeStyle = '#654321';
    ctx.lineWidth = 1;
    for (let i = 0; i < 8; i++) {
      ctx.beginPath();
      ctx.moveTo(badgeX + 15 + i * 12, badgeY + 8);
      ctx.lineTo(badgeX + 15 + i * 12, badgeY + badgeHeight);
      ctx.stroke();
    }
    
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 13px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('FARM FRESH', badgeX + badgeWidth/2, badgeY + badgeHeight/2);
    
    ctx.recipeBoxArea = { x: boxX, y: boxY, width: boxWidth, height: boxHeight, badgeY: badgeY, badgeHeight: badgeHeight };
  }

  // Helper method for drawing leaves
  drawLeaf(ctx, x, y, size) {
    ctx.beginPath();
    ctx.ellipse(x, y, size/2, size, Math.PI/4, 0, Math.PI * 2);
    ctx.fill();
    
    // Leaf vein
    ctx.strokeStyle = 'rgba(0, 100, 0, 0.8)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x - size/3, y - size/2);
    ctx.lineTo(x + size/3, y + size/2);
    ctx.stroke();
  }

  /**
   * Helper function to draw rounded rectangles
   */
  drawRoundedRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }

  /**
   * Create text overlay with variation support (5 different designs) - FALLBACK SVG VERSION
   */
  async createTextOverlay(text, width, height, dominantColor = { r: 255, g: 120, b: 0 }, variation = 1) {
    // Font size calculation - bigger and bolder like reference
    const textLength = text.length;
    let fontSize;
    const boxY = (height - boxHeight) / 2;
    
    // Background
    ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
    ctx.fillRect(boxX, boxY, boxWidth, boxHeight);
    
    // Create wavy top edge
    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.beginPath();
    ctx.moveTo(0, boxY);
    for (let x = 0; x <= width; x += 15) {
      const waveHeight = Math.sin((x / width) * Math.PI * 4) * 12;
      ctx.lineTo(x, boxY + 20 + waveHeight);
    }
    ctx.lineTo(width, boxY);
    ctx.closePath();
    ctx.fill();
    
    // Create wavy bottom edge
    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.beginPath();
    ctx.moveTo(0, boxY + boxHeight);
    for (let x = 0; x <= width; x += 15) {
      const waveHeight = Math.sin((x / width) * Math.PI * 4) * 12;
      ctx.lineTo(x, boxY + boxHeight - 20 - waveHeight);
    }
    ctx.lineTo(width, boxY + boxHeight);
    ctx.closePath();
    ctx.fill();
    
    // Wavy side accents
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    for (let y = boxY + 30; y <= boxY + boxHeight - 30; y += 10) {
      const waveLeft = Math.sin((y / boxHeight) * Math.PI * 3) * 8;
      const waveRight = Math.sin((y / boxHeight) * Math.PI * 3 + Math.PI) * 8;
      ctx.moveTo(15 + waveLeft, y);
      ctx.lineTo(25 + waveLeft, y);
      ctx.moveTo(width - 25 + waveRight, y);
      ctx.lineTo(width - 15 + waveRight, y);
    }
    ctx.stroke();
    
    // Wavy badge
    const badgeWidth = 130;
    const badgeHeight = 35;
    const badgeX = (width - badgeWidth) / 2;
    const badgeY = boxY + 35;
    
    // Create wavy badge shape
    ctx.fillStyle = '#1ABC9C';
    ctx.beginPath();
    ctx.moveTo(badgeX, badgeY + badgeHeight/2);
    for (let x = 0; x <= badgeWidth; x += 10) {
      const topWave = Math.sin((x / badgeWidth) * Math.PI * 2) * 5;
      const bottomWave = Math.sin((x / badgeWidth) * Math.PI * 2 + Math.PI) * 5;
      if (x === 0) {
        ctx.moveTo(badgeX + x, badgeY + 8 + topWave);
      } else {
        ctx.lineTo(badgeX + x, badgeY + 8 + topWave);
      }
    }
    for (let x = badgeWidth; x >= 0; x -= 10) {
      const bottomWave = Math.sin((x / badgeWidth) * Math.PI * 2 + Math.PI) * 5;
      ctx.lineTo(badgeX + x, badgeY + badgeHeight - 8 + bottomWave);
    }
    ctx.closePath();
    ctx.fill();
    
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 13px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('FLOWING', badgeX + badgeWidth/2, badgeY + badgeHeight/2);
    
    ctx.recipeBoxArea = { x: boxX, y: boxY, width: boxWidth, height: boxHeight, badgeY: badgeY, badgeHeight: badgeHeight };
  }

  /**
   * Style 12: Triple Line Header/Footer
   */
  createTripleLineStyle(ctx, width, height, dominantColor) {
    const { r, g, b } = dominantColor;
    const boxWidth = width;
    const boxHeight = 165;
    const boxX = 0;
    const boxY = (height - boxHeight) / 2;
    
    // Background with radial gradient
    const gradient = ctx.createRadialGradient(width/2, boxY + boxHeight/2, 0, width/2, boxY + boxHeight/2, width/2);
    gradient.addColorStop(0, `rgb(${Math.min(255, r + 50)}, ${Math.min(255, g + 50)}, ${Math.min(255, b + 50)})`);
    gradient.addColorStop(1, `rgb(${r}, ${g}, ${b})`);
    ctx.fillStyle = gradient;
    ctx.fillRect(boxX, boxY, boxWidth, boxHeight);
    
    // Triple lines at top
    const lineSpacing = 8;
    const lineThickness = [6, 4, 2];
    const lineOpacity = [0.9, 0.7, 0.5];
    
    for (let i = 0; i < 3; i++) {
      ctx.strokeStyle = `rgba(255, 255, 255, ${lineOpacity[i]})`;
      ctx.lineWidth = lineThickness[i];
      ctx.beginPath();
      ctx.moveTo(25, boxY + 15 + (i * lineSpacing));
      ctx.lineTo(width - 25, boxY + 15 + (i * lineSpacing));
      ctx.stroke();
    }
    
    // Triple lines at bottom
    for (let i = 0; i < 3; i++) {
      ctx.strokeStyle = `rgba(255, 255, 255, ${lineOpacity[2-i]})`;
      ctx.lineWidth = lineThickness[2-i];
      ctx.beginPath();
      ctx.moveTo(25, boxY + boxHeight - 15 - (i * lineSpacing));
      ctx.lineTo(width - 25, boxY + boxHeight - 15 - (i * lineSpacing));
      ctx.stroke();
    }
    
    // Center divider line
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.lineWidth = 1;
    ctx.setLineDash([10, 5]);
    ctx.beginPath();
    ctx.moveTo(width * 0.25, boxY + boxHeight/2);
    ctx.lineTo(width * 0.75, boxY + boxHeight/2);
    ctx.stroke();
    ctx.setLineDash([]);
    
    // Corner accent marks
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.lineWidth = 3;
    const accentLength = 20;
    
    // Top corners
    ctx.beginPath();
    ctx.moveTo(15, boxY + 45);
    ctx.lineTo(15, boxY + 45 - accentLength);
    ctx.moveTo(width - 15, boxY + 45);
    ctx.lineTo(width - 15, boxY + 45 - accentLength);
    ctx.stroke();
    
    // Bottom corners
    ctx.beginPath();
    ctx.moveTo(15, boxY + boxHeight - 45);
    ctx.lineTo(15, boxY + boxHeight - 45 + accentLength);
    ctx.moveTo(width - 15, boxY + boxHeight - 45);
    ctx.lineTo(width - 15, boxY + boxHeight - 45 + accentLength);
    ctx.stroke();
    
    // Linear badge
    const badgeWidth = 140;
    const badgeHeight = 28;
    const badgeX = width - badgeWidth - 30;
    const badgeY = boxY + 50;
    
    // Badge with triple line effect
    ctx.fillStyle = '#8E44AD';
    ctx.fillRect(badgeX, badgeY, badgeWidth, badgeHeight);
    
    // Badge accent lines
    ctx.strokeStyle = '#FFFFFF';
    for (let i = 0; i < 3; i++) {
      ctx.lineWidth = 2 - i * 0.5;
      ctx.beginPath();
      ctx.moveTo(badgeX + 8, badgeY + 8 + (i * 4));
      ctx.lineTo(badgeX + badgeWidth - 8, badgeY + 8 + (i * 4));
      ctx.stroke();
    }
    
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 11px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('SIGNATURE', badgeX + badgeWidth/2, badgeY + badgeHeight/2 + 3);
    
    ctx.recipeBoxArea = { x: boxX, y: boxY, width: boxWidth, height: boxHeight, badgeY: badgeY, badgeHeight: badgeHeight };
  }

  /**
   * Style 13: Rounded Rectangle with Side Notches
   */
  createNotchedRectangleStyle(ctx, width, height, dominantColor) {
    const { r, g, b } = dominantColor;
    const boxWidth = width - 30;
    const boxHeight = 180;
    const boxX = 15;
    const boxY = (height - boxHeight) / 2;
    const cornerRadius = 25;
    const notchSize = 15;
    
    // Create rounded rectangle with side notches
    ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
    ctx.beginPath();
    // Top edge
    ctx.moveTo(boxX + cornerRadius, boxY);
    ctx.lineTo(boxX + boxWidth - cornerRadius, boxY);
    ctx.quadraticCurveTo(boxX + boxWidth, boxY, boxX + boxWidth, boxY + cornerRadius);
    
    // Right edge with notch
    ctx.lineTo(boxX + boxWidth, boxY + boxHeight/2 - notchSize);
    ctx.lineTo(boxX + boxWidth + notchSize, boxY + boxHeight/2);
    ctx.lineTo(boxX + boxWidth, boxY + boxHeight/2 + notchSize);
    
    // Bottom right
    ctx.lineTo(boxX + boxWidth, boxY + boxHeight - cornerRadius);
    ctx.quadraticCurveTo(boxX + boxWidth, boxY + boxHeight, boxX + boxWidth - cornerRadius, boxY + boxHeight);
    
    // Bottom edge
    ctx.lineTo(boxX + cornerRadius, boxY + boxHeight);
    ctx.quadraticCurveTo(boxX, boxY + boxHeight, boxX, boxY + boxHeight - cornerRadius);
    
    // Left edge with notch
    ctx.lineTo(boxX, boxY + boxHeight/2 + notchSize);
    ctx.lineTo(boxX - notchSize, boxY + boxHeight/2);
    ctx.lineTo(boxX, boxY + boxHeight/2 - notchSize);
    
    // Top left
    ctx.lineTo(boxX, boxY + cornerRadius);
    ctx.quadraticCurveTo(boxX, boxY, boxX + cornerRadius, boxY);
    ctx.fill();
    
    // Notch highlights
    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    // Right notch highlight
    ctx.beginPath();
    ctx.moveTo(boxX + boxWidth, boxY + boxHeight/2 - notchSize);
    ctx.lineTo(boxX + boxWidth + notchSize, boxY + boxHeight/2);
    ctx.lineTo(boxX + boxWidth + notchSize - 5, boxY + boxHeight/2);
    ctx.lineTo(boxX + boxWidth, boxY + boxHeight/2 - notchSize + 5);
    ctx.fill();
    
    // Left notch highlight
    ctx.beginPath();
    ctx.moveTo(boxX, boxY + boxHeight/2 - notchSize);
    ctx.lineTo(boxX - notchSize, boxY + boxHeight/2);
    ctx.lineTo(boxX - notchSize + 5, boxY + boxHeight/2);
    ctx.lineTo(boxX, boxY + boxHeight/2 - notchSize + 5);
    ctx.fill();
    
    // Rounded border accent
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.lineWidth = 3;
    this.drawRoundedRect(ctx, boxX + 8, boxY + 8, boxWidth - 16, boxHeight - 16, cornerRadius - 8);
    ctx.stroke();
    
    // Notched badge
    const badgeWidth = 120;
    const badgeHeight = 32;
    const badgeX = boxX + 25;
    const badgeY = boxY + 30;
    const badgeNotch = 8;
    
    ctx.fillStyle = '#2ECC71';
    ctx.beginPath();
    ctx.moveTo(badgeX + 8, badgeY);
    ctx.lineTo(badgeX + badgeWidth - 8, badgeY);
    ctx.lineTo(badgeX + badgeWidth, badgeY + 8);
    ctx.lineTo(badgeX + badgeWidth, badgeY + badgeHeight/2 - badgeNotch);
    ctx.lineTo(badgeX + badgeWidth + badgeNotch, badgeY + badgeHeight/2);
    ctx.lineTo(badgeX + badgeWidth, badgeY + badgeHeight/2 + badgeNotch);
    ctx.lineTo(badgeX + badgeWidth, badgeY + badgeHeight - 8);
    ctx.lineTo(badgeX + badgeWidth - 8, badgeY + badgeHeight);
    ctx.lineTo(badgeX + 8, badgeY + badgeHeight);
    ctx.lineTo(badgeX, badgeY + badgeHeight - 8);
    ctx.lineTo(badgeX, badgeY + 8);
    ctx.fill();
    
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 12px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('CRAFTED', badgeX + badgeWidth/2, badgeY + badgeHeight/2);
    
    ctx.recipeBoxArea = { x: boxX, y: boxY, width: boxWidth, height: boxHeight, badgeY: badgeY, badgeHeight: badgeHeight };
  }

  /**
   * Style 14: Rustic Wood Grain Recipe Card
   */
  createRusticWoodGrainStyle(ctx, width, height, dominantColor) {
    const { r, g, b } = dominantColor;
    const boxWidth = width;
    const boxHeight = 160;
    const boxX = 0;
    const boxY = (height - boxHeight) / 2;
    
    // Wood grain background
    const gradient = ctx.createLinearGradient(0, boxY, 0, boxY + boxHeight);
    gradient.addColorStop(0, `rgb(${Math.max(0, r - 30)}, ${Math.max(0, g - 25)}, ${Math.max(0, b - 20)})`);
    gradient.addColorStop(0.5, `rgb(${r}, ${g}, ${b})`);
    gradient.addColorStop(1, `rgb(${Math.max(0, r - 40)}, ${Math.max(0, g - 35)}, ${Math.max(0, b - 30)})`);
    ctx.fillStyle = gradient;
    ctx.fillRect(boxX, boxY, boxWidth, boxHeight);
    
    // Wood grain texture lines
    ctx.strokeStyle = `rgba(${Math.max(0, r - 50)}, ${Math.max(0, g - 45)}, ${Math.max(0, b - 40)}, 0.6)`;
    ctx.lineWidth = 2;
    for (let i = 0; i < 8; i++) {
      const lineY = boxY + (boxHeight / 8) * i + Math.sin(i) * 5;
      ctx.beginPath();
      ctx.moveTo(boxX, lineY);
      for (let x = 0; x <= boxWidth; x += 20) {
        const waveY = lineY + Math.sin(x * 0.05 + i) * 3;
        ctx.lineTo(x, waveY);
      }
      ctx.stroke();
    }
    
    // Wood knots
    ctx.fillStyle = `rgba(${Math.max(0, r - 60)}, ${Math.max(0, g - 55)}, ${Math.max(0, b - 50)}, 0.4)`;
    const knotPositions = [
      {x: boxX + 50, y: boxY + 40, size: 8},
      {x: boxX + boxWidth - 80, y: boxY + 100, size: 12},
      {x: boxX + 150, y: boxY + 120, size: 6}
    ];
    knotPositions.forEach(knot => {
      ctx.beginPath();
      ctx.arc(knot.x, knot.y, knot.size, 0, Math.PI * 2);
      ctx.fill();
    });
    
    // Rustic paper badge
    const badgeWidth = 130;
    const badgeHeight = 35;
    const badgeX = (width - badgeWidth) / 2;
    const badgeY = boxY + 12;
    
    // Paper texture background
    ctx.fillStyle = '#F4F1E8';
    ctx.fillRect(badgeX, badgeY, badgeWidth, badgeHeight);
    
    // Paper aging stains
    ctx.fillStyle = 'rgba(139, 69, 19, 0.1)';
    ctx.beginPath();
    ctx.arc(badgeX + 20, badgeY + 8, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(badgeX + badgeWidth - 25, badgeY + badgeHeight - 10, 8, 0, Math.PI * 2);
    ctx.fill();
    
    // Paper border
    ctx.strokeStyle = '#8B4513';
    ctx.lineWidth = 2;
    ctx.strokeRect(badgeX, badgeY, badgeWidth, badgeHeight);
    
    ctx.fillStyle = '#8B4513';
    ctx.font = 'bold 14px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('HAUSGEMACHT', badgeX + badgeWidth/2, badgeY + badgeHeight/2);
    
    ctx.recipeBoxArea = { x: boxX, y: boxY, width: boxWidth, height: boxHeight, badgeY: badgeY, badgeHeight: badgeHeight };
  }

  /**
   * Style 15: Vintage Recipe Card with Flourishes
   */
  createVintageRecipeCardStyle(ctx, width, height, dominantColor) {
    const { r, g, b } = dominantColor;
    const boxWidth = width;
    const boxHeight = 170;
    const boxX = 0;
    const boxY = (height - boxHeight) / 2;
    
    // Vintage paper background
    const gradient = ctx.createRadialGradient(width/2, boxY + boxHeight/2, 0, width/2, boxY + boxHeight/2, width/2);
    gradient.addColorStop(0, '#FDF6E3');
    gradient.addColorStop(1, '#F5E6D3');
    ctx.fillStyle = gradient;
    ctx.fillRect(boxX, boxY, boxWidth, boxHeight);
    
    // Age spots
    ctx.fillStyle = 'rgba(139, 69, 19, 0.08)';
    const spots = [
      {x: 80, y: boxY + 30, size: 15},
      {x: width - 60, y: boxY + 50, size: 10},
      {x: 120, y: boxY + 130, size: 12},
      {x: width - 100, y: boxY + 140, size: 8}
    ];
    spots.forEach(spot => {
      ctx.beginPath();
      ctx.arc(spot.x, spot.y, spot.size, 0, Math.PI * 2);
      ctx.fill();
    });
    
    // Ornate border
    ctx.strokeStyle = '#8B4513';
    ctx.lineWidth = 3;
    ctx.strokeRect(boxX + 15, boxY + 15, boxWidth - 30, boxHeight - 30);
    
    // Inner decorative border
    ctx.strokeStyle = '#D2B48C';
    ctx.lineWidth = 1;
    ctx.strokeRect(boxX + 20, boxY + 20, boxWidth - 40, boxHeight - 40);
    
    // Corner flourishes
    const flourishSize = 20;
    ctx.strokeStyle = '#8B4513';
    ctx.lineWidth = 2;
    
    // Top corners
    this.drawFlourish(ctx, boxX + 30, boxY + 30, flourishSize, 0);
    this.drawFlourish(ctx, boxX + boxWidth - 30, boxY + 30, flourishSize, Math.PI/2);
    // Bottom corners  
    this.drawFlourish(ctx, boxX + 30, boxY + boxHeight - 30, flourishSize, -Math.PI/2);
    this.drawFlourish(ctx, boxX + boxWidth - 30, boxY + boxHeight - 30, flourishSize, Math.PI);
    
    // Vintage recipe badge
    const badgeWidth = 140;
    const badgeHeight = 30;
    const badgeX = (width - badgeWidth) / 2;
    const badgeY = boxY + 12;
    
    ctx.fillStyle = '#8B4513';
    ctx.fillRect(badgeX, badgeY, badgeWidth, badgeHeight);
    
    // Gold trim
    ctx.strokeStyle = '#DAA520';
    ctx.lineWidth = 2;
    ctx.strokeRect(badgeX + 2, badgeY + 2, badgeWidth - 4, badgeHeight - 4);
    
    ctx.fillStyle = '#F5DEB3';
    ctx.font = 'italic bold 13px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('TRADITIONELL', badgeX + badgeWidth/2, badgeY + badgeHeight/2);
    
    ctx.recipeBoxArea = { x: boxX, y: boxY, width: boxWidth, height: boxHeight, badgeY: badgeY, badgeHeight: badgeHeight };
  }

  /**
   * Style 16: Modern Minimalist Chef Design
   */
  createModernMinimalistStyle(ctx, width, height, dominantColor) {
    const { r, g, b } = dominantColor;
    const boxWidth = width;
    const boxHeight = 140;
    const boxX = 0;
    const boxY = (height - boxHeight) / 2;
    
    // Clean gradient background
    const gradient = ctx.createLinearGradient(0, boxY, 0, boxY + boxHeight);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
    gradient.addColorStop(1, 'rgba(240, 240, 240, 0.95)');
    ctx.fillStyle = gradient;
    ctx.fillRect(boxX, boxY, boxWidth, boxHeight);
    
    // Subtle colored overlay
    ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.15)`;
    ctx.fillRect(boxX, boxY, boxWidth, boxHeight);
    
    // Minimalist top accent line
    ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
    ctx.fillRect(boxX, boxY, boxWidth, 4);
    
    // Geometric side elements
    ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.3)`;
    // Left geometric shape
    ctx.beginPath();
    ctx.moveTo(boxX, boxY + 20);
    ctx.lineTo(boxX + 30, boxY + 20);
    ctx.lineTo(boxX + 20, boxY + 40);
    ctx.lineTo(boxX, boxY + 40);
    ctx.fill();
    
    // Right geometric shape
    ctx.beginPath();
    ctx.moveTo(boxX + boxWidth - 30, boxY + boxHeight - 40);
    ctx.lineTo(boxX + boxWidth, boxY + boxHeight - 40);
    ctx.lineTo(boxX + boxWidth, boxY + boxHeight - 20);
    ctx.lineTo(boxX + boxWidth - 20, boxY + boxHeight - 20);
    ctx.fill();
    
    // Clean typography badge
    const badgeWidth = 120;
    const badgeHeight = 26;
    const badgeX = (width - badgeWidth) / 2;
    const badgeY = boxY + 12;
    
    ctx.fillStyle = '#2C3E50';
    ctx.fillRect(badgeX, badgeY, badgeWidth, badgeHeight);
    
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '500 12px "Helvetica Neue", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('PROFIQUALITÄT', badgeX + badgeWidth/2, badgeY + badgeHeight/2);
    
    ctx.recipeBoxArea = { x: boxX, y: boxY, width: boxWidth, height: boxHeight, badgeY: badgeY, badgeHeight: badgeHeight };
  }

  /**
   * Style 17: Tropical Fruit Paradise
   */
  createTropicalFruitStyle(ctx, width, height, dominantColor) {
    const { r, g, b } = dominantColor;
    const boxWidth = width;
    const boxHeight = 175;
    const boxX = 0;
    const boxY = (height - boxHeight) / 2;
    
    // Tropical sunset gradient
    const gradient = ctx.createLinearGradient(0, boxY, 0, boxY + boxHeight);
    gradient.addColorStop(0, '#FF6B35');
    gradient.addColorStop(0.4, '#F7931E');
    gradient.addColorStop(0.7, '#FFD23F');
    gradient.addColorStop(1, '#FF6B35');
    ctx.fillStyle = gradient;
    ctx.fillRect(boxX, boxY, boxWidth, boxHeight);
    
    // Palm fronds
    ctx.strokeStyle = '#228B22';
    ctx.lineWidth = 4;
    for (let i = 0; i < 6; i++) {
      const startX = boxX + 30 + (i * 80);
      const startY = boxY + 10;
      this.drawPalmFrond(ctx, startX, startY, 25);
    }
    
    // Tropical fruits scattered
    const fruits = [
      {x: 60, y: boxY + 45, type: 'pineapple'},
      {x: width - 80, y: boxY + 55, type: 'coconut'},
      {x: 120, y: boxY + 130, type: 'mango'},
      {x: width - 150, y: boxY + 125, type: 'pineapple'}
    ];
    
    fruits.forEach(fruit => {
      this.drawTropicalFruit(ctx, fruit.x, fruit.y, fruit.type);
    });
    
    // Tropical waves at bottom
    ctx.strokeStyle = '#00CED1';
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let x = boxX; x <= boxX + boxWidth; x += 10) {
      const waveY = boxY + boxHeight - 15 + Math.sin(x * 0.1) * 5;
      if (x === boxX) ctx.moveTo(x, waveY);
      else ctx.lineTo(x, waveY);
    }
    ctx.stroke();
    
    // Tropical badge
    const badgeWidth = 140;
    const badgeHeight = 32;
    const badgeX = (width - badgeWidth) / 2;
    const badgeY = boxY + 12;
    
    // Hibiscus flower badge background
    ctx.fillStyle = '#FF69B4';
    ctx.fillRect(badgeX, badgeY, badgeWidth, badgeHeight);
    
    // Flower petals effect
    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
    for (let i = 0; i < 5; i++) {
      const angle = (i * Math.PI * 2) / 5;
      const petalX = badgeX + badgeWidth/2 + Math.cos(angle) * 12;
      const petalY = badgeY + badgeHeight/2 + Math.sin(angle) * 12;
      ctx.beginPath();
      ctx.arc(petalX, petalY, 6, 0, Math.PI * 2);
      ctx.fill();
    }
    
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 13px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('EXOTISCH', badgeX + badgeWidth/2, badgeY + badgeHeight/2);
    
    ctx.recipeBoxArea = { x: boxX, y: boxY, width: boxWidth, height: boxHeight, badgeY: badgeY, badgeHeight: badgeHeight };
  }

  /**
   * Style 18: Cozy Kitchen Warmth
   */
  createCozyKitchenStyle(ctx, width, height, dominantColor) {
    const { r, g, b } = dominantColor;
    const boxWidth = width;
    const boxHeight = 165;
    const boxX = 0;
    const boxY = (height - boxHeight) / 2;
    
    // Warm kitchen gradient
    const gradient = ctx.createRadialGradient(width/2, boxY + boxHeight/2, 0, width/2, boxY + boxHeight/2, width/2);
    gradient.addColorStop(0, '#FFF8DC');
    gradient.addColorStop(0.5, '#F5DEB3');
    gradient.addColorStop(1, '#DEB887');
    ctx.fillStyle = gradient;
    ctx.fillRect(boxX, boxY, boxWidth, boxHeight);
    
    // Kitchen utensil silhouettes
    ctx.fillStyle = 'rgba(139, 69, 19, 0.2)';
    this.drawKitchenUtensil(ctx, boxX + 40, boxY + 30, 'spoon');
    this.drawKitchenUtensil(ctx, boxX + boxWidth - 60, boxY + 40, 'fork');
    this.drawKitchenUtensil(ctx, boxX + 80, boxY + 120, 'knife');
    this.drawKitchenUtensil(ctx, boxX + boxWidth - 100, boxY + 130, 'whisk');
    
    // Checkered pattern border
    const checkSize = 8;
    ctx.fillStyle = '#CD853F';
    for (let x = boxX; x < boxX + boxWidth; x += checkSize * 2) {
      ctx.fillRect(x, boxY, checkSize, checkSize);
      ctx.fillRect(x + checkSize, boxY + boxHeight - checkSize, checkSize, checkSize);
    }
    
    // Recipe card badge with apron ties
    const badgeWidth = 130;
    const badgeHeight = 32;
    const badgeX = (width - badgeWidth) / 2;
    const badgeY = boxY + 12;
    
    ctx.fillStyle = '#8B4513';
    ctx.fillRect(badgeX, badgeY, badgeWidth, badgeHeight);
    
    // Apron tie ribbons
    ctx.fillStyle = '#CD853F';
    ctx.fillRect(badgeX - 8, badgeY + 8, 8, 16);
    ctx.fillRect(badgeX + badgeWidth, badgeY + 8, 8, 16);
    
    ctx.fillStyle = '#F5DEB3';
    ctx.font = 'bold 13px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('HAUSGEMACHT', badgeX + badgeWidth/2, badgeY + badgeHeight/2);
    
    ctx.recipeBoxArea = { x: boxX, y: boxY, width: boxWidth, height: boxHeight, badgeY: badgeY, badgeHeight: badgeHeight };
  }

  /**
   * Style 19: Italian Pasta Swirls
   */
  createItalianPastaStyle(ctx, width, height, dominantColor) {
    const { r, g, b } = dominantColor;
    const boxWidth = width;
    const boxHeight = 170;
    const boxX = 0;
    const boxY = (height - boxHeight) / 2;
    
    // Italian flag colors gradient
    const gradient = ctx.createLinearGradient(0, boxY, 0, boxY + boxHeight);
    gradient.addColorStop(0, '#009246');
    gradient.addColorStop(0.33, '#F1F2F1');
    gradient.addColorStop(0.66, '#CE2B37');
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = gradient;
    ctx.fillRect(boxX, boxY, boxWidth, boxHeight);
    ctx.globalAlpha = 1;
    
    // Main background with pasta color
    ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.8)`;
    ctx.fillRect(boxX, boxY, boxWidth, boxHeight);
    
    // Pasta swirl decorations
    ctx.strokeStyle = '#D2691E';
    ctx.lineWidth = 3;
    for (let i = 0; i < 12; i++) {
      const centerX = boxX + 50 + (i % 4) * 120;
      const centerY = boxY + 40 + Math.floor(i / 4) * 45;
      this.drawPastaSwirl(ctx, centerX, centerY, 15);
    }
    
    // Basil leaves
    ctx.fillStyle = '#228B22';
    const leafPositions = [
      {x: boxX + 80, y: boxY + 35},
      {x: boxX + boxWidth - 100, y: boxY + 60},
      {x: boxX + 120, y: boxY + 140}
    ];
    leafPositions.forEach(leaf => {
      this.drawBasilLeaf(ctx, leaf.x, leaf.y);
    });
    
    // Italian heritage badge
    const badgeWidth = 140;
    const badgeHeight = 34;
    const badgeX = (width - badgeWidth) / 2;
    const badgeY = boxY + 12;
    
    // Tricolor badge background
    ctx.fillStyle = '#009246';
    ctx.fillRect(badgeX, badgeY, badgeWidth/3, badgeHeight);
    ctx.fillStyle = '#F1F2F1';
    ctx.fillRect(badgeX + badgeWidth/3, badgeY, badgeWidth/3, badgeHeight);
    ctx.fillStyle = '#CE2B37';
    ctx.fillRect(badgeX + (badgeWidth*2)/3, badgeY, badgeWidth/3, badgeHeight);
    
    // Badge border
    ctx.strokeStyle = '#8B4513';
    ctx.lineWidth = 2;
    ctx.strokeRect(badgeX, badgeY, badgeWidth, badgeHeight);
    
    ctx.fillStyle = '#FFFFFF';
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1;
    ctx.font = 'italic bold 13px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.strokeText('AUTHENTIC', badgeX + badgeWidth/2, badgeY + badgeHeight/2);
    ctx.fillText('AUTHENTIC', badgeX + badgeWidth/2, badgeY + badgeHeight/2);
    
    ctx.recipeBoxArea = { x: boxX, y: boxY, width: boxWidth, height: boxHeight, badgeY: badgeY, badgeHeight: badgeHeight };
  }

  /**
   * Style 20: Bakery Flour Dust
   */
  createBakeryFlourStyle(ctx, width, height, dominantColor) {
    const { r, g, b } = dominantColor;
    const boxWidth = width;
    const boxHeight = 160;
    const boxX = 0;
    const boxY = (height - boxHeight) / 2;
    
    // Flour-dusted surface background
    const gradient = ctx.createRadialGradient(width/2, boxY + boxHeight/2, 0, width/2, boxY + boxHeight/2, width/2);
    gradient.addColorStop(0, '#FFFACD');
    gradient.addColorStop(1, '#F5E6D3');
    ctx.fillStyle = gradient;
    ctx.fillRect(boxX, boxY, boxWidth, boxHeight);
    
    // Flour dust particles
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    for (let i = 0; i < 50; i++) {
      const dustX = boxX + Math.random() * boxWidth;
      const dustY = boxY + Math.random() * boxHeight;
      const dustSize = Math.random() * 3 + 1;
      ctx.beginPath();
      ctx.arc(dustX, dustY, dustSize, 0, Math.PI * 2);
      ctx.fill();
    }
    
    // Wheat stalks
    ctx.strokeStyle = '#DAA520';
    ctx.lineWidth = 2;
    const wheatPositions = [
      {x: boxX + 30, y: boxY + 40},
      {x: boxX + boxWidth - 40, y: boxY + 50},
      {x: boxX + 100, y: boxY + 120},
      {x: boxX + boxWidth - 120, y: boxY + 130}
    ];
    wheatPositions.forEach(wheat => {
      this.drawWheatStalk(ctx, wheat.x, wheat.y);
    });
    
    // Rolling pin impression
    ctx.strokeStyle = `rgba(${Math.max(0, r - 30)}, ${Math.max(0, g - 30)}, ${Math.max(0, b - 30)}, 0.3)`;
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(boxX + 50, boxY + boxHeight - 30);
    ctx.lineTo(boxX + boxWidth - 50, boxY + boxHeight - 30);
    ctx.stroke();
    
    // Bakery badge with flour dusting
    const badgeWidth = 130;
    const badgeHeight = 30;
    const badgeX = (width - badgeWidth) / 2;
    const badgeY = boxY + 12;
    
    ctx.fillStyle = '#8B4513';
    ctx.fillRect(badgeX, badgeY, badgeWidth, badgeHeight);
    
    // Flour dust on badge
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    for (let i = 0; i < 10; i++) {
      const dustX = badgeX + Math.random() * badgeWidth;
      const dustY = badgeY + Math.random() * badgeHeight;
      ctx.beginPath();
      ctx.arc(dustX, dustY, 2, 0, Math.PI * 2);
      ctx.fill();
    }
    
    ctx.fillStyle = '#F5DEB3';
    ctx.font = 'bold 12px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('FRISCH GEBACKEN', badgeX + badgeWidth/2, badgeY + badgeHeight/2);
    
    ctx.recipeBoxArea = { x: boxX, y: boxY, width: boxWidth, height: boxHeight, badgeY: badgeY, badgeHeight: badgeHeight };
  }

  /**
   * Style 21: Fresh Herb Garden
   */
  createFreshHerbStyle(ctx, width, height, dominantColor) {
    const { r, g, b } = dominantColor;
    const boxWidth = width;
    const boxHeight = 170;
    const boxX = 0;
    const boxY = (height - boxHeight) / 2;
    
    // Garden earth gradient
    const gradient = ctx.createLinearGradient(0, boxY, 0, boxY + boxHeight);
    gradient.addColorStop(0, '#90EE90');
    gradient.addColorStop(0.3, '#98FB98');
    gradient.addColorStop(0.7, '#8FBC8F');
    gradient.addColorStop(1, '#6B8E23');
    ctx.fillStyle = gradient;
    ctx.fillRect(boxX, boxY, boxWidth, boxHeight);
    
    // Herb sprigs scattered around
    const herbs = [
      {x: boxX + 40, y: boxY + 30, type: 'rosemary'},
      {x: boxX + boxWidth - 70, y: boxY + 45, type: 'thyme'},
      {x: boxX + 90, y: boxY + 120, type: 'basil'},
      {x: boxX + boxWidth - 120, y: boxY + 135, type: 'oregano'},
      {x: boxX + 160, y: boxY + 60, type: 'parsley'}
    ];
    
    herbs.forEach(herb => {
      this.drawHerbSprig(ctx, herb.x, herb.y, herb.type);
    });
    
    // Garden border with small leaves
    ctx.strokeStyle = '#228B22';
    ctx.lineWidth = 2;
    ctx.strokeRect(boxX + 10, boxY + 10, boxWidth - 20, boxHeight - 20);
    
    // Small decorative leaves on border
    for (let i = 0; i < 16; i++) {
      const angle = (i * Math.PI * 2) / 16;
      const borderX = boxX + (boxWidth/2) + Math.cos(angle) * (boxWidth/2 - 15);
      const borderY = boxY + (boxHeight/2) + Math.sin(angle) * (boxHeight/2 - 15);
      ctx.save();
      ctx.translate(borderX, borderY);
      ctx.rotate(angle);
      this.drawSmallLeaf(ctx, 0, 0);
      ctx.restore();
    }
    
    // Garden fresh badge
    const badgeWidth = 140;
    const badgeHeight = 32;
    const badgeX = (width - badgeWidth) / 2;
    const badgeY = boxY + 12;
    
    ctx.fillStyle = '#228B22';
    ctx.fillRect(badgeX, badgeY, badgeWidth, badgeHeight);
    
    // Herb sprig on badge
    ctx.strokeStyle = '#90EE90';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(badgeX + 10, badgeY + badgeHeight/2);
    ctx.lineTo(badgeX + 25, badgeY + badgeHeight/2 - 8);
    ctx.moveTo(badgeX + 15, badgeY + badgeHeight/2 - 4);
    ctx.lineTo(badgeX + 20, badgeY + badgeHeight/2 - 12);
    ctx.stroke();
    
    ctx.fillStyle = '#F0FFF0';
    ctx.font = 'bold 13px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('GARTEN FRISCH', badgeX + badgeWidth/2, badgeY + badgeHeight/2);
    
    ctx.recipeBoxArea = { x: boxX, y: boxY, width: boxWidth, height: boxHeight, badgeY: badgeY, badgeHeight: badgeHeight };
  }

  /**
   * Style 22: Grill Master BBQ
   */
  createGrillMasterStyle(ctx, width, height, dominantColor) {
    const { r, g, b } = dominantColor;
    const boxWidth = width;
    const boxHeight = 165;
    const boxX = 0;
    const boxY = (height - boxHeight) / 2;
    
    // Smoky BBQ gradient
    const gradient = ctx.createLinearGradient(0, boxY, 0, boxY + boxHeight);
    gradient.addColorStop(0, '#2F1B14');
    gradient.addColorStop(0.3, '#8B4513');
    gradient.addColorStop(0.7, '#A0522D');
    gradient.addColorStop(1, '#2F1B14');
    ctx.fillStyle = gradient;
    ctx.fillRect(boxX, boxY, boxWidth, boxHeight);
    
    // Grill marks
    ctx.strokeStyle = 'rgba(139, 69, 19, 0.8)';
    ctx.lineWidth = 4;
    for (let i = 0; i < 8; i++) {
      const grillY = boxY + 25 + (i * 15);
      ctx.beginPath();
      ctx.moveTo(boxX + 30, grillY);
      ctx.lineTo(boxX + boxWidth - 30, grillY);
      ctx.stroke();
    }
    
    // Smoke wisps
    ctx.strokeStyle = 'rgba(192, 192, 192, 0.6)';
    ctx.lineWidth = 3;
    for (let i = 0; i < 5; i++) {
      const smokeX = boxX + 60 + (i * 90);
      this.drawSmokeWisp(ctx, smokeX, boxY + 20);
    }
    
    // BBQ tools silhouettes
    ctx.fillStyle = 'rgba(105, 105, 105, 0.7)';
    this.drawBBQTool(ctx, boxX + 40, boxY + 120, 'spatula');
    this.drawBBQTool(ctx, boxX + boxWidth - 80, boxY + 125, 'tongs');
    
    // Fire flames at bottom
    ctx.fillStyle = '#FF6347';
    for (let i = 0; i < 8; i++) {
      const flameX = boxX + 30 + (i * 60);
      this.drawFlame(ctx, flameX, boxY + boxHeight - 20, 15);
    }
    
    // Grill master badge
    const badgeWidth = 140;
    const badgeHeight = 34;
    const badgeX = (width - badgeWidth) / 2;
    const badgeY = boxY + 12;
    
    // Charcoal black badge
    ctx.fillStyle = '#2F2F2F';
    ctx.fillRect(badgeX, badgeY, badgeWidth, badgeHeight);
    
    // Fire accent border
    ctx.strokeStyle = '#FF6347';
    ctx.lineWidth = 2;
    ctx.strokeRect(badgeX + 2, badgeY + 2, badgeWidth - 4, badgeHeight - 4);
    
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 13px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('GRILLMEISTER', badgeX + badgeWidth/2, badgeY + badgeHeight/2);
    
    ctx.recipeBoxArea = { x: boxX, y: boxY, width: boxWidth, height: boxHeight, badgeY: badgeY, badgeHeight: badgeHeight };
  }

  /**
   * Style 23: Double Dot Border (Style 2 Variation)
   */
  createModernMagazineStyle(ctx, width, height, dominantColor) {
    const { r, g, b } = dominantColor;
    const boxWidth = width;
    const boxHeight = 200;
    const boxX = 0;
    const boxY = (height - boxHeight) / 2;

    // Enhanced dominant color
    const baseColor = `rgb(${Math.min(255, r + 20)}, ${Math.min(255, g + 20)}, ${Math.min(255, b + 20)})`;

    // Draw main background
    ctx.fillStyle = baseColor;
    ctx.fillRect(boxX, boxY, boxWidth, boxHeight);

    // Draw DOUBLE row of dots (top and bottom)
    ctx.fillStyle = '#000000';
    const dotSize = 10; // Larger dots
    const spacing = 20;

    // TOP: First row of dots
    for (let x = spacing; x < width - spacing; x += spacing) {
      ctx.beginPath();
      ctx.arc(x, boxY + 12, dotSize / 2, 0, 2 * Math.PI);
      ctx.fill();
    }

    // TOP: Second row of dots (offset)
    for (let x = spacing; x < width - spacing; x += spacing) {
      ctx.beginPath();
      ctx.arc(x, boxY + 24, dotSize / 2, 0, 2 * Math.PI);
      ctx.fill();
    }

    // BOTTOM: First row of dots
    for (let x = spacing; x < width - spacing; x += spacing) {
      ctx.beginPath();
      ctx.arc(x, boxY + boxHeight - 24, dotSize / 2, 0, 2 * Math.PI);
      ctx.fill();
    }

    // BOTTOM: Second row of dots
    for (let x = spacing; x < width - spacing; x += spacing) {
      ctx.beginPath();
      ctx.arc(x, boxY + boxHeight - 12, dotSize / 2, 0, 2 * Math.PI);
      ctx.fill();
    }

    // CENTER TOP badge
    const badgeWidth = 110;
    const badgeHeight = 28;
    const badgeX = (width - badgeWidth) / 2; // Centered
    const badgeY = boxY - 12;

    // Teal/Turquoise badge
    ctx.fillStyle = '#20B2AA';
    ctx.fillRect(badgeX, badgeY, badgeWidth, badgeHeight);

    // Badge text
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 13px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('LECKER', badgeX + badgeWidth/2, badgeY + badgeHeight/2);

    ctx.recipeBoxArea = { x: boxX, y: boxY, width: boxWidth, height: boxHeight, badgeY: badgeY, badgeHeight: badgeHeight };
  }

  /**
   * Style 24: Square Dot Pattern (Style 2 Variation)
   */
  createHandwrittenCharmStyle(ctx, width, height, dominantColor) {
    const { r, g, b } = dominantColor;
    const boxWidth = width;
    const boxHeight = 200;
    const boxX = 0;
    const boxY = (height - boxHeight) / 2;

    // Enhanced dominant color
    const baseColor = `rgb(${Math.min(255, r + 20)}, ${Math.min(255, g + 20)}, ${Math.min(255, b + 20)})`;

    // Draw main background
    ctx.fillStyle = baseColor;
    ctx.fillRect(boxX, boxY, boxWidth, boxHeight);

    // Draw SQUARE shapes instead of circles
    ctx.fillStyle = '#000000';
    const squareSize = 8;
    const spacing = 20;

    // TOP border squares
    for (let x = spacing; x < width - spacing; x += spacing) {
      ctx.fillRect(x - squareSize/2, boxY + 15 - squareSize/2, squareSize, squareSize);
    }

    // BOTTOM border squares
    for (let x = spacing; x < width - spacing; x += spacing) {
      ctx.fillRect(x - squareSize/2, boxY + boxHeight - 15 - squareSize/2, squareSize, squareSize);
    }

    // CORNER squares (left and right)
    // Left side corners
    for (let y = boxY + 40; y < boxY + boxHeight - 40; y += 30) {
      ctx.fillRect(boxX + 15 - squareSize/2, y - squareSize/2, squareSize, squareSize);
    }

    // Right side corners
    for (let y = boxY + 40; y < boxY + boxHeight - 40; y += 30) {
      ctx.fillRect(boxX + boxWidth - 15 - squareSize/2, y - squareSize/2, squareSize, squareSize);
    }

    // Corner badge with rounded edges
    const badgeWidth = 100;
    const badgeHeight = 26;
    const badgeX = 20;
    const badgeY = boxY - 10;

    // Coral/Orange badge
    ctx.fillStyle = '#FF7F50';
    this.roundRect(ctx, badgeX, badgeY, badgeWidth, badgeHeight, 13);
    ctx.fill();

    // Badge text
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 12px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('FRISCH', badgeX + badgeWidth/2, badgeY + badgeHeight/2);

    ctx.recipeBoxArea = { x: boxX, y: boxY, width: boxWidth, height: boxHeight, badgeY: badgeY, badgeHeight: badgeHeight };
  }

  /**
   * Style 25: Diamond Border (Style 2 Variation)
   */
  createBoldMinimalistStyle(ctx, width, height, dominantColor) {
    const { r, g, b } = dominantColor;
    const boxWidth = width;
    const boxHeight = 200;
    const boxX = 0;
    const boxY = (height - boxHeight) / 2;

    // Enhanced dominant color
    const baseColor = `rgb(${Math.min(255, r + 20)}, ${Math.min(255, g + 20)}, ${Math.min(255, b + 20)})`;

    // Draw main background
    ctx.fillStyle = baseColor;
    ctx.fillRect(boxX, boxY, boxWidth, boxHeight);

    // Draw DIAMOND/rhombus shapes (rotated squares)
    ctx.fillStyle = '#000000';
    const diamondSize = 8;
    const spacing = 20;

    // TOP border diamonds
    for (let x = spacing; x < width - spacing; x += spacing) {
      ctx.save();
      ctx.translate(x, boxY + 15);
      ctx.rotate(Math.PI / 4); // 45 degree rotation
      ctx.fillRect(-diamondSize/2, -diamondSize/2, diamondSize, diamondSize);
      ctx.restore();
    }

    // BOTTOM border diamonds
    for (let x = spacing; x < width - spacing; x += spacing) {
      ctx.save();
      ctx.translate(x, boxY + boxHeight - 15);
      ctx.rotate(Math.PI / 4);
      ctx.fillRect(-diamondSize/2, -diamondSize/2, diamondSize, diamondSize);
      ctx.restore();
    }

    // SIDE badge (left side)
    const badgeWidth = 28;
    const badgeHeight = 90;
    const badgeX = boxX - 8;
    const badgeY = (height - badgeHeight) / 2;

    // Purple/Lavender badge
    ctx.fillStyle = '#9370DB';
    ctx.fillRect(badgeX, badgeY, badgeWidth, badgeHeight);

    // Vertical badge text
    ctx.save();
    ctx.translate(badgeX + badgeWidth/2, badgeY + badgeHeight/2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 12px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('GENIAL', 0, 0);
    ctx.restore();

    ctx.recipeBoxArea = { x: boxX, y: boxY, width: boxWidth, height: boxHeight, badgeY: badgeY, badgeHeight: badgeHeight };
  }

  /**
   * Style 26: Alternating Dots (Style 2 Variation)
   */
  createVintageLabelStyle(ctx, width, height, dominantColor) {
    const { r, g, b } = dominantColor;
    const boxWidth = width;
    const boxHeight = 200;
    const boxX = 0;
    const boxY = (height - boxHeight) / 2;

    // Full-width colored background using dominant colors
    const baseColor = `rgb(${Math.min(255, r + 20)}, ${Math.min(255, g + 20)}, ${Math.min(255, b + 20)})`;
    ctx.fillStyle = baseColor;
    ctx.fillRect(boxX, boxY, boxWidth, boxHeight);

    // Alternating large and small dots pattern
    ctx.fillStyle = '#000000';
    const largeDotSize = 12;
    const smallDotSize = 6;
    const spacing = 20;

    // TOP border - alternating pattern
    for (let x = spacing, i = 0; x < width - spacing; x += spacing, i++) {
      const dotSize = i % 2 === 0 ? largeDotSize : smallDotSize;
      ctx.beginPath();
      ctx.arc(x, boxY + 15, dotSize / 2, 0, 2 * Math.PI);
      ctx.fill();
    }

    // BOTTOM border - alternating pattern (offset)
    for (let x = spacing, i = 0; x < width - spacing; x += spacing, i++) {
      const dotSize = i % 2 === 0 ? smallDotSize : largeDotSize; // Offset pattern
      ctx.beginPath();
      ctx.arc(x, boxY + boxHeight - 15, dotSize / 2, 0, 2 * Math.PI);
      ctx.fill();
    }

    // Bottom corner badge (mint green)
    const badgeWidth = 100;
    const badgeHeight = 26;
    const badgeX = boxX + boxWidth - badgeWidth - 20;
    const badgeY = boxY + boxHeight - badgeHeight + 10;

    ctx.fillStyle = '#98FF98'; // Mint green
    ctx.fillRect(badgeX, badgeY, badgeWidth, badgeHeight);

    ctx.fillStyle = '#000000';
    ctx.font = 'bold 12px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('KÖSTLICH', badgeX + badgeWidth/2, badgeY + badgeHeight/2);

    ctx.recipeBoxArea = { x: boxX, y: boxY, width: boxWidth, height: boxHeight, badgeY: badgeY, badgeHeight: badgeHeight };
  }

  /**
   * Style 27: Dash & Dot Combo (Style 2 Variation)
   */
  createNeonPopStyle(ctx, width, height, dominantColor) {
    const { r, g, b } = dominantColor;
    const boxWidth = width;
    const boxHeight = 200;
    const boxX = 0;
    const boxY = (height - boxHeight) / 2;

    // Full-width colored background using dominant colors
    const baseColor = `rgb(${Math.min(255, r + 20)}, ${Math.min(255, g + 20)}, ${Math.min(255, b + 20)})`;
    ctx.fillStyle = baseColor;
    ctx.fillRect(boxX, boxY, boxWidth, boxHeight);

    // Dash & Dot combo pattern (Morse code aesthetic)
    ctx.fillStyle = '#000000';
    const dotSize = 8;
    const dashWidth = 15;
    const dashHeight = 4;
    const spacing = 20;

    // TOP border - dash, dot, dash, dot pattern
    for (let x = spacing, i = 0; x < width - spacing; x += spacing, i++) {
      if (i % 2 === 0) {
        // Draw dash
        ctx.fillRect(x - dashWidth/2, boxY + 15 - dashHeight/2, dashWidth, dashHeight);
      } else {
        // Draw dot
        ctx.beginPath();
        ctx.arc(x, boxY + 15, dotSize / 2, 0, 2 * Math.PI);
        ctx.fill();
      }
    }

    // BOTTOM border - opposite pattern (dot, dash, dot, dash)
    for (let x = spacing, i = 0; x < width - spacing; x += spacing, i++) {
      if (i % 2 === 0) {
        // Draw dot
        ctx.beginPath();
        ctx.arc(x, boxY + boxHeight - 15, dotSize / 2, 0, 2 * Math.PI);
        ctx.fill();
      } else {
        // Draw dash
        ctx.fillRect(x - dashWidth/2, boxY + boxHeight - 15 - dashHeight/2, dashWidth, dashHeight);
      }
    }

    // Center badge with shadow (rose gold)
    const badgeWidth = 110;
    const badgeHeight = 28;
    const badgeX = (width - badgeWidth) / 2;
    const badgeY = boxY - 12;

    // Shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
    ctx.fillRect(badgeX + 2, badgeY + 2, badgeWidth, badgeHeight);

    // Rose gold badge
    ctx.fillStyle = '#B76E79'; // Rose gold
    ctx.fillRect(badgeX, badgeY, badgeWidth, badgeHeight);

    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 13px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('FEIN', badgeX + badgeWidth/2, badgeY + badgeHeight/2);

    ctx.recipeBoxArea = { x: boxX, y: boxY, width: boxWidth, height: boxHeight, badgeY: badgeY, badgeHeight: badgeHeight };
  }

  /**
   * Style 28: Triple Dot Rows (Style 2 Variation)
   */
  createRusticFarmhouseStyle(ctx, width, height, dominantColor) {
    const { r, g, b } = dominantColor;
    const boxWidth = width;
    const boxHeight = 200;
    const boxX = 0;
    const boxY = (height - boxHeight) / 2;

    // Full-width colored background using dominant colors
    const baseColor = `rgb(${Math.min(255, r + 20)}, ${Math.min(255, g + 20)}, ${Math.min(255, b + 20)})`;
    ctx.fillStyle = baseColor;
    ctx.fillRect(boxX, boxY, boxWidth, boxHeight);

    // Triple rows of dots with staggered positioning
    ctx.fillStyle = '#000000';
    const dotSize = 8;
    const spacing = 20;
    const rowSpacing = 8;

    // TOP: Three rows of dots
    for (let row = 0; row < 3; row++) {
      const offsetX = row * 10; // Stagger each row
      for (let x = spacing + offsetX; x < width - spacing; x += spacing) {
        ctx.beginPath();
        ctx.arc(x, boxY + 10 + row * rowSpacing, dotSize / 2, 0, 2 * Math.PI);
        ctx.fill();
      }
    }

    // BOTTOM: Three rows of dots (staggered opposite direction)
    for (let row = 0; row < 3; row++) {
      const offsetX = (2 - row) * 10; // Opposite stagger
      for (let x = spacing + offsetX; x < width - spacing; x += spacing) {
        ctx.beginPath();
        ctx.arc(x, boxY + boxHeight - 26 + row * rowSpacing, dotSize / 2, 0, 2 * Math.PI);
        ctx.fill();
      }
    }

    // Ribbon badge (navy blue)
    const badgeWidth = 115;
    const badgeHeight = 30;
    const badgeX = (width - badgeWidth) / 2;
    const badgeY = boxY - 15;

    // Navy ribbon
    ctx.fillStyle = '#000080'; // Navy blue
    ctx.fillRect(badgeX, badgeY, badgeWidth, badgeHeight);

    // Gold border
    ctx.strokeStyle = '#FFD700';
    ctx.lineWidth = 2;
    ctx.strokeRect(badgeX + 2, badgeY + 2, badgeWidth - 4, badgeHeight - 4);

    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 13px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('HERRLICH', badgeX + badgeWidth/2, badgeY + badgeHeight/2);

    ctx.recipeBoxArea = { x: boxX, y: boxY, width: boxWidth, height: boxHeight, badgeY: badgeY, badgeHeight: badgeHeight };
  }

  /**
   * Style 29: Circle Outline Dots (Style 2 Variation)
   */
  createDigitalGlassStyle(ctx, width, height, dominantColor) {
    const { r, g, b } = dominantColor;
    const boxWidth = width;
    const boxHeight = 200;
    const boxX = 0;
    const boxY = (height - boxHeight) / 2;

    // Full-width colored background using dominant colors
    const baseColor = `rgb(${Math.min(255, r + 20)}, ${Math.min(255, g + 20)}, ${Math.min(255, b + 20)})`;
    ctx.fillStyle = baseColor;
    ctx.fillRect(boxX, boxY, boxWidth, boxHeight);

    // Hollow circle outlines (no fill)
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 3; // Thicker line weight
    const circleSize = 10;
    const spacing = 20;

    // TOP border - hollow circles
    for (let x = spacing; x < width - spacing; x += spacing) {
      ctx.beginPath();
      ctx.arc(x, boxY + 15, circleSize / 2, 0, 2 * Math.PI);
      ctx.stroke();
    }

    // BOTTOM border - hollow circles
    for (let x = spacing; x < width - spacing; x += spacing) {
      ctx.beginPath();
      ctx.arc(x, boxY + boxHeight - 15, circleSize / 2, 0, 2 * Math.PI);
      ctx.stroke();
    }

    // Top-left corner badge (red)
    const badge1Width = 95;
    const badge1Height = 26;
    const badge1X = 20;
    const badge1Y = boxY - 10;

    ctx.fillStyle = '#DC143C'; // Crimson red
    ctx.fillRect(badge1X, badge1Y, badge1Width, badge1Height);

    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 12px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('SUPER', badge1X + badge1Width/2, badge1Y + badge1Height/2);

    // Top-right corner badge (yellow)
    const badge2Width = 95;
    const badge2Height = 26;
    const badge2X = boxX + boxWidth - badge2Width - 20;
    const badge2Y = boxY - 10;

    ctx.fillStyle = '#FFD700'; // Gold yellow
    ctx.fillRect(badge2X, badge2Y, badge2Width, badge2Height);

    ctx.fillStyle = '#000000';
    ctx.font = 'bold 12px Arial';
    ctx.fillText('LECKER', badge2X + badge2Width/2, badge2Y + badge2Height/2);

    ctx.recipeBoxArea = { x: boxX, y: boxY, width: boxWidth, height: boxHeight, badgeY: badge1Y, badgeHeight: badge1Height };
  }

  /**
   * Style 30: Star Dot Pattern (Style 2 Variation)
   */
  createWatercolorArtistStyle(ctx, width, height, dominantColor) {
    const { r, g, b } = dominantColor;
    const boxWidth = width;
    const boxHeight = 200;
    const boxX = 0;
    const boxY = (height - boxHeight) / 2;

    // Full-width colored background using dominant colors
    const baseColor = `rgb(${Math.min(255, r + 20)}, ${Math.min(255, g + 20)}, ${Math.min(255, b + 20)})`;
    ctx.fillStyle = baseColor;
    ctx.fillRect(boxX, boxY, boxWidth, boxHeight);

    // Star shapes instead of dots
    ctx.fillStyle = '#000000';
    const starSize = 10;
    const spacing = 20;

    // TOP border - stars
    for (let x = spacing; x < width - spacing; x += spacing) {
      this.drawStar(ctx, x, boxY + 15, 5, starSize, starSize/2);
    }

    // BOTTOM border - stars
    for (let x = spacing; x < width - spacing; x += spacing) {
      this.drawStar(ctx, x, boxY + boxHeight - 15, 5, starSize, starSize/2);
    }

    // Top-right corner badge (gold)
    const badgeWidth = 105;
    const badgeHeight = 28;
    const badgeX = boxX + boxWidth - badgeWidth - 20;
    const badgeY = boxY - 12;

    ctx.fillStyle = '#FFD700'; // Gold
    ctx.fillRect(badgeX, badgeY, badgeWidth, badgeHeight);

    // Gold border
    ctx.strokeStyle = '#DAA520'; // Darker gold
    ctx.lineWidth = 2;
    ctx.strokeRect(badgeX + 2, badgeY + 2, badgeWidth - 4, badgeHeight - 4);

    ctx.fillStyle = '#000000';
    ctx.font = 'bold 13px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('PERFEKT', badgeX + badgeWidth/2, badgeY + badgeHeight/2);

    ctx.recipeBoxArea = { x: boxX, y: boxY, width: boxWidth, height: boxHeight, badgeY: badgeY, badgeHeight: badgeHeight };
  }

  // Helper Methods for Creative Styles

  /**
   * Draw a decorative flourish for vintage style
   */
  drawFlourish(ctx, x, y, size, rotation) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(-size/2, -size/4, -size/2, size/4, 0, size/2);
    ctx.bezierCurveTo(size/2, size/4, size/2, -size/4, 0, 0);
    ctx.stroke();
    ctx.restore();
  }

  /**
   * Draw a palm frond for tropical style
   */
  drawPalmFrond(ctx, x, y, length) {
    ctx.save();
    ctx.strokeStyle = '#228B22';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let i = 0; i < 5; i++) {
      const frondX = x + Math.cos(i * 0.5) * length;
      const frondY = y + Math.sin(i * 0.3) * (length * 0.8);
      ctx.lineTo(frondX, frondY);
    }
    ctx.stroke();
    ctx.restore();
  }

  /**
   * Draw tropical fruits
   */
  drawTropicalFruit(ctx, x, y, type) {
    ctx.save();
    switch (type) {
      case 'pineapple':
        ctx.fillStyle = '#FFD700';
        ctx.fillRect(x - 5, y - 8, 10, 12);
        ctx.fillStyle = '#228B22';
        ctx.fillRect(x - 3, y - 12, 6, 4);
        break;
      case 'coconut':
        ctx.fillStyle = '#8B4513';
        ctx.beginPath();
        ctx.arc(x, y, 6, 0, Math.PI * 2);
        ctx.fill();
        break;
      case 'mango':
        ctx.fillStyle = '#FF8C00';
        ctx.beginPath();
        ctx.ellipse(x, y, 8, 5, 0, 0, Math.PI * 2);
        ctx.fill();
        break;
    }
    ctx.restore();
  }

  /**
   * Draw kitchen utensils
   */
  drawKitchenUtensil(ctx, x, y, type) {
    ctx.save();
    ctx.strokeStyle = 'rgba(139, 69, 19, 0.3)';
    ctx.lineWidth = 3;
    switch (type) {
      case 'spoon':
        ctx.beginPath();
        ctx.arc(x, y, 5, 0, Math.PI * 2);
        ctx.moveTo(x, y + 5);
        ctx.lineTo(x, y + 20);
        ctx.stroke();
        break;
      case 'fork':
        ctx.beginPath();
        ctx.moveTo(x - 3, y);
        ctx.lineTo(x - 3, y + 8);
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + 8);
        ctx.moveTo(x + 3, y);
        ctx.lineTo(x + 3, y + 8);
        ctx.moveTo(x - 3, y + 8);
        ctx.lineTo(x + 3, y + 8);
        ctx.moveTo(x, y + 8);
        ctx.lineTo(x, y + 20);
        ctx.stroke();
        break;
      case 'knife':
        ctx.beginPath();
        ctx.moveTo(x - 8, y);
        ctx.lineTo(x + 2, y);
        ctx.lineTo(x + 1, y + 3);
        ctx.lineTo(x - 7, y + 3);
        ctx.moveTo(x + 1, y + 1.5);
        ctx.lineTo(x + 1, y + 15);
        ctx.stroke();
        break;
      case 'whisk':
        ctx.beginPath();
        for (let i = 0; i < 5; i++) {
          const wireX = x - 6 + (i * 3);
          ctx.moveTo(wireX, y);
          ctx.lineTo(wireX, y + 10);
          ctx.arc(wireX, y + 12, 2, 0, Math.PI);
        }
        ctx.moveTo(x - 6, y);
        ctx.lineTo(x + 6, y);
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + 15);
        ctx.stroke();
        break;
    }
    ctx.restore();
  }

  /**
   * Draw pasta swirls
   */
  drawPastaSwirl(ctx, x, y, radius) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, radius * 0.7, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, radius * 0.4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  /**
   * Draw basil leaf
   */
  drawBasilLeaf(ctx, x, y) {
    ctx.save();
    ctx.fillStyle = '#228B22';
    ctx.beginPath();
    ctx.ellipse(x, y, 8, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#006400';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y - 4);
    ctx.lineTo(x, y + 4);
    ctx.stroke();
    ctx.restore();
  }

  /**
   * Draw wheat stalks
   */
  drawWheatStalk(ctx, x, y) {
    ctx.save();
    ctx.strokeStyle = '#DAA520';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y + 20);
    for (let i = 0; i < 8; i++) {
      const grainY = y + (i * 2.5);
      ctx.moveTo(x - 3, grainY);
      ctx.lineTo(x + 3, grainY);
    }
    ctx.stroke();
    ctx.restore();
  }

  /**
   * Draw herb sprigs
   */
  drawHerbSprig(ctx, x, y, type) {
    ctx.save();
    ctx.strokeStyle = '#228B22';
    ctx.lineWidth = 2;
    ctx.fillStyle = '#90EE90';
    
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y + 15);
    ctx.stroke();
    
    for (let i = 0; i < 6; i++) {
      const leafY = y + 2 + (i * 2);
      ctx.beginPath();
      ctx.ellipse(x - 3, leafY, 2, 1, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(x + 3, leafY, 2, 1, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  /**
   * Draw small decorative leaf
   */
  drawSmallLeaf(ctx, x, y) {
    ctx.save();
    ctx.fillStyle = '#228B22';
    ctx.beginPath();
    ctx.ellipse(x, y, 3, 1.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /**
   * Draw smoke wisps for BBQ
   */
  drawSmokeWisp(ctx, x, y) {
    ctx.save();
    ctx.strokeStyle = 'rgba(192, 192, 192, 0.6)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let i = 0; i < 10; i++) {
      const smokeX = x + Math.sin(i * 0.5) * 5;
      const smokeY = y - (i * 3);
      ctx.lineTo(smokeX, smokeY);
    }
    ctx.stroke();
    ctx.restore();
  }

  /**
   * Draw BBQ tools
   */
  drawBBQTool(ctx, x, y, type) {
    ctx.save();
    ctx.strokeStyle = 'rgba(105, 105, 105, 0.7)';
    ctx.lineWidth = 3;
    switch (type) {
      case 'spatula':
        ctx.fillRect(x, y, 15, 5);
        ctx.fillRect(x + 7, y + 5, 2, 15);
        break;
      case 'tongs':
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + 5, y + 15);
        ctx.moveTo(x + 10, y);
        ctx.lineTo(x + 5, y + 15);
        ctx.stroke();
        break;
    }
    ctx.restore();
  }

  /**
   * Draw flame
   */
  drawFlame(ctx, x, y, height) {
    ctx.save();
    ctx.fillStyle = '#FF6347';
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.bezierCurveTo(x - 5, y - height/2, x - 3, y - height, x, y - height);
    ctx.bezierCurveTo(x + 3, y - height, x + 5, y - height/2, x, y);
    ctx.fill();
    ctx.restore();
  }

  /**
   * Generate Pinterest image from recipe/keyword data using existing images and overlay text
   */
  async generateFromRecipe(recipeData, db, variation = 1) {
    const { id: recipeId, recipe_idea } = recipeData;
    
    if (!recipeId) {
      throw new Error('Recipe ID is required for Pinterest image generation');
    }

    try {
      console.log(`🔍 Loading images and Pinterest data for recipe: ${recipe_idea} (ID: ${recipeId})`);
      // Get recipe images from database - try completed first, then any available
      let recipeImages = await db.getAll(`
        SELECT image_path, prompt, status, created_at
        FROM recipe_images 
        WHERE recipe_id = ? AND status = 'completed' AND image_path IS NOT NULL
        ORDER BY created_at ASC
      `, [recipeId]);

      // If not enough completed images, get any available images
      if (!recipeImages || recipeImages.length < 2) {
        console.log(`⚠️ Only ${recipeImages?.length || 0} completed images found, looking for any available images...`);
        recipeImages = await db.getAll(`
          SELECT image_path, prompt, status, created_at
          FROM recipe_images 
          WHERE recipe_id = ? AND image_path IS NOT NULL
          ORDER BY created_at ASC
          LIMIT 10
        `, [recipeId]);
      }

      if (!recipeImages || recipeImages.length < 1) {
        throw new Error(`No recipe images found for recipe ID: ${recipeId}. Please generate some images first.`);
      }

      // Check for grid images and crop them automatically
      let topImage = recipeImages[0];
      let bottomImage = recipeImages[recipeImages.length - 1];
      
      // Check if any images are grids and crop them
      if (topImage.image_path.includes('grid_')) {
        console.log(`🔍 Top image is a grid, attempting to crop individual images...`);
        try {
          const gridBuffer = await this.downloadImage(topImage.image_path.startsWith('/') ? topImage.image_path : `/recipe_images/${topImage.image_path}`);
          const { topImage: croppedTop, bottomImage: croppedBottom } = await this.cropGridToIndividualImages(gridBuffer);
          
          // Replace with cropped versions
          topImage = { ...topImage, imageBuffer: croppedTop, image_path: 'cropped_top_' + topImage.image_path };
          bottomImage = { ...bottomImage, imageBuffer: croppedBottom, image_path: 'cropped_bottom_' + topImage.image_path };
          console.log(`✅ Successfully cropped top grid into individual images`);
        } catch (cropError) {
          console.warn(`⚠️ Could not crop top grid image: ${cropError.message}`);
        }
      }
      
      // If bottom image is also a grid and different from top, crop it too
      if (bottomImage.image_path.includes('grid_') && bottomImage.image_path !== topImage.image_path && !bottomImage.imageBuffer) {
        console.log(`🔍 Bottom image is also a grid, attempting to crop...`);
        try {
          const gridBuffer = await this.downloadImage(bottomImage.image_path.startsWith('/') ? bottomImage.image_path : `/recipe_images/${bottomImage.image_path}`);
          const { topImage: croppedTop, bottomImage: croppedBottom } = await this.cropGridToIndividualImages(gridBuffer);
          bottomImage = { ...bottomImage, imageBuffer: croppedBottom, image_path: 'cropped_bottom_' + bottomImage.image_path };
          console.log(`✅ Successfully cropped bottom grid`);
        } catch (cropError) {
          console.warn(`⚠️ Could not crop bottom grid image: ${cropError.message}`);
        }
      }
      
      recipeImages = [topImage, bottomImage];
      
      // Legacy fallback for single grid image
      if (recipeImages.length === 1 && recipeImages[0].image_path.includes('grid_') && !recipeImages[0].imageBuffer) {
        const imagePath = recipeImages[0].image_path;
        console.log(`📸 Fallback: Single grid image found: ${imagePath}`);
        console.log(`🔍 Detected grid image, attempting to crop individual images...`);
        try {
          // Convert relative path to full URL for downloading
          const baseUrl = 'http://localhost:4000';
          const fullGridUrl = imagePath.startsWith('http') ? imagePath : `${baseUrl}/recipe_images/${imagePath}`;
          
          // Download and crop the grid into individual images
          const gridBuffer = await this.downloadImage(fullGridUrl);
          const { topImage, bottomImage } = await this.cropGridToIndividualImages(gridBuffer);
          
          // Create temporary individual image objects with the cropped data
          recipeImages = [
            { 
              ...recipeImages[0], 
              image_path: 'cropped_top_' + imagePath,
              imageBuffer: topImage
            },
            { 
              ...recipeImages[0], 
              image_path: 'cropped_bottom_' + imagePath,
              imageBuffer: bottomImage
            }
          ];
          console.log(`✅ Successfully cropped grid into individual images`);
        } catch (cropError) {
          console.warn(`⚠️ Could not crop grid image, using original: ${cropError.message}`);
          console.log(`📸 Using same grid image for both top and bottom positions`);
          recipeImages = [recipeImages[0], recipeImages[0]];
        }
      } else if (recipeImages.length === 1) {
        console.log(`📸 Using same image for both top and bottom positions`);
        recipeImages = [recipeImages[0], recipeImages[0]];
      }

      // Get Pinterest variation with overlay text
      const pinterestVariation = await db.getOne(`
        SELECT pin_title, pin_description, overlay_text
        FROM pinterest_variations 
        WHERE recipe_id = ?
        ORDER BY variation_number ASC
        LIMIT 1
      `, [recipeId]);

      // Build image URLs with better path handling
      const buildImageUrl = (imagePath) => {
        if (!imagePath) return null;
        
        // If already a full URL, return as-is
        if (imagePath.startsWith('http')) {
          return imagePath;
        }
        
        // If starts with /, it's already a relative path from root
        if (imagePath.startsWith('/')) {
          return imagePath;
        }
        
        // Extract just the filename and build the path
        const filename = imagePath.replace(/^.*[\\/]/, '');
        return `/recipe_images/${filename}`;
      };

      // Handle special case of cropped images (they have buffers instead of URLs)
      let topImageUrl, bottomImageUrl;
      if (recipeImages[0].imageBuffer) {
        // Use buffer directly for cropped images
        topImageUrl = 'BUFFER'; // Special marker for buffer handling
      } else {
        topImageUrl = buildImageUrl(recipeImages[0].image_path);
      }
      
      if (recipeImages[recipeImages.length - 1].imageBuffer) {
        // Use buffer directly for cropped images  
        bottomImageUrl = 'BUFFER'; // Special marker for buffer handling
      } else {
        bottomImageUrl = buildImageUrl(recipeImages[recipeImages.length - 1].image_path);
      }

      if (!topImageUrl || !bottomImageUrl) {
        throw new Error('Invalid image paths found in database');
      }

      // Use overlay text from Pinterest variation, or fallback to pin title, or recipe idea
      const overlayText = pinterestVariation?.overlay_text 
        || pinterestVariation?.pin_title 
        || recipe_idea 
        || 'Delicious Recipe';

      console.log(`📊 Found ${recipeImages.length} total images for recipe ID: ${recipeId}`);
      console.log(`🔍 Image paths found:`, recipeImages.map(img => img.image_path));
      console.log(`📸 Using images: Top: ${topImageUrl}, Bottom: ${bottomImageUrl}`);
      console.log(`📝 Using overlay text: "${overlayText}"`);
      console.log(`🎨 Variation: ${variation}`);

      // Generate Pinterest image with basic variation logic
      console.log('🎨 Using simple Pinterest generation mode');
      return await this.generatePinterestImage({
        topImageUrl,
        bottomImageUrl,
        text: overlayText,
        keyword: recipe_idea,
        filename: `pinterest_${recipe_idea.replace(/\s+/g, '_')}_v${variation}_${Date.now()}.jpg`,
        variation,
        // Pass the image buffers if available
        topImageBuffer: recipeImages[0].imageBuffer,
        bottomImageBuffer: recipeImages[recipeImages.length - 1].imageBuffer
      });

    } catch (error) {
      console.error(`❌ Error generating Pinterest image for recipe ${recipeId}:`, error.message);
      throw new Error(`Failed to generate Pinterest image: ${error.message}`);
    }
  }

  /**
   * Generate Pinterest image (main logic simplified)
   */
  async generatePinterestImage({ topImageUrl, bottomImageUrl, text, variation = 1, filename = 'pinterest_image.jpg', keyword = 'recipe', topImageBuffer = null, bottomImageBuffer = null }) {
    try {
      console.log('🔍 Pinterest generation debug info:');
      console.log(`📸 Top image URL: ${topImageUrl}`);
      console.log(`📸 Bottom image URL: ${bottomImageUrl}`);
      console.log(`📝 Text: ${text}`);
      console.log(`🎨 Variation: ${variation}`);
      console.log(`📁 Output directory: ${this.outputDir}`);
      
      // Check if output directory exists
      if (!fs.existsSync(this.outputDir)) {
        console.log(`📁 Creating output directory: ${this.outputDir}`);
        fs.mkdirSync(this.outputDir, { recursive: true });
      }

      // Initialize Canvas components
      const canvas = createCanvas(this.canvasWidth, this.canvasHeight);
      const ctx = canvas.getContext('2d');

      // Handle image loading - use buffers if provided, otherwise download from URLs
      let finalTopImageBuffer, finalBottomImageBuffer;
      
      if (topImageBuffer) {
        console.log('🔍 Using provided top image buffer (cropped from grid)');
        finalTopImageBuffer = topImageBuffer;
      } else {
        // Convert relative URLs to full URLs that the server can access
        const baseUrl = 'http://localhost:4000';
        const fullTopImageUrl = topImageUrl.startsWith('http') ? topImageUrl : `${baseUrl}${topImageUrl}`;
        console.log(`🔍 Downloading top image from: ${fullTopImageUrl}`);
        finalTopImageBuffer = await this.downloadImage(fullTopImageUrl);
        console.log('✅ Top image downloaded');
      }
      
      if (bottomImageBuffer) {
        console.log('🔍 Using provided bottom image buffer (cropped from grid)');
        finalBottomImageBuffer = bottomImageBuffer;
      } else {
        // Convert relative URLs to full URLs that the server can access
        const baseUrl = 'http://localhost:4000';
        const fullBottomImageUrl = bottomImageUrl.startsWith('http') ? bottomImageUrl : `${baseUrl}${bottomImageUrl}`;
        console.log(`🔍 Downloading bottom image from: ${fullBottomImageUrl}`);
        finalBottomImageBuffer = await this.downloadImage(fullBottomImageUrl);
        console.log('✅ Bottom image downloaded');
      }

      // Convert WebP to JPEG for Canvas compatibility
      console.log('🔍 Converting top image from WebP to JPEG...');
      const topImageJpeg = await sharp(finalTopImageBuffer)
        .jpeg({ quality: 90 })
        .toBuffer();
      console.log('✅ Top image converted');
      
      console.log('🔍 Converting bottom image from WebP to JPEG...');
      const bottomImageJpeg = await sharp(finalBottomImageBuffer)
        .jpeg({ quality: 90 })
        .toBuffer();
      console.log('✅ Bottom image converted');

      // Load converted images into Canvas
      console.log('🔍 Loading top image into Canvas...');
      const topImage = await loadImage(topImageJpeg);
      console.log('✅ Top image loaded');
      
      console.log('🔍 Loading bottom image into Canvas...');
      const bottomImage = await loadImage(bottomImageJpeg);
      console.log('✅ Bottom image loaded');

      // Draw top image
      ctx.drawImage(topImage, 0, 0, this.canvasWidth, this.topImageHeight);
      
      // Draw bottom image
      ctx.drawImage(bottomImage, 0, this.canvasHeight - this.bottomImageHeight, this.canvasWidth, this.bottomImageHeight);

      // Extract color from top image buffer
      const dominantColor = await this.extractDominantColor(finalTopImageBuffer);
      
      // Add decorative elements based on variation
      this.addCanvasDecorations(ctx, this.canvasWidth, this.canvasHeight, variation, dominantColor);

      // Add text overlay
      const textOverlayBuffer = await this.createCanvasTextOverlay(text, this.canvasWidth, this.textBoxHeight, dominantColor, variation);
      const textOverlayImg = new Image();
      textOverlayImg.src = textOverlayBuffer;
      ctx.drawImage(textOverlayImg, 0, this.topImageHeight, this.canvasWidth, this.textBoxHeight);

      // Save to file
      console.log('🔍 Creating image buffer...');
      const finalImageBuffer = canvas.toBuffer('image/jpeg', { quality: 0.85 });
      const imageFilename = filename || `pinterest_${keyword.replace(/\s+/g, '_')}_${uuidv4().slice(0, 8)}.jpg`;
      const imagePath = path.join(this.outputDir, imageFilename);
      
      console.log(`🔍 Saving image to: ${imagePath}`);
      await fs.promises.writeFile(imagePath, finalImageBuffer);
      console.log('✅ Image saved successfully');
      
      // Return relative URL for web access
      const relativeUrl = `/images/pinterest/${imageFilename}`;
      
      console.log('✅ Pinterest image generated successfully!');
      console.log(`📁 Saved to: ${imagePath}`);
      console.log(`🌐 URL: ${relativeUrl}`);

      // Return expected structure for server.js
      return {
        success: true,
        imagePath,
        imageUrl: relativeUrl,
        filename: imageFilename,
        dimensions: {
          width: this.canvasWidth,
          height: this.canvasHeight
        },
        metadata: {
          text: text,
          topImageUrl: topImageUrl,
          bottomImageUrl: bottomImageUrl,
          variation: variation,
          dominantColor: dominantColor
        }
      };

    } catch (error) {
      console.error('❌ Pinterest image generation failed:', error.message);
      throw new Error(`Pinterest image generation failed: ${error.message}`);
    }
  }

  /**
   * Crop a Midjourney 4-panel grid into individual images
   * Returns top and bottom images for Pinterest use
   */
  async cropGridToIndividualImages(gridBuffer) {
    try {
      // Get grid dimensions
      const gridImage = sharp(gridBuffer);
      const { width, height } = await gridImage.metadata();
      
      console.log(`🔍 Grid dimensions: ${width}x${height}`);
      
      // Midjourney grids are usually 2x2, so each quadrant is width/2 x height/2
      const quadrantWidth = Math.floor(width / 2);
      const quadrantHeight = Math.floor(height / 2);
      
      console.log(`🔍 Quadrant size: ${quadrantWidth}x${quadrantHeight}`);
      
      // Extract top-left image (position 0,0)
      const topImage = await sharp(gridBuffer)
        .extract({
          left: 0,
          top: 0,
          width: quadrantWidth,
          height: quadrantHeight
        })
        .toBuffer();
      
      // Extract bottom-right image (position width/2, height/2)  
      const bottomImage = await sharp(gridBuffer)
        .extract({
          left: quadrantWidth,
          top: quadrantHeight,
          width: quadrantWidth,
          height: quadrantHeight
        })
        .toBuffer();
      
      console.log(`✅ Successfully cropped grid into individual images`);
      
      return { topImage, bottomImage };
      
    } catch (error) {
      console.error('❌ Grid cropping failed:', error.message);
      throw new Error(`Failed to crop grid image: ${error.message}`);
    }
  }

  /**
   * Batch generate Pinterest images for multiple recipes
   */
  async batchGenerate(recipes, options = {}) {
    const { maxConcurrent = 3, onProgress = null } = options;
    const results = [];
    
    console.log(`🚀 Starting batch Pinterest image generation for ${recipes.length} recipes...`);
    
    for (let i = 0; i < recipes.length; i += maxConcurrent) {
      const batch = recipes.slice(i, i + maxConcurrent);
      
      const batchPromises = batch.map(async (recipe) => {
        try {
          const result = await this.generateFromRecipe(recipe);
          if (onProgress) onProgress(i + batch.indexOf(recipe) + 1, recipes.length, result);
          return { recipe, result, success: true };
        } catch (error) {
          console.error(`❌ Failed to generate Pinterest image for recipe "${recipe.keyword}":`, error.message);
          if (onProgress) onProgress(i + batch.indexOf(recipe) + 1, recipes.length, null);
          return { recipe, error: error.message, success: false };
        }
      });
      
      const batchResults = await Promise.allSettled(batchPromises);
      results.push(...batchResults.map(r => r.value || r.reason));
    }
    
    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);
    
    console.log(`✅ Batch generation complete: ${successful.length} successful, ${failed.length} failed`);
    
    return {
      total: recipes.length,
      successful: successful.length,
      failed: failed.length,
      results
    };
  }

  /**
   * Draw a star shape
   */
  drawStar(ctx, x, y, points, outerRadius, innerRadius) {
    ctx.save();
    ctx.beginPath();
    ctx.translate(x, y);
    ctx.moveTo(0, 0 - outerRadius);

    for (let i = 0; i < points; i++) {
      ctx.rotate(Math.PI / points);
      ctx.lineTo(0, 0 - innerRadius);
      ctx.rotate(Math.PI / points);
      ctx.lineTo(0, 0 - outerRadius);
    }

    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  /**
   * Draw a rounded rectangle
   */
  roundRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }
}

module.exports = PinterestImageGenerator;
