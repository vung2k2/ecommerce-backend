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
- Response hỗ trợ `Accept-Language: en|vi`, mặc định `en`; HTTP status, `error.code` và JSON contract không thay đổi theo locale, chỉ message dành cho người dùng được dịch tại HTTP boundary.
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
- [x] Tạo Dockerfile nhiều stage và Docker Compose cho local.
- [x] Chuẩn hóa success response, error response và pagination metadata.
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
- [x] Tài khoản `CUSTOMER` sử dụng các API mua hàng và chỉ thao tác trên tài nguyên của chính mình.
- [x] Tài khoản `STAFF` vẫn sử dụng được chức năng khách hàng và được cấp thêm một tập permission cụ thể.
- [x] Tài khoản `ADMIN` có toàn bộ permission và có thể quản lý tài khoản nhân viên.
- [x] Thiết kế danh sách permission cố định trong code, tối thiểu gồm:
  - `catalog:read`, `catalog:write`
  - `inventory:read`, `inventory:write`
  - `order:read`, `order:update`
  - `coupon:manage`
  - `review:moderate`
  - `report:read`
- [x] Lưu permission được cấp trực tiếp cho `STAFF` qua quan hệ `UserPermission`; không xây role tùy chỉnh hoặc bảng role-permission động.
- [x] Tạo middleware `requirePermission(...)` để bảo vệ từng admin/staff API theo permission thay vì kiểm tra tên role trong controller.
- [x] Quy ước `ADMIN` bypass permission check; `STAFF` phải có permission tương ứng; `CUSTOMER` không được gọi API quản trị.
- [x] Chỉ `ADMIN` được tạo/vô hiệu hóa staff và thay đổi permission của staff.
- [x] Không cho vô hiệu hóa hoặc hạ quyền tài khoản `ADMIN` cuối cùng.
- [x] Ghi audit log khi tạo/vô hiệu hóa staff, đổi permission và thực hiện thao tác quản trị nhạy cảm.
- [x] Khi staff bị vô hiệu hóa hoặc đổi quyền, thu hồi refresh token; access token ngắn hạn có thể còn hiệu lực tối đa 15 phút ở phiên bản đầu.
- [x] Rate limit riêng cho register, login và refresh.
- [x] Xem/cập nhật hồ sơ cá nhân.
- [x] CRUD nhiều địa chỉ giao hàng; chỉ một địa chỉ mặc định.
- [x] Seed hoặc script tạo admin, không có admin password hard-code.

Acceptance criteria:

- User không truy cập hoặc sửa đổi được tài nguyên của user khác (profile, address, order).
- Cập nhật profile (`PATCH /users/me`) không cho phép sửa `role`, `isActive` hay ownership qua payload.
- Mỗi user có tối đa một địa chỉ mặc định (`isDefault = true`), kể cả khi tạo/sửa/set-default đồng thời (được bảo vệ bởi PostgreSQL Partial Unique Index).
- Staff chỉ gọi được endpoint có permission đã cấp; quyền được kiểm tra ở backend qua middleware, không phụ thuộc giao diện; `ADMIN` bypass permission check; `CUSTOMER` bị từ chối 403 trên toàn bộ `/admin`.
- API phân biệt rõ `401 Unauthorized` khi chưa xác thực và `403 Forbidden` khi thiếu quyền.
- Không thể vô hiệu hóa hoặc hạ quyền tài khoản `ADMIN` cuối cùng, kể cả khi có 2 request đồng thời.
- Staff không thể tự cấp permission hoặc thao tác quản trị trên staff khác.
- Thay đổi permission hoặc vô hiệu hóa staff có audit log và thu hồi refresh token của staff đó ngay lập tức.
- Token hết hạn, đã thu hồi hoặc sai chữ ký đều bị từ chối.
- Hai request refresh đồng thời không tạo ra hai refresh token hợp lệ (chống race condition).
- Refresh-token reuse phát hiện và thu hồi toàn bộ token family liên quan.
- Rate limiting cho register, login và refresh trả về `429 Too Many Requests` khi vượt ngưỡng.
- Password và token thô không bao giờ xuất hiện trong database hoặc log.

### 5.3. Catalog và media

