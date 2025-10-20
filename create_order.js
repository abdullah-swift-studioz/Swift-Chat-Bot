import 'dotenv/config';
const axios = require('axios');

const shopifyAPI = axios.create({
  baseURL: `https://${process.env.SHOPIFY_STORE_URL}/admin/api/${process.env.SHOPIFY_API_VERSION}`,
  headers: {
    'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN,
    'Content-Type': 'application/json',
  },
});

// Test product data
const testProduct = {
  product: {
    title: 'Test Product - Sample Item',
    body_html: '<strong>This is a test product!</strong> Created via Shopify API.',
    vendor: 'Test Vendor',
    product_type: 'Test Type',
    tags: ['test', 'api', 'sample'],
    status: 'draft', // Use 'draft' to avoid publishing immediately
    variants: [
      {
        option1: 'Default',
        price: '1599.00',
        sku: 'TEST-SKU-001',
        inventory_quantity: 100,
        inventory_management: 'shopify',
      },
    ],
    images: [
      {
        src: 'https://via.placeholder.com/500x500.png?text=Test+Product',
      },
    ],
  },
};

// Function to create a product
async function createProduct() {
  try {
    console.log('Creating test product in Shopify...');
    
    const response = await shopifyAPI.post('/products.json', testProduct);
    
    console.log('✅ Product created successfully!');
    console.log('Product ID:', response.data.product.id);
    console.log('Product Title:', response.data.product.title);
    console.log('Product Handle:', response.data.product.handle);
    console.log('Status:', response.data.product.status);
    console.log('\nFull product data:', JSON.stringify(response.data.product, null, 2));
    
    return response.data.product;
  } catch (error) {
    console.error('❌ Error creating product:');
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Error Details:', JSON.stringify(error.response.data, null, 2));
    } else {
      console.error(error.message);
    }
  }
}

// Run the function
createProduct();