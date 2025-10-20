// product_recommender.js
//import { pipeline } from '@xenova/transformers';
 import getEmbeddings from './embeddings.js';


import Groq from "groq-sdk";
import 'dotenv/config';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// Store context for ongoing chat
let chatHistory = [];

/*
 * Clean and understand user query — even with spelling mistakes.
 */
export async function understandUserIntent(userInput) {
  chatHistory.push({ role: "user", content: userInput });

  const response = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile", // lightweight open model
    messages: [
        {
            role: "system",
            content: `
            You are a product tag matcher. Convert user queries into tag keywords that match our store's actual tags.
            
            Our store has these specific tags:
            - Gender: Men, Women, Man, Woman
            - Product Types: Shoes, Shirt, T-Shirt, Blazer, Blazers, Jacket, Jackets & Coats, Sweatshirt, Sweatshirt & Hoodies, Dress, Blouse, Top, Bottom, Trouser, Cullots, Polo
            - Materials: Cotton, Denim, Fleece, Knit, Knitted Fabric, Lycra Jersy, Suede, Textured Cotton, Waffle Knit, Thermal, Ottoman, Panama, Seer Sucker, Dobby
            - Styles: Casual, Formal, Cross Fit, Lace Up
            - Seasons: Summer 25, Winter 24
            - Brands: Mishal Apparel, Adan Textile, MS APPAREL (BUTT), MWK Stitching, Tailored Aesthetics
            - Categories: Bags, New Arrival, Best Seller, Sale, Clearance
            - Collections: Drop-1, Drop-2 VOL 1, Drop-2 Vol-2, Perfect Duo, Perfect Duo's
            
            Guidelines:
            - Return ONLY tag keywords that exist in our store
            - Handle typos and variations
            - Be specific and relevant
            - Use exact tag names from our store
            
            Examples:
            "casual gents boots" → "Men Shoes"
            "summer tshirts" → "Men T-Shirt Cotton Summer 25"
            "winter jackets" → "Men Jacket Winter 24"
            "women sneakers" → "Women Shoes"
            "office blazers" → "Women Blazer"
            
            Return only the tag keywords, no explanations.`
        },
        ...chatHistory,
    ],
    temperature: 0.5,
  });

  const aiMessage = response.choices[0].message.content;
  chatHistory.push({ role: "assistant", content: aiMessage });
  
  // Debug logging
  console.log('🧠 AI Interpretation:', aiMessage);
  return aiMessage;
}
/**
 * Calculate tag overlap score between AI keywords and product tags
 */
