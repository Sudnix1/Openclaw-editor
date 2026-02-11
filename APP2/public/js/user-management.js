// Simplified User Management JavaScript
document.addEventListener('DOMContentLoaded', function() {
    // Add event listeners to edit buttons
    document.querySelectorAll('.edit-user-btn').forEach(button => {
        button.addEventListener('click', function(e) {
            // The user ID is stored in the data-user-id attribute
            const userId = this.getAttribute('data-user-id');
            document.getElementById('editForm' + userId).setAttribute('data-ajax-enabled', 'true');
        });
    });
    
    // Add event listeners to delete buttons
    document.querySelectorAll('.delete-user-btn').forEach(button => {
        button.addEventListener('click', function(e) {
            // The user ID is stored in the data-user-id attribute
            const userId = this.getAttribute('data-user-id');
            document.getElementById('deleteForm' + userId).setAttribute('data-ajax-enabled', 'true');
        });
    });
    
    // Handle form submissions
    document.addEventListener('submit', function(e) {
        const form = e.target;
        
        // Only intercept forms marked for AJAX submission
        if (form.getAttribute('data-ajax-enabled') === 'true') {
            e.preventDefault();
            
            // Prepare the form data
            const formData = new FormData(form);
            const jsonData = {};
            formData.forEach((value, key) => { jsonData[key] = value });
            
            // Determine if this is an edit or delete form
            const isDelete = form.id.includes('deleteForm');
            const userId = form.getAttribute('data-user-id');
            
            // Construct the URL
            const url = isDelete 
                ? `/api/users/${userId}/delete`
                : `/api/users/${userId}`;
            
            // Send the request
            fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(jsonData)
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    // Success - reload the page
                    window.location.reload();
                } else {
                    // Error - display message
                    alert(data.message || 'Operation failed');
                }
            })
            .catch(error => {
                console.error('Error:', error);
                alert('An error occurred');
            });
        }
    });
});