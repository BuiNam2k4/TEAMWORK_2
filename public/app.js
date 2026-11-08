const app = document.getElementById('app');
const nav = document.getElementById('nav');
const toastEl = document.getElementById('toast');

const state = {
  me: null,
  cartCount: 0,
  editingProductId: null,
  products: [],
  filters: { q: '', brand: '', size: '', minPrice: '', maxPrice: '' },
};

let afterLogin = '#/';

const vnd = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' });
const money = (value) => vnd.format(Number(value) || 0);

const STATUS_LABELS = {
  pending: 'Chờ xác nhận',
  confirmed: 'Đã xác nhận',
  shipping: 'Đang giao',
  done: 'Hoàn tất',
  cancelled: 'Đã hủy',
};

async function api(path, { method = 'GET', body } = {}) {
  const options = { method, headers: {} };
  if (body !== undefined) {
    options.headers['content-type'] = 'application/json';
    options.body = JSON.stringify(body);
  }
  const res = await fetch(path, options);
  if (res.status === 204) return null;

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(data.details?.join(' • ') || data.error || `Lỗi HTTP ${res.status}`);
    error.status = res.status;
    throw error;
  }
  return data;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char]));
}

function safeImage(value) {
  if (!value) return null;
  if (/^\/[^/]/.test(value)) return value;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? value : null;
  } catch {
    return null;
  }
}

const FALLBACK_IMG = '/images/placeholder.svg';

function imageTag(src, alt, className = '') {
  return `<img class="${className}" src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" loading="lazy" onerror="this.onerror=null;this.src='${FALLBACK_IMG}'">`;
}

