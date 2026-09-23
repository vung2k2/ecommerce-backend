# Sự Cố: CD Bị Timeout & Kéo Dài Quá 10 Phút

> **Ngày xảy ra**: 2026-09-23  
> **Trạng thái**: Đã khắc phục triệt để  
> **Khi nào cần đọc file này**: Khi thấy GitHub Actions CD chạy lâu bất thường, bị ngắt ngang ở bước `Execute Deployment on EC2`, hoặc log in ra hàng ngàn dòng "Downloading".

---

## 1. Triệu chứng

1. Pipeline CD chạy đến bước `Execute Deployment on EC2` thì chạy liên tục đúng **10 phút 23 giây** rồi báo đỏ với lỗi `Process completed with exit code 1`.
2. Màn hình log GitHub Actions in ra hơn **12.000 dòng streaming**:
   ```text
   774043ccc8cc Downloading 13.63MB
   60f37e2c93ec Downloading 27.26MB
   3c896b0ba757 Downloading 117.4MB
   ...
   ```
3. Trên server EC2, container API mới không được khởi động, phiên bản cũ vẫn chạy.

---

## 2. Nguyên nhân gốc rễ

```text
┌───┬───────────────────────────────────┬────────────────────────────────────────────────────────────────┐
│ # │ Yếu tố                            │ Hậu quả                                                        │
├───┼───────────────────────────────────┼────────────────────────────────────────────────────────────────┤
│ 1 │ `docker system prune -af`         │ Xóa sạch toàn bộ layer cache trên EC2 trước khi pull, buộc     │
│   │ chạy TRƯỚC khi pull               │ máy phải tải lại từ đầu toàn bộ Debian OS + node_modules.      │
├───┼───────────────────────────────────┼────────────────────────────────────────────────────────────────┤
│ 2 │ `docker compose pull` thiếu `-q`  │ Docker trên môi trường non-TTY SSH in mỗi chunk tải về thành   │
│   │                                   │ 1 dòng log mới → sinh ra 12.000+ dòng làm nghẽn buffer.        │
├───┼───────────────────────────────────┼────────────────────────────────────────────────────────────────┤
│ 3 │ EC2 1GB RAM không có Swap         │ Tải và giải nén layer nén lớn cùng lúc làm nghẽn I/O đĩa.      │
│   │ (Swap = 0 MB ban đầu)             │ Thời gian tải + giải nén kéo dài > 10 phút.                    │
├───┼───────────────────────────────────┼────────────────────────────────────────────────────────────────┤
│ 4 │ `appleboy/ssh-action` có mặc định │ Đúng 10 phút, SSH action tự động ngắt kết nối → Docker daemon  │
│   │ `command_timeout: 10m`            │ bị hủy ngang (`Cancel with lease`) → CD fail.                  │
└───┴───────────────────────────────────┴────────────────────────────────────────────────────────────────┘
```

---

## 3. Giải pháp đã thực hiện

1. **Bật 2GB Swap vĩnh viễn trên EC2**:
   ```bash
   sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
   sudo mkswap /swapfile && sudo swapon /swapfile
   echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
   sudo sysctl vm.swappiness=20
   ```
2. **Cập nhật `.github/workflows/cd.yml`**:
   - Thêm `command_timeout: 30m` vào SSH action.
   - Thêm cờ `-q`: `docker compose -f compose.prod.yaml pull -q api migrator`.
   - Bỏ hoàn toàn `docker system prune -af` trước khi pull.
   - Dọn dẹp dangling images bằng `docker image prune -f || true` **sau khi** API đã pass health check.
