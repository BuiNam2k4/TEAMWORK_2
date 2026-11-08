# Giày Store — Web bán giày + API PostgreSQL

Web bán giày đơn giản: xem danh sách, chi tiết, lọc, giỏ hàng, đặt hàng, tài khoản và trang quản trị. Backend Express + PostgreSQL, frontend HTML/CSS/JS không build step.

> Chạy nhanh: `npm install && npm run dev` rồi mở http://localhost:3000. Không cần database: app dùng PostgreSQL in-memory, có sẵn 6 sản phẩm mẫu và in tài khoản admin ra terminal.

## Chức năng

- **Trang chủ**: danh sách sản phẩm, tìm theo tên, lọc theo hãng/size/khoảng giá, phân trang.
- **Chi tiết sản phẩm**: ảnh, mô tả, size, màu, thêm vào giỏ.
- **Giỏ hàng**: thêm/sửa số lượng/xóa, tổng tiền; dùng được cho khách chưa đăng nhập (lưu theo session).
- **Đặt hàng**: COD hoặc chuyển khoản, lưu đơn + chi tiết đơn, xem lịch sử đơn.
- **Tài khoản**: đăng ký/đăng nhập/đăng xuất, mật khẩu hash bằng scrypt.
- **Quản trị**: CRUD sản phẩm, xem đơn, đổi trạng thái đơn; khách thường bị chặn.

## Đáp ứng yêu cầu

| Yêu cầu | Cách đáp ứng |
|---|---|
| Web xem danh sách + tạo mới | Trang chủ + form thêm sản phẩm trong trang Quản trị |
| API GET/POST kết nối PostgreSQL | `/api/products`, `/api/auth`, `/api/cart`, `/api/orders` dùng `pg` + prepared statements |
| Dữ liệu minh chứng trước/sau | `npm run demo` và test "tạo sản phẩm rồi kiểm tra danh sách sau" |
| `/health` liveness + readiness | `/health/live` (không phụ thuộc DB), `/health/ready` (kiểm tra DB), `/health` (tổng hợp) |
| Cấu hình qua environment | `src/config.js` đọc `PORT`, `DATABASE_URL`, `SESSION_SECRET`, `ADMIN_*`; không có password trong source |
| ≥ 5 automated tests | 18 test tại `test/api.test.js`, chạy bằng `node --test` |

## Stack

- Node.js 22 LTS, Express 5
- PostgreSQL 16, driver `pg`
- `express-session` (cookie) + `crypto.scrypt` cho mật khẩu
- Frontend HTML/CSS/JS thuần, không build step
- Test: `node:test` + `pg-mem` (không cần PostgreSQL thật)

## Cấu trúc

```
src/config.js          đọc và validate environment
src/db.js              pool PostgreSQL, schema, seed sản phẩm mẫu
src/app.js             Express app, session, health, mount routes
src/server.js          entrypoint, seed admin dev, khởi động server
src/auth.js            hash mật khẩu, requireAuth/requireAdmin, seed admin
src/products.js        validate/serialize sản phẩm
src/cart.js            đọc giỏ hàng từ session + sản phẩm
src/http.js            parse id / query number
src/routes/auth.js     đăng ký, đăng nhập, đăng xuất, me
src/routes/products.js danh sách/lọc, chi tiết, CRUD (admin)
src/routes/cart.js     thêm/sửa/xóa giỏ
src/routes/orders.js   đặt hàng, lịch sử đơn
src/routes/admin.js    quản lý đơn hàng
sql/schema.sql         schema PostgreSQL
public/                web UI (SPA hash routing)
public/images/         ảnh minh hoạ giày (SVG nội bộ, không cần mạng)
scripts/demo.mjs       minh chứng dữ liệu trước/sau
test/api.test.js       18 automated tests
```

## Hướng dẫn chạy cho thành viên