function calculateTagScore(aiKeywords, productTags) {
    if (!productTags) return 0;
    
    const aiWords = aiKeywords.toLowerCase().split(' ').filter(word => word.length > 1);
    const productTagList = productTags.toLowerCase().split(',').map(tag => tag.trim());
    
    let matchCount = 0;
    let totalWeight = 0;
    
    // Weight different types of matches based on your actual tags
    const weights = {
      // Gender (highest weight)
      'men': 3, 'women': 3, 'man': 3, 'woman': 3,
      
      // Product Types (very high weight)
      'shoes': 6, 'shirt': 6, 't-shirt': 6, 'blazer': 6, 'blazers': 6, 
      'jacket': 6, 'jackets': 6, 'sweatshirt': 6, 'dress': 6, 'blouse': 6,
      'top': 6, 'bottom': 6, 'trouser': 6, 'cullots': 6, 'polo': 6,
      
      // Materials (high weight)
      'cotton': 3, 'denim': 3, 'fleece': 3, 'knit': 3, 'suede': 3,
      'textured cotton': 3, 'waffle knit': 3, 'thermal': 3,
      
      // Styles (medium weight)
      'casual': 2, 'formal': 2, 'cross fit': 2, 'lace up': 2,
      
      // Seasons (medium weight)
      'summer 25': 2, 'winter 24': 2, 'summer': 2, 'winter': 2,
      
      // Brands (low weight)
      'mishal apparel': 1, 'adan textile': 1, 'tailored aesthetics': 1,
      
      // Categories (low weight)
      'new arrival': 1, 'best seller': 1, 'sale': 1, 'clearance': 1
    };
    
    aiWords.forEach(aiWord => {
      productTagList.forEach(productTag => {
        // Exact match
        if (productTag === aiWord) {
          matchCount++;
          totalWeight += weights[aiWord] || 1;
        }
        // Partial match (contains)
        else if (productTag.includes(aiWord) || aiWord.includes(productTag)) {
          matchCount += 0.5;
          totalWeight += (weights[aiWord] || 1) * 0.5;
        }
      }); 
    });
   // Calculate final score
   const baseScore = matchCount / aiWords.length;
   const weightScore = totalWeight / aiWords.length;
   const finalScore = (baseScore + weightScore) / 2;
   return finalScore;
}
export function detectProductCategory(aiKeywords) {
  const keywords = aiKeywords.toLowerCase();
  
  // Detect gender first
  let gender = 'all';
  if (keywords.includes('men') || keywords.includes('man')) {
    gender = 'men';
  } else if (keywords.includes('women') || keywords.includes('woman')) {
    gender = 'women';
  }
  // Product type categories - using your actual store terms
  if (keywords.includes('shoes') || keywords.includes('sneakers') || keywords.includes('footwear')) {
    return { gender, category: 'shoes' };
  }
  if (keywords.includes('shirt') || keywords.includes('t-shirt') || keywords.includes('top')) {
    return { gender, category: 'shirts' };
  }
  if (keywords.includes('jacket') || keywords.includes('blazer') || keywords.includes('outerwear')) {
    return { gender, category: 'jackets' };
  }
  if (keywords.includes('pants') || keywords.includes('trouser') || keywords.includes('bottom') || 
      keywords.includes('cullots') || keywords.includes('cullot')) {
    return { gender, category: 'bottoms' }; // Changed from 'pants' to 'bottoms'
  }
  if (keywords.includes('dress') || keywords.includes('blouse')) {
    return { gender, category: 'dresses' };
  }
  if (keywords.includes('sweatshirt') || keywords.includes('hoodie')) {
    return { gender, category: 'sweatshirts' };
  }
  
  return { gender, category: 'all' }; // No specific category detected
}
  

