const db = require('./db');

/**
 * Fix merged PinClicks descriptions by splitting them intelligently
 */
async function fixMergedDescriptions() {
    try {
        console.log('\n🔧 [FIX] Starting to fix merged PinClicks descriptions...\n');

        // Get all keywords with descriptions
        const keywords = await db.getAll(`
            SELECT id, keyword, pinclicks_descriptions
            FROM keywords
            WHERE pinclicks_descriptions IS NOT NULL
        `, []);

        console.log(`📊 Found ${keywords.length} keywords with PinClicks descriptions\n`);

        let fixedCount = 0;
        let alreadyGoodCount = 0;

        for (const keyword of keywords) {
            try {
                const descriptions = JSON.parse(keyword.pinclicks_descriptions);

                // Check if this keyword has the merged description issue
                if (descriptions.length === 1 && descriptions[0].length > 400) {
                    console.log(`\n🔧 Fixing: ${keyword.keyword}`);
                    console.log(`   Original: 1 description (${descriptions[0].length} chars)`);

                    const mergedDesc = descriptions[0];
                    const splitDescriptions = smartSplitDescription(mergedDesc);

                    console.log(`   Fixed: ${splitDescriptions.length} descriptions`);
                    splitDescriptions.forEach((desc, idx) => {
                        console.log(`   ${idx + 1}. ${desc.substring(0, 60)}... (${desc.length} chars)`);
                    });

                    // Update database
                    await db.runQuery(`
                        UPDATE keywords
                        SET pinclicks_descriptions = ?
                        WHERE id = ?
                    `, [JSON.stringify(splitDescriptions), keyword.id]);

                    fixedCount++;
                } else {
                    alreadyGoodCount++;
                }

            } catch (err) {
                console.error(`   ❌ Error processing "${keyword.keyword}": ${err.message}`);
            }
        }

        console.log(`\n✅ Fix complete!`);
        console.log(`   Fixed: ${fixedCount} keywords`);
        console.log(`   Already good: ${alreadyGoodCount} keywords`);
        console.log(`   Total: ${keywords.length} keywords\n`);

        process.exit(0);

    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

/**
 * Smart split a merged description into multiple descriptions
 */
function smartSplitDescription(mergedDesc) {
    const descriptions = [];

    // Common phrases that start Pinterest descriptions
    const starterPattern = /(Make|Bake|Try|Get|Discover|Craving|Whip up|Explore|Calling|Power up|Build|Warm up|Meet|Save this|This|Looking for|Perfect for|Steak Bites|Million dollar|Juicy|Tender)\s+/gi;

    // Find all matches
    const matches = [];
    let match;
    starterPattern.lastIndex = 0;
    while ((match = starterPattern.exec(mergedDesc)) !== null) {
        matches.push({
            index: match.index,
            text: match[0]
        });
    }

    // Split by matches (skip first if it's at position 0)
    if (matches.length > 1) {
        for (let i = 0; i < matches.length; i++) {
            const start = matches[i].index;
            const end = i < matches.length - 1 ? matches[i + 1].index : mergedDesc.length;
            const desc = mergedDesc.substring(start, end).trim();

            // Only keep descriptions that are substantial
            if (desc.length >= 100 && desc.length <= 500) {
                descriptions.push(desc);
            }
        }
    }

    // If we didn't get 3-4 descriptions, try a different approach
    if (descriptions.length < 3) {
        console.log(`   ⚠️ First method only found ${descriptions.length} descriptions, trying sentence-based split...`);

        // Split by sentences and group them into ~250 char chunks
        const sentences = mergedDesc.match(/[^.!?]+[.!?]+/g) || [mergedDesc];
        const grouped = [];
        let currentGroup = '';

        for (const sentence of sentences) {
            if (currentGroup.length + sentence.length > 300 && currentGroup.length > 100) {
                grouped.push(currentGroup.trim());
                currentGroup = sentence;
            } else {
                currentGroup += sentence;
            }
        }

        if (currentGroup.length > 100) {
            grouped.push(currentGroup.trim());
        }

        if (grouped.length >= descriptions.length) {
            return grouped.slice(0, 4);  // Max 4 descriptions
        }
    }

    // Ensure we have 3-4 descriptions
    if (descriptions.length < 3) {
        console.log(`   ⚠️ Only found ${descriptions.length} descriptions, using length-based split as fallback`);

        // Length-based fallback
        const chunkSize = Math.ceil(mergedDesc.length / 4);
        const chunks = [];
        for (let i = 0; i < mergedDesc.length; i += chunkSize) {
            const chunk = mergedDesc.substring(i, i + chunkSize).trim();
            if (chunk.length >= 100) {
                chunks.push(chunk);
            }
        }
        return chunks.slice(0, 4);
    }

    return descriptions.slice(0, 4);  // Max 4 descriptions
}

fixMergedDescriptions();
