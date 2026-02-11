const fs = require('fs');
const path = require('path');
const axios = require('axios');
const chalk = require('chalk');
const apiKeyManager = require('./api-key-manager');




// Try to require inquirer but don't fail if it's not available (web mode)
let inquirer;
try {
  inquirer = require('inquirer');
} catch (error) {
  // Inquirer not available, will use web forms instead
  console.log('Running in web mode - inquirer not loaded');
}

// Create a shared recipe state to store the recipe details
let sharedRecipeState = {};

// Function to clear shared state between keyword processing (PREVENTS DATA BLEEDING)
function clearSharedState() {
  console.log(chalk.yellow('🧹 Clearing shared recipe state to prevent data bleeding between keywords'));
  sharedRecipeState = {};
}

// Configuration with defaults
let config = {
  model: process.env.DEFAULT_MODEL || 'gpt-4-turbo-preview',
  language: process.env.DEFAULT_LANGUAGE || 'English',
  temperature: process.env.DEFAULT_TEMPERATURE || 0.7,
  pinCount: parseInt(process.env.DEFAULT_PIN_COUNT || '10'),

  

  // System prompts - can be overridden from env variables
  prompts: {
    // Pinterest prompts
    pinTitleSystem: process.env.PIN_TITLE_SYSTEM_PROMPT || `You are a copywriting expert specialized in Pinterest Pin titles. Your task is to generate 10 different Pinterest titles for each keyword or idea, using proven high-conversion techniques.

Title formats:

Title 1: Clear & Concise Titles
Delivering the recipe's value in a straightforward way helps users instantly understand what to expect.
Example: Easy Chicken Alfredo Pasta Recipe

Title 2: Curiosity Titles
Creating a sense of intrigue encourages readers to click and discover the secret, twist, or surprise behind the recipe.
Example: The Secret to Fluffy Pancakes Everyone Gets Wrong

Title 3: Number-Based Titles
Using numbers adds structure and specificity, making the post feel scannable and promising actionable takeaways.
Example: 5 Quick Air Fryer Chicken Recipes for Busy Weeknights

Title 4: "How-To" / Instructional Titles
These titles promise a clear, step-by-step guide, appealing to readers seeking specific instructions.
Example: How to Make Perfect Japanese Soufflé Pancakes at Home

Title 5: Question-Based Titles
Posing a question piques curiosity and encourages clicks, especially when addressing common problems or desires.
Example: Craving Fluffy Pancakes? Try This Easy Soufflé Recipe!

Title 6: Mistake-Avoidance Titles
Highlighting common errors and how to avoid them can attract readers looking to improve their skills.
Example: Avoid These 5 Common Mistakes When Making Soufflé Pancakes

Title 7: Ultimate Guide / Comprehensive Titles
Offering an all-in-one resource appeals to readers seeking in-depth information.
Example: The Ultimate Guide to Making Fluffy Japanese Soufflé Pancakes

Title 8: Comparison Titles
Comparing methods or ingredients can help readers make informed choices.
Example: Soufflé Pancakes vs. Traditional Pancakes: What's the Difference?

Title 9: Seasonal or Occasion-Based Titles
Tying recipes to seasons or events can increase relevance and urgency.
Example: Spring Brunch Delight: Fluffy Soufflé Pancakes Recipe

Title 10: Trend-Focused Titles
Leveraging current trends or viral topics can boost visibility.
Example: TikTok's Viral Soufflé Pancakes: Try the Recipe Everyone's Talking About

Context:

You're helping a food & lifestyle blogger attract attention on Pinterest. Users are quickly scrolling, so your titles must stop the scroll, spark interest, and encourage saves/clicks. Titles must also help the Pin rank in Pinterest search.

Instructions:

1. Use clear and concise language — strong verbs, no fluff
2. Highlight the benefit — make the result or value obvious
3. Create curiosity — tease secrets, ask questions, or spark intrigue
4. Use numbers/lists — if the topic allows, add structure with numbers
5. Use natural language with SEO keywords front-loaded
6. Keep each title under 100 characters
7. Write in a friendly, conversational tone like a real food or home blogger

Bad vs. Good Examples:

1. Clear & Concise Titles
❌ "Chicken dinner idea" → ✅ "Easy Baked Lemon Chicken Thighs"
❌ "Soup I love" → ✅ "Creamy Tomato Basil Soup Recipe"
❌ "Slow cooker something" → ✅ "Slow Cooker Pulled Pork Sandwiches"

2. Curiosity Titles
❌ "Cool pancake recipe" → ✅ "The Secret to Fluffy Pancakes Everyone Gets Wrong"
❌ "Another slow cooker recipe" → ✅ "Why I Always Add This to My Crockpot Chicken"
❌ "Easy dessert idea" → ✅ "The 2-Ingredient Chocolate Mousse That Feels Fancy"

3. Number-Based Titles
❌ "Quick breakfast meals" → ✅ "5 Cozy Fall Breakfasts You'll Crave"
❌ "Ideas for pasta night" → ✅ "7 Easy Pasta Recipes for Busy Weeknights"
❌ "Dinner tips" → ✅ "3 Tricks for Juicier Chicken Every Time"

4. How-To / Instructional Titles
❌ "Best banana bread" → ✅ "How to Make Moist Banana Bread That Never Fails"
❌ "Easy pancakes" → ✅ "How to Make Fluffy Pancakes from Scratch"
❌ "Quick salad idea" → ✅ "How to Build the Perfect Summer Salad in 10 Minutes"

5. Question Titles
❌ "Try these meatballs" → ✅ "Can You Make Meatballs Without Breadcrumbs?"
❌ "Tips for baking bread" → ✅ "Is Homemade Bread Really Worth It?"
❌ "Taco recipe here" → ✅ "What's the Secret to the Best Taco Tuesday?"

6. Mistake-Avoidance Titles
❌ "Bread baking tips" → ✅ "Avoid These 5 Mistakes When Baking Bread"
❌ "How to roast chicken" → ✅ "Stop Doing This When Roasting a Whole Chicken"
❌ "Make better cookies" → ✅ "Why Your Cookies Turn Out Flat — And How to Fix Them"

7. Ultimate Guide Titles
❌ "Soufflé recipe" → ✅ "The Ultimate Guide to Making Soufflé Pancakes at Home"
❌ "Baking bread" → ✅ "Beginner's Guide to Homemade Sourdough"
❌ "Meal prep" → ✅ "The Ultimate 7-Day Meal Prep Plan for Busy Families"

8. Comparison Titles
❌ "Soup recipe" → ✅ "Instant Pot vs. Crockpot: Which Makes Better Chicken Soup?"
❌ "Smoothie vs juice" → ✅ "Green Smoothies vs. Juices: Which Is Healthier?"
❌ "Microwave vs oven" → ✅ "Microwave Mug Cakes vs. Oven-Baked: What's the Real Difference?"

9. Seasonal / Occasion-Based Titles
❌ "Apple pie recipe" → ✅ "Cozy Fall Apple Pie with Maple Crust"
❌ "Some Thanksgiving food" → ✅ "Easy Thanksgiving Sides to Impress Your Guests"
❌ "Soup idea" → ✅ "Winter Comfort: Creamy Chicken Noodle Soup"

10. Trend-Focused Titles
❌ "Cool new recipe" → ✅ "TikTok's Viral Grinder Salad Sandwich — Worth the Hype?"
❌ "What's popular now" → ✅ "These Butter Boards Are Taking Over Pinterest"
❌ "Soup trend" → ✅ "Cottage Cheese Ice Cream: What Happens When You Try It?"`,
    
    pinTitleUser: process.env.PIN_TITLE_USER_PROMPT || `Recipe Idea: {{recipeIdea}}
Language: {{language}}
Please generate {{pinCount}} different Pinterest Pin titles that follow the formatting and guidance provided in the system prompt. Use the keyword, interests, and recipe idea to create attention-grabbing, high-conversion titles. 
Return only the final text without any numbering, dashes, labels, or quotation marks. Do not include "Title 1:", "1.", "-", or any symbols. Just plain clean text.`,
    
    pinDescSystem: process.env.PIN_DESC_SYSTEM_PROMPT || `You are a Pinterest marketing and copywriting expert. Your task is to generate highly effective Pinterest Pin descriptions for blog post Pins that maximize engagement and click-throughs. Each description must serve both the Pinterest algorithm and real human readers.
Follow these strict principles:
1. Start with relevant, **front-loaded keywords** based on the Pin topic — what users are likely to search
2. Use **natural, conversational language** (like friendly advice from a blogger)
3. Be **clear and benefit-driven** — what problem does this Pin solve or what value does it offer?
4. Add a **a natural, benefit-focused nudge that encourages action without sounding pushy** (e.g., "Don't be surprised if this becomes your new favorite" or "A cozy dinner idea worth trying this week")
5. End with **2–3 relevant broad hashtags** (max) that match Pinterest SEO best practices
6. Keep each description between **100–200 characters**
Tone: Warm, helpful, modern. You are writing for American women home cooks or lifestyle lovers.
Bad vs Good examples (with indirect CTAs):
❌ "Here's a pin about meal prep ideas for the week"
✅ "Meal prep just got easier with these 5 make-ahead dinners for busy nights. One to keep in your weekly rotation. #mealprep #weeknightmeals"
❌ "How to make fall wreaths"
✅ "Learn how to make a beautiful fall wreath in under 30 minutes — a cozy DIY project you'll want to recreate. #fallwreath #diyhomedecor"
Always output:
- 1 Pinterest-optimized description in 100–200 characters.`,
    
    pinDescUser: process.env.PIN_DESC_USER_PROMPT || `Pin Title: {{pinTitle}}
Category: {{category}}
Annotated Interests: {{interests}}
Language: {{language}}
Based on the instructions provided, please write {{pinCount}} different Pinterest Pin description that is optimized for both engagement and SEO. 
Return only the final text without any numbering, dashes, labels, or quotation marks. Do not include "Description 1:", "1.", "-", or any symbols. Just plain clean text.`,
    
    pinOverlaySystem: process.env.PIN_OVERLAY_SYSTEM_PROMPT || `You are a Pinterest marketing and visual copy expert. Your task is to create short, scroll-stopping overlay text for Pinterest images. This overlay should grab attention fast while sparking curiosity — using as few words as possible.
Follow these principles:
1. Use **minimal text** — 4 to 7 words max
2. **Front-load keywords** for Pinterest SEO (if relevant)
3. Focus on **benefit or transformation** — what will the viewer gain?
4. Spark **curiosity** with surprise, specificity, or urgency
5. Use **clear, bold, conversational language** — no fluff or vague words
6. Do **not** include punctuation unless it's essential (like parentheses or exclamation points)
7. No hashtags or branding
Tone: Friendly, modern, and direct — like a helpful blogger speaking to her Pinterest audience
Bad vs Good (with keyword included naturally):
❌ "My best slow cooker idea ever!" ✅ "Slow Cooker Chicken That Falls Apart"
❌ "Some fall organizing tips" ✅ "Fall Closet Organization Made Simple"
❌ "Ways to save money" ✅ "Save Big on Your Weekly Grocery Bill"
❌ "Tasty dinner tonight?" ✅ "Easy Crockpot Chicken Tacos Tonight"
❌ "Meal prep goals!" ✅ "Vegan Meal Prep You'll Actually Love"
Always return 1 short overlay phrase only.`,
    
    pinOverlayUser: process.env.PIN_OVERLAY_USER_PROMPT || `Pin Title: {{pinTitle}}
Language: {{language}}
Interests: {{interests}}
Create {{pinCount}} short Pinterest image overlay text (4–7 words max) that matches the tone and message of the Pin. Use curiosity and benefit-driven language that appeals to the interests. Keep it concise and bold. 
Return only the final text without any numbering, dashes, labels, or quotation marks. Do not include "Image 1:", "1.", "-", or any symbols. Just plain clean text.`,

    metaTitleSystem: process.env.META_TITLE_SYSTEM_PROMPT || `You are an SEO content strategist specializing in crafting compelling and optimized blog post titles.
Your goal is to generate one SEO-friendly blog post title that aligns with current best practices to enhance visibility in search engines and drive clicks.
Context:
The title must attract attention in search engine results pages (SERPs), accurately represent the blog post content, and include the keyword naturally.
Follow these instructions:
- Incorporate the Primary Keyword: Include the main keyword, ideally at the beginning.
- Match Search Intent: Understand what the user is looking for and reflect that in the title.
- Be Descriptive and Concise: Clearly express the value of the post in 50–60 characters.
- Avoid Keyword Stuffing: Use keywords naturally — no repetition or awkward phrasing.
- Use Power Words and Numbers: Include numbers, brackets, or compelling phrases to increase click-through rates (e.g. "10 Easy Tips", "[2025]", "Best", etc.).
Constraints:
- Character Limit: Maximum of 60 characters
- Tone: Professional, clear, and engaging
- Avoid misleading or clickbait titles
Bad vs Good Examples:
1. Clear & Concise
❌ Poor: "A Great Dinner Recipe I Love" ✅ Good: Easy Slow Cooker Chicken Tacos
❌ Poor: "Make This Dish Tonight" ✅ Good: Creamy Garlic Mashed Potatoes Recipe
2. Curiosity-Based
❌ Poor: "This Might Be the Best Chicken Ever" ✅ Good: The Secret to the Best Slow Cooker Chicken
❌ Poor: "Wow—Just Try This Pasta" ✅ Good: Why Everyone's Talking About This Pasta Bake
3. Number-Based
❌ Poor: "Tasty Dinners to Try" ✅ Good: 5 Quick Weeknight Dinners to Try Now
❌ Poor: "Ideas for Soups" ✅ Good: 7 Cozy Fall Soups You Can Freeze
4. How-To / Instructional
❌ Poor: "Making Pancakes Like This Is Fun" ✅ Good: How to Make Fluffy Japanese Soufflé Pancakes
❌ Poor: "Roast Chicken Is Easy If You Know How" ✅ Good: How to Roast Chicken Perfectly Every Time
5. Question-Based
❌ Poor: "Thinking of Prepping Chicken?" ✅ Good: What's the Best Way to Meal Prep Chicken?
❌ Poor: "No Eggs? Try This" ✅ Good: Can You Bake a Cake Without Eggs?
6. Mistake-Avoidance
❌ Poor: "Bread Didn't Turn Out?" ✅ Good: 5 Mistakes That Ruin Banana Bread
❌ Poor: "Watch Out When You Slow Cook" ✅ Good: Avoid These Slow Cooker Chicken Fails
7. Ultimate Guide
❌ Poor: "Learn Everything About Chicken Recipes" ✅ Good: The Ultimate Guide to Slow Cooker Chicken
❌ Poor: "How to Meal Prep All Week" ✅ Good: Complete Guide to Keto Meal Prep for Beginners
8. Comparison
❌ Poor: "Different Cooking Appliances Compared" ✅ Good: Air Fryer vs. Oven: Which Cooks Faster?
❌ Poor: "Quinoa or Rice—You Decide" ✅ Good: Quinoa vs. Rice: Which Is Better for Meal Prep?
9. Seasonal / Occasion-Based
❌ Poor: "Holiday Brunch Recipe Ideas" ✅ Good: Easy Christmas Brunch Ideas Everyone Will Love
❌ Poor: "Dinner Ideas for Autumn" ✅ Good: Cozy Fall Dinner Recipes for Chilly Nights
10. Trend-Focused
❌ Poor: "The Newest Internet Food Thing" ✅ Good: TikTok's Viral Baked Oats: Worth the Hype?
❌ Poor: "This Ice Cream Is Weird But Cool" ✅ Good: Try This Pinterest-Famous Cottage Cheese Ice Cream
Return only one SEO-optimized blog post title.`,
    
    metaTitleUser: process.env.META_TITLE_USER_PROMPT || `Pinterest Pin title: {{pinTitle}}
Language: {{language}}
Please generate 1 SEO blog post title that follows the instructions provided in the system prompt. Make it optimized for search, aligned with the pin title, and under 60 characters. 
Return only the final text without any numbering, dashes, labels, or quotation marks. Do not include "Title 1:", "1.", "-", or any symbols. Just plain clean text.`,
    
    metaDescSystem: process.env.META_DESC_SYSTEM_PROMPT || `You are an SEO content strategist specializing in crafting compelling meta descriptions that enhance search engine visibility and click-through rates. Your goal is to generate an SEO-friendly meta description that accurately summarizes a blog post or webpage and entices users to click.
Context:
The description should align with the page's actual content, include relevant keywords naturally, and appeal to the target audience's search intent.
Follow these instructions:
- Optimal Length: Keep the meta description between 120–155 characters so it displays properly in Google results.
- Incorporate Target Keywords: Use the primary keyword naturally and early in the sentence.
- Use Active Voice and Action-Oriented Language: Engage the reader with direct, clear phrasing.
- Gently guide the reader toward clicking by hinting at the value of the content. Instead of direct commands, use friendly phrasing that suggests what they'll gain or enjoy. Encourage clicks with phrases like "A must-try if you love quick, comforting meals" "Discover," "Perfect for your next cozy dinner at home" or "The kind of recipe that saves busy weeknights."
- Ensure Uniqueness: Every description must be unique and not duplicated from other pages.
- Reflect Page Content Accurately: Ensure the summary represents what the post truly offers.
Constraints:
- Character Limit: Maximum of 155 characters
- Tone: Professional, helpful, and engaging
- Avoid keyword stuffing or vague language
Bad vs Good Examples:
1. Clear & Concise Titles
❌ Poor: "This blog post is about chicken tacos and how to cook them." ✅ Good: "Make these easy slow cooker chicken tacos with simple pantry staples — perfect for a no-fuss dinner everyone will love."
2. Curiosity-Based Titles
❌ Poor: "This recipe is a surprise and very good. You should try it." ✅ Good: "The secret to juicy, flavor-packed chicken is easier than you think — one you'll want to make again and again."
3. Number-Based Titles
❌ Poor: "Here are some recipes to try for dinner or lunch." ✅ Good: "Try these 5 quick dinner ideas that make busy weeknights feel a little easier — no fancy ingredients required."
4. How-To Titles
❌ Poor: "Learn about making pancakes with steps to follow." ✅ Good: "Follow this step-by-step guide to fluffy soufflé pancakes — soft, jiggly, and ready to impress."
5. Question-Based Titles
❌ Poor: "This blog post will answer your question about baking a cake." ✅ Good: "Wondering how to bake a cake without eggs? This easy recipe has you covered with simple swaps and delicious results."
6. Mistake-Avoidance Titles
❌ Poor: "Here are some mistakes to avoid when cooking." ✅ Good: "Avoid these common bread-baking mistakes to get soft, golden loaves every time — great if you're just starting out."
7. Ultimate Guide Titles
❌ Poor: "Everything you need to know is in this blog post." ✅ Good: "This ultimate slow cooker chicken guide has everything you need — from tips to variations and serving ideas."
8. Comparison Titles
❌ Poor: "This post compares two different cooking methods." ✅ Good: "Not sure if the air fryer or oven is better? This comparison breaks it down with time, texture, and taste in mind."
9. Seasonal / Occasion-Based Titles
❌ Poor: "Recipes for the holidays and other times of the year." ✅ Good: "Warm up your table with these cozy fall dinner recipes — easy comfort food perfect for chilly nights."
10. Trend-Focused Titles
❌ Poor: "Try this trending recipe from the internet." ✅ Good: "This TikTok-famous baked oats recipe is easy, wholesome, and totally worth the hype."
Return only one SEO-optimized meta description.`,
    
    metaDescUser: process.env.META_DESC_USER_PROMPT || `Pinterest Pin title: {{pinTitle}}
Pinterest Pin description: {{pinDesc}}
Language: {{language}}
Please generate 1 SEO meta description that aligns with this Pin's topic. Follow the system instructions to optimize for both search and click-throughs. 
Return only the final text without any numbering, dashes, labels, or quotation marks. Do not include "Title 1:", "1.", "-", or any symbols. Just plain clean text.`,
    
    slugSystemPrompt: process.env.SLUG_SYSTEM_PROMPT || `You are an SEO specialist. Your task is to generate a short, clean, and keyword-optimized blog post slug based on the provided meta title and recipe idea.
Slug Format Rules:
- Use only lowercase letters
- Replace spaces with hyphens (kebab-case)
- Use 3 to 6 important words only (max ~60 characters total)
- Include 1 or 2 primary keywords from the title or recipe idea
- Remove stopwords like "a", "the", "and", "to", "with", "of", etc.
- Do NOT include domain names, slashes, or punctuation
- Match the title's core idea, but keep it short and search-friendly
Output Requirements:
Return only the final slug (no quotes, no formatting, no label).`,
    
    slugUserPrompt: process.env.SLUG_USER_PROMPT || `Recipe Idea: {{recipeIdea}}  
Meta Title: {{metaTitle}}
Please generate a short, SEO-optimized blog post slug based on the title and keyword.`,
    
    blogpostSystemPrompt: process.env.BLOGPOST_SYSTEM_PROMPT || `You are a food blogger and SEO content strategist writing for the brand Wanda Recipes.
Tone & Brand Voice:
- Audience: American women who love quick, easy, homemade meals
- Tone: Friendly, informative, and encouraging — like chatting with a friend in the kitchen
- Guidelines: Use warm, clear language. Avoid jargon. Be helpful, real, and supportive. Make readers feel at home and inspired to try the recipe.
Your task is to write a fully SEO-optimized blog post for a recipe based on the following inputs: meta title, meta description, category, and annotated interest.
Write with search performance and readability in mind. The blog post should rank well on Google and delight readers.
🧠 CONTENT STRUCTURE:
Write a blog post using this structure, but DO NOT repeat these section headers literally. Instead, optimize all section titles dynamically for SEO and clarity.
1. **INTRODUCTION**
   - Begin with a friendly hook that draws the reader in
   - Include the primary keyword naturally in the first 1–2 sentences
   - Add a personal anecdote or story to build trust and relatability
3. **INGREDIENTS**
   - Break into clear bullet points
   - Provide brief, helpful tips where relevant
   - Mention tools needed for success
4. **STEP-BY-STEP INSTRUCTIONS** 
   - Use numbered steps  
   - Each step should begin with a short, clear title (like a mini heading) to guide the reader (e.g., "1. Whisk the Batter" or "3. Flip and Cook")  
   - Follow the title with a beginner-friendly explanation  
   - Add casual encouragement, helpful tips, or notes if relevant (e.g., "Don't worry if it looks messy here — that's normal!")  
5. **FREQUENTLY ASKED QUESTIONS**
   - Include 4–5 questions your audience might Google
   - Answer clearly and supportively in Wanda's voice
6. **CLOSING / CALL-TO-ACTION**
   - Wrap up with encouragement to try the recipe
   - Suggest sharing on Pinterest or tagging on social
   - Include a soft, warm sign-off like a kitchen friend would use
---
🔍 SEO REQUIREMENTS (Based on Semrush Best Practices):
- Use the **meta title** as the blog post's H1
- Include the **primary keyword** within the first 100 words
- Naturally include **secondary keywords** (if implied in annotated interest)
- Use proper **H2 and H3 subheadings** with relevant keywords
- Incorporate **internal links** (if relevant) and **external links** to reputable sources
- Include **image suggestions** or alt text phrases with keywords
- Ensure content length is 800–1,200 words
- Avoid keyword stuffing, clickbait, or robotic phrasing
---
📋 OUTPUT RULES:
- Use SEO-optimized section headings based on the content and recipe keyword but write them as plain text — do NOT use markdown symbols like \`##\`, \`**\`, or numbers
- Format all headings as plain lines of text above their paragraph (e.g., "Why You'll Love This Recipe")
- Do NOT repeat or copy the outline structure or headings from the system prompt
- Do NOT use any markdown, HTML, or numbered formatting
- Return ONLY clean, human-readable blog content ready to copy into WordPress
---
Return **only the blog post content**. Do not include markdown or HTML. Format it as plain, publish-ready text.`,
    
    blogpostUserPrompt: process.env.BLOGPOST_USER_PROMPT || `Please write a full SEO-optimized blog post for the following recipe topic:
Recipe Idea (Main Keyword): {{recipeIdea}}  
Meta Title: {{metaTitle}}  
Meta Description: {{metaDescription}}  
Category: {{category}}  
Annotated Interests: {{interests}}
Language: {{language}}
Do not repeat or label the sections — just use helpful headings and clean, natural text.  
Avoid any markdown symbols, numbers, or bold/italic styles.  
Return only the final blog content as plain text.
Use the blog structure and tone described in the system prompt.  
Do not include outline labels or formatting (no bold, headings, asterisks, or HTML).  
Return **only the blog content** as clean, plain text.  
Make it copy-paste ready for WordPress.
Follow the blog structure and tone described in the system prompt but rewrite section headings dynamically with SEO-friendly, benefit-focused language. Return only the blog post content as clean, publish-ready plain text. Do not include markdown, bullet formatting symbols, or explanations — just the blog content.`,
    
    // Facebook prompts
    fbPrompt: process.env.FB_PROMPT || `IMPORTANT: If the recipe content is in a foreign language (Dutch, German, French, etc.), TRANSLATE ALL content (recipe title, ingredients, and instructions) to natural English first, then format according to the template below.

{{userProvidedRecipe}}

IF USER PROVIDED THIS RECIPE ABOVE (with ingredients and instructions), USE THE EXACT SAME INGREDIENTS AND INSTRUCTIONS but translate to English if needed. You MUST preserve every single measurement, quantity, ingredient name, and cooking step exactly as written. Only improve formatting with emojis and translate to English if necessary.

IF NO USER RECIPE WAS PROVIDED ABOVE (empty or just a recipe name), then create a complete new recipe for {{recipeIdea}} in {{language}}.

YOU MUST FORMAT THE OUTPUT EXACTLY LIKE THIS TEMPLATE:

Recipe Title Here 


INGREDIENTS :
- 1 cup ingredient name
- 2 tablespoons ingredient name  
- ½ teaspoon ingredient name
- 3 large ingredient name

INSTRUCTIONS :
1. First instruction step here.
2. Second instruction step here.
3. Third instruction step here.
4. Fourth instruction step here.

CRITICAL FORMATTING RULES:
- Title MUST have emojis like:  Title Here 
- Section headers MUST be exactly: " INGREDIENTS" and " INSTRUCTIONS"  
- Every ingredient MUST have a specific quantity (1 cup, 2 tbsp, ½ tsp, etc.)
- Every instruction MUST start with "1. " "2. " "3. " etc.
- Do NOT repeat section headers
- Do NOT put ingredients in instructions section
- Follow this exact structure with no deviations`,
    
    fbCaptionPrompt: process.env.FB_CAPTION_PROMPT || `Create an engaging Facebook post caption for this recipe in ENGLISH (regardless of the original recipe language - always output in English). The caption should be conversational, include 2-3 emojis, ask an engaging question, and invite comments. Keep it under 150 words and make sure it entices people to try the recipe. Here's the recipe:

{{recipe}}`,
    
    mjTemplate: process.env.MJ_TEMPLATE || `Professional food photography of "{{title}}" (translate recipe name to English if not already), showing visible ingredients: {{ingredients}} (translate all ingredients to English if not already), photo taken with a Canon EOS R5, 85mm lens, f/2.8, natural lighting, food styling, shallow depth of field, mouth-watering, magazine quality, top view, soft shadows, textured wood or marble background, garnished beautifully`
  }
};

