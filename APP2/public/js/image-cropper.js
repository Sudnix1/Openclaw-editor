// Simplified Image Cropper Logic with CORS Proxy Fix
(function() {
  'use strict';
  let currentCroppers = new Map();
  let cropModal;
  let selectedImages = [];

  // Client-side image loading with fallback options
  function getImageUrl(originalUrl) {
    // Check if URL is external (not same origin)
    if (originalUrl.startsWith('http://') || originalUrl.startsWith('https://')) {
      const currentOrigin = window.location.origin;
      if (!originalUrl.startsWith(currentOrigin)) {
        // For external images, try direct loading first
        console.log(`🔄 Loading external image directly: ${originalUrl}`);
        
        // Special handling for Facebook CDN
        if (originalUrl.includes('fbcdn.net') || originalUrl.includes('scontent')) {
          console.warn(`⚠️ Facebook CDN detected - using client-side loading`);
        }
        
        // Return original URL for direct client-side loading
        return originalUrl;
      }
    }
    return originalUrl;
  }

  // Fallback function to try server proxy if client-side fails  
  function getProxyUrl(originalUrl) {
    return `/api/proxy-image?url=${encodeURIComponent(originalUrl)}`;
  }

  document.addEventListener('DOMContentLoaded', () => {
    cropModal = new bootstrap.Modal(document.getElementById('cropModal'));
    
    const cropBtn = document.getElementById('cropImagesBtn');
    const saveBtn = document.getElementById('saveCroppedImages');
    
    if (cropBtn) {
      cropBtn.addEventListener('click', openCropModal);
    }
    
    if (saveBtn) {
      saveBtn.addEventListener('click', saveCroppedImages);
    }
  });

  function openCropModal() {
    const checked = document.querySelectorAll('.keyword-checkbox:checked');
    if (!checked.length) {
      alert('Please select at least one image to crop.');
      return;
    }

    // Prepare selected images data
    selectedImages = [];
    checked.forEach((cb) => {
      const card = cb.closest('.keyword-card');
      const imgEl = card.querySelector('img.keyword-image');
      const title = card.querySelector('.keyword-title').textContent;
      
      if (imgEl && imgEl.src) {
        selectedImages.push({
          id: cb.value,
          title: title,
          src: getImageUrl(imgEl.src), // Use client-side loading first
          originalSrc: imgEl.src, // Keep original for fallback
          element: imgEl
        });
      }
    });

    if (selectedImages.length === 0) {
      alert('No images found in selected items.');
      return;
    }

    currentCroppers.clear();
    setupCropInterface();
    
    // Set correct button text
    resetSaveButton();
    
    // Show modal first, THEN initialize croppers after modal is fully shown
    cropModal.show();
  }

  function setupCropInterface() {
    const container = document.getElementById('cropContainer');
    container.innerHTML = '';

    console.log(`Setting up interface for ${selectedImages.length} images`);

    // Create and show ALL images at once, but DON'T initialize croppers yet
    selectedImages.forEach((imageData, index) => {
      console.log(`Creating container for image ${index + 1}: ${imageData.title}`);
      const imageContainer = createImageContainer(imageData, index);
      container.appendChild(imageContainer);
    });

    // Update modal title
    const modalTitle = document.querySelector('#cropModal .modal-title');
    if (modalTitle) {
      if (selectedImages.length === 1) {
        modalTitle.innerHTML = 'Crop Image';
      } else {
        modalTitle.innerHTML = `Crop ${selectedImages.length} Images`;
      }
    }

    console.log(`Interface setup complete. Container now has ${container.children.length} image containers`);
  }

  function createImageContainer(imageData, index) {
    const item = document.createElement('div');
    item.className = 'crop-item';
    item.setAttribute('data-index', index);
    
    // Try client-side loading first
    const imageSrc = imageData.src;
    
    item.innerHTML = `
      <div class="crop-title">${imageData.title}</div>
      <div class="crop-img-container">
        <img id="cropImg${index}" src="${imageSrc}" alt="${imageData.title}" crossorigin="anonymous" />
      </div>
    `;

    // DON'T initialize cropper here - wait for modal to be fully shown
    return item;
  }

  function initSimpleCropper(img, index) {
    // Destroy existing cropper if any
    if (currentCroppers.has(index)) {
      currentCroppers.get(index).destroy();
    }

    console.log(`Initializing cropper for image ${index}, img dimensions:`, {
      width: img.offsetWidth,
      height: img.offsetHeight,
      naturalWidth: img.naturalWidth,
      naturalHeight: img.naturalHeight
    });

    // Add error handler with server proxy fallback
    img.addEventListener('error', (e) => {
      console.error(`❌ Client-side image load failed for ${index}, trying server proxy...`);
      
      // Try server proxy as fallback
      const originalSrc = selectedImages[index].originalSrc || selectedImages[index].src;
      const proxyUrl = getProxyUrl(originalSrc);
      console.log(`🔄 Fallback to server proxy: ${proxyUrl}`);
      img.src = proxyUrl;
      
      // Final error handler if proxy also fails
      img.addEventListener('error', (e2) => {
        console.error(`❌ Server proxy also failed for image ${index}, showing placeholder`);
        
        // Show placeholder image
        img.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAwIiBoZWlnaHQ9IjMwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZGRkIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIxNCIgZmlsbD0iIzk5OSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPkltYWdlIExvYWQgRXJyb3I8L3RleHQ+PC9zdmc+';
      }, { once: true });
    }, { once: true });

    // Create simplified cropper with CORS error handling
    let cropper;
    try {
      cropper = new Cropper(img, {
        viewMode: 1,
        dragMode: 'crop',
        autoCropArea: 0.8,
        aspectRatio: NaN, // Free aspect ratio
        movable: true,
        scalable: false,
        zoomable: false,
        rotatable: false,
        background: false,
        guides: false,
        center: false,
        highlight: false,
      cropBoxMovable: true,
      cropBoxResizable: true,
      toggleDragModeOnDblclick: false,
      // Simplified styling
      ready: function() {
        console.log(`Cropper ${index} is ready`);
        
        // Force resize to ensure proper dimensions
        this.cropper.resize();
        
        // Remove all complex UI elements
        const cropperContainer = img.parentElement.querySelector('.cropper-container');
        if (cropperContainer) {
          // Hide all handles except corners for simplicity
          const points = cropperContainer.querySelectorAll('.cropper-point');
          points.forEach((point, idx) => {
            // Only show corner handles (indices 0,2,6,8 in Cropper.js)
            if (![0,2,6,8].includes(idx)) {
              point.style.display = 'none';
            }
          });
        }
      }
    });

    currentCroppers.set(index, cropper);
    
    } catch (corsError) {
      console.error(`❌ CORS error initializing cropper for image ${index}, trying server proxy...`, corsError);
      
      // Fallback to server proxy for CORS-restricted images
      const originalSrc = selectedImages[index].originalSrc || selectedImages[index].src;
      const proxyUrl = getProxyUrl(originalSrc);
      console.log(`🔄 CORS fallback to server proxy: ${proxyUrl}`);
      
      // Update the image source to use proxy
      img.src = proxyUrl;
      
      // Wait a moment for the new image to load, then retry cropper
      setTimeout(() => {
        try {
          const retryCropper = new Cropper(img, {
            viewMode: 1,
            dragMode: 'crop',
            autoCropArea: 0.8,
            aspectRatio: NaN,
            movable: true,
            scalable: false,
            zoomable: false,
            rotatable: false,
            background: false,
            guides: false,
            center: false,
            highlight: false,
            cropBoxMovable: true,
            cropBoxResizable: true,
            toggleDragModeOnDblclick: false,
            ready: function() {
              console.log(`Cropper ${index} ready after CORS fallback`);
              this.cropper.resize();
            }
          });
          currentCroppers.set(index, retryCropper);
        } catch (retryError) {
          console.error(`❌ Cropper failed even with proxy for image ${index}:`, retryError);
          // Show error message to user
          const container = img.closest('.crop-item');
          if (container) {
            container.innerHTML = `
              <div class="crop-title text-danger">${selectedImages[index].title} - Failed to Load</div>
              <div class="alert alert-warning">
                This image has CORS restrictions and cannot be cropped. 
                Please try uploading to imgur.com or use a different source.
              </div>
            `;
          }
        }
      }, 1000);
    }
  }

  function showImage(index) {
    if (index < 0 || index >= selectedImages.length) return;
    
    currentImageIndex = index;
    setupCropInterface();
  }

  function saveCroppedImages() {
    const saveBtn = document.getElementById('saveCroppedImages');
    if (!saveBtn) return;

    saveBtn.disabled = true;
    saveBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Saving...';

    const updates = [];
    let processedCount = 0;
    let totalToProcess = currentCroppers.size;
    
    if (totalToProcess === 0) {
      resetSaveButton();
      alert('No images to save.');
      return;
    }

    console.log(`🖼️ Processing ${totalToProcess} cropped images client-side (no server storage)`);

    // Process ALL croppers using client-side data URLs (no server storage)
    currentCroppers.forEach((cropper, index) => {
      const currentImage = selectedImages[index];
      
      // Get cropped canvas as data URL (base64) - no server storage needed
      const croppedCanvas = cropper.getCroppedCanvas({
        width: 800,
        height: 600,
        imageSmoothingEnabled: true,
        imageSmoothingQuality: 'high'
      });
      
      if (croppedCanvas) {
        // Reduce quality to minimize payload size (0.8 instead of 0.9)
        const dataURL = croppedCanvas.toDataURL('image/jpeg', 0.8);
        console.log(`✅ Generated data URL for image ${index} (${Math.round(dataURL.length/1024)}KB)`);
        
        updates.push({
          keywordId: currentImage.id,
          imageDataUrl: dataURL // Base64 data URL, no server file
        });
        
        // Update the UI immediately with the cropped image
        const originalImgElement = currentImage.element;
        if (originalImgElement) {
          originalImgElement.src = dataURL;
          console.log(`🔄 Updated UI image for keyword ${currentImage.id}`);
        }
      }
      
      processedCount++;
      
      // When all images are processed
      if (processedCount === totalToProcess) {
        if (updates.length === 0) {
          resetSaveButton();
          alert('Nothing to save.');
          return;
        }
        
        // Send only data URLs to server (no file uploads)
        console.log(`🚀 [CROP] Sending ${updates.length} updates to server...`);
        console.log(`🔍 [CROP] Update data:`, updates.map(u => ({ keywordId: u.keywordId, dataSize: Math.round(u.imageDataUrl.length/1024) + 'KB' })));
        
        fetch('/api/keywords/update-image-urls', { 
          method: 'POST', 
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ updates }) 
        })
        .then(res => {
          console.log(`📥 [CROP] Server response status: ${res.status}`);
          return res.json();
        })
        .then(data => {
          console.log(`📋 [CROP] Server response:`, data);
          if (data.success) {
            cropModal.hide();
            
            // Show success message
            const alertDiv = document.createElement('div');
            alertDiv.className = 'alert alert-success alert-dismissible fade show';
            alertDiv.innerHTML = `
              <strong>Success!</strong> ${updates.length} image${updates.length > 1 ? 's' : ''} cropped and updated successfully (no server storage used).
              <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
            `;
            
            const statusElement = document.getElementById('statusMessage');
            if (statusElement) {
              statusElement.appendChild(alertDiv);
            }
            
            // No need to reload - images are already updated in UI
            resetSaveButton();
          } else {
            throw new Error(data.message || 'Failed to update images');
          }
        })
        .catch(error => {
          console.error('Update failed:', error);
          alert('Failed to update cropped images: ' + error.message);
          resetSaveButton();
        });
      }
    });
  }

  function resetSaveButton() {
    const saveBtn = document.getElementById('saveCroppedImages');
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.innerHTML = '<i class="bi bi-check2"></i> Save Cropped Image';
    }
  }

  // Handle modal events
  const cropModalElement = document.getElementById('cropModal');
  if (cropModalElement) {
    // Initialize croppers AFTER modal is fully shown
    cropModalElement.addEventListener('shown.bs.modal', function() {
      console.log('Modal is now fully shown, initializing croppers...');
      
      // Small delay to ensure everything is rendered
      setTimeout(() => {
        selectedImages.forEach((imageData, index) => {
          const img = document.getElementById(`cropImg${index}`);
          if (img) {
            console.log(`Initializing cropper for image ${index + 1}`);
            initSimpleCropper(img, index);
          }
        });
      }, 100);
    });

    // Cleanup when modal is hidden
    cropModalElement.addEventListener('hidden.bs.modal', function() {
      // Cleanup croppers
      currentCroppers.forEach(cropper => {
        cropper.destroy();
      });
      currentCroppers.clear();
      selectedImages = [];
      
      // Reset save button
      resetSaveButton();
    });
  }

  // Expose functions for potential external use
  window.ImageCropper = {
    openCropModal,
    saveCroppedImages
  };
})();