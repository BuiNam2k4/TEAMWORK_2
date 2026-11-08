const listEl = document.getElementById('products');
const countEl = document.getElementById('count');
const healthEl = document.getElementById('health');
const form = document.getElementById('product-form');
const formMsg = document.getElementById('form-msg');
const searchEl = document.getElementById('search');

const vnd = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' });

async function loadProducts() {
  const url = new URL('/api/products', location.origin);
  const q = searchEl.value.trim();
  if (q) url.searchParams.set('q', q);

  const res = await fetch(url);
  if (!res.ok) {
    listEl.innerHTML = '<p class="empty">Không tải được danh sách sản phẩm.</p>';
    return;
  }
  const { data } = await res.json();
  render(data);
}

function render(items) {
  countEl.textContent = String(items.length);
  if (!items.length) {
    listEl.innerHTML = '<p class="empty">Chưa có sản phẩm nào. Hãy thêm chiếc giày đầu tiên.</p>';
    return;
  }
  listEl.innerHTML = items.map((p) => {
    const image = safeImage(p.image_url);
    return `
      <article class="product">
        ${image
          ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(p.name)}" loading="lazy">`
          : '<div class="thumb" aria-hidden="true"></div>'}
        <div class="product-body">
          <span class="brand">${escapeHtml(p.brand)}</span>
          <h3>${escapeHtml(p.name)}</h3>
          <p class="price">${vnd.format(p.price)}</p>
          ${p.description ? `<p class="desc">${escapeHtml(p.description)}</p>` : ''}
        </div>
        <button class="delete" data-id="${Number(p.id)}" title="Xóa">Xóa</button>
      </article>`;
  }).join('');
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function safeImage(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? value : null;
  } catch {
    return null;
  }
}

async function checkHealth() {
  try {
    const res = await fetch('/health/ready');
    healthEl.textContent = res.ok ? 'Database: OK' : 'Database: DOWN';
    healthEl.classList.toggle('down', !res.ok);
  } catch {
    healthEl.textContent = 'Database: DOWN';
    healthEl.classList.add('down');
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  formMsg.textContent = '';
  formMsg.className = 'msg';

  const payload = Object.fromEntries(new FormData(form).entries());
  payload.price = Number(payload.price);
  for (const key of ['image_url', 'description']) {
    if (!payload[key]) delete payload[key];
  }

  const res = await fetch('/api/products', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));

  if (!res.ok) {
    formMsg.textContent = body.details?.join(' • ') ?? body.error ?? 'Tạo sản phẩm thất bại';
    formMsg.classList.add('error');
    return;
  }

  form.reset();
  formMsg.textContent = 'Đã tạo sản phẩm.';
  formMsg.classList.add('ok');
  await loadProducts();
});

listEl.addEventListener('click', async (event) => {
  const button = event.target.closest('button.delete');
  if (!button) return;
  if (!confirm('Xóa sản phẩm này?')) return;

  const res = await fetch(`/api/products/${button.dataset.id}`, { method: 'DELETE' });
  if (res.ok) await loadProducts();
});

let searchTimer;
searchEl.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(loadProducts, 200);
});

loadProducts();
checkHealth();
setInterval(checkHealth, 15000);
