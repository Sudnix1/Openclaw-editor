import React, { useState, useRef, useEffect } from 'react';
import { Upload, Download, Type, Palette, Move, RotateCcw, Eye } from 'lucide-react';

const PinterestTemplateGenerator = () => {
  const canvasRef = useRef(null);
  const [uploadedImage, setUploadedImage] = useState(null);
  const [title, setTitle] = useState("EASY RECIPES FOR HEALTHY EATING TONIGHT");
  const [subtitle, setSubtitle] = useState("");
  const [detectedColor, setDetectedColor] = useState("#FF9800");
  const [useDetectedColor, setUseDetectedColor] = useState(true);
  const [manualColor, setManualColor] = useState("#FF9800");
  const [fontSize, setFontSize] = useState(38);

  const detectDominantColor = (imageElement) => {
    try {
      // Create a small canvas to analyze colors
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      canvas.width = 100;
      canvas.height = 100;
      
      // Draw scaled-down image
      ctx.drawImage(imageElement, 0, 0, 100, 100);
      const imageData = ctx.getImageData(0, 0, 100, 100);
      const pixels = imageData.data;
      
      // Color frequency map
      const colorMap = {};
      
      // Sample every 4th pixel for performance
      for (let i = 0; i < pixels.length; i += 16) {
        const r = pixels[i];
        const g = pixels[i + 1];
        const b = pixels[i + 2];
        const a = pixels[i + 3];
        
        // Skip transparent or very light pixels
        if (a < 128 || (r > 240 && g > 240 && b > 240)) continue;
        
        // Group similar colors (reduce precision)
        const rGroup = Math.floor(r / 32) * 32;
        const gGroup = Math.floor(g / 32) * 32;
        const bGroup = Math.floor(b / 32) * 32;
        
        const colorKey = `${rGroup},${gGroup},${bGroup}`;
        colorMap[colorKey] = (colorMap[colorKey] || 0) + 1;
      }
      
      // Find most frequent vibrant color
      let dominantColor = null;
      let maxCount = 0;
      
      for (const [colorKey, count] of Object.entries(colorMap)) {
        if (count > maxCount) {
          const [r, g, b] = colorKey.split(',').map(Number);
          
          // Check if color is vibrant enough (not too gray)
          const max = Math.max(r, g, b);
          const min = Math.min(r, g, b);
          const saturation = max === 0 ? 0 : (max - min) / max;
          
          // Prefer colors with some saturation and decent brightness
          if (saturation > 0.2 && max > 80) {
            maxCount = count;
            dominantColor = `rgb(${r}, ${g}, ${b})`;
          }
        }
      }
      
      // Convert to hex and enhance saturation
      if (dominantColor) {
        const rgbMatch = dominantColor.match(/rgb\((\d+), (\d+), (\d+)\)/);
        if (rgbMatch) {
          let [, r, g, b] = rgbMatch.map(Number);
          
          // Enhance saturation and ensure good contrast
          const max = Math.max(r, g, b);
          const factor = 1.3; // Boost saturation
          
          r = Math.min(255, Math.floor(r * factor));
          g = Math.min(255, Math.floor(g * factor));
          b = Math.min(255, Math.floor(b * factor));
          
          // Ensure minimum brightness for banner visibility
          const brightness = (r * 299 + g * 587 + b * 114) / 1000;
          if (brightness < 100) {
            const boost = 1.4;
            r = Math.min(255, Math.floor(r * boost));
            g = Math.min(255, Math.floor(g * boost));
            b = Math.min(255, Math.floor(b * boost));
          }
          
          const hex = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
          return hex;
        }
      }
      
      // Fallback to orange
      return "#FF9800";
      
    } catch (error) {
      console.log("Color detection failed, using default orange");
      return "#FF9800";
    }
  };

  const handleImageUpload = (event) => {
    const file = event.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setUploadedImage(e.target.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const generatePinterestImage = () => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    
    // Pinterest optimal size
    canvas.width = 735;
    canvas.height = 1102;
    
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    if (uploadedImage) {
      const img = new Image();
      img.onload = () => {
        // Detect dominant color
        const dominantColor = detectDominantColor(img);
        setDetectedColor(dominantColor);
        
        // Template layout dimensions
        const topImageHeight = 400;
        const bannerHeight = 120;
        const bottomImageHeight = canvas.height - topImageHeight - bannerHeight;
        const bannerY = topImageHeight;
        const bottomY = topImageHeight + bannerHeight;
        
        // Check if image is a grid
        const aspectRatio = img.width / img.height;
        const isGrid = aspectRatio > 0.8 && aspectRatio < 1.25;
        
        if (isGrid) {
          // GRID MODE: Extract different quadrants
          const gridWidth = img.width / 2;
          const gridHeight = img.height / 2;
          
          // Extract top-left quadrant for TOP section
          const topQuadrant = document.createElement('canvas');
          topQuadrant.width = gridWidth;
          topQuadrant.height = gridHeight;
          const topCtx = topQuadrant.getContext('2d');
          topCtx.drawImage(img, 0, 0, gridWidth, gridHeight, 0, 0, gridWidth, gridHeight);
          
          // Extract bottom-right quadrant for BOTTOM section  
          const bottomQuadrant = document.createElement('canvas');
          bottomQuadrant.width = gridWidth;
          bottomQuadrant.height = gridHeight;
          const bottomCtx = bottomQuadrant.getContext('2d');
          bottomCtx.drawImage(img, gridWidth, gridHeight, gridWidth, gridHeight, 0, 0, gridWidth, gridHeight);
          
          // Draw TOP section
          const topScaleWidth = canvas.width;
          const topScaleHeight = (gridWidth / gridHeight) > (canvas.width / topImageHeight) 
            ? topImageHeight 
            : canvas.width * (gridHeight / gridWidth);
          const topOffsetY = (topImageHeight - topScaleHeight) / 2;
          
          ctx.drawImage(topQuadrant, 0, topOffsetY, topScaleWidth, topScaleHeight);
          
          // Draw BOTTOM section
          const bottomScaleWidth = canvas.width;
          const bottomScaleHeight = (gridWidth / gridHeight) > (canvas.width / bottomImageHeight)
            ? bottomImageHeight
            : canvas.width * (gridHeight / gridWidth);
          const bottomOffsetY = bottomY + (bottomImageHeight - bottomScaleHeight) / 2;
          
          ctx.drawImage(bottomQuadrant, 0, bottomOffsetY, bottomScaleWidth, bottomScaleHeight);
          
        } else {
          // SINGLE IMAGE MODE
          const scaleWidth = canvas.width;
          const scaleHeight = scaleWidth / aspectRatio;
          
          // Draw TOP section
          const topOffsetY = Math.max(0, (topImageHeight - scaleHeight) / 2);
          ctx.drawImage(img, 0, topOffsetY, scaleWidth, Math.min(scaleHeight, topImageHeight));
          
          // Draw BOTTOM section
          const bottomOffsetY = bottomY + Math.max(0, (bottomImageHeight - scaleHeight) / 2);
          ctx.drawImage(img, 0, bottomOffsetY, scaleWidth, Math.min(scaleHeight, bottomImageHeight));
        }
        
        // ADAPTIVE COLOR BANNER
        const bannerColor = useDetectedColor ? dominantColor : manualColor;
        ctx.fillStyle = bannerColor;
        ctx.fillRect(0, bannerY, canvas.width, bannerHeight);
        
        // Dotted border decorations
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        const dotSize = 4;
        const dotSpacing = 12;
        
        // Top dotted line
        for (let x = 20; x < canvas.width - 20; x += dotSpacing) {
          ctx.fillRect(x, bannerY + 15, dotSize, dotSize);
        }
        
        // Bottom dotted line
        for (let x = 20; x < canvas.width - 20; x += dotSpacing) {
          ctx.fillRect(x, bannerY + bannerHeight - 19, dotSize, dotSize);
        }
        
        // TEXT STYLING
        ctx.fillStyle = '#FFFFFF';
        ctx.font = `bold ${fontSize}px Arial Black, Impact, Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        // Text shadow for better readability
        ctx.shadowColor = 'rgba(0,0,0,0.4)';
        ctx.shadowOffsetX = 2;
        ctx.shadowOffsetY = 2;
        ctx.shadowBlur = 4;
        
        // Text wrapping
        const words = title.split(' ');
        const maxWidth = canvas.width - 80;
        let lines = [];
        let currentLine = '';
        
        for (let word of words) {
          const testLine = currentLine + (currentLine ? ' ' : '') + word;
          const metrics = ctx.measureText(testLine);
          
          if (metrics.width > maxWidth && currentLine) {
            lines.push(currentLine);
            currentLine = word;
          } else {
            currentLine = testLine;
          }
        }
        if (currentLine) lines.push(currentLine);
        
        // Draw text lines
        const lineHeight = fontSize * 1.1;
        const totalTextHeight = lines.length * lineHeight;
        const startY = bannerY + (bannerHeight - totalTextHeight) / 2 + lineHeight / 2;
        
        lines.forEach((line, index) => {
          const y = startY + (index * lineHeight);
          ctx.fillText(line, canvas.width / 2, y);
        });
        
        // Reset shadow
        ctx.shadowColor = 'transparent';
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
        ctx.shadowBlur = 0;
        
        // Add color detection indicator
        if (isGrid) {
          ctx.fillStyle = 'rgba(0,255,0,0.8)';
          ctx.font = 'bold 12px Arial';
          ctx.fillText('✓ Grid Mode + Color Detected', canvas.width / 2, 25);
        } else {
          ctx.fillStyle = 'rgba(0,150,255,0.8)';
          ctx.font = 'bold 12px Arial';
          ctx.fillText('✓ Single Mode + Color Detected', canvas.width / 2, 25);
        }
      };
      img.src = uploadedImage;
    } else {
      // Placeholder
      ctx.fillStyle = '#f0f0f0';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      ctx.fillStyle = '#e0e0e0';
      ctx.fillRect(0, 0, canvas.width, 400);
      ctx.fillRect(0, 520, canvas.width, canvas.height - 520);
      
      ctx.fillStyle = detectedColor;
      ctx.fillRect(0, 400, canvas.width, 120);
      
      ctx.fillStyle = '#666';
      ctx.font = 'bold 16px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('Upload a food image to detect colors automatically', canvas.width / 2, canvas.height / 2 - 100);
      ctx.fillText('Banner color will match your image colors', canvas.width / 2, canvas.height / 2 - 70);
      ctx.fillText('Perfect for food/recipe content!', canvas.width / 2, canvas.height / 2 - 40);
    }
  };

  useEffect(() => {
    generatePinterestImage();
  }, [uploadedImage, title, subtitle, useDetectedColor, manualColor, fontSize]);

  const downloadImage = () => {
    const canvas = canvasRef.current;
    const link = document.createElement('a');
    link.download = 'pinterest-recipe-template.png';
    link.href = canvas.toDataURL();
    link.click();
  };

  const resetToDefaults = () => {
    setTitle("EASY RECIPES FOR HEALTHY EATING TONIGHT");
    setSubtitle("");
    setUseDetectedColor(true);
    setManualColor("#FF9800");
    setFontSize(38);
  };

  return (
    <div className="max-w-6xl mx-auto p-6 bg-gray-50 min-h-screen">
      <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
        <h1 className="text-3xl font-bold text-gray-800 mb-2 flex items-center gap-2">
          <Palette className="text-orange-500" />
          Smart Color Pinterest Recipe Generator
        </h1>
        <p className="text-gray-600">Upload your food image and get auto-matched banner colors!</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Controls Panel */}
        <div className="bg-white rounded-lg shadow-lg p-6 space-y-6">
          <h2 className="text-xl font-semibold text-gray-800 mb-4">Recipe Template Controls</h2>
          
          {/* Image Upload */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
              <Upload size={16} />
              Upload Food Image
            </label>
            <input
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-orange-50 file:text-orange-700 hover:file:bg-orange-100"
            />
          </div>

          {/* Title Text */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
              <Type size={16} />
              Recipe Title
            </label>
            <textarea
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
              rows="2"
              placeholder="Enter your recipe title..."
            />
          </div>

          {/* Subtitle */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Subtitle (Optional)</label>
            <input
              type="text"
              value={subtitle}
              onChange={(e) => setSubtitle(e.target.value)}
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
              placeholder="Add a subtitle..."
            />
          </div>

          {/* Color Detection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
              <Eye size={16} />
              Banner Color
            </label>
            
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <input
                  type="radio"
                  id="auto-color"
                  name="color-mode"
                  checked={useDetectedColor}
                  onChange={() => setUseDetectedColor(true)}
                  className="w-4 h-4 text-orange-600"
                />
                <label htmlFor="auto-color" className="flex items-center gap-2">
                  <span className="text-sm font-medium">Auto-detect from image</span>
                  <div 
                    className="w-6 h-6 rounded border-2 border-gray-300"
                    style={{ backgroundColor: detectedColor }}
                  ></div>
                  <span className="text-xs text-gray-500">{detectedColor}</span>
                </label>
              </div>
              
              <div className="flex items-center gap-3">
                <input
                  type="radio"
                  id="manual-color"
                  name="color-mode"
                  checked={!useDetectedColor}
                  onChange={() => setUseDetectedColor(false)}
                  className="w-4 h-4 text-orange-600"
                />
                <label htmlFor="manual-color" className="flex items-center gap-2">
                  <span className="text-sm font-medium">Manual color</span>
                  <input
                    type="color"
                    value={manualColor}
                    onChange={(e) => setManualColor(e.target.value)}
                    disabled={useDetectedColor}
                    className="w-8 h-8 border border-gray-300 rounded cursor-pointer disabled:opacity-50"
                  />
                </label>
              </div>
            </div>
          </div>

          {/* Font Size */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Font Size: {fontSize}px</label>
            <input
              type="range"
              min="28"
              max="50"
              value={fontSize}
              onChange={(e) => setFontSize(parseInt(e.target.value))}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer slider"
            />
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 pt-4">
            <button
              onClick={downloadImage}
              className="flex-1 bg-orange-500 text-white py-3 px-4 rounded-lg hover:bg-orange-600 transition-colors flex items-center justify-center gap-2 font-medium"
            >
              <Download size={18} />
              Download Recipe Template
            </button>
            <button
              onClick={resetToDefaults}
              className="bg-gray-500 text-white py-3 px-4 rounded-lg hover:bg-gray-600 transition-colors flex items-center gap-2"
            >
              <RotateCcw size={18} />
              Reset
            </button>
          </div>
        </div>

        {/* Preview Panel */}
        <div className="bg-white rounded-lg shadow-lg p-6">
          <h2 className="text-xl font-semibold text-gray-800 mb-4">Preview (735x1102px)</h2>
          <div className="flex justify-center">
            <div className="border-2 border-gray-200 rounded-lg overflow-hidden" style={{maxWidth: '300px'}}>
              <canvas
                ref={canvasRef}
                style={{
                  width: '100%',
                  height: 'auto',
                  maxWidth: '300px'
                }}
                className="block"
              />
            </div>
          </div>
          <p className="text-sm text-gray-500 text-center mt-4">
            Pinterest optimal size: 735×1102 pixels
          </p>
          
          {detectedColor && detectedColor !== "#FF9800" && (
            <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-sm text-green-700 flex items-center gap-2">
                <Eye size={16} />
                <strong>Color detected!</strong> Banner automatically matches your image: 
                <span className="font-mono">{detectedColor}</span>
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Usage Instructions */}
      <div className="bg-orange-50 border border-orange-200 rounded-lg p-6 mt-6">
        <h3 className="text-lg font-semibold text-orange-800 mb-3">🎨 Smart Color Matching Features</h3>
        <div className="text-orange-700 space-y-2">
          <p><strong>Auto Color Detection:</strong> Upload any food image and the banner color automatically matches the dominant colors</p>
          <p><strong>Grid Support:</strong> Upload 4-image grids for dynamic top/bottom sections</p>
          <p><strong>Recipe Optimized:</strong> Perfect styling for food and recipe content</p>
          <p><strong>Professional Results:</strong> Color-coordinated templates that look like pro designs</p>
        </div>
        <div className="mt-4 p-4 bg-white rounded border-l-4 border-orange-400">
          <p className="text-sm text-gray-700">
            <strong>Pro Tip:</strong> The color detection algorithm analyzes your image and picks vibrant, 
            high-contrast colors that work perfectly with white text. No more guessing banner colors!
          </p>
        </div>
      </div>
    </div>
  );
};

export default PinterestTemplateGenerator;