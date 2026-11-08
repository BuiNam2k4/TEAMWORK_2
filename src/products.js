export const PRODUCT_COLUMNS =
  'id, name, brand, price, image_url, description, sizes, colors, created_at';

const MAX_PRICE = 1_000_000_000_000;

export function parseList(value) {
  return String(value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

// shortcut: sizes/colors lưu dạng ",40,41," để lọc bằng LIKE; đổi sang bảng riêng nếu cần tồn kho theo size.
function normalizeList(value, { maxItems, maxLength, label }) {
  if (value == null || value === '') return { value: '' };

  const raw = Array.isArray(value) ? value : String(value).split(',');
  const items = [];
  for (const entry of raw) {
    const item = String(entry).trim();
    if (!item) continue;
    if (item.length > maxLength) return { error: `${label} item is too long` };
    if (!items.includes(item)) items.push(item);
  }
  if (items.length > maxItems) return { error: `${label} has too many items` };
  return { value: items.length ? `,${items.join(',')},` : '' };
}

export function serializeProduct(row) {
  return { ...row, sizes: parseList(row.sizes), colors: parseList(row.colors) };
}

export function parseProduct(body) {
  const errors = [];

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name || name.length > 120) errors.push('name is required (1-120 chars)');

  const brand = typeof body.brand === 'string' ? body.brand.trim() : '';
  if (!brand || brand.length > 80) errors.push('brand is required (1-80 chars)');

  let price = Number.NaN;
  if (typeof body.price === 'number') {
    price = body.price;
  } else if (typeof body.price === 'string' && /^\d+$/.test(body.price.trim())) {
    price = Number(body.price.trim());
  }
  if (!Number.isInteger(price) || price < 0 || price > MAX_PRICE) {
    errors.push(`price must be an integer between 0 and ${MAX_PRICE}`);
  }

  const imageUrl = body.image_url == null || body.image_url === ''
    ? null
    : String(body.image_url).trim();
  if (imageUrl && !/^(https?:\/\/\S+|\/[^/\s][^\s]*)$/i.test(imageUrl)) {
    errors.push('image_url must be an http(s) URL or a path starting with /');
  }

  const description = body.description == null || body.description === ''
    ? null
    : String(body.description).trim();
  if (description && description.length > 2000) {
    errors.push('description must be at most 2000 chars');
  }

  const sizes = normalizeList(body.sizes, { maxItems: 20, maxLength: 10, label: 'sizes' });
  if (sizes.error) errors.push(sizes.error);
  const colors = normalizeList(body.colors, { maxItems: 20, maxLength: 30, label: 'colors' });
  if (colors.error) errors.push(colors.error);

  return {
    errors,
    value: {
      name,
      brand,
      price,
      imageUrl,
      description,
      sizes: sizes.value ?? '',
      colors: colors.value ?? '',
    },
  };
}
