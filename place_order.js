

import 'dotenv/config';
import axios from 'axios';
import readline from 'readline';
//import { generateProductEmbeddings, recommendProducts } from './product_recommender.js';
import { understandUserIntent, generateProductEmbeddings, recommendProducts } from './product_recommender.js';

//const products = await getProductsFromShopify(); // your function
//const embeddedProducts = await generateProductEmbeddings(products);


//const recommendations = await recommendProducts(userMessage, embeddedProducts);



const shopifyAPI = axios.create({
  baseURL: `https://${process.env.SHOPIFY_STORE_URL}/admin/api/${process.env.SHOPIFY_API_VERSION}`,
  headers: {
    'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN,
    'Content-Type': 'application/json',
  },
});

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const ask = (question) => new Promise(resolve => rl.question(question, resolve));
// Product type categories
const PRODUCT_TYPES = {
  CLOTHING: ['clothing', 't-shirt', 'shirt', 'dress', 'pants', 'jacket', 'top', 'bottom'],
  SHOE: ['shoes', 'footwear', 'sneakers', 'boots', 'sandals'],
  PERFUME: ['perfume', 'fragrance', 'cologne', 'scent']
};

function getProductCategory(productType) {
  const type = productType.toLowerCase();
  if (PRODUCT_TYPES.CLOTHING.some(t => type.includes(t))) return 'CLOTHING';
  if (PRODUCT_TYPES.SHOE.some(t => type.includes(t))) return 'SHOE';
  if (PRODUCT_TYPES.PERFUME.some(t => type.includes(t))) return 'PERFUME';
  return 'OTHER';
}

// Validate email address
function validateEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

function validateQuantity(quantity) {
  const num = parseInt(quantity);
  return !isNaN(num) && num > 0;
}
// stock validation fun 
function validateQuantityWithStock(quantity, variant) {
  const num = parseInt(quantity);
  if (isNaN(num) || num <= 0) return false;
  
  const availableStock = variant.inventory_quantity || 0;
  if (variant.inventory_management === 'shopify' && num > availableStock) {
    return false;
  }
  return true;
}
function validateVariantOption(product, optionValue) {
  return product.variants.some(v => 
    v.option1 === optionValue || 
    v.option2 === optionValue || 
    v.option3 === optionValue
  );
}

async function askWithValidation(question, validationFn, errorMsg) {
  while (true) {
    const answer = await ask(question);
    if (validationFn(answer)) return answer;
    console.log(`❌ ${errorMsg}`);
  }
}

// Find matching variant
function findMatchingVariant(product, size = null, color = null) {
  return product.variants.find(v => {
    if (size && color) {
      return (v.option1 === size || v.option2 === size || v.option3 === size) &&
             (v.option1 === color || v.option2 === color || v.option3 === color);
    } else if (size) {
      return v.option1 === size || v.option2 === size || v.option3 === size;
    } else if (color) {
      return v.option1 === color || v.option2 === color || v.option3 === color;
    }
    return false;
  }) || product.variants[0];
}
// ADD THESE TWO NEW FUNCTIONS HERE (after line 84, before line 86)
function getAvailableOptions(product) {
  const sizes = new Set();
  const colors = new Set();
  
  product.variants.forEach(variant => {
    if (variant.option1) sizes.add(variant.option1);
    if (variant.option2) colors.add(variant.option2);
    if (variant.option3) colors.add(variant.option3);
  });
  
  return {
    sizes: Array.from(sizes),
    colors: Array.from(colors)
  };
}

function getTotalStock(product) {
  return product.variants.reduce((total, variant) => {
    return total + (variant.inventory_quantity || 0);
  }, 0);
}



