// midjourney/prompt-filter.js
/**
 * Midjourney Prompt Filter System
 * Filters and sanitizes prompts to prevent Midjourney bans
 */

class MidjourneyPromptFilter {
  constructor() {
    // Initialize banned words and their replacements
    this.bannedWords = this.initializeBannedWords();
    this.contextualReplacements = this.initializeContextualReplacements();
    this.debugMode = true; // Set to false in production
  }

  /**
   * Initialize the list of banned words and phrases that trigger Midjourney bans
   */
  initializeBannedWords() {
    return {
      // Body parts that are often flagged
      'breasts': ['pieces', 'cutlets', 'fillets'],
      'breast': ['piece', 'cutlet', 'fillet'],
      'thighs': ['pieces', 'cuts', 'portions'],
      'thigh': ['piece', 'cut', 'portion'],
      'legs': ['pieces', 'cuts', 'portions'],
      'leg': ['piece', 'cut', 'portion'],
      'wings': ['pieces', 'cuts'],
      'wing': ['piece', 'cut'],
      'skinless' :  ['peeled'],
      'virgin' : ['pure'],

      
      
      // Words that might be interpreted as suggestive
      'moist': ['tender', 'juicy', 'soft'],
      'wet': ['damp', 'moist', 'soaked'],
      'penetrate': ['pierce', 'insert', 'poke'],
      'thrust': ['insert', 'push', 'place'],
      'hard': ['firm', 'solid', 'crisp'],
      'soft': ['tender', 'gentle', 'delicate'],
      
      // Violence-related terms that might be flagged
      'kill': ['prepare', 'cook', 'process'],
      'dead': ['fresh', 'prepared', 'ready'],
      'blood': ['juice', 'liquid', 'sauce'],
      'bleeding': ['dripping', 'leaking', 'releasing'],
      'raw': ['uncooked', 'fresh', 'natural'],
      
      // Alcohol-related terms (sometimes flagged)
      'drunk': ['infused', 'soaked', 'marinated'],
      'booze': ['spirit', 'alcohol', 'liquor'],
      
      // Other potentially problematic words
      'naked': ['plain', 'simple', 'bare'],
      'strip': ['remove', 'peel', 'trim'],
      'skin': ['peel', 'rind', 'outer layer'],
      'bone': ['remove bone from', 'debone'],
      'crack': ['break', 'split', 'open'],
      'beat': ['whisk', 'mix', 'blend'],
      'smash': ['mash', 'crush', 'press'],
      'pound': ['flatten', 'tenderize', 'press'],
      
      // Food-specific terms that can be misinterpreted
      'sausage': ['link', 'meat tube', 'bratwurst'],
      'hotdog': ['frankfurter', 'wiener', 'hot dog'],
      'nuts': ['seeds', 'kernels', 'pieces'],
      'cream': ['sauce', 'topping', 'foam'],
      'stuffing': ['filling', 'mixture', 'stuffed with'],
      
      // Cooking methods that might be flagged
      'burn': ['char', 'sear', 'blacken'],
      'flame': ['fire', 'heat', 'grill'],
      'smoke': ['smoking', 'smoked', 'barbecue'],
      
      // Common phrase combinations that are problematic
      'chicken breast': ['chicken piece', 'chicken cutlet', 'chicken fillet'],
      'turkey breast': ['turkey piece', 'turkey cutlet', 'turkey portion'],
      'duck breast': ['duck piece', 'duck cutlet', 'duck portion'],
      'beef breast': ['beef cut', 'beef piece', 'beef portion'],
      'pork breast': ['pork cut', 'pork piece', 'pork portion'],
      'chicken thigh': ['chicken piece', 'chicken cut', 'dark meat chicken'],
      'turkey thigh': ['turkey piece', 'turkey cut', 'turkey portion'],
      'lamb leg': ['lamb cut', 'lamb roast', 'leg of lamb'],
      'chicken wing': ['chicken piece', 'wing piece', 'chicken cut'],
      'buffalo wing': ['buffalo piece', 'spicy chicken', 'buffalo chicken'],
    };
  }

