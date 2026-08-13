# E-commerce Backend — Project Plan

## 1. Mục tiêu

Xây dựng REST API cho cửa hàng bán thiết bị điện tử như máy tính, điện thoại và tai nghe. Dự án giữ phạm vi vừa phải nhưng bao phủ các kiến thức backend thường gặp trong sản phẩm thực tế:

- Thiết kế API và cơ sở dữ liệu quan hệ.
- Authentication, authorization và quản lý phiên đăng nhập.
- Catalog, biến thể sản phẩm, tồn kho, giỏ hàng, coupon và đơn hàng.
- Thanh toán COD và VNPay Sandbox.
- Transaction, concurrency, idempotency, cache và background job.
- Upload ảnh, logging, security, testing và API documentation.
- Docker, CI/CD bằng GitHub Actions và triển khai cơ bản trên AWS.

Không chia kế hoạch theo ngày. Chọn một nhóm công việc, hoàn thành theo Definition of Done rồi chuyển sang nhóm tiếp theo.

### Triết lý và định hướng thiết kế

- **Phủ rộng kiến thức (Breadth over Depth)**: Mục tiêu chính là tiếp xúc được nhiều bài toán/chủ đề backend thực tế (Auth, Catalog, Cart, Order, Payment, Concurrency, Redis Cache, BullMQ Worker, Security, AWS,...). Mỗi bài toán chọn phiên bản/luồng xử lý tối giản (MVP) nhưng thể hiện đúng bản chất cốt lõi, không đào quá sâu hay làm phức tạp nghiệp vụ không cần thiết.
- **Tổ chức code chuẩn dự án lớn (Enterprise-grade Organization)**: Mặc dù tính năng triển khai đơn giản, cấu trúc và cách tổ chức codebase bắt buộc phải chuẩn chỉnh theo mô hình dự án lớn (Modular Monolith, phân tầng rõ ràng HTTP / Service / Repository, DTO/Validation, Error Handling, Middleware,...), đảm bảo code sạch, dễ đọc, dễ viết test, dễ bảo trì và dễ mở rộng khi cần.

## 2. Tiêu chí hoàn thành toàn dự án

- Khách hàng có thể đăng ký, đăng nhập, xem sản phẩm, quản lý giỏ hàng, áp dụng coupon và checkout.
- Hỗ trợ COD và thanh toán online qua VNPay Sandbox.
- Khách hàng theo dõi, hủy đơn hợp lệ và review sản phẩm đã nhận.
- Admin hoặc nhân viên có quyền phù hợp quản lý catalog, variant, tồn kho, coupon, đơn hàng và review.
- Hệ thống không bán vượt tồn kho khi có nhiều checkout đồng thời.
- VNPay IPN được xác minh và xử lý idempotent.
- Các API được mô tả bằng OpenAPI/Swagger.
- Các domain quan trọng có unit, integration và end-to-end test.
- Pull request phải qua CI; merge vào `main` tự động deploy lên AWS.
- API production-like hoạt động qua HTTPS và có health check.

## 3. Kiến trúc và công nghệ

### Stack

- Node.js 22, TypeScript strict và Express 5.
- npm để quản lý package.
- PostgreSQL và Prisma ORM.
- Redis cho cache, rate limiting và BullMQ.
- Zod để validate dữ liệu tại API boundary.
- JWT access token, refresh-token rotation, `bcrypt` và `jsonwebtoken`.
- Pino cho structured logging.
- OpenAPI/Swagger cho API contract.
- Vitest và Supertest cho testing.
- Docker Compose cho môi trường local và server.
- AWS EC2, S3, IAM và AWS Budgets.
- GitHub Actions và GitHub Container Registry.
- Caddy làm reverse proxy và tự cấp HTTPS.

### Kiến trúc ứng dụng

Sử dụng modular monolith. Mỗi module tách rõ HTTP concerns và business logic:

