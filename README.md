# ResearchOS

Monorepo pnpm gồm Next.js (web), NestJS (API) và NestJS (worker), dùng
PostgreSQL và Prisma. PostgreSQL và Redis chạy bằng Docker Compose ở local.

## Cấu trúc

```text
apps/
  web/         Next.js App Router
  api/         NestJS HTTP API
  worker/      NestJS background worker
packages/
  config/      Cách tìm và nạp file .env dùng chung
  database/    Prisma schema, migration, client dùng chung API/worker
  queue/       Cấu hình Redis và hợp đồng job dùng chung API/worker
scripts/
  setup.mjs    Lệnh `pnpm setup` thiết lập toàn bộ máy local
docs/
  architecture.md    Kiến trúc tổng thể
  api-convention.md  Quy ước tạo API
  database.md        Thiết lập database và Prisma
  scaffolding.md     Hướng dẫn tạo scaffold
  workspace.md       pnpm workspace và Turborepo
```

## Chạy lần đầu

Cần Node.js 24 và pnpm 12.15.0. Mở Docker Desktop trước khi chạy.

Lệnh này làm hết phần thiết lập trên một máy mới: tạo `.env`, cài dependency,
bật PostgreSQL/Redis bằng Docker, dựng database (migration + seed), build và
sinh client API cho web.

```powershell
pnpm setup
```

Cấu hình mẫu dùng một database `researchos`
ở `localhost:55432` và Redis ở `localhost:6379`, chỉ cho phép kết nối từ máy
local. Không cần cài PostgreSQL hoặc Redis trực tiếp trên máy.

Lệnh chạy được nhiều lần, từng bước bị bỏ qua nếu đã xong. Muốn bỏ qua bước
nào thì đặt biến tương ứng trước khi chạy: `SETUP_SKIP_INSTALL=1` hoặc
`SETUP_SKIP_INFRA=1`.

Sau khi setup xong, mở app:

```powershell
pnpm dev
```

Web chạy ở http://localhost:3000, API ở http://localhost:4000, tài liệu
Swagger ở http://localhost:4000/docs.

Nếu cổng web/API đang có ứng dụng khác dùng, cần chọn cổng trống trước khi chạy.
Worker chạy BullMQ bằng application context, không mở HTTP port. Chạy
`pnpm dev:worker` ở terminal khác; xem [queue và kiểm thử](./docs/queues.md).

`pnpm infra:down` dừng Docker và giữ dữ liệu trong volume. Khi deploy, server
sẽ có Docker, biến môi trường và volume riêng; không dùng lại dữ liệu local.
Xem [thiết lập database](./docs/database.md) và [GitHub](./docs/github.md).

## Tài khoản development

Các tài khoản cho local login (FPTU SSO chưa có tài liệu) được `pnpm setup`
tạo luôn. Chúng dùng chung một mật khẩu đã biết, nên chỉ có ý nghĩa ở máy
local:

| Email | `user_type` | Quyền |
| --- | --- | --- |
| `admin@researchos.local` | `STAFF` | `ADMIN` + `RESEARCHER` |
| `faculty@researchos.local` | `FACULTY` | researcher qua luật nền, không có dòng grant |
| `student@researchos.local` | `STUDENT` | `RESEARCHER` |
| `guest@researchos.local` | `STAFF` | không có quyền |

Mật khẩu của cả bốn tài khoản là `ResearchOS!Dev2026`. Seed tài khoản chạy
luôn cùng taxonomy, nên `pnpm db:seed` và `pnpm db:seed:online` luôn tạo tài
khoản.

## Lệnh thường dùng

| Lệnh | Tác dụng |
| --- | --- |
| `pnpm setup` | Thiết lập toàn bộ máy local: `.env`, dependency, Docker, database, build, codegen |
| `pnpm infra:up` | Chạy PostgreSQL/Redis và chờ healthcheck |
| `pnpm infra:down` | Dừng hạ tầng local, giữ dữ liệu |
| `pnpm infra:status` | Xem trạng thái PostgreSQL/Redis |
| `pnpm infra:logs` | Xem log PostgreSQL/Redis |
| `pnpm dev` | Chạy web và API |
| `pnpm dev:worker` | Chạy worker |
| `pnpm build` | Build toàn workspace |
| `pnpm lint` | Lint toàn workspace |
| `pnpm test` | Test toàn workspace |
| `pnpm test:queue` | Test API → Redis → worker thật, tự khởi động worker thử |
| `pnpm queue:probe` | Gửi một job kiểm tra đến worker đang chạy |
| `pnpm codegen` | Sinh OpenAPI rồi client Orval cho web |
| `pnpm db:setup` | Dựng database: tạo database, áp migration, seed taxonomy |
| `pnpm db:seed` | Nhập taxonomy OpenAlex từ snapshot có sẵn trong repo, và tạo tài khoản development |
| `pnpm db:seed:online` | Nhập taxonomy bằng cách tải trực tiếp từ OpenAlex, và tạo tài khoản development |
| `pnpm db:migrate` | Tạo và áp dụng migration (chỉ ở máy dev) |
| `pnpm db:migrate:deploy` | Áp dụng migration đã có (CI, production) |
| `pnpm db:studio` | Prisma Studio |

## Tài liệu

Đọc [docs/architecture.md](./docs/architecture.md) trước khi thay đổi kiến trúc,
[docs/api-convention.md](./docs/api-convention.md) trước khi tạo endpoint, và
[docs/database.md](./docs/database.md) trước khi đổi schema.
