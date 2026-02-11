/**
 * Pinclicks Integration Service
 * Integrates pinclicks automation into the main application
 * for automatic Pinterest content optimization
 */

const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

// Configuration
const CONFIG = {
  downloadPath: path.join(__dirname, '..', 'pinclicks', 'downloads'),
  // TEMP FIX: Using fresh directory to bypass corrupted profile
  userDataDir: path.join(__dirname, '..', 'pinclicks', 'chrome-profile-new'),
  headless: false, // Set to true for production
  waitTime: 2000,
  timeout: 30000
};

// Ensure downloads directory exists
if (!fs.existsSync(CONFIG.downloadPath)) {
  fs.mkdirSync(CONFIG.downloadPath, { recursive: true });
}

/**
 * Clean Chrome lock files that can cause "Target closed" errors
 * This removes lock files from the user data directory
 */
function cleanChromeLocks() {
  try {
    const lockFiles = [
      path.join(CONFIG.userDataDir, 'SingletonLock'),
      path.join(CONFIG.userDataDir, 'SingletonSocket'),
      path.join(CONFIG.userDataDir, 'SingletonCookie')
    ];

    for (const lockFile of lockFiles) {
      if (fs.existsSync(lockFile)) {
        try {
          fs.unlinkSync(lockFile);
          console.log(`🧹 [CLEANUP] Removed lock file: ${path.basename(lockFile)}`);
        } catch (err) {
          // Ignore errors - file might be in use
          console.log(`⚠️ [CLEANUP] Could not remove ${path.basename(lockFile)}: ${err.message}`);
        }
      }
    }
  } catch (error) {
    console.warn('⚠️ [CLEANUP] Error cleaning Chrome locks:', error.message);
  }
}

/**
 * AI-Powered parser using OpenAI to extract titles, descriptions, and overlays
 * Much more reliable than pattern matching - handles ANY ChatGPT format
 * @param {string} content - Raw ChatGPT response text
 * @returns {Object} Parsed content with titles, descriptions, overlays arrays
 */
async function parseResults(content, keyword = null) {
  console.log('\n🤖 [AI PARSER] Using OpenAI to intelligently parse ChatGPT response...');
  if (keyword) {
    console.log(`🔍 [AI PARSER] Validating content for keyword: "${keyword}"`);
  }

  try {
    const OpenAI = require('openai');
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });

    const parsePrompt = `Extract Pinterest content from this ChatGPT response${keyword ? ` for the recipe "${keyword}"` : ''}. Find:
1. Pinterest Pin Titles (typically 3-4 short, catchy titles)
2. Pinterest Pin Descriptions (typically 3-4 longer, detailed descriptions)
3. Text Overlay Suggestions (short text for images)

Return ONLY valid JSON in this exact format:
{
  "titles": ["title 1", "title 2", "title 3", "title 4"],
  "descriptions": ["description 1", "description 2", "description 3", "description 4"],
  "overlays": ["overlay 1", "overlay 2", "overlay 3", "overlay 4"]
}

IMPORTANT:
- Extract the ACTUAL content, not section headers
- Titles should be short (under 100 characters)
- Descriptions should be longer, detailed paragraphs
- Include ALL titles and descriptions you find
${keyword ? `- Make sure the content is specifically about "${keyword}"` : ''}
- Return valid JSON only, no markdown or explanation

ChatGPT Response:
${content}`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are a JSON extraction expert. Extract structured data from text and return ONLY valid JSON, no explanation or markdown.'
        },
        {
          role: 'user',
          content: parsePrompt
        }
      ],
      temperature: 0.1,
      response_format: { type: "json_object" }
    });

    const jsonText = response.choices[0].message.content;
    const parsed = JSON.parse(jsonText);

    console.log(`✅ [AI PARSER] Successfully extracted:`);
    console.log(`   📝 Titles: ${parsed.titles?.length || 0}`);
    console.log(`   📄 Descriptions: ${parsed.descriptions?.length || 0}`);
    console.log(`   🎨 Overlays: ${parsed.overlays?.length || 0}`);

    // Show samples with keyword validation
    if (parsed.titles?.length > 0) {
      console.log(`   Sample title: "${parsed.titles[0].substring(0, 60)}..."`);
    }
    if (parsed.descriptions?.length > 0) {
      console.log(`   Sample description: "${parsed.descriptions[0].substring(0, 60)}..."`);
    }

    // VALIDATION: Check if content seems to match the keyword
    if (keyword && parsed.titles?.length > 0) {
      const keywordLower = keyword.toLowerCase();
      const keywordWords = keywordLower.split(' ').filter(w => w.length > 3);
      const allContent = [
        ...parsed.titles,
        ...parsed.descriptions,
        ...parsed.overlays
      ].join(' ').toLowerCase();

      const matchCount = keywordWords.filter(word => allContent.includes(word)).length;
      const matchPercentage = keywordWords.length > 0 ? (matchCount / keywordWords.length) * 100 : 0;

      console.log(`🔍 [VALIDATION] Keyword match: ${matchPercentage.toFixed(0)}% (${matchCount}/${keywordWords.length} words)`);

      if (matchPercentage < 30) {
        console.warn(`⚠️ [VALIDATION WARNING] Low keyword match! Content might be for a different recipe.`);
      }
    }

    return {
      titles: parsed.titles || [],
      descriptions: parsed.descriptions || [],
      overlays: parsed.overlays || []
    };

  } catch (error) {
    console.error(`❌ [AI PARSER] OpenAI parsing failed:`, error.message);
    console.log(`⚠️ [AI PARSER] Falling back to pattern-based parser...`);
    return parseResultsPatternBased(content);
  }
}

/**
 * Pattern-based parser as fallback (renamed from parseResults)
 * @param {string} content - Raw ChatGPT response text
 * @returns {Object} Parsed content with titles, descriptions, overlays arrays
 */