// Helper functions
// Fixed callOpenAI function for app.js

// Modify the callOpenAI function in app.js to include debugging
async function callOpenAI(systemPrompt, userPrompt) {
  try {
    // Ensure systemPrompt and userPrompt are not null or undefined
    const safeSystemPrompt = systemPrompt || '';
    const safeUserPrompt = userPrompt || '';
    
    console.log('Making OpenAI API call:');
    console.log('System prompt length:', safeSystemPrompt.length);
    console.log('User prompt length:', safeUserPrompt.length);
    
    // Make sure we're using the API key from config
    const apiKey = config.apiKey;
    
    // Log the API key (first few characters) for debugging
    if (apiKey) {
      console.log(`Using API key: ${apiKey.substring(0, 3)}...${apiKey.substring(apiKey.length - 3)}`);
    } else {
      console.log('No API key available!');
      return 'ERROR: No API key provided. Please check your API key in settings.';
    }
    
    // Create messages array, only include system message if it's not empty
    const messages = [];
    if (safeSystemPrompt.trim() !== '') {
      messages.push({ role: 'system', content: safeSystemPrompt });
    }
    messages.push({ role: 'user', content: safeUserPrompt });
    
    // DEBUG: Log full prompts if debug mode is enabled
    if (global.debugPrompts) {
      console.log('\n==== DEBUG: PROMPT DETAILS ====');
      console.log('Template ID:', new Date().toISOString());
      if (safeSystemPrompt.trim() !== '') {
        console.log('\n--- SYSTEM PROMPT ---');
        console.log(safeSystemPrompt);
      }
      console.log('\n--- USER PROMPT ---');
      console.log(safeUserPrompt);
      console.log('\n==== END PROMPT DETAILS ====\n');
    }
    
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: config.model,
        messages: messages,
        temperature: config.temperature || 0.7
      },
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`
        }
      }
    );
    
    // DEBUG: Log response first token in debug mode
    if (global.debugPrompts && response.data.choices && response.data.choices[0]) {
      const responseText = response.data.choices[0].message.content.trim();
      console.log('\n==== DEBUG: RESPONSE PREVIEW ====');
      console.log(responseText.substring(0, 100) + (responseText.length > 100 ? '...' : ''));
      console.log('==== END RESPONSE PREVIEW ====\n');
    }
    
    return response.data.choices[0].message.content.trim();
  } catch (error) {
    console.error('OpenAI API Error:', error.response?.data?.error || error.message);
    
    // Provide more detailed error information
    if (error.response?.data?.error) {
      console.error('Error details:', JSON.stringify(error.response.data.error, null, 2));
    }
    
    return 'ERROR';
  }
}


// Fixed callOpenAIArray function
function callOpenAIArray(systemPrompt, userPrompt) {
  return callOpenAI(systemPrompt, userPrompt).then(output => {
    return output === 'ERROR' ? [] : output.split(/\n+/).filter(x => x.trim()).slice(0, config.pinCount);
  });
}

function callOpenAIArray(systemPrompt, userPrompt) {
  return callOpenAI(systemPrompt, userPrompt).then(output => {
    return output === 'ERROR' ? [] : output.split(/\n+/).filter(x => x.trim()).slice(0, config.pinCount);
  });
}

function cleanOutput(text) {
  return text
    .replace(/^[-–•\d\. ]*\s*(Title\s*\d+)?[:\-–]?\s*/i, '')
    .replace(/^"(.+)"$/, '$1')
    .trim();
}

// Enhanced Fault Tolerance in replaceVars function in app.js

// In app.js, find the replaceVars function and add the new variable:

function replaceVars(template, vars) {
  // Return empty string if template is null or undefined
  if (!template) return '';
  
  // Ensure vars object is not null or undefined
  const safeVars = vars || {};
  
  try {
    // Safely access properties with defaults
    return template
      .replace(/\{\{recipeIdea\}\}/gi, safeVars.recipeIdea || '')
      .replace(/\{\{category\}\}/gi, safeVars.category || '')
      .replace(/\{\{interests\}\}/gi, safeVars.interests || '')
      .replace(/\{\{metaTitle\}\}/gi, safeVars.metaTitle || '')
      .replace(/\{\{metaDescription\}\}/gi, safeVars.metaDescription || '')
      .replace(/\{\{pinTitle\}\}/gi, safeVars.pinTitle || '')
      .replace(/\{\{pinDesc\}\}/gi, safeVars.pinDesc || '')
      .replace(/\{\{recipe_input\}\}/gi, safeVars.recipeIdea || '')
      .replace(/\{\{recipe\}\}/gi, safeVars.recipe || '')
      .replace(/\{\{userProvidedRecipe\}\}/gi, safeVars.userProvidedRecipe || '') // ADD THIS LINE
      // Add support for single curly brace format
      .replace(/\{title\}/gi, safeVars.title || '')
      .replace(/\{ingredients\}/gi, safeVars.ingredients || '')
      .replace(/\{image_url\}/gi, safeVars.image_url || '')
      // Double curly brace format
      .replace(/\{\{title\}\}/gi, safeVars.title || '')
      .replace(/\{\{ingredients\}\}/gi, safeVars.ingredients || '')
      .replace(/\{\{image_url\}\}/gi, safeVars.image_url || '')
      .replace(/\{\{pinCount\}\}/gi, safeVars.pinCount || '10')
      .replace(/\{\{language\}\}/gi, safeVars.language || 'English');
  } catch (error) {
    console.error(chalk.red('Error in replaceVars:'), error.message);
    console.error('Template:', template);
    console.error('Variables:', JSON.stringify(safeVars, null, 2));
    // Return the unmodified template or a safe default
    return template || '';
  }
}

// Let's improve the extractIngredientsSection function to make sure it properly
// extracts ONLY the ingredients section

// Final, optimized version of the ingredient extraction and formatting functions

// Function to extract ingredients section from the recipe text
function extractIngredientsSection(text) {
  const ingredientLabels = ['Ingredients', 'Zutaten', 'Ingrédients', 'Ingredienti', 'Ingredientes', '🧂 Ingredients', 'Ingredients 🧂'];
  const nextSectionLabels = ['Preparation', 'Préparation', 'Zubereitung', 'Preparazione', 'Preparación', 'Instructions', 'Steps', 'Directions', '🧑‍🍳', 'Method'];
  
  // Create a more robust pattern to detect the next section
  const nextPattern = new RegExp(`(^|\\n)\\s*(${nextSectionLabels.join('|')})\\s*[:\\n🧑‍🍳]`, 'im');

  for (const label of ingredientLabels) {
    // More robust regex to find ingredient section header
    const labelRegex = new RegExp(`(^|\\n)\\s*${label}\\s*[:\\n🧂]`, 'i');
    const match = text.match(labelRegex);
    
    if (match) {
      const startIndex = match.index + match[0].length;
      const afterStart = text.slice(startIndex);
      
      // Find where the next section begins
      const nextSectionMatch = afterStart.match(nextPattern);
      
      if (nextSectionMatch) {
        // Return only the ingredients part, trimming whitespace
        return afterStart.slice(0, nextSectionMatch.index).trim();
      } else {
        // If no next section found, take everything after ingredients but be cautious
        // Limit to a reasonable number of lines to avoid capturing the whole document
        const lines = afterStart.split('\n');
        // Get up to 20 lines or until a blank line followed by what looks like a header
        let ingredientLines = [];
        let emptyLineCount = 0;
        
        for (let i = 0; i < Math.min(20, lines.length); i++) {
          const line = lines[i].trim();
          
          // If we find an empty line, increment counter
          if (!line) {
            emptyLineCount++;
            // If we've seen an empty line and this looks like a header (short line with no punctuation),
            // it might be the start of the next section
            if (emptyLineCount > 0 && 
                lines[i+1] && 
                lines[i+1].length < 30 && 
                !lines[i+1].includes('.') && 
                !lines[i+1].startsWith('-')) {
              break;
            }
            continue;
          }
          
          // Reset empty line counter if we find text
          emptyLineCount = 0;
          ingredientLines.push(line);
        }
        
        return ingredientLines.join('\n').trim();
      }
    }
  }
  
  // If we can't find a labeled ingredients section, try to infer it from bullet points/list formatting
  // that typically appear before numbered steps
  const lines = text.split('\n');
  let inIngredientsList = false;
  let ingredientLines = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Start of ingredient list might be indicated by bullet points or dashes
    if (!inIngredientsList && 
        (line.startsWith('-') || line.startsWith('•') || line.startsWith('*') || line.match(/^\d+\.\s/))) {
      inIngredientsList = true;
    }
    
    // End of ingredient list might be a blank line followed by a header-like line
    // or a line that starts with a number (suggesting instruction steps)
    if (inIngredientsList && !line) {
      // Check if next non-empty line looks like a header or numbered step
      let nextIndex = i + 1;
      while (nextIndex < lines.length && !lines[nextIndex].trim()) {
        nextIndex++;
      }
      
      if (nextIndex < lines.length) {
        const nextLine = lines[nextIndex].trim();
        if (nextLine.match(/^\d+\./) || // Numbered step
            nextLine.match(/^(Steps|Instructions|Preparation|Method)/i) || // Header
            (nextLine.length < 30 && !nextLine.includes('-') && !nextLine.includes('•'))) { // Short line, likely a header
          break;
        }
      }
    }
    
    // Collect ingredient lines
    if (inIngredientsList && line) {
      ingredientLines.push(line);
    }
  }
  
  if (ingredientLines.length > 0) {
    return ingredientLines.join('\n');
  }
  
  return null;
}

// Function to format ingredients for Midjourney prompt
function formatIngredientsForMidjourney(ingredientsList) {
  if (!ingredientsList || ingredientsList.length === 0) {
    return '';
  }
  
  // Filter out any items that look like section headers or preparation steps
  const filteredList = ingredientsList.filter(item => {
    // Skip section headers (like "### Preparation")
    if (item.includes('###') || item.includes('Preparation') || item.includes('Instructions')) {
      return false;
    }
    
    // Skip numbered steps, which are likely instructions
    if (item.match(/^\d+\.\s+/) || item.includes('**Cook') || item.includes('**Prepare')) {
      return false;
    }
    
    return true;
  });
  
  // Process each ingredient to clean it up
  const cleanedIngredients = filteredList.map(ingredient => {
    // Remove emoji and bullet points
    let cleaned = ingredient.replace(/^[-•*🧂\s]+|[-•*🧂\s]+$/g, '').trim();
    
    // Remove preparation instructions that often appear in parentheses
    cleaned = cleaned.replace(/\(.*?\)/g, '').trim();
    
    // Handle measurement fractions
    cleaned = cleaned.replace(/(\d+)\s*\/\s*(\d+)/g, '$1/$2');
    
    // Check if it has a reasonable length (avoid including preparation instructions)
    if (cleaned.length > 100) {
      // If too long, just take the first part which is likely the actual ingredient
      cleaned = cleaned.split(',')[0].trim();
    }
    
    return cleaned;
  });
  
  // Filter out any empty items
  const finalIngredients = cleanedIngredients.filter(ing => ing && ing.length > 0);
  
  // Join with commas
  return finalIngredients.join(', ');
}

// MERGED generateFacebookContent function - Replace ALL 3 versions with this ONE function

async function generateFacebookContent(recipeIdea, imageUrl = null, userProvidedRecipe = null) {
  console.log(chalk.cyan(`\nGenerating Facebook content for: ${recipeIdea}`));
  
  if (userProvidedRecipe) {
    console.log(chalk.yellow(`📝 Using provided recipe (${userProvidedRecipe.length} chars)`));
    console.log(chalk.yellow(`📝 User recipe: ${userProvidedRecipe}`));
  } else {
    console.log(chalk.gray('🤖 No user recipe provided, generating from keyword'));
  }
  
  // Generate the full recipe using the updated prompt
  console.log(chalk.gray('Creating the recipe...'));

  // DEBUG: Log what we're about to pass to replaceVars
  const varsToPass = {
    recipeIdea,
    language: config.language,
    userProvidedRecipe: userProvidedRecipe || ''
  };

  console.log('=== DEBUG: VARIABLES BEING PASSED TO replaceVars ===');
  console.log('recipeIdea:', varsToPass.recipeIdea);
  console.log('language:', varsToPass.language);
  console.log('userProvidedRecipe exists:', !!varsToPass.userProvidedRecipe);
  console.log('userProvidedRecipe length:', varsToPass.userProvidedRecipe ? varsToPass.userProvidedRecipe.length : 0);
  console.log('userProvidedRecipe content:', varsToPass.userProvidedRecipe);
  console.log('=== END DEBUG VARIABLES ===');

  // DEBUG: Also log the template before replacement
  console.log('=== DEBUG: TEMPLATE BEFORE REPLACEMENT ===');
  console.log('Template contains {{userProvidedRecipe}}:', config.prompts.fbPrompt.includes('{{userProvidedRecipe}}'));
  console.log('Template snippet:', config.prompts.fbPrompt.substring(0, 200) + '...');
  console.log('=== END TEMPLATE DEBUG ===');

  const fullPrompt = replaceVars(config.prompts.fbPrompt, varsToPass);

  console.log('=== EXACT PROMPT AFTER replaceVars ===');
  console.log(fullPrompt);
  console.log('=== END PROMPT ===');

const recipe = await callOpenAI('', fullPrompt);

console.log('=== RAW AI RESPONSE (BEFORE ANY PROCESSING) ===');
console.log(recipe);
console.log('=== END RAW AI RESPONSE ===');

console.log(chalk.blue('✅ OpenAI call completed'));
console.log(chalk.green(`📝 Recipe generated (${recipe.length} characters)`));

// DON'T clean Facebook recipes - use raw AI output
const cleanedRecipe = recipe;
  
  // Extract title (combining approaches from all versions)
  const titleLine = cleanedRecipe.split('\n')[0].trim();
  // Remove emojis (from versions 2&3) and markdown (from version 1)
  const title = titleLine.replace(/[\u2700-\u27BF\uE000-\uF8FF\uD800-\uDFFF]+/g, '').replace(/[*#]/g, '').trim();
  
  // Extract ingredients (using the best approach from versions 2&3)
  let ingredientsSection = null;
  let ingredientsList = [];
  let allIngredients = '';
  let firstThreeIngredients = '';
  
  // Try extractSection first (from version 1), then fall back to extractIngredientsSection (from versions 2&3)
  if (typeof extractSection === 'function') {
    ingredientsSection = extractSection(cleanedRecipe, 'INGREDIENTS', 'INSTRUCTIONS');
  }
  
  // If extractSection didn't work or doesn't exist, try extractIngredientsSection
  if (!ingredientsSection && typeof extractIngredientsSection === 'function') {
    ingredientsSection = extractIngredientsSection(cleanedRecipe);
  }
  
  if (ingredientsSection) {
    // Process ingredients (combining the best from all versions)
    const rawIngredients = ingredientsSection.split('\n')
      .map(line => line.replace(/^[-•🧂\s]*|[🧂]$/g, '').trim()) // Clean bullet points and emojis
      .filter(line => {
        // More thorough filtering to prevent duplicates and empty lines
        return line && 
               line.length > 1 && 
               !line.match(/^(INGREDIENTS?|🧂|[#*]+)$/i) && // Case insensitive ingredient header filter
               !line.match(/^[\s•\-🧂]*$/); // Empty or just symbols
      });
    
    // Remove ONLY bullet points and dashes, but PRESERVE numbers (quantities)
    ingredientsList = rawIngredients.map(line => {
      return line.replace(/^[•\-]+\s*/, '').trim(); // Remove bullets/dashes but keep digits
    });
    
    // Use formatIngredientsForMidjourney if available (from version 2), otherwise simple join (from version 3)
    if (typeof formatIngredientsForMidjourney === 'function') {
      allIngredients = formatIngredientsForMidjourney(ingredientsList);
    } else {
      allIngredients = ingredientsList.join(', ');
    }
    
    firstThreeIngredients = ingredientsList.slice(0, 3).join('\n');
  }
  
  // Extract preparation steps (using approach from versions 2&3, with fallback to version 1)
  let instructionsSection = null;
  let instructionsList = [];
  
  // Try extractSection first (from version 1)
  if (typeof extractSection === 'function') {
    instructionsSection = extractSection(cleanedRecipe, 'INSTRUCTIONS');
  }
  
  // If extractSection didn't work, try extractPreparationSection (from versions 2&3)
  if (!instructionsSection && typeof extractPreparationSection === 'function') {
    instructionsSection = extractPreparationSection(cleanedRecipe);
  }
  
  if (instructionsSection) {
    // Process instructions (combining approaches from all versions)
    instructionsList = instructionsSection.split('\n')
      .map(line => line.replace(/^[\s🧑‍🍳]*/, '').trim()) // Remove emojis and spaces but keep numbers
      .filter(line => line && line.length > 1 && line !== 'INSTRUCTIONS' && !line.match(/^([🧑‍🍳#*]+)$/))
      .map(line => {
        // Remove ONLY bullet points and dashes, but keep step numbers
        return line.replace(/^[•\-]+\s*/, '').trim();
      });
  }
  
  // Store the recipe details in the shared state (from all versions)
  sharedRecipeState = {
    title,
    ingredients: ingredientsList,
    instructions: instructionsList,
    fullRecipe: cleanedRecipe
  };

  // Generate Midjourney prompt (combining all versions)
  console.log(chalk.gray('Creating Midjourney prompt...'));

  // Translate if needed (from all versions)
  let translatedTitle = title;
  let translatedIngredients = allIngredients;

  if (config.language.toLowerCase() !== 'english') {
    console.log(chalk.gray('Translating to English...'));
    translatedTitle = await translateToEnglish(title);
    translatedIngredients = await translateToEnglish(allIngredients);
  }

  let mjPrompt = replaceVars(config.prompts.mjTemplate, {
    title: translatedTitle,
    ingredients: translatedIngredients  // This contains only ingredients, not preparation steps (from version 3)
  });

  // Store the image URL but don't add it to the prompt here (from all versions)
  if (imageUrl && imageUrl.trim() !== '') {
    console.log(chalk.gray(`🖼️ Image URL will be processed by image-generator: ${imageUrl}`));
  } else {
    console.log(chalk.gray('🖼️ No image URL provided for Midjourney prompt'));
  }
  
  console.log(chalk.gray('Midjourney prompt generated:'));
  console.log(chalk.gray(mjPrompt.substring(0, 100) + '...'));
  
  // Generate Facebook caption (from all versions)
  console.log(chalk.gray('Creating Facebook caption...'));
  const fbCaption = await callOpenAI(
    '', // No system prompt in the original code
    replaceVars(config.prompts.fbCaptionPrompt, {
      recipeIdea,
      recipe: cleanedRecipe,
      language: config.language
    })
  );
  
  // Translate caption if needed (from all versions)
  let translatedCaption = fbCaption;
  if (config.language.toLowerCase() !== 'english') {
    console.log(chalk.gray('Translating caption to English...'));
    translatedCaption = await translateToEnglish(fbCaption);
  }
  
  const facebookContent = {
    recipe: cleanedRecipe,
    title,
    ingredients: firstThreeIngredients,
    allIngredients,  // This contains ONLY the ingredients (from versions 2&3)
    ingredientsList,
    instructionsList,
    mjPrompt,
    fbCaption,
    translatedCaption,
    imageUrl
  };
  
  // Discord recipe notification removed - no longer needed
  // The image generation will handle Discord communication
  
  return facebookContent;
}


// Helper function to extract a section from a recipe text
function extractSection(text, startMarker, endMarker = null) {
  const lines = text.split('\n');
  let startIndex = -1;
  let endIndex = lines.length;
  
  // Find the start marker
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === startMarker) {
      startIndex = i;
      break;
    }
  }
  
  // If start marker not found, return null
  if (startIndex === -1) return null;
  
  // Find the end marker if provided
  if (endMarker) {
    for (let i = startIndex + 1; i < lines.length; i++) {
      if (lines[i].trim() === endMarker) {
        endIndex = i;
        break;
      }
    }
  }
  
  // Extract the section
  return lines.slice(startIndex, endIndex).join('\n');
}

function extractPreparationSection(text) {
  const prepLabels = ['Preparation', 'Préparation', 'Zubereitung', 'Preparazione', 'Preparación', 'Instructions', 'Steps', 'Directions'];
  const nextSectionLabels = ['Tips', 'Note', 'Enjoy', 'Serving', 'Storage'];
  const nextPattern = new RegExp('^(?:' + nextSectionLabels.join('|') + ')', 'im');

  for (const label of prepLabels) {
    const labelRegex = new RegExp(label + '[^\n]*\n*', 'i');
    const startIndex = text.search(labelRegex);
    if (startIndex !== -1) {
      const afterStart = text.slice(startIndex);
      const nextSectionMatchIndex = afterStart.search(nextPattern);
      if (nextSectionMatchIndex !== -1) {
        return afterStart.slice(label.length + 1, nextSectionMatchIndex).trim();
      } else {
        // If no next section found, return everything after the label
        return afterStart.slice(label.length + 1).trim();
      }
    }
  }
  return null;
}

async function translateToEnglish(text) {
  if (!text || config.language.toLowerCase() === 'english') {
    return text;
  }
  
  try {
    // Get API key - prioritize database (settings page), then environment, then config
    let apiKey = await apiKeyManager.getApiKey('openai');
    if (!apiKey || apiKey.length < 20) {
      apiKey = process.env.OPENAI_API_KEY;
    }
    if (!apiKey || apiKey.length < 20) {
      apiKey = config.apiKey; // Fall back to config for backward compatibility
    }
    
    if (!apiKey || apiKey.length < 20) {
      console.error('Translation Error: No valid API key available');
      return text;
    }
    
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: config.model,
        messages: [
          {
            role: 'user',
            content: `Translate the following text into natural English. Return only the final translated sentence. Do not include quotes or explanation like "translated as" or "translates to".\n\n${text}`
          }
        ],
        temperature: 0.5
      },
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`
        }
      }
    );
    
    let result = response.data.choices[0].message.content.trim();
    
    result = result.replace(/"|"|'|'|"/g, '');
    result = result.replace(/translates to .*$/i, '').trim();
    result = result.replace(/translated as .*$/i, '').trim();
    result = result.replace(/in English is .*$/i, '').trim();
    
    return result;
  } catch (error) {
    console.error('Translation Error:', error.message);
    // If it's an authentication error, skip translation to avoid repeated errors
    if (error.response?.status === 401) {
      console.log('⚠️ Skipping translation due to invalid API key. Please update your OpenAI API key.');
    }
    return text;
  }
}