function generateProductText(product) {
    const genderHints = ['men','man', 'women', 'woman', 'unisex', 'men\'s', 'women\'s', 'unisex\'s' ];
    let gender = '';
  
    // Infer gender from title or tags
    for (const hint of genderHints) {
      if (
        product.title.toLowerCase().includes(hint) ||
        (product.tags && product.tags.toLowerCase().includes(hint))
      ) {
        gender = hint;
        break;
      }
    }
  
    // Strip HTML from body_html and combine all fields
    const cleanDescription = product.body_html?.replace(/<[^>]+>/g, '') || '';
    
    return `
      ${product.title || ''}
      ${product.product_type || ''}
      ${gender}
      ${product.tags || ''}
      ${cleanDescription}
    `.toLowerCase().trim();
  }
  
  export async function generateProductEmbeddings(products) {
      // Generate rich product texts
      const productTexts = products.map(p => generateProductText(p));
      
      // Debug logging
     // console.log('📋 Sample enhanced product texts:');
     // productTexts.slice(0, 3).forEach((text, i) => {
       //   console.log(`${i+1}. ${text.substring(0, 100)}...`);
     // });
      
      const embeddings = await getEmbeddings(productTexts);
      
      return products.map((product, index) => ({
          ...product,
          embedding: embeddings[index]
      }));
  }


  export async function recommendProducts(userQuery, products) {
    try {
      // Step 1: Get AI interpretation as tag keywords
      const aiKeywords = await understandUserIntent(userQuery);
      console.log(`🧠 AI Tag Keywords: "${aiKeywords}"`);
            // Step 2: Detect category and gender from AI keywords
      const { gender, category } = detectProductCategory(aiKeywords);
      console.log(`🏷️ Target Category: ${category}`);
      console.log(`👤 Target Gender: ${gender}`);
      
      // Step 3: Filter products by category AND gender FIRST
            // Step 3: Filter products by category AND gender FIRST
            let filteredProducts = products;
      
            // Filter by category
            if (category !== 'all') {
              filteredProducts = filteredProducts.filter(product => {
                const productType = product.product_type?.toLowerCase() || '';
                const title = product.title?.toLowerCase() || '';
                const tags = product.tags?.toLowerCase() || '';
                
                // Check category match
                if (category === 'bottoms') {
                  return productType.includes('bottom') || 
                         title.includes('trouser') ||
                         title.includes('cullot') ||
                         tags.includes('bottom') ||
                         tags.includes('trouser');
                }
                // Add other categories...
                
                return false;
              });
            }
            console.log(`📦 After category filter: ${filteredProducts.length} products`);
filteredProducts.forEach(p => console.log(`- ${p.title} (Type: ${p.product_type}, Tags: ${p.tags})`));
            // Filter by gender (SEPARATE from category)
            // Filter by gender (SEPARATE from category)
            if (gender !== 'all') {
              filteredProducts = filteredProducts.filter(product => {
                const title = product.title?.toLowerCase() || '';
                const tags = product.tags?.toLowerCase() || '';
                const productType = product.product_type?.toLowerCase() || '';
                
                if (gender === 'men') {
                  // Explicitly exclude women's products
                  if (tags.includes('women') || tags.includes('woman') || 
                      title.includes('women') || title.includes('woman') || 
                      productType.includes('women') || productType.includes('woman')) {
                    return false;
                  }
                  
                  // Include only if it has men's markers
                  return tags.includes('men') || tags.includes('man') || 
                         title.includes('men') || title.includes('man') || 
                         productType.includes('men') || productType.includes('man');
                }
                if (gender === 'women') {
                  // Explicitly exclude men's products
                  if (tags.includes('men') || tags.includes('man') || 
                      title.includes('men') || title.includes('man') || 
                      productType.includes('men') || productType.includes('man')) {
                    return false;
                  }
                  
                  // Include only if it has women's markers
                  return tags.includes('women') || tags.includes('woman') || 
                         title.includes('women') || title.includes('woman') || 
                         productType.includes('women') || productType.includes('woman');
                }
                
                return false;
              });
            }
        
      
      console.log(`📦 Filtered to ${filteredProducts.length} products in category: ${category}`);
      
      // Step 4: Calculate tag scores for filtered products only
      const scoredProducts = filteredProducts.map(product => {
        const tagScore = calculateTagScore(aiKeywords, product.tags);
        return {
          ...product,
          tagScore: tagScore
        };
      });
      
      // Step 5: Sort by tag score (highest first)
      const recommendations = scoredProducts
        .sort((a, b) => b.tagScore - a.tagScore);
      
      // Debug logging
      console.log('🔍 Debug - Tag-based scores:');
      recommendations.forEach((rec, i) => {
        console.log(`${i+1}. ${rec.title} - Tag Score: ${rec.tagScore.toFixed(4)} - Tags: ${rec.tags}`);
      });
      
      // Filter out low scores
      const filteredRecommendations = recommendations.filter(rec => rec.tagScore > 0.1);
      
      if (filteredRecommendations.length === 0) {
        console.log('❌ No products found with matching tags. Try different keywords.');
        return [];
      }
      
      console.log(`✅ Found ${filteredRecommendations.length} products with matching tags`);
      return filteredRecommendations.slice(0, 5); // Return top 5
      
    } catch (error) {
      console.error('❌ Error in tag-based recommendation:', error.message);
      return [];
    }
}
