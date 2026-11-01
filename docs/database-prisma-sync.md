# Đồng bộ schema nghiệp vụ vào Prisma

Hiện `packages/database/prisma/schema.prisma` có `AuditLog` và một số enum;
migration `20261031000000_init` đã tạo phần này. Bản nghiệp vụ đầy đủ nằm
trong `docs/database/ResearchOS.sql`, gồm SQL export từ DBML và bổ sung
PostgreSQL. Hai phần chưa được đồng bộ. Tài liệu này mô tả bước tiếp theo,
không có nghĩa schema nghiệp vụ đã được áp dụng.

## Quy trình phù hợp với repo

1. **Chốt bản SQL nghiệp vụ.** Kiểm tra file sinh ra từ DBML cùng
   `postgres-features.sql`. Giữ trigger, function, view, CHECK và index đặc
   thù; không chỉ lấy SQL export từ sơ đồ. Đối chiếu tên bảng/enum với
   migration hiện có, giữ `audit_logs` nếu vẫn dùng.
2. **Thêm migration mới.** Không sửa hoặc xóa migration init đã áp dụng.
   Tạo migration tiếp theo cho schema nghiệp vụ đã review. SQL triển khai
   phải nằm trong lịch sử Prisma; không để Compose tự import thêm một
   schema khác sau lưng migration.
3. **Dựng lại trên database tạm, rỗng.** Áp dụng cả init và migration mới,
   sau đó chạy các SQL smoke test trong `docs/database`. Đây chỉ là database
   dùng lúc đồng bộ/kiểm thử rồi bỏ, không phải thêm một môi trường phải vận
   hành lâu dài. Test concurrency có ghi fixtures nên chỉ chạy tại đây.
4. **Introspect để lấy model.** Dùng `prisma db pull --print` với cấu hình
   kết nối trỏ tường minh vào database tạm. Review kết quả trước khi sửa
   `schema.prisma`; dùng `@map`/`@@map` để giữ tên SQL và tên TypeScript phù
   hợp. Giữ cấu hình generator hiện tại và model AuditLog. Các phần không
   biểu diễn đủ trong Prisma tiếp tục nằm trong SQL migration.
5. **Validate và sinh client.** Chạy Prisma validate, `pnpm db:generate`,
   build/lint/test. Kiểm tra các quan hệ, enum, nullable và constraints thực
   trong PostgreSQL; việc sinh client thành công chưa chứng minh các policy
   SQL đã đúng.
6. **Áp dụng vào database đang dùng.** Backup nếu có dữ liệu cần giữ, review
   migration rồi chạy `pnpm db:migrate:deploy`. Không chạy nguyên file khởi
   tạo ResearchOS.sql vào database đã có dữ liệu hoặc dùng `db push` để
   thay thế migration.

Sau khi đồng bộ, migration là nguồn triển khai cho máy mới/server;
`schema.prisma` là model dùng sinh client; DBML là tài liệu thiết kế.
Khi đổi nghiệp vụ, cập nhật các phần tương ứng trong cùng thay đổi.

Prisma chỉ introspect được một phần cấu trúc PostgreSQL; các trigger,
function và view không tự chuyển thành toàn bộ hành vi trong model.
Xem [Prisma: unsupported database features](https://www.prisma.io/docs/orm/v7/prisma-migrate/workflows/unsupported-database-features).