```text
src/
  config/          # Cấu hình biến môi trường và logger
  database/        # Kết nối cơ sở dữ liệu (Prisma, Redis)
  middlewares/     # Custom Express middlewares (validate, error, auth)
  utils/           # Hàm tiện ích (response, pagination, app-error)
  constants/       # Hằng số hệ thống dùng chung (roles, status)
  services/        # Tích hợp dịch vụ bên thứ 3 (VNPay, S3, Email)
  jobs/            # Background jobs & BullMQ queue processors
  routes/          # Router tổng hợp toàn ứng dụng
  docs/            # Swagger / OpenAPI documentation
  modules/         # Phân chia theo mô hình Modular Monolith
    auth/
    users/
    catalog/
    inventory/
    carts/
    coupons/
    orders/
    payments/
    reviews/
    uploads/
  app.ts
  server.ts
prisma/
tests/
docs/
```

Luồng phụ thuộc định hướng:

```text
route -> middleware -> controller -> service/use case -> repository -> database
```

- Controller chỉ xử lý HTTP input/output.
- Service/use case giữ business rules và transaction boundary.
- Repository cô lập truy cập dữ liệu khi việc tách lớp mang lại giá trị rõ ràng.
- Shared code chỉ chứa thành phần thực sự dùng chung, không trở thành thư mục tiện ích hỗn tạp.

## 4. Quy ước chung

- Base path: `/api/v1`.
- Database lưu thời gian theo UTC; chuyển timezone ở boundary cần thiết.
- VNPay sử dụng `Asia/Ho_Chi_Minh` khi tạo timestamp theo contract.
- Tiền lưu bằng số nguyên VND `BIGINT`, không dùng số thực.
- Giá trị tiền trong JSON trả dưới dạng chuỗi để tránh mất độ chính xác.
- ID dùng UUID hoặc CUID thống nhất trong toàn hệ thống.
- Input từ path, query, body và environment đều phải được validate.
- API không tin price, discount, total, role hoặc trạng thái do client tự gửi.
- Error response có mã lỗi ổn định, message và request ID; không trả stack trace ở production.
- Mọi thay đổi schema đều có Prisma migration và dữ liệu seed phù hợp.
- Không log password, token, cookie, database URL, AWS secret hoặc VNPay hash secret.

## 5. Checklist triển khai

### 5.1. Khởi tạo và nền tảng

- [x] Khởi tạo Git, Node.js, npm và TypeScript strict.
- [x] Cấu hình lint, format, typecheck, build và test scripts.
- [x] Tách `app.ts` khỏi `server.ts` để dễ integration test.
- [x] Validate environment variables khi khởi động.
- [ ] Cấu hình PostgreSQL, Prisma, migration và seed. PostgreSQL/Prisma đã setup; migration và seed sẽ làm khi có model đầu tiên.
- [ ] Cấu hình Redis và xử lý lỗi kết nối.
- [ ] Tạo Dockerfile nhiều stage và Docker Compose cho local. Docker Compose PostgreSQL đã có; Dockerfile để tới giai đoạn đóng gói ứng dụng.
- [ ] Chuẩn hóa success response, error response và pagination metadata.
- [ ] Tạo centralized error handler và mapping domain error sang HTTP status. Handler nền tảng đã có; mapping domain error làm khi bắt đầu module nghiệp vụ.
- [x] Thêm request ID, Pino logger và request logging.
- [x] Thêm Helmet, CORS allowlist, body limit và rate limiting.
- [ ] Thêm graceful shutdown cho HTTP server, Prisma, Redis và worker. HTTP server/Prisma đã có; Redis/worker thêm sau.
- [x] Tạo `/health/live`, `/health/ready` và `/docs`.

Acceptance criteria:

- Ứng dụng khởi động được bằng Docker Compose.
- Readiness phản ánh đúng trạng thái PostgreSQL và Redis.
- Request lỗi validation và lỗi nội bộ có format thống nhất.
- Test có thể import Express app mà không mở network port.