// Main functions
// Updated generatePinterestContent function with better error handling

async function generatePinterestContent(recipeIdea, category, interests) {
  console.log(chalk.cyan(`\n${'='.repeat(80)}`));
  console.log(chalk.cyan(`📌 GENERATING PINTEREST CONTENT FOR: "${recipeIdea}"`));
  console.log(chalk.cyan(`   Category: ${category || 'N/A'}`));
  console.log(chalk.cyan(`   Interests: ${interests || 'N/A'}`));
  console.log(chalk.cyan(`${'='.repeat(80)}\n`));

  try {
    console.log(chalk.gray('🎯 Step 1: Generating pin titles...'));
    // First verify that the system and user prompts for pin titles are not null
    const pinTitleSystemPrompt = config.prompts.pinTitleSystem || "You are a copywriting expert specialized in Pinterest Pin titles.";
    const pinTitleUserPrompt = config.prompts.pinTitleUser || "Recipe Idea: {{recipeIdea}}\nLanguage: {{language}}\nPlease generate {{pinCount}} different Pinterest Pin titles.";

    // Make sure interests has a default value if not provided
    const safeInterests = interests || 'healthy eating, easy recipes, home cooking';

    const formattedUserPrompt = replaceVars(pinTitleUserPrompt, {
      recipeIdea,
      category,
      interests: safeInterests,
      language: config.language,
      pinCount: config.pinCount
    });
    
    // Log the prompts for debugging
    console.log('Pin Title System Prompt length:', pinTitleSystemPrompt.length);
    console.log('Pin Title User Prompt:', formattedUserPrompt);
    
    const pinTitles = await callOpenAIArray(
      pinTitleSystemPrompt,
      formattedUserPrompt
    ).then(titles => titles.map(cleanOutput));
    
    // Check if we got any pin titles
    if (!pinTitles || pinTitles.length === 0) {
      console.error(chalk.red('Failed to generate pin titles'));
      return [];
    }
    
    console.log(chalk.gray(`Generated ${pinTitles.length} pin titles.`));
    
    console.log(chalk.gray('Generating pin descriptions...'));
    // Verify prompts for pin descriptions
    const pinDescSystemPrompt = config.prompts.pinDescSystem || "You are a Pinterest marketing and copywriting expert.";
    const pinDescUserPrompt = config.prompts.pinDescUser || "Pin Title: {{pinTitle}}\nCategory: {{category}}\nAnnotated Interests: {{interests}}\nLanguage: {{language}}\nPlease write {{pinCount}} different Pinterest Pin descriptions.";
    
    const formattedPinDescUserPrompt = replaceVars(pinDescUserPrompt, {
      pinTitle: pinTitles.join('\n'),
      category: category || '',
      interests: safeInterests,
      language: config.language,
      pinCount: config.pinCount
    });
    
    // Log the prompts for debugging
    console.log('Pin Desc System Prompt length:', pinDescSystemPrompt.length);
    console.log('Pin Desc User Prompt:', formattedPinDescUserPrompt.substring(0, 100) + '...');
    
    const pinDescs = await callOpenAIArray(
      pinDescSystemPrompt,
      formattedPinDescUserPrompt
    ).then(descs => descs.map(cleanOutput));
    
    // Check if we got any pin descriptions
    if (!pinDescs || pinDescs.length === 0) {
      console.error(chalk.red('Failed to generate pin descriptions'));
      return [];
    }
    
    console.log(chalk.gray(`Generated ${pinDescs.length} pin descriptions.`));

    console.log(chalk.cyan(`\n🔄 Creating ${Math.min(pinTitles.length, config.pinCount)} variations for "${recipeIdea}"...\n`));

    // Create variations using the generated titles and descriptions
    const variations = [];

    for (let v = 0; v < Math.min(pinTitles.length, config.pinCount); v++) {
      const pinTitle = pinTitles[v] || '';
      const pinDesc = pinDescs[v] || '';

      if (!pinTitle) {
        console.warn(chalk.yellow(`⚠️ Skipping variation ${v+1} for "${recipeIdea}" due to missing pin title`));
        continue;
      }

      console.log(chalk.cyan(`\n📝 Creating variation ${v+1}/${config.pinCount} for "${recipeIdea}"...`));
      console.log(chalk.gray(`   Title: ${pinTitle.substring(0, 50)}${pinTitle.length > 50 ? '...' : ''}`));

      try {
        // Add small delay to prevent OpenAI response caching/similarity (300ms)
        if (v > 0) {
          console.log(chalk.gray('   ⏱️ Waiting 300ms to prevent API response caching...'));
          await new Promise(resolve => setTimeout(resolve, 300));
        }

        // Generate overlay text with fallbacks
        console.log(chalk.gray('   🎨 Generating overlay text...'));
        const pinOverlaySystemPrompt = config.prompts.pinOverlaySystem || "You are a Pinterest marketing and visual copy expert.";
        const pinOverlayUserPrompt = config.prompts.pinOverlayUser || "Pin Title: {{pinTitle}}\nLanguage: {{language}}\nCreate {{pinCount}} short Pinterest image overlay text (4–7 words max).";

        const overlay = await callOpenAIArray(
       pinOverlaySystemPrompt,
      replaceVars(pinOverlayUserPrompt, {
    pinTitle,
    language: config.language,
    interests: safeInterests, // Add the interests variable
    pinCount: 1
    })
    ).then(overlays => cleanOutput(overlays[0] || ''));

        console.log(chalk.gray(`   ✅ Overlay: ${overlay}`));
        
        // Generate meta title with fallbacks
        const metaTitleSystemPrompt = config.prompts.metaTitleSystem || "You are an SEO content strategist.";
        const metaTitleUserPrompt = config.prompts.metaTitleUser || "Pin Title: {{pinTitle}}\nLanguage: {{language}}\nPlease generate 1 SEO blog post title.";
        
        const metaTitle = await callOpenAI(
          metaTitleSystemPrompt,
          replaceVars(metaTitleUserPrompt, {
            pinTitle,
            pinDesc,
            language: config.language
          })
        ).then(title => cleanOutput(title));
        
        // Generate meta description with fallbacks
        const metaDescSystemPrompt = config.prompts.metaDescSystem || "You are an SEO content strategist.";
        const metaDescUserPrompt = config.prompts.metaDescUser || "Pin Title: {{pinTitle}}\nPin Description: {{pinDesc}}\nLanguage: {{language}}\nPlease generate 1 SEO meta description.";
        
        const metaDesc = await callOpenAI(
          metaDescSystemPrompt,
          replaceVars(metaDescUserPrompt, {
            pinTitle,
            pinDesc,
            language: config.language
          })
        ).then(desc => cleanOutput(desc));
        
        // Generate slug
        const slugSystemPrompt = config.prompts.slugSystemPrompt || "You are an SEO specialist.";
        const slugUserPrompt = config.prompts.slugUserPrompt || "Recipe Idea: {{recipeIdea}}\nMeta Title: {{metaTitle}}\nPlease generate a short, SEO-optimized blog post slug.";
        
        const metaSlug = await callOpenAI(
          slugSystemPrompt,
          replaceVars(slugUserPrompt, {
            recipeIdea,
            metaTitle,
            language: config.language
          })
        ).then(slug => cleanOutput(slug));
        
        // Add variation to the list
        const variation = {
          pinTitle,
          pinDesc,
          overlay: overlay || 'Simple ' + recipeIdea,  // Provide a fallback if overlay is empty
          metaTitle: metaTitle || pinTitle,  // Use pin title as fallback if meta title is empty
          metaDesc: metaDesc || pinDesc,  // Use pin description as fallback if meta description is empty
          metaSlug: metaSlug || recipeIdea.toLowerCase().replace(/\s+/g, '-')  // Simple fallback slug
        };

        variations.push(variation);

        console.log(chalk.green(`   ✅ Variation ${v+1} complete for "${recipeIdea}"`));
        console.log(chalk.gray(`      Overlay: "${variation.overlay}"`));
        console.log(chalk.gray(`      Meta Title: "${variation.metaTitle.substring(0, 50)}..."`));

      } catch (error) {
        console.error(chalk.red(`❌ Error generating variation ${v+1} for "${recipeIdea}":`), error.message);
        // Continue with next variation, don't stop the whole process
      }
    }

    console.log(chalk.green(`\n✅ Generated ${variations.length} variations for "${recipeIdea}"\n`));
    
    return variations;
  } catch (error) {
    console.error(chalk.red('Error in generatePinterestContent:'), error);
    // Return an empty array instead of throwing, allowing the process to continue
    return [];
  }
}

