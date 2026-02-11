// public/js/website-management.js
document.addEventListener('DOMContentLoaded', function() {
  // Submit website switch forms automatically when selected
  const switchForms = document.querySelectorAll('.website-switch-form');
  switchForms.forEach(form => {
    form.querySelector('button').addEventListener('click', function(e) {
      // No need to do anything, the form submits naturally
    });
  });

  // Store current URL in the return URL field when switching websites
  const returnUrlInputs = document.querySelectorAll('input[name="returnUrl"]');
  returnUrlInputs.forEach(input => {
    input.value = window.location.pathname + window.location.search;
  });
});