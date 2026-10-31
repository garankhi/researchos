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
docs/
  architecture.md    Kiến trúc tổng thể
  api-convention.md  Quy ước tạo API
  database.md        Thiết lập database và Prisma
  scaffolding.md     Hướng dẫn tạo scaffold
  workspace.md       pnpm workspace và Turborepo
```

## Chạy lần đầu

```powershell
Copy-Item .env.example .env
pnpm install --frozen-lockfile
pnpm infra:up
pnpm db:migrate:deploy
```

Mở Docker Desktop trước khi chạy. Cấu hình mẫu dùng một database `researchos`
ở `localhost:55432` và Redis ở `localhost:6379`, chỉ cho phép kết nối từ máy
local. Không cần cài PostgreSQL hoặc Redis trực tiếp trên máy.

```powershell
pnpm dev
```

Web chạy ở http://localhost:3000, API ở http://localhost:4000, tài liệu
Swagger ở http://localhost:4000/docs.

Nếu cổng web/API đang có ứng dụng khác dùng, cần chọn cổng trống trước khi chạy.
Worker hiện vẫn là scaffold, chưa có BullMQ processor; `REDIS_URL` chuẩn bị cho
lần tích hợp queue đầu tiên.

`pnpm infra:down` dừng Docker và giữ dữ liệu trong volume. Khi deploy, server
sẽ có Docker, biến môi trường và volume riêng; không dùng lại dữ liệu local.
Xem [thiết lập database](./docs/database.md) và [GitHub](./docs/github.md).

## Lệnh thường dùng

| Lệnh | Tác dụng |
| --- | --- |
| `pnpm infra:up` | Chạy PostgreSQL/Redis và chờ healthcheck |
| `pnpm infra:down` | Dừng hạ tầng local, giữ dữ liệu |
| `pnpm infra:status` | Xem trạng thái PostgreSQL/Redis |
| `pnpm infra:logs` | Xem log PostgreSQL/Redis |
| `pnpm dev` | Chạy web và API |
| `pnpm dev:worker` | Chạy worker |
| `pnpm build` | Build toàn workspace |
| `pnpm lint` | Lint toàn workspace |
| `pnpm test` | Test toàn workspace |
| `pnpm codegen` | Sinh OpenAPI rồi client Orval cho web |
| `pnpm db:migrate` | Tạo và áp dụng migration (chỉ ở máy dev) |
| `pnpm db:migrate:deploy` | Áp dụng migration đã có (CI, production) |
| `pnpm db:studio` | Prisma Studio |

## Tài liệu

Đọc [docs/architecture.md](./docs/architecture.md) trước khi thay đổi kiến trúc,
[docs/api-convention.md](./docs/api-convention.md) trước khi tạo endpoint, và
[docs/database.md](./docs/database.md) trước khi đổi schema.
