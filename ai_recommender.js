import dotenv from 'dotenv';
import Groq from 'groq-sdk';
import axios from 'axios';
import readline from 'readline';

dotenv.config();

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const rawDomain = (process.env.SHOPIFY_STORE_DOMAIN || process.env.SHOPIFY_STORE_URL || '').trim();
const SHOPIFY_DOMAIN = rawDomain.replace(/^https?:\/\//, '').replace(/\/+$/, '');
const SHOPIFY_API_VERSION = '2024-10';
if (!SHOPIFY_DOMAIN) throw new Error('Missing SHOPIFY_STORE_DOMAIN or SHOPIFY_STORE_URL in .env (e.g., myshop.myshopify.com)');
if (!process.env.SHOPIFY_ACCESS_TOKEN) throw new Error('Missing SHOPIFY_ACCESS_TOKEN');

const SHOPIFY_URL = `https://${SHOPIFY_DOMAIN}/admin/api/${SHOPIFY_API_VERSION}/products.json`;
const SHOPIFY_HEADERS = { 'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN };

// Simple fuzzy match function (Levenshtein distance for accuracy)
function fuzzyMatch(str1, str2) {
  str1 = str1.toLowerCase();
  str2 = str2.toLowerCase();
  const matrix = Array.from({ length: str1.length + 1 }, () => Array(str2.length + 1).fill(0));
  for (let i = 0; i <= str1.length; i++) matrix[i][0] = i;
  for (let j = 0; j <= str2.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= str1.length; i++) {
    for (let j = 1; j <= str2.length; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,     // deletion
        matrix[i][j - 1] + 1,     // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );
    }
  }
  return 1 - matrix[str1.length][str2.length] / Math.max(str1.length, str2.length); // Similarity score (1 = perfect match)
}

// Fetch all products from Shopify
async function getProductsFromShopify() {
    try {
      const res = await axios.get(SHOPIFY_URL, {
        headers: SHOPIFY_HEADERS,
        params: { limit: 50, fields: 'id,title,product_type,tags,body_html' },
      });
      return res.data.products || [];
    } catch (err) {
      console.error('Fetch products error:', err?.response?.status, err?.response?.data || err.message);
      console.log('Debug URL:', SHOPIFY_URL);
      return [];
    }
  }

// Understand user intent using Groq AI (extract keywords, category, gender for accuracy)
async function understandUserIntent(userInput) {
  const response = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [
      {
        role: "system",
        content: "You are a precise product recommender. For the user query, extract: 1. Keywords (comma-separated), 2. Category (e.g., bottoms, shirts), 3. Gender (men, women, all). Return in JSON format: {keywords: 'key1,key2', category: 'bottoms', gender: 'men'}."
      },
      { role: "user", content: userInput }
    ],
    temperature: 0.3, // Lower for accuracy
  });
  try {
    return JSON.parse(response.choices[0].message.content);
  } catch {
    console.error('Invalid AI response');
    return { keywords: '', category: 'all', gender: 'all' };
  }
}

// Recommend products (my custom logic for high accuracy: fuzzy matching + scoring)
async function recommendProducts(userQuery, products) {
  const intent = await understandUserIntent(userQuery);
  const keywords = intent.keywords.toLowerCase().split(',').map(k => k.trim()).filter(k => k);
  const category = intent.category.toLowerCase();
  const gender = intent.gender.toLowerCase();
  
  // Step 1: Filter by category and gender with fuzzy tolerance
  let filteredProducts = products.filter(product => {
    const productType = product.product_type?.toLowerCase() || '';
    const title = product.title?.toLowerCase() || '';
    const tags = product.tags?.toLowerCase() || '';
    
    // Category filter (fuzzy match > 0.8 accuracy)
    const categoryMatch = fuzzyMatch(category, productType) > 0.8 || keywords.some(kw => fuzzyMatch(kw, productType) > 0.8);
    if (!categoryMatch && category !== 'all') return false;
    
    // Gender filter (exclude opposite, include matching or neutral)
    const hasMen = ['men', 'man'].some(g => tags.includes(g) || title.includes(g) || productType.includes(g));
    const hasWomen = ['women', 'woman'].some(g => tags.includes(g) || title.includes(g) || productType.includes(g));
    
    if (gender === 'men') {
      if (hasWomen) return false; // Exclude women's
      return hasMen || true; // Include men's or neutral
    } else if (gender === 'women') {
      if (hasMen) return false; // Exclude men's
      return hasWomen || true; // Include women's or neutral
    }
    
    return true;
  });
  
  // Step 2: Score each product (tag overlap + fuzzy title match for accuracy)
  const scoredProducts = filteredProducts.map(product => {
    const title = product.title?.toLowerCase() || '';
    const tags = product.tags?.toLowerCase().split(',').map(t => t.trim()) || [];
    
    let score = 0;
    keywords.forEach(kw => {
      if (tags.includes(kw)) score += 2; // Exact tag match (high weight)
      else if (tags.some(t => fuzzyMatch(kw, t) > 0.8)) score += 1.5; // Fuzzy tag match
      if (fuzzyMatch(kw, title) > 0.8) score += 1; // Fuzzy title match
    });
    
    return { ...product, score: score / keywords.length || 0 };
  }).filter(p => p.score > 0); // Exclude zero-score
  
  // Step 3: Sort by score (desc) and take top 5
  return scoredProducts.sort((a, b) => b.score - a.score).slice(0, 5);
}

// Main function with user input
async function main() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.question('Enter your product query: ', async (query) => {
    const products = await getProductsFromShopify();
    const recommendations = await recommendProducts(query, products);
    
    if (recommendations.length === 0) {
      console.log('No matching products found.');
    } else {
      console.log('Recommended Products (up to 5):');
      recommendations.forEach((p, i) => {
        console.log(`${i + 1}. ${p.title} (ID: ${p.id}) - Type: ${p.product_type || 'N/A'} - Score: ${p.score.toFixed(2)}`);
      });
    }
    rl.close();
  });
}

main();