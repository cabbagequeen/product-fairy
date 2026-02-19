/**
 * Shopify CSV export utility.
 * Generates a CSV matching Shopify's product import template.
 */

/** Escape a value for CSV per RFC 4180. */
export function csvEscape(value) {
  const str = String(value ?? '');
  if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/** All 55 Shopify product import columns in exact order. */
const SHOPIFY_COLUMNS = [
  'Title',
  'URL handle',
  'Description',
  'Vendor',
  'Product category',
  'Type',
  'Tags',
  'Published on online store',
  'Status',
  'SKU',
  'Barcode',
  'Option1 name',
  'Option1 value',
  'Option1 Linked To',
  'Option2 name',
  'Option2 value',
  'Option2 Linked To',
  'Option3 name',
  'Option3 value',
  'Option3 Linked To',
  'Price',
  'Compare-at price',
  'Cost per item',
  'Charge tax',
  'Tax code',
  'Unit price total measure',
  'Unit price total measure unit',
  'Unit price base measure',
  'Unit price base measure unit',
  'Inventory tracker',
  'Inventory quantity',
  'Continue selling when out of stock',
  'Weight value (grams)',
  'Weight unit for display',
  'Requires shipping',
  'Fulfillment service',
  'Product image URL',
  'Image position',
  'Image alt text',
  'Variant image URL',
  'Gift card',
  'SEO title',
  'SEO description',
  'Color (product.metafields.shopify.color-pattern)',
  'Google Shopping / Google product category',
  'Google Shopping / Gender',
  'Google Shopping / Age group',
  'Google Shopping / Manufacturer part number (MPN)',
  'Google Shopping / Ad group name',
  'Google Shopping / Ads labels',
  'Google Shopping / Condition',
  'Google Shopping / Custom product',
  'Google Shopping / Custom label 0',
  'Google Shopping / Custom label 1',
  'Google Shopping / Custom label 2',
  'Google Shopping / Custom label 3',
  'Google Shopping / Custom label 4',
];

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Default inventory quantity if not specified per-product. */
const DEFAULT_INVENTORY = 10;

/** Group products by ProductNumber into { [key]: variant[] } preserving order. */
function groupByProductNumber(products) {
  const groups = new Map();
  for (const p of products) {
    const key = p.ProductNumber;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(p);
  }
  return groups;
}

function mapGender(code) {
  if (code === 'M') return 'Male';
  if (code === 'W') return 'Female';
  return 'Unisex';
}

/**
 * Build an HTML product description for the Shopify Description column.
 * Uses the product's Description field if available, otherwise generates
 * a basic description from the product name and brand.
 */
function buildDescriptionHtml(variant, allVariants, brand) {
  const desc = variant.Description || '';
  const name = variant.ProductName || 'Product';
  const colors = allVariants.map(v => v.ColorName).filter(Boolean);

  if (desc) {
    // Wrap existing plain-text description in HTML
    const paragraphs = desc.split(/\n+/).filter(Boolean);
    let html = paragraphs.map(p => `<p>${p}</p>`).join('');
    if (colors.length > 1) {
      html += `<p>Available in ${colors.join(', ')}.</p>`;
    }
    return html;
  }

  // Generate a basic description from available data
  const vendor = brand?.name ? ` by ${brand.name}` : '';
  let html = `<p>${name}${vendor}.</p>`;
  if (colors.length > 0) {
    html += `<p>Available in ${colors.join(', ')}.</p>`;
  }
  return html;
}

/**
 * Build one row object keyed by Shopify column name.
 * Product-level fields only filled on the first variant of each group.
 */
function buildRow(variant, brand, isProductRow, allVariants) {
  const row = {};

  if (isProductRow) {
    row['Title'] = variant.ProductName;
    row['URL handle'] = slugify(variant.ProductName);
    row['Description'] = buildDescriptionHtml(variant, allVariants, brand);
    row['Vendor'] = brand?.name || '';
    row['Published on online store'] = 'TRUE';
    row['Status'] = 'active';
    row['Type'] = variant.ProductType || '';
    row['Option1 name'] = 'Color';
    row['Image position'] = '1';
    row['Image alt text'] = `${variant.ProductName} - ${variant.ColorName}`;
    row['Google Shopping / Gender'] = mapGender(variant.GenderCode);
    row['Google Shopping / Age group'] = 'Adult';
  }

  // Variant-level fields (every row)
  row['SKU'] = `${variant.ProductNumber}-${variant.ColorCode || 'DEF'}`;
  row['Option1 value'] = variant.ColorName || '';
  row['Price'] = variant.Price || '';
  row['Charge tax'] = 'TRUE';
  row['Inventory tracker'] = 'shopify';
  row['Inventory quantity'] = String(variant.Inventory || DEFAULT_INVENTORY);
  row['Continue selling when out of stock'] = 'DENY';
  row['Requires shipping'] = 'TRUE';
  row['Fulfillment service'] = 'manual';
  row['Gift card'] = 'FALSE';

  return row;
}

/**
 * Generate a Shopify-compatible product import CSV string.
 *
 * @param {Array} products - generatedProducts array
 * @param {Object} brand - generatedBrand object
 * @returns {string} CSV content ready for download
 */
export function generateShopifyCsv(products, brand) {
  const groups = groupByProductNumber(products);
  const rows = [];

  for (const [, variants] of groups) {
    variants.forEach((variant, i) => {
      rows.push(buildRow(variant, brand, i === 0, variants));
    });
  }

  const header = SHOPIFY_COLUMNS.map(c => csvEscape(c)).join(',');
  const csvRows = rows.map(row =>
    SHOPIFY_COLUMNS.map(col => csvEscape(row[col] ?? '')).join(',')
  );

  return [header, ...csvRows].join('\n');
}