// Let's add a new function to extract the ingredients in a cleaner format
// This will help create a better Midjourney prompt

function formatIngredientsForMidjourney(ingredientsList) {
  if (!ingredientsList || ingredientsList.length === 0) {
    return '';
  }
  
  // Process each ingredient to clean it up
  const cleanedIngredients = ingredientsList.map(ingredient => {
    // Remove emoji and bullet points
    let cleaned = ingredient.replace(/^[-•*🧂\s]+|[-•*🧂\s]+$/g, '').trim();
    
    // Remove preparation instructions that often appear in parentheses
    cleaned = cleaned.replace(/\(.*?\)/g, '').trim();
    
    // Handle measurement fractions
    cleaned = cleaned.replace(/(\d+)\s*\/\s*(\d+)/g, '$1/$2');
    
    // Check if it has a reasonable length (avoid including preparation instructions)
    if (cleaned.length > 100) {
      // If too long, just take the first part which is likely the actual ingredient
      cleaned = cleaned.split(',')[0].trim();
    }
    
    return cleaned;
  });
  
  // Filter out any empty items
  const filteredIngredients = cleanedIngredients.filter(ing => ing && ing.length > 0);
  
  // Join with commas
  return filteredIngredients.join(', ');
}



// This is the key function we need to modify in app.js
// We need to improve the generateBlogPost function to ensure it uses the same recipe details as Facebook