  /**
   * Initialize contextual replacements based on cooking context
   */
  initializeContextualReplacements() {
    return {
      // Context-aware replacements for cooking
      cooking: {
        'moist': 'tender and juicy',
        'wet': 'well-hydrated',
        'hard': 'firm textured',
        'soft': 'tender',
        'raw': 'uncooked fresh'
      },
      
      // Context for food photography
      photography: {
        'naked': 'minimalist styled',
        'strip': 'layered arrangement',
        'skin': 'natural surface',
        'crack': 'rustic texture'
      }
    };
  }

  /**
   * Main filter function - filters and sanitizes a prompt
   * @param {string} prompt - The original prompt to filter
   * @param {Object} options - Filtering options
   * @returns {Object} - Result object with filtered prompt and metadata
   */
  filterPrompt(prompt, options = {}) {
    const {
      strictMode = true,
      context = 'cooking',
      allowReplacements = true,
      logChanges = true
    } = options;

    if (!prompt || typeof prompt !== 'string') {
      return {
        success: false,
        error: 'Invalid prompt provided',
        originalPrompt: prompt,
        filteredPrompt: null,
        changes: []
      };
    }

    const result = {
      success: true,
      originalPrompt: prompt,
      filteredPrompt: prompt,
      changes: [],
      warnings: [],
      flags: []
    };

    // Step 1: Check for exact phrase matches (case insensitive)
    result.filteredPrompt = this.replacePhrases(result.filteredPrompt, result);

    // Step 2: Check for individual banned words
    result.filteredPrompt = this.replaceWords(result.filteredPrompt, result, context);

    // Step 3: Apply contextual improvements
    if (allowReplacements) {
      result.filteredPrompt = this.applyContextualReplacements(result.filteredPrompt, result, context);
    }

    // Step 4: Final safety check
    const safetyCheck = this.performSafetyCheck(result.filteredPrompt);
    if (!safetyCheck.isSafe) {
      result.warnings.push(...safetyCheck.warnings);
      if (strictMode) {
        result.success = false;
        result.error = 'Prompt contains content that may be flagged by Midjourney';
      }
    }

    // Step 5: Log changes if requested
    if (logChanges && result.changes.length > 0) {
      this.logFilteringActivity(result);
    }

    return result;
  }

  /**
   * Replace banned phrases (multi-word combinations)
   */
  replacePhrases(prompt, result) {
    let filteredPrompt = prompt;

    for (const [phrase, replacements] of Object.entries(this.bannedWords)) {
      if (phrase.includes(' ')) { // Multi-word phrases
        const regex = new RegExp(`\\b${phrase}\\b`, 'gi');
        if (regex.test(filteredPrompt)) {
          const replacement = Array.isArray(replacements) ? 
            replacements[Math.floor(Math.random() * replacements.length)] : 
            replacements;
          
          filteredPrompt = filteredPrompt.replace(regex, replacement);
          
          result.changes.push({
            type: 'phrase_replacement',
            original: phrase,
            replacement: replacement,
            reason: 'Potentially flagged phrase'
          });
        }
      }
    }

    return filteredPrompt;
  }

  /**
   * Replace individual banned words
   */
  replaceWords(prompt, result, context) {
    let filteredPrompt = prompt;

    for (const [word, replacements] of Object.entries(this.bannedWords)) {
      if (!word.includes(' ')) { // Single words only
        const regex = new RegExp(`\\b${word}\\b`, 'gi');
        if (regex.test(filteredPrompt)) {
          const replacement = Array.isArray(replacements) ? 
            replacements[Math.floor(Math.random() * replacements.length)] : 
            replacements;
          
          filteredPrompt = filteredPrompt.replace(regex, replacement);
          
          result.changes.push({
            type: 'word_replacement',
            original: word,
            replacement: replacement,
            reason: 'Potentially flagged word'
          });
        }
      }
    }

    return filteredPrompt;
  }

