const db = require('./db');

async function checkPinClicksDescriptions() {
    try {
        const keywords = await db.getAll(`
            SELECT keyword, pinclicks_titles, pinclicks_descriptions, pinclicks_status
            FROM keywords
            WHERE pinclicks_descriptions IS NOT NULL
            LIMIT 5
        `, []);

        console.log('\n=== PinClicks Descriptions Check ===\n');

        for (const keyword of keywords) {
            console.log(`\n📌 Keyword: ${keyword.keyword}`);
            console.log(`   Status: ${keyword.pinclicks_status}`);

            try {
                const titles = JSON.parse(keyword.pinclicks_titles || '[]');
                const descriptions = JSON.parse(keyword.pinclicks_descriptions || '[]');

                console.log(`   ✅ Titles: ${titles.length} items`);
                console.log(`   ✅ Descriptions: ${descriptions.length} items`);

                if (descriptions.length > 0) {
                    console.log(`\n   First description length: ${descriptions[0]?.length || 0} characters`);
                    if (descriptions[0]) {
                        console.log(`   First 100 chars: ${descriptions[0].substring(0, 100)}...`);
                    }
                }

                // Show all description lengths
                descriptions.forEach((desc, idx) => {
                    console.log(`   Description ${idx + 1}: ${desc?.length || 0} characters`);
                });

            } catch (err) {
                console.log(`   ❌ Error parsing JSON: ${err.message}`);
            }
        }

        console.log('\n=== End Check ===\n');
        process.exit(0);

    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

checkPinClicksDescriptions();