### 5.2. Authentication và người dùng

- [x] Thiết kế `User`, `RefreshToken` và `Address`.
- [x] Hỗ trợ đúng ba role cố định: `CUSTOMER`, `STAFF`, `ADMIN`.
- [x] Register với email duy nhất và password được hash bằng bcrypt.
- [x] Login và phát hành access/refresh token.
- [x] Access token có thời hạn khoảng 15 phút.
- [x] Refresh token có thời hạn khoảng 30 ngày và chỉ lưu hash.
- [x] Rotate refresh token sau mỗi lần sử dụng.
- [x] Phát hiện refresh-token reuse và thu hồi token family hoặc toàn bộ phiên liên quan.
- [x] Logout một phiên và logout tất cả thiết bị.
- [ ] Tài khoản `CUSTOMER` sử dụng các API mua hàng và chỉ thao tác trên tài nguyên của chính mình.
- [ ] Tài khoản `STAFF` vẫn sử dụng được chức năng khách hàng và được cấp thêm một tập permission cụ thể.
- [ ] Tài khoản `ADMIN` có toàn bộ permission và có thể quản lý tài khoản nhân viên.
- [ ] Thiết kế danh sách permission cố định trong code, tối thiểu gồm:
  - `catalog:read`, `catalog:write`
  - `inventory:read`, `inventory:write`
  - `order:read`, `order:update`
  - `coupon:manage`
  - `review:moderate`
  - `report:read`
- [ ] Lưu permission được cấp trực tiếp cho `STAFF` qua quan hệ `UserPermission`; không xây role tùy chỉnh hoặc bảng role-permission động.
- [ ] Tạo middleware `requirePermission(...)` để bảo vệ từng admin/staff API theo permission thay vì kiểm tra tên role trong controller.
- [ ] Quy ước `ADMIN` bypass permission check; `STAFF` phải có permission tương ứng; `CUSTOMER` không được gọi API quản trị.
- [ ] Chỉ `ADMIN` được tạo/vô hiệu hóa staff và thay đổi permission của staff.
- [ ] Không cho vô hiệu hóa hoặc hạ quyền tài khoản `ADMIN` cuối cùng.
- [ ] Ghi audit log khi tạo/vô hiệu hóa staff, đổi permission và thực hiện thao tác quản trị nhạy cảm.
- [ ] Khi staff bị vô hiệu hóa hoặc đổi quyền, thu hồi refresh token; access token ngắn hạn có thể còn hiệu lực tối đa 15 phút ở phiên bản đầu.
- [ ] Rate limit riêng cho register, login và refresh.
- [ ] Xem/cập nhật hồ sơ cá nhân.
- [ ] CRUD nhiều địa chỉ giao hàng; chỉ một địa chỉ mặc định.
- [ ] Seed hoặc script tạo admin, không có admin password hard-code.

Acceptance criteria:

- User không truy cập được tài nguyên của user khác.
- Staff chỉ gọi được endpoint có permission đã cấp; quyền được kiểm tra ở backend, không phụ thuộc giao diện.
- API phân biệt `401 Unauthorized` khi chưa xác thực và `403 Forbidden` khi thiếu quyền.
- Thay đổi permission có audit record và phiên refresh cũ không tiếp tục sử dụng được.
- Token hết hạn, đã thu hồi hoặc sai chữ ký đều bị từ chối.
- Hai request refresh đồng thời không tạo ra hai refresh token hợp lệ.
- Password và token thô không xuất hiện trong database hoặc log.

### 5.3. Catalog và media

