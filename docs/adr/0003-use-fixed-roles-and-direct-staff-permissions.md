# ADR-0003: Dùng role cố định và cấp permission trực tiếp cho staff

- Status: Accepted
- Date: 2026-08-18
- Owners: Project maintainers
- Supersedes: None
- Superseded by: None
- Implementation status: Not started

## Context

Hệ thống cần phân biệt khách hàng, nhân viên vận hành và quản trị viên. `STAFF` cần được giới hạn theo nhiệm vụ cụ thể, trong khi `ADMIN` cần quản lý staff. Dự án không cần custom role, permission hierarchy, deny rule hoặc policy engine.

Chỉ dùng role `STAFF` chung cho mọi API quản trị sẽ cấp quyền quá rộng. Ngược lại, xây role-permission động tạo thêm UI quản trị, conflict rule, migration và audit complexity vượt quá phạm vi.

## Decision

Hệ thống có đúng ba role cố định:

- `CUSTOMER`: sử dụng API mua hàng và chỉ thao tác tài nguyên thuộc ownership của mình.
- `STAFF`: có toàn bộ khả năng customer và có thể gọi API vận hành khi được cấp permission tương ứng.
- `ADMIN`: có toàn bộ permission và độc quyền quản lý tài khoản/permission của staff.

Permission là danh sách cố định trong code, tối thiểu gồm:

```text
catalog:read
catalog:write
inventory:read
inventory:write
order:read
order:update
coupon:manage
review:moderate
report:read
```

Permission được cấp trực tiếp cho `STAFF` qua quan hệ `UserPermission`. Không có bảng custom role hoặc role-permission động.

API vận hành dùng middleware `requirePermission(...)` tại route boundary. `ADMIN` bypass permission check, `STAFF` phải có permission và `CUSTOMER` luôn bị từ chối. Controller không tự kiểm tra tên role.

Ownership của customer là kiểm tra bổ sung, không thể thay bằng role hoặc permission. Repository/service phải scope query theo authenticated user khi đọc hoặc sửa tài nguyên cá nhân.

## Invariants

- Chỉ tồn tại `CUSTOMER`, `STAFF`, `ADMIN`.
- Permission identifier đến từ allowlist trong code, không nhận tên tùy ý từ client.
- Chỉ `ADMIN` được tạo, vô hiệu hóa staff hoặc thay đổi staff permissions.
- Không thể vô hiệu hóa hoặc hạ quyền `ADMIN` cuối cùng.
- Staff không thể tự cấp quyền, sửa role hoặc sửa permission của chính mình qua API customer.
- Thao tác quản trị nhạy cảm tạo audit record với actor, action, target, timestamp và metadata đã lọc secret.
- Khi staff bị vô hiệu hóa hoặc đổi permission, mọi refresh token của staff bị thu hồi trong cùng business operation.
- Access token hiện tại có thể giữ claim cũ tối đa bằng TTL ngắn đã chấp nhận; endpoint nhạy cảm có thể yêu cầu kiểm tra trạng thái hiện tại từ database nếu threat model thay đổi.
- `401` dành cho chưa/không xác thực; `403` dành cho đã xác thực nhưng không đủ quyền.

## Authorization flow

```text
authenticate access token
  -> load/validate authenticated identity as required
  -> requirePermission(permission)
  -> enforce resource ownership or domain-specific scope
  -> execute use case
```

Prefix `/admin` chỉ nhóm API vận hành; nó không có nghĩa chỉ role `ADMIN` được gọi. Quyền thực tế đến từ middleware và các rule độc quyền quản lý staff.

## Consequences

### Positive

- Dễ audit và test vì tập role/permission hữu hạn.
- Staff nhận least privilege mà không cần policy engine.
- Authorization được thực thi nhất quán tại route boundary thay vì rải trong controller.
- Schema và API quản trị đơn giản hơn custom RBAC.

### Negative and trade-offs

- Thêm permission mới cần code change và deployment.
- Cấp permission trực tiếp có thể lặp lại cùng tập quyền giữa nhiều staff.
- Access token ngắn hạn có thể còn claim cũ sau khi permission thay đổi; đây là consistency window được chấp nhận ở phiên bản đầu.
- Các rule ownership vẫn cần thiết kế riêng theo từng domain.

## Alternatives considered

### Chỉ dùng ba role, không có permission

Không chọn vì mọi staff sẽ có quyền quá rộng.

### Custom roles và role-permission tables

Chưa chọn vì tăng scope và không có yêu cầu tạo nhóm quyền động.

### ABAC hoặc policy engine

Chưa chọn vì complexity không tương xứng; ownership và permission cố định đã đáp ứng nhu cầu hiện tại.

### Kiểm tra role trực tiếp trong controller

Không chọn vì dễ bỏ sót endpoint, khó test tập trung và làm controller chứa authorization policy.

## Verification

- Unit test truth table cho từng tổ hợp role/permission.
- Integration/E2E test `401` so với `403`.
- Test staff có một permission không gọi được endpoint yêu cầu permission khác.
- Test `ADMIN` bypass permission nhưng customer không truy cập API vận hành.
- Test user không xem hoặc sửa tài nguyên của user khác.
- Test không thể vô hiệu hóa/hạ quyền admin cuối cùng dưới concurrent requests.
- Test đổi permission hoặc vô hiệu hóa staff thu hồi refresh token và tạo audit record atomically.
- Test input chứa permission ngoài allowlist bị validation từ chối.

## References

- `PROJECT_PLAN.md`, mục “Authentication và người dùng”.
- `prisma/schema.prisma`: enum `Role`; `UserPermission` sẽ được bổ sung bằng migration khi triển khai.