function parseResultsPatternBased(content) {
  const titles = [];
  const descriptions = [];
  const overlays = [];

  // Debug: Log first 500 chars to see format
  console.log(`\n🔍 [PARSER DEBUG] Content preview (first 500 chars):`);
  console.log(content.substring(0, 500));
  console.log(`\n📊 [PARSER DEBUG] Total content length: ${content.length} characters`);

  const lines = content.split('\n');

  // SMART SECTION DETECTION: Find where each section likely starts
  const sectionIndices = {
    titles: -1,
    descriptions: -1,
    overlays: -1,
    articlesOrEnd: -1
  };

  // Scan all lines to find section boundaries
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const lineLower = line.toLowerCase();
    const lineWithoutEmojis = lineLower.replace(/[\u{1F300}-\u{1F9FF}]/gu, '').trim();

    // A valid section header should be:
    // 1. Relatively short (not a paragraph)
    // 2. Contain the keywords
    // 3. Not contain long explanatory text
    const isShortLine = line.length < 100;
    const looksLikeHeader = line.length < 200 && !lineLower.includes(' and ') && !lineLower.includes(' the ');

    // Look for title section (various patterns)
    if (looksLikeHeader &&
        ((lineWithoutEmojis.includes('pin') && lineWithoutEmojis.includes('title')) ||
         (lineWithoutEmojis.includes('pinterest') && lineWithoutEmojis.includes('title'))) &&
        !lineWithoutEmojis.includes('article')) {
      if (sectionIndices.titles === -1) {
        sectionIndices.titles = i;
        console.log(`🔍 [SMART PARSER] Found titles section at line ${i}: "${line.substring(0, 60)}"`);
      }
    }

    // Look for description section
    if (looksLikeHeader &&
        ((lineWithoutEmojis.includes('pin') && lineWithoutEmojis.includes('description')) ||
         (lineWithoutEmojis.includes('pinterest') && lineWithoutEmojis.includes('description')))) {
      if (sectionIndices.descriptions === -1) {
        sectionIndices.descriptions = i;
        console.log(`🔍 [SMART PARSER] Found descriptions section at line ${i}: "${line.substring(0, 60)}"`);
      }
    }

    // Look for overlay/text section
    // Pattern: "Text Overlay", "Text overlay suggestions", etc.
    const isOverlayHeader = looksLikeHeader &&
                           ((lineWithoutEmojis.includes('text') && lineWithoutEmojis.includes('overlay')) ||
                            (lineWithoutEmojis.includes('overlay') && lineWithoutEmojis.includes('suggestion'))) &&
                           !lineWithoutEmojis.includes('package') &&  // Exclude intro text
                           !lineWithoutEmojis.includes('complete');

    if (isOverlayHeader) {
      // Only set as overlay section if it comes AFTER titles (to avoid detecting intro text)
      if (sectionIndices.overlays === -1 && sectionIndices.titles !== -1 && i > sectionIndices.titles) {
        sectionIndices.overlays = i;
        console.log(`🔍 [SMART PARSER] Found overlays section at line ${i}: "${lines[i].trim().substring(0, 60)}"`);
      }
    }

    // Look for article titles section (marks end of pin content)
    if (lineWithoutEmojis.includes('article') && lineWithoutEmojis.includes('title')) {
      if (sectionIndices.articlesOrEnd === -1) {
        sectionIndices.articlesOrEnd = i;
        console.log(`🔍 [SMART PARSER] Found article section (end marker) at line ${i}`);
      }
    }
  }

  // If we didn't find sections, fall back to original parsing
  if (sectionIndices.titles === -1 && sectionIndices.descriptions === -1) {
    console.log(`⚠️ [SMART PARSER] No sections detected, using original parser...`);
    return parseResultsOriginal(content, lines);
  }

  // Extract content from each section
  console.log(`\n📊 [SMART PARSER] Section structure detected:`);
  console.log(`   📝 Titles: line ${sectionIndices.titles} to ${sectionIndices.descriptions !== -1 ? sectionIndices.descriptions : sectionIndices.overlays}`);
  console.log(`   📄 Descriptions: line ${sectionIndices.descriptions} to ${sectionIndices.overlays}`);
  console.log(`   🎨 Overlays: line ${sectionIndices.overlays} to ${sectionIndices.articlesOrEnd}`);
  console.log(`   📰 Article: line ${sectionIndices.articlesOrEnd}`);

  console.log(`\n📊 [SMART PARSER] Extracting content between sections...`);

  // Detect expected number of titles from header (e.g., "4 SEO-Optimized Pinterest Pin Titles")
  let expectedTitleCount = null;
  if (sectionIndices.titles !== -1) {
    const titleHeaderLine = lines[sectionIndices.titles];
    const countMatch = titleHeaderLine.match(/(\d+)\s+(SEO[- ]?Optimized\s+)?(Pinterest\s+)?Pin\s+Titles/i);
    if (countMatch) {
      expectedTitleCount = parseInt(countMatch[1]);
      console.log(`🔢 [SMART PARSER] Detected ${expectedTitleCount} titles expected from header`);
    }
  }

  // Extract titles (from titles line to descriptions line)
  const allTitleContent = [];
  if (sectionIndices.titles !== -1) {
    const startLine = sectionIndices.titles + 1;
    const endLine = sectionIndices.descriptions !== -1 ? sectionIndices.descriptions :
                    (sectionIndices.overlays !== -1 ? sectionIndices.overlays : lines.length);

    for (let i = startLine; i < endLine; i++) {
      const line = lines[i].trim();
      if (!line || line.length < 10) continue;

      // Extract content (remove numbering if present)
      let content = line.replace(/^\d+[\.\)]\s*/, '').replace(/^\*\*(\d+)[\.\)]\s*/, '').replace(/^[*\-•]\s*/, '').trim();

      // Skip if it looks like a section header
      if (content.toLowerCase().includes('description') ||
          content.toLowerCase().includes('overlay') ||
          content.toLowerCase().includes('article')) continue;

      if (content && content.length >= 10) {
        allTitleContent.push(content);
      }
    }

    // Intelligently split titles from descriptions
    if (expectedTitleCount && allTitleContent.length > expectedTitleCount) {
      // We have more content than expected titles - split them
      console.log(`📊 [SMART PARSER] Found ${allTitleContent.length} items but expected ${expectedTitleCount} titles`);
      console.log(`🔀 [SMART PARSER] Treating first ${expectedTitleCount} as titles, rest as descriptions`);

      // First N are titles
      titles.push(...allTitleContent.slice(0, expectedTitleCount));
      titles.forEach((t, i) => {
        console.log(`   ✓ Title ${i + 1}: "${t.substring(0, 50)}..."`);
      });

      // Rest are descriptions (if no descriptions section was found)
      if (sectionIndices.descriptions === -1) {
        const descriptionContent = allTitleContent.slice(expectedTitleCount);

        // Filter out duplicate titles (keep only longer descriptions > 100 chars)
        const actualDescriptions = descriptionContent.filter(d => d.length > 100);

        descriptions.push(...actualDescriptions);
        actualDescriptions.forEach((d, i) => {
          console.log(`   ✓ Description ${i + 1} (auto-detected, filtered): "${d.substring(0, 50)}..."`);
        });

        console.log(`   🔍 Filtered ${descriptionContent.length - actualDescriptions.length} short duplicate lines`);
      }
    } else {
      // Normal case - all content is titles
      titles.push(...allTitleContent);
      titles.forEach((t, i) => {
        console.log(`   ✓ Title ${i + 1}: "${t.substring(0, 50)}..."`);
      });
    }
  }

  // Extract descriptions (from descriptions line to overlays line)
  if (sectionIndices.descriptions !== -1) {
    const startLine = sectionIndices.descriptions + 1;
    let endLine = sectionIndices.overlays !== -1 ? sectionIndices.overlays :
                  (sectionIndices.articlesOrEnd !== -1 ? sectionIndices.articlesOrEnd : lines.length);

    // SAFETY CHECK: Prevent backwards ranges (if overlays was detected before descriptions due to intro text)
    if (endLine <= startLine) {
      console.log(`⚠️ [SMART PARSER] Invalid range detected (${startLine} to ${endLine}). Using article section or end instead.`);
      endLine = sectionIndices.articlesOrEnd !== -1 ? sectionIndices.articlesOrEnd : lines.length;
    }

    // DEBUG: Show what's in the descriptions section
    console.log(`🔍 [DESCRIPTIONS DEBUG] Examining lines ${startLine} to ${endLine}:`);
    for (let debugI = startLine; debugI < Math.min(endLine, startLine + 10); debugI++) {
      console.log(`   Line ${debugI}: "${lines[debugI]?.substring(0, 100)}"`);
    }

    let currentDesc = '';
    let descNumber = 0;

    for (let i = startLine; i < endLine; i++) {
      const line = lines[i].trim();

      // DEBUG: Show what we're processing
      if (i < startLine + 15) {
        console.log(`\n🔍 [DESC LINE ${i}] Raw: "${line.substring(0, 80)}"`);
      }

      // Skip section headers
      if (line.length > 0 &&
          (line.toLowerCase().includes('overlay') ||
           line.toLowerCase().includes('article') ||
           line.toLowerCase().includes('text suggestion'))) {
        if (i < startLine + 15) console.log(`   ⏭️ Skipping section header`);
        continue;
      }

      // Check if this is a new numbered item (various formats)
      const numberMatch = line.match(/^(\d+)[\.\)]\s*(.+)/);
      const boldNumberMatch = line.match(/^\*\*(\d+)[\.\)]\s*(.+?)\*\*/);
      const bulletMatch = line.match(/^[*\-•]\s+(.+)/);
      const forTitleMatch = line.match(/^(?:\*\*)?For\s+Title\s+(\d+):(?:\*\*)?$/i);

      if (i < startLine + 15) {
        console.log(`   📝 numberMatch: ${numberMatch ? 'YES' : 'no'}`);
        console.log(`   📝 forTitleMatch: ${forTitleMatch ? 'YES (' + forTitleMatch[1] + ')' : 'no'}`);
        console.log(`   📝 currentDesc length: ${currentDesc.length}`);
      }

      if (forTitleMatch) {
        // "For Title N:" format - save previous and prepare for next
        if (currentDesc && currentDesc.length >= 20) {
          descriptions.push(currentDesc);
          console.log(`   ✅ Saved Description ${descriptions.length}: "${currentDesc.substring(0, 50)}..." (${currentDesc.length} chars)`);
        }
        // Reset currentDesc - next line will have the actual description
        currentDesc = '';
        descNumber = parseInt(forTitleMatch[1]);
        if (i < startLine + 15) {
          console.log(`   🏷️ Found "For Title ${descNumber}" marker - ready for description text`);
        }
      } else if (numberMatch || boldNumberMatch) {
        // Save previous description if exists
        if (currentDesc && currentDesc.length >= 20) {
          descriptions.push(currentDesc);
          console.log(`   ✅ Saved Description ${descriptions.length}: "${currentDesc.substring(0, 50)}..." (${currentDesc.length} chars)`);
        }

        // Start new description
        if (boldNumberMatch) {
          descNumber = parseInt(boldNumberMatch[1]);
          currentDesc = boldNumberMatch[2].trim();
        } else {
          descNumber = parseInt(numberMatch[1]);
          currentDesc = numberMatch[2].trim();
        }
        if (i < startLine + 15) {
          console.log(`   🆕 Started new description #${descNumber}: "${currentDesc.substring(0, 50)}..."`);
        }
      } else if (bulletMatch) {
        // Bullet point format
        if (currentDesc && currentDesc.length >= 20) {
          descriptions.push(currentDesc);
          console.log(`   ✅ Saved Description ${descriptions.length}: "${currentDesc.substring(0, 50)}..." (${currentDesc.length} chars)`);
        }
        currentDesc = bulletMatch[1].trim();
        if (i < startLine + 15) {
          console.log(`   🆕 Started new description (bullet): "${currentDesc.substring(0, 50)}..."`);
        }
      } else if (line.length > 0) {
        // Check if this looks like a description title separator
        // Title pattern: short line (30-80 chars), no ending punctuation
        const isDescriptionTitle = line.length >= 30 &&
                                   line.length <= 100 &&
                                   !line.endsWith('.') &&
                                   !line.endsWith('!') &&
                                   !line.endsWith('?') &&
                                   !line.match(/\.\s/);  // No periods mid-sentence

        if (isDescriptionTitle && currentDesc && currentDesc.length >= 200) {
          // We have a substantial description AND this looks like a new title - save previous
          descriptions.push(currentDesc);
          console.log(`   ✅ Saved Description ${descriptions.length}: "${currentDesc.substring(0, 50)}..." (${currentDesc.length} chars)`);
          currentDesc = line;  // Start new with this title
          if (i < startLine + 15) {
            console.log(`   🆕 Started new description with title: "${line.substring(0, 50)}..."`);
          }
        } else if (currentDesc) {
          // Continue current description (multi-line)
          const before = currentDesc.length;
          currentDesc += ' ' + line;
          if (i < startLine + 15) {
            console.log(`   ➕ Accumulated ${line.length} chars (total now: ${currentDesc.length}, was: ${before})`);
          }
        } else if (line.length >= 30) {
          // Start a new description with substantial content
          currentDesc = line;
          if (i < startLine + 15) {
            console.log(`   🆕 Started new description (no number): "${currentDesc.substring(0, 50)}..."`);
          }
        }
      } else if (line.length === 0 && currentDesc) {
        // Empty line - save current description if substantial
        if (i < startLine + 15) {
          console.log(`   ⬜ Empty line (currentDesc: ${currentDesc.length} chars)`);
        }

        // If we have a substantial description (>100 chars), save it and reset
        if (currentDesc.length >= 100) {
          descriptions.push(currentDesc);
          console.log(`   ✅ Saved Description ${descriptions.length}: "${currentDesc.substring(0, 50)}..." (${currentDesc.length} chars)`);
          currentDesc = '';  // Reset for next description
          if (i < startLine + 15) {
            console.log(`   🔄 Reset buffer for next description`);
          }
        }
      }
    }

    // Don't forget the last description
    if (currentDesc && currentDesc.length >= 20) {
      descriptions.push(currentDesc);
      console.log(`   ✓ Description ${descriptions.length}: "${currentDesc.substring(0, 50)}..."`);
    }

    // FALLBACK: If we found titles but NO descriptions, extract ANY substantial text in the descriptions section
    if (descriptions.length === 0 && titles.length > 0) {
      console.log(`⚠️ [SMART PARSER] No numbered descriptions found. Trying paragraph extraction...`);

      // Common phrases that start new Pinterest descriptions
      const descriptionStarters = [
        /^(make|bake|try|get|discover|craving|whip up|explore|calling|power up|build|warm up|meet|save this)\s+/i,
        /^(this|these|the|looking for|perfect for|ready|serve|ideal for)\s+/i
      ];

      let paragraphBuffer = '';
      for (let i = startLine; i < endLine; i++) {
        const line = lines[i].trim();
        if (!line || line.length < 10) {
          // Empty line - save paragraph if we have one
          if (paragraphBuffer.length >= 40) {
            descriptions.push(paragraphBuffer);
            console.log(`   ✓ Description ${descriptions.length} (paragraph): "${paragraphBuffer.substring(0, 50)}..."`);
            paragraphBuffer = '';
          }
          continue;
        }

        // Skip obvious headers
        if (line.toLowerCase().includes('overlay') ||
            line.toLowerCase().includes('article') ||
            line.toLowerCase().includes('description') && line.length < 100) {
          continue;
        }

        // Check if this line starts a new description
        const startsNewDescription = descriptionStarters.some(pattern => pattern.test(line));

        // If we have a substantial buffer AND this looks like a new description start, save the current buffer
        if (paragraphBuffer.length >= 150 && startsNewDescription) {
          descriptions.push(paragraphBuffer);
          console.log(`   ✓ Description ${descriptions.length} (detected new start): "${paragraphBuffer.substring(0, 50)}..."`);
          paragraphBuffer = line;  // Start new buffer with this line
          continue;
        }

        // Accumulate paragraph
        if (paragraphBuffer) {
          paragraphBuffer += ' ' + line;
        } else {
          paragraphBuffer = line;
        }

        // If buffer is getting very long (300+ chars), force a split to prevent mega-descriptions
        if (paragraphBuffer.length >= 300 && descriptions.length < 4) {
          descriptions.push(paragraphBuffer);
          console.log(`   ✓ Description ${descriptions.length} (length limit): "${paragraphBuffer.substring(0, 50)}..."`);
          paragraphBuffer = '';
        }
      }

      // Save final paragraph
      if (paragraphBuffer.length >= 40) {
        descriptions.push(paragraphBuffer);
        console.log(`   ✓ Description ${descriptions.length} (final): "${paragraphBuffer.substring(0, 50)}..."`);
      }
    }
  }

  // Extract overlays (from overlays line to article/end)
  if (sectionIndices.overlays !== -1) {
    const startLine = sectionIndices.overlays + 1;
    const endLine = sectionIndices.articlesOrEnd !== -1 ? sectionIndices.articlesOrEnd : lines.length;

    console.log(`🔍 [OVERLAYS DEBUG] Extracting from lines ${startLine} to ${endLine}`);
    for (let debugI = startLine; debugI < Math.min(endLine, startLine + 8); debugI++) {
      console.log(`   Line ${debugI}: "${lines[debugI]?.substring(0, 80)}"`);
    }

    for (let i = startLine; i < endLine; i++) {
      const line = lines[i].trim();
      if (!line || line.length < 5) continue;

      // Stop after extracting 4 overlays (ChatGPT always outputs exactly 4)
      if (overlays.length >= 4) {
        console.log(`   ✅ Extracted 4 overlays - stopping overlay extraction`);
        break;
      }

      // Extract content (remove bullets, numbering, etc.)
      let content = line
        .replace(/^\d+[\.\)]\s*/, '')           // Remove "1. " or "1) "
        .replace(/^\*\*(\d+)[\.\)]\s*/, '')     // Remove "**1)** "
        .replace(/^[*\-•]\s*/, '')              // Remove "* " or "- " or "• "
        .trim();

      // Skip section headers and instructions
      if (content.toLowerCase().includes('pinterest pin') ||
          content.toLowerCase().includes('article') ||
          content.toLowerCase().includes('if you') ||
          content.toLowerCase().includes('want') ||
          content.toLowerCase().includes('suggestions') ||
          content.toLowerCase().includes('download')) continue;

      // Only accept overlay text (short, 10-80 chars typically)
      if (content && content.length >= 10 && content.length <= 100) {
        overlays.push(content);
        console.log(`   ✓ Overlay ${overlays.length}: "${content}"`);
      }
    }
  } else {
    console.log(`⚠️ [OVERLAYS] No overlay section detected - overlays will not be extracted`);
  }

  // Clean descriptions: Remove duplicate title text from the beginning
  const cleanedDescriptions = descriptions.map((desc, index) => {
    // Try to find if this description starts with any of the titles
    for (let title of titles) {
      if (desc.startsWith(title)) {
        // Remove the title and any extra whitespace
        const cleaned = desc.substring(title.length).trim();
        if (cleaned.length > 50) {  // Make sure we have substantial content left
          console.log(`   🧹 Cleaned description ${index + 1}: Removed duplicate title (${title.length} chars)`);
          return cleaned;
        }
      }
    }
    return desc;  // Return as-is if no title match found
  });

  // POST-PROCESSING: Split any mega-descriptions that got merged together
  const finalDescriptions = [];
  for (let i = 0; i < cleanedDescriptions.length; i++) {
    const desc = cleanedDescriptions[i];

    // If description is very long (>400 chars), try to split it
    if (desc.length > 400) {
      console.log(`⚠️ [POST-PROCESS] Description ${i + 1} is ${desc.length} chars - attempting to split...`);

      // Split by common description starters
      const splitPattern = /\s+(Make|Bake|Try|Get|Discover|Craving|Whip up|Explore|Calling|Power up|Build|Warm up|Meet|Save this|This|Looking for|Perfect for)\s+/g;
      const parts = [];
      let lastIndex = 0;
      let match;

      splitPattern.lastIndex = 0;
      while ((match = splitPattern.exec(desc)) !== null) {
        if (match.index > lastIndex && match.index > 100) {  // Don't split too early
          parts.push(desc.substring(lastIndex, match.index).trim());
          lastIndex = match.index;
        }
      }

      // Add remaining content
      if (lastIndex < desc.length) {
        parts.push(desc.substring(lastIndex).trim());
      }

      if (parts.length > 1) {
        console.log(`   ✅ Split into ${parts.length} descriptions`);
        finalDescriptions.push(...parts.filter(p => p.length >= 100));
      } else {
        // Couldn't split intelligently, use length-based splitting
        const chunkSize = Math.ceil(desc.length / 4);
        for (let j = 0; j < desc.length; j += chunkSize) {
          const chunk = desc.substring(j, j + chunkSize).trim();
          if (chunk.length >= 100) {
            finalDescriptions.push(chunk);
          }
        }
        console.log(`   ⚠️ Used length-based split into ${finalDescriptions.length - i} parts`);
      }
    } else {
      finalDescriptions.push(desc);
    }
  }

  const validTitles = titles.filter(t => t && t.trim()).length;
  const validDescriptions = finalDescriptions.filter(d => d && d.trim()).length;
  const validOverlays = overlays.filter(o => o && o.trim()).length;

  console.log(`📊 [SMART PARSER] Extracted ${validTitles} titles, ${validDescriptions} descriptions, ${validOverlays} overlays`);

  return { titles, descriptions: finalDescriptions, overlays };
}

