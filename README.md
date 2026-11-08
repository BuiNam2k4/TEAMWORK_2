# Giày Store — Web CRUD sản phẩm + API PostgreSQL

Web bán giày đơn giản: xem **danh sách sản phẩm** và **tạo sản phẩm mới** (nghiệp vụ CRUD tương đương yêu cầu "danh sách yêu cầu + tạo yêu cầu mới"). Toàn bộ dữ liệu nằm trong PostgreSQL.

> Chạy nhanh: `npm install && npm run dev` rồi mở http://localhost:3000 (không cần database).

## Đáp ứng yêu cầu

| Yêu cầu | Cách đáp ứng |
|---|---|
| Web xem danh sách + tạo mới | `public/index.html` gọi API, form tạo sản phẩm, tìm kiếm, xóa |
| API GET/POST kết nối PostgreSQL | `GET/POST/PUT/DELETE /api/products` dùng `pg` + prepared statements |
| Dữ liệu minh chứng trước/sau | `npm run demo` và các test in/ so sánh danh sách trước và sau khi tạo |
| `/health` liveness + readiness | `/health/live` (không phụ thuộc DB), `/health/ready` (ping DB), `/health` (tổng hợp) |
| Cấu hình qua environment | `src/config.js` đọc `PORT`, `DATABASE_URL`, `NODE_ENV`; không có password trong source |
| ≥ 5 automated tests | 9 test tại `test/api.test.js`, chạy bằng `node --test` |

## Stack

- Node.js 20.9+ (đã test với Node 22), Express 5
- PostgreSQL 16, driver `pg`
- Frontend HTML/CSS/JS thuần, không build step
- Test: `node:test` + `pg-mem` (chạy test không cần PostgreSQL thật)

## Cấu trúc

```
src/config.js        đọc và validate environment
src/db.js            tạo pool PostgreSQL + chạy schema
src/app.js           Express app, API CRUD, health endpoints
src/server.js        entrypoint, khởi động server
sql/schema.sql       schema PostgreSQL
public/              web UI
scripts/demo.mjs     minh chứng dữ liệu trước/sau
test/api.test.js     9 automated tests
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

Khi thiếu `DATABASE_URL` ở môi trường dev, app tự dùng PostgreSQL in-memory (`pg-mem`); dữ liệu mất khi restart. Phù hợp để xem giao diện và thử API.

### 4. Chạy với PostgreSQL thật

```bash
cp .env.example .env
# Mở .env, sửa DATABASE_URL=postgres://user:password@localhost:5432/shoe
npm start
```

App tự chạy `sql/schema.sql` khi khởi động. Ở `NODE_ENV=production`, `DATABASE_URL` là bắt buộc và app không dùng in-memory DB.

### 5. Chạy test

```bash
npm test
```

9 test, không cần PostgreSQL (dùng `pg-mem`).

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
| `EADDRINUSE: address already in use :::3000` | Port bận: đổi `PORT=3001` trong `.env`, hoặc tắt process đang chạy |
| `--env-file-if-exists` không được hỗ trợ | Node quá cũ: nâng lên Node 22 LTS |
| Mở trang nhưng danh sách báo "Không tải được" | Kiểm tra terminal còn chạy và gọi `/health/ready` |

## API

| Method | Endpoint | Mô tả |
|---|---|---|
| GET | `/api/products?q=&brand=` | Danh sách sản phẩm, lọc theo tên/hãng |
| POST | `/api/products` | Tạo sản phẩm mới |
| GET | `/api/products/:id` | Chi tiết sản phẩm |
| PUT | `/api/products/:id` | Cập nhật sản phẩm |
| DELETE | `/api/products/:id` | Xóa sản phẩm |

Body tạo/cập nhật:

```json
{
  "name": "Air Runner",
  "brand": "Nike",
  "price": 2500000,
  "image_url": "https://example.com/shoe.jpg",
  "description": "Giày chạy bộ"
}
```

`name` (1–120 ký tự), `brand` (1–80), `price` (số nguyên VND ≥ 0) là bắt buộc. `image_url` phải là http(s). Dữ liệu sai trả `400` kèm `details`.

## Health

| Endpoint | Ý nghĩa |
|---|---|
| `GET /health/live` | Liveness: server còn sống, **không** kiểm tra DB. Dùng cho restart policy. |
| `GET /health/ready` | Readiness: ping `SELECT 1`. DB chết → `503`, dùng để rút khỏi load balancer. |
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
# {"data":[]}

curl -s -X POST localhost:3000/api/products \
  -H 'content-type: application/json' \
  -d '{"name":"Air Runner","brand":"Nike","price":2500000}'
# {"data":{"id":1,"name":"Air Runner",...}}

curl -s localhost:3000/api/products
# {"data":[{"id":1,"name":"Air Runner",...}]}
```

Cách 3 — test `lists an empty table, creates a product and shows it afterwards` kiểm tra đúng chuỗi before → create → after.

## Automated tests (9)

1. Liveness trả 200 kể cả khi DB chết.
2. Readiness trả 503 khi DB chết.
3. Readiness trả 200 khi DB sống.
4. Danh sách rỗng → tạo sản phẩm → danh sách có sản phẩm (before/after).
5. Payload sai bị từ chối `400` và không ghi dữ liệu.
6. Đọc, cập nhật, xóa sản phẩm.
7. Lọc theo tên, hãng và kết hợp.
8. ID sai trả `400`, ID không tồn tại trả `404`.
9. Trang `/` trả HTML danh sách sản phẩm.

## Deploy VPS Ubuntu

```bash
# Node 22 + app
sudo apt update && sudo apt install -y nginx
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
sudo useradd --system --home /opt/shoe-store shoe
sudo mkdir -p /opt/shoe-store && sudo chown shoe:shoe /opt/shoe-store
# copy source vào /opt/shoe-store, sau đó:
sudo -u shoe npm ci --omit=dev
sudo -u shoe cp .env.example .env   # sửa DATABASE_URL
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

## Bảo mật

- Không hard-code password: mọi thông tin nhạy cảm đọc từ env; `.env` nằm trong `.gitignore`.
- Truy vấn tham số hóa (chống SQL injection).
- HTML escape ở client và validate chặt ở server (chống XSS/ dữ liệu rác).
- Giới hạn body JSON 32kb; không trả stack trace cho client ở lỗi 500.

## Ghi chú phạm vi

Bản này tập trung đúng rubric: CRUD sản phẩm, API PostgreSQL, health, env, test. Chưa có đăng nhập, giỏ hàng, thanh toán — thêm sau nếu cần.
