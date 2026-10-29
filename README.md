# ResearchOS

Monorepo pnpm gồm Next.js (web), NestJS (API) và NestJS (worker), dùng
PostgreSQL và Prisma.

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
pnpm install
Copy-Item .env.example .env
pwsh packages/database/scripts/setup-database.ps1
```

Sau đó điền `DATABASE_URL` trong `.env` bằng mật khẩu PostgreSQL của bạn.

```powershell
pnpm dev
```

Web chạy ở http://localhost:3000, API ở http://localhost:4000, tài liệu
Swagger ở http://localhost:4000/docs.

## Lệnh thường dùng

| Lệnh | Tác dụng |
| --- | --- |
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