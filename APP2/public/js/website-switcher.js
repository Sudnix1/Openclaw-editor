// Fixed website-switcher.js
// public/js/website-switcher.js
document.addEventListener('DOMContentLoaded', function() {
  // Website switcher in navbar
  const websiteSwitcher = document.getElementById('website-switcher');
  if (websiteSwitcher) {
    websiteSwitcher.addEventListener('change', function() {
      const websiteId = this.value;
      const form = document.getElementById('website-switch-form');
      document.getElementById('website-id-input').value = websiteId;
      form.submit();
    });
  }
  
  // Store current URL in the return URL field when switching websites
  const returnUrlInputs = document.querySelectorAll('input[name="returnUrl"]');
  returnUrlInputs.forEach(input => {
    input.value = window.location.pathname + window.location.search;
  });
  
  // Toggle website permissions buttons
  const permissionButtons = document.querySelectorAll('.toggle-permission-btn');
  permissionButtons.forEach(button => {
    button.addEventListener('click', function() {
      this.classList.toggle('btn-success');
      this.classList.toggle('btn-outline-secondary');
      
      const icon = this.querySelector('i');
      icon.classList.toggle('bi-check-circle');
      icon.classList.toggle('bi-x-circle');
      
      const text = this.querySelector('span');
      text.textContent = text.textContent === 'Has Access' ? 'No Access' : 'Has Access';
    });
  });
});

// Show loading indicator
function showLoading() {
  // Create loading overlay if it doesn't exist
  if (!document.getElementById('loading-overlay')) {
    const overlay = document.createElement('div');
    overlay.id = 'loading-overlay';
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100%';
    overlay.style.height = '100%';
    overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
    overlay.style.display = 'flex';
    overlay.style.justifyContent = 'center';
    overlay.style.alignItems = 'center';
    overlay.style.zIndex = '9999';
    
    const spinner = document.createElement('div');
    spinner.style.width = '50px';
    spinner.style.height = '50px';
    spinner.style.border = '5px solid #f3f3f3';
    spinner.style.borderTop = '5px solid #6e47cc';
    spinner.style.borderRadius = '50%';
    spinner.style.animation = 'spin 1s linear infinite';
    
    const style = document.createElement('style');
    style.textContent = '@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }';
    
    document.head.appendChild(style);
    overlay.appendChild(spinner);
    document.body.appendChild(overlay);
  } else {
    document.getElementById('loading-overlay').style.display = 'flex';
  }
}

// Toast function for success messages
// This is kept but will only be used if needed in the future
function showToast(message, type = 'success') {
  const toastContainer = document.querySelector('.toast-container');
  if (!toastContainer) return;
  
  const toast = document.createElement('div');
  toast.className = `toast align-items-center text-white bg-${type} border-0`;
  toast.setAttribute('role', 'alert');
  toast.setAttribute('aria-live', 'assertive');
  toast.setAttribute('aria-atomic', 'true');
  
  toast.innerHTML = `
    <div class="d-flex">
      <div class="toast-body">
        ${message}
      </div>
      <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
    </div>
  `;
  
  toastContainer.appendChild(toast);
  
  // Only use Bootstrap Toast if it's available
  if (typeof bootstrap !== 'undefined' && bootstrap.Toast) {
    const bsToast = new bootstrap.Toast(toast, {
      autohide: true,
      delay: 3000
    });
    bsToast.show();
  } else {
    // Fallback if Bootstrap JS is not loaded
    toast.style.display = 'block';
    setTimeout(() => {
      toast.remove();
    }, 3000);
  }
  
  // Remove the toast after it's hidden
  toast.addEventListener('hidden.bs.toast', function() {
    toast.remove();
  });
}