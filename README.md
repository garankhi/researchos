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
Luồng session/đổi mật khẩu và handoff frontend: [authentication.md](./docs/authentication.md).

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
| `pnpm --filter web test` | Test riêng frontend (vitest) |
| `pnpm --filter api test` | Test riêng backend |
| `pnpm test:queue` | Test API → Redis → worker thật, tự khởi động worker thử |
| `pnpm queue:probe` | Gửi một job kiểm tra đến worker đang chạy |
| `pnpm codegen` | Sinh OpenAPI rồi client Orval cho web |
| `pnpm db:setup` | Dựng database: tạo database, áp migration, seed taxonomy |
| `pnpm db:seed` | Nhập taxonomy OpenAlex từ snapshot có sẵn trong repo, và tạo tài khoản development |
| `pnpm db:seed:online` | Nhập taxonomy bằng cách tải trực tiếp từ OpenAlex, và tạo tài khoản development |
| `pnpm db:migrate` | Tạo và áp dụng migration (chỉ ở máy dev) |
| `pnpm db:migrate:deploy` | Áp dụng migration đã có (CI, production) |
| `pnpm db:studio` | Prisma Studio |
| `pnpm jira:commit-report` | Sinh nội dung comment Jira từ commit trong range |

## Quy trình làm một feature

Từ lúc bắt đầu đến lúc có PR. Mỗi bước có một mục đích riêng — đừng bỏ
bước nào chỉ vì "chạy được rồi".

### 1. Lấy code mới nhất

```powershell
git checkout dev
git pull
```

`dev` là nhánh mọi thay đổi được merge vào. Không commit thẳng lên `dev`.

### 2. Tạo branch theo ticket

```powershell
git checkout -b feat/RES-<n>-<slug>
```

`<n>` là số ticket, `<slug>` mô tả ngắn thay đổi. Ví dụ
`feat/RES-29-web-test-kit`.

Mỗi ticket một branch, một commit. Không trộn hai ticket vào một branch.

### 3. Viết code

Chạy app trong terminal riêng:

```powershell
pnpm dev
```

Đọc [docs/api-convention.md](./docs/api-convention.md) trước khi tạo endpoint
và [docs/database.md](./docs/database.md) trước khi đổi schema. Các skill
trong `.cursor/skills/` mô tả quy ước của từng phần: `researchos-api-endpoint`
cho endpoint, `researchos-ui` và `researchos-forms` cho frontend,
`researchos-contract` cho envelope, `researchos-localization` cho i18n.

### 4. Chạy `pnpm codegen` — **bắt buộc nếu đổi DTO**

```powershell
pnpm codegen
```

Lệnh này sinh `apps/api/openapi.json`, rồi sinh client Orval ở
`apps/web/src/lib/api/` từ spec đó. Cả hai file đều được commit vào repo.

> **Đổi DTO mà không chạy `pnpm codegen` là frontend dùng type cũ.**
> `pnpm build` **không** sinh lại client. Đã kiểm chứng: thêm một field vào
> `HealthStatusDto`, chạy `pnpm build` — `openapi.json` và client Orval
> không đổi, field mới không có trong type của frontend. Chạy
> `pnpm codegen` thì mới có. Frontend lúc đó vẫn build được nhưng đang gọi
> API với type không khớp server.
>
> **Không cần build thủ công.** `pnpm codegen` tự build API: task `api#openapi`
> chạy `nest build` rồi mới xuất spec. Lệnh này đủ để cập nhật cả spec lẫn
> client.
>
> Lưu ý: `ApiErrorResponseDto` là envelope lỗi và được viết cứng trong
> `apps/api/src/common/openapi/envelope-transform.ts`, nên thêm field vào đó
> sẽ **không** xuất hiện trong spec. Field của envelope lỗi phải sửa ở
> transform, không sửa ở DTO.

`pnpm codegen` chạy `api#openapi` rồi `web#orval`, nên spec luôn được sinh
trước rồi client sinh từ spec đó.

### 5. Kiểm tra trước khi commit

```powershell
pnpm codegen && pnpm build && pnpm lint && pnpm format:check && pnpm test
```

Đây đúng là những bước CI chạy, nên chạy đúng thứ tự này thì không có gì
là bất ngờ khi mở PR. Nếu đổi DTO mà quên `pnpm codegen`, bước `build` ở
trên vẫn pass — CI sẽ fail, nhưng muộn hơn là ở đây.

