# ADR-0001: Sử dụng modular monolith và phân tầng theo trách nhiệm

- Status: Accepted
- Date: 2026-08-18
- Owners: Project maintainers
- Supersedes: None
- Superseded by: None
- Implementation status: In progress

## Context

Dự án cần bao phủ nhiều domain backend như auth, catalog, inventory, cart, coupon, order, payment và review. Các domain có nhiều transaction và invariant dùng chung, đặc biệt trong checkout. Tuy nhiên, phạm vi hiện tại không yêu cầu khả năng scale hoặc deploy độc lập từng domain.

Tách microservice sớm sẽ thêm network boundary, distributed transaction, service discovery, observability và deployment complexity nhưng chưa mang lại lợi ích tương ứng. Ngược lại, tổ chức toàn bộ code theo layer kỹ thuật toàn cục dễ khiến business logic của các module phụ thuộc lẫn nhau và khó tách về sau.

## Decision

Ứng dụng được xây dựng dưới dạng **modular monolith**: một deployable application và một PostgreSQL database, nhưng source code được chia theo business module.

Luồng phụ thuộc chuẩn trong mỗi request là:

```text
route -> middleware -> controller -> service/use case -> repository -> database
```

Trách nhiệm chính:

- `route`: khai báo endpoint và ghép middleware.
- `middleware`: xử lý concern ở HTTP boundary như authentication, authorization và validation.
- `controller`: chuyển HTTP input thành lời gọi use case và tạo HTTP response; không chứa business rule hoặc transaction phức tạp.
- `service/use case`: giữ business rule, orchestration và transaction boundary.
- `repository`: cô lập data access khi sự tách lớp mang lại giá trị rõ ràng; không che giấu business rule trong query helper.
- `services`: adapter tích hợp hệ thống ngoài như VNPay, S3 hoặc email.
- `jobs`: producer/processor của background job; handler phải gọi lại use case idempotent thay vì sao chép business logic.

Module không truy cập trực tiếp controller hoặc chi tiết nội bộ của module khác. Giao tiếp qua public service/use case, shared contract có chủ đích hoặc orchestration service thuộc module sở hữu workflow.

Một database được chia sẻ, nhưng mỗi bảng có một module sở hữu việc thay đổi dữ liệu. Query đọc chéo module chỉ được dùng khi ownership và coupling đã được cân nhắc rõ.

## Invariants

- Business rule không nằm trong controller, route hoặc middleware.
- Transaction bao trọn một business operation phải được điều phối tại service/use-case boundary.
- HTTP concern không rò vào domain logic thuần.
- Shared code chỉ chứa thành phần thật sự dùng chung, không trở thành nơi chứa code không xác định owner.
- Không tách microservice nếu chưa có quyết định kiến trúc mới và cập nhật phạm vi dự án.
- Background job và callback dùng cùng business invariant với synchronous request.

## Consequences

### Positive

- Transaction giữa cart, coupon, inventory, order và payment có thể dùng atomic database transaction.
- Local development, integration test và deployment đơn giản hơn distributed system.
- Boundary theo module giúp code dễ tìm, dễ review và có đường tách service trong tương lai nếu thật sự cần.
- Một codebase giúp tái sử dụng type và validation contract mà không cần package distribution.

### Negative and trade-offs

- Boundary module không được process hoặc network cưỡng chế; code review và dependency discipline phải bảo vệ boundary.
- Một lỗi hoặc deployment có thể ảnh hưởng toàn ứng dụng.
- Query chéo module thuận tiện dễ tạo coupling nếu không xác định data ownership.
- Repository abstraction không bắt buộc cho mọi query; áp dụng máy móc có thể tạo lớp chuyển tiếp không có giá trị.

## Alternatives considered

### Microservices theo domain

Chưa chọn vì làm tăng mạnh độ phức tạp vận hành và consistency trong khi dự án chỉ cần một deployment nhỏ.

### Layered monolith toàn cục

Chưa chọn vì các thư mục controller/service/repository toàn cục sẽ phình lớn và làm mờ business boundary.

### CRUD trực tiếp trong controller

Không chọn vì transaction, authorization và business invariant sẽ bị phân tán, khó tái sử dụng trong job và khó test độc lập với HTTP.

## Verification

- Review dependency direction khi thêm module hoặc workflow chéo module.
- Unit test service/use case mà không cần Express request khi logic là thuần.
- Integration test transaction bằng PostgreSQL thật cho các workflow có nhiều write.
- Kiểm tra controller không gọi Prisma transaction hoặc chứa state transition.
- Build và TypeScript strict phải pass để phát hiện contract mismatch giữa các layer.

## References

- `PROJECT_PLAN.md`, mục “Kiến trúc ứng dụng”.
- `src/modules/` cho module code.
- `src/app.ts` và `src/server.ts` cho application/composition boundary.
