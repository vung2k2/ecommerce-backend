import { OpenApiGeneratorV3 } from '@asteasolutions/zod-to-openapi';
import { registry } from './registry.js';

// Import toàn bộ các file đăng ký schema và route để đảm bảo chúng được load
import '../modules/auth/auth.routes.js';
import '../modules/users/users.routes.js';
import '../modules/admin/staff/staff.routes.js';

const apiDescription = `
# FE – BE API Integration Guideline

Tài liệu này mô tả các quy ước giao tiếp giữa Frontend (FE) và Backend (BE).

---

# 1. Language

- Client chọn ngôn ngữ bằng header \`Accept-Language\` với hai giá trị hỗ trợ là \`en\` và \`vi\`.
- Khi thiếu header hoặc locale không được hỗ trợ, API mặc định dùng \`en\`.

# 2. Response

## 2.1. Response Thành Công
Tất cả các API trả về thành công đều được bọc trong một object có chứa \`requestId\` (dùng để tra cứu log) và dữ liệu chính nằm trong trường \`data\`.
\`\`\`json
{
  "data": { ... },
  "requestId": "req_a1b2c3d4"
}
\`\`\`

## 2.2. Response Phân Trang
Đối với các API trả về danh sách (GET list), dữ liệu sẽ kèm theo metadata phân trang \`meta\`:
\`\`\`json
{
  "data": [ ... ],
  "meta": {
    "page": 1,
    "pageSize": 20,
    "total": 100,
    "totalPages": 5
  },
  "requestId": "req_a1b2c3d4"
}
\`\`\`

## 2.3. Response Lỗi
Mọi lỗi HTTP (4xx, 5xx) đều tuân theo format này. Đặc biệt lỗi \`422\` (Validation) sẽ có thêm mảng \`details\` báo lỗi chi tiết ở từng field.
\`\`\`json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request body is invalid",
    "details": [
      {
        "path": "email",
        "message": "Invalid email"
      }
    ]
  },
  "requestId": "req_a1b2c3d4"
}
\`\`\`

## 2.4. Các lỗi chung

Các lỗi dưới đây áp dụng thống nhất ở tầng HTTP/middleware và không lặp lại trong từng endpoint.
Client nên xử lý theo \`error.code\`; \`message\` chỉ dùng để hiển thị hoặc hỗ trợ debug.

| HTTP status | error.code | Trường hợp |
| --- | --- | --- |
| 401 | \`UNAUTHORIZED\` | Thiếu, sai hoặc hết hạn access token |
| 403 | \`FORBIDDEN\` | Không đủ role/permission hoặc tài khoản bị khóa |
| 404 | \`ROUTE_NOT_FOUND\` | Không tồn tại HTTP route |
| 422 | \`VALIDATION_ERROR\` | Path, query hoặc body không hợp lệ |
| 429 | \`TOO_MANY_REQUESTS\` | Vượt rate limit |
| 500 | \`INTERNAL_SERVER_ERROR\` | Lỗi không mong đợi từ server |

Mỗi endpoint chỉ liệt kê thêm HTTP status và \`error.code\` của các lỗi nghiệp vụ đặc trưng.
`;

export function getOpenApiDocument() {
  const generator = new OpenApiGeneratorV3(registry.definitions);

  return generator.generateDocument({
    openapi: '3.0.3',
    info: {
      title: 'E-commerce Backend API',
      version: '0.1.0',
      description: apiDescription,
    },
    servers: [{ url: '/api/v1' }],
  });
}
