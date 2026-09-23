# ADR-0007: Ghi nhận doanh thu tại thời điểm giao hàng thành công (deliveredAt)

- Status: Accepted
- Date: 2026-09-23
- Owners: Project maintainers
- Supersedes: None
- Superseded by: None
- Implementation status: Implemented

## Context

Trước đây, các báo cáo doanh thu quản trị (`GET /api/v1/admin/reports/sales` và `GET /api/v1/admin/reports/top-products`) truy vấn dữ liệu từ các đơn hàng có trạng thái `DELIVERED` nhưng lại lọc và nhóm doanh thu theo ngày tạo đơn (`Order.createdAt`).

Cách tiếp cận này dẫn đến các sai lệch nghiêm trọng:

1. **Sai kỳ kế toán (Accounting Period Mismatch)**:
   Ví dụ đơn hàng tạo ngày 31/08 nhưng giao thành công vào ngày 02/09:
   - Nếu lọc theo `createdAt`, doanh thu bị gán vào báo cáo tháng 8 (thời điểm khách chưa nhận hàng và chưa hoàn tất nghĩa vụ bán hàng).
   - Báo cáo tháng 9 sẽ bỏ sót doanh thu của đơn hàng này.
   - Nếu trong quá trình giao đơn bị hủy hoặc hoàn trả, báo cáo tháng 8 đã chốt sổ sẽ bị sai lệch.
2. **Top Products xếp hạng theo SKU thay vì Product**:
   Trước đây nhóm theo `(orderItem.productId, orderItem.sku)`. Một sản phẩm có nhiều phân loại (màu sắc, kích cỡ) bị chia nhỏ doanh số, không phản ánh đúng dòng sản phẩm bán chạy nhất của cửa hàng.
3. **Chưa thống nhất cơ sở đối soát giữa Sales Overview và Top Products**:
   Sales Overview tính theo tổng tiền thực thu (`totalAmount` sau khi trừ coupon và cộng phí ship), trong khi Top Products tính theo giá trị hàng bán (`quantity * unitPrice` trước coupon/ship). Cần làm rõ sự khác biệt giữa Net Revenue và Gross Revenue.

## Decision

1. **Thêm mốc thời gian giao hàng `Order.deliveredAt`**:
   - Thêm cột `deliveredAt TIMESTAMPTZ(3)` và chỉ mục `orders_delivered_at_idx` vào bảng `orders`.
   - Khi đơn hàng chuyển trạng thái sang `DELIVERED`, tự động gán `deliveredAt = new Date()` (nếu trước đó chưa có).

2. **Lọc và nhóm báo cáo theo `deliveredAt`**:
   - Khoảng thời gian báo cáo (`from`, `to`) và biểu đồ hàng ngày (`dailyBreakdown`) lọc nghiêm ngặt theo `deliveredAt`.
   - Các đơn hàng chưa ở trạng thái `DELIVERED` (hoặc `deliveredAt` là null) hoàn toàn không được tính vào doanh thu báo cáo.

3. **Cộng dồn xếp hạng Top Products theo cấp Product**:
   - Nhóm dữ liệu theo `(orderItem.productId, orderItem.productName)`.
   - Cộng dồn toàn bộ số lượng (`quantity`) và doanh số của tất cả các biến thể (variants) thuộc về cùng một sản phẩm. Loại bỏ trường `sku` ở cấp độ tổng hợp này.

4. **Thống nhất cơ sở đối soát (Net Revenue vs Gross Revenue)**:
   - **Sales Overview (Net Revenue)**: Doanh thu thuần = `totalAmount` thực thu từ khách hàng (đã trừ mã giảm giá và cộng phí ship).
   - **Top Products (Gross Revenue)**: Doanh thu gộp = `quantity * unitPrice` của từng sản phẩm trước khi áp dụng mã giảm giá toàn đơn và phí vận chuyển.
   - Khai báo rõ ràng sự khác biệt này trong mô tả OpenAPI schema để đội ngũ kế toán/vận hành đối soát chính xác.

## Consequences

- Báo cáo doanh thu tuân thủ đúng nguyên tắc kế toán dồn tích (Accrual Accounting), phản ánh chính xác dòng tiền tại thời điểm hoàn thành dịch vụ.
- Loại bỏ hoàn toàn tình trạng sai lệch số liệu khi đơn hàng được tạo và giao vắt qua các tháng khác nhau.
- Xếp hạng Top Products phản ánh trung thực mức độ quan tâm của thị trường đối với từng sản phẩm.