let toastTimer;
function toast(message, isError = false) {
  toastEl.textContent = message;
  toastEl.className = `toast show${isError ? ' error' : ''}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastEl.className = 'toast'; }, 2600);
}

function showError(error) {
  app.innerHTML = `<section class="card"><p class="empty">Lỗi: ${escapeHtml(error.message)}</p></section>`;
}

function renderNav() {
  const links = [['#/', 'Trang chủ']];
  if (state.me) links.push(['#/orders', 'Đơn hàng']);
  if (state.me?.role === 'admin') links.push(['#/admin', 'Quản trị']);

  nav.innerHTML = `
    <div class="nav-links">
      ${links.map(([href, label]) => `<a href="${href}">${escapeHtml(label)}</a>`).join('')}
      <a href="#/cart" class="cart-link">Giỏ hàng${state.cartCount ? `<span class="cart-badge">${state.cartCount}</span>` : ''}</a>
    </div>
    <div class="nav-user">
      ${state.me
        ? `<span class="who"><span class="avatar" aria-hidden="true">${escapeHtml(state.me.name.charAt(0).toUpperCase())}</span>${escapeHtml(state.me.name)}</span><button type="button" id="logout" class="link-btn">Đăng xuất</button>`
        : '<a href="#/login">Đăng nhập</a><a href="#/register" class="nav-cta">Đăng ký</a>'}
    </div>`;
}

async function refreshMe() {
  try {
    state.me = (await api('/api/auth/me')).data;
  } catch {
    state.me = null;
  }
}

async function refreshCart() {
  try {
    state.cartCount = (await api('/api/cart')).data.count;
  } catch {
    state.cartCount = 0;
  }
  renderNav();
}

async function router() {
  const parts = (location.hash.replace(/^#\/?/, '') || '').split('/').filter(Boolean);
  const route = parts[0] ?? '';

  try {
    if (!route) return await renderHome();
    if (route === 'product') return await renderProduct(parts[1]);
    if (route === 'cart') return await renderCart();
    if (route === 'checkout') return await renderCheckout();
    if (route === 'login') return renderLogin();
    if (route === 'register') return renderRegister();
    if (route === 'orders') return await renderOrders();
    if (route === 'admin') return await renderAdmin();

    app.innerHTML = '<section class="card"><p class="empty">Không tìm thấy trang.</p></section>';
  } catch (error) {
    if (error.status === 401) {
      afterLogin = location.hash || '#/';
      location.hash = '#/login';
      return;
    }
    showError(error);
  }
}

function productCard(product) {
  const image = safeImage(product.image_url) || FALLBACK_IMG;
  const sizes = product.sizes ?? [];
  const colors = product.colors ?? [];
  return `
    <article class="product">
      <a class="product-media" href="#/product/${product.id}" aria-label="${escapeHtml(product.name)}">
        ${imageTag(image, product.name, 'product-img')}
        <span class="product-tag">${escapeHtml(product.brand)}</span>
      </a>
      <div class="product-body">
        <div class="product-top">
          <h3><a href="#/product/${product.id}">${escapeHtml(product.name)}</a></h3>
        </div>
        <p class="price">${money(product.price)}</p>
        ${sizes.length ? `<div class="size-pills">${sizes.slice(0, 5).map((size) => `<span class="size-pill">${escapeHtml(size)}</span>`).join('')}${sizes.length > 5 ? '<span class="size-pill">…</span>' : ''}</div>` : ''}
        ${colors.length ? `<p class="meta">${colors.map(escapeHtml).join(' • ')}</p>` : ''}
      </div>
      <div class="product-actions">
        <a class="btn ghost" href="#/product/${product.id}">Xem chi tiết <span aria-hidden="true">→</span></a>
      </div>
    </article>`;
}

async function renderHome(page = 1) {
  const params = new URLSearchParams({ page: String(page), limit: '12' });
  for (const [key, value] of Object.entries(state.filters)) {
    if (value) params.set(key, value);
  }

  const { data, total, pages, page: current } = await api(`/api/products?${params}`);

  app.innerHTML = `
    <section class="hero">
      <div class="hero-copy">
        <span class="eyebrow">Bộ sưu tập mới 2026</span>
        <h1 class="hero-title">Bước đi mới,<br><em>phong cách mới.</em></h1>
        <p class="hero-sub">Giày cho mọi cung đường — chạy bộ, dạo phố hay đi làm. Chọn size, thêm vào giỏ và đặt hàng chỉ trong vài phút.</p>
        <div class="hero-actions">
          <button type="button" class="btn" id="hero-shop">Khám phá ngay</button>
          <a class="btn ghost" href="#/register">Tạo tài khoản</a>
        </div>
        <div class="hero-stats">
          <div class="stat"><strong>${total}</strong><span>sản phẩm</span></div>
          <div class="stat"><strong>${Math.max(pages, 1)}</strong><span>trang</span></div>
          <div class="stat"><strong>2</strong><span>cách thanh toán</span></div>
        </div>
      </div>
      <div class="hero-media">
        <img class="hero-img" src="/images/air-runner.svg" alt="Giày Air Runner">
        <div class="hero-badge"><span>New</span><small>bộ sưu tập</small></div>
      </div>
    </section>

    <section class="card shop" id="products">
      <div class="list-head">
        <div>
          <span class="eyebrow">Bộ sưu tập</span>
          <h2>Sản phẩm <span class="pill">${total}</span></h2>
        </div>
        <span class="meta">Trang ${current}${pages ? ` / ${pages}` : ''}</span>
      </div>
      <form id="filters" class="filters">
        <label class="field"><span>Tên giày</span><input name="q" placeholder="Ví dụ: Air Runner" value="${escapeHtml(state.filters.q)}"></label>
        <label class="field"><span>Hãng</span><input name="brand" placeholder="Nike, Adidas…" value="${escapeHtml(state.filters.brand)}"></label>
        <label class="field"><span>Size</span><input name="size" placeholder="40" value="${escapeHtml(state.filters.size)}"></label>
        <label class="field"><span>Giá từ</span><input name="minPrice" inputmode="numeric" placeholder="0" value="${escapeHtml(state.filters.minPrice)}"></label>
        <label class="field"><span>Giá đến</span><input name="maxPrice" inputmode="numeric" placeholder="5000000" value="${escapeHtml(state.filters.maxPrice)}"></label>
        <div class="filter-actions">
          <button type="submit" class="btn">Lọc</button>
          <button type="button" class="btn ghost" id="reset-filters">Xóa lọc</button>
        </div>
      </form>
      <div class="products">
        ${data.length ? data.map(productCard).join('') : '<p class="empty">Không có sản phẩm phù hợp.</p>'}
      </div>
      ${pages > 1 ? `
        <div class="pager">
          <button type="button" data-page="${current - 1}" ${current <= 1 ? 'disabled' : ''}>Trước</button>
          <span>Trang ${current} / ${pages}</span>
          <button type="button" data-page="${current + 1}" ${current >= pages ? 'disabled' : ''}>Sau</button>
        </div>` : ''}
    </section>`;

  document.getElementById('hero-shop')?.addEventListener('click', () => {
    document.getElementById('products')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  document.getElementById('filters').addEventListener('submit', (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    for (const key of Object.keys(state.filters)) {
      state.filters[key] = String(form.get(key) ?? '').trim();
    }
    renderHome(1).catch(showError);
  });

  document.getElementById('reset-filters')?.addEventListener('click', () => {
    for (const key of Object.keys(state.filters)) state.filters[key] = '';
    renderHome(1).catch(showError);
  });

  document.querySelectorAll('.pager button').forEach((button) => {
    button.addEventListener('click', () => {
      renderHome(Number(button.dataset.page)).catch(showError);
    });
  });
}

async function renderProduct(rawId) {
  const id = Number(rawId);
  if (!Number.isInteger(id) || id < 1) throw new Error('Sản phẩm không hợp lệ');

  const { data: product } = await api(`/api/products/${id}`);
  const image = safeImage(product.image_url) || FALLBACK_IMG;
  const sizes = product.sizes ?? [];
  const colors = product.colors ?? [];

  app.innerHTML = `
    <section class="detail">
      <a class="back" href="#/">← Danh sách sản phẩm</a>
      <div class="detail-grid">
        <div class="detail-media">
          ${imageTag(image, product.name, 'detail-img')}
          <span class="detail-brand">${escapeHtml(product.brand)}</span>
        </div>
        <div class="detail-panel">
          <span class="eyebrow">${escapeHtml(product.brand)}</span>
          <h1>${escapeHtml(product.name)}</h1>
          <div class="detail-price">
            <strong>${money(product.price)}</strong>
            <span class="stock">● Còn hàng</span>
          </div>
          ${product.description ? `<p class="desc">${escapeHtml(product.description)}</p>` : ''}
          ${colors.length ? `
            <div class="detail-meta">
              <span class="meta-label">Màu sắc</span>
              <div class="color-pills">${colors.map((color) => `<span class="color-pill">${escapeHtml(color)}</span>`).join('')}</div>
            </div>` : ''}
          ${sizes.length ? `
            <div class="detail-meta">
              <span class="meta-label">Chọn size</span>
              <div class="size-options" role="group" aria-label="Chọn size">
                ${sizes.map((size, index) => `<button type="button" class="size-option${index === 0 ? ' active' : ''}" data-size="${escapeHtml(size)}">${escapeHtml(size)}</button>`).join('')}
              </div>
            </div>
            <input type="hidden" id="size" value="${escapeHtml(sizes[0])}">`
          : '<input type="hidden" id="size" value="">'}
          <label class="qty-label">Số lượng <input id="qty" type="number" min="1" max="99" value="1"></label>
          <div class="actions">
            <button type="button" id="add-to-cart" class="btn">Thêm vào giỏ</button>
            <a class="btn ghost" href="#/cart">Xem giỏ hàng</a>
          </div>
          <p id="product-msg" class="msg"></p>
        </div>
      </div>
    </section>`;

  document.querySelectorAll('.size-option').forEach((button) => {
    button.addEventListener('click', () => {
      document.querySelectorAll('.size-option').forEach((item) => item.classList.remove('active'));
      button.classList.add('active');
      document.getElementById('size').value = button.dataset.size;
    });
  });

  document.getElementById('add-to-cart').addEventListener('click', async () => {
    const size = document.getElementById('size').value;
    const qty = Number(document.getElementById('qty').value);
    const message = document.getElementById('product-msg');
    try {
      await api('/api/cart', { method: 'POST', body: { productId: product.id, size, qty } });
      await refreshCart();
      toast('Đã thêm vào giỏ.');
      message.textContent = '';
    } catch (error) {
      message.textContent = error.message;
      message.className = 'msg error';
    }
  });
}

async function renderCart() {
  const { data: cart } = await api('/api/cart');

  if (!cart.items.length) {
    app.innerHTML = `
      <section class="card empty-card">
        <img class="empty-img" src="${FALLBACK_IMG}" alt="" aria-hidden="true">
        <h2>Giỏ hàng trống</h2>
        <p class="meta">Thêm vài đôi giày để bắt đầu nhé.</p>
        <a class="btn" href="#/">Tiếp tục mua sắm</a>
      </section>`;
    return;
  }

  app.innerHTML = `
    <section class="card">
      <h2>Giỏ hàng</h2>
      <div class="cart-table">
        ${cart.items.map((item) => {
          return `
            <div class="cart-row">
              ${imageTag(safeImage(item.image_url) || FALLBACK_IMG, item.name, 'cart-thumb')}
              <div class="cart-main">
                <a href="#/product/${item.productId}">${escapeHtml(item.name)}</a>
                <span class="meta">${escapeHtml(item.brand)}${item.size ? ` • Size ${escapeHtml(item.size)}` : ''}</span>
                <span class="price">${money(item.price)}</span>
              </div>
              <input class="qty" type="number" min="0" max="99" value="${item.qty}"
                     data-product="${item.productId}" data-size="${escapeHtml(item.size)}" aria-label="Số lượng">
              <strong class="subtotal">${money(item.subtotal)}</strong>
              <button type="button" class="delete remove"
                      data-product="${item.productId}" data-size="${escapeHtml(item.size)}">Xóa</button>
            </div>`;
        }).join('')}
      </div>
      <div class="cart-total">Tổng cộng: <strong>${money(cart.total)}</strong> <span class="meta">(${cart.count} món)</span></div>
      <div class="actions">
        <a class="btn" href="#/checkout">Đặt hàng</a>
        <a class="btn ghost" href="#/">Tiếp tục mua</a>
      </div>
    </section>`;

  document.querySelectorAll('input.qty').forEach((input) => {
    input.addEventListener('change', async () => {
      try {
        await api('/api/cart', {
          method: 'PATCH',
          body: {
            productId: Number(input.dataset.product),
            size: input.dataset.size,
            qty: Number(input.value),
          },
        });
        await refreshCart();
        await renderCart();
      } catch (error) {
        toast(error.message, true);
      }
    });
  });

  document.querySelectorAll('button.remove').forEach((button) => {
    button.addEventListener('click', async () => {
      try {
        const params = new URLSearchParams({
          productId: button.dataset.product,
          size: button.dataset.size,
        });
        await api(`/api/cart?${params}`, { method: 'DELETE' });
        await refreshCart();
        await renderCart();
      } catch (error) {
        toast(error.message, true);
      }
    });
  });
}

async function renderCheckout() {
  if (!state.me) {
    afterLogin = '#/checkout';
    location.hash = '#/login';
    return;
  }

  const { data: cart } = await api('/api/cart');
  if (!cart.items.length) {
    app.innerHTML = '<section class="card"><p class="empty">Giỏ hàng trống.</p></section>';
    return;
  }

  app.innerHTML = `
    <section class="card">
      <h2>Đặt hàng</h2>
      <div class="checkout-grid">
        <form id="checkout-form" class="checkout-form">
          <label>Họ tên<input name="customer_name" required maxlength="120" value="${escapeHtml(state.me.name)}"></label>
          <label>Số điện thoại<input name="phone" required maxlength="20" placeholder="0901234567"></label>
          <label>Địa chỉ<textarea name="address" required maxlength="300" rows="2"></textarea></label>
          <label>Ghi chú<textarea name="note" maxlength="500" rows="2"></textarea></label>
          <label>Thanh toán
            <select name="payment_method">
              <option value="cod">COD - thanh toán khi nhận hàng</option>
              <option value="bank">Chuyển khoản</option>
            </select>
          </label>
          <div class="actions">
            <button type="submit" class="btn">Xác nhận đặt hàng</button>
            <a class="btn ghost" href="#/cart">Quay lại giỏ</a>
          </div>
          <p id="checkout-msg" class="msg"></p>
        </form>
        <aside class="summary">
          <h3>Đơn hàng của bạn</h3>
          ${cart.items.map((item) => `
            <div class="summary-row">
              <span>${escapeHtml(item.name)}${item.size ? ` (${escapeHtml(item.size)})` : ''} × ${item.qty}</span>
              <strong>${money(item.subtotal)}</strong>
            </div>`).join('')}
          <div class="summary-total"><span>Tổng cộng</span><strong>${money(cart.total)}</strong></div>
        </aside>
      </div>
    </section>`;

  document.getElementById('checkout-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const message = document.getElementById('checkout-msg');
    const payload = Object.fromEntries(new FormData(event.currentTarget).entries());

    try {
      const result = await api('/api/orders', { method: 'POST', body: payload });
      await refreshCart();
      toast(`Đặt hàng thành công. Mã đơn #${result.data.id}`);
      location.hash = '#/orders';
    } catch (error) {
      message.textContent = error.message;
      message.className = 'msg error';
    }
  });
}

