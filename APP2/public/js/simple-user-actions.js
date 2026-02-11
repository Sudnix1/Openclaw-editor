// Extremely simple user action handling
document.addEventListener('DOMContentLoaded', function() {
  // Simple confirmation for delete links
  document.querySelectorAll('.confirm-delete').forEach(function(link) {
    link.addEventListener('click', function(e) {
      if (!confirm('Are you sure you want to delete this user? This action cannot be undone.')) {
        e.preventDefault();
      }
    });
  });
});