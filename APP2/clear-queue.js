// clear-queue.js - Clear the image generation queue
const { runQuery, getAll } = require('./db');

async function clearQueue(options = {}) {
  const {
    clearAll = false,           // Clear all records including completed
    clearActive = true,         // Clear queued/processing only
    clearFailed = false,        // Clear failed jobs
    dryRun = false             // Just show what would be deleted
  } = options;

  console.log('🧹 QUEUE CLEANER STARTING');
  console.log('=' .repeat(50));

  try {
    // First, show current queue status
    const allJobs = await getAll('SELECT * FROM image_queue ORDER BY created_at DESC');
    console.log(`📊 Current queue contains ${allJobs.length} total jobs:`);
    
    const statusCounts = {};
    allJobs.forEach(job => {
      statusCounts[job.status] = (statusCounts[job.status] || 0) + 1;
    });
    
    Object.entries(statusCounts).forEach(([status, count]) => {
      console.log(`   ${status}: ${count} jobs`);
    });

    // Determine what to delete
    let deleteConditions = [];
    
    if (clearAll) {
      deleteConditions.push('1=1'); // Delete everything
      console.log('\n🗑️ Will delete ALL jobs (clearAll=true)');
    } else {
      if (clearActive) {
        deleteConditions.push("status IN ('queued', 'processing')");
        console.log('\n🗑️ Will delete ACTIVE jobs (queued, processing)');
      }
      if (clearFailed) {
        deleteConditions.push("status = 'failed'");
        console.log('🗑️ Will delete FAILED jobs');
      }
    }

    if (deleteConditions.length === 0) {
      console.log('\n⚠️ No deletion criteria specified. Nothing to delete.');
      return;
    }

    const whereClause = deleteConditions.join(' OR ');
    
    // Show what will be deleted
    const toDelete = await getAll(`SELECT * FROM image_queue WHERE ${whereClause}`);
    console.log(`\n📋 Jobs to be deleted: ${toDelete.length}`);
    
    if (toDelete.length > 0) {
      console.log('📝 Jobs that will be deleted:');
      toDelete.forEach((job, index) => {
        console.log(`   ${index + 1}. ${job.id.substring(0, 8)}... - ${job.status} - Recipe: ${job.recipe_id.substring(0, 8)}...`);
      });
    }

    if (dryRun) {
      console.log('\n🔍 DRY RUN: No actual deletion performed');
      return;
    }

    // Perform the deletion
    if (toDelete.length > 0) {
      console.log('\n⚠️ Proceeding with deletion in 3 seconds...');
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      const result = await runQuery(`DELETE FROM image_queue WHERE ${whereClause}`);
      console.log(`✅ Successfully deleted ${result.changes || toDelete.length} jobs`);
    } else {
      console.log('\n✅ No jobs matched deletion criteria');
    }

    // Show final status
    const finalJobs = await getAll('SELECT * FROM image_queue ORDER BY created_at DESC');
    console.log(`\n📊 Queue now contains ${finalJobs.length} jobs`);
    
    const finalStatusCounts = {};
    finalJobs.forEach(job => {
      finalStatusCounts[job.status] = (finalStatusCounts[job.status] || 0) + 1;
    });
    
    if (finalJobs.length > 0) {
      console.log('📊 Remaining jobs by status:');
      Object.entries(finalStatusCounts).forEach(([status, count]) => {
        console.log(`   ${status}: ${count} jobs`);
      });
    } else {
      console.log('🎉 Queue is now empty!');
    }

  } catch (error) {
    console.error('❌ Error clearing queue:', error);
  }
}

// Command line interface
async function main() {
  const args = process.argv.slice(2);
  
  const options = {
    clearAll: args.includes('--all'),
    clearActive: args.includes('--active') || args.length === 0, // Default to active
    clearFailed: args.includes('--failed'),
    dryRun: args.includes('--dry-run')
  };

  console.log('🎛️ Options:', options);
  
  await clearQueue(options);
}

// Usage examples:
console.log('🎛️ USAGE EXAMPLES:');
console.log('  node clear-queue.js                    # Clear active jobs (queued, processing)');
console.log('  node clear-queue.js --all              # Clear ALL jobs');
console.log('  node clear-queue.js --failed           # Clear failed jobs only');
console.log('  node clear-queue.js --active --failed  # Clear active AND failed jobs');
console.log('  node clear-queue.js --dry-run          # Show what would be deleted (no actual deletion)');
console.log('');

if (require.main === module) {
  main().catch(console.error);
}

module.exports = clearQueue;