### 1. Yêu cầu
- **Node.js 22 LTS** (tối thiểu 20.9). Kiểm tra: `node -v`
- Git
- PostgreSQL 16 chỉ cần khi muốn dùng database thật; xem giao diện và chạy test **không cần**.

### 2. Lấy code và cài dependency

```bash
git clone <repo-url>
cd TEAMWORK_2
npm install
```

### 3. Chạy nhanh (không cần database)

```bash
npm run dev
```

Mở http://localhost:3000.

Ở chế độ dev, khi thiếu `DATABASE_URL`:
- App dùng PostgreSQL in-memory (`pg-mem`); dữ liệu mất khi restart.
- Tự seed 6 sản phẩm mẫu.
- Tự tạo admin ngẫu nhiên và in ra terminal, ví dụ:
  `Dev admin: admin@shoe.local / Ab3dEf6hIj9k`
- Dùng tài khoản đó để vào mục **Quản trị**, hoặc bấm **Đăng ký** để tạo tài khoản khách.

### 4. Chạy với PostgreSQL thật

```bash
cp .env.example .env
# Mở .env, sửa DATABASE_URL, SESSION_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD
npm start
```

App tự chạy `sql/schema.sql` khi khởi động, tạo/cập nhật tài khoản admin từ `ADMIN_EMAIL`/`ADMIN_PASSWORD`, và seed 6 sản phẩm mẫu nếu bảng `products` đang trống. Ở `NODE_ENV=production`, `DATABASE_URL` và `SESSION_SECRET` là bắt buộc.

App tự thêm các cột còn thiếu khi khởi động (`ALTER TABLE ... IF NOT EXISTS` trong `sql/schema.sql`). Nếu dùng Docker với volume cũ và vẫn lỗi, chạy `docker compose down -v` rồi `docker compose up -d`.

### 5. Chạy test

```bash
npm test
```

18 test, không cần PostgreSQL (dùng `pg-mem`).

### 6. Kiểm tra nhanh

```bash
curl http://localhost:3000/health/live
curl http://localhost:3000/health/ready
npm run demo   # in BEFORE/INSERTED/AFTER, cần PostgreSQL thật
```

### Lỗi thường gặp

| Lỗi | Cách xử lý |
|---|---|
| `Cannot find module 'express'` / `'pg-mem'` | Chưa cài dependency: chạy `npm install` (hoặc `npm ci`) |
| `DATABASE_URL is required in production` | Đang đặt `NODE_ENV=production`; tạo `.env` với `DATABASE_URL` thật hoặc bỏ `NODE_ENV` khi dev |
| `SESSION_SECRET is required in production` | Thêm `SESSION_SECRET` dài, ngẫu nhiên vào `.env` |
| `EADDRINUSE: address already in use :::3000` | Port bận: đổi `PORT=3001` trong `.env`, hoặc tắt process đang chạy |
| `--env-file-if-exists` không được hỗ trợ | Node quá cũ: nâng lên Node 22 LTS |
| Đổi code mà giao diện không đổi | Khởi động lại `npm run dev` và hard-refresh trình duyệt |

## API

### Auth

| Method | Endpoint | Mô tả |
|---|---|---|
| POST | `/api/auth/register` | Đăng ký `{name, email, password}` (mật khẩu ≥ 8 ký tự) |
| POST | `/api/auth/login` | Đăng nhập `{email, password}` |
| POST | `/api/auth/logout` | Đăng xuất |
| GET | `/api/auth/me` | Thông tin user đang đăng nhập |

### Products

| Method | Endpoint | Mô tả |
|---|---|---|
| GET | `/api/products?q=&brand=&size=&minPrice=&maxPrice=&page=&limit=` | Danh sách + lọc + phân trang |
| GET | `/api/products/:id` | Chi tiết sản phẩm |
| POST | `/api/products` | Tạo sản phẩm (admin) |
| PUT | `/api/products/:id` | Cập nhật sản phẩm (admin) |
| DELETE | `/api/products/:id` | Xóa sản phẩm (admin) |

