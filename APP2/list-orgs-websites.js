#!/usr/bin/env node

/**
 * List all organizations and websites to find IDs for debugging
 */

const { getAll } = require('./db');

async function listOrgsAndWebsites() {
  console.log('📋 Listing all Organizations and Websites\n');
  
  try {
    // Get all organizations
    console.log('🏢 ORGANIZATIONS:');
    console.log('================');
    const organizations = await getAll(`
      SELECT id, name, created_at 
      FROM organizations 
      ORDER BY name
    `);
    
    if (organizations.length === 0) {
      console.log('   No organizations found');
    } else {
      organizations.forEach(org => {
        console.log(`   ID: ${org.id} | Name: "${org.name}" | Created: ${org.created_at}`);
      });
    }
    
    console.log('\n🌐 WEBSITES:');
    console.log('============');
    const websites = await getAll(`
      SELECT w.id, w.name, w.organization_id, o.name as org_name 
      FROM websites w
      LEFT JOIN organizations o ON w.organization_id = o.id
      ORDER BY o.name, w.name
    `);
    
    if (websites.length === 0) {
      console.log('   No websites found');
    } else {
      websites.forEach(website => {
        console.log(`   Website ID: ${website.id} | Name: "${website.name}" | Org: "${website.org_name}" (${website.organization_id})`);
      });
    }
    
    console.log('\n👥 USERS:');
    console.log('=========');
    const users = await getAll(`
      SELECT u.id, u.name, u.email, u.role, u.organization_id, o.name as org_name
      FROM users u
      LEFT JOIN organizations o ON u.organization_id = o.id
      WHERE u.role IN ('admin', 'employee')
      ORDER BY o.name, u.role, u.name
    `);
    
    if (users.length === 0) {
      console.log('   No admin/employee users found');
    } else {
      users.forEach(user => {
        console.log(`   User: "${user.name}" (${user.email}) | Role: ${user.role} | Org: "${user.org_name}" (${user.organization_id})`);
      });
    }
    
    console.log('\n🔍 DISCORD SETTINGS FILES:');
    console.log('===========================');
    const fs = require('fs');
    const path = require('path');
    const dataDir = path.join(__dirname, 'data');
    
    try {
      const files = fs.readdirSync(dataDir);
      const configFiles = files.filter(file => file.startsWith('config-') && file.endsWith('.json'));
      
      if (configFiles.length === 0) {
        console.log('   No Discord settings files found');
      } else {
        console.log('   Found Discord settings files:');
        configFiles.forEach(file => {
          try {
            const match = file.match(/config-(\w+)-(\w+)\.json/);
            if (match) {
              const [, orgId, websiteId] = match;
              const filePath = path.join(dataDir, file);
              const settings = JSON.parse(fs.readFileSync(filePath, 'utf8'));
              
              const hasToken = !!(settings.discordUserToken);
              const tokenPreview = hasToken ? settings.discordUserToken.substring(0, 10) + '...' : 'MISSING';
              
              console.log(`   📁 ${file}:`);
              console.log(`      Organization ID: ${orgId}`);
              console.log(`      Website ID: ${websiteId}`);
              console.log(`      Discord Token: ${tokenPreview}`);
              console.log(`      Channel ID: ${settings.discordChannelId || 'MISSING'}`);
              console.log(`      Enable Discord: ${settings.enableDiscord}`);
              console.log('');
            }
          } catch (err) {
            console.log(`   📁 ${file}: Error reading file - ${err.message}`);
          }
        });
      }
    } catch (err) {
      console.log(`   Error reading data directory: ${err.message}`);
    }
    
    console.log('\n💡 USAGE EXAMPLES:');
    console.log('==================');
    
    if (organizations.length > 0 && websites.length > 0) {
      const firstOrg = organizations[0];
      const firstWebsite = websites.find(w => w.organization_id == firstOrg.id) || websites[0];
      
      console.log('To test Discord token for employee, use:');
      console.log(`   node debug-discord-token.js ${firstWebsite.organization_id} ${firstWebsite.id}`);
      console.log('');
      console.log('To test specific employee account:');
      
      const employee = users.find(u => u.role === 'employee');
      if (employee) {
        const employeeWebsite = websites.find(w => w.organization_id == employee.organization_id);
        if (employeeWebsite) {
          console.log(`   # For employee "${employee.name}" in org "${employee.org_name}"`);
          console.log(`   node debug-discord-token.js ${employee.organization_id} ${employeeWebsite.id}`);
        }
      }
    }
    
    console.log('\n✅ Complete! Use the Organization ID and Website ID pairs above.');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

listOrgsAndWebsites()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });