const db = require('./db');

async function findSingleDescriptionKeywords() {
    try {
        const keywords = await db.getAll(`
            SELECT keyword, pinclicks_titles, pinclicks_descriptions, pinclicks_status
            FROM keywords
            WHERE pinclicks_descriptions IS NOT NULL
        `, []);

        console.log('\n=== Looking for Keywords with Single Description ===\n');

        let found = 0;
        for (const keyword of keywords) {
            try {
                const descriptions = JSON.parse(keyword.pinclicks_descriptions || '[]');

                if (descriptions.length === 1) {
                    found++;
                    console.log(`\n📌 Keyword: ${keyword.keyword}`);
                    console.log(`   Status: ${keyword.pinclicks_status}`);
                    console.log(`   ❌ Descriptions: ${descriptions.length} (SINGLE DESCRIPTION ISSUE)`);
                    console.log(`   Description length: ${descriptions[0]?.length || 0} characters`);
                    console.log(`\n   Full description:\n   "${descriptions[0]}"`);
                    console.log(`\n   First 200 chars: ${descriptions[0]?.substring(0, 200)}...`);
                }
            } catch (err) {
                console.log(`   ❌ Error parsing JSON for "${keyword.keyword}": ${err.message}`);
            }
        }

        console.log(`\n=== Found ${found} keywords with single description issue ===\n`);
        process.exit(0);

    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

findSingleDescriptionKeywords();