function orderCard(order) {
  return `
    <article class="order">
      <div class="order-head">
        <strong>Đơn #${order.id}</strong>
        <span class="status ${escapeHtml(order.status)}">${escapeHtml(STATUS_LABELS[order.status] ?? order.status)}</span>
      </div>
      <div class="meta">${new Date(order.created_at).toLocaleString('vi-VN')} • ${order.payment_method === 'cod' ? 'COD' : 'Chuyển khoản'}</div>
      <div class="order-items">
        ${order.items.map((item) => `
          <div class="summary-row">
            <span>${escapeHtml(item.name)}${item.size ? ` (${escapeHtml(item.size)})` : ''} × ${item.qty}</span>
            <strong>${money(item.price * item.qty)}</strong>
          </div>`).join('')}
      </div>
      <div class="order-total">Tổng: <strong>${money(order.total)}</strong></div>
    </article>`;
}

async function renderOrders() {
  if (!state.me) {
    afterLogin = '#/orders';
    location.hash = '#/login';
    return;
  }

  const { data: orders } = await api('/api/orders');
  app.innerHTML = `
    <section class="card">
      <h2>Đơn hàng của tôi</h2>
      ${orders.length
        ? `<div class="orders">${orders.map(orderCard).join('')}</div>`
        : '<p class="empty">Chưa có đơn hàng.</p>'}
    </section>`;
}

