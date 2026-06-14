const fs = require('fs');
const path = require('path');

const baseUrl = (process.env.BAREFOOT_BASE_URL || 'https://barefoot-gifting-7q29.vercel.app').replace(/\/$/, '');
const adminEmail = process.env.ADMIN_EMAIL || 'admin@barefootgifting.com';
const adminPassword = process.env.ADMIN_PASSWORD || 'Barefoot2026!';

function readCatalog() {
  const filePath = path.join(__dirname, '..', 'data', 'real-little-luxes.json');
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

async function request(pathname, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, options);
  let payload = null;

  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const message = payload && payload.error ? payload.error : `${response.status} ${response.statusText}`;
    throw new Error(`${pathname}: ${message}`);
  }

  return payload;
}

async function login() {
  const result = await request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: adminEmail,
      password: adminPassword,
    }),
  });

  return result.token;
}

async function getProducts(token) {
  return request('/api/products/__root__', {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

async function upsertProduct(token, product, existingProduct) {
  const payload = {
    slug: product.slug,
    name: product.name,
    category: product.category,
    price: product.price,
    description: product.description,
    stock: product.stock,
    customizable: !!product.customizable,
    badge: product.badge || null,
    status: product.status || 'published',
    images: product.images,
  };

  const pathname = existingProduct ? `/api/products/${existingProduct.id}` : '/api/products';
  const method = existingProduct ? 'PUT' : 'POST';

  return request(pathname, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
}

async function main() {
  const catalog = readCatalog();
  const token = await login();
  const existingProducts = await getProducts(token);
  const existingBySlug = new Map(existingProducts.map((product) => [product.slug, product]));

  for (const product of catalog) {
    const existingProduct = existingBySlug.get(product.slug);
    const saved = await upsertProduct(token, product, existingProduct);
    console.log(`${existingProduct ? 'updated' : 'created'} ${saved.slug}`);
  }
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exit(1);
});