// Get product recommendations based on search query
async function getProductRecommendations(query) {
  try {
    // Step 1: AI understands user intent
    const understoodQuery = await understandUserIntent(query);
    console.log(`🧠 Interpreted as: "${understoodQuery}"`);

    // Step 2: Fetch Shopify products
    const response = await shopifyAPI.get('/products.json');
    const products = response.data.products;

    // Step 3: Generate embeddings once per product (for small dataset)
    const embeddedProducts = await generateProductEmbeddings(products);

    // Step 4: Recommend products based on similarity
    const recommendations = await recommendProducts(understoodQuery, embeddedProducts);

    return recommendations;
  } catch (error) {
    console.error('❌ Error in AI recommendation:', error.message);
    return [];
  }
}

    
// Function to get product category
async function placeOrder() {
  try {
    // Product recommendation feature with retry loop
let recommendations = [];
while (recommendations.length === 0) {
  const query = await ask('What product are you looking for? ');
  recommendations = await getProductRecommendations(query);

  if (recommendations.length > 0) {
    console.log('\n🛒 Recommended Products:');
    recommendations.forEach((p, i) => {
      console.log(`${i + 1}. ${p.title} (ID: ${p.id}) - Type: ${p.product_type}`);
    });
  } else {
    console.log('No recommendations found. Please try another keyword.');
    // Loop continues to ask for new search term
  }
}

    /* Get and validate Product ID (commented out for now)
     const productId = await askWithValidation(
       'Enter Product ID: ',
       (id) => id.trim().length > 0,
       'Product ID cannot be empty'
     );*/
    
    // For now, use the first recommendation or ask for manual input
let productId;
if (recommendations.length > 0) {
  const choice = await ask('Enter the number of the product you want: ');
  const choiceNum = parseInt(choice);
  if (!isNaN(choiceNum) && choiceNum > 0 && choiceNum <= recommendations.length) {
    productId = recommendations[choiceNum - 1].id;
  } else {
    console.log('❌ Invalid selection. Please try again.');
    rl.close();
    return;
  }

  
} else {
  console.log('❌ No products found. Please try a different search term.');
  rl.close();
  return;
}
    
    console.log('\nFetching product...');
    const { data } = await shopifyAPI.get(`/products/${productId}.json`);
    const product = data.product;
    
    console.log(`\n📦 Product: ${product.title}`);
    console.log(`📂 Type: ${product.product_type || 'General'}`);
    
    const category = getProductCategory(product.product_type || '');
    console.log(`🏷️  Category: ${category}`);
    
    // Display available options
    const options = getAvailableOptions(product);
    if (options.sizes.length > 0) {
      console.log(`📏 Available Sizes: ${options.sizes.join(', ')}`);
    }
    if (options.colors.length > 0) {
      console.log(`🎨 Available Colors: ${options.colors.join(', ')}`);
    }
    
    // Display total stock
    const totalStock = getTotalStock(product);
    if (product.variants[0]?.inventory_management === 'shopify') {
      console.log(`📦 Total Available Stock: ${totalStock}`);
    }
    console.log('');
    
    let size = null, color = null, variant = null, quantity = null;

// Ask questions based on product category
if (category === 'CLOTHING' || category === 'SHOE') {
  size = await askWithValidation(
    'Enter Size (e.g., S, M, L, XL): ',
    (s) => validateVariantOption(product, s),
    'Invalid size. Please enter a valid size for this product.'
  );
  
  color = await askWithValidation(
    'Enter Color: ',
    (c) => validateVariantOption(product, c),
    'Invalid color. Please enter a valid color for this product.'
  );
  
  // Find variant FIRST (after getting size/color)
  variant = findMatchingVariant(product, size, color);
} else {
  // For perfume and other products, use first variant
  variant = product.variants[0];
}

// Show selected variant and stock
console.log(`\n✅ Selected: ${variant.title || 'Default'} - $${variant.price}`);
if (variant.inventory_management === 'shopify') {
  console.log(`📦 Available Stock: ${variant.inventory_quantity || 0}`);
}

// NOW ask for quantity with stock validation
quantity = await askWithValidation(
  'Enter Quantity: ',
  (q) => {
    if (!validateQuantity(q)) return false;
    return validateQuantityWithStock(q, variant);
  },
  variant.inventory_management === 'shopify' 
    ? `Invalid quantity. Must be between 1 and ${variant.inventory_quantity || 0}.`
    : 'Quantity must be a positive number.'
);
// Get customer name
const firstName = await ask('Enter First Name: ');
const lastName = await ask('Enter Last Name: ');

// Get email
const email = await askWithValidation(
  'Enter Email Address: ',
  validateEmail,
  'Invalid email format. Please enter a valid email address.'
);

// Get shipping address
const address1 = await ask('Enter Street Address: ');
const city = await ask('Enter City: ');
const province = await ask('Enter State/Province (e.g., NY, CA): ');
const country = await ask('Enter Country: ');
const zip = await ask('Enter ZIP/Postal Code: ');

console.log(`\n📊 Quantity: ${quantity}`);

console.log(`\n📊 Quantity: ${quantity}`);
console.log('\nPlacing order...');
    
    const orderData = {
      line_items: [{
        variant_id: variant.id,
        quantity: parseInt(quantity)
      }],
      customer: {
        first_name: firstName,
        last_name: lastName,
        email: email
      },
      billing_address: {
        first_name: firstName,
        last_name: lastName,
        address1: address1,
        city: city,
        province: province,
        country: country,
        zip: zip
      },
      send_receipt: true,
      send_fulfillment_receipt: true,
      financial_status: 'pending'
    };
    
    const response = await shopifyAPI.post('/orders.json', { order: orderData });
    
    console.log('\nOrder placed successfully!');
    console.log('Customer:', `${firstName} ${lastName}`);
    console.log('Email:', email);
    console.log('Order ID:', response.data.order.id);
    console.log('Order Number:', response.data.order.order_number);
    console.log('Total: Rs' + response.data.order.total_price);
    console.log(`📧 Order confirmation sent to: ${email}`);
    
  } catch (error) {
    console.error('\n❌ Error:', error.response?.data?.errors || error.message);
  } finally {
    rl.close();
  }
}
// Place order
placeOrder();