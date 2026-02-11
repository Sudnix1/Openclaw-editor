const db = require('./db');

async function verifyFix() {
    try {
        const keyword = await db.getOne(`
            SELECT keyword, pinclicks_titles, pinclicks_descriptions
            FROM keywords
            WHERE keyword = ?
        `, ['Honey Butter Cornbread Poppers']);

        console.log('\n✅ Verification: Honey Butter Cornbread Poppers\n');

        const titles = JSON.parse(keyword.pinclicks_titles);
        const descriptions = JSON.parse(keyword.pinclicks_descriptions);

        console.log(`Titles: ${titles.length}`);
        titles.forEach((t, i) => console.log(`  ${i + 1}. ${t}`));

        console.log(`\nDescriptions: ${descriptions.length}`);
        descriptions.forEach((d, i) => {
            console.log(`\n  ${i + 1}. (${d.length} chars)`);
            console.log(`     ${d.substring(0, 100)}...`);
        });

        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

verifyFix();