function renderLogin() {
  app.innerHTML = `
    <section class="card narrow auth-card">
      <img class="auth-logo" src="/images/air-runner.svg" alt="" aria-hidden="true">
      <h2>Đăng nhập</h2>
      <p class="meta">Chào mừng trở lại với Giày Store.</p>
      <form id="login-form">
        <label>Email<input name="email" type="email" required autocomplete="email"></label>
        <label>Mật khẩu<input name="password" type="password" required minlength="8" autocomplete="current-password"></label>
        <div class="actions"><button type="submit" class="btn">Đăng nhập</button></div>
        <p id="login-msg" class="msg"></p>
        <p class="meta">Chưa có tài khoản? <a href="#/register">Đăng ký</a></p>
      </form>
    </section>`;

  document.getElementById('login-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const message = document.getElementById('login-msg');
    const body = Object.fromEntries(new FormData(event.currentTarget).entries());

    try {
      const result = await api('/api/auth/login', { method: 'POST', body });
      state.me = result.data;
      await refreshCart();
      toast('Đăng nhập thành công.');
      const next = afterLogin;
      afterLogin = '#/';
      location.hash = next;
    } catch (error) {
      message.textContent = error.message;
      message.className = 'msg error';
    }
  });
}

function renderRegister() {
  app.innerHTML = `
    <section class="card narrow auth-card">
      <img class="auth-logo" src="/images/air-runner.svg" alt="" aria-hidden="true">
      <h2>Đăng ký</h2>
      <p class="meta">Tạo tài khoản để đặt hàng và theo dõi đơn.</p>
      <form id="register-form">
        <label>Họ tên<input name="name" required maxlength="80" autocomplete="name"></label>
        <label>Email<input name="email" type="email" required autocomplete="email"></label>
        <label>Mật khẩu (tối thiểu 8 ký tự)
          <input name="password" type="password" required minlength="8" autocomplete="new-password">
        </label>
        <div class="actions"><button type="submit" class="btn">Tạo tài khoản</button></div>
        <p id="register-msg" class="msg"></p>
        <p class="meta">Đã có tài khoản? <a href="#/login">Đăng nhập</a></p>
      </form>
    </section>`;

  document.getElementById('register-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const message = document.getElementById('register-msg');
    const body = Object.fromEntries(new FormData(event.currentTarget).entries());

    try {
      const result = await api('/api/auth/register', { method: 'POST', body });
      state.me = result.data;
      await refreshCart();
      toast('Đăng ký thành công.');
      const next = afterLogin;
      afterLogin = '#/';
      location.hash = next;
    } catch (error) {
      message.textContent = error.message;
      message.className = 'msg error';
    }
  });
}