- [ ] Thiết kế category dạng cây, brand, product, specification và image.
- [ ] Thiết kế product variant với SKU duy nhất, options, price và compare-at price.
- [ ] Product có trạng thái `DRAFT`, `ACTIVE`, `INACTIVE`.
- [ ] Product và variant đã được dùng trong order không bị hard-delete.
- [ ] Admin CRUD category, brand, product, variant và specification.
- [ ] Public API chỉ trả sản phẩm đang active.
- [ ] Danh sách sản phẩm hỗ trợ pagination, keyword, category, brand, khoảng giá, specification và sort.
- [ ] Chi tiết sản phẩm được truy cập bằng slug duy nhất.
- [ ] Thêm database index dựa trên query thực tế.
- [ ] Tạo S3 presigned upload URL cho admin.
- [ ] Chỉ lưu metadata/object key hợp lệ sau upload.
- [ ] Cache danh sách và chi tiết catalog phổ biến bằng Redis.
- [ ] Invalidate cache khi admin cập nhật dữ liệu liên quan.

Acceptance criteria:

- Filter kết hợp và pagination trả kết quả ổn định.
- SKU, slug và quan hệ catalog được bảo vệ bằng constraint.
- User thường không thể upload hoặc thay đổi catalog.
- Ứng dụng không giữ AWS access key trong source hoặc Docker image.

### 5.4. Tồn kho

- [ ] Thiết kế inventory theo variant gồm `onHand` và `reserved`.
- [ ] Thiết kế stock movement/audit ledger.
- [ ] Admin nhập, giảm và điều chỉnh tồn kho với lý do.
- [ ] Không cho `onHand`, `reserved` hoặc available stock âm.
- [ ] Reserve stock khi tạo order cần giữ hàng.
- [ ] Commit reservation khi order được xác nhận phù hợp.
- [ ] Release reservation khi payment thất bại, hết hạn hoặc order bị hủy.
- [ ] Dùng transaction và conditional update/locking để chống overselling.
- [ ] Mọi thao tác tồn kho lặp lại phải idempotent theo business event.

Acceptance criteria:

- Nhiều checkout đồng thời không thể reserve vượt available stock.
- Inventory tổng và movement ledger có thể đối chiếu.
- Retry job hoặc callback không trừ hay hoàn kho hai lần.

### 5.5. Giỏ hàng và coupon

- [ ] Một user có một active cart.
- [ ] Thêm, sửa số lượng, xóa item và xóa toàn bộ cart.
- [ ] Variant inactive hoặc hết hàng được báo rõ khi đọc/checkout cart.
- [ ] Server luôn đọc lại giá và tồn kho; không dùng total từ client.
- [ ] Coupon hỗ trợ `PERCENTAGE` và `FIXED_AMOUNT`.
- [ ] Coupon có thời gian hiệu lực, min order, max discount và usage limit.
- [ ] Theo dõi tổng usage và usage theo user.
- [ ] Tạo API preview/validate coupon nhưng vẫn validate lại trong checkout.
- [ ] Coupon usage được ghi atomically cùng order.

Acceptance criteria:

- Cart total và checkout total dùng cùng pricing logic.
- Coupon hết hạn, vượt quota hoặc không đủ điều kiện không được áp dụng.
- Hai checkout đồng thời không vượt usage limit.

### 5.6. Order và checkout

- [ ] Thiết kế order, order item, shipping address snapshot và status history.
- [ ] Order item snapshot product name, SKU, options và unit price.
- [ ] Checkout chỉ dành cho user đăng nhập.
- [ ] Checkout chạy trong transaction phù hợp: validate cart, tính giá, coupon, reserve stock và tạo order.
- [ ] Hỗ trợ payment method `COD` và `VNPAY`.
- [ ] Order state:
  - `PENDING_PAYMENT`
  - `CONFIRMED`
  - `PROCESSING`
  - `SHIPPING`
  - `DELIVERED`
  - `CANCELLED`
  - `PAYMENT_EXPIRED`
