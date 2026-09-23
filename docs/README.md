# Tài liệu Dự án & Điều hướng Tra cứu (Documentation Index)

Tài liệu được phân tách theo từng chủ đề độc lập. **Chỉ đọc đúng file liên quan đến công việc hiện tại, tuyệt đối không đọc toàn bộ để tiết kiệm token và thời gian.**

---

## 1. Bảng tra cứu theo tác vụ (Router Table)

```text
┌──────────────────────────────────────┬─────────────────────────────────────────────────────────────────┐
│ Khi bạn làm việc về                  │ File tài liệu cần đọc (Chỉ đọc 1 file liên quan)                │
├──────────────────────────────────────┼─────────────────────────────────────────────────────────────────┤
│ 1. Hạ tầng EC2, Server, Caddy, CD    │ docs/ops/ec2-deployment.md                                      │
│ 2. Sự cố CD bị treo, Docker tải chậm │ docs/troubleshooting/cd-docker-timeout.md                       │
│ 3. Báo cáo doanh thu & Đánh giá      │ docs/adr/0007-revenue-recognition-by-delivered-at.md            │
│ 4. Thanh toán trực tuyến (Stripe)    │ docs/adr/0006-treat-stripe-webhook-as-payment-source-of-truth.md│
│ 5. Tồn kho, Ledger & Concurrency     │ docs/adr/0004-reserve-inventory-with-transactional-ledger.md   │
│ 6. Phân quyền Staff & Roles cố định  │ docs/adr/0003-use-fixed-roles-and-direct-staff-permissions.md  │
│ 7. Xác thực & Rotate Refresh Token   │ docs/adr/0002-rotate-refresh-tokens-by-family.md               │
│ 8. Kiến trúc Modular Monolith        │ docs/adr/0001-use-modular-monolith.md                          │
│ 9. Toàn bộ mục lục kiến trúc         │ docs/adr/README.md                                             │
└──────────────────────────────────────┴─────────────────────────────────────────────────────────────────┘
```

---

## 2. Quy tắc duy trì tài liệu

1. Khi chốt một kiến trúc hoặc trade-off mới: Tạo một ADR mới theo mẫu chuẩn trong `docs/adr/` và đánh số tăng dần (ví dụ: `0008-...`).
2. Khi xử lý xong một sự cố hiểm nghèo: Ghi vào `docs/troubleshooting/`.
3. Định dạng bài viết: Tối đa 1-2 trang màn hình, đi thẳng vào **Context -> Decision -> Consequences / Trade-offs**.
