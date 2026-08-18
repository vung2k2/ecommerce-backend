# ADR-0004: Giữ tồn kho bằng reservation và transactional ledger

- Status: Accepted
- Date: 2026-08-18
- Owners: Project maintainers
- Supersedes: None
- Superseded by: None
- Implementation status: Not started

## Context

Checkout COD có thể xác nhận ngay, còn checkout VNPay cần giữ hàng trong thời gian chờ thanh toán. Nhiều request có thể đồng thời mua SKU cuối cùng. Chỉ đọc số lượng rồi ghi lại sẽ gây lost update và overselling.

Hệ thống cũng cần giải phóng hàng khi payment thất bại, order hết hạn hoặc bị hủy. Job và callback có thể retry hoặc đến sai thứ tự, vì vậy thao tác inventory phải idempotent và có dữ liệu đối chiếu.

## Decision

Inventory được quản lý theo product variant với hai số nguyên không âm:

- `onHand`: số lượng vật lý hệ thống ghi nhận.
- `reserved`: số lượng đã giữ cho order nhưng chưa hoàn tất bước commit/release.

Số lượng có thể bán:

```text
available = onHand - reserved
```

Checkout giữ hàng bằng reservation thay vì trừ `onHand` ngay. Việc validate cart, tính giá, claim coupon, tạo order và reserve toàn bộ stock phải nằm trong transaction phù hợp.

Mỗi thay đổi tồn kho tạo stock movement/audit ledger. Movement liên kết với business reference ổn định như order, reservation hoặc adjustment và có idempotency key/unique constraint để cùng business event không được áp dụng hai lần.

Các operation cơ bản:

- `reserve`: tăng `reserved` nếu `available >= quantity`.
- `commit`: khi hàng được xác nhận tiêu thụ, giảm cả `onHand` và `reserved` cùng số lượng.
- `release`: khi giữ hàng không còn hiệu lực, giảm `reserved`.
- `adjust`: thay đổi `onHand` theo thao tác quản trị có reason và actor.

Update phải dùng conditional update, row locking hoặc cơ chế PostgreSQL tương đương. Application pre-check chỉ phục vụ error message; database operation mới là hàng rào correctness cuối cùng.

Nếu order có nhiều variant, lock/update theo thứ tự variant ID ổn định để giảm deadlock. Bất kỳ item nào không reserve được phải rollback toàn bộ checkout, không để partial reservation.

## Invariants

- `onHand >= 0`.
- `reserved >= 0`.
- `reserved <= onHand`.
- `available = onHand - reserved` không âm.
- Một reservation chỉ được commit hoặc release một lần.
- Một business event retry không tạo movement hoặc thay đổi aggregate lần thứ hai.
- Aggregate inventory và tổng movement hợp lệ có thể đối chiếu.
- Checkout nhiều item là all-or-nothing.
- Giá trị tiền, quantity và ownership dùng dữ liệu server-side đã validate; không tin client total hoặc stock snapshot.

Các invariant quan trọng phải được bảo vệ bằng database constraint và unique index, không chỉ bằng `if` trong service.

## State interaction

Luồng dự kiến:

```text
checkout
  -> reserve inventory
  -> COD: confirm/commit theo policy fulfillment
  -> VNPay: giữ reservation tới valid IPN hoặc expiration
       -> paid: commit reservation
       -> failed/expired/cancelled: release reservation
```

Thời điểm commit chính xác phải đồng bộ với order state machine. Dù policy đổi, payment callback, cancellation và expiration job phải gọi cùng inventory use case idempotent.

## Consequences

### Positive

- Chống overselling dưới concurrent checkout.
- VNPay có thể giữ hàng có TTL mà chưa ghi nhận đã bán.
- Ledger hỗ trợ audit, debugging và reconciliation.
- Retry job/callback có thể xử lý an toàn khi có idempotency constraint.

### Negative and trade-offs

- Checkout transaction và lock ordering phức tạp hơn CRUD thông thường.
- Reservation hết hạn cần BullMQ worker và reconciliation cho job bị trễ.
- Aggregate và ledger có nguy cơ lệch nếu write không cùng transaction; mọi operation phải đi qua một use case chuẩn.
- Giữ transaction quá lâu làm giảm throughput, nên không gọi VNPay/S3/network trong database transaction.

## Alternatives considered

### Trừ `onHand` ngay khi tạo order

Chưa chọn vì khó phân biệt hàng đã bán và hàng chỉ đang chờ VNPay; release/commit trở nên kém rõ ràng.

### Read-check-write không lock

Không chọn vì hai request có thể cùng đọc một available stock và cùng thành công.

### Redis lock làm nguồn bảo vệ chính

Không chọn vì database vẫn là nguồn sự thật; Redis outage hoặc lock expiry có thể phá invariant. Redis có thể hỗ trợ hiệu năng nhưng không thay database constraint/transaction.

### Chỉ lưu aggregate, không có ledger

Không chọn vì khó audit, deduplicate retry và điều tra chênh lệch tồn kho.

## Verification

- Database constraints từ chối `onHand`, `reserved` hoặc `available` âm.
- Concurrent integration test nhiều checkout cho SKU cuối cùng chỉ cho phép tổng reservation trong available stock.
- Test checkout nhiều item rollback toàn bộ khi một item hết hàng.
- Test duplicate reserve/commit/release event không thay đổi tồn kho lần hai.
- Test expiration và cancellation đồng thời chỉ release một lần.
- Reconciliation test chứng minh aggregate khớp ledger trên fixture xác định.
- Test deadlock/retry path với nhiều order chứa cùng variant theo thứ tự khác nhau.

## References

- `PROJECT_PLAN.md`, mục “Tồn kho”, “Order và checkout” và “Test plan”.
- ADR-0005 mô tả event thanh toán được phép kích hoạt commit/release cho VNPay.