Body tạo/cập nhật:

```json
{
  "name": "Air Runner",
  "brand": "Nike",
  "price": 2500000,
  "image_url": "https://example.com/shoe.jpg",
  "description": "Giày chạy bộ",
  "sizes": ["40", "41", "42"],
  "colors": ["Đen", "Trắng"]
}
```

### Cart

| Method | Endpoint | Mô tả |
|---|---|---|
| GET | `/api/cart` | Giỏ hiện tại + tổng tiền |
| POST | `/api/cart` | Thêm `{productId, size, qty}` |
| PATCH | `/api/cart` | Đặt số lượng `{productId, size, qty}` (0 = xóa) |
| DELETE | `/api/cart?productId=&size=` | Xóa một món |
| DELETE | `/api/cart/all` | Xóa toàn bộ giỏ |

### Orders

| Method | Endpoint | Mô tả |
|---|---|---|
| POST | `/api/orders` | Đặt hàng từ giỏ (cần đăng nhập) |
| GET | `/api/orders` | Đơn của tôi |
| GET | `/api/orders/:id` | Chi tiết đơn (chủ đơn hoặc admin) |

Body đặt hàng:

```json
{
  "customer_name": "An",
  "phone": "0901234567",
  "address": "123 Đường ABC, TP.HCM",
  "note": "Giao giờ hành chính",
  "payment_method": "cod"
}
```

### Admin

| Method | Endpoint | Mô tả |
|---|---|---|
| GET | `/api/admin/orders?status=` | Tất cả đơn, lọc theo trạng thái |
| PATCH | `/api/admin/orders/:id` | Đổi trạng thái `{status}` |

Trạng thái: `pending`, `confirmed`, `shipping`, `done`, `cancelled`.

### Health

| Endpoint | Ý nghĩa |
|---|---|
| `GET /health/live` | Liveness: server còn sống, **không** kiểm tra DB. Dùng cho restart policy. |
| `GET /health/ready` | Readiness: kiểm tra bảng sản phẩm. DB chết → `503`. |
| `GET /health` | Tổng hợp liveness + database. |

```bash
curl -i localhost:3000/health/live    # 200
curl -i localhost:3000/health/ready   # 200 khi DB sống, 503 khi DB chết
```

## Minh chứng trước/sau

Cách 1 — script (in bảng trước và sau khi INSERT):

```bash
npm run demo
# BEFORE (n sản phẩm): ...
# INSERTED: { id, name: 'Demo Runner', ... }
# AFTER (n+1 sản phẩm): ...
```

Cách 2 — qua API:

```bash
curl -s localhost:3000/api/products
curl -s -X POST localhost:3000/api/products \
  -H 'content-type: application/json' \
  -H 'cookie: connect.sid=<admin-session>' \
  -d '{"name":"Air Runner","brand":"Nike","price":2500000,"sizes":["40","41"]}'
curl -s localhost:3000/api/products
```

Cách 3 — test `lets admin create a product and shows it in the public list afterwards` kiểm tra đúng chuỗi before → create → after.

## Automated tests (18)

- **Health (3)**: liveness khi DB chết, readiness 503 khi DB chết, readiness 200 khi DB sống.
- **Auth (3)**: đăng ký/me/logout, trùng email/sai mật khẩu, validate input.
- **Products (6)**: chặn khách sửa, tạo rồi thấy trong danh sách (before/after), validate, đọc/sửa/xóa, lọc tên/hãng/size/giá + phân trang, id/query sai.
- **Cart (2)**: thêm/cộng dồn/sửa/xóa + tổng tiền, chặn size và số lượng sai.
- **Orders (3)**: checkout xóa giỏ + lịch sử đơn, yêu cầu đăng nhập/giỏ không rỗng, admin xem/đổi trạng thái còn khách thì bị chặn.
- **Web (1)**: trang `/` trả HTML.

## Deploy VPS Ubuntu