  /**
   * Apply contextual replacements to improve prompt quality
   */
  applyContextualReplacements(prompt, result, context) {
    let filteredPrompt = prompt;
    const contextReplacements = this.contextualReplacements[context] || {};

    for (const [word, replacement] of Object.entries(contextReplacements)) {
      const regex = new RegExp(`\\b${word}\\b`, 'gi');
      if (regex.test(filteredPrompt)) {
        filteredPrompt = filteredPrompt.replace(regex, replacement);
        
        result.changes.push({
          type: 'contextual_improvement',
          original: word,
          replacement: replacement,
          reason: `Improved for ${context} context`
        });
      }
    }

    return filteredPrompt;
  }

  /**
   * Perform final safety check for remaining problematic patterns
   */
  performSafetyCheck(prompt) {
    const warnings = [];
    const suspiciousPatterns = [
      /\b(sexy|sexual|erotic|nude|adult)\b/gi,
      /\b(violence|violent|kill|murder|death)\b/gi,
      /\b(drug|drugs|cocaine|marijuana|weed)\b/gi,
      /\b(hate|racist|nazi|hitler)\b/gi,
      /\b(porn|pornographic|xxx)\b/gi
    ];

    for (const pattern of suspiciousPatterns) {
      if (pattern.test(prompt)) {
        warnings.push(`Potentially problematic content detected: ${pattern.source}`);
      }
    }

    return {
      isSafe: warnings.length === 0,
      warnings: warnings
    };
  }

  /**
   * Log filtering activity for debugging and monitoring
   */
  logFilteringActivity(result) {
    if (!this.debugMode) return;

    console.log('\n🔍 [MIDJOURNEY FILTER] Prompt filtering activity:');
    console.log('📝 Original:', result.originalPrompt);
    console.log('✅ Filtered:', result.filteredPrompt);
    console.log('🔄 Changes:', result.changes.length);
    
    result.changes.forEach((change, index) => {
      console.log(`   ${index + 1}. ${change.original} → ${change.replacement} (${change.reason})`);
    });

    if (result.warnings.length > 0) {
      console.log('⚠️ Warnings:', result.warnings);
    }
    console.log('');
  }

  /**
   * Add custom banned word or phrase
   */
  addBannedWord(word, replacements) {
    this.bannedWords[word.toLowerCase()] = Array.isArray(replacements) ? replacements : [replacements];
  }

  /**
   * Remove a word from banned list
   */
  removeBannedWord(word) {
    delete this.bannedWords[word.toLowerCase()];
  }

  /**
   * Get current banned words list
   */
  getBannedWords() {
    return { ...this.bannedWords };
  }

  /**
   * Check if a word is banned without filtering
   */
  isBanned(word) {
    return this.bannedWords.hasOwnProperty(word.toLowerCase());
  }

  /**
   * Batch filter multiple prompts
   */
  filterPrompts(prompts, options = {}) {
    if (!Array.isArray(prompts)) {
      throw new Error('Prompts must be an array');
    }

    return prompts.map(prompt => this.filterPrompt(prompt, options));
  }

  /**
   * Generate filter statistics
   */
  getFilterStats(results) {
    if (!Array.isArray(results)) {
      results = [results];
    }

    const stats = {
      totalPrompts: results.length,
      successfulFilters: results.filter(r => r.success).length,
      failedFilters: results.filter(r => !r.success).length,
      totalChanges: results.reduce((sum, r) => sum + (r.changes ? r.changes.length : 0), 0),
      totalWarnings: results.reduce((sum, r) => sum + (r.warnings ? r.warnings.length : 0), 0),
      mostCommonChanges: {}
    };

    // Calculate most common changes
    results.forEach(result => {
      if (result.changes) {
        result.changes.forEach(change => {
          const key = `${change.original} → ${change.replacement}`;
          stats.mostCommonChanges[key] = (stats.mostCommonChanges[key] || 0) + 1;
        });
      }
    });

    return stats;
  }
}

// Export singleton instance
const promptFilter = new MidjourneyPromptFilter();
module.exports = promptFilter;