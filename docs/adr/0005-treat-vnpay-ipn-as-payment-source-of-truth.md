# ADR-0005: Dùng VNPay IPN làm nguồn xác nhận thanh toán

- Status: Accepted
- Date: 2026-08-18
- Owners: Project maintainers
- Supersedes: None
- Superseded by: None
- Implementation status: Not started

## Context

VNPay cung cấp Return URL để đưa trình duyệt người dùng về ứng dụng và IPN cho callback server-to-server. Return request đi qua browser nên có thể không đến, bị sửa, được replay hoặc được người dùng truy cập trực tiếp. Dùng Return URL để cập nhật payment thành công sẽ đặt business state vào một tín hiệu không đáng tin cậy.

IPN cũng có thể được VNPay retry, đến trùng, đến sau expiration job hoặc đến không đúng thứ tự với Return URL. Payment, order và inventory phải nhất quán dưới các tình huống này.

## Decision

Chỉ **IPN hợp lệ** được phép xác nhận payment success và kích hoạt state transition có tác động tới order/inventory. Return URL chỉ:

1. verify signature và parse kết quả để hiển thị phản hồi phù hợp;
2. trả trạng thái hiện tại do server đọc từ database;
3. không chuyển payment/order sang `PAID`/`CONFIRMED`.

Khi tạo payment URL:

- lấy amount và order identity từ database, không tin client;
- tạo `vnp_TxnRef` duy nhất theo constraint;
- nhân amount VND với 100 theo contract VNPay;
- tạo timestamp theo `Asia/Ho_Chi_Minh`;
- sort parameter đúng contract và ký HMAC-SHA512;
- không log `vnp_HashSecret`, raw secret configuration hoặc dữ liệu nhạy cảm.

IPN handler phải kiểm tra trước khi mutation:

- secure hash/signature với constant-time comparison khi phù hợp;
- merchant/TmnCode;
- `vnp_TxnRef` và payment/order tồn tại;
- amount khớp dữ liệu server;
- response code và transaction status;
- transaction/event identifier chưa được xử lý trái phép;
- current payment/order state cho phép transition.

Việc lưu payment event, cập nhật payment, cập nhật order và commit/release inventory phải được điều phối atomically trong database transaction. External callback handler mỏng, chuyển normalized command sang payment use case.

## Idempotency and ordering

Mỗi IPN được lưu dưới dạng payment event đã lọc dữ liệu nhạy cảm. Unique constraint trên VNPay transaction identity/business key ngăn cùng callback tạo hai transition.

Duplicate callback của một kết quả đã xử lý phải trả response hợp lệ theo contract VNPay nhưng không lặp side effect. Callback mâu thuẫn với trạng thái đã terminal phải được audit và xử lý theo state machine, không cưỡng ép overwrite.

IPN thành công đến sau khi order đã `PAYMENT_EXPIRED` là một exception flow, không tự động đảo ngược trạng thái trong phiên bản đầu. Hệ thống phải lưu/audit sự kiện và đưa về policy xử lý rõ ràng; trước khi triển khai cần chốt việc chuyển sang manual reconciliation hay transition bù cụ thể.

## Invariants

- Return URL không phải nguồn xác nhận payment success.
- Chỉ signature hợp lệ không đủ; merchant, reference, amount, status và current state đều phải hợp lệ.
- Amount luôn lấy từ order/payment trong database.
- Một VNPay transaction chỉ tạo tối đa một successful state transition.
- Duplicate/retry không commit inventory, tạo payment event hiệu lực hoặc cập nhật order hai lần.
- Payment success, order transition và inventory effect không được partial commit.
- Callback không được gọi network service khác khi đang giữ database lock nếu có thể tránh.
- Mọi state transition đi qua domain service/state machine, không nằm trực tiếp trong controller.
- Secret và raw token/payment credential không xuất hiện trong log hoặc audit payload.

## Consequences

### Positive

- Người dùng không thể giả thanh toán bằng cách sửa Return URL.
- Duplicate callback an toàn và có dữ liệu audit để điều tra.
- Payment, order và inventory giữ consistency qua transaction.
- Browser có thể đóng hoặc mất mạng mà IPN vẫn cập nhật được payment.

### Negative and trade-offs

- UI sau Return URL có thể tạm thấy `PENDING` trước khi IPN tới và cần poll/refetch trạng thái.
- Cần public HTTPS endpoint ổn định và test callback ngoài local environment.
- Late/out-of-order event yêu cầu reconciliation policy và observability.
- Mapping `RspCode` phải tuân đúng contract VNPay, kể cả khi internal state không đổi.

## Alternatives considered

### Xác nhận payment từ Return URL

Không chọn vì browser-controlled request không phải bằng chứng server-to-server đáng tin cậy.

### Cho cả Return URL và IPN cùng cập nhật payment

Không chọn vì tăng race condition, duplicate transition và làm mờ nguồn sự thật.

### Chỉ dựa vào signature, không đối chiếu amount/order

Không chọn vì chữ ký hợp lệ không chứng minh callback thuộc đúng internal record hoặc amount mong đợi trong mọi failure/misconfiguration scenario.

### Xử lý duplicate bằng application pre-check

Không chọn vì hai callback concurrent vẫn có thể cùng vượt qua pre-check; cần unique constraint và transaction.

## Verification

- Unit test canonical parameter sorting, HMAC-SHA512 signing và signature verification bằng fixture ổn định.
- Test Return URL hợp lệ không thay đổi payment/order/inventory.
- Integration test IPN sai signature, merchant, reference hoặc amount không mutation database.
- Concurrent integration test duplicate valid IPN chỉ tạo một transition và một inventory effect.
- Test Return thành công nhưng IPN thất bại không tạo `PAID`.
- Test callback đến sau expiration được audit và không tự ý đảo state.
- Test đúng `RspCode`/`Message` cho success, bad checksum, unknown order, wrong amount và already processed.
- Log-capture test hoặc review bảo đảm secret không bị ghi ra.

## References

- `PROJECT_PLAN.md`, mục “VNPay Sandbox PAY 2.1.0”.
- ADR-0004 mô tả inventory reservation và idempotent commit/release.
- Tài liệu VNPay Sandbox PAY được liên kết trong `PROJECT_PLAN.md` và phải được kiểm tra lại khi triển khai vì contract bên ngoài có thể thay đổi.