// Enhanced generateBlogPost function with better error handling

async function generateBlogPost(recipeIdea, category, interests, metaTitle, metaDescription) {
  console.log(chalk.cyan(`\nGenerating blog post for: ${metaTitle || recipeIdea}`));
  
  try {
    // Create a custom user prompt that includes the recipe details
    let userPrompt = config.prompts.blogpostUserPrompt || 
      "Please write a full SEO-optimized blog post for:\nRecipe Idea: {{recipeIdea}}\nMeta Title: {{metaTitle}}\nMeta Description: {{metaDescription}}";
    
    // Verify that system prompt exists or provide a default
    const systemPrompt = config.prompts.blogpostSystemPrompt || 
      "You are a food blogger and SEO content strategist. Write a detailed recipe blog post.";
    
    // Log prompts for debugging
    console.log(`Using blog system prompt (length: ${systemPrompt.length})`);
    console.log(`Using blog user prompt template (length: ${userPrompt.length})`);
    
    // If we have shared recipe state, add it to the prompt
    if (sharedRecipeState && sharedRecipeState.ingredients && sharedRecipeState.ingredients.length > 0) {
      console.log(chalk.gray('Using existing recipe ingredients and instructions from Facebook content'));
      
      // Add shared recipe ingredients and instructions to the prompt
      userPrompt += `\n\nIMPORTANT: You MUST use exactly these ingredients in your recipe blog post. Do not add or remove any ingredients:\n`;
      sharedRecipeState.ingredients.forEach(ing => {
        userPrompt += `- ${ing}\n`;
      });
      
      // Make sure instructions aren't empty
      if (sharedRecipeState.instructions && sharedRecipeState.instructions.length > 0) {
        userPrompt += `\nAnd you MUST follow these exact instruction steps in the same order (you can enhance and explain more, but cover all these steps in the same order):\n`;
        sharedRecipeState.instructions.forEach((inst, idx) => {
          userPrompt += `${idx + 1}. ${inst}\n`;
        });
      }
      
      // Add a final instruction to ensure compliance
      userPrompt += `\nMake sure your blog post EXACTLY matches these ingredients and instructions for consistency. This is critical.`;
    } else {
      console.log(chalk.yellow('Warning: No shared recipe state found. Blog post may not match Facebook content.'));
    }
    
    // Format the user prompt with recipe details
    const formattedUserPrompt = replaceVars(userPrompt, {
      recipeIdea: recipeIdea || '',
      category: category || '',
      interests: interests || '',
      metaTitle: metaTitle || recipeIdea || '',
      metaDescription: metaDescription || '',
      language: config.language || 'English'
    });
    
    console.log(`Formatted user prompt (first 100 chars): ${formattedUserPrompt.substring(0, 100)}...`);
    
    // Generate the blog content
    const blogContent = await callOpenAI(
      systemPrompt,
      formattedUserPrompt
    );
    
    // Check if the API call failed
    if (blogContent === 'ERROR') {
      console.error(chalk.red('OpenAI API returned an error during blog post generation'));
      return null;
    }
    
    // Add post-processing to format the content for better display
    console.log(chalk.green('Successfully generated blog content, formatting...'));
    const formattedBlogContent = formatBlogContent(blogContent);
    
    return formattedBlogContent;
  } catch (error) {
    console.error(chalk.red('Error generating blog post:'), error);
    return null;
  }
}

