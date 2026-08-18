# E-commerce Backend

Backend học tập cho một cửa hàng thiết bị điện tử, xây dựng bằng Express, TypeScript, PostgreSQL và Prisma.

## Yêu cầu

- Node.js 22.12 trở lên trong dòng Node 22.
- npm.
- Docker Desktop và Docker Compose.

## Khởi động local

```bash
npm install
docker compose up -d postgres
npm run prisma:generate
npm run dev
```

Các URL ban đầu:

- Liveness: `http://localhost:3000/health/live`
- Readiness: `http://localhost:3000/health/ready`
- Swagger UI: `http://localhost:3000/docs`
- OpenAPI JSON: `http://localhost:3000/docs.json`

Copy `.env.example` thành `.env` nếu file local chưa tồn tại. PostgreSQL chỉ bind vào `127.0.0.1:5432` và dữ liệu được giữ trong Docker named volume.

## Scripts

```bash
npm run dev
npm run typecheck
npm run lint
npm run format:check
npm run test:run
npm run build
npm run prisma:generate
npm run prisma:migrate
npm run prisma:studio
```

Swagger hiện chỉ được setup sẵn. Endpoint documentation chi tiết sẽ được bổ sung sau khi các API ổn định.

Các quyết định kiến trúc và trade-off quan trọng được lưu trong [Architecture Decision Records](docs/adr/README.md).

## API đăng ký mẫu

```http
POST /api/v1/auth/register
Content-Type: application/json

{
  "email": "alice@example.com",
  "password": "password123",
  "fullName": "Alice Nguyen"
}
```

Response thành công: `201 Created`. Email trùng trả `409`; body không hợp lệ trả `422`.

## Integration test

Test đăng ký dùng PostgreSQL riêng trên cổng `5433`, không dùng database development:

```powershell
docker compose --profile test up -d postgres_test
$env:DATABASE_URL = 'postgresql://ecommerce:ecommerce@127.0.0.1:5433/ecommerce_test?schema=public'
npx prisma migrate deploy
Remove-Item Env:DATABASE_URL
npm run test:run
```

Database test dùng `tmpfs`, nên dữ liệu sẽ mất khi container bị xóa. Dừng container bằng:

```bash
docker compose --profile test stop postgres_test
```