- [ ] Payment state: `PENDING`, `PAID`, `FAILED`, `EXPIRED`.
- [ ] State transition được kiểm soát bằng domain service/state machine.
- [ ] COD xác nhận order ngay sau checkout hợp lệ.
- [ ] VNPay tạo order ở trạng thái chờ thanh toán và giữ tồn kho có thời hạn.
- [ ] BullMQ job hết hạn order và giải phóng reservation.
- [ ] Khách chỉ hủy order trước khi processing.
- [ ] Admin chuyển order qua các fulfillment state hợp lệ.
- [ ] User chỉ xem và thao tác trên order của chính mình.

Acceptance criteria:

- Order lưu snapshot, không thay đổi khi catalog được chỉnh sửa sau đó.
- Không thể bỏ qua hoặc đảo ngược state trái business rule.
- Retry checkout không tạo order ngoài ý muốn nếu client gửi cùng idempotency key.
- Job hết hạn có thể chạy lại an toàn.

### 5.7. VNPay Sandbox PAY 2.1.0

- [ ] Đăng ký thông tin Sandbox và lưu `vnp_TmnCode`, `vnp_HashSecret` bằng secret configuration.
- [ ] Tạo `vnp_TxnRef` duy nhất, không trùng trong ngày.
- [ ] Tạo payment URL với tham số được sort và ký HMAC-SHA512.
- [ ] Amount lấy từ order trong database và nhân 100 khi gửi VNPay.
- [ ] Thiết lập thời điểm tạo/hết hạn theo `Asia/Ho_Chi_Minh`.
- [ ] Return URL xác minh chữ ký và chỉ trả kết quả cho client.
- [ ] Không đánh dấu thanh toán thành công chỉ dựa vào Return URL.
- [ ] IPN là nguồn server-to-server cập nhật payment/order.
- [ ] IPN kiểm tra signature, merchant, transaction reference, amount, response code và transaction status.
- [ ] Lưu payment transaction/event phục vụ audit, loại bỏ dữ liệu nhạy cảm.
- [ ] Dùng unique constraint và database transaction chống callback trùng.
- [ ] Trả đúng `RspCode` và `Message` cho trường hợp thành công, sai checksum, không tìm thấy order, sai amount và order đã xử lý.
- [ ] Xử lý callback đến sau khi order đã hết hạn theo policy rõ ràng và có audit.
- [ ] Public IPN sử dụng hostname HTTPS hợp lệ.

Acceptance criteria:

- Callback giả mạo hoặc bị sửa tham số không thay đổi database.
- Callback trùng chỉ tạo một lần chuyển trạng thái hợp lệ.
- Return thành công nhưng IPN thất bại không làm order thành `PAID`.
- Payment thành công atomically cập nhật payment, order và stock reservation.

Tài liệu tham chiếu: [VNPay Sandbox PAY](https://sandbox.vnpayment.vn/apis/docs/thanh-toan-pay/pay.html).

### 5.8. Review và admin/staff reporting

- [ ] User chỉ review sản phẩm từ order `DELIVERED`.
- [ ] Mỗi order item chỉ được review một lần.
- [ ] Hỗ trợ rating, nội dung và trạng thái hiển thị.
- [ ] Admin hoặc staff có `review:moderate` có thể ẩn review vi phạm và lưu lý do.
- [ ] Admin hoặc staff có `report:read` xem doanh thu, số order và sản phẩm bán chạy theo khoảng thời gian.
- [ ] Chỉ tính doanh thu từ trạng thái được định nghĩa là hoàn tất.

Acceptance criteria:

- Không thể review sản phẩm chưa mua hoặc order chưa giao.
- Aggregate report có test đối chiếu với dữ liệu order mẫu.

### 5.9. OpenAPI và tài liệu vận hành

- [ ] Setup sẵn OpenAPI document và Swagger UI tại `/docs` từ giai đoạn nền tảng.
- [ ] Sau khi các API đã hoàn thành và ổn định, mô tả toàn bộ endpoint, schema, authentication và error codes.
- [ ] Mô tả pagination, filter, sort và các enum trạng thái.
- [ ] Thêm ví dụ request/response cho checkout và VNPay.
- [ ] Viết README hướng dẫn local setup, migration, seed, test và Docker.
- [ ] Viết runbook deploy, rollback, backup, restore và troubleshooting.
- [ ] Cung cấp `.env.example` không chứa secret.

## 6. API contract chính

Các endpoint có thể tinh chỉnh trong lúc thiết kế chi tiết nhưng phải giữ ranh giới module:

```text
POST   /api/v1/auth/register
POST   /api/v1/auth/login
POST   /api/v1/auth/refresh
POST   /api/v1/auth/logout

GET    /api/v1/users/me
PATCH  /api/v1/users/me
GET    /api/v1/users/me/addresses
POST   /api/v1/users/me/addresses

GET    /api/v1/products
GET    /api/v1/products/:slug
GET    /api/v1/categories
GET    /api/v1/brands

GET    /api/v1/cart
POST   /api/v1/cart/items
PATCH  /api/v1/cart/items/:itemId
DELETE /api/v1/cart/items/:itemId
POST   /api/v1/coupons/validate

POST   /api/v1/checkout
GET    /api/v1/orders
GET    /api/v1/orders/:id
POST   /api/v1/orders/:id/cancel

POST   /api/v1/payments/vnpay/create
GET    /api/v1/payments/vnpay/return
GET    /api/v1/payments/vnpay/ipn

GET    /api/v1/products/:productId/reviews
POST   /api/v1/products/:productId/reviews

...    /api/v1/admin/products
...    /api/v1/admin/variants
...    /api/v1/admin/inventory
...    /api/v1/admin/coupons
...    /api/v1/admin/orders
POST   /api/v1/admin/uploads/presign
GET    /api/v1/admin/staff
POST   /api/v1/admin/staff
PATCH  /api/v1/admin/staff/:id
PUT    /api/v1/admin/staff/:id/permissions
```

Prefix `/admin` biểu thị nhóm API vận hành, không có nghĩa chỉ role `ADMIN` được gọi. `STAFF` được gọi từng endpoint khi có permission tương ứng; riêng API quản lý staff chỉ dành cho `ADMIN`.

## 7. Test plan

### Unit tests

- Pricing, discount và coupon eligibility.
- Order/payment state machine.
- Inventory reservation rules.
- JWT và refresh-token rotation/reuse detection.
- VNPay parameter sorting, signing và signature verification.
- Job idempotency và expiration rules.

### Integration tests

- Repository và Prisma constraints.
- Checkout transaction, stock concurrency và coupon usage concurrency.
- Cache invalidation.
- Order expiration và stock release.
- Payment event deduplication.
- PostgreSQL và Redis chạy bằng test containers/service containers.

### End-to-end tests

- Register -> login -> cart -> COD checkout -> fulfillment -> review.
- Register -> cart -> VNPay checkout -> valid IPN -> paid order.
- User không xem/sửa dữ liệu của user khác.
- Admin/staff authorization, permission enforcement và catalog/order operations.

### Security và failure tests

- Missing, expired, revoked hoặc malformed token.
- Sai role, thiếu permission, staff bị vô hiệu hóa, invalid schema, oversized body và rate limit.
- Staff có nhiều permission, bị thu hồi permission và không thể tự nâng quyền.
- VNPay: sai signature, sai amount, callback trùng, order hết hạn và callback sai thứ tự.
- PostgreSQL/Redis tạm mất kết nối và readiness phản ánh đúng trạng thái.
- Nhiều request mua SKU cuối cùng không làm tồn kho âm.

Mục tiêu coverage tối thiểu 80% cho auth, inventory, coupon, order và payment. Coverage không thay thế các test case theo business risk.

## 8. CI/CD và AWS

### Continuous Integration

- [ ] Trigger trên pull request và push phù hợp.
- [ ] Chạy `npm ci`, lint, typecheck, Prisma validation, test và build.
- [ ] Dùng PostgreSQL và Redis service containers.
- [ ] Cache npm hợp lý nhưng không cache secret hoặc build không tin cậy.
- [ ] Không cho CD chạy nếu CI thất bại.

### Continuous Deployment

- [ ] Trigger sau khi code vào `main` và CI thành công.
- [ ] Build Docker image nhiều stage.
- [ ] Scan dependency/image ở mức cơ bản.
- [ ] Tag image bằng commit SHA và push lên GHCR.
- [ ] Chỉ cho một production deployment chạy tại một thời điểm.
- [ ] SSH vào EC2 bằng deploy credential có phạm vi tối thiểu.
- [ ] Pull image, chạy `prisma migrate deploy`, cập nhật Compose và kiểm tra `/health/ready`.
- [ ] Giữ tag trước để rollback application.
- [ ] Không tự động deploy migration phá vỡ tương thích; dùng expand/migrate/contract khi cần.

### AWS deployment

- [ ] Tạo AWS Budget và cảnh báo chi phí trước các resource khác.
- [ ] Chọn EC2 được console đánh dấu Free Tier eligible; ưu tiên `t3.small` nếu credit/eligibility cho phép.
- [ ] Chạy Caddy, API, worker, PostgreSQL và Redis bằng Docker Compose.
- [ ] Chỉ public port `80/443`; giới hạn SSH theo IP quản trị.
- [ ] Không public PostgreSQL hoặc Redis.
- [ ] Trỏ hostname miễn phí tới EC2 và để Caddy cấp HTTPS.
- [ ] Gắn EC2 IAM role chỉ có quyền cần thiết trên đúng S3 bucket.
- [ ] Cấu hình health check, restart policy, resource limit và log rotation.
- [ ] Lưu production secret trong file quyền hạn chế hoặc secret mechanism phù hợp; không bake vào image.
- [ ] Backup PostgreSQL hằng ngày bằng `pg_dump` lên private S3 và giữ bảy bản.
- [ ] Thử restore backup thay vì chỉ kiểm tra file tồn tại.
- [ ] Viết checklist teardown để tránh resource tiếp tục phát sinh phí.

AWS Free Tier và danh sách instance đủ điều kiện có thể thay đổi theo tài khoản và thời điểm. Luôn kiểm tra console và [AWS Free Tier](https://aws.amazon.com/free/free-tier-faqs/) trước khi tạo resource; không xem “Free Tier” là miễn phí vĩnh viễn.

## 9. Definition of Done cho mỗi chức năng

Một chức năng chỉ được đánh dấu hoàn thành khi:

- Business behavior và quyền truy cập đã rõ ràng.
- Schema/migration và constraint cần thiết đã có.
- Happy path và failure paths được xử lý.
- Input được validate, lỗi trả đúng contract.
- Unit/integration/E2E test phù hợp đã pass.
- Race condition và retry/idempotency đã được xem xét.
- OpenAPI đã được cập nhật ở giai đoạn hoàn thiện tài liệu cuối dự án; trước đó Zod schema phải được giữ có thể tái sử dụng.
- Không log hoặc commit secret.
- Lint, typecheck, test và build đều pass.
- Code đã được review và các finding quan trọng đã xử lý.

## 10. Ngoài phạm vi

- Frontend web/mobile.
- Role tùy chỉnh, permission do admin tự định nghĩa, permission `DENY`, ABAC/policy engine và phân quyền theo từng bản ghi ngoài ownership cơ bản.
- Marketplace nhiều người bán.
- Microservices, event streaming hoặc Kubernetes.
- Recommendation engine, chat và search engine chuyên dụng.
- Tích hợp hãng giao vận thật hoặc hóa đơn điện tử.
- VNPay production, refund online và quy trình đổi trả phức tạp.
- Password reset/email thật trong phiên bản đầu.
- Data warehouse hoặc dashboard phân tích chuyên sâu.

Phí vận chuyển dùng rule nội bộ đơn giản, chẳng hạn phí cố định và miễn phí theo ngưỡng.
