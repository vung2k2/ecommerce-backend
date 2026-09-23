# Vận hành Hạ tầng Production EC2 & Deployment

> **Khi nào cần đọc file này**: Khi cần tra cứu thông số server, kiểm tra sức khỏe hạ tầng, cấu hình mạng/domain hoặc can thiệp deploy thủ công.

---

## 1. Thông số Hạ tầng

- **Server IP**: `3.1.80.199` (AWS EC2 region `ap-southeast-1` Singapore).
- **User SSH**: `ubuntu` (Dùng private key `EC2_key.pem`, không commit lên Git).
- **Domain & SSL**: `vung-ecommerce.duckdns.org` (Caddy tự động cấp chứng chỉ Let's Encrypt HTTPS).
- **Cấu hình phần cứng**:
  - **RAM vật lý**: ~1GB (908MB).
  - **Swap File**: 2GB tại `/swapfile` (Đã lưu vào `/etc/fstab`, swappiness = 20).
  - **Ổ đĩa**: 19GB NVMe EBS.

---

## 2. Kiến trúc Container (`compose.prod.yaml`)

```text
Internet ──HTTPS──> [Caddy :80/:443] ──HTTP:3000──> [API Runner]
                                                         │
                                        ┌────────────────┴───────────────┐
                                        ▼                                ▼
                              [PostgreSQL 17 :5432]              [Redis 7 :6379]
```

- **api**: Chạy image `ghcr.io/vung2k2/ecommerce-backend-api:<tag>`, không expose port ra host, chỉ kết nối qua internal network `app_network`.
- **migrator**: Chạy `prisma migrate deploy` trước khi API mới khởi động.
- **caddy**: Tự động redirect HTTP -> HTTPS và reverse proxy vào container `api:3000`.

---

## 3. Lệnh Kiểm tra Nhanh 1 Dòng (từ máy cá nhân)

```bash
# Kiểm tra nhanh RAM, Ổ cứng và Docker
ssh -i EC2_key.pem ubuntu@3.1.80.199 "free -h; echo '---'; df -h /; echo '---'; docker system df"

# Kiểm tra trạng thái các container đang chạy
ssh -i EC2_key.pem ubuntu@3.1.80.199 "docker ps"

# Kiểm tra readiness probe của API
ssh -i EC2_key.pem ubuntu@3.1.80.199 "curl -s -k --resolve vung-ecommerce.duckdns.org:443:127.0.0.1 https://vung-ecommerce.duckdns.org/health/ready"

# Xem 50 dòng log gần nhất của API
ssh -i EC2_key.pem ubuntu@3.1.80.199 "docker compose -f ~/app/compose.prod.yaml logs --tail 50 api"
```

---

## 4. Quy ước Pipeline CD (.github/workflows/cd.yml)

1. **Timeout**: `command_timeout: 30m` để chống đứt kết nối SSH khi mạng quốc tế chậm.
2. **Pull Mode**: Bắt buộc dùng `docker compose pull -q api migrator` để không in hàng vạn dòng log tiến trình.
3. **Cache Policy**: Tuyệt đối **không** chạy `docker system prune -a` trước khi pull. Chỉ dọn rác bằng `docker image prune -f` **sau khi** container mới đã khởi động và pass health check thành công.
