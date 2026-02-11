// Create a new file in your public/js directory called midjourney-grid-viewer.js

/**
 * MidjourneyGridViewer - JS component for viewing and processing Midjourney grid images
 */
class MidjourneyGridViewer {
  constructor(options = {}) {
    // Default options
    this.options = Object.assign({
      containerSelector: '#midjourney-grid-container',
      imageUrl: null,
      recipeId: null,
      prompt: null,
      hasSelectedImage: false, // NEW: Flag to indicate if recipe already has a selected image
      selectedImageUrl: null,  // NEW: URL of the already selected image
      onImageProcessed: null,
      onError: null
    }, options);
    
    // DOM elements
    this.container = document.querySelector(this.options.containerSelector);
    
    // Initialize component if container exists
    if (this.container) {
      this.init();
    } else {
      console.error('MidjourneyGridViewer: Container not found!');
    }

    // Track selected quadrant
    this.selectedQuadrant = null;
  }
  
  /**
   * Initialize the component
   */
  init() {
    // Clear container
    this.container.innerHTML = '';
    this.container.classList.add('midjourney-grid-container');
    
    // Check if recipe already has a selected image
    if (this.options.hasSelectedImage) {
      this.showSelectedImageInterface();
    } else {
      this.showGridSelectionInterface();
    }
  }
  
  /**
   * Show interface for recipes that already have a selected image
   */
  showSelectedImageInterface() {
    // Create selected image container
    const selectedContainer = document.createElement('div');
    selectedContainer.className = 'midjourney-selected-container';
    
    // Show the selected image
    if (this.options.selectedImageUrl) {
      selectedContainer.innerHTML = `
        <div class="selected-image-display">
          <div class="alert alert-success">
            <i class="bi bi-check-circle-fill me-2"></i>
            <strong>Image Already Selected</strong> - This recipe already has a processed image.
          </div>
          <div class="selected-image-wrapper">
            <img src="${this.options.selectedImageUrl}" alt="Selected recipe image" class="selected-recipe-image">
            <div class="selected-image-overlay">
              <div class="selected-badge">
                <i class="bi bi-check-circle-fill"></i> Selected Image
              </div>
            </div>
          </div>
          <div class="selected-image-actions mt-3">
            <button class="btn btn-sm btn-outline-primary regenerate-btn">
              <i class="bi bi-arrow-repeat"></i> Generate New Image
            </button>
            <a href="${this.options.selectedImageUrl}" class="btn btn-sm btn-outline-success" download>
              <i class="bi bi-download"></i> Download Image
            </a>
          </div>
        </div>
      `;
    } else {
      selectedContainer.innerHTML = `
        <div class="alert alert-info">
          <i class="bi bi-info-circle-fill me-2"></i>
          <strong>Image Selected</strong> - This recipe has a processed image, but the image file is not available for preview.
          <button class="btn btn-sm btn-outline-primary ms-2 regenerate-btn">
            <i class="bi bi-arrow-repeat"></i> Generate New Image
          </button>
        </div>
      `;
    }
    
    this.container.appendChild(selectedContainer);
    
    // Add event listener for regenerate button
    const regenerateBtn = selectedContainer.querySelector('.regenerate-btn');
    if (regenerateBtn) {
      regenerateBtn.addEventListener('click', () => {
        this.showRegenerateInterface();
      });
    }
  }
  
