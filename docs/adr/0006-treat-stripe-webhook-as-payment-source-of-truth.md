# ADR-0006: Dùng Stripe Webhook làm nguồn xác nhận thanh toán trực tuyến

- Status: Accepted
- Date: 2026-09-13
- Owners: Project maintainers
- Supersedes: [ADR-0005](./0005-treat-vnpay-ipn-as-payment-source-of-truth.md)
- Superseded by: None
- Implementation status: Implemented

## Context

Dự án chuyển đổi cổng thanh toán trực tuyến sang Stripe (Stripe Checkout và Webhook) để tối ưu trải nghiệm thanh toán thẻ và môi trường sandbox.

Stripe cung cấp:
1. `success_url` / `cancel_url`: redirect trình duyệt của khách sau khi checkout.
2. Webhook: HTTP POST callback server-to-server gửi các sự kiện thanh toán (`checkout.session.completed`, `checkout.session.expired`).

Redirect trên trình duyệt người dùng không đáng tin cậy (người dùng có thể đóng tab trước khi redirect, mất mạng, hoặc giả mạo request). Nếu dùng client redirect để cập nhật trạng thái đơn hàng sẽ gây mất an toàn dữ liệu và sai lệch invariant tồn kho.

Webhook có thể được Stripe gửi lại (retry), gửi chậm hơn client, hoặc gửi đến sau khi đơn hàng đã bị hủy. Do đó, hệ thống cần cơ chế kiểm tra chữ ký (`stripe-signature`), xử lý idempotent và điều phối transaction nguyên tử.

## Decision

Chỉ **Stripe Webhook hợp lệ** (đã xác thực chữ ký cryptographic bằng raw body buffer) mới được phép xác nhận thanh toán thành công và kích hoạt chuyển trạng thái đơn hàng/tồn kho:

1. **Client Redirect (`success_url` / `cancel_url`)**:
   - Chỉ dùng để hiển thị giao diện thông báo kết quả cho người dùng.
   - Không được phép chuyển trạng thái Order/Payment sang `PAID` hay `CONFIRMED`.

2. **Xác thực chữ ký Webhook**:
   - Sử dụng `stripe.webhooks.constructEvent(rawBody, signature, secret)`.
   - Express giữ raw buffer thông qua tùy chọn `verify` trong `express.json()`.
   - Webhook sai chữ ký bị từ chối ngay lập tức với HTTP 400.

3. **Xử lý sự kiện `checkout.session.completed`**:
   - Khóa bi quan (`SELECT ... FOR UPDATE`) trên bản ghi Order trong database transaction.
   - Kiểm tra tính idempotent: Nếu đơn hàng đã ở trạng thái `CONFIRMED` / `PAID`, bỏ qua việc xử lý lại và trả về 200 `{ received: true }`.
   - Nếu đơn hàng đã bị `CANCELLED` hoặc `PAYMENT_EXPIRED` trước khi webhook đến: ghi nhận trạng thái thanh toán và lưu audit log đối soát, không tự ý đảo ngược trạng thái đơn hàng.
   - Nếu đơn hàng hợp lệ đang `PENDING_PAYMENT`:
     - Chuyển `PaymentTransaction` sang `SUCCESS`.
     - Chuyển `Order.status` sang `CONFIRMED`, `PaymentStatus` sang `PAID`.
     - Chốt tồn kho qua `inventoryService.commitReservation`.
     - Ghi lịch sử trạng thái đơn hàng và Audit Log.

4. **Xử lý sự kiện `checkout.session.expired`**:
   - Nếu đơn hàng còn đang `PENDING_PAYMENT`, giải phóng tồn kho đã giữ (`inventoryService.releaseReservation`) và chuyển đơn hàng sang `PAYMENT_EXPIRED`.

## Consequences

- Đơn hàng và tồn kho luôn bảo đảm tính nhất quán cao, không bị ảnh hưởng bởi việc đóng trình duyệt.
- Xử lý an toàn các kịch bản retry từ Stripe nhờ vào row lock và kiểm tra trạng thái idempotent.
- Secret key và thông tin thẻ khách hàng được bảo vệ an toàn theo chuẩn PCI-DSS (không lưu thẻ nhạy cảm trong database của ứng dụng).