`pnpm format:check` chỉ *báo* file chưa đúng format (không sửa). Muốn tự
sửa thì chạy `pnpm format`.

Nếu bạn đụng tới phần API ↔ Redis ↔ worker, chạy thêm bộ e2e — CI cũng
chạy nó, trong một job riêng có Postgres và Redis:

```powershell
pnpm test:e2e
```

### 6. Commit

```powershell
git add -A
git commit -m "feat(web): <mô tả ngắn> RES-<n>"
```

Quy ước commit: `<type>(<scope>): <mô tả> RES-<n>`.

| Type | Dùng khi |
| --- | --- |
| `feat` | Thêm tính năng |
| `fix` | Sửa lỗi |
| `refactor` | Đổi cấu trúc, không đổi hành vi |
| `docs` | Chỉ tài liệu |
| `ci` | Workflow, script, tooling |
| `chore` | Việc bảo trì khác |

Scope là phần bị ảnh hưởng: `web`, `api`, `database`, `worker`, `queue`, `skills`.
Một thay đổi có thể có nhiều scope: `feat(api,web): ...`.

> **Một ticket, một commit.** Nếu một feature cần nhiều commit, tách theo
> mốc review được, nhưng mỗi commit phải build được và không được vỡ.
> PR dùng squash merge, nên commit trên branch là bản ghi review; commit
> trên `dev` là một dòng duy nhất.

### 7. Mở PR

```powershell
git push -u origin feat/RES-<n>-<slug>
```

Rồi mở PR vào **`dev`**, không phải `main`. Template PR sẽ điền sẵn: ticket
key, flow label, base branch và lệnh verify.

Base branch `dev` là điểm dễ sai nhất — merge vào `main` sẽ bỏ qua toàn bộ
quy trình review của nhánh phát triển.

CI chạy trên mỗi PR: codegen, kiểm tra artifact generated, lint, format check,
test, build, và schema drift. Đợi CI xanh rồi mới merge.

CI chia làm ba job:

| Job | Chạy gì | Cần service |
| --- | --- | --- |
| `checks` | codegen, drift check, lint, format check, test, build, skill links | không |
| `e2e` | bộ e2e API ↔ Redis ↔ worker | Postgres, Redis |
| `schema-drift` | datamodel đã commit có khớp schema nguồn | Postgres |

### 8. Sau khi merge

```powershell
git checkout dev
git pull
git branch -d feat/RES-<n>-<slug>
```

Sinh nội dung comment để post lên Jira:

```powershell
pnpm jira:commit-report
```

Lệnh này đọc commit trong `origin/dev..HEAD` và in sẵn phần comment — nó không
tự gọi Jira. Copy vào Jira, hoặc dùng làm nguồn cho comment.

### Mở rộng: đổi schema database

Thêm hai bước nữa, trước bước 5:

```powershell
pnpm db:generate
pnpm db:migrate
```

`db:generate` cập nhật Prisma client, `db:migrate` tạo và áp migration (chỉ ở
máy dev).

> **Nguồn sự thật là file SQL, không phải Prisma.** Schema nghiệp vụ nằm ở
> `docs/database/ResearchOS.sql`; `packages/database/prisma/schema.prisma` là
> một bản *copy* được dùng để sinh client. Sửa schema thì sửa SQL, rồi
> introspect lại datamodel — không sửa datamodel rồi migration, vì hai bên
> sẽ lệch nhau. CI có job `schema-drift` dựng lại database từ SQL rồi so với
> datamodel đã commit, nên quên bước này sẽ fail ở CI.
>
> Xem [docs/database-prisma-sync.md](./docs/database-prisma-sync.md) cho quy
> trình đầy đủ, kể cả hai lỗi back-relation mà Prisma 7 sinh sai khi
> introspect.

## Tài liệu

Đọc [docs/architecture.md](./docs/architecture.md) trước khi thay đổi kiến trúc,
[docs/api-convention.md](./docs/api-convention.md) trước khi tạo endpoint,
[docs/database.md](./docs/database.md) trước khi đổi schema, và
[docs/github.md](./docs/github.md) trước khi đổi workflow hoặc ruleset.
