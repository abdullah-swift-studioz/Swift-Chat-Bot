// tag_analyzer.js
import 'dotenv/config';
import axios from 'axios';

const shopifyAPI = axios.create({
  baseURL: `https://${process.env.SHOPIFY_STORE_URL}/admin/api/${process.env.SHOPIFY_API_VERSION}`,
  headers: {
    'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN,
    'Content-Type': 'application/json',
  },
});

/**
 * Get all unique tags from all products in the store
 */
export async function getAllStoreTags() {
  try {
    console.log('🔍 Fetching all products...');
    const response = await shopifyAPI.get('/products.json');
    const products = response.data.products;
    
    // Extract all tags
    const allTags = new Set();
    products.forEach(product => {
      if (product.tags) {
        const tags = product.tags.split(',').map(tag => tag.trim());
        tags.forEach(tag => allTags.add(tag));
      }
    });
    
    const uniqueTags = Array.from(allTags).sort();
    
    console.log(`📊 Found ${uniqueTags.length} unique tags across ${products.length} products`);
    console.log('\n🏷️ All Store Tags:');
    uniqueTags.forEach((tag, index) => {
      console.log(`${index + 1}. ${tag}`);
    });
    
    return uniqueTags;
    
  } catch (error) {
    console.error('❌ Error fetching store tags:', error.message);
    return [];
  }
}

/**
 * Get tags for a specific product by ID
 */
export async function getProductTags(productId) {
  try {
    console.log(`🔍 Fetching product ${productId}...`);
    const response = await shopifyAPI.get(`/products/${productId}.json`);
    const product = response.data.product;
    
    if (!product.tags) {
      console.log('❌ No tags found for this product');
      return [];
    }
    
    const tags = product.tags.split(',').map(tag => tag.trim());
    
    console.log(`📦 Product: ${product.title}`);
    console.log(`🏷️ Tags: ${tags.join(', ')}`);
    return tags;
    
  } catch (error) {
    console.error('❌ Error fetching product tags:', error.message);
    return [];
  }
}

/**
 * Analyze tag usage across the store
 */
export async function analyzeTagUsage() {
  try {
    const response = await shopifyAPI.get('/products.json');
    const products = response.data.products;
    
    const tagCount = {};
    
    products.forEach(product => {
      if (product.tags) {
        const tags = product.tags.split(',').map(tag => tag.trim());
        tags.forEach(tag => {
          tagCount[tag] = (tagCount[tag] || 0) + 1;
        });
      }
    });
    
    // Sort by usage count
    const sortedTags = Object.entries(tagCount)
      .sort(([,a], [,b]) => b - a)
      .map(([tag, count]) => ({ tag, count }));
    
    console.log('📊 Tag Usage Analysis:');
    sortedTags.forEach(({ tag, count }) => {
      console.log(`${tag}: ${count} products`);
    });
    
    return sortedTags;
    
  } catch (error) {
    console.error('❌ Error analyzing tags:', error.message);
    return [];
  }
}

/**
 * Print all store tags with detailed output
 */
export async function printAllStoreTags() {
  try {
    console.log('🔍 Fetching all products...');
    const response = await shopifyAPI.get('/products.json');
    const products = response.data.products;
    
    // Extract all tags
    const allTags = new Set();
    const tagDetails = [];
    
    products.forEach(product => {
      if (product.tags) {
        const tags = product.tags.split(',').map(tag => tag.trim());
        tags.forEach(tag => {
          allTags.add(tag);
          tagDetails.push({
            tag: tag,
            product: product.title,
            id: product.id
          });
        });
      }
    });
    
    const uniqueTags = Array.from(allTags).sort();
    
    console.log(`📊 Found ${uniqueTags.length} unique tags across ${products.length} products`);
    console.log('\n🏷️ All Store Tags:');
    uniqueTags.forEach((tag, index) => {
      console.log(`${index + 1}. ${tag}`);
    });
    
    console.log('\n📋 Tag Details (with products):');
    tagDetails.forEach((item, index) => {
      console.log(`${index + 1}. "${item.tag}" - Product: ${item.product} (ID: ${item.id})`);
    });
    
    return uniqueTags;
    
  } catch (error) {
    console.error('❌ Error fetching store tags:', error.message);
    return [];
  }
}

// CLI usage examples
if (process.argv[1].includes('tag_analyzer.js')) {
  const command = process.argv[2];
  const productId = process.argv[3];
  
  console.log('🚀 Tag Analyzer CLI');
  console.log('Command:', command || 'none');
  console.log('Product ID:', productId || 'none');
  console.log('');
  
  switch (command) {
    case 'all':
      console.log('📋 Getting all store tags...');
      getAllStoreTags();
      break;
    case 'print':
      console.log('📋 Printing detailed tag info...');
      printAllStoreTags();
      break;
    case 'product':
      if (!productId) {
        console.log('❌ Please provide product ID: node tag_analyzer.js product 123456');
        process.exit(1);
      }
      console.log('📋 Getting tags for product:', productId);
      getProductTags(productId);
      break;
    case 'analyze':
      console.log('📋 Analyzing tag usage...');
      analyzeTagUsage();
      break;
    default:
      console.log('❌ No command provided or invalid command');
      console.log('');
      console.log('Usage:');
      console.log('  node tag_analyzer.js all                    # Get all store tags');
      console.log('  node tag_analyzer.js print                  # Print detailed tag info');
      console.log('  node tag_analyzer.js product 123456        # Get tags for specific product');
      console.log('  node tag_analyzer.js analyze               # Analyze tag usage');
      console.log('');
      console.log('Examples:');
      console.log('  node tag_analyzer.js all');
      console.log('  node tag_analyzer.js product 7308220366919');
      break;
  }
}