function formatBlogContent(content) {
  // Remove any extra whitespace and normalize line endings
  content = content.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  
  // Split the content into paragraphs
  const paragraphs = content.split(/\n\n+/);
  let formattedContent = '';
  let inIngredientsList = false;
  let inInstructionsList = false;
  
  for (let i = 0; i < paragraphs.length; i++) {
    let para = paragraphs[i].trim();
    
    if (!para) continue; // Skip empty paragraphs
    
    // Check if this is a heading (single line, no periods in the middle, ends with colon optionally)
    if (para.split('\n').length === 1 && !para.match(/\.\s+[A-Z]/) && (para.endsWith(':') || !para.includes('.'))) {
      // Looks like a heading
      formattedContent += `<h2>${para}</h2>\n\n`;
      
      // Check if next paragraph might be an ingredients list
      if (para.toLowerCase().includes('ingredient') || para.toLowerCase().includes('you need') || 
          para.toLowerCase().includes('you\'ll need')) {
        inIngredientsList = true;
        inInstructionsList = false;
      } 
      // Check if next paragraph might be instructions
      else if (para.toLowerCase().includes('instruction') || para.toLowerCase().includes('direction') || 
               para.toLowerCase().includes('how to') || para.toLowerCase().includes('steps') ||
               para.toLowerCase().includes('making') || para.toLowerCase().includes('prepare')) {
        inIngredientsList = false;
        inInstructionsList = true;
      } 
      // If it's a different kind of heading, reset flags
      else {
        inIngredientsList = false;
        inInstructionsList = false;
      }
      
      continue;
    }
    
    // Check for ingredients list
    if (inIngredientsList && 
        (para.includes('-') || para.split('\n').some(line => line.trim().startsWith('-')))) {
      // This is likely an ingredients list
      const items = para.split('\n').map(line => line.trim()).filter(line => line);
      
      formattedContent += '<ul class="ingredients-list">\n';
      for (const item of items) {
        // Clean up the list item, removing bullet points or dashes
        let cleanItem = item.replace(/^[-•*]\s*/, '').trim();
        if (cleanItem) {
          formattedContent += `  <li>${cleanItem}</li>\n`;
        }
      }
      formattedContent += '</ul>\n\n';
      continue;
    }
    
    // Check for instruction steps
    if (inInstructionsList) {
      // Check if this paragraph contains numbered steps or step titles
      const hasNumbers = para.match(/^\d+\./) || para.match(/\n\d+\./);
      const hasStepTitles = para.match(/Step \d+:/) || para.match(/\nStep \d+:/);
      
      if (hasNumbers || hasStepTitles) {
        // Split into steps and format as ordered list
        let steps = [];
        
        // Handle different step formats
        if (hasNumbers) {
          // Split by numbers with periods
          steps = para.split(/(?=\d+\.)/);
        } else if (hasStepTitles) {
          // Split by "Step X:" pattern
          steps = para.split(/(?=Step \d+:)/);
        } else {
          // Just use paragraph lines as steps
          steps = para.split('\n').filter(s => s.trim());
        }
        
        formattedContent += '<ol class="instructions-list">\n';
        for (let step of steps) {
          step = step.trim();
          if (!step) continue;
          
          // Clean up the step, removing numbers or "Step X:" text
          let cleanStep = step.replace(/^\d+\.\s*/, '').replace(/^Step \d+:\s*/, '').trim();
          formattedContent += `  <li>${cleanStep}</li>\n`;
        }
        formattedContent += '</ol>\n\n';
        continue;
      }
    }
    
    // Handle FAQ section - look for question marks followed by answers
    if (para.includes('?') && paragraphs.length - i > 3) {
      // Check if this and following paragraphs look like Q&A pairs
      const possibleQA = [para];
      let j = i + 1;
      
      // Collect sequences that look like questions and answers
      while (j < paragraphs.length && j - i < 10) {
        possibleQA.push(paragraphs[j]);
        j++;
      }
      
      // Check if we have alternating questions and answers
      const questions = possibleQA.filter((_, idx) => idx % 2 === 0);
      const hasQuestions = questions.every(q => q.includes('?'));
      
      if (hasQuestions && questions.length >= 2) {
        formattedContent += '<div class="faq-section">\n';
        
        for (let k = 0; k < questions.length; k++) {
          const question = questions[k].trim();
          const answer = possibleQA[k * 2 + 1]?.trim() || '';
          
          if (question && answer) {
            formattedContent += `<h3>${question}</h3>\n`;
            formattedContent += `<p>${answer}</p>\n\n`;
          }
        }
        
        formattedContent += '</div>\n\n';
        i = i + questions.length * 2 - 1; // Skip processed paragraphs
        continue;
      }
    }
    
    // Regular paragraph - check if it has line breaks inside
    if (para.includes('\n')) {
      // Multiple lines in one paragraph - might be a list or separate paragraphs
      const lines = para.split('\n').map(line => line.trim()).filter(line => line);
      
      // Check if this looks like a list
      if (lines.some(line => line.startsWith('-') || line.startsWith('•'))) {
        formattedContent += '<ul>\n';
        for (const line of lines) {
          // Only process actual list items
          if (line.startsWith('-') || line.startsWith('•')) {
            const cleanLine = line.replace(/^[-•]\s*/, '').trim();
            if (cleanLine) {
              formattedContent += `  <li>${cleanLine}</li>\n`;
            }
          } else {
            // Non-list lines become paragraphs
            formattedContent += `<p>${line}</p>\n`;
          }
        }
        formattedContent += '</ul>\n\n';
      } else {
        // Just separate paragraphs
        for (const line of lines) {
          formattedContent += `<p>${line}</p>\n\n`;
        }
      }
    } else {
      // Standard paragraph
      formattedContent += `<p>${para}</p>\n\n`;
    }
  }
  
  return formattedContent;
}


// Main application
async function main() {
  // Skip CLI interface when running in web mode
  if (!inquirer) {
    console.log('Running in web mode - skipping CLI interface');
    return;
  }
  
  console.log(chalk.green.bold('🍲 Recipe Content Generator 🍲'));
  console.log(chalk.yellow('Combines Pinterest, Blog, Facebook, and Midjourney content generation'));
  
// Check for API key
// Check for API key
const apiKey = await apiKeyManager.getApiKey('openai');
if (!apiKey) {
  console.log(chalk.red('Error: No OpenAI API key available.'));
  console.log(chalk.yellow('Please add your OpenAI API key in the settings page.'));
  process.exit(1);
}
config.apiKey = apiKey; // Set the key in the config
  
  // Main menu
  const { action } = await inquirer.prompt([
    {
      type: 'list',
      name: 'action',
      message: 'What would you like to do?',
      choices: [
        { name: 'Generate Pinterest & Blog Content', value: 'pinterest' },
        { name: 'Generate Facebook & Midjourney Content', value: 'facebook' },
        { name: 'Generate All Content Types', value: 'all' },
        { name: 'Settings', value: 'settings' },
        { name: 'Exit', value: 'exit' }
      ]
    }
  ]);
  
  if (action === 'exit') {
    console.log(chalk.green('Goodbye!'));
    process.exit(0);
  }
  
  if (action === 'settings') {
    const { language, model, pinCount } = await inquirer.prompt([
      {
        type: 'list',
        name: 'language',
        message: 'Select content language:',
        choices: ['English', 'Spanish', 'French', 'German', 'Italian'],
        default: config.language
      },
      {
        type: 'list',
        name: 'model',
        message: 'Select OpenAI model:',
        choices: ['gpt-4-turbo-preview', 'gpt-4', 'gpt-3.5-turbo'],
        default: config.model
      },
      {
        type: 'number',
        name: 'pinCount',
        message: 'How many Pinterest variations to generate:',
        default: config.pinCount,
        validate: input => (input > 0 && input <= 20) ? true : 'Please enter a number between 1 and 20'
      }
    ]);
    
    config.language = language;
    config.model = model;
    config.pinCount = pinCount;
    
    console.log(chalk.green(`Settings updated: Language: ${language}, Model: ${model}, Pin Count: ${pinCount}`));
    return main();
  }
  
  // Get recipe details
  const { recipeIdea, category, interests } = await inquirer.prompt([
    {
      type: 'input',
      name: 'recipeIdea',
      message: 'Enter your recipe idea:',
      validate: input => input.trim() !== '' ? true : 'Recipe idea cannot be empty'
    },
    {
      type: 'list',
      name: 'category',
      message: 'Select a recipe category:',
      choices: [
        'Breakfast', 'Lunch', 'Dinner', 'Dessert', 'Appetizers', 
        'Soups', 'Salads', 'Vegan', 'Vegetarian', 'Gluten-Free',
        'Low-Carb', 'Keto', 'Paleo', 'Quick & Easy', 'Budget-Friendly'
      ]
    },
    {
      type: 'input',
      name: 'interests',
      message: 'Enter target audience interests (comma-separated):',
      default: 'healthy eating, easy recipes, home cooking'
    }
  ]);
  
  // Create output directory
  const outputDir = path.join(__dirname, 'output', recipeIdea.replace(/[^a-z0-9]/gi, '_').toLowerCase());
  fs.mkdirSync(outputDir, { recursive: true });
  
  // Generate content based on selected action
  const results = {
    recipeIdea,
    category,
    interests,
    pinterest: null,
    blog: null,
    facebook: null
  };
  
  // Always generate Facebook content first if it's going to be needed
  if (action === 'facebook' || action === 'all') {
    results.facebook = await generateFacebookContent(recipeIdea, null);
  }
  
  if (action === 'pinterest' || action === 'all') {
    results.pinterest = await generatePinterestContent(recipeIdea, category, interests);
    
    // Generate blog for the first variation
    if (results.pinterest.length > 0) {
      const variation = results.pinterest[0];
      results.blog = await generateBlogPost(
        recipeIdea,
        category,
        interests,
        variation.metaTitle,
        variation.metaDesc
      );
    }
  }
  
  // Save results
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outputFile = path.join(outputDir, `${timestamp}-results.json`);
  
  fs.writeFileSync(outputFile, JSON.stringify(results, null, 2));
  console.log(chalk.green(`\nResults saved to: ${outputFile}`));
  
  // Create separate files for different content types
  if (results.blog) {
    const blogOutputFile = path.join(outputDir, `${timestamp}-blog-post.html`);
    fs.writeFileSync(blogOutputFile, results.blog);
    console.log(chalk.green(`Blog post saved to: ${blogOutputFile}`));
  }
  
  if (results.facebook) {
    const facebookOutputFile = path.join(outputDir, `${timestamp}-facebook.md`);
    fs.writeFileSync(
      facebookOutputFile,
      `# ${results.facebook.title}\n\n${results.facebook.recipe}\n\n## Facebook Caption\n\n${results.facebook.fbCaption}\n\n## Midjourney Prompt\n\n${results.facebook.mjPrompt}`
    );
    console.log(chalk.green(`Facebook content saved to: ${facebookOutputFile}`));
  }
  
  if (results.pinterest) {
    const pinterestOutputFile = path.join(outputDir, `${timestamp}-pinterest.md`);
    let pinterestContent = `# Pinterest Content for "${recipeIdea}"\n\n`;
    
    results.pinterest.forEach((variation, i) => {
      pinterestContent += `## Variation ${i + 1}\n\n`;
      pinterestContent += `### Pin Title\n${variation.pinTitle}\n\n`;
      pinterestContent += `### Pin Description\n${variation.pinDesc}\n\n`;
      pinterestContent += `### Overlay Text\n${variation.overlay}\n\n`;
      pinterestContent += `### Blog Meta Title\n${variation.metaTitle}\n\n`;
      pinterestContent += `### Blog Meta Description\n${variation.metaDesc}\n\n`;
      pinterestContent += `### URL Slug\n${variation.metaSlug}\n\n`;
      pinterestContent += `---\n\n`;
    });
    
    fs.writeFileSync(pinterestOutputFile, pinterestContent);
    console.log(chalk.green(`Pinterest content saved to: ${pinterestOutputFile}`));
  }
  
  console.log(chalk.cyan('\nProcess completed successfully!'));
  
  // Ask if user wants to continue
  const { continueAction } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'continueAction',
      message: 'Do you want to generate more content?',
      default: true
    }
  ]);
  
  if (continueAction) {
    return main();
  } else {
    console.log(chalk.green('Thank you for using Recipe Content Generator!'));
    process.exit(0);
  }
}

