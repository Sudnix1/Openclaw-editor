// Create this as debug-permissions.js and run it to check permissions
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

async function debugPermissions() {
  const db = new sqlite3.Database(path.join(__dirname, 'data/recipes.db'));
  
  console.log('=== DEBUG PERMISSIONS FOR EMPLOYEE MOUAD ===');
  
  const userId = 'a4c6b6a6-49dd-403b-8a2b-f405ad7fe538';
  const organizationId = '1ff5b9b6-39d3-4c60-b4a0-ade81cf4dfd3';
  
  // 1. Check all websites in organization
  console.log('\n1. ALL WEBSITES IN ORGANIZATION:');
  const allWebsites = await new Promise((resolve, reject) => {
    db.all(
      `SELECT id, name FROM websites WHERE organization_id = ? ORDER BY name ASC`,
      [organizationId],
      (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      }
    );
  });
  
  allWebsites.forEach((website, index) => {
    console.log(`  ${index + 1}. ${website.name} (${website.id})`);
  });
  
  // 2. Check if permissions table exists
  console.log('\n2. CHECKING PERMISSIONS TABLE:');
  const tableExists = await new Promise((resolve, reject) => {
    db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='website_permissions'", (err, row) => {
      if (err) reject(err);
      else resolve(!!row);
    });
  });
  
  console.log(`  Permissions table exists: ${tableExists}`);
  
  if (tableExists) {
    // 3. Check all permissions for this user
    console.log('\n3. PERMISSIONS FOR USER MOUAD:');
    const userPermissions = await new Promise((resolve, reject) => {
      db.all(
        `SELECT wp.website_id, w.name as website_name 
         FROM website_permissions wp
         LEFT JOIN websites w ON wp.website_id = w.id
         WHERE wp.user_id = ?`,
        [userId],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });
    
    if (userPermissions.length === 0) {
      console.log('  ❌ NO PERMISSIONS FOUND FOR THIS USER');
    } else {
      userPermissions.forEach((perm, index) => {
        console.log(`  ${index + 1}. ${perm.website_name} (${perm.website_id})`);
      });
    }
    
    // 4. Check specific websites mentioned in logs
    console.log('\n4. CHECKING SPECIFIC WEBSITES FROM LOGS:');
    
    const websitesToCheck = [
      { id: 'f7289052-7a38-4efc-b5cd-23a626bd859c', name: 'Auto-selected (FAILED)' },
      { id: '1ba603de-d350-451e-b88d-c7fdc9bcdeb6', name: 'Zerocarbkitchen (SUCCESS)' },
      { id: '6e6311e5-8c22-4773-b211-d517631e4994', name: 'Third website (FAILED)' }
    ];
    
    for (const website of websitesToCheck) {
      const hasPermission = await new Promise((resolve, reject) => {
        db.get(
          `SELECT * FROM website_permissions WHERE user_id = ? AND website_id = ?`,
          [userId, website.id],
          (err, row) => {
            if (err) reject(err);
            else resolve(!!row);
          }
        );
      });
      
      console.log(`  ${website.name}: ${hasPermission ? '✅ HAS PERMISSION' : '❌ NO PERMISSION'} (${website.id})`);
    }
    
    // 5. Show what getUserPermittedWebsites SHOULD return
    console.log('\n5. WHAT getUserPermittedWebsites SHOULD RETURN:');
    const permittedWebsites = await new Promise((resolve, reject) => {
      db.all(
        `SELECT w.* FROM websites w
         INNER JOIN website_permissions wp ON w.id = wp.website_id
         WHERE wp.user_id = ? AND w.organization_id = ?
         ORDER BY w.name ASC`,
        [userId, organizationId],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });
    
    if (permittedWebsites.length === 0) {
      console.log('  ❌ NO PERMITTED WEBSITES - USER SHOULD SEE EMPTY LIST');
    } else {
      permittedWebsites.forEach((website, index) => {
        console.log(`  ${index + 1}. ${website.name} (${website.id})`);
      });
      console.log(`\n  🎯 FIRST WEBSITE TO AUTO-SELECT: ${permittedWebsites[0].name} (${permittedWebsites[0].id})`);
    }
  }
  
  db.close();
}

debugPermissions().catch(console.error);