function adminProductsView(products) {
  return `
    <form id="product-form" class="admin-form">
      <div class="grid">
        <label>Tên<input name="name" required maxlength="120"></label>
        <label>Hãng<input name="brand" required maxlength="80"></label>
        <label>Giá (VND)<input name="price" required inputmode="numeric" pattern="[0-9]+"></label>
        <label>Size (cách nhau dấu phẩy)<input name="sizes" placeholder="39,40,41"></label>
        <label>Màu (cách nhau dấu phẩy)<input name="colors" placeholder="Đen,Trắng"></label>
        <label>Ảnh URL<input name="image_url" placeholder="https://… hoặc /images/…"></label>
      </div>
      <label>Mô tả<textarea name="description" rows="2" maxlength="2000"></textarea></label>
      <div class="actions">
        <button type="submit" class="btn" id="product-submit">Tạo sản phẩm</button>
        <button type="button" class="btn ghost" id="product-cancel" hidden>Hủy sửa</button>
        <span id="product-msg" class="msg"></span>
      </div>
    </form>
    <div class="table-wrap">
      <table class="table">
        <thead><tr><th></th><th>ID</th><th>Tên</th><th>Hãng</th><th>Giá</th><th></th></tr></thead>
        <tbody>
          ${products.length ? products.map((product) => `
            <tr>
              <td>${imageTag(safeImage(product.image_url) || FALLBACK_IMG, '', 'admin-thumb')}</td>
              <td>${product.id}</td>
              <td>${escapeHtml(product.name)}</td>
              <td>${escapeHtml(product.brand)}</td>
              <td>${money(product.price)}</td>
              <td class="row-actions">
                <button type="button" class="edit" data-id="${product.id}">Sửa</button>
                <button type="button" class="delete" data-id="${product.id}">Xóa</button>
              </td>
            </tr>`).join('') : '<tr><td colspan="6" class="empty">Chưa có sản phẩm.</td></tr>'}
        </tbody>
      </table>
    </div>`;
}