// Original parser as fallback
function parseResultsOriginal(content, lines) {
  const titles = [];
  const descriptions = [];
  const overlays = [];

  // Helper function to extract multi-line content
  function extractMultiLineContent(startIndex, lines) {
    let content = '';
    let i = startIndex;

    while (i < lines.length) {
      const line = lines[i].trim();
      // Stop if we hit another numbered item or section header
      if (line.match(/^\d+\.\s/) ||  // Numbered item like "1. "
          line.match(/^(Title|Description|Text\s+Overlay)\s+\d+:/i) ||
          line.match(/^\*\*(Title|Description|Text\s+Overlay)\s+\d+:\*\*/i) ||
          line.match(/^#{1,3}\s/)) {  // Section header like "# Pinterest Pin Titles"
        break;
      }
      if (line) {
        content += (content ? ' ' : '') + line;
      }
      i++;
    }

    return { content: content.trim(), linesConsumed: i - startIndex };
  }

  // Track which section we're currently in
  let currentSection = null;
  let sectionItemCount = 0;

  // Debug: Show all lines that look like headers or section markers
  console.log(`\n🔍 [PARSER DEBUG] Scanning ${lines.length} lines for section headers...`);
  let foundHeaders = false;
  for (let i = 0; i < Math.min(lines.length, 100); i++) {
    const line = lines[i].trim();
    if (line.match(/^#{1,3}\s/) || line.match(/^\d+[\.\)]\s/) || line.match(/^\*\*/) ||
        line.toLowerCase().includes('title') || line.toLowerCase().includes('description') ||
        line.toLowerCase().includes('overlay')) {
      console.log(`   Line ${i}: "${line.substring(0, 100)}"`);
      foundHeaders = true;
    }
  }
  if (!foundHeaders) {
    console.log(`   ⚠️ No section headers found! Content may not be in expected format.`);
    console.log(`   📄 Showing all lines to diagnose:`);
    for (let i = 0; i < Math.min(lines.length, 30); i++) {
      const line = lines[i].trim();
      if (line) console.log(`   Line ${i}: "${line.substring(0, 100)}"`);
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const trimmedLine = lines[i].trim();
    if (!trimmedLine) continue;

    // SECTION DETECTION (New Pin SEO Analysis format)
    // Remove emojis from line for better matching
    const lineWithoutEmojis = trimmedLine.replace(/[\u{1F300}-\u{1F9FF}]/gu, '').trim();

    // Detect "# Pinterest Pin Titles" or "# Pin Titles" or "SEO-Optimized Pinterest Pin Titles" (with or without #)
    if (lineWithoutEmojis.match(/^#{0,3}\s*(SEO[- ]?Optimized\s+)?(Pinterest\s+)?Pin\s+Titles/i)) {
      currentSection = 'titles';
      sectionItemCount = 0;
      console.log(`📍 [PARSER] Detected Titles section: "${trimmedLine}"`);
      continue;
    }

    // Detect "# Pinterest Pin Descriptions" or "# Pin Descriptions" or "SEO-Rich Pinterest Pin Descriptions" (with or without #)
    if (lineWithoutEmojis.match(/^#{0,3}\s*(SEO[- ]?Rich\s+)?(Pinterest\s+)?Pin\s+Descriptions?/i)) {
      currentSection = 'descriptions';
      sectionItemCount = 0;
      console.log(`📍 [PARSER] Detected Descriptions section: "${trimmedLine}"`);
      console.log(`🔍 [DEBUG] Next 10 lines after descriptions header:`);
      for (let debugIdx = i + 1; debugIdx < Math.min(i + 11, lines.length); debugIdx++) {
        const debugLine = lines[debugIdx].trim();
        if (debugLine) {
          console.log(`   Line ${debugIdx}: "${debugLine.substring(0, 100)}"`);
        }
      }
      continue;
    }

    // Detect "# Text Overlay" or "Text Overlays for Pinterest" or similar (with or without #)
    if (lineWithoutEmojis.match(/^#{0,3}\s*Text\s+Overlay/i)) {
      currentSection = 'overlays';
      sectionItemCount = 0;
      console.log(`📍 [PARSER] Detected Overlays section: "${trimmedLine}"`);
      continue;
    }

    // Detect "# Article Title" (don't capture as pin titles)
    if (lineWithoutEmojis.match(/^#{1,3}\s*Article\s+Title/i)) {
      currentSection = null;  // Don't capture article titles as pin titles
      console.log(`📍 [PARSER] Skipping Article Title section`);
      continue;
    }

    // NUMBERED OR BULLETED ITEM IN SECTION (New format: "1. Content here" or "* Content here" or "1) Content")
    const numberedDotMatch = trimmedLine.match(/^\d+\.\s+(.+)/);
    const numberedParenMatch = trimmedLine.match(/^\d+\)\s+(.+)/);  // NEW: Match "1) Content"
    const bulletMatch = trimmedLine.match(/^[*\-•]\s+(.+)/);
    // Also match bold numbered format: "**1) Title**" or "**1. Title**"
    const boldNumberedMatch = trimmedLine.match(/^\*\*(\d+)[\.\)]\s*(.+?)\*\*/);
    // ENHANCED: Match descriptions that might span multiple lines or have different formatting
    const descriptionWithQuotes = trimmedLine.match(/^\d+\.\s*["'](.+)/);  // Quoted descriptions: 1. "Description..."
    const descriptionWithDash = trimmedLine.match(/^\d+\.\s*[-–—]\s*(.+)/);  // Dash separator: 1. - Description

    if (currentSection && (numberedDotMatch || numberedParenMatch || bulletMatch || boldNumberedMatch || descriptionWithQuotes || descriptionWithDash)) {
      let content;
      if (boldNumberedMatch) {
        // Extract content from bold format: "**1) Title**"
        content = boldNumberedMatch[2].trim();
      } else if (numberedParenMatch) {
        // Extract content from "1) Title" format
        content = numberedParenMatch[1].trim();
      } else if (descriptionWithQuotes) {
        // Extract from quoted format
        content = descriptionWithQuotes[1].trim();
      } else if (descriptionWithDash) {
        // Extract from dash format
        content = descriptionWithDash[1].trim();
      } else {
        content = (numberedDotMatch ? numberedDotMatch[1] : bulletMatch[1]).trim();
      }

      if (currentSection === 'titles') {
        titles.push(content);
        console.log(`   ✓ Title ${titles.length}: "${content.substring(0, 50)}..."`);
      } else if (currentSection === 'descriptions') {
        // For descriptions, might be multi-line, check next line
        const { content: fullContent, linesConsumed } = extractMultiLineContent(i + 1, lines);
        const finalContent = content + (fullContent ? ' ' + fullContent : '');
        descriptions.push(finalContent);
        console.log(`   ✓ Description ${descriptions.length}: "${finalContent.substring(0, 80)}..."`);
        i += linesConsumed;
      } else if (currentSection === 'overlays') {
        overlays.push(content);
        console.log(`   ✓ Overlay ${overlays.length}: "${content}"`);
      }

      sectionItemCount++;
      continue;
    }

    // SPECIAL CASE FOR DESCRIPTIONS: Sometimes descriptions might not have traditional numbered format
    // but still appear as distinct paragraphs in the descriptions section
    if (currentSection === 'descriptions' && trimmedLine.length > 30 && sectionItemCount < 10) {
      // Check if this looks like a description (long text, not a header)
      if (!trimmedLine.match(/^#{1,3}\s/) && !trimmedLine.toLowerCase().includes('overlay')) {
        // Collect multi-line content
        const { content: fullContent, linesConsumed } = extractMultiLineContent(i + 1, lines);
        const finalContent = trimmedLine + (fullContent ? ' ' + fullContent : '');

        // Only add if it's substantial (at least 50 chars) and doesn't look like a section header
        if (finalContent.length >= 50) {
          descriptions.push(finalContent);
          console.log(`   ✓ Description ${descriptions.length} (paragraph format): "${finalContent.substring(0, 80)}..."`);
          sectionItemCount++;
          i += linesConsumed;
          continue;
        }
      }
    }

    // DEBUG: Log lines that don't match any pattern in descriptions section
    if (currentSection === 'descriptions' && trimmedLine.length > 5) {
      console.log(`   ⚠️ [DEBUG] Unmatched description line: "${trimmedLine.substring(0, 100)}"`);
    }

    // SPECIAL CASE: For titles section, if no numbered/bulleted match, treat non-empty lines as title items
    // This handles the case where titles are listed one per line without numbers
    if (currentSection === 'titles' && trimmedLine.length > 10 && !trimmedLine.match(/^(Article|Suggestions?|If you)/i)) {
      titles.push(trimmedLine);
      console.log(`   ✓ Title ${titles.length}: "${trimmedLine.substring(0, 50)}..."`);
      sectionItemCount++;
      continue;
    }

    // TITLE PATTERNS (Legacy format support)
    // Pattern 1a: **Title N:** (bold with colon, content on next line or inline)
    let match = trimmedLine.match(/^\*\*Title\s+(\d+):\*\*$/i);
    if (match) {
      const index = parseInt(match[1]) - 1;
      // Content is on next line(s)
      const { content, linesConsumed } = extractMultiLineContent(i + 1, lines);
      if (content) {
        titles[index] = content;
        i += linesConsumed;
      }
      continue;
    }

    // Pattern 1b: **Title N:** content (inline bold)
    match = trimmedLine.match(/^\*\*Title\s+(\d+):\*\*\s*(.+)/i);
    if (match) {
      const index = parseInt(match[1]) - 1;
      titles[index] = match[2].trim();
      continue;
    }

    // Pattern 2: Title N: (separate line)
    match = trimmedLine.match(/^Title\s+(\d+):\s*(.*)$/i);
    if (match) {
      const index = parseInt(match[1]) - 1;
      const inlineContent = match[2].trim();

      if (inlineContent) {
        // Content on same line
        titles[index] = inlineContent;
      } else {
        // Content on next line(s)
        const { content, linesConsumed } = extractMultiLineContent(i + 1, lines);
        if (content) {
          titles[index] = content;
          i += linesConsumed;
        }
      }
      continue;
    }

    // Pattern 3: N. Title format
    match = trimmedLine.match(/^(\d+)\.\s*Title:\s*(.+)/i);
    if (match) {
      const index = parseInt(match[1]) - 1;
      titles[index] = match[2].trim();
      continue;
    }

    // DESCRIPTION PATTERNS
    // Pattern 1a: **Description N:** (bold with colon, content on next line)
    match = trimmedLine.match(/^\*\*Description\s+(\d+):\*\*$/i);
    if (match) {
      const index = parseInt(match[1]) - 1;
      const { content, linesConsumed } = extractMultiLineContent(i + 1, lines);
      if (content) {
        descriptions[index] = content;
        i += linesConsumed;
      }
      continue;
    }

    // Pattern 1b: **Description N:** content (inline bold)
    match = trimmedLine.match(/^\*\*Description\s+(\d+):\*\*\s*(.+)/i);
    if (match) {
      const index = parseInt(match[1]) - 1;
      descriptions[index] = match[2].trim();
      continue;
    }

    // Pattern 2: Description N: (separate line)
    match = trimmedLine.match(/^Description\s+(\d+):\s*(.*)$/i);
    if (match) {
      const index = parseInt(match[1]) - 1;
      const inlineContent = match[2].trim();

      if (inlineContent) {
        descriptions[index] = inlineContent;
      } else {
        const { content, linesConsumed } = extractMultiLineContent(i + 1, lines);
        if (content) {
          descriptions[index] = content;
          i += linesConsumed;
        }
      }
      continue;
    }

    // Pattern 3: N. Description format
    match = trimmedLine.match(/^(\d+)\.\s*Description:\s*(.+)/i);
    if (match) {
      const index = parseInt(match[1]) - 1;
      descriptions[index] = match[2].trim();
      continue;
    }

    // TEXT OVERLAY PATTERNS
    // Pattern 1a: **Text Overlay N:** (bold with colon, content on next line)
    match = trimmedLine.match(/^\*\*Text\s+Overlay\s+(\d+):\*\*$/i);
    if (match) {
      const index = parseInt(match[1]) - 1;
      const { content, linesConsumed } = extractMultiLineContent(i + 1, lines);
      if (content) {
        overlays[index] = content;
        i += linesConsumed;
      }
      continue;
    }

    // Pattern 1b: **Text Overlay N:** content (inline bold)
    match = trimmedLine.match(/^\*\*Text\s+Overlay\s+(\d+):\*\*\s*(.+)/i);
    if (match) {
      const index = parseInt(match[1]) - 1;
      overlays[index] = match[2].trim();
      continue;
    }

    // Pattern 2: Text Overlay N: (separate line)
    match = trimmedLine.match(/^Text\s+Overlay\s+(\d+):\s*(.*)$/i);
    if (match) {
      const index = parseInt(match[1]) - 1;
      const inlineContent = match[2].trim();

      if (inlineContent) {
        overlays[index] = inlineContent;
      } else {
        const { content, linesConsumed } = extractMultiLineContent(i + 1, lines);
        if (content) {
          overlays[index] = content;
          i += linesConsumed;
        }
      }
      continue;
    }

    // Pattern 3: N. Text Overlay format
    match = trimmedLine.match(/^(\d+)\.\s*Text\s+Overlay:\s*(.+)/i);
    if (match) {
      const index = parseInt(match[1]) - 1;
      overlays[index] = match[2].trim();
      continue;
    }
  }

  // Clean descriptions: Remove duplicate title text from the beginning
  const cleanedDescriptions = descriptions.map((desc, index) => {
    for (let title of titles) {
      if (desc && desc.startsWith(title)) {
        const cleaned = desc.substring(title.length).trim();
        if (cleaned.length > 50) {
          console.log(`   🧹 Cleaned description ${index + 1}: Removed duplicate title`);
          return cleaned;
        }
      }
    }
    return desc;
  });

  const validTitles = titles.filter(t => t && t.trim()).length;
  const validDescriptions = cleanedDescriptions.filter(d => d && d.trim()).length;
  const validOverlays = overlays.filter(o => o && o.trim()).length;

  console.log(`📊 [ORIGINAL PARSER] Extracted ${validTitles} titles, ${validDescriptions} descriptions, ${validOverlays} overlays`);

  // Log samples for debugging
  if (validTitles > 0) console.log(`   Sample title: "${titles.find(t => t)?.substring(0, 50)}..."`);
  if (validDescriptions > 0) console.log(`   Sample description: "${cleanedDescriptions.find(d => d)?.substring(0, 50)}..."`);

  return { titles, descriptions: cleanedDescriptions, overlays };
}

/**
 * Download a single keyword with retry logic using fresh browser instances
 * @param {string} keyword - Keyword to download
 * @param {Function} progressCallback - Optional callback
 * @param {number} maxRetries - Maximum retry attempts (default: 2)
 * @returns {Promise<Object>} Download result
 */
async function downloadKeywordWithRetry(keyword, progressCallback = null, maxRetries = 2) {
  let lastError = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    let browser = null;

    try {
      if (attempt > 0) {
        console.log(`\n🔄 [RETRY] Attempt ${attempt + 1}/${maxRetries + 1} for "${keyword}" with fresh browser...`);
        if (progressCallback) {
          progressCallback({
            status: 'retrying',
            message: `Retry ${attempt}/${maxRetries} for "${keyword}" with fresh browser...`
          });
        }
        // Wait a bit before retry
        await new Promise(resolve => setTimeout(resolve, 3000));
      }

      // Launch fresh browser for this attempt
      browser = await puppeteer.launch({
        headless: CONFIG.headless,
        executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        userDataDir: CONFIG.userDataDir,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-blink-features=AutomationControlled',
          '--remote-debugging-port=0'
        ],
        defaultViewport: null
      });

      const page = await browser.newPage();

      const client = await page.createCDPSession();
      await client.send('Page.setDownloadBehavior', {
        behavior: 'allow',
        downloadPath: CONFIG.downloadPath
      });

      // Always navigate to PinClicks for each attempt (isFirstKeyword=true)
      const result = await downloadSingleKeyword(page, keyword, progressCallback, true);

      // Success! Close browser and return result
      await browser.close();
      console.log(`✅ [RETRY] Successfully downloaded "${keyword}" on attempt ${attempt + 1}`);
      return { keyword, ...result, success: true };

    } catch (error) {
      lastError = error;
      console.error(`❌ [RETRY] Attempt ${attempt + 1}/${maxRetries + 1} failed for "${keyword}":`, error.message);

      // Close browser if it's still open
      if (browser) {
        try {
          await browser.close();
        } catch (closeError) {
          console.error('⚠️ [RETRY] Error closing browser:', closeError.message);
        }
      }

      // If this wasn't the last attempt, continue to next retry
      if (attempt < maxRetries) {
        console.log(`⏳ [RETRY] Will retry "${keyword}" with fresh browser...`);
      }
    }
  }

  // All attempts failed
  console.error(`❌ [RETRY] All ${maxRetries + 1} attempts failed for "${keyword}"`);
  return { keyword, success: false, error: lastError?.message || 'Unknown error after all retries' };
}

/**
 * Batch process multiple keywords - Phase 1: Download all CSV files from PinClicks
 * @param {Array<string>} keywords - Array of keywords to process
 * @param {Function} progressCallback - Optional callback for progress updates
 * @returns {Promise<Array>} Array of download results with CSV file paths
 */
async function batchDownloadFromPinClicks(keywords, progressCallback = null) {
  console.log(`\n🎯 [PINCLICKS BATCH] Starting batch download for ${keywords.length} keywords`);

  let browser;
  let page; // Declare page outside try block for reassignment in retry logic
  const downloadResults = [];

  try {
    if (progressCallback) {
      progressCallback({ status: 'starting', message: 'Launching browser for batch download...' });
    }

    browser = await puppeteer.launch({
      headless: CONFIG.headless,
      executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      userDataDir: CONFIG.userDataDir,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--remote-debugging-port=0'
      ],
      defaultViewport: null
    });

    page = await browser.newPage();

    const client = await page.createCDPSession();
    await client.send('Page.setDownloadBehavior', {
      behavior: 'allow',
      downloadPath: CONFIG.downloadPath
    });

    // Process each keyword one by one (stay on PinClicks)
    for (let i = 0; i < keywords.length; i++) {
      const keyword = keywords[i];
      const isFirstKeyword = i === 0;
      console.log(`\n📥 [PINCLICKS BATCH] Downloading ${i + 1}/${keywords.length}: "${keyword}"`);

      if (progressCallback) {
        progressCallback({
          status: 'downloading',
          message: `Downloading ${i + 1}/${keywords.length}: "${keyword}"`,
          current: i + 1,
          total: keywords.length
        });
      }

      try {
        const result = await downloadSingleKeyword(page, keyword, progressCallback, isFirstKeyword);
        downloadResults.push({ keyword, ...result, success: true });
      } catch (error) {
        console.error(`❌ [PINCLICKS BATCH] Error downloading "${keyword}":`, error.message);

        // FALLBACK: Try with fresh browser (2 more attempts)
        console.log(`🔄 [FALLBACK] Starting retry with fresh browser for "${keyword}"...`);

        // Close current browser before retry
        if (browser) {
          try {
            await browser.close();
          } catch (closeError) {
            console.error('⚠️ [FALLBACK] Error closing browser:', closeError.message);
          }
        }

        // Retry with fresh browser instances
        const retryResult = await downloadKeywordWithRetry(keyword, progressCallback, 2);
        downloadResults.push(retryResult);

        // If retry succeeded, reopen main browser for next keywords
        if (retryResult.success && i < keywords.length - 1) {
          console.log('🔄 [FALLBACK] Reopening main browser for remaining keywords...');
          browser = await puppeteer.launch({
            headless: CONFIG.headless,
            executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
            userDataDir: CONFIG.userDataDir,
            args: [
              '--no-sandbox',
              '--disable-setuid-sandbox',
              '--disable-blink-features=AutomationControlled',
              '--remote-debugging-port=0'
            ],
            defaultViewport: null
          });

          page = await browser.newPage();
          const client = await page.createCDPSession();
          await client.send('Page.setDownloadBehavior', {
            behavior: 'allow',
            downloadPath: CONFIG.downloadPath
          });

          // Navigate to PinClicks for next iteration
          await page.goto('https://app.pinclicks.com/pins', {
            waitUntil: 'domcontentloaded',
            timeout: 60000
          });
          await new Promise(resolve => setTimeout(resolve, CONFIG.waitTime));
        }
      }

      // Small delay between downloads (but stay on PinClicks)
      if (i < keywords.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    console.log(`\n✅ [PINCLICKS BATCH] Completed downloading ${downloadResults.filter(r => r.success).length}/${keywords.length} keywords`);

  } catch (error) {
    console.error(`❌ [PINCLICKS BATCH] Fatal error during batch download:`, error);
    console.error('Error stack:', error.stack);
    throw error;
  } finally {
    if (browser) {
      console.log('🔒 [PINCLICKS BATCH] Closing browser...');
      await browser.close();
    }
  }

  console.log('🔍 [PINCLICKS BATCH] Returning downloadResults:', downloadResults.length, 'items');
  console.log('🔍 [PINCLICKS BATCH] downloadResults structure:', JSON.stringify(downloadResults, null, 2));
  return downloadResults;
}

/**
 * Download CSV for a single keyword from PinClicks
 * @param {Page} page - Puppeteer page instance
 * @param {string} keyword - Keyword to search
 * @param {Function} progressCallback - Optional callback
 * @param {boolean} isFirstKeyword - Whether this is the first keyword (navigate to PinClicks)
 * @returns {Promise<Object>} Download result with CSV filename
 */
async function downloadSingleKeyword(page, keyword, progressCallback = null, isFirstKeyword = false) {
  // Only navigate to PinClicks on the first keyword
  if (isFirstKeyword) {
    await page.goto('https://app.pinclicks.com/pins', {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    });
    await new Promise(resolve => setTimeout(resolve, CONFIG.waitTime));
  }

  // Search for keyword
  const searchBox = await page.waitForSelector('input[type="search"], input[placeholder*="Search"]', {
    timeout: 10000
  });

  if (!searchBox) {
    throw new Error('Could not find search box');
  }

  await searchBox.click({ clickCount: 3 });
  await searchBox.type(keyword);
  await searchBox.press('Enter');

  await new Promise(resolve => setTimeout(resolve, 3000));

  // Wait for data to finish loading with enhanced retry logic
  let loadingComplete = false;
  let attempts = 0;
  const maxAttemptsBeforeRefresh = 90;
  const maxAttemptsTotal = 300;
  let refreshCount = 0;
  const maxRefreshes = 3;

  while (!loadingComplete && attempts < maxAttemptsTotal) {
    const hasLoading = await page.evaluate(() => {
      const cells = Array.from(document.querySelectorAll('td, [role="cell"]'));
      return cells.some(cell => {
        const text = cell.textContent?.trim().toLowerCase();
        return text === 'loading...' || text === 'loading';
      });
    });

    if (!hasLoading) {
      loadingComplete = true;
      console.log('✅ [PINCLICKS] Data loaded successfully');
    } else {
      attempts++;

      if (attempts % 5 === 0) {
        const elapsedMinutes = Math.floor((attempts * 2) / 60);
        const elapsedSeconds = (attempts * 2) % 60;
        console.log(`⏳ [PINCLICKS] Still loading... (${elapsedMinutes}m ${elapsedSeconds}s)`);
      }

      if (attempts % maxAttemptsBeforeRefresh === 0 && attempts > 0 && refreshCount < maxRefreshes) {
        refreshCount++;
        console.log(`⚠️ [PINCLICKS] Refreshing page (attempt ${refreshCount}/${maxRefreshes})...`);

        await page.reload({ waitUntil: 'domcontentloaded' });
        await new Promise(resolve => setTimeout(resolve, 3000));

        const searchBox = await page.waitForSelector('input[type="search"], input[placeholder*="Search"]', {
          timeout: 10000
        });

        if (searchBox) {
          await searchBox.click({ clickCount: 3 });
          await searchBox.type(keyword);
          await searchBox.press('Enter');
          await new Promise(resolve => setTimeout(resolve, 3000));
        }

        attempts = 0;
      }

      if (attempts >= maxAttemptsTotal) {
        console.log(`⚠️ [PINCLICKS] Loading exceeded 10 minutes. Continuing anyway...`);
        break;
      }

      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  await new Promise(resolve => setTimeout(resolve, 3000));

  // Click Export button
  const exportClicked = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const exportBtn = buttons.find(btn => btn.textContent && btn.textContent.includes('Export'));
    if (exportBtn) {
      exportBtn.click();
      return true;
    }
    return false;
  });

  if (!exportClicked) {
    throw new Error('Could not find Export button');
  }

  await new Promise(resolve => setTimeout(resolve, 3000));

  // Click "Annotated Interests"
  const annotatedClicked = await page.evaluate(() => {
    const elements = Array.from(document.querySelectorAll('*'));
    const target = elements.find(el => {
      if (!el.textContent || el.offsetParent === null) return false;
      const text = el.textContent.trim().toLowerCase();
      return text === 'annotated interests' || text === 'annotated interest';
    });
    if (target) {
      target.click();
      return true;
    }
    return false;
  });

  if (!annotatedClicked) {
    throw new Error('Could not find Annotated Interests option');
  }

  await new Promise(resolve => setTimeout(resolve, 10000));

  // Find downloaded CSV file
  const files = fs.readdirSync(CONFIG.downloadPath);
  const csvFile = files.filter(f => f.endsWith('.csv')).sort((a, b) => {
    return fs.statSync(path.join(CONFIG.downloadPath, b)).mtime -
           fs.statSync(path.join(CONFIG.downloadPath, a)).mtime;
  })[0];

  if (!csvFile) {
    throw new Error('CSV file not downloaded');
  }

  console.log(`✅ [PINCLICKS] Downloaded: ${csvFile}`);

  return { csvFileName: csvFile };
}

/**
 * Batch process CSV files through ChatGPT - Phase 2: Analyze in batches of 5
 * @param {Array<Object>} downloadResults - Results from Phase 1 with CSV filenames
 * @param {Function} progressCallback - Optional callback for progress updates
 * @returns {Promise<Array>} Array of analysis results
 */
async function batchAnalyzeWithChatGPT(downloadResults, progressCallback = null) {
  console.log(`\n🤖 [CHATGPT BATCH] Starting batch analysis for ${downloadResults.length} files`);

  const batchSize = 5;
  const allResults = [];
  const batches = [];

  // Group into batches of 5
  for (let i = 0; i < downloadResults.length; i += batchSize) {
    batches.push(downloadResults.slice(i, i + batchSize));
  }

  console.log(`📦 [CHATGPT BATCH] Processing ${batches.length} batches (${batchSize} files per batch)`);

  // Process each batch
  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    const batch = batches[batchIndex];
    console.log(`\n🔄 [CHATGPT BATCH] Processing batch ${batchIndex + 1}/${batches.length}`);

    if (progressCallback) {
      progressCallback({
        status: 'analyzing',
        message: `Processing ChatGPT batch ${batchIndex + 1}/${batches.length}`,
        batchCurrent: batchIndex + 1,
        batchTotal: batches.length
      });
    }

    const batchResults = await processChatGPTBatch(batch, progressCallback);
    allResults.push(...batchResults);

    // Small delay between batches
    if (batchIndex < batches.length - 1) {
      console.log('⏳ [CHATGPT BATCH] Waiting 5 seconds before next batch...');
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }

  console.log(`\n✅ [CHATGPT BATCH] Completed analyzing ${allResults.length} files`);
  return allResults;
}

/**
 * Process a single batch of up to 5 files in ChatGPT
 * @param {Array<Object>} batch - Batch of download results
 * @param {Function} progressCallback - Optional callback
 * @returns {Promise<Array>} Analysis results for this batch
 */
async function processChatGPTBatch(batch, progressCallback = null) {
  let browser;
  const batchResults = [];

  try {
    browser = await puppeteer.launch({
      headless: CONFIG.headless,
      executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      userDataDir: CONFIG.userDataDir,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--remote-debugging-port=0'
      ],
      defaultViewport: null
    });

    const page = await browser.newPage();

    // Navigate to ChatGPT once for the batch
    console.log('🤖 [CHATGPT] Opening ChatGPT...');
    await page.goto('https://chatgpt.com/g/g-d4MhHvQzg-pin-seo-analysis', {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    });
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Process each file in the batch
    for (let i = 0; i < batch.length; i++) {
      const item = batch[i];

      if (!item.success) {
        batchResults.push({ keyword: item.keyword, success: false, error: item.error });
        continue;
      }

      // CRITICAL FIX: Start a COMPLETELY fresh ChatGPT conversation for each keyword (except the first)
      // This prevents context bleeding and ensures each keyword gets unique content
      if (i > 0) {
        console.log(`\n🆕 [NEW CHAT] Starting completely fresh ChatGPT conversation for keyword ${i + 1}/${batch.length}: "${item.keyword}"...`);
        try {
          // Method 1: Try to click "New chat" button (more reliable)
          console.log('🔘 [NEW CHAT] Attempting to click "New chat" button...');
          const newChatClicked = await page.evaluate(() => {
            // Look for the New chat button
            const buttons = Array.from(document.querySelectorAll('a, button'));
            const newChatButton = buttons.find(btn => {
              const text = (btn.textContent || btn.innerText || '').toLowerCase().trim();
              return text.includes('new chat') || text === 'new' || text.includes('nouveau');
            });
            if (newChatButton) {
              newChatButton.click();
              return true;
            }
            return false;
          });

          if (newChatClicked) {
            console.log('✅ [NEW CHAT] Successfully clicked "New chat" button');
            await new Promise(resolve => setTimeout(resolve, 3000)); // Wait for new chat to load
          } else {
            // Method 2: Fallback to URL navigation
            console.log('⚠️ [NEW CHAT] "New chat" button not found, falling back to URL reload...');
            await page.goto('https://chatgpt.com/g/g-d4MhHvQzg-pin-seo-analysis', {
              waitUntil: 'domcontentloaded',
              timeout: 60000
            });
            await new Promise(resolve => setTimeout(resolve, 5000));
          }

          console.log(`✅ [NEW CHAT] Fresh chat session ready for "${item.keyword}"`);
        } catch (navError) {
          console.error(`❌ [NEW CHAT] Failed to start new chat:`, navError.message);
          batchResults.push({ keyword: item.keyword, success: false, error: `Failed to start new chat: ${navError.message}` });
          continue;
        }
      }

      console.log(`\n🔍 [CHATGPT] Analyzing ${i + 1}/${batch.length} in batch: "${item.keyword}"`);

      try {
        const result = await analyzeSingleFile(page, item.keyword, item.csvFileName, progressCallback);
        batchResults.push({ keyword: item.keyword, ...result, success: true });
      } catch (error) {
        console.error(`❌ [CHATGPT] Error analyzing "${item.keyword}":`, error.message);
        batchResults.push({ keyword: item.keyword, success: false, error: error.message });
      }

      // Small delay between files in the same batch
      if (i < batch.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }

  } catch (error) {
    console.error(`❌ [CHATGPT BATCH] Fatal error:`, error);
    throw error;
  } finally {
    if (browser) {
      console.log('🔒 [CHATGPT] Closing browser...');
      await browser.close();
    }
  }

  return batchResults;
}

/**
 * Generate Pinterest content using OpenAI API as fallback
 * @param {string} keyword - The keyword/recipe to generate content for
 * @returns {Promise<Object>} Generated titles, descriptions, and overlays
 */
async function generatePinterestContentFallback(keyword) {
  console.log(`\n🤖 [OPENAI FALLBACK] Generating Pinterest content for "${keyword}" using OpenAI API...`);

  try {
    // Load OpenAI configuration
    const OpenAI = require('openai');
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });

    const pinCount = 3; // Generate 3 variations
    const language = process.env.DEFAULT_LANGUAGE || 'English';

    // Generate titles
    console.log(`📝 [OPENAI FALLBACK] Generating ${pinCount} Pinterest titles...`);
    const titlePrompt = `You are a Pinterest marketing expert. Generate ${pinCount} different catchy Pinterest Pin titles for the recipe: "${keyword}".

Language: ${language}
Return ONLY an array of ${pinCount} titles, one per line, numbered 1-${pinCount}.`;

    const titleResponse = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        { role: 'system', content: 'You are a Pinterest marketing expert specialized in creating engaging pin titles.' },
        { role: 'user', content: titlePrompt }
      ],
      temperature: 0.8
    });

    const titleText = titleResponse.choices[0].message.content;
    const titles = titleText.split('\n')
      .filter(line => line.trim())
      .map(line => line.replace(/^\d+[\.)]\s*/, '').trim())
      .filter(title => title.length > 0)
      .slice(0, pinCount);

    console.log(`✅ [OPENAI FALLBACK] Generated ${titles.length} titles`);

    // Generate descriptions
    console.log(`📝 [OPENAI FALLBACK] Generating ${pinCount} Pinterest descriptions...`);
    const descPrompt = `You are a Pinterest marketing expert. Generate ${pinCount} different engaging Pinterest Pin descriptions for the recipe: "${keyword}".

Titles to work with:
${titles.map((t, i) => `${i + 1}. ${t}`).join('\n')}

Language: ${language}
Return ONLY an array of ${pinCount} descriptions, one per line, numbered 1-${pinCount}. Each description should be 2-3 sentences and engaging.`;

    const descResponse = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        { role: 'system', content: 'You are a Pinterest marketing expert specialized in creating compelling pin descriptions.' },
        { role: 'user', content: descPrompt }
      ],
      temperature: 0.8
    });

    const descText = descResponse.choices[0].message.content;
    const descriptions = descText.split('\n')
      .filter(line => line.trim())
      .map(line => line.replace(/^\d+[\.)]\s*/, '').trim())
      .filter(desc => desc.length > 0)
      .slice(0, pinCount);

    console.log(`✅ [OPENAI FALLBACK] Generated ${descriptions.length} descriptions`);

    // Generate overlay text
    console.log(`📝 [OPENAI FALLBACK] Generating ${pinCount} text overlays...`);
    const overlayPrompt = `You are a Pinterest marketing expert. Generate ${pinCount} different short text overlays for Pinterest images for the recipe: "${keyword}".

Each overlay should be 4-7 words maximum and eye-catching.
Language: ${language}
Return ONLY an array of ${pinCount} text overlays, one per line, numbered 1-${pinCount}.`;

    const overlayResponse = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        { role: 'system', content: 'You are a Pinterest visual marketing expert specialized in creating impactful image text overlays.' },
        { role: 'user', content: overlayPrompt }
      ],
      temperature: 0.8
    });

    const overlayText = overlayResponse.choices[0].message.content;
    const overlays = overlayText.split('\n')
      .filter(line => line.trim())
      .map(line => line.replace(/^\d+[\.)]\s*/, '').trim())
      .filter(overlay => overlay.length > 0)
      .slice(0, pinCount);

    console.log(`✅ [OPENAI FALLBACK] Generated ${overlays.length} text overlays`);

    console.log(`\n🎉 [OPENAI FALLBACK] Successfully generated Pinterest content using OpenAI API`);
    console.log(`   Titles: ${titles.length}, Descriptions: ${descriptions.length}, Overlays: ${overlays.length}`);

    return {
      titles: titles,
      descriptions: descriptions,
      overlays: overlays,
      source: 'openai-fallback'
    };

  } catch (error) {
    console.error(`❌ [OPENAI FALLBACK] Error generating content:`, error.message);
    throw error;
  }
}

