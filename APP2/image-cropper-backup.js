// Simplified Image Cropper Logic with CORS Proxy Fix
(function() {
  'use strict';
  let currentCroppers = new Map();
  let cropModal;
  let selectedImages = [];

  // CORS Fix: Function to proxy external images
  function getProxiedImageUrl(originalUrl) {
    // Check if URL is external (not same origin)
    if (originalUrl.startsWith('http://') || originalUrl.startsWith('https://')) {
      // Check if it's not from our own domain
      const currentOrigin = window.location.origin;
      if (!originalUrl.startsWith(currentOrigin)) {
        // Use our proxy for external images
        console.log(`🔄 Proxying external image: ${originalUrl}`);
        return `/api/proxy-image?url=${encodeURIComponent(originalUrl)}`;
      }
    }
    // Return original URL if it's internal or relative
    return originalUrl;
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
          src: getProxiedImageUrl(imgEl.src), // Use proxied URL here
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
    
    // Use proxied URL for external images
    const proxiedSrc = getProxiedImageUrl(imageData.src);
    
    item.innerHTML = `
      <div class="crop-title">${imageData.title}</div>
      <div class="crop-img-container">
        <img id="cropImg${index}" src="${proxiedSrc}" alt="${imageData.title}" crossorigin="anonymous" />
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

    // Add error handler for images that might still fail to load
    img.addEventListener('error', (e) => {
      console.error(`❌ Image ${index} load error, retrying... (1/2)`);
      
      // Try to reload the image once
      setTimeout(() => {
        const originalSrc = selectedImages[index].src;
        console.log(`🔄 Retrying image load for: ${originalSrc}`);
        img.src = originalSrc;
        
        // Second error handler
        img.addEventListener('error', (e2) => {
          console.error(`❌ Image ${index} load error, retrying... (2/2)`);
          
          // Show placeholder or disable this image
          img.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAwIiBoZWlnaHQ9IjMwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZGRkIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIxNCIgZmlsbD0iIzk5OSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPkltYWdlIExvYWQgRXJyb3I8L3RleHQ+PC9zdmc+';
        }, { once: true });
      }, 2000);
    }, { once: true });

    // Create simplified cropper
    const cropper = new Cropper(img, {
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

    const formData = new FormData();
    const updates = [];
    let processedCount = 0;
    let totalToProcess = currentCroppers.size;
    
    if (totalToProcess === 0) {
      resetSaveButton();
      alert('No images to save.');
      return;
    }

    // Process ALL croppers
    currentCroppers.forEach((cropper, index) => {
      const currentImage = selectedImages[index];
      
      cropper.getCroppedCanvas({
        width: 800,
        height: 600,
        imageSmoothingEnabled: true,
        imageSmoothingQuality: 'high'
      }).toBlob((blob) => {
        if (blob) {
          formData.append('croppedImages', blob, `crop_${Date.now()}_${index}.jpg`);
          updates.push({
            keywordId: currentImage.id,
            index: processedCount
          });
        }
        
        processedCount++;
        
        // When all images are processed
        if (processedCount === totalToProcess) {
          if (updates.length === 0) {
            resetSaveButton();
            alert('Nothing to save.');
            return;
          }
          
          formData.append('updates', JSON.stringify(updates));
          
          fetch('/api/keywords/update-images', { 
            method: 'POST', 
            body: formData 
          })
          .then(res => res.json())
          .then(data => {
            if (data.success) {
              cropModal.hide();
              
              // Show success message
              const alertDiv = document.createElement('div');
              alertDiv.className = 'alert alert-success alert-dismissible fade show';
              alertDiv.innerHTML = `
                <strong>Success!</strong> ${updates.length} image${updates.length > 1 ? 's' : ''} cropped and saved successfully.
                <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
              `;
              
              const statusElement = document.getElementById('statusMessage');
              if (statusElement) {
                statusElement.appendChild(alertDiv);
              }
              
              // Refresh page after a short delay
              setTimeout(() => {
                location.reload();
              }, 1500);
            } else {
              throw new Error(data.message || 'Failed to save images');
            }
          })
          .catch(error => {
            console.error('Save failed:', error);
            alert('Failed to save cropped images: ' + error.message);
            resetSaveButton();
          });
        }
      }, 'image/jpeg', 0.9);
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