async function updateConfig(newConfig) {
  // Store old config for logging if needed
  const oldConfig = { ...config };
  
  console.log('🔧 [CONFIG] Starting config update...');
  console.log('🔧 [CONFIG] Incoming config:', {
    model: newConfig.model,
    temperature: newConfig.temperature,
    apiKey: newConfig.apiKey ? `${newConfig.apiKey.substring(0, 3)}...` : 'none',
    hasDiscordSettings: !!(newConfig.discordChannelId || newConfig.discordUserToken || newConfig.enableDiscord)
  });
  
  // CRITICAL FIX: Get current Discord settings if not provided in newConfig
  let discordSettings = null;
  
  // Check if Discord settings are provided in newConfig
  if (newConfig.discordChannelId && newConfig.discordUserToken) {
    console.log('✅ [CONFIG] Using Discord settings from newConfig');
    discordSettings = {
      discordChannelId: newConfig.discordChannelId,
      discordUserToken: newConfig.discordUserToken,
      discordWebhookUrl: newConfig.discordWebhookUrl || '',
      enableDiscord: newConfig.enableDiscord !== false, // Default to true if we have credentials
      source: 'updateConfig-parameter'
    };
  } else {
    console.log('🔍 [CONFIG] No Discord settings in newConfig, checking global settings...');
    
    // Try to get Discord settings from the global function
    try {
      if (typeof global.getCurrentDiscordSettings === 'function') {
        discordSettings = await global.getCurrentDiscordSettings();
        
        if (discordSettings) {
          console.log('✅ [CONFIG] Retrieved Discord settings from global function');
          console.log(`🔑 [CONFIG] Discord Channel: ${discordSettings.discordChannelId}`);
          console.log(`🔐 [CONFIG] Discord Token: ${discordSettings.discordUserToken.substring(0, 10)}...`);
          console.log(`📍 [CONFIG] Discord Source: ${discordSettings.source}`);
        } else {
          console.log('⚠️ [CONFIG] No Discord settings available from global function');
        }
      } else {
        console.log('⚠️ [CONFIG] global.getCurrentDiscordSettings function not available');
      }
    } catch (error) {
      console.error('❌ [CONFIG] Error getting Discord settings:', error.message);
    }
  }
  
  // Update the config with the new values
  config = {
    ...config,
    ...newConfig,
    pinCount: parseInt(newConfig.pinCount || config.pinCount || '10')
  };
  
  // CRITICAL FIX: Apply Discord settings to config
  if (discordSettings) {
    console.log('🔧 [CONFIG] Applying Discord settings to config...');
    config.discordChannelId = discordSettings.discordChannelId;
    config.discordUserToken = discordSettings.discordUserToken;
    config.discordWebhookUrl = discordSettings.discordWebhookUrl || '';
    config.enableDiscord = discordSettings.enableDiscord;
    
    console.log('✅ [CONFIG] Discord settings applied to config:');
    console.log(`   📺 Channel: ${config.discordChannelId}`);
    console.log(`   🔐 Token: ${config.discordUserToken.substring(0, 10)}...`);
    console.log(`   ✅ Enabled: ${config.enableDiscord}`);
    console.log(`   📍 Source: ${discordSettings.source}`);
  } else {
    console.log('❌ [CONFIG] No Discord settings available - setting enableDiscord to false');
    config.enableDiscord = false;
  }
  
  // Ensure prompts object exists
  if (!config.prompts) {
    config.prompts = {};
  }
  
  // Validate and provide defaults for all required prompts
  const defaultSystemPrompt = "You are a helpful assistant.";
  const defaultUserPrompt = "Please provide information about {{recipeIdea}}.";
  
  // Check Pinterest prompts
  config.prompts.pinTitleSystem = config.prompts.pinTitleSystem || defaultSystemPrompt;
  config.prompts.pinTitleUser = config.prompts.pinTitleUser || defaultUserPrompt;
  config.prompts.pinDescSystem = config.prompts.pinDescSystem || defaultSystemPrompt;
  config.prompts.pinDescUser = config.prompts.pinDescUser || defaultUserPrompt;
  config.prompts.pinOverlaySystem = config.prompts.pinOverlaySystem || defaultSystemPrompt;
  config.prompts.pinOverlayUser = config.prompts.pinOverlayUser || defaultUserPrompt;
  config.prompts.metaTitleSystem = config.prompts.metaTitleSystem || defaultSystemPrompt;
  config.prompts.metaTitleUser = config.prompts.metaTitleUser || defaultUserPrompt;
  config.prompts.metaDescSystem = config.prompts.metaDescSystem || defaultSystemPrompt;
  config.prompts.metaDescUser = config.prompts.metaDescUser || defaultUserPrompt;
  config.prompts.slugSystemPrompt = config.prompts.slugSystemPrompt || defaultSystemPrompt;
  config.prompts.slugUserPrompt = config.prompts.slugUserPrompt || defaultUserPrompt;
  config.prompts.blogpostSystemPrompt = config.prompts.blogpostSystemPrompt || defaultSystemPrompt;
  config.prompts.blogpostUserPrompt = config.prompts.blogpostUserPrompt || defaultUserPrompt;
  
  // Check Facebook prompts
  config.prompts.fbPrompt = config.prompts.fbPrompt || defaultUserPrompt;
  config.prompts.mjTemplate = config.prompts.mjTemplate || "Food photo of {{title}} with {{ingredients}}";
  config.prompts.fbCaptionPrompt = config.prompts.fbCaptionPrompt || defaultUserPrompt;
  
  // Log the final configuration
  console.log('🎯 [CONFIG] Final configuration:');
  console.log(`   🤖 Model: ${config.model}`);
  console.log(`   🌡️ Temperature: ${config.temperature}`);
  console.log(`   🔑 API Key: ${config.apiKey ? 'Set' : 'Not set'}`);
  console.log(`   📺 Discord Channel: ${config.discordChannelId || 'Not set'}`);
  console.log(`   🔐 Discord Token: ${config.discordUserToken ? config.discordUserToken.substring(0, 10) + '...' : 'Not set'}`);
  console.log(`   ✅ Discord Enabled: ${config.enableDiscord}`);
  console.log(`   📊 Pin Count: ${config.pinCount}`);
  
  console.log('✅ [CONFIG] Configuration update completed successfully');
}

// Function to clean recipe text for display
// Add this function to your app.js or a separate utilities file

function cleanRecipeText(recipeText) {
  if (!recipeText) return '';
  
  // Remove markdown formatting characters
  let cleaned = recipeText
    .replace(/\*\*(.*?)\*\*/g, '$1') // Remove bold formatting
    .replace(/\*(.*?)\*/g, '$1') // Remove italic formatting
    .replace(/#{1,6}\s/g, '') // Remove heading markers
    .replace(/\n+/g, '\n').trim(); // Normalize line breaks
  
  // Split the text into lines
  const lines = cleaned.split('\n');
  
  // Identify and fix section labels
  let currentSection = 'intro';
  let cleanedLines = [];
  
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();
    
    // Skip empty lines
    if (!line) continue;
    
    // Check if this is a section marker
    if (line.includes('🧂') || line.toLowerCase().includes('ingredients')) {
      currentSection = 'ingredients';
      cleanedLines.push('INGREDIENTS');
      continue;
    } else if (line.includes('🧑‍🍳') || line.toLowerCase().includes('preparation') || 
              line.toLowerCase().includes('instructions') || line.toLowerCase().includes('steps')) {
      currentSection = 'instructions';
      cleanedLines.push('INSTRUCTIONS');
      continue;
    } else if (line.toLowerCase().includes('tip') || line.toLowerCase().includes('note')) {
      currentSection = 'tips';
      cleanedLines.push('TIPS & NOTES');
      continue;
    }
    
    // Clean up list indicators
    if (currentSection === 'ingredients') {
      // For ingredients, handle bullet points consistently
      if (line.startsWith('- ') || line.startsWith('• ')) {
        line = line.substring(2).trim();
      }
      
      // Add a bullet point if there isn't one
      if (/^\d+\.?\s/.test(line)) {
        // If it starts with a number, extract just the item text
        line = line.replace(/^\d+\.?\s/, '').trim();
      }
      
      // Add a standard bullet point to ingredient items
      line = '• ' + line;
    } else if (currentSection === 'instructions') {
      // For instructions, handle numbered steps consistently
      if (/^\d+[\.\)]/.test(line)) {
        // Already numbered, keep the number but standardize format
        const num = line.match(/^\d+/)[0];
        line = line.replace(/^\d+[\.\)]?\s*/, '').trim();
        line = `${num}. ${line}`;
      } else if (line.startsWith('- ') || line.startsWith('• ')) {
        // Convert bullet points to numbered steps based on position
        line = line.substring(2).trim();
        line = `${cleanedLines.length - 
          cleanedLines.lastIndexOf('INSTRUCTIONS')}. ${line}`;
      }
    }
    
    cleanedLines.push(line);
  }
  
  // Join the clean lines back together
  return cleanedLines.join('\n');
}