function setFormValue(form, name, value) {
  const field = form.elements.namedItem(name);
  if (field) field.value = value;
}

function bindAdminProducts() {
  const form = document.getElementById('product-form');
  const message = document.getElementById('product-msg');
  const submit = document.getElementById('product-submit');
  const cancel = document.getElementById('product-cancel');

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(form).entries());
    payload.price = Number(payload.price);

    try {
      if (state.editingProductId) {
        await api(`/api/products/${state.editingProductId}`, { method: 'PUT', body: payload });
      } else {
        await api('/api/products', { method: 'POST', body: payload });
      }
      state.editingProductId = null;
      toast('Đã lưu sản phẩm.');
      await renderAdmin();
    } catch (error) {
      message.textContent = error.message;
      message.className = 'msg error';
    }
  });

  cancel.addEventListener('click', async () => {
    state.editingProductId = null;
    await renderAdmin();
  });

  document.querySelectorAll('#tab-products .edit').forEach((button) => {
    button.addEventListener('click', () => {
      const product = state.products.find((item) => item.id === Number(button.dataset.id));
      if (!product) return;

      setFormValue(form, 'name', product.name);
      setFormValue(form, 'brand', product.brand);
      setFormValue(form, 'price', product.price);
      setFormValue(form, 'sizes', product.sizes.join(','));
      setFormValue(form, 'colors', product.colors.join(','));
      setFormValue(form, 'image_url', product.image_url ?? '');
      setFormValue(form, 'description', product.description ?? '');

      state.editingProductId = product.id;
      submit.textContent = 'Cập nhật sản phẩm';
      cancel.hidden = false;
      form.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });

  document.querySelectorAll('#tab-products .delete').forEach((button) => {
    button.addEventListener('click', async () => {
      if (!confirm('Xóa sản phẩm này?')) return;
      try {
        await api(`/api/products/${button.dataset.id}`, { method: 'DELETE' });
        toast('Đã xóa sản phẩm.');
        await renderAdmin();
      } catch (error) {
        toast(error.message, true);
      }
    });
  });
}

function adminOrdersView(orders) {
  if (!orders.length) return '<p class="empty">Chưa có đơn hàng.</p>';

  return `
    <div class="table-wrap">
      <table class="table">
        <thead><tr><th>#</th><th>Khách</th><th>Món</th><th>Tổng</th><th>Trạng thái</th></tr></thead>
        <tbody>
          ${orders.map((order) => `
            <tr>
              <td>${order.id}</td>
              <td>
                ${escapeHtml(order.customer_name)}
                <div class="meta">${escapeHtml(order.phone)} • ${escapeHtml(order.address)}</div>
              </td>
              <td class="meta">
                ${order.items.map((item) => `${escapeHtml(item.name)} × ${item.qty}`).join('<br>')}
              </td>
              <td>${money(order.total)}</td>
              <td>
                <select class="status-select" data-id="${order.id}">
                  ${Object.entries(STATUS_LABELS).map(([value, label]) => `
                    <option value="${value}" ${order.status === value ? 'selected' : ''}>${label}</option>`).join('')}
                </select>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

function bindAdminOrders() {
  document.querySelectorAll('.status-select').forEach((select) => {
    select.addEventListener('change', async () => {
      try {
        await api(`/api/admin/orders/${select.dataset.id}`, {
          method: 'PATCH',
          body: { status: select.value },
        });
        toast('Đã cập nhật trạng thái đơn.');
      } catch (error) {
        toast(error.message, true);
      }
    });
  });
}

function bindTabSwitcher() {
  document.querySelectorAll('.tabs button').forEach((button) => {
    button.addEventListener('click', () => {
      document.querySelectorAll('.tabs button').forEach((item) => {
        item.classList.toggle('active', item === button);
      });
      document.getElementById('tab-products').hidden = button.dataset.tab !== 'products';
      document.getElementById('tab-orders').hidden = button.dataset.tab !== 'orders';
    });
  });
}

async function renderAdmin() {
  if (!state.me) {
    afterLogin = '#/admin';
    location.hash = '#/login';
    return;
  }
  if (state.me.role !== 'admin') {
    app.innerHTML = '<section class="card"><p class="empty">Bạn không có quyền truy cập trang quản trị.</p></section>';
    return;
  }

  const [productsResult, ordersResult] = await Promise.all([
    api('/api/products?limit=60'),
    api('/api/admin/orders'),
  ]);
  state.products = productsResult.data;

  app.innerHTML = `
    <section class="card">
      <h2>Quản trị</h2>
      <div class="tabs">
        <button type="button" data-tab="products" class="active">Sản phẩm</button>
        <button type="button" data-tab="orders">Đơn hàng</button>
      </div>
      <div id="tab-products">${adminProductsView(state.products)}</div>
      <div id="tab-orders" hidden>${adminOrdersView(ordersResult.data)}</div>
    </section>`;

  bindTabSwitcher();
  bindAdminProducts();
  bindAdminOrders();
}

window.addEventListener('hashchange', () => {
  router().catch(showError);
});

nav.addEventListener('click', async (event) => {
  if (event.target.id !== 'logout') return;
  try {
    await api('/api/auth/logout', { method: 'POST' });
  } catch {
    // session already gone
  }
  state.me = null;
  await refreshCart();
  location.hash = '#/';
  router().catch(showError);
});

(async function init() {
  await Promise.all([refreshMe(), refreshCart()]);
  renderNav();
  await router();
})().catch(showError);
