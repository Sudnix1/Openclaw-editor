// main.js - JavaScript for the RecipeGen AI application

document.addEventListener('DOMContentLoaded', function() {
  // Mobile sidebar toggle
  const toggleSidebarBtn = document.getElementById('toggle-sidebar');
  const sidebar = document.querySelector('.sidebar');
  
  if (toggleSidebarBtn && sidebar) {
    toggleSidebarBtn.addEventListener('click', function() {
      sidebar.classList.toggle('show');
    });
    
    // Close sidebar when clicking outside on mobile
    document.addEventListener('click', function(event) {
      const isClickInsideSidebar = sidebar.contains(event.target);
      const isClickOnToggleBtn = toggleSidebarBtn.contains(event.target);
      
      if (!isClickInsideSidebar && !isClickOnToggleBtn && sidebar.classList.contains('show')) {
        sidebar.classList.remove('show');
      }
    });
  }
  
  // Copy button functionality using event delegation
  // This will work for both existing and dynamically added buttons
  document.addEventListener('click', function(event) {
    const copyBtn = event.target.closest('.copy-btn');
    if (!copyBtn) return; // Not a copy button click
    
    const contentId = copyBtn.getAttribute('data-content');
    if (!contentId) return; // No content ID specified
    
    const contentElement = document.getElementById(contentId);
    if (!contentElement) return; // Content element not found
    
    // Get content (try innerText first, then textContent as fallback)
    const content = contentElement.innerText || contentElement.textContent;
    
    navigator.clipboard.writeText(content)
      .then(() => {
        const originalHTML = copyBtn.innerHTML;
        copyBtn.innerHTML = '<i class="bi bi-check"></i> Copied!';
        setTimeout(() => {
          copyBtn.innerHTML = originalHTML;
        }, 2000);
      })
      .catch(err => {
        console.error('Failed to copy text: ', err);
        alert('Failed to copy text. Please try again.');
      });
      
    // Prevent default and stop propagation
    event.preventDefault();
    event.stopPropagation();
  });
  
  // Temperature slider value display (for settings page)
  const temperatureSlider = document.getElementById('temperature');
  const temperatureValue = document.getElementById('temperatureValue');
  
  if (temperatureSlider && temperatureValue) {
    temperatureSlider.addEventListener('input', function() {
      temperatureValue.textContent = this.value;
    });
  }
  
  // Toggle custom model input field (for settings page)
  const modelSelect = document.getElementById('modelSelect');
  const customModel = document.getElementById('customModel');
  
  if (modelSelect && customModel) {
    modelSelect.addEventListener('change', function() {
      if (this.value === 'custom') {
        customModel.style.display = 'block';
        customModel.focus();
      } else {
        customModel.style.display = 'none';
        customModel.value = '';
        customModel.value = this.value;
      }
    });
  }
});