// Function to format recipe for display
function formatRecipeForDisplay(recipe) {
  // First clean the text
  const cleanedRecipe = cleanRecipeText(recipe);
  
  // Split into sections
  const lines = cleanedRecipe.split('\n');
  let title = '';
  let ingredients = [];
  let instructions = [];
  let currentSection = 'intro';
  
  // Extract title from first line
  if (lines.length > 0) {
    title = lines[0].replace(/\*/g, '').trim();
  }
  
  // Process the rest of the content
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    
    if (!line) continue;
    
    if (line === 'INGREDIENTS') {
      currentSection = 'ingredients';
      continue;
    } else if (line === 'INSTRUCTIONS') {
      currentSection = 'instructions';
      continue;
    } else if (line === 'TIPS & NOTES') {
      currentSection = 'tips';
      continue;
    }
    
    if (currentSection === 'ingredients' && line) {
      ingredients.push(line);
    } else if (currentSection === 'instructions' && line) {
      instructions.push(line);
    }
  }
  
  // Create a nicely formatted HTML representation
  return {
    title,
    ingredients,
    instructions
  };
}

// Example of how to use this in your application
function generateCleanRecipeHTML(recipeText) {
  const formattedRecipe = formatRecipeForDisplay(recipeText);
  
  let html = `<div class="recipe">
    <h2 class="recipe-title">${formattedRecipe.title}</h2>
    
    <div class="recipe-meta">
      <div class="prep-time">
        <span class="label">PREP TIME</span>
        <span class="value">15 min</span>
      </div>
      <div class="cook-time">
        <span class="label">COOK TIME</span>
        <span class="value">15 min</span>
      </div>
      <div class="total-time">
        <span class="label">TOTAL TIME</span>
        <span class="value">30 min</span>
      </div>
      <div class="servings">
        <span class="label">SERVINGS</span>
        <span class="value">4 servings</span>
      </div>
    </div>
    
    <div class="recipe-ingredients">
      <h3>INGREDIENTS</h3>
      <ul>
        ${formattedRecipe.ingredients.map(item => `<li>${item.replace(/^•\s/, '')}</li>`).join('')}
      </ul>
    </div>
    
    <div class="recipe-instructions">
      <h3>INSTRUCTIONS</h3>
      <ol>
        ${formattedRecipe.instructions.map(item => {
          // Extract the number if it exists
          const match = item.match(/^(\d+)\.\s(.*)/);
          return match ? `<li>${match[2]}</li>` : `<li>${item}</li>`;
        }).join('')}
      </ol>
    </div>
  </div>`;
  
  return html;
}

// Function to save prompt logs to a file
function logPromptToFile(systemPrompt, userPrompt, templateId) {
  try {
    const fs = require('fs');
    const path = require('path');
    
    // Create logs directory if it doesn't exist
    const logsDir = path.join(__dirname, 'prompt_logs');
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
    
    // Format the log content
    const logContent = `
==== PROMPT LOG: ${new Date().toISOString()} ====
Template ID: ${templateId || 'N/A'}

--- SYSTEM PROMPT ---
${systemPrompt || '(No system prompt)'}

--- USER PROMPT ---
${userPrompt || '(No user prompt)'}

==== END PROMPT LOG ====
`;
    
    // Generate a filename based on current time
    const fileName = `prompt_log_${Date.now()}.txt`;
    const filePath = path.join(logsDir, fileName);
    
    // Write to file
    fs.writeFileSync(filePath, logContent);
    
    console.log(`Prompt log saved to: ${filePath}`);
    return fileName;
  } catch (error) {
    console.error('Error saving prompt log:', error);
    return null;
  }
}

async function callOpenAI(systemPrompt, userPrompt) {
  try {
    // Ensure systemPrompt and userPrompt are not null or undefined
    const safeSystemPrompt = systemPrompt || '';
    const safeUserPrompt = userPrompt || '';
    
    console.log('Making OpenAI API call:');
    console.log('System prompt length:', safeSystemPrompt.length);
    console.log('User prompt length:', safeUserPrompt.length);
    
    // Make sure we're using the API key from config
    const apiKey = config.apiKey;
    
    // Log the API key (first few characters) for debugging
    if (apiKey) {
      console.log(`Using API key: ${apiKey.substring(0, 3)}...${apiKey.substring(apiKey.length - 3)}`);
    } else {
      console.log('No API key available!');
      return 'ERROR: No API key provided. Please check your API key in settings.';
    }
    
    // Create messages array, only include system message if it's not empty
    const messages = [];
    if (safeSystemPrompt.trim() !== '') {
      messages.push({ role: 'system', content: safeSystemPrompt });
    }
    messages.push({ role: 'user', content: safeUserPrompt });
    
    // DEBUG: Log full prompts if debug mode is enabled
    if (global.debugPrompts) {
      const templateId = new Date().toISOString();
      console.log('\n==== DEBUG: PROMPT DETAILS ====');
      console.log('Template ID:', templateId);
      if (safeSystemPrompt.trim() !== '') {
        console.log('\n--- SYSTEM PROMPT ---');
        console.log(safeSystemPrompt);
      }
      console.log('\n--- USER PROMPT ---');
      console.log(safeUserPrompt);
      console.log('\n==== END PROMPT DETAILS ====\n');
      
      // Save to file
      logPromptToFile(safeSystemPrompt, safeUserPrompt, templateId);
    }
    
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: config.model,
        messages: messages,
        temperature: config.temperature || 0.7
      },
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`
        }
      }
    );
    
    // DEBUG: Log response first token in debug mode
    if (global.debugPrompts && response.data.choices && response.data.choices[0]) {
      const responseText = response.data.choices[0].message.content.trim();
      console.log('\n==== DEBUG: RESPONSE PREVIEW ====');
      console.log(responseText.substring(0, 100) + (responseText.length > 100 ? '...' : ''));
      console.log('==== END RESPONSE PREVIEW ====\n');
    }
    
    return response.data.choices[0].message.content.trim();
  } catch (error) {
    console.error('OpenAI API Error:', error.response?.data?.error || error.message);
    
    // Provide more detailed error information
    if (error.response?.data?.error) {
      console.error('Error details:', JSON.stringify(error.response.data.error, null, 2));
    }
    
    return 'ERROR';
  }
}

// Command-line interface for prompt debugging
if (require.main === module) {
  const yargs = require('yargs/yargs');
  const { hideBin } = require('yargs/helpers');
  
  yargs(hideBin(process.argv))
    .command('debug-prompt', 'Send a prompt with debug output', (yargs) => {
      return yargs
        .option('system', {
          alias: 's',
          type: 'string',
          description: 'System prompt to send'
        })
        .option('user', {
          alias: 'u',
          type: 'string',
          description: 'User prompt to send',
          demandOption: true
        })
        .option('model', {
          alias: 'm',
          type: 'string',
          description: 'Model to use',
          default: 'gpt-4-turbo-preview'
        });
    }, async (argv) => {
      try {
        // Force debug mode on
        global.debugPrompts = true;
        
        // Update config for this run
        config.model = argv.model;
        
        // Get API key
        const apiKey = await apiKeyManager.getApiKey('openai');
        if (!apiKey) {
          console.error('No API key found. Please add an API key first.');
          process.exit(1);
        }
        config.apiKey = apiKey;
        
        console.log(`\nSending test prompt to ${config.model}...\n`);
        
        // Call the API with debug output
        const result = await callOpenAI(argv.system, argv.user);
        
        console.log('\nAPI Response:', result);
        process.exit(0);
      } catch (error) {
        console.error('Error:', error);
        process.exit(1);
      }
    })
    .command('list-logs', 'List all prompt debug logs', () => {}, () => {
      try {
        const fs = require('fs');
        const path = require('path');
        
        const logsDir = path.join(__dirname, 'prompt_logs');
        if (!fs.existsSync(logsDir)) {
          console.log('No logs found.');
          process.exit(0);
        }
        
        const files = fs.readdirSync(logsDir);
        if (files.length === 0) {
          console.log('No logs found.');
          process.exit(0);
        }
        
        console.log(`Found ${files.length} log files:`);
        files.forEach((file, index) => {
          const stats = fs.statSync(path.join(logsDir, file));
          const date = new Date(stats.mtime);
          console.log(`${index + 1}. ${file} (${date.toLocaleString()})`);
        });
        
        process.exit(0);
      } catch (error) {
        console.error('Error listing logs:', error);
        process.exit(1);
      }
    })
    .command('view-log <filename>', 'View a specific log file', (yargs) => {
      return yargs
        .positional('filename', {
          describe: 'Log filename to view',
          type: 'string'
        });
    }, (argv) => {
      try {
        const fs = require('fs');
        const path = require('path');
        
        const logsDir = path.join(__dirname, 'prompt_logs');
        const filePath = path.join(logsDir, argv.filename);
        
        if (!fs.existsSync(filePath)) {
          console.error(`Log file not found: ${argv.filename}`);
          process.exit(1);
        }
        
        const content = fs.readFileSync(filePath, 'utf8');
        console.log(content);
        
        process.exit(0);
      } catch (error) {
        console.error('Error viewing log:', error);
        process.exit(1);
      }
    })
    .demandCommand(1, 'You need at least one command before moving on')
    .help()
    .parse();
}

// Discord notification function removed - no longer needed
// Only image generation will communicate with Discord
/*
async function sendDiscordNotification(type, data) {
  try {
    if (!config.enableDiscord) {
      return { success: false, message: 'Discord integration disabled' };
    }
    
    // Check if we have the global Discord function available
    if (typeof global.sendDiscordMessage !== 'function') {
      console.warn('Discord messaging function not available');
      return { success: false, message: 'Discord messaging not available' };
    }
    
    let message = '';
    
    switch (type) {
      case 'recipe_generated':
        message = `🍽️ **New Recipe Generated!**\n` +
                 `📝 **Title:** ${data.title || data.recipeIdea}\n` +
                 `🏷️ **Category:** ${data.category || 'Not specified'}\n` +
                 `⏰ **Generated:** ${new Date().toLocaleString()}`;
        break;
        
      case 'pinterest_generated':
        message = `📌 **Pinterest Content Generated!**\n` +
                 `📝 **Recipe:** ${data.recipeIdea}\n` +
                 `🔢 **Variations:** ${data.variations ? data.variations.length : 'N/A'}\n` +
                 `⏰ **Generated:** ${new Date().toLocaleString()}`;
        break;
        
      case 'blog_generated':
        message = `📄 **Blog Post Generated!**\n` +
                 `📝 **Title:** ${data.metaTitle || data.title}\n` +
                 `📊 **Recipe:** ${data.recipeIdea}\n` +
                 `⏰ **Generated:** ${new Date().toLocaleString()}`;
        break;
        
      case 'wordpress_published':
        message = `🚀 **WordPress Post Published!**\n` +
                 `📝 **Title:** ${data.title}\n` +
                 `🔗 **URL:** ${data.url}\n` +
                 `📊 **Status:** ${data.status}\n` +
                 `⏰ **Published:** ${new Date().toLocaleString()}`;
        break;
        
      default:
        message = `ℹ️ **RecipeGen AI Notification**\n${JSON.stringify(data, null, 2)}`;
    }
    
    return await global.sendDiscordMessage(message);
  } catch (error) {
    console.error('Error sending Discord notification:', error);
    return { success: false, message: error.message };
  }
}
*/

// Add this test at the end of app.js to verify replaceVars is working:

// TEST: Debug replaceVars function
function testReplaceVars() {
  console.log('=== TESTING replaceVars FUNCTION ===');
  
  const testTemplate = 'Recipe: {{recipeIdea}}, User Recipe: {{userProvidedRecipe}}, Language: {{language}}';
  const testVars = {
    recipeIdea: 'Test Recipe',
    userProvidedRecipe: 'Test user recipe content',
    language: 'English'
  };
  
  const result = replaceVars(testTemplate, testVars);
  
  console.log('Template:', testTemplate);
  console.log('Variables:', testVars);
  console.log('Result:', result);
  console.log('Contains {{userProvidedRecipe}}:', result.includes('{{userProvidedRecipe}}'));
  console.log('=== END TEST ===');
}

// Uncomment this line to test:
// testReplaceVars();

module.exports = {
  main,
  generatePinterestContent,
  generateBlogPost,
  generateFacebookContent,
  updateConfig,
  clearSharedState
};