```bash
sudo apt update && sudo apt install -y nginx
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
sudo useradd --system --home /opt/shoe-store shoe
sudo mkdir -p /opt/shoe-store && sudo chown shoe:shoe /opt/shoe-store
# copy source vào /opt/shoe-store, sau đó:
sudo -u shoe npm ci --omit=dev
sudo -u shoe cp .env.example .env   # sửa DATABASE_URL, SESSION_SECRET, ADMIN_*
```

`/etc/systemd/system/shoe-store.service`:

```ini
[Unit]
Description=Shoe Store
After=network.target postgresql.service

[Service]
User=shoe
WorkingDirectory=/opt/shoe-store
EnvironmentFile=/opt/shoe-store/.env
ExecStart=/usr/bin/node src/server.js
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now shoe-store
# nginx: proxy_pass http://127.0.0.1:3000; rồi certbot --nginx
```

Chỉ mở 80/443; PostgreSQL và app không mở ra Internet. Backup định kỳ bằng `pg_dump`.

### Docker Compose + nginx host (CI/CD)

```bash
# local
docker compose up -d --build
docker compose ps
docker compose logs -f app
# mở http://localhost:3005
```

Trên VPS (thủ công, không cần CD):

```bash
cd /root/TEAMWORK_2
git pull
docker compose up -d --build
```

- CI push ảnh `ghcr.io/buinam2k4/teamwork_2:latest`; CD tự `pull` và `up -d` sau khi CI trên `main` thành công.
- App publish `127.0.0.1:3005:3000` (chỉ localhost); **không** chạy nginx container. Host nginx trên VPS proxy `http://127.0.0.1:3005`.
- Trên VPS, đặt repository variable `APP_DIR` là đường dẫn tuyệt đối (ví dụ `/root/TEAMWORK_2`); CD copy `docker-compose.yml`, `sql/schema.sql`, `nginx/teamwork_2.conf` lên đó và **không xóa** container/service khác (không dùng `--remove-orphans`).
- Cài site nginx một lần (sửa `server_name` thành domain hoặc IP công khai trước):

```bash
sudo cp /root/TEAMWORK_2/nginx/teamwork_2.conf /etc/nginx/sites-available/teamwork_2.conf
sudo ln -sf /etc/nginx/sites-available/teamwork_2.conf /etc/nginx/sites-enabled/teamwork_2.conf
sudo nginx -t && sudo systemctl reload nginx
```

Nếu nginx của bạn dùng `conf.d`, copy vào `/etc/nginx/conf.d/teamwork_2.conf`. Chỉ mở 80/443; app 3005 không mở firewall.

- Tạo `.env` trên VPS (copy từ `.env.example`) để đặt `SESSION_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`; compose đọc biến này, còn CD không ghi đè `.env`.
- Container `web` cũ trên 3003 vẫn được giữ; CD không xóa. App mới chạy song song trên 3005.
- Volume cũ: `docker compose down -v` rồi `docker compose up -d --build` (lệnh đầu **xóa DB**).

## Bảo mật

- Không hard-code password: mọi thông tin nhạy cảm đọc từ env; `.env` nằm trong `.gitignore`.
- Mật khẩu hash bằng `scrypt` + salt ngẫu nhiên, so sánh bằng `timingSafeEqual`.
- Session cookie `httpOnly`, `sameSite=lax`, `secure` tự bật khi chạy sau HTTPS.
- Phân quyền: sửa/xóa sản phẩm và quản lý đơn yêu cầu role `admin`.
- Truy vấn tham số hóa (chống SQL injection).
- HTML escape ở client, validate chặt ở server (chống XSS / dữ liệu rác).
- Giới hạn body JSON 32kb; không trả stack trace cho client ở lỗi 500.

## Ghi chú phạm vi

Session lưu in-memory (MemoryStore): phù hợp một instance; restart server sẽ đăng xuất và xóa giỏ khách. Thanh toán chỉ ghi nhận COD/chuyển khoản, chưa tích hợp cổng thật.