/**
 * Analyze a single CSV file with ChatGPT (with retry logic for parsing failures)
 * If all retries fail, falls back to OpenAI API generation
 * @param {Page} page - Puppeteer page instance
 * @param {string} keyword - Original keyword
 * @param {string} csvFileName - CSV filename to upload
 * @param {Function} progressCallback - Optional callback
 * @returns {Promise<Object>} Analysis result
 */
async function analyzeSingleFile(page, keyword, csvFileName, progressCallback = null) {
  const csvFilePath = path.join(CONFIG.downloadPath, csvFileName);
  const maxRetries = 3;
  let attempt = 0;
  let lastError = null;

  while (attempt < maxRetries) {
    attempt++;

    if (attempt > 1) {
      console.log(`\n🔄 [CHATGPT RETRY] Attempt ${attempt}/${maxRetries} for "${keyword}"`);
      if (progressCallback) {
        progressCallback({
          status: 'retrying',
          message: `Retry attempt ${attempt}/${maxRetries} for "${keyword}"`
        });
      }
    }

    try {
      // Upload file
      const fileInput = await page.$('input[type="file"]');
      if (!fileInput) {
        throw new Error('Could not find file upload button');
      }

      await fileInput.uploadFile(csvFilePath);
      await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for file to attach

      // Type the formatting instruction message with KEYWORD IDENTIFIER
      try {
        const formattingInstruction = `ANALYZING KEYWORD: "${keyword}"

Analyze this CSV for the recipe "${keyword}" and create Pinterest content in this EXACT format:

# Pinterest Pin Titles (4) for "${keyword}"
1. [Title text]
2. [Title text]
3. [Title text]
4. [Title text]

# Pinterest Pin Descriptions for "${keyword}"
1. [Complete description in ONE line]

2. [Complete description in ONE line]

3. [Complete description in ONE line]

4. [Complete description in ONE line]

# Text Overlay Suggestions
1. [Overlay text]
2. [Overlay text]
3. [Overlay text]
4. [Overlay text]

CRITICAL: Each description must be numbered (1., 2., 3., 4.) with blank lines between them. Each description should be 150-250 characters on ONE line.`;

        // Insert the message instantly using page.evaluate (instead of slow typing)
        const result = await page.evaluate((message) => {
          // Try to find the message box (textarea or contenteditable div)
          let messageBox = document.querySelector('textarea[data-id]');
          let method = 'textarea[data-id]';

          if (!messageBox) {
            messageBox = document.querySelector('textarea[placeholder*="Message"]');
            method = 'textarea[placeholder]';
          }
          if (!messageBox) {
            messageBox = document.querySelector('div[contenteditable="true"]');
            method = 'contenteditable div';
          }

          if (messageBox) {
            messageBox.focus();

            // Handle textarea vs contenteditable differently
            if (messageBox.tagName === 'TEXTAREA' || messageBox.tagName === 'INPUT') {
              messageBox.value = message;
            } else {
              // For contenteditable div
              messageBox.textContent = message;
            }

            // Trigger input event so ChatGPT recognizes the text
            const inputEvent = new Event('input', { bubbles: true });
            messageBox.dispatchEvent(inputEvent);

            // Also trigger change event for good measure
            const changeEvent = new Event('change', { bubbles: true });
            messageBox.dispatchEvent(changeEvent);

            return { success: true, method: method, tagName: messageBox.tagName };
          }
          return { success: false };
        }, formattingInstruction);

        if (result.success) {
          console.log(`📝 [CHATGPT] Added formatting instructions via ${result.method} (${result.tagName})`);
        } else {
          console.log('⚠️ [CHATGPT] Could not find message box for formatting instructions');
        }

        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for UI to update
      } catch (msgError) {
        console.log('⚠️ [CHATGPT] Could not add formatting instructions, proceeding without them:', msgError.message);
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      // Send the message
      await page.keyboard.press('Enter');

      // Wait for ChatGPT to finish responding (reflection mode takes longer)
      let responseComplete = false;
      let responseAttempts = 0;
      const maxWaitTime = 180; // Increased from 90s to 180s (3 minutes) for reflection mode

      while (!responseComplete && responseAttempts < maxWaitTime) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        responseAttempts++;

        const isGenerating = await page.evaluate(() => {
          const stopButton = Array.from(document.querySelectorAll('button'))
            .find(btn => btn.textContent?.toLowerCase().includes('stop'));
          return !!stopButton;
        });

        // Wait longer before considering complete (reflection mode)
        if (!isGenerating && responseAttempts > 60) { // Increased from 45s to 60s
          responseComplete = true;
        }

        // Log progress every 15 seconds for long waits
        if (responseAttempts % 15 === 0) {
          console.log(`⏳ [CHATGPT] Still generating... (${responseAttempts}s elapsed)`);
        }
      }

      await new Promise(resolve => setTimeout(resolve, 5000)); // Increased from 3s to 5s

      // Try to get content directly from page first (more reliable than clipboard)
      console.log('📄 [CHATGPT] Attempting to extract content directly from page...');
      let copiedContent = await page.evaluate(() => {
        // Find the last assistant message
        const messages = Array.from(document.querySelectorAll('[data-message-author-role="assistant"]'));
        if (messages.length === 0) return null;

        const lastMessage = messages[messages.length - 1];

        // Try multiple methods to get complete content
        let textContent = '';

        // Method 1: Get all text from all child elements (most complete)
        const allTextElements = lastMessage.querySelectorAll('p, li, h1, h2, h3, h4, code, pre, span, div');
        if (allTextElements.length > 0) {
          textContent = Array.from(allTextElements)
            .map(el => el.innerText || el.textContent)
            .filter(text => text && text.trim())
            .join('\n');
        }

        // Method 2: Fallback to innerText of entire message
        if (!textContent || textContent.length < 100) {
          textContent = lastMessage.innerText || lastMessage.textContent;
        }

        return textContent;
      });

      // If direct extraction worked, use it
      if (copiedContent && copiedContent.length >= 50) {
        console.log(`✅ [CHATGPT] Successfully extracted ${copiedContent.length} characters directly from page`);
      } else {
        // Fallback to clipboard method
        console.log('⚠️ [CHATGPT] Direct extraction failed, trying clipboard method...');

        // Click copy button
        const copyClicked = await page.evaluate(() => {
          const buttons = Array.from(document.querySelectorAll('button'));
          const copyButtons = buttons.filter(btn => {
            const ariaLabel = btn.getAttribute('aria-label')?.toLowerCase() || '';
            const title = btn.getAttribute('title')?.toLowerCase() || '';
            const text = btn.textContent?.toLowerCase() || '';
            const copyKeywords = ['copy', 'copier', 'copiar', 'kopieren'];
            return copyKeywords.some(keyword =>
              ariaLabel.includes(keyword) || title.includes(keyword) ||
              (text.includes(keyword) && text.length < 20)
            );
          });
          const copyButton = copyButtons[copyButtons.length - 1];
          if (copyButton) {
            copyButton.click();
            return true;
          }
          return false;
        });

        if (!copyClicked) {
          throw new Error('Could not find copy button and direct extraction failed');
        }

        console.log('⏳ [CHATGPT] Waiting for clipboard copy (reflection mode takes longer)...');
        await new Promise(resolve => setTimeout(resolve, 8000)); // Increased from 5s to 8s for reflection mode

        // Read clipboard content with extended retry logic
        copiedContent = null;
        let copyAttempts = 0;
        const maxCopyAttempts = 5; // Increased from 3 to 5

        while (!copiedContent && copyAttempts < maxCopyAttempts) {
          copyAttempts++;
          console.log(`📋 [CHATGPT] Clipboard read attempt ${copyAttempts}/${maxCopyAttempts}...`);

          copiedContent = await page.evaluate(async () => {
            try {
              const text = await navigator.clipboard.readText();
              return text;
            } catch (err) {
              return null;
            }
          });

          if (!copiedContent || copiedContent.length < 50) {
            console.log(`⚠️ [CHATGPT] Clipboard read attempt ${copyAttempts} failed or too short (got ${copiedContent?.length || 0} chars), retrying...`);
            await new Promise(resolve => setTimeout(resolve, 3000)); // Increased from 2s to 3s
          } else {
            console.log(`✅ [CHATGPT] Successfully read ${copiedContent.length} characters from clipboard`);
          }
        }

        if (!copiedContent || copiedContent.length < 50) {
          throw new Error('Could not read clipboard content');
        }
      }

      // Save raw content
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      const rawFileName = `chatgpt-raw-${keyword.replace(/\s+/g, '-').substring(0, 30)}-${timestamp}.txt`;
      fs.writeFileSync(path.join(CONFIG.downloadPath, rawFileName), copiedContent, 'utf8');

      // Parse results with AI-powered parser (WITH KEYWORD VALIDATION)
      console.log(`🔍 [PARSER] Parsing content for keyword: "${keyword}"`);
      const parsed = await parseResults(copiedContent, keyword);

      // VALIDATION: Check if we got valid titles and descriptions
      const validTitles = parsed.titles.filter(t => t && t.trim()).length;
      const validDescriptions = parsed.descriptions.filter(d => d && d.trim()).length;

      console.log(`📊 [VALIDATION] Attempt ${attempt} for "${keyword}": Found ${validTitles} titles, ${validDescriptions} descriptions`);

      // If we have at least 1 title and 1 description, consider it successful
      if (validTitles >= 1 && validDescriptions >= 1) {
        console.log(`✅ [CHATGPT] Successfully parsed data on attempt ${attempt}`);
        return {
          titles: parsed.titles,
          descriptions: parsed.descriptions,
          overlays: parsed.overlays,
          rawContent: copiedContent,
          rawFileName: rawFileName,
          csvFileName: csvFileName,
          source: 'chatgpt'
        };
      } else {
        // Parsing failed - data doesn't contain expected format
        lastError = new Error(`Parsing validation failed: Found ${validTitles} titles and ${validDescriptions} descriptions (expected at least 1 of each)`);
        console.log(`⚠️ [VALIDATION] Attempt ${attempt} failed: ${lastError.message}`);

        if (attempt < maxRetries) {
          // Start a NEW chat session for attempts 2 and 3
          if (attempt >= 1) {
            console.log(`🆕 [NEW CHAT] Starting fresh ChatGPT conversation for attempt ${attempt + 1}...`);
            try {
              // Navigate to new chat
              await page.goto('https://chatgpt.com/g/g-d4MhHvQzg-pin-seo-analysis', {
                waitUntil: 'domcontentloaded',
                timeout: 60000
              });
              await new Promise(resolve => setTimeout(resolve, 5000));
              console.log(`✅ [NEW CHAT] Fresh chat session started for attempt ${attempt + 1}`);
            } catch (navError) {
              console.error(`❌ [NEW CHAT] Failed to start new chat:`, navError.message);
            }
          }
          // Wait before retry
          await new Promise(resolve => setTimeout(resolve, 3000));
        }
        continue;
      }

    } catch (error) {
      lastError = error;
      console.error(`❌ [CHATGPT] Attempt ${attempt} error:`, error.message);

      if (attempt < maxRetries) {
        // Start a NEW chat session for attempts 2 and 3
        if (attempt >= 1) {
          console.log(`🆕 [NEW CHAT] Starting fresh ChatGPT conversation after error (attempt ${attempt + 1})...`);
          try {
            // Navigate to new chat
            await page.goto('https://chatgpt.com/g/g-d4MhHvQzg-pin-seo-analysis', {
              waitUntil: 'domcontentloaded',
              timeout: 60000
            });
            await new Promise(resolve => setTimeout(resolve, 5000));
            console.log(`✅ [NEW CHAT] Fresh chat session started for attempt ${attempt + 1}`);
          } catch (navError) {
            console.error(`❌ [NEW CHAT] Failed to start new chat:`, navError.message);
          }
        }
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
      continue;
    }
  }

  // All ChatGPT retries exhausted - Fall back to OpenAI API
  console.log(`\n⚠️ [CHATGPT] All ${maxRetries} ChatGPT attempts failed for "${keyword}"`);
  console.log(`🔄 [FALLBACK] Switching to OpenAI API for content generation...`);

  if (progressCallback) {
    progressCallback({
      status: 'fallback',
      message: `ChatGPT parsing failed. Generating content with OpenAI API...`
    });
  }

  try {
    const openaiContent = await generatePinterestContentFallback(keyword);
    console.log(`✅ [FALLBACK] Successfully generated content using OpenAI API`);
    return openaiContent;
  } catch (fallbackError) {
    console.error(`❌ [FALLBACK] OpenAI fallback also failed:`, fallbackError.message);
    throw new Error(`All methods failed. ChatGPT: ${lastError?.message || 'Unknown error'}. OpenAI: ${fallbackError.message}`);
  }
}

/**
 * Main batch automation function - combines both phases
 * @param {Array<string>} keywords - Array of keywords to process
 * @param {Function} progressCallback - Optional callback for progress updates
 * @returns {Promise<Array>} Complete results for all keywords
 */
async function runBatchPinclicksAutomation(keywords, progressCallback = null) {
  console.log(`\n🚀 [PINCLICKS BATCH] Starting full batch automation for ${keywords.length} keywords`);

  try {
    // Phase 1: Download all CSV files from PinClicks
    if (progressCallback) {
      progressCallback({ status: 'phase1', message: 'Phase 1: Downloading all CSV files from PinClicks...' });
    }

    console.log('📥 [PINCLICKS BATCH] About to call batchDownloadFromPinClicks...');
    const downloadResults = await batchDownloadFromPinClicks(keywords, progressCallback);
    console.log(`✅ [PINCLICKS BATCH] Phase 1 complete. Downloaded ${downloadResults.length} results`);
    console.log('📊 [PINCLICKS BATCH] Download results:', JSON.stringify(downloadResults, null, 2));

    // Phase 2: Analyze all CSV files with ChatGPT in batches of 5
    if (progressCallback) {
      progressCallback({ status: 'phase2', message: 'Phase 2: Analyzing files with ChatGPT...' });
    }

    console.log('🤖 [PINCLICKS BATCH] About to call batchAnalyzeWithChatGPT...');
    const analysisResults = await batchAnalyzeWithChatGPT(downloadResults, progressCallback);
    console.log(`✅ [PINCLICKS BATCH] Phase 2 complete. Analyzed ${analysisResults.length} results`);

    console.log(`\n✅ [PINCLICKS BATCH] Batch automation complete!`);
    console.log(`   Downloaded: ${downloadResults.filter(r => r.success).length}/${keywords.length}`);
    console.log(`   Analyzed: ${analysisResults.filter(r => r.success).length}/${keywords.length}`);

    if (progressCallback) {
      progressCallback({
        status: 'complete',
        message: 'Batch automation completed successfully',
        results: analysisResults
      });
    }

    return analysisResults;

  } catch (error) {
    console.error(`❌ [PINCLICKS BATCH] Fatal error:`, error);

    if (progressCallback) {
      progressCallback({
        status: 'error',
        message: `Error: ${error.message}`
      });
    }

    throw error;
  }
}

/**
 * Process a single keyword through pinclicks automation
 * Downloads from PinClicks, analyzes with ChatGPT, falls back to OpenAI if ChatGPT fails
 * @param {string} keyword - The keyword/recipe title to search
 * @param {Object} progressCallback - Optional callback for progress updates
 * @returns {Promise<Object>} Parsed pinclicks content
 */
async function runPinclicksAutomation(keyword, progressCallback = null) {
  console.log(`\n🎯 [PINCLICKS] Starting automation for keyword: "${keyword}"`);

  let browser;
  let page;

  try {
    // Progress update: Starting
    if (progressCallback) {
      progressCallback({ status: 'starting', message: 'Launching browser...' });
    }

    // Clean Chrome lock files before launching
    console.log('🧹 [PINCLICKS] Cleaning Chrome lock files...');
    cleanChromeLocks();

    // Launch browser with improved error handling
    console.log('🌐 [PINCLICKS] Launching browser...');

    try {
      // Try bundled Chromium first (more stable, no version conflicts)
      const launchOptions = {
        headless: CONFIG.headless,
        userDataDir: CONFIG.userDataDir,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--disable-gpu',
          '--disable-blink-features=AutomationControlled',
          '--disable-web-security',
          '--disable-features=IsolateOrigins,site-per-process',
          '--disable-extensions'
        ],
        ignoreDefaultArgs: ['--enable-automation'],
        defaultViewport: null,
        protocolTimeout: 180000, // 3 minutes
        handleSIGINT: false,
        handleSIGTERM: false,
        handleSIGHUP: false
      };

      console.log('🔍 [PINCLICKS] Attempting launch with bundled Chromium...');

      try {
        // First attempt: Use Puppeteer's bundled Chromium (no executablePath)
        browser = await puppeteer.launch(launchOptions);
        console.log('✅ [PINCLICKS] Launched successfully with bundled Chromium');
      } catch (chromiumError) {
        console.log('⚠️ [PINCLICKS] Bundled Chromium failed, trying system Chrome...');
        console.log('   Error:', chromiumError.message);

        // Second attempt: Fallback to system Chrome
        launchOptions.executablePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
        browser = await puppeteer.launch(launchOptions);
        console.log('✅ [PINCLICKS] Launched successfully with system Chrome');
      }

    } catch (launchError) {
      console.error('❌ [PINCLICKS] Browser launch failed:', launchError.message);
      throw new Error(`Failed to launch browser: ${launchError.message}. Try closing all Chrome windows and try again.`);
    }

    // Create new page with error handling
    try {
      page = await browser.newPage();
      console.log('✅ [PINCLICKS] New page created');
    } catch (pageError) {
      console.error('❌ [PINCLICKS] Failed to create new page:', pageError.message);
      if (browser) await browser.close();
      throw new Error(`Failed to create browser page: ${pageError.message}`);
    }

    // Set download behavior with error handling
    try {
      const client = await page.target().createCDPSession();
      await client.send('Page.setDownloadBehavior', {
        behavior: 'allow',
        downloadPath: CONFIG.downloadPath
      });
      console.log('✅ [PINCLICKS] Download behavior configured');
    } catch (cdpError) {
      console.warn('⚠️ [PINCLICKS] Could not set download behavior:', cdpError.message);
      // Continue anyway - downloads might still work
    }

    // Progress update: Navigating to pinclicks
    if (progressCallback) {
      progressCallback({ status: 'navigating', message: 'Navigating to PinClicks...' });
    }

    // Navigate to PinClicks Top Pins
    console.log('📍 [PINCLICKS] Navigating to PinClicks...');
    await page.goto('https://app.pinclicks.com/pins', {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    });

    await new Promise(resolve => setTimeout(resolve, CONFIG.waitTime));

    // Progress update: Searching
    if (progressCallback) {
      progressCallback({ status: 'searching', message: `Searching for "${keyword}"...` });
    }

    // Find and interact with search bar
    console.log(`🔍 [PINCLICKS] Searching for keyword: "${keyword}"`);
    const searchBox = await page.waitForSelector('input[type="search"], input[placeholder*="Search"]', {
      timeout: 10000
    });

    if (!searchBox) {
      throw new Error('Could not find search box');
    }

    // Search for keyword
    await searchBox.click({ clickCount: 3 }); // Select all
    await searchBox.type(keyword);
    await searchBox.press('Enter');

    console.log('⏳ [PINCLICKS] Waiting for search results to load...');
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Progress update: Waiting for data
    if (progressCallback) {
      progressCallback({ status: 'loading', message: 'Waiting for data to load...' });
    }

    // Wait for data to finish loading with enhanced retry logic
    let loadingComplete = false;
    let attempts = 0;
    const maxAttemptsBeforeRefresh = 90; // 3 minutes (90 * 2s = 180s)
    const maxAttemptsTotal = 300; // 10 minutes (300 * 2s = 600s)
    let refreshCount = 0;
    const maxRefreshes = 3;

    while (!loadingComplete && attempts < maxAttemptsTotal) {
      const hasLoading = await page.evaluate(() => {
        const cells = Array.from(document.querySelectorAll('td, [role="cell"]'));
        return cells.some(cell => {
          const text = cell.textContent?.trim().toLowerCase();
          return text === 'loading...' || text === 'loading';
        });
      });

      if (!hasLoading) {
        loadingComplete = true;
        console.log('✅ [PINCLICKS] Data loaded successfully');
      } else {
        attempts++;

        // Progress update every 10 seconds
        if (attempts % 5 === 0) {
          const elapsedMinutes = Math.floor((attempts * 2) / 60);
          const elapsedSeconds = (attempts * 2) % 60;
          console.log(`⏳ [PINCLICKS] Still loading... (${elapsedMinutes}m ${elapsedSeconds}s)`);

          if (progressCallback) {
            progressCallback({
              status: 'loading',
              message: `Still loading data... (${elapsedMinutes}m ${elapsedSeconds}s elapsed)`
            });
          }
        }

        // Refresh page after 3 minutes of loading
        if (attempts % maxAttemptsBeforeRefresh === 0 && attempts > 0 && refreshCount < maxRefreshes) {
          refreshCount++;
          console.log(`⚠️ [PINCLICKS] Data still loading after ${attempts * 2}s. Refreshing page (attempt ${refreshCount}/${maxRefreshes})...`);

          if (progressCallback) {
            progressCallback({
              status: 'refreshing',
              message: `Refreshing page after ${attempts * 2}s of loading (attempt ${refreshCount}/${maxRefreshes})...`
            });
          }

          await page.reload({ waitUntil: 'domcontentloaded' });
          await new Promise(resolve => setTimeout(resolve, 3000));

          // Re-search after refresh
          const searchBox = await page.waitForSelector('input[type="search"], input[placeholder*="Search"]', {
            timeout: 10000
          });

          if (searchBox) {
            await searchBox.click({ clickCount: 3 });
            await searchBox.type(keyword);
            await searchBox.press('Enter');
            console.log('🔍 [PINCLICKS] Search re-initiated after refresh');
            await new Promise(resolve => setTimeout(resolve, 3000));
          }

          // Reset attempts counter after refresh
          attempts = 0;
        }

        // Notify user if loading exceeds 10 minutes
        if (attempts >= maxAttemptsTotal) {
          console.log(`\n⚠️ [PINCLICKS] WARNING: Data has been loading for over 10 minutes!`);
          console.log(`This may indicate a PinClicks issue. Proceeding anyway...`);
          console.log(`Please verify the data manually if needed.\n`);

          if (progressCallback) {
            progressCallback({
              status: 'warning',
              message: '⚠️ Loading exceeded 10 minutes. Continuing anyway...'
            });
          }
          break;
        }

        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    // Extra wait for final rendering
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Progress update: Exporting
    if (progressCallback) {
      progressCallback({ status: 'exporting', message: 'Exporting data...' });
    }

    // Click Export button
    console.log('📤 [PINCLICKS] Clicking Export button...');
    const exportClicked = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const exportBtn = buttons.find(btn => btn.textContent && btn.textContent.includes('Export'));
      if (exportBtn) {
        exportBtn.click();
        return true;
      }
      return false;
    });

    if (!exportClicked) {
      throw new Error('Could not find Export button');
    }

    await new Promise(resolve => setTimeout(resolve, 3000));

    // Click "Annotated Interests"
    console.log('📊 [PINCLICKS] Selecting Annotated Interests...');
    const annotatedClicked = await page.evaluate(() => {
      const elements = Array.from(document.querySelectorAll('*'));
      const target = elements.find(el => {
        if (!el.textContent || el.offsetParent === null) return false;
        const text = el.textContent.trim().toLowerCase();
        return text === 'annotated interests' || text === 'annotated interest';
      });
      if (target) {
        target.click();
        return true;
      }
      return false;
    });

    if (!annotatedClicked) {
      throw new Error('Could not find Annotated Interests option');
    }

    console.log('⬇️ [PINCLICKS] Download started...');
    await new Promise(resolve => setTimeout(resolve, 10000));

    // Find downloaded CSV file
    const files = fs.readdirSync(CONFIG.downloadPath);
    const csvFile = files.filter(f => f.endsWith('.csv')).sort((a, b) => {
      return fs.statSync(path.join(CONFIG.downloadPath, b)).mtime -
             fs.statSync(path.join(CONFIG.downloadPath, a)).mtime;
    })[0];

    if (!csvFile) {
      throw new Error('CSV file not downloaded');
    }

    console.log(`✅ [PINCLICKS] Downloaded: ${csvFile}`);

    // Progress update: Uploading to ChatGPT
    if (progressCallback) {
      progressCallback({ status: 'uploading', message: 'Uploading to ChatGPT...' });
    }

    // Navigate to ChatGPT
    console.log('🤖 [PINCLICKS] Navigating to ChatGPT...');
    await page.goto('https://chatgpt.com/g/g-d4MhHvQzg-pin-seo-analysis', {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    });

    await new Promise(resolve => setTimeout(resolve, 5000));

    // ChatGPT Analysis with Retry Logic
    const maxRetries = 3;
    let attempt = 0;
    let lastError = null;
    let finalResult = null;

    while (attempt < maxRetries && !finalResult) {
      attempt++;

      if (attempt > 1) {
        console.log(`\n🔄 [CHATGPT RETRY] Attempt ${attempt}/${maxRetries} for "${keyword}"`);
        if (progressCallback) {
          progressCallback({
            status: 'retrying',
            message: `Retry attempt ${attempt}/${maxRetries} for ChatGPT analysis`
          });
        }
      }

      try {
        // Upload file to ChatGPT
        console.log('📤 [PINCLICKS] Uploading CSV to ChatGPT...');
        const fileInput = await page.$('input[type="file"]');
        if (!fileInput) {
          throw new Error('Could not find file upload button in ChatGPT');
        }

        await fileInput.uploadFile(path.join(CONFIG.downloadPath, csvFile));
        await new Promise(resolve => setTimeout(resolve, 10000)); // Increased from 8s to 10s

        // Send the message
        await page.keyboard.press('Enter');
        console.log('⏳ [PINCLICKS] Waiting for ChatGPT response (reflection mode may take longer)...');

        // Progress update: Waiting for ChatGPT
        if (progressCallback) {
          progressCallback({ status: 'analyzing', message: 'Waiting for ChatGPT analysis (reflection mode)...' });
        }

        // Wait for ChatGPT to finish responding (reflection mode takes longer)
        let responseComplete = false;
        let responseAttempts = 0;
        const maxWaitTime = 180; // Increased from 90s to 180s (3 minutes) for reflection mode

        while (!responseComplete && responseAttempts < maxWaitTime) {
          await new Promise(resolve => setTimeout(resolve, 1000));
          responseAttempts++;

          const isGenerating = await page.evaluate(() => {
            const stopButton = Array.from(document.querySelectorAll('button'))
              .find(btn => btn.textContent?.toLowerCase().includes('stop'));
            return !!stopButton;
          });

          // Wait longer before considering complete (reflection mode)
          if (!isGenerating && responseAttempts > 60) { // Increased from 45s to 60s
            responseComplete = true;
            console.log('✅ [PINCLICKS] ChatGPT finished responding');
          } else if (responseAttempts % 15 === 0) { // Log every 15s instead of 10s
            console.log(`⏳ [PINCLICKS] Still waiting for response... (${responseAttempts}s)`);
          }
        }

        await new Promise(resolve => setTimeout(resolve, 5000)); // Increased from 3s to 5s

        // Progress update: Copying results
        if (progressCallback) {
          progressCallback({ status: 'copying', message: 'Extracting results...' });
        }

        // Try to get content directly from page first (more reliable than clipboard)
        console.log('📄 [PINCLICKS] Attempting to extract content directly from page...');
        let copiedContent = await page.evaluate(() => {
          // Find the last assistant message
          const messages = Array.from(document.querySelectorAll('[data-message-author-role="assistant"]'));
          if (messages.length === 0) return null;

          const lastMessage = messages[messages.length - 1];

          // Try multiple methods to get complete content
          let textContent = '';

          // Method 1: Get all text from all child elements (most complete)
          const allTextElements = lastMessage.querySelectorAll('p, li, h1, h2, h3, h4, code, pre, span, div');
          if (allTextElements.length > 0) {
            textContent = Array.from(allTextElements)
              .map(el => el.innerText || el.textContent)
              .filter(text => text && text.trim())
              .join('\n');
          }

          // Method 2: Fallback to innerText of entire message
          if (!textContent || textContent.length < 100) {
            textContent = lastMessage.innerText || lastMessage.textContent;
          }

          return textContent;
        });

        // If direct extraction worked, use it
        if (copiedContent && copiedContent.length >= 50) {
          console.log(`✅ [PINCLICKS] Successfully extracted ${copiedContent.length} characters directly from page`);
        } else {
          // Fallback to clipboard method
          console.log('⚠️ [PINCLICKS] Direct extraction failed, trying clipboard method...');

          // Click copy button
          console.log('📋 [PINCLICKS] Looking for copy button...');
          const copyClicked = await page.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll('button'));
            const copyButtons = buttons.filter(btn => {
              const ariaLabel = btn.getAttribute('aria-label')?.toLowerCase() || '';
              const title = btn.getAttribute('title')?.toLowerCase() || '';
              const text = btn.textContent?.toLowerCase() || '';
              const copyKeywords = ['copy', 'copier', 'copiar', 'kopieren'];
              return copyKeywords.some(keyword =>
                ariaLabel.includes(keyword) || title.includes(keyword) ||
                (text.includes(keyword) && text.length < 20)
              );
            });
            const copyButton = copyButtons[copyButtons.length - 1];
            if (copyButton) {
              copyButton.click();
              return true;
            }
            return false;
          });

          if (!copyClicked) {
            throw new Error('Could not find copy button and direct extraction failed');
          }

          console.log('⏳ [PINCLICKS] Waiting for clipboard copy (reflection mode takes longer)...');
          await new Promise(resolve => setTimeout(resolve, 8000)); // Increased from 5s to 8s for reflection mode

          // Read clipboard content with extended retry logic
          console.log('📋 [PINCLICKS] Reading clipboard content...');
          copiedContent = null;
          let copyAttempts = 0;
          const maxCopyAttempts = 5; // Increased from 3 to 5

          while (!copiedContent && copyAttempts < maxCopyAttempts) {
            copyAttempts++;
            console.log(`📋 [PINCLICKS] Clipboard read attempt ${copyAttempts}/${maxCopyAttempts}...`);

            copiedContent = await page.evaluate(async () => {
              try {
                const text = await navigator.clipboard.readText();
                return text;
              } catch (err) {
                return null;
              }
            });

            if (!copiedContent || copiedContent.length < 50) {
              console.log(`⚠️ [PINCLICKS] Clipboard read attempt ${copyAttempts} failed or too short (got ${copiedContent?.length || 0} chars), retrying...`);
              await new Promise(resolve => setTimeout(resolve, 3000)); // Increased from 2s to 3s
            } else {
              console.log(`✅ [PINCLICKS] Successfully read ${copiedContent.length} characters from clipboard`);
            }
          }

          if (!copiedContent || copiedContent.length < 50) {
            throw new Error('Could not read clipboard content or content too short');
          }
        }

        console.log(`✅ [PINCLICKS] Got ${copiedContent.length} characters from clipboard`);

        // Save raw content
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
        const rawFileName = `chatgpt-raw-${keyword.replace(/\s+/g, '-').substring(0, 30)}-${timestamp}.txt`;
        fs.writeFileSync(path.join(CONFIG.downloadPath, rawFileName), copiedContent, 'utf8');
        console.log(`💾 [PINCLICKS] Saved raw content to: ${rawFileName}`);

        // Parse results with AI-powered parser (WITH KEYWORD VALIDATION)
        console.log(`🔍 [PARSER] Parsing content for keyword: "${keyword}"`);
        const parsed = await parseResults(copiedContent, keyword);

        // VALIDATION: Check if we got valid titles and descriptions
        const validTitles = parsed.titles.filter(t => t && t.trim()).length;
        const validDescriptions = parsed.descriptions.filter(d => d && d.trim()).length;

        console.log(`📊 [VALIDATION] Attempt ${attempt} for "${keyword}": Found ${validTitles} titles, ${validDescriptions} descriptions, ${parsed.overlays.filter(o=>o).length} overlays`);

        // If we have at least 1 title and 1 description, consider it successful
        if (validTitles >= 1 && validDescriptions >= 1) {
          console.log(`✅ [PINCLICKS] Successfully parsed data on attempt ${attempt}`);

          // Progress update: Complete
          if (progressCallback) {
            progressCallback({
              status: 'complete',
              message: 'Pinclicks automation completed successfully',
              data: parsed
            });
          }

          finalResult = {
            success: true,
            keyword: keyword,
            titles: parsed.titles,
            descriptions: parsed.descriptions,
            overlays: parsed.overlays,
            rawContent: copiedContent,
            rawFileName: rawFileName,
            csvFileName: csvFile
          };
        } else {
          // Parsing failed - data doesn't contain expected format
          lastError = new Error(`Parsing validation failed: Found ${validTitles} titles and ${validDescriptions} descriptions (expected at least 1 of each)`);
          console.log(`⚠️ [VALIDATION] Attempt ${attempt} failed: ${lastError.message}`);

          if (attempt < maxRetries) {
            // Start a NEW chat session for attempts 2 and 3
            if (attempt >= 1) {
              console.log(`🆕 [NEW CHAT] Starting fresh ChatGPT conversation for attempt ${attempt + 1}...`);
              try {
                // Navigate to new chat
                await page.goto('https://chatgpt.com/g/g-d4MhHvQzg-pin-seo-analysis', {
                  waitUntil: 'domcontentloaded',
                  timeout: 60000
                });
                await new Promise(resolve => setTimeout(resolve, 5000));
                console.log(`✅ [NEW CHAT] Fresh chat session started for attempt ${attempt + 1}`);
              } catch (navError) {
                console.error(`❌ [NEW CHAT] Failed to start new chat:`, navError.message);
              }
            }
            await new Promise(resolve => setTimeout(resolve, 3000));
          }
        }

      } catch (error) {
        lastError = error;
        console.error(`❌ [PINCLICKS] Attempt ${attempt} error:`, error.message);

        if (attempt < maxRetries) {
          // Start a NEW chat session for attempts 2 and 3
          if (attempt >= 1) {
            console.log(`🆕 [NEW CHAT] Starting fresh ChatGPT conversation after error (attempt ${attempt + 1})...`);
            try {
              // Navigate to new chat
              await page.goto('https://chatgpt.com/g/g-d4MhHvQzg-pin-seo-analysis', {
                waitUntil: 'domcontentloaded',
                timeout: 60000
              });
              await new Promise(resolve => setTimeout(resolve, 5000));
              console.log(`✅ [NEW CHAT] Fresh chat session started for attempt ${attempt + 1}`);
            } catch (navError) {
              console.error(`❌ [NEW CHAT] Failed to start new chat:`, navError.message);
            }
          }
          await new Promise(resolve => setTimeout(resolve, 3000));
        }
      }
    }

    // Check if we got a successful result
    if (finalResult) {
      return finalResult;
    } else {
      // All ChatGPT retries exhausted - Fall back to OpenAI API
      console.log(`\n⚠️ [CHATGPT] All ${maxRetries} ChatGPT attempts failed for "${keyword}"`);
      console.log(`🔄 [FALLBACK] Switching to OpenAI API for content generation...`);

      if (progressCallback) {
        progressCallback({
          status: 'fallback',
          message: `ChatGPT parsing failed. Generating content with OpenAI API...`
        });
      }

      try {
        const openaiContent = await generatePinterestContentFallback(keyword);
        console.log(`✅ [FALLBACK] Successfully generated content using OpenAI API`);

        return {
          success: true,
          keyword: keyword,
          titles: openaiContent.titles,
          descriptions: openaiContent.descriptions,
          overlays: openaiContent.overlays,
          source: 'openai-fallback'
        };
      } catch (fallbackError) {
        console.error(`❌ [FALLBACK] OpenAI fallback also failed:`, fallbackError.message);

        if (progressCallback) {
          progressCallback({
            status: 'error',
            message: `All methods failed: ${fallbackError.message}`
          });
        }

        return {
          success: false,
          keyword: keyword,
          error: `All methods failed. ChatGPT: ${lastError?.message || 'Unknown error'}. OpenAI: ${fallbackError.message}`
        };
      }
    }

  } catch (error) {
    console.error(`❌ [PINCLICKS] Error during automation:`, error);

    if (progressCallback) {
      progressCallback({
        status: 'error',
        message: `Error: ${error.message}`
      });
    }

    return {
      success: false,
      keyword: keyword,
      error: error.message
    };

  } finally {
    // Ensure browser is always closed, even if errors occur
    if (browser) {
      try {
        console.log('🔒 [PINCLICKS] Closing browser...');
        await browser.close();
        console.log('✅ [PINCLICKS] Browser closed successfully');
      } catch (closeError) {
        console.error('⚠️ [PINCLICKS] Error closing browser:', closeError.message);
        // Force kill if normal close fails
        try {
          const pages = await browser.pages();
          for (const p of pages) {
            await p.close().catch(() => {});
          }
          await browser.close();
        } catch (forceCloseError) {
          console.error('⚠️ [PINCLICKS] Force close also failed:', forceCloseError.message);
        }
      }
    }
  }
}

module.exports = {
  runPinclicksAutomation,
  runBatchPinclicksAutomation,
  batchDownloadFromPinClicks,
  batchAnalyzeWithChatGPT,
  parseResults,
  generatePinterestContentFallback
};
