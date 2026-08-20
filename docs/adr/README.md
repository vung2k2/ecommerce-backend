# Architecture Decision Records

Thư mục này lưu các Architecture Decision Record (ADR) của dự án. Mỗi ADR ghi lại một quyết định có ảnh hưởng đáng kể đến kiến trúc, tính đúng đắn, bảo mật hoặc khả năng vận hành của hệ thống.

ADR giải thích **vì sao** một hướng được chọn. `PROJECT_PLAN.md` vẫn là nguồn sự thật về phạm vi, checklist và Definition of Done; code, migration và test là bằng chứng về trạng thái triển khai thực tế.

## Trạng thái

- `Proposed`: đang thảo luận, chưa được dùng làm ràng buộc thiết kế.
- `Accepted`: đã chốt và phải được tuân thủ khi triển khai phần liên quan.
- `Superseded`: đã được thay thế bởi ADR khác; ADR cũ vẫn được giữ để bảo toàn lịch sử.
- `Deprecated`: không còn khuyến nghị cho code mới nhưng chưa có quyết định thay thế hoàn chỉnh.

`Accepted` không đồng nghĩa với `Implemented`. Mỗi ADR phải ghi riêng trạng thái triển khai để tránh đánh dấu nhầm tiến độ dự án.

## Danh sách quyết định

| ADR                                                                | Quyết định                                              | Trạng thái | Triển khai                      |
| ------------------------------------------------------------------ | ------------------------------------------------------- | ---------- | ------------------------------- |
| [ADR-0001](./0001-use-modular-monolith.md)                         | Sử dụng modular monolith và phân tầng theo trách nhiệm  | Accepted   | Đang triển khai                 |
| [ADR-0002](./0002-rotate-refresh-tokens-by-family.md)              | Rotate refresh token theo token family                  | Accepted   | Đã triển khai cho auth hiện tại |
| [ADR-0003](./0003-use-fixed-roles-and-direct-staff-permissions.md) | Dùng role cố định và cấp permission trực tiếp cho staff | Accepted   | Chưa triển khai                 |
| [ADR-0004](./0004-reserve-inventory-with-transactional-ledger.md)  | Giữ tồn kho bằng reservation và transactional ledger    | Accepted   | Chưa triển khai                 |
| [ADR-0005](./0005-treat-vnpay-ipn-as-payment-source-of-truth.md)   | Dùng VNPay IPN làm nguồn xác nhận thanh toán            | Accepted   | Chưa triển khai                 |

## Khi nào cần tạo ADR

Tạo ADR khi quyết định:

- ảnh hưởng nhiều module hoặc tạo constraint dài hạn;
- liên quan transaction, concurrency, idempotency hoặc security;
- chọn một phương án giữa nhiều trade-off đáng kể;
- thay đổi API contract, data ownership hoặc deployment topology;
- khó suy ra đầy đủ lý do chỉ bằng cách đọc code.

Không cần ADR cho naming, refactor cục bộ, dependency update nhỏ hoặc implementation detail dễ đảo ngược.

## Quy ước cập nhật

ADR đã `Accepted` không được sửa lại để làm mất lịch sử quyết định. Có thể sửa lỗi chính tả hoặc bổ sung liên kết không làm đổi ý nghĩa. Nếu quyết định thay đổi, tạo ADR mới, đánh dấu ADR cũ là `Superseded` và liên kết hai chiều.

Tên file dùng dạng `NNNN-short-kebab-case-title.md`. Số ADR chỉ tăng, không tái sử dụng số đã bỏ.

## Mẫu ADR

```markdown
# ADR-NNNN: Tiêu đề quyết định

- Status: Proposed
- Date: YYYY-MM-DD
- Owners: Project maintainers
- Supersedes: None
- Superseded by: None
- Implementation status: Not started

## Context

Vấn đề, constraint và lực tác động dẫn đến quyết định.

## Decision

Quyết định cụ thể và phạm vi áp dụng.

## Invariants

Các điều luôn phải đúng bất kể implementation thay đổi thế nào.

## Consequences

### Positive

Lợi ích đạt được.

### Negative and trade-offs

Chi phí, giới hạn và rủi ro chấp nhận.

## Alternatives considered

Các phương án đã cân nhắc và lý do chưa chọn.

## Verification

Test, constraint, metric hoặc kiểm tra chứng minh quyết định được thực thi đúng.

## References

Liên kết tới plan, code, issue hoặc tài liệu liên quan.
```
