# ADR-0002: Rotate refresh token theo token family

- Status: Accepted
- Date: 2026-08-18
- Owners: Project maintainers
- Supersedes: None
- Superseded by: None
- Implementation status: Implemented for the current auth scope

## Context

Access token có thời hạn ngắn nên người dùng cần refresh token để duy trì phiên. Một refresh token sống lâu nếu bị đánh cắp có thể bị dùng lại ngay cả sau khi người dùng hợp lệ đã refresh. Chỉ kiểm tra chữ ký JWT không đủ để thu hồi phiên hoặc phát hiện replay.

Hai request refresh đồng thời cũng tạo race condition: nếu cùng token cũ đều được chấp nhận, hệ thống có thể phát hành hai token kế nhiệm hợp lệ. Đây là lỗi correctness và làm suy yếu reuse detection.

## Decision

Mỗi lần login tạo một `familyId` mới đại diện cho một session/token family. Mỗi refresh token có `jti` duy nhất, mang `userId`, `role`, `familyId` và `tokenType`, nhưng database chỉ lưu SHA-256 hash của raw token.

Khi refresh thành công:

1. Verify JWT signature, algorithm, issuer, audience, expiry và payload schema.
2. Hash raw token và tìm bản ghi tương ứng.
3. Mở database transaction, serialize các thao tác cạnh tranh trên user/token family.
4. Đối chiếu `userId` và `familyId` trong JWT với database.
5. Atomically claim token hiện tại bằng cách chuyển nó sang revoked chỉ khi nó vẫn active.
6. Phát hành access token và refresh token mới trong cùng family.
7. Lưu hash của refresh token mới trước khi commit.

Nếu một token đã revoked được dùng lại hoặc atomic claim thất bại, coi đó là reuse và revoke toàn bộ family. Người dùng phải login lại cho session đó.

Logout một phiên revoke toàn bộ family của refresh token được gửi lên. Logout tất cả thiết bị thu hồi mọi refresh token của user. Raw refresh token không được log hoặc lưu trong database.

## Invariants

- Một refresh token chỉ tạo tối đa một successor hợp lệ.
- Hai request refresh đồng thời với cùng token không thể cùng thành công.
- Token reuse làm mất hiệu lực toàn bộ token family liên quan.
- JWT claim và database record phải cùng `userId` và `familyId`.
- User inactive không được nhận token mới.
- Chỉ lưu one-way hash của refresh token; raw token chỉ tồn tại ở boundary cần trả cho client.
- Access token và refresh token dùng audience, secret và `tokenType` riêng.
- Mọi thay đổi trạng thái token trong refresh flow nằm trong cùng transaction.

## Concurrency strategy

Implementation hiện tại dùng PostgreSQL transaction kết hợp transaction-level advisory lock theo user và token family. Atomic `updateMany` với điều kiện `isRevoked: false` là hàng rào cuối để chỉ một request claim được token.

Thứ tự lock phải ổn định: user trước, family sau. Nếu các auth operation mới cần nhiều lock, chúng phải giữ cùng thứ tự để giảm nguy cơ deadlock.

Advisory lock là chi tiết implementation có thể thay thế bằng row lock hoặc cơ chế tương đương, miễn vẫn giữ các invariant concurrency.

## Consequences

### Positive

- Có thể thu hồi từng session hoặc toàn bộ session của user.
- Replay token đã dùng được phát hiện thay vì âm thầm phát hành thêm session.
- Token database bị lộ không trực tiếp cung cấp raw refresh token.
- Flow vẫn dùng JWT nhưng có server-side state cần thiết cho revocation.

### Negative and trade-offs

- Refresh không còn stateless và phụ thuộc PostgreSQL.
- Mỗi refresh tạo thêm một bản ghi; cần chiến lược dọn token expired/revoked.
- Reuse detection có thể revoke session hợp lệ nếu client gửi song song do retry; client phải serialize refresh và xử lý yêu cầu login lại.
- Advisory lock gắn implementation với PostgreSQL cho đến khi có quyết định thay thế.

## Alternatives considered

### Refresh token JWT hoàn toàn stateless

Không chọn vì không thể thu hồi tức thời hoặc phát hiện replay đáng tin cậy.

### Refresh token cố định cho tới khi hết hạn

Không chọn vì token bị đánh cắp có cửa sổ sử dụng dài và reuse không tạo tín hiệu rõ ràng.

### Lưu raw refresh token

Không chọn vì database leak sẽ biến trực tiếp thành session compromise.

### Chỉ revoke token cũ nhưng không revoke family khi reuse

Không chọn vì hệ thống không biết request hợp lệ hay kẻ tấn công đang giữ nhánh token nào.

## Verification

- Integration test login lưu hash thay vì raw token.
- Test refresh thành công revoke token cũ và tạo token mới cùng `familyId`.
- Concurrent integration test gửi hai refresh request cùng token và xác nhận chỉ một request thành công.
- Test dùng lại token cũ làm toàn bộ family bị revoke.
- Test logout một phiên không ảnh hưởng family khác; logout-all vô hiệu hóa tất cả phiên.
- Test token sai signature, audience, type, claim hoặc đã hết hạn bị từ chối.
- Kiểm tra log không chứa raw access/refresh token hoặc cookie.

## References

- `prisma/schema.prisma`: `RefreshToken` và các index liên quan.
- `src/modules/auth/auth.service.ts`: rotation và transaction boundary.
- `src/modules/auth/auth.repository.ts`: advisory lock, atomic claim và revocation.
- `src/utils/jwt.ts`: signing, verification và token hashing.
- `tests/auth-session.test.ts`: auth session behavior.
