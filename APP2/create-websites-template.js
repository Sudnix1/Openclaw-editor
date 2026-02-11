// create-websites-template.js
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'views/websites.ejs');

console.log(`Checking ${filePath}...`);

// Check if file already exists
fs.access(filePath, fs.constants.F_OK, err => {
  if (!err) {
    console.log('websites.ejs already exists, skipping');
    return;
  }
  
  // Create the websites.ejs template
  const template = `<div class="container mt-4">
  <div class="row mb-4">
    <div class="col">
      <h1>Manage Websites</h1>
      <p>View and manage the websites for your organization.</p>
    </div>
  </div>

  <% if (locals.successMessage) { %>
    <div class="alert alert-success">
      <%= successMessage %>
    </div>
  <% } %>
  
  <% if (locals.errorMessage) { %>
    <div class="alert alert-danger">
      <%= errorMessage %>
    </div>
  <% } %>

  <div class="card">
    <div class="card-body">
      <% if (websites && websites.length > 0) { %>
        <div class="table-responsive">
          <table class="table table-striped">
            <thead>
              <tr>
                <th>Name</th>
                <th>URL</th>
                <th>WordPress Connected</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              <% websites.forEach(website => { %>
                <tr>
                  <td>
                    <%= website.name %>
                    <% if (locals.currentWebsiteId === website.id) { %>
                      <span class="badge bg-success">Current</span>
                    <% } %>
                  </td>
                  <td><%= website.url || 'Not set' %></td>
                  <td>
                    <% if (website.wordpress_api_url) { %>
                      <span class="text-success">
                        <i class="fas fa-check"></i> Connected
                      </span>
                    <% } else { %>
                      <span class="text-danger">
                        <i class="fas fa-times"></i> Not Connected
                      </span>
                    <% } %>
                  </td>
                  <td><%= new Date(website.created_at).toLocaleDateString() %></td>
                  <td>
                    <div class="btn-group">
                      <% if (locals.currentWebsiteId !== website.id) { %>
                        <form action="/websites/switch" method="POST" style="margin:0">
                          <input type="hidden" name="websiteId" value="<%= website.id %>">
                          <input type="hidden" name="returnUrl" value="/websites">
                          <button type="submit" class="btn btn-sm btn-success">
                            <i class="fas fa-exchange-alt"></i> Switch
                          </button>
                        </form>
                      <% } %>
                    </div>
                  </td>
                </tr>
              <% }); %>
            </tbody>
          </table>
        </div>
      <% } else { %>
        <div class="alert alert-info">
          No websites found. Please contact your administrator.
        </div>
      <% } %>
    </div>
  </div>
</div>`;

  // Write the file
  fs.writeFile(filePath, template, 'utf8', err => {
    if (err) {
      console.error(`Error creating ${filePath}:`, err);
      return;
    }
    
    console.log(`Successfully created ${filePath}`);
  });
});