# exact_pinterest_replica.py
# Creates EXACT replica of your Pinterest template
# pip install Pillow

from PIL import Image, ImageDraw, ImageFont
import os

# smart_color_pinterest_replica.py
# Creates Pinterest templates with automatic color detection
# pip install Pillow numpy

from PIL import Image, ImageDraw, ImageFont
import numpy as np
import os
from collections import Counter

class SmartColorPinterestGenerator:
    def __init__(self):
        # Pinterest dimensions
        self.canvas_width = 735
        self.canvas_height = 1102
        
        # Template measurements (recipe style only)
        self.top_image_height = 400
        self.banner_height = 120
        self.bottom_image_height = self.canvas_height - self.top_image_height - self.banner_height
        
        # Default colors
        self.default_color = '#FF9800'  # Orange fallback
        self.text_color = '#FFFFFF'
    
    def detect_dominant_color(self, image: Image.Image) -> str:
        """
        Detect the dominant vibrant color from the image for banner
        
        Args:
            image: PIL Image object
            
        Returns:
            Hex color string
        """
        try:
            # Resize image for faster processing
            small_img = image.resize((100, 100), Image.Resampling.LANCZOS)
            
            # Convert to numpy array
            img_array = np.array(small_img)
            
            # Reshape to list of pixels
            pixels = img_array.reshape(-1, 3)
            
            # Remove very light pixels (whites/grays)
            mask = ~((pixels[:, 0] > 240) & (pixels[:, 1] > 240) & (pixels[:, 2] > 240))
            filtered_pixels = pixels[mask]
            
            if len(filtered_pixels) == 0:
                return self.default_color
            
            # Group similar colors (reduce precision for clustering)
            grouped_pixels = (filtered_pixels // 32) * 32
            
            # Count color frequencies
            unique_colors, counts = np.unique(grouped_pixels, axis=0, return_counts=True)
            
            # Find most vibrant colors
            best_color = None
            best_score = 0
            
            for i, (color, count) in enumerate(zip(unique_colors, counts)):
                r, g, b = color
                
                # Calculate color vibrancy (saturation)
                max_val = max(r, g, b)
                min_val = min(r, g, b)
                saturation = 0 if max_val == 0 else (max_val - min_val) / max_val
                
                # Calculate brightness
                brightness = (r * 299 + g * 587 + b * 114) / 1000
                
                # Score based on frequency, saturation, and brightness
                vibrancy_score = saturation * 0.6 + (brightness / 255) * 0.2 + (count / len(filtered_pixels)) * 0.2
                
                # Prefer colors that aren't too dark or too bright
                if 80 < brightness < 200 and saturation > 0.2 and vibrancy_score > best_score:
                    best_score = vibrancy_score
                    best_color = color
            
            if best_color is not None:
                r, g, b = best_color
                
                # Enhance the color slightly for banner use
                enhancement_factor = 1.2
                r = min(255, int(r * enhancement_factor))
                g = min(255, int(g * enhancement_factor))
                b = min(255, int(b * enhancement_factor))
                
                # Ensure minimum brightness for visibility
                brightness = (r * 299 + g * 587 + b * 114) / 1000
                if brightness < 120:
                    boost = 120 / brightness
                    r = min(255, int(r * boost))
                    g = min(255, int(g * boost))
                    b = min(255, int(b * boost))
                
                hex_color = f"#{r:02x}{g:02x}{b:02x}"
                return hex_color.upper()
            
        except Exception as e:
            print(f"⚠️  Color detection failed: {e}")
        
        return self.default_color
    
    def load_font(self, size: int) -> ImageFont.FreeTypeFont:
        """Load bold font with fallbacks"""
        font_paths = [
            # Windows
            "C:/Windows/Fonts/arialbd.ttf",
            "C:/Windows/Fonts/arial.ttf",
            # Mac
            "/System/Library/Fonts/Arial Bold.ttf",
            "/System/Library/Fonts/Arial.ttf",
            # Linux
            "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        ]
        
        for font_path in font_paths:
            try:
                if os.path.exists(font_path):
                    return ImageFont.truetype(font_path, size)
            except:
                continue
        
        return ImageFont.load_default()
    
    def create_color_matched_template(self, source_image_path: str, title: str, use_auto_color: bool = True, manual_color: str = None) -> tuple[Image.Image, str]:
        """
        Create Pinterest template with smart color detection
        
        Args:
            source_image_path: Path to source image (single or grid)
            title: Title text for banner
            use_auto_color: Whether to auto-detect color or use manual
            manual_color: Manual color if not using auto-detection
            
        Returns:
            Tuple of (generated_image, detected_color)
        """
        
        # Open source image
        source_img = Image.open(source_image_path).convert('RGB')
        
        # Detect color
        if use_auto_color:
            detected_color = self.detect_dominant_color(source_img)
            print(f"🎨 Color detected from image: {detected_color}")
        else:
            detected_color = manual_color or self.default_color
            print(f"🎨 Using manual color: {detected_color}")
        
        # Create canvas
        canvas = Image.new('RGB', (self.canvas_width, self.canvas_height), 'white')
        
        # Check if image is a grid
        aspect_ratio = source_img.width / source_img.height
        is_grid = 0.8 <= aspect_ratio <= 1.25
        
        if is_grid:
            # GRID MODE: Extract different quadrants
            grid_width = source_img.width // 2
            grid_height = source_img.height // 2
            
            # Extract top-left quadrant for TOP section
            top_image = source_img.crop((0, 0, grid_width, grid_height))
            
            # Extract bottom-right quadrant for BOTTOM section
            bottom_image = source_img.crop((grid_width, grid_height, 
                                          source_img.width, source_img.height))
            
            print(f"🔲 Grid detected! Using different images for visual variety")
            
        else:
            # SINGLE IMAGE MODE
            top_image = source_img
            bottom_image = source_img
            print(f"📸 Single image mode")
        
        # Process TOP section
        top_aspect = top_image.width / top_image.height
        top_scaled_width = self.canvas_width
        top_scaled_height = int(top_scaled_width / top_aspect)
        
        top_resized = top_image.resize((top_scaled_width, top_scaled_height), Image.Resampling.LANCZOS)
        
        if top_scaled_height >= self.top_image_height:
            crop_start = (top_scaled_height - self.top_image_height) // 2
            top_final = top_resized.crop((0, crop_start, top_scaled_width, 
                                        crop_start + self.top_image_height))
        else:
            top_section = Image.new('RGB', (self.canvas_width, self.top_image_height), 'white')
            paste_y = (self.top_image_height - top_scaled_height) // 2
            top_section.paste(top_resized, (0, paste_y))
            top_final = top_section
        
        canvas.paste(top_final, (0, 0))
        
        # Process BOTTOM section
        bottom_aspect = bottom_image.width / bottom_image.height
        bottom_scaled_width = self.canvas_width
        bottom_scaled_height = int(bottom_scaled_width / bottom_aspect)
        
        bottom_resized = bottom_image.resize((bottom_scaled_width, bottom_scaled_height), 
                                           Image.Resampling.LANCZOS)
        
        bottom_y = self.top_image_height + self.banner_height
        
        if bottom_scaled_height >= self.bottom_image_height:
            crop_start = (bottom_scaled_height - self.bottom_image_height) // 2
            bottom_final = bottom_resized.crop((0, crop_start, bottom_scaled_width,
                                              crop_start + self.bottom_image_height))
        else:
            bottom_section = Image.new('RGB', (self.canvas_width, self.bottom_image_height), 'white')
            paste_y = (self.bottom_image_height - bottom_scaled_height) // 2
            bottom_section.paste(bottom_resized, (0, paste_y))
            bottom_final = bottom_section
        
        canvas.paste(bottom_final, (0, bottom_y))
        
        # CREATE COLOR-MATCHED BANNER
        draw = ImageDraw.Draw(canvas)
        
        # Draw banner background with detected color
        banner_y = self.top_image_height
        draw.rectangle([0, banner_y, self.canvas_width, banner_y + self.banner_height], 
                      fill=detected_color)
        
        # ADD DOTTED BORDER DECORATIONS
        dot_size = 4
        dot_spacing = 12
        margin = 20
        
        # Top dotted line
        for x in range(margin, self.canvas_width - margin, dot_spacing):
            draw.rectangle([x, banner_y + 15, x + dot_size, banner_y + 15 + dot_size], 
                          fill='white')
        
        # Bottom dotted line
        for x in range(margin, self.canvas_width - margin, dot_spacing):
            draw.rectangle([x, banner_y + self.banner_height - 19, 
                          x + dot_size, banner_y + self.banner_height - 15], 
                          fill='white')
        
        # ADD TEXT WITH ENHANCED READABILITY
        font_size = 38
        font = self.load_font(font_size)
        
        # Split text into lines
        words = title.upper().split()
        max_width = self.canvas_width - 80
        lines = []
        current_line = ''
        
        for word in words:
            test_line = current_line + (' ' if current_line else '') + word
            bbox = draw.textbbox((0, 0), test_line, font=font)
            text_width = bbox[2] - bbox[0]
            
            if text_width > max_width and current_line:
                lines.append(current_line)
                current_line = word
            else:
                current_line = test_line
        
        if current_line:
            lines.append(current_line)
        
        # Calculate text positioning
        line_height = 42
        total_text_height = len(lines) * line_height
        start_y = banner_y + (self.banner_height - total_text_height) // 2
        
        # Draw text with enhanced shadow for readability
        for i, line in enumerate(lines):
            bbox = draw.textbbox((0, 0), line, font=font)
            text_width = bbox[2] - bbox[0]
            x = (self.canvas_width - text_width) // 2
            y = start_y + (i * line_height)
            
            # Enhanced shadow for better contrast
            draw.text((x + 3, y + 3), line, font=font, fill='rgba(0,0,0,0.5)')
            draw.text((x + 1, y + 1), line, font=font, fill='rgba(0,0,0,0.3)')
            draw.text((x, y), line, font=font, fill=self.text_color)
        
        return canvas, detected_color
    
    def save_template(self, image: Image.Image, output_path: str):
        """Save the template"""
        image.save(output_path, 'PNG', optimize=True)
        print(f"✅ Color-matched template saved: {output_path}")

def create_smart_color_template(source_image_path: str, title: str, output_path: str = None, use_auto_color: bool = True, manual_color: str = None):
    """
    Quick function to create color-matched Pinterest template
    
    Args:
        source_image_path: Path to your food/content image  
        title: Title text for banner
        output_path: Where to save (optional)
        use_auto_color: Whether to auto-detect color
        manual_color: Manual color override
    """
    
    if not output_path:
        import time
        output_path = f"smart_pinterest_{int(time.time())}.png"
    
    generator = SmartColorPinterestGenerator()
    template, detected_color = generator.create_color_matched_template(
        source_image_path, title, use_auto_color, manual_color
    )
    generator.save_template(template, output_path)
    
    return output_path, detected_color

# EXAMPLE USAGE
if __name__ == "__main__":
    import time
    
    generator = SmartColorPinterestGenerator()
    
    # Test with color detection
    template, detected_color = generator.create_color_matched_template(
        source_image_path="your_food_image.jpg",  # Replace with actual path
        title="EASY RECIPES FOR HEALTHY EATING TONIGHT",
        use_auto_color=True
    )
    
    output_file = f"smart_color_pinterest_{int(time.time())}.png"
    generator.save_template(template, output_file)
    
    print("🎨 SMART COLOR TEMPLATE CREATED!")
    print(f"📁 Saved as: {output_file}")
    print(f"🌈 Detected color: {detected_color}")
    print("📐 Dimensions: 735x1102px (Pinterest optimized)")
    print("🎯 Style: Recipe template with auto-matched colors")

# Integration function for automation workflow
def generate_color_matched_pinterest_template(image_path: str, title: str, output_dir: str = "generated_pins") -> tuple[str, str]:
    """
    Generate color-matched Pinterest template for automation
    
    Returns:
        Tuple of (output_path, detected_color)
    """
    import time
    import os
    
    os.makedirs(output_dir, exist_ok=True)
    
    # Create safe filename
    safe_title = "".join(c for c in title if c.isalnum() or c in (' ', '-', '_')).rstrip()[:30]
    safe_title = safe_title.replace(' ', '_')
    output_filename = f"pinterest_{safe_title}_{int(time.time())}.png"
    output_path = os.path.join(output_dir, output_filename)
    
    # Generate template with color detection
    generator = SmartColorPinterestGenerator()
    template, detected_color = generator.create_color_matched_template(image_path, title)
    generator.save_template(template, output_path)
    
    return output_path, detected_color
    
    def load_font(self, size: int) -> ImageFont.FreeTypeFont:
        """Load bold font with fallbacks"""
        font_paths = [
            # Windows
            "C:/Windows/Fonts/arialbd.ttf",
            "C:/Windows/Fonts/arial.ttf",
            # Mac
            "/System/Library/Fonts/Arial Bold.ttf",
            "/System/Library/Fonts/Arial.ttf",
            # Linux
            "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        ]
        
        for font_path in font_paths:
            try:
                if os.path.exists(font_path):
                    return ImageFont.truetype(font_path, size)
            except:
                continue
        
        return ImageFont.load_default()
    
    def create_exact_replica(self, source_image_path: str, title: str) -> Image.Image:
        """
        Create EXACT replica of your Pinterest template with grid support
        
        Args:
            source_image_path: Path to your image (single or 4-image grid)
            title: Text for the orange banner
        """
        
        # Open source image
        source_img = Image.open(source_image_path).convert('RGB')
        
        # Create canvas
        canvas = Image.new('RGB', (self.canvas_width, self.canvas_height), 'white')
        
        # Check if image is a grid (roughly square aspect ratio indicates 2x2 grid)
        aspect_ratio = source_img.width / source_img.height
        is_grid = 0.8 <= aspect_ratio <= 1.25  # Square-ish indicates grid
        
        if is_grid:
            # GRID MODE: Extract different quadrants
            grid_width = source_img.width // 2
            grid_height = source_img.height // 2
            
            # Extract top-left quadrant for TOP section
            top_image = source_img.crop((0, 0, grid_width, grid_height))
            
            # Extract bottom-right quadrant for BOTTOM section
            bottom_image = source_img.crop((grid_width, grid_height, 
                                          source_img.width, source_img.height))
            
            print(f"🔲 Grid detected! Using different images for variety")
            print(f"   📸 Top section: Top-left quadrant")
            print(f"   📸 Bottom section: Bottom-right quadrant")
            
        else:
            # SINGLE IMAGE MODE: Use same image for both sections
            top_image = source_img
            bottom_image = source_img
            print(f"📸 Single image mode: Using same image for both sections")
        
        # Process TOP section
        top_aspect = top_image.width / top_image.height
        top_scaled_width = self.canvas_width
        top_scaled_height = int(top_scaled_width / top_aspect)
        
        top_resized = top_image.resize((top_scaled_width, top_scaled_height), Image.Resampling.LANCZOS)
        
        if top_scaled_height >= self.top_image_height:
            # Crop from center
            crop_start = (top_scaled_height - self.top_image_height) // 2
            top_final = top_resized.crop((0, crop_start, top_scaled_width, 
                                        crop_start + self.top_image_height))
        else:
            # Center in available space
            top_section = Image.new('RGB', (self.canvas_width, self.top_image_height), 'white')
            paste_y = (self.top_image_height - top_scaled_height) // 2
            top_section.paste(top_resized, (0, paste_y))
            top_final = top_section
        
        canvas.paste(top_final, (0, 0))
        
        # Process BOTTOM section
        bottom_aspect = bottom_image.width / bottom_image.height
        bottom_scaled_width = self.canvas_width
        bottom_scaled_height = int(bottom_scaled_width / bottom_aspect)
        
        bottom_resized = bottom_image.resize((bottom_scaled_width, bottom_scaled_height), 
                                           Image.Resampling.LANCZOS)
        
        bottom_y = self.top_image_height + self.banner_height
        
        if bottom_scaled_height >= self.bottom_image_height:
            # Crop from center
            crop_start = (bottom_scaled_height - self.bottom_image_height) // 2
            bottom_final = bottom_resized.crop((0, crop_start, bottom_scaled_width,
                                              crop_start + self.bottom_image_height))
        else:
            # Center in available space
            bottom_section = Image.new('RGB', (self.canvas_width, self.bottom_image_height), 'white')
            paste_y = (self.bottom_image_height - bottom_scaled_height) // 2
            bottom_section.paste(bottom_resized, (0, paste_y))
            bottom_final = bottom_section
        
        canvas.paste(bottom_final, (0, bottom_y))
        
        # CREATE ORANGE BANNER SECTION
        draw = ImageDraw.Draw(canvas)
        
        # Draw orange banner background
        banner_y = self.top_image_height
        draw.rectangle([0, banner_y, self.canvas_width, banner_y + self.banner_height], 
                      fill=self.orange_color)
        
        # ADD DOTTED BORDER DECORATIONS
        dot_size = 4
        dot_spacing = 12
        margin = 20
        
        # Top dotted line
        for x in range(margin, self.canvas_width - margin, dot_spacing):
            draw.rectangle([x, banner_y + 15, x + dot_size, banner_y + 15 + dot_size], 
                          fill='white')
        
        # Bottom dotted line
        for x in range(margin, self.canvas_width - margin, dot_spacing):
            draw.rectangle([x, banner_y + self.banner_height - 19, 
                          x + dot_size, banner_y + self.banner_height - 15], 
                          fill='white')
        
        # ADD TEXT
        font_size = 38
        font = self.load_font(font_size)
        
        # Split text into lines that fit
        words = title.upper().split()
        max_width = self.canvas_width - 80
        lines = []
        current_line = ''
        
        for word in words:
            test_line = current_line + (' ' if current_line else '') + word
            bbox = draw.textbbox((0, 0), test_line, font=font)
            text_width = bbox[2] - bbox[0]
            
            if text_width > max_width and current_line:
                lines.append(current_line)
                current_line = word
            else:
                current_line = test_line
        
        if current_line:
            lines.append(current_line)
        
        # Calculate vertical centering
        line_height = 42
        total_text_height = len(lines) * line_height
        start_y = banner_y + (self.banner_height - total_text_height) // 2
        
        # Draw each line centered with shadow
        for i, line in enumerate(lines):
            bbox = draw.textbbox((0, 0), line, font=font)
            text_width = bbox[2] - bbox[0]
            x = (self.canvas_width - text_width) // 2
            y = start_y + (i * line_height)
            
            # Shadow effect
            draw.text((x + 2, y + 2), line, font=font, fill='rgba(0,0,0,0.3)')
            draw.text((x, y), line, font=font, fill=self.text_color)
        
        return canvas
    
    def save_template(self, image: Image.Image, output_path: str):
        """Save the template"""
        image.save(output_path, 'PNG', optimize=True)
        print(f"✅ Exact replica saved: {output_path}")

def create_your_exact_template(source_image_path: str, title: str, output_path: str = None):
    """
    Quick function to create your exact Pinterest template
    
    Args:
        source_image_path: Path to your food/content image  
        title: Title text for orange banner
        output_path: Where to save (optional)
    """
    
    if not output_path:
        output_path = f"pinterest_replica_{int(time.time())}.png"
    
    generator = ExactPinterestReplica()
    template = generator.create_exact_replica(source_image_path, title)
    generator.save_template(template, output_path)
    
    return output_path

# EXAMPLE USAGE
if __name__ == "__main__":
    import time
    
    # Test with your example
    generator = ExactPinterestReplica()
    
    # Replace with your actual image path
    template = generator.create_exact_replica(
        source_image_path="your_grilled_chicken.jpg",  # Your food photo
        title="EASY RECIPES FOR HEALTHY EATING TONIGHT"
    )
    
    output_file = f"exact_pinterest_replica_{int(time.time())}.png"
    generator.save_template(template, output_file)
    
    print("🎨 EXACT REPLICA CREATED!")
    print(f"📁 Saved as: {output_file}")
    print("📐 Dimensions: 735x1102px (Pinterest optimized)")
    print("🎯 Layout: Food image + Orange banner + Food image")
    print("✨ Styling: Exact match to your reference image")

# Integration function for your automation script
def generate_exact_pinterest_template(image_path: str, title: str, output_dir: str = "generated_pins") -> str:
    """
    Generate exact Pinterest template for automation workflow
    """
    import time
    import os
    
    os.makedirs(output_dir, exist_ok=True)
    
    # Create safe filename
    safe_title = "".join(c for c in title if c.isalnum() or c in (' ', '-', '_')).rstrip()[:30]
    safe_title = safe_title.replace(' ', '_')
    output_filename = f"pinterest_{safe_title}_{int(time.time())}.png"
    output_path = os.path.join(output_dir, output_filename)
    
    # Generate template
    generator = ExactPinterestReplica()
    template = generator.create_exact_replica(image_path, title)
    generator.save_template(template, output_path)
    
    return output_path