// Create this as 'diagnose-account-context.js' to identify the issue

const { runQuery, getOne, getAll } = require('./db');

async function diagnoseAccountContext() {
  try {
    console.log('🔍 [DIAGNOSE] Analyzing account context issues...\n');
    
    // 1. Get all organizations
    console.log('📊 [DIAGNOSE] Organizations in database:');
    const organizations = await getAll(`SELECT id, name FROM organizations ORDER BY created_at DESC`);
    organizations.forEach((org, index) => {
      console.log(`  ${index + 1}. ${org.name} (ID: ${org.id})`);
    });
    
    // 2. Get all websites
    console.log('\n🌐 [DIAGNOSE] Websites in database:');
    const websites = await getAll(`SELECT id, name, organization_id FROM websites ORDER BY created_at DESC`);
    websites.forEach((site, index) => {
      const org = organizations.find(o => o.id === site.organization_id);
      console.log(`  ${index + 1}. ${site.name} (ID: ${site.id}) - Org: ${org?.name || 'Unknown'}`);
    });
    
    // 3. Get all users
    console.log('\n👥 [DIAGNOSE] Users in database:');
    const users = await getAll(`SELECT id, name, email, role, organization_id FROM users ORDER BY created_at DESC LIMIT 10`);
    users.forEach((user, index) => {
      const org = organizations.find(o => o.id === user.organization_id);
      console.log(`  ${index + 1}. ${user.name} (${user.email}) - Role: ${user.role} - Org: ${org?.name || 'Unknown'}`);
    });
    
    // 4. Analyze keywords by organization and website
    console.log('\n📝 [DIAGNOSE] Keywords breakdown by organization and website:');
    
    const keywordBreakdown = await getAll(`
      SELECT 
        k.organization_id,
        k.website_id,
        k.status,
        COUNT(*) as count,
        COUNT(CASE WHEN k.recipe_id IS NOT NULL THEN 1 END) as with_recipe,
        o.name as org_name,
        w.name as website_name
      FROM keywords k
      LEFT JOIN organizations o ON k.organization_id = o.id
      LEFT JOIN websites w ON k.website_id = w.id
      GROUP BY k.organization_id, k.website_id, k.status
      ORDER BY k.organization_id, k.website_id, k.status
    `);
    
    // Group by organization and website
    const grouped = {};
    keywordBreakdown.forEach(row => {
      const orgKey = `${row.org_name || 'Unknown'} (${row.organization_id})`;
      const websiteKey = `${row.website_name || 'Unknown'} (${row.website_id})`;
      
      if (!grouped[orgKey]) grouped[orgKey] = {};
      if (!grouped[orgKey][websiteKey]) grouped[orgKey][websiteKey] = {};
      
      grouped[orgKey][websiteKey][row.status] = {
        count: row.count,
        with_recipe: row.with_recipe
      };
    });
    
    Object.keys(grouped).forEach(orgKey => {
      console.log(`\n  📁 Organization: ${orgKey}`);
      Object.keys(grouped[orgKey]).forEach(websiteKey => {
        console.log(`    🌐 Website: ${websiteKey}`);
        Object.keys(grouped[orgKey][websiteKey]).forEach(status => {
          const data = grouped[orgKey][websiteKey][status];
          console.log(`      ${status.toUpperCase()}: ${data.count} total (${data.with_recipe} with recipe)`);
        });
      });
    });
    
    // 5. Find potentially problematic keywords
    console.log('\n🔍 [DIAGNOSE] Looking for specific problematic keywords...');
    
    // Get keywords that might be the ones shown in the UI
    const suspiciousKeywords = await getAll(`
      SELECT 
        k.id,
        k.keyword,
        k.status,
        k.recipe_id,
        k.organization_id,
        k.website_id,
        k.owner_id,
        k.added_at,
        o.name as org_name,
        w.name as website_name,
        u.name as owner_name,
        r.recipe_idea
      FROM keywords k
      LEFT JOIN organizations o ON k.organization_id = o.id
      LEFT JOIN websites w ON k.website_id = w.id
      LEFT JOIN users u ON k.owner_id = u.id
      LEFT JOIN recipes r ON k.recipe_id = r.id
      WHERE k.keyword IN ('Chicken Tacos', 'Lemon Bars', 'Mushroom Risotto', 'Banana Bread', 'Salmon Teriyaki')
      ORDER BY k.added_at DESC
    `);
    
    console.log('\n🎯 [DIAGNOSE] Keywords matching your UI (Chicken Tacos, Lemon Bars, etc.):');
    if (suspiciousKeywords.length === 0) {
      console.log('  ❌ No keywords found with those exact names!');
      console.log('  💡 This suggests the keywords you see in UI are from a different context');
      
      // Let's check for similar keywords
      console.log('\n🔍 [DIAGNOSE] Searching for similar keywords...');
      const similarKeywords = await getAll(`
        SELECT 
          k.keyword,
          k.status,
          k.organization_id,
          k.website_id,
          o.name as org_name,
          w.name as website_name
        FROM keywords k
        LEFT JOIN organizations o ON k.organization_id = o.id
        LEFT JOIN websites w ON k.website_id = w.id
        WHERE k.keyword LIKE '%Chicken%' 
           OR k.keyword LIKE '%Lemon%'
           OR k.keyword LIKE '%Mushroom%'
           OR k.keyword LIKE '%Banana%'
           OR k.keyword LIKE '%Salmon%'
        ORDER BY k.added_at DESC
        LIMIT 10
      `);
      
      similarKeywords.forEach(kw => {
        console.log(`  📝 "${kw.keyword}" - ${kw.status} - Org: ${kw.org_name} - Website: ${kw.website_name}`);
      });
      
    } else {
      suspiciousKeywords.forEach(kw => {
        console.log(`  📝 "${kw.keyword}"`);
        console.log(`     Status: ${kw.status}`);
        console.log(`     Recipe ID: ${kw.recipe_id || 'None'}`);
        console.log(`     Organization: ${kw.org_name} (${kw.organization_id})`);
        console.log(`     Website: ${kw.website_name} (${kw.website_id})`);
        console.log(`     Owner: ${kw.owner_name} (${kw.owner_id})`);
        console.log(`     Added: ${kw.added_at}`);
        if (kw.recipe_idea) {
          console.log(`     Recipe exists: ${kw.recipe_idea}`);
        }
        console.log('');
      });
    }
    
    // 6. Check for website session issues
    console.log('\n⚙️ [DIAGNOSE] Checking for potential session/context issues:');
    
    // Check if there are multiple websites per organization
    const websiteCount = await getAll(`
      SELECT 
        organization_id,
        COUNT(*) as website_count,
        o.name as org_name
      FROM websites w
      LEFT JOIN organizations o ON w.organization_id = o.id
      GROUP BY organization_id
      HAVING website_count > 1
    `);
    
    if (websiteCount.length > 0) {
      console.log('  ⚠️ Organizations with multiple websites (potential context switching issues):');
      websiteCount.forEach(org => {
        console.log(`    - ${org.org_name}: ${org.website_count} websites`);
      });
    } else {
      console.log('  ✅ No organizations have multiple websites');
    }
    
    // 7. Recommendations
    console.log('\n💡 [DIAGNOSE] Recommendations:');
    
    if (suspiciousKeywords.length === 0) {
      console.log('  🎯 LIKELY ISSUE: Website/Organization context mismatch');
      console.log('  📋 ACTION NEEDED:');
      console.log('     1. Check which organization/website your new account is associated with');
      console.log('     2. The keywords you see in UI might belong to a different organization');
      console.log('     3. Try switching websites in your app if you have multiple');
      console.log('     4. Check if the new account is in the correct organization');
    } else {
      console.log('  🎯 Keywords found in database - checking for status inconsistencies');
      
      const pendingWithRecipe = suspiciousKeywords.filter(k => k.status === 'pending' && k.recipe_id);
      if (pendingWithRecipe.length > 0) {
        console.log('  ⚠️ Found keywords that need status fixing');
      } else {
        console.log('  ✅ All keywords have correct status in database');
        console.log('  💡 Issue might be in frontend caching or session context');
      }
    }
    
  } catch (error) {
    console.error('❌ [DIAGNOSE] Error in diagnostic:', error);
  }
}

// Run the diagnostic
diagnoseAccountContext().then(() => {
  console.log('\n🏁 [DIAGNOSE] Diagnostic complete!');
  process.exit(0);
}).catch(error => {
  console.error('❌ [DIAGNOSE] Diagnostic failed:', error);
  process.exit(1);
});