- [x] Thiết kế category dạng cây, brand, product, specification và image.
- [x] Thiết kế product variant với SKU duy nhất, options, price và compare-at price.
- [x] Product có trạng thái `DRAFT`, `ACTIVE`, `INACTIVE`.
- [ ] Product và variant đã được dùng trong order không bị hard-delete. (Sẽ hoàn thiện ở mục 5.7 Orders & Checkout)
- [x] Admin CRUD category, brand, product, variant và specification.
- [x] Public API chỉ trả sản phẩm đang active.
- [x] Danh sách sản phẩm hỗ trợ pagination, keyword, category, brand, khoảng giá, specification và sort.
- [x] Chi tiết sản phẩm được truy cập bằng slug duy nhất.
- [x] Thêm database index dựa trên query thực tế.
- [x] Nhận ảnh qua multipart API tại đúng domain, validate tại backend và lưu tạm trong thư mục `temp/` trước khi promote.
- [x] Chỉ lưu URL/object key do backend tạo sau khi upload hợp lệ.
- [x] Cấu hình S3 lifecycle tự xóa object chưa commit trong `temp/` sau một ngày.
- [ ] Cache danh sách và chi tiết catalog phổ biến bằng Redis.
- [ ] Invalidate cache khi admin cập nhật dữ liệu liên quan.

Acceptance criteria:

- Public API chỉ trả sản phẩm đang ở trạng thái `ACTIVE`; không trả sản phẩm `DRAFT` hoặc `INACTIVE`.
- Product và variant đã từng xuất hiện trong đơn hàng (`Order`) không bị hard-delete khỏi database (chỉ chuyển sang `INACTIVE`).
- Filter kết hợp (keyword, category, brand, price range, specification) và pagination trả kết quả chính xác, ổn định.
- SKU, slug và quan hệ catalog được bảo vệ bằng database unique constraint.
- User thường không thể upload hoặc thay đổi catalog (yêu cầu permission `catalog:write`).
- Cache Redis cho catalog tự động invalidate khi admin/staff cập nhật dữ liệu liên quan và không trả dữ liệu cũ.
- Ứng dụng không giữ AWS access key trong source code hoặc Docker image; production dùng EC2 IAM role với quyền S3 tối thiểu.

### 5.4. Tồn kho

- [x] Thiết kế inventory theo variant gồm `onHand` và `reserved`.
- [x] Thiết kế stock movement/audit ledger.
- [x] Admin nhập, giảm và điều chỉnh tồn kho với lý do.
- [x] Không cho `onHand`, `reserved` hoặc available stock âm.
- [ ] Reserve stock khi tạo order cần giữ hàng.
- [ ] Commit reservation khi order được xác nhận phù hợp.
- [ ] Release reservation khi payment thất bại, hết hạn hoặc order bị hủy.
- [x] Dùng transaction và conditional update/locking để chống overselling.
- [x] Mọi thao tác tồn kho lặp lại phải idempotent theo business event.

Acceptance criteria:

- Nhiều checkout đồng thời không thể reserve vượt available stock (`onHand - reserved`); tồn kho không bao giờ bị âm ở cả application và database (sử dụng conditional update / locking).
- Mọi thao tác nhập, giảm, điều chỉnh tồn kho đều ghi lại stock movement/audit ledger tương ứng.
- Retry job hoặc callback không trừ hay hoàn kho hai lần (idempotency theo business event).
- Release reservation hoàn trả đúng số lượng giữ hàng khi thanh toán thất bại, hết hạn hoặc đơn hàng bị hủy.
- Inventory tổng và movement ledger luôn đối chiếu khớp nhau.

### 5.5. Giỏ hàng và coupon

- [x] Một user có một active cart.
- [x] Thêm, sửa số lượng, xóa item và xóa toàn bộ cart.
- [x] Variant inactive hoặc hết hàng được báo rõ khi đọc/checkout cart.
- [x] Server luôn đọc lại giá và tồn kho; không dùng total từ client.
- [x] Coupon hỗ trợ `PERCENTAGE` và `FIXED_AMOUNT`.
- [x] Coupon có thời gian hiệu lực, min order, max discount và usage limit.
- [x] Theo dõi tổng usage và usage theo user.
- [x] Tạo API preview/validate coupon nhưng vẫn validate lại trong checkout.
- [ ] Coupon usage được ghi atomically cùng order.

Acceptance criteria:

- Mỗi user chỉ có đúng một active cart tại một thời điểm.
- Cart total và checkout total luôn được tính lại từ database (giá variant và tồn kho hiện tại); server không tin total do client gửi.
- Variant inactive hoặc hết hàng được cảnh báo rõ ràng khi xem và chặn checkout.
- Coupon hết hạn, vượt quota tổng, vượt quota user hoặc không đủ điều kiện đơn hàng tối thiểu không được áp dụng.
- Hai checkout đồng thời dùng cùng coupon không thể vượt quá usage limit của coupon.
- Coupon usage và tạo đơn hàng được ghi atomically trong cùng transaction.

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

- Order lưu snapshot đầy đủ (tên sản phẩm, SKU, options, đơn giá, địa chỉ giao hàng), không bị thay đổi khi catalog chỉnh sửa sau này.
- Checkout (validate cart, tính giá, áp coupon, reserve stock, tạo order) thực thi atomically trong một database transaction.
- COD tạo đơn ở trạng thái `CONFIRMED`; VNPay tạo đơn ở trạng thái `PENDING_PAYMENT` và giữ tồn kho có thời hạn.
- State machine kiểm soát chặt chẽ: không thể nhảy cóc hoặc đảo ngược trạng thái đơn hàng trái business rules.
- User chỉ xem và thao tác trên đơn hàng của chính mình; khách hàng chỉ được hủy đơn trước khi đơn chuyển sang `PROCESSING`.
- Chỉ các trạng thái hợp lệ mới được hủy; retry cancel đơn hàng không hoàn kho 2 lần.
- BullMQ job xử lý đơn hàng hết hạn thanh toán an toàn, tự động hủy đơn và giải phóng stock reservation.

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

- Callback giả mạo, sai signature, sai merchant, sai transaction reference hoặc sai amount đều trả đúng `RspCode` và không thay đổi database.
- Amount gửi VNPay được nhân 100 theo contract; timestamp tạo/hết hạn tuân thủ timezone `Asia/Ho_Chi_Minh`.
- Return URL chỉ hiển thị kết quả cho người dùng; chỉ IPN hợp lệ mới là nguồn server-to-server xác nhận thanh toán.
- IPN trùng lặp được xử lý idempotent (dùng unique constraint & transaction), không cập nhật đơn hàng lần 2.
- IPN thành công cập nhật atomically: payment `PAID`, order `CONFIRMED`, và commit stock reservation.
- IPN hợp lệ gửi đến sau khi order đã bị hủy/hết hạn được xử lý theo policy rõ ràng (ghi nhận audit record phục vụ đối soát, không đảo ngược đơn hàng sai luật).
- Dữ liệu audit log không chứa hash secret hoặc thông tin thẻ nhạy cảm.

Tài liệu tham chiếu: [VNPay Sandbox PAY](https://sandbox.vnpayment.vn/apis/docs/thanh-toan-pay/pay.html).

### 5.8. Review và admin/staff reporting

- [ ] User chỉ review sản phẩm từ order `DELIVERED`.
- [ ] Mỗi order item chỉ được review một lần.
- [ ] Hỗ trợ rating, nội dung và trạng thái hiển thị.
- [ ] Admin hoặc staff có `review:moderate` có thể ẩn review vi phạm và lưu lý do.
- [ ] Admin hoặc staff có `report:read` xem doanh thu, số order và sản phẩm bán chạy theo khoảng thời gian.
- [ ] Chỉ tính doanh thu từ trạng thái được định nghĩa là hoàn tất.

Acceptance criteria:

- Không thể review sản phẩm chưa mua hoặc đơn hàng chưa ở trạng thái `DELIVERED`.
- Mỗi order item chỉ được review tối đa một lần; hai request review đồng thời cho cùng order item không tạo 2 bản ghi.
- Rating (1-5 sao) và nội dung bình luận được validate độ dài và kiểu dữ liệu chặt chẽ.
- Chỉ ADMIN hoặc STAFF có permission `review:moderate` mới có quyền ẩn review vi phạm và lưu lý do kiểm duyệt.
- Báo cáo doanh thu và sản phẩm bán chạy (`report:read`) chỉ tính từ các đơn hàng ở trạng thái hoàn tất (`DELIVERED`), với khoảng thời gian và timezone rõ ràng, không tính trùng lặp.

### 5.9. OpenAPI và tài liệu vận hành

- [x] Setup sẵn OpenAPI document và Swagger UI tại `/docs` sử dụng `@asteasolutions/zod-to-openapi` làm tiêu chuẩn định nghĩa OpenAPI (Single Source of Truth).
- [ ] Khi xây dựng xong API nào, mô tả ngay endpoint, schema, authentication và error codes của API đó thông qua Registry và Zod Schema.
- [ ] Mô tả pagination, filter, sort và các enum trạng thái.
- [ ] Thêm ví dụ request/response cho checkout và VNPay.
- [ ] Viết README hướng dẫn local setup, migration, seed, test và Docker.
- [ ] Viết runbook deploy, rollback, backup, restore và troubleshooting.
- [ ] Cung cấp `.env.example` không chứa secret.

Acceptance criteria:

- OpenAPI document tại `/docs` khởi tạo và validate thành công, mô tả đầy đủ toàn bộ endpoint thực tế.
- OpenAPI mô tả tập trung các lỗi chung từ HTTP/middleware (`401`, `403`, `404`, `422`, `429`, `500`); mỗi endpoint chỉ khai báo thêm HTTP status và `error.code` của lỗi nghiệp vụ đặc trưng.
- OpenAPI mô tả `Accept-Language`, locale mặc định, fallback và nguyên tắc giữ ổn định `error.code` giữa tiếng Anh và tiếng Việt.
- README hướng dẫn đầy đủ, một developer mới có thể chạy migration, seed, test và khởi chạy local stack mà không gặp lỗi.
- Quy trình rollback và khôi phục database backup đã được chạy thử nghiệm thực tế.
- File `.env.example` cung cấp đủ toàn bộ biến môi trường cần thiết mà không chứa secret thật.

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
POST   /api/v1/admin/products/:productId/variants
PATCH  /api/v1/admin/variants/:id
DELETE /api/v1/admin/variants/:id
POST   /api/v1/admin/products/:productId/images
PATCH  /api/v1/admin/images/:id
DELETE /api/v1/admin/images/:id
POST   /api/v1/admin/products/:productId/specifications
PATCH  /api/v1/admin/specifications/:id
DELETE /api/v1/admin/specifications/:id
...    /api/v1/admin/inventory
...    /api/v1/admin/coupons
...    /api/v1/admin/orders
PUT    /api/v1/users/me/avatar
DELETE /api/v1/users/me/avatar
PUT    /api/v1/admin/brands/:brandId/logo
DELETE /api/v1/admin/brands/:brandId/logo
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

- [x] Trigger trên pull request và push phù hợp.
- [x] Chạy `npm ci`, lint, typecheck, Prisma validation, test và build.
- [x] Dùng PostgreSQL và Redis service containers.
- [x] Cache npm hợp lý nhưng không cache secret hoặc build không tin cậy.
- [x] Không cho CD chạy nếu CI thất bại.

### Continuous Deployment

- [x] Trigger sau khi code vào `main` và CI thành công.
- [x] Build Docker image nhiều stage.
- [ ] Scan dependency/image ở mức cơ bản.
- [x] Tag image bằng commit SHA và push lên GHCR.
- [x] Chỉ cho một production deployment chạy tại một thời điểm.
- [x] SSH vào EC2 bằng deploy credential có phạm vi tối thiểu.
- [x] Pull image, chạy `prisma migrate deploy`, cập nhật Compose và kiểm tra `/health/ready`.
- [ ] Giữ tag trước để rollback application.
- [ ] Không tự động deploy migration phá vỡ tương thích; dùng expand/migrate/contract khi cần.

### AWS deployment

- [x] Tạo AWS Budget và cảnh báo chi phí trước các resource khác.
- [x] Chọn EC2 được console đánh dấu Free Tier eligible; ưu tiên `t3.small` nếu credit/eligibility cho phép.
- [x] Chạy Caddy, API, worker, PostgreSQL và Redis bằng Docker Compose.
- [x] Chỉ public port `80/443`; giới hạn SSH theo IP quản trị.
- [x] Không public PostgreSQL hoặc Redis.
- [ ] Trỏ hostname miễn phí tới EC2 và để Caddy cấp HTTPS.
- [ ] Gắn EC2 IAM role chỉ có quyền cần thiết trên đúng S3 bucket.
- [x] Cấu hình health check, restart policy, resource limit và log rotation.
- [x] Lưu production secret trong file quyền hạn chế hoặc secret mechanism phù hợp; không bake vào image.
- [ ] Backup PostgreSQL hằng ngày bằng `pg_dump` lên private S3 và giữ bảy bản.
- [ ] Thử restore backup thay vì chỉ kiểm tra file tồn tại.
- [ ] Viết checklist teardown để tránh resource tiếp tục phát sinh phí.

Acceptance criteria:

- CI chạy tự động trên pull request và push vào `main`; tự động chặn merge nếu lint, typecheck, Prisma validation, test hoặc build thất bại.
- Docker image được build nhiều stage, tag bằng commit SHA và push an toàn lên GitHub Container Registry (GHCR).
- CD deploy lên EC2 tự động chạy migration an toàn, khởi động container và xác nhận endpoint `/health/ready` trả về HTTP 200 trước khi hoàn tất.
- Quy trình rollback application về image tag trước đó và khôi phục database từ file backup S3 được kiểm chứng hoạt động.
- Secret được quản lý an toàn trên server/GitHub Actions, không bị bake vào image hoặc in ra log.

AWS Free Tier và danh sách instance đủ điều kiện có thể thay đổi theo tài khoản và thời điểm. Luôn kiểm tra console và [AWS Free Tier](https://aws.amazon.com/free/free-tier-faqs/) trước khi tạo resource; không xem “Free Tier” là miễn phí vĩnh viễn.

## 9. Definition of Done cho mỗi chức năng

Một chức năng chỉ được đánh dấu hoàn thành khi:

- Business behavior và quyền truy cập đã rõ ràng.
- Schema/migration và constraint cần thiết đã có.
- Happy path và failure paths được xử lý.
- Input được validate, lỗi trả đúng contract.
- Unit/integration/E2E test phù hợp đã pass.
- Race condition và retry/idempotency đã được xem xét.
- OpenAPI đã được định nghĩa thông qua Zod schema và Route Registry tương ứng.
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