  /**
   * Show regenerate interface - allows generating a new image
   */
  showRegenerateInterface() {
    // Clear container and show grid selection interface
    this.container.innerHTML = '';
    
    // Create regenerate message
    const regenerateMessage = document.createElement('div');
    regenerateMessage.className = 'alert alert-warning';
    regenerateMessage.innerHTML = `
      <i class="bi bi-exclamation-triangle-fill me-2"></i>
      <strong>Generate New Image</strong> - Select a quadrant from the image below to replace the current image.
      <button class="btn btn-sm btn-outline-secondary ms-2 cancel-regenerate-btn">
        <i class="bi bi-x"></i> Cancel
      </button>
    `;
    
    this.container.appendChild(regenerateMessage);
    
    // Add cancel event listener
    const cancelBtn = regenerateMessage.querySelector('.cancel-regenerate-btn');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => {
        this.showSelectedImageInterface();
      });
    }
    
    // Show grid selection interface
    this.showGridSelectionInterface(false); // false = don't clear container
  }
  
  /**
   * Show grid selection interface for choosing image quadrants
   */
  showGridSelectionInterface(clearContainer = true) {
    if (clearContainer) {
      // Clear container
      this.container.innerHTML = '';
      this.container.classList.add('midjourney-grid-container');
    }
    
    // Create grid container
    this.gridWrapper = document.createElement('div');
    this.gridWrapper.className = 'midjourney-grid-wrapper';
    this.container.appendChild(this.gridWrapper);
    
    // Create image element
    this.gridImage = document.createElement('img');
    this.gridImage.className = 'midjourney-grid-image';
    this.gridImage.alt = 'Midjourney generated image grid';
    this.gridImage.src = this.options.imageUrl || '';
    this.gridWrapper.appendChild(this.gridImage);
    
    // Create quadrant overlays
    this.createQuadrantOverlays();
    
    // Add status area
    this.statusArea = document.createElement('div');
    this.statusArea.className = 'midjourney-status-area';
    this.container.appendChild(this.statusArea);
    
    // Set initial message
    this.showMessage('Click on any quadrant to process that image');
  }
  
  /**
   * Create quadrant overlays for the grid
   */
  createQuadrantOverlays() {
    // Create overlay container
    this.overlay = document.createElement('div');
    this.overlay.className = 'midjourney-grid-overlay';
    this.gridWrapper.appendChild(this.overlay);
    
    // Create quadrants
    for (let i = 0; i < 4; i++) {
      const quadrant = document.createElement('div');
      quadrant.className = 'midjourney-grid-quadrant';
      quadrant.dataset.index = i;
      
      // Add instruction text
      const instruction = document.createElement('div');
      instruction.className = 'quadrant-instruction';
      instruction.textContent = `Click to use image ${i + 1}`;
      quadrant.appendChild(instruction);
      
      // Add click handler
      quadrant.addEventListener('click', (e) => this.handleQuadrantClick(i, e));
      
      this.overlay.appendChild(quadrant);
    }
  }
  
  /**
   * Handle click on a quadrant
   * @param {number} index - Quadrant index (0-3)
   * @param {Event} event - Click event
   */
  handleQuadrantClick(index, event) {
    event.preventDefault();
    
    // Validate required options
    if (!this.options.imageUrl) {
      this.showError('Image URL is required');
      return;
    }
    
    if (!this.options.recipeId) {
      this.showError('Recipe ID is required');
      return;
    }
    
    // Show processing status
    this.showProcessing(`Processing image ${index + 1}...`);
    
    // Send request to server
    this.processGridImage(index);
  }
  
  /**
   * Process the selected grid image
   * @param {number} quadrantIndex - Index of the quadrant (0-3)
   */
  async processGridImage(quadrantIndex) {
    try {
      const response = await fetch('/midjourney/api/process-grid-image', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          imageUrl: this.options.imageUrl,
          quadrantIndex: quadrantIndex,
          recipeId: this.options.recipeId,
          prompt: this.options.prompt
        })
      });
      
      const result = await response.json();
      
      if (result.success) {
        this.showSuccess(`Image ${quadrantIndex + 1} processed successfully!`);
        
        // Mark this quadrant as selected and hide all instructions
        this.markQuadrantAsSelected(quadrantIndex);
        
        // Update component state to show selected image interface
        this.options.hasSelectedImage = true;
        this.options.selectedImageUrl = `/recipe_images/${result.imagePath}`;
        
        // After a short delay, switch to selected image interface
        setTimeout(() => {
          this.showSelectedImageInterface();
        }, 3000);
        
        // Call success callback if provided
        if (typeof this.options.onImageProcessed === 'function') {
          this.options.onImageProcessed(result);
        }
      } else {
        this.showError(`Error: ${result.message || 'Failed to process image'}`);
        
        // Call error callback if provided
        if (typeof this.options.onError === 'function') {
          this.options.onError(result);
        }
      }
    } catch (error) {
      console.error('Error processing grid image:', error);
      this.showError(`Error: ${error.message || 'Failed to process image'}`);
      
      // Call error callback if provided
      if (typeof this.options.onError === 'function') {
        this.options.onError({ error: error.message });
      }
    }
  }
  
  /**
   * Mark a quadrant as selected and hide all quadrant instructions
   * @param {number} index - Index of the selected quadrant
   */
  markQuadrantAsSelected(index) {
    // Remove previous selection if any
    if (this.selectedQuadrant !== null) {
      const prevQuadrant = this.overlay.querySelector(`.midjourney-grid-quadrant[data-index="${this.selectedQuadrant}"]`);
      if (prevQuadrant) {
        prevQuadrant.classList.remove('selected');
      }
    }
    
    // Set the new selected quadrant
    this.selectedQuadrant = index;
    
    // Hide all instruction texts
    const instructions = this.overlay.querySelectorAll('.quadrant-instruction');
    instructions.forEach(instr => {
      instr.style.display = 'none';
    });
    
    // Add selected class to the chosen quadrant
    const selectedQuadrant = this.overlay.querySelector(`.midjourney-grid-quadrant[data-index="${index}"]`);
    if (selectedQuadrant) {
      selectedQuadrant.classList.add('selected');
      
      // Add a visual indicator to show which image was selected
      const selectedIndicator = document.createElement('div');
      selectedIndicator.className = 'selected-indicator';
      selectedIndicator.innerHTML = '<i class="bi bi-check-circle-fill"></i> Selected';
      
      // Remove any existing indicators
      const existingIndicator = selectedQuadrant.querySelector('.selected-indicator');
      if (existingIndicator) {
        existingIndicator.remove();
      }
      
      selectedQuadrant.appendChild(selectedIndicator);
    }
  }
  
  /**
   * Show a standard message
   * @param {string} message - Message to display
   */
  showMessage(message) {
    if (this.statusArea) {
      this.statusArea.innerHTML = `<div class="midjourney-message">${message}</div>`;
    }
  }
  
  /**
   * Show a processing message with spinner
   * @param {string} message - Message to display
   */
  showProcessing(message) {
    if (this.statusArea) {
      this.statusArea.innerHTML = `
        <div class="midjourney-message processing">
          <div class="spinner-border spinner-border-sm text-primary" role="status">
            <span class="visually-hidden">Loading...</span>
          </div>
          ${message}
        </div>
      `;
    }
  }
  
  /**
   * Show a success message
   * @param {string} message - Message to display
   */
  showSuccess(message) {
    if (this.statusArea) {
      this.statusArea.innerHTML = `<div class="midjourney-message success">${message}</div>`;
    }
  }
  
  /**
   * Show an error message
   * @param {string} message - Error message to display
   */
  showError(message) {
    if (this.statusArea) {
      this.statusArea.innerHTML = `<div class="midjourney-message error">${message}</div>`;
    }
  }
  
  /**
   * Set a new image URL
   * @param {string} url - New image URL
   */
  setImageUrl(url) {
    this.options.imageUrl = url;
    if (this.gridImage) {
      this.gridImage.src = url;
    }
  }
  
  /**
   * Set a new recipe ID
   * @param {string|number} id - Recipe ID
   */
  setRecipeId(id) {
    this.options.recipeId = id;
  }
  
  /**
   * Set a new prompt
   * @param {string} prompt - Text prompt
   */
  setPrompt(prompt) {
    this.options.prompt = prompt;
  }
  
  /**
   * Check if recipe has selected image
   * @param {boolean} hasSelected - Whether recipe has selected image
   * @param {string} selectedUrl - URL of selected image (optional)
   */
  setSelectedImageStatus(hasSelected, selectedUrl = null) {
    this.options.hasSelectedImage = hasSelected;
    this.options.selectedImageUrl = selectedUrl;
    
    // Re-initialize the interface
    this.init();
  }
}

// Export to window object if in browser environment
if (typeof window !== 'undefined') {
  window.MidjourneyGridViewer = MidjourneyGridViewer;
}