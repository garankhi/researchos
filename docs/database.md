# Database và Prisma

Ngày ghi nhận: 30/10/2026.

`ResearchOS.sql` ở root workspace là **nguồn sự thật duy nhất** (single source of
truth) cho schema PostgreSQL. `packages/database/prisma/schema.prisma` là **artefact
sinh ra**, không sửa tay. Prisma trong workspace này chỉ đóng vai trò **ORM client
có kiểu** — nó không tạo ra bất kỳ DDL nào.

> **Vì sao không dùng Prisma Migrate?**
>
> Schema hiện có 47 `CHECK` constraint, 91 foreign key `DEFERRABLE`, expression
> index, partial unique index, view và trigger. Ngôn ngữ schema của Prisma **không
> biểu diễn được** những thứ này: không có `@check`, không có khái niệm view hay
> trigger, không có `DEFERRABLE`. Datamodel vì vậy luôn *kém* hơn database thật.
>
> Đã kiểm chứng bằng thực nghiệm trên Prisma 7.10.1:
>
> - Prisma Migrate **không** sinh `DROP` cho những object này. Differ của Prisma 7
>   đối chiếu một database có 47 CHECK constraint + 2 view + 1 trigger với một
>   datamodel không chứa chúng và trả về "empty migration". Xoá hẳn một CHECK
>   constraint, một view và một trigger khỏi database rồi diff lại — kết quả vẫn
>   là "empty migration". Differ phát hiện được index thường, foreign key và
>   cột, nhưng **mù** với CHECK, view, trigger và expression index.
> - Migration do Prisma sinh ra **không chứa** những object đó. Đo trực tiếp
>   trên database dựng từ `ResearchOS.sql` so với database dựng từ baseline do
>   Prisma sinh: mất 47 CHECK constraint, 2 view, 1 trigger, 91 FK `DEFERRABLE`,
>   2 expression index, 1 partial unique index và 40 column comment.
>
> Nói cách khác, rủi ro không phải "Prisma xoá constraint của bạn", mà là
> **"Prisma âm thầm bỏ qua chúng"**: constraint vẫn còn trong database, nhưng
> Prisma không validate, không hiển thị trong `schema.prisma`, và không ai đọc
> datamodel biết nó tồn tại. Nếu Prisma Migrate sở hữu schema thì nguồn sự thật
> bị chia làm đôi: SQL một nơi, migration một nơi, và migration **không** phản ánh
> đủ database.
>
> Vì vậy `prisma.config.ts` **không có** block `migrations` và **không có**
> `shadowDatabaseUrl`, và toàn bộ script `db:migrate`, `db:migrate:deploy`,
> `db:status` đã bị gỡ khỏi `package.json` (root), `packages/database/package.json`
> và `turbo.json`.

Liên quan: [architecture.md](./architecture.md), [api-convention.md](./api-convention.md),
[ADR-0001](./adr/0001-modular-monolith-and-vps-worker.md).

---

## 0. Mục lục và "quirk" cần biết

Bảng dưới đây liệt kê những điều **sẽ gây bất ngờ** khi làm việc với Prisma
trong workspace này. Mỗi dòng trỏ tới mục giải thích đầy đủ.

| Quirk | Mục |
| --- | --- |
| `schema.prisma` được sinh ra, không sửa tay | [§1](#s1) |
| Không có `prisma migrate`, không có `shadowDatabaseUrl` | [§6](#s6) |
| `db:drift` không dùng `prisma migrate diff` (differ mù với CHECK/view/trigger) | [§6](#s6) |
| View không có model trong Prisma, phải dùng `$queryRaw` | [§7.6](#s76) |
| Trigger ghi đè `applied_at` và `response_due_at` lúc insert | [§7.6](#s76) |
| Trigger có thể ném lỗi nghiệp vụ, trả 400 chứ không phải 500 | [§8.2](#s82) |
| Lỗi `CHECK` / FK / unique / NOT NULL được map sang HTTP status | [§8.2](#s82) |
| `message` thô của Prisma không bao giờ gửi cho client | [§8.2](#s82) |
| Prisma 7 bắt buộc driver adapter (`PrismaPg`) | [§8](#s8) |
| Không có migration history, không có rollback | [§5.4](#s54) |
| Partial unique index cần `previewFeatures = ["partialIndexes"]` | [§7.5](#s75) |
| Enum import từ `@researchos/database`, không import từ `src/generated/...` | [§8](#s8) |

---

<a id="s1"></a>

## 1. Vì sao Prisma nằm ở `packages/database`

`apps/api` và `apps/worker` dùng chung một database PostgreSQL. Đặt Prisma ở
một package riêng giữ đúng ranh giới đã nêu trong `architecture.md`:

- Không app nào import source của app kia.
- Worker và API dùng cùng một schema và cùng một client.
- Khi schema đổi, chỉ một chỗ cần cập nhật.

Cấu trúc hiện tại:

```text
packages/database/
  prisma/
    schema.prisma        Artefact SINH RA. KHÔNG sửa tay.
  prisma.config.ts       Cấu hình Prisma CLI (Prisma 7). Không có migrations.
  src/
    prisma.service.ts    PrismaService của NestJS
    prisma.module.ts     PrismaModule, đăng ký global
    index.ts             Public surface của package
    generated/           Client do Prisma sinh ra, KHÔNG commit
  scripts/
    lib.mjs              Helper dùng chung (env, psql, tạo/xoá database)
    transform.mjs        Chuyển output của `db pull` sang quy ước repo
    introspect-schema.mjs  db pull -> transform -> format -> generate
    reset-database.mjs   Drop -> create -> apply SQL -> sinh lại schema
    drift-check.mjs      So schema.prisma với ResearchOS.sql
    setup-database.ps1   Wrapper PowerShell cho db:reset
```

`ResearchOS.sql` và `docker-compose.yml` nằm ở **root workspace**, không nằm
trong package.

## 2. Yêu cầu

- Docker Desktop (PostgreSQL 17 Alpine + Redis 7 Alpine chạy trong container).
- Node.js 24, pnpm 12.15.0.
- PostgreSQL 14 trở lên. Đã kiểm tra với PostgreSQL 17.

## 3. Thiết lập lần đầu

Bước 1 — cài dependency:

```powershell
pnpm install
```

Bước 2 — tạo file `.env` ở root:

```powershell
Copy-Item .env.example .env
```

Nội dung `.env` đã có sẵn giá trị đúng với container trong `docker-compose.yml`:

```dotenv
DATABASE_URL="postgresql://postgres:postgres@localhost:5433/researchos?schema=public"
REDIS_URL="redis://localhost:6379"
```

Cổng **5433** vì máy Windows thường đã có PostgreSQL native chạy ở 5432; container
giữ 5432 bên trong và publish ra 5433.

Bước 3 — bật PostgreSQL và Redis:

```powershell
docker compose up -d
docker compose ps
```

Cả hai service phải báo `healthy`.

Bước 4 — dựng database từ SQL:

```powershell
pnpm db:reset
```

Lệnh này drop database, tạo lại, apply `ResearchOS.sql`, rồi introspect lại để
sinh `schema.prisma` và client. Xem mục 4.

Bước 5 — kiểm tra:

```powershell
Invoke-WebRequest 'http://localhost:4000/health/ready' | Select-Object -ExpandProperty Content
```

Kết quả mong đợi là `"status":"ok"`. Nếu là `"degraded"`, xem mục 8.

## 4. Lệnh thường dùng

Chạy từ root:

| Lệnh | Tác dụng |
| --- | --- |
| `docker compose up -d` | Bật PostgreSQL + Redis |
| `docker compose down` | Tắt container, giữ dữ liệu |
| `docker compose down -v` | Tắt container và xoá volume |
| `pnpm db:reset` | Drop + create database, apply SQL, sinh lại schema và client |
| `pnpm db:schema` | Introspect database đang chạy, sinh lại `schema.prisma` + client |
| `pnpm db:generate` | Chỉ chạy `prisma generate` (không introspect) |
| `pnpm db:drift` | Kiểm tra `schema.prisma` còn khớp `ResearchOS.sql` không |
| `pnpm db:studio` | Prisma Studio để xem và sửa dữ liệu |
| `pnpm --filter @researchos/database db:validate` | `prisma validate` |

> `pnpm db:reset` **xoá toàn bộ dữ liệu**. Chỉ dùng ở máy dev.
> `db:reset --keep-data` apply SQL lên database đang có (sẽ lỗi nếu object đã tồn tại).

## 5. Quy trình làm việc

### 5.1 Dev mới bắt đầu

```powershell
pnpm install
Copy-Item .env.example .env
docker compose up -d
pnpm db:reset
pnpm dev
```

Nếu đã có sẵn volume từ lần trước, `pnpm db:reset` vẫn chạy được và cho kết quả
giống hệt — `ResearchOS.sql` là điểm khởi đầu duy nhất.

### 5.2 Thay đổi schema

1. Sửa `ResearchOS.sql` ở root.
2. `pnpm db:reset` — dựng lại database và sinh lại `schema.prisma` + client.
3. `pnpm db:drift` — xác nhận datamodel khớp SQL.
4. `pnpm build` (hoặc `pnpm db:generate`) để type trong IDE được cập nhật.

Nếu thay đổi SQL không đòi hỏi đổi datamodel (thêm `CHECK`, thêm comment, đổi
một `VIEW`), bước 3 sẽ vẫn báo "No drift" — điều đó đúng.

### 5.3 Dữ liệu thật đã có trong database

`db:reset` xoá hết dữ liệu. Nếu cần giữ dữ liệu cũ:

```powershell
pnpm --filter @researchos/database db:reset -- --keep-data
```

Cách này chỉ dùng được cho thay đổi **tương thích ngược** (thêm cột có
default, thêm bảng, thêm index). Thêm cột `NOT NULL` không có default, đổi kiểu
cột, thêm constraint vào dữ liệu đang tồn tại — không làm được.

<a id="s54"></a>

### 5.4 Vòng đời ở production

Vì không có migration, cách triển khai là: apply `ResearchOS.sql` lên database
production rồi khởi động app version mới.

```bash
docker compose exec -T postgres psql -U postgres -d researchos -v ON_ERROR_STOP=1 -f /dev/stdin < ResearchOS.sql
```

Điều này đòi hỏi migration **tương thích ngược**: app version cũ vẫn phải chạy
được với schema mới. Thêm cột thì an toàn; xoá hoặc đổi kiểu cột thì cần
triển khai nhiều bước (thêm cột mới → chuyển dữ liệu → đổi code đọc cột mới →
một bản deploy sau mới xoá cột cũ).

<a id="s6"></a>

## 6. Vì sao có `db:drift`

`prisma migrate diff` **không** dùng được ở đây, và lý do thực tế hơn lý do
thường nói. Differ của Prisma 7 **mù** với những object Prisma không biểu diễn
được: nếu xoá hẳn một CHECK constraint, một view và một trigger khỏi database
rồi diff lại, nó vẫn báo "empty migration". Một check mà không bao giờ đỏ thì
không mang thông tin gì.

Vì vậy `drift-check.mjs` so **introspection với introspection**:

1. Dựng database tạm `researchos_drift_check` từ `ResearchOS.sql`.
2. `prisma db pull` + đúng `transform.mjs` mà generator dùng.
3. `prisma format` rồi so với `schema.prisma` đã commit.

Cả hai vế đến từ cùng một engine, nên những object Prisma không biểu diễn được
đều vô hình ở cả hai vế và không sinh nhiễu. Cái còn lại chính xác là tín hiệu
cần biết: **datamodel không còn mô tả đúng SQL nữa**.

Job CI tương ứng nằm ở `.github/workflows/db-drift.yml`, chạy trên mỗi push
`main` và mỗi pull request.

## 7. Quy tắc schema

Các quy tắc này bắt buộc và được kiểm tra khi review.

### 7.1 Ba trục trạng thái độc lập

`validationStatus`, `visibility` và `publicationStatus` là ba trục độc lập.
Không gộp thành một cột `status`. Lý do: một bản ghi có thể đã được xác minh
(`VERIFIED`) nhưng vẫn là `DRAFT` và chỉ hiện với `PRIVATE`. Gộp ba trục lại sẽ
mất thông tin và làm mọi truy vấn lọc phải suy đoán.

### 7.2 Mọi dữ liệu có nguồn gốc

Mọi bản ghi có thể do người nhập, hệ thống import hoặc AI tạo ra đều cần:

- `sourceKind`: `SELF_DECLARED` | `IMPORTED` | `AI_INFERRED` | `SYSTEM`.
- `verificationStatus`: `UNVERIFIED` | `PENDING_REVIEW` | `VERIFIED` | `REJECTED`.
- `sourceRef`: trỏ về nguồn gốc (DOI, ORCID, ID ngoài, prompt của AI...).

AI tạo gợi ý; người có thẩm quyền xác nhận taxonomy, quan hệ tri thức và
nghiên cứu chính thức. Vì vậy dữ liệu `AI_INFERRED` mặc định là
`PENDING_REVIEW`, không phải `VERIFIED`.

### 7.3 Đặt tên

- Tên bảng: số nhiều, snake_case (`research_groups`).
- Tên cột: snake_case. Prisma dùng `camelCase` trong model, map sang
  `snake_case` bằng `@map` để khớp quy ước SQL của Postgres.
- Tên trường quan hệ dùng số nhiều (`members`, `publications`); tên khóa ngoại
  dùng số ít (`groupId`, `publicationId`).

Quy ước camelCase/`@map` này **do `transform.mjs` sinh ra**, không phải viết tay.

### 7.4 Chỉ mục và ràng buộc

- Mọi cột dùng để lọc theo quyền (`visibility`, `owner_id`, `group_id`) đều cần
  index.
- Ràng buộc duy nhất được đặt ở tầng database, không chỉ ở tầng ứng dụng.
- Dữ liệu nghiên cứu có xu hướng append-only: cân nhắc `created_at` và
  `archived_at` thay vì xoá cứng.

<a id="s75"></a>

### 7.5 Partial unique index

Một số ràng buộc không thể viết bằng `UNIQUE` thuần vì phải **loại trừ** một
tập con dòng:

| Index | Ý nghĩa |
| --- | --- |
| `uq_research_topics_local_name` | Chỉ topic `source = 'LOCAL'` mới phải có tên duy nhất trong một subfield. Topic import (OpenAlex...) được phép trùng tên vì `UNIQUE(source, external_id)` không bảo vệ được cột `external_id IS NULL`. |
| `uq_opportunity_applications_active` | Một ứng viên chỉ được có **một** đơn đang active cho mỗi cơ hội. Đơn `WITHDRAWN` vẫn giữ trong lịch sử và không bị chặn. |
| `uq_user_role_assignments_active` | Một user chỉ có **một** assignment đang hiệu lực cho mỗi role. Grant lại sau khi revoke là hợp lệ, lịch sử grant/revoke vẫn giữ nguyên. |

Prisma 7 hỗ trợ partial unique index qua `previewFeatures = ["partialIndexes"]` và
attribute `where: raw(...)`, nên cả ba vẫn xuất hiện trong `schema.prisma` và
vẫn được enforce bởi PostgreSQL.

<a id="s76"></a>

### 7.6 View và trigger

Hai view và một trigger được định nghĩa trong `ResearchOS.sql`:

| Object | Loại | Vai trò |
| --- | --- | --- |
| `effective_user_access` | view | Chuẩn hoá quyền thực tế: `FACULTY` → `RESEARCHER`, grant còn hiệu lực cho sinh viên → `RESEARCHER`, còn lại → `GUEST`, tài khoản không active → `NONE`. |
| `released_output_versions` | view | Chỉ các output version đã `SHARED` và có `released_at IS NOT NULL`. |
| `tg_opportunity_applications_before_insert` | trigger | Tính `applied_at` và `response_due_at = applied_at + SLA` khi insert đơn. |

Các object này **không** xuất hiện trong `schema.prisma` (Prisma không biểu
diễn được view/trigger), và đó là lý do chúng vẫn an toàn: chúng chỉ tồn tại
trong SQL, không ai có thể vô tình xoá chúng bằng Prisma.

### 7.7 Nếu muốn chuyển sang Prisma Migrate

Câu hỏi tự nhiên: "nếu sửa `ResearchOS.sql` cho **hoàn toàn** tương thích
Prisma thì có dùng lại được Prisma Migrate không?"

Câu trả lời ngắn: **không**, vì ngôn ngữ schema của Prisma không có cách nào
diễn đạt `CHECK` constraint, view, trigger hay `DEFERRABLE`. "Tương thích hoàn
toàn" nghĩa là phải **xoá** hết những thứ đó khỏi SQL.

Đã đo trực tiếp bằng cách dựng hai database và so sánh:

| Metric | `ResearchOS.sql` | Baseline do Prisma sinh | Mất |
| --- | --- | --- | --- |
| tables | 40 | 40 | — |
| enums | 30 | 30 | — |
| check_constraints | 47 | 0 | **47** |
| views | 2 | 0 | **2** |
| triggers | 1 | 0 | **1** |
| deferrable_fks | 91 | 0 | **91** |
| expression_indexes | 2 | 0 | **2** |
| partial_unique_indexes | 3 | 2 | **1** |
| column_comments | 40 | 0 | **40** |
| functions | 1 | 0 | **1** |

Đổi lại, `prisma migrate dev` vẫn không quản lý được những object đó. Thử
nghiệm đầy đủ: dựng database từ `ResearchOS.sql`, đánh dấu một baseline
migration là "đã apply" bằng `migrate resolve --applied`, sửa datamodel rồi
chạy `migrate dev --create-only` — migration sinh ra chỉ có:

```sql
-- AlterTable
ALTER TABLE "research_groups" ADD COLUMN "experimentColumn" TEXT;
```

Không có `DROP CONSTRAINT`, `DROP VIEW`, `DROP TRIGGER`, `DROP INDEX` hay
`DROP TABLE`. Prisma không phá dữ liệu của bạn, nhưng nó cũng **không thấy**
những constraint đó — chúng tồn tại trong database nhưng vô hình với Prisma,
không được Prisma validate, và không xuất hiện trong `schema.prisma` mà dev
đọc.

Kết luận: giữ `ResearchOS.sql` làm nguồn sự thật. Prisma ở đây là **typed
client**, không phải **schema owner**.

<a id="s8"></a>

## 8. Truy cập dữ liệu trong code

Service dùng `PrismaService` được inject qua constructor:

```typescript
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@researchos/database';

@Injectable()
export class OpportunitiesService {
  constructor(private readonly prisma: PrismaService) {}

  async findOne(id: string): Promise<Opportunity> {
    const opportunity = await this.prisma.opportunity.findUnique({ where: { id } });

    if (!opportunity) {
      throw new NotFoundException('Opportunity not found');
    }

    return opportunity;
  }
}
```

`PrismaModule` đã đăng ký global, nên feature module không cần `imports` nó.

Quy tắc:

- Không tạo `PrismaClient` mới ở bất kỳ đâu.
- Không truyền `PrismaService` làm tham số hàm; dùng DI.
- Ghi nhiều bảng liên quan dùng `$transaction`.
- Không import trực tiếp từ `packages/database/src/generated/...`. Import từ
  `@researchos/database` để đường dẫn generated là chi tiết nội bộ.
- Enum dùng trong DTO và filter import từ `@researchos/database` (đã export sẵn
  30 enum từ `schema.prisma`).

### 8.1 Hạn chế của Prisma ở đây — và bạn có nên lo không?

Tóm tắt: **không phải lo về an toàn dữ liệu** (constraint vẫn được PostgreSQL
enforce đúng), mà **lo về trải nghiệm lỗi** (vi phạm biến thành 500 thay vì 400)
và **lo về type** (một số trường bị trigger/quy tắc nghiệp vụ chi phối mà
Prisma không biết).

Bảng dưới đây đã được **kiểm chứng bằng thực nghiệm** trên Prisma 7.10.1 +
PostgreSQL 17, không phải suy đoán:

| Vấn đề | Bạn thấy gì | Mức độ | Cách xử lý |
| --- | --- | --- | --- |
| `CHECK` constraint vi phạm | `PrismaClientKnownRequestError`, code `P2039`, message kèm tên constraint: `violates check constraint "ck_file_size"` | **Đã xử lý** | `HttpExceptionFilter` bắt `P2039` + Postgres code `23514`, trả 400 với message chung, không lộ tên constraint. Xem mục 8.2. |
| Trigger tính `response_due_at` | `create()` trả về giá trị **đã được trigger ghi đè**, không phải giá trị bạn truyền vào | **Nên biết** | Không cần re-read: giá trị trả về đã đúng. Chỉ cần biết là `response_due_at` bị trigger quyết định. |
| Trigger ném lỗi nghiệp vụ | `P2039` với `23514` và message do trigger viết, ví dụ `opportunity ... is not open (status is DRAFT)` | **Đã xử lý** | Cùng đường xử lý với CHECK: map sang 400, giữ message của trigger, UUID thành `<id>`. |
| View không có model | Không truy cận được qua Prisma client | **Thấy trước** | Dùng `$queryRaw` / `$queryRawUnsafe` với SQL viết tay cho `effective_user_access` và `released_output_versions`. |
| `DEFERRABLE` FK | Transaction có thể tạo tham chiếu vòng trong một chu kỳ | **Hiếm gặp** | Dùng `$transaction` với callback để toàn bộ thay đổi commit cùng nhau. |
| Không có migration history | Không có "bước" để rollback | **Đã chấp nhận** | Xem mục 5.4 — triển khai nhiều bản deploy thay vì rollback. |
| Raw SQL không được type-check | Dễ sai chính tả | **Thấy trước** | Bọc raw SQL vào một service riêng và viết integration test cho nó. |

<a id="s82"></a>

### 8.2 Vi phạm constraint → HTTP 400/409 (đã xử lý)

Đây là hệ quả thực tế nhất của việc Prisma không biết `CHECK` constraint.
Trước khi có xử lý, lỗi trả về như sau (đã kiểm chứng end-to-end):

```text
error name : PrismaClientKnownRequestError
error code : P2039
is HttpException? false

=== what the API returned ===
status: 500
body  : {
  "success": false,
  "data": null,
  "message": "Invalid `prisma.outputFiles.create()` invocation:\n\nDatabase error. Code: `23514`. Message: `new row for relation \"output_files\" violates check constraint \"ck_file_size\"",
  "statusCode": 500,
  ...
}
```

Nguyên nhân: `HttpExceptionFilter` chỉ map `HttpException` sang status code
tương ứng; mọi exception khác thành 500. `PrismaClientKnownRequestError` không
phải `HttpException`, nên một lỗi **dữ liệu người dùng nhập sai** trả về 500
thay vì 400.

**Đã xử lý.** `apps/api/src/common/filters/database-error.ts` đọc Postgres
error code trong `error.meta.driverAdapterError.cause.originalCode` và map:

| Postgres code | Ý nghĩa | HTTP status | Message trả về |
| --- | --- | --- | --- |
| `23514` | Vi phạm `CHECK` constraint, hoặc lỗi do trigger ném | 400 | `The submitted data violates a database constraint.` |
| `23503` | Vi phạm foreign key | 400 | `The request references a record that does not exist or is still in use.` |
| `23505` | Vi phạm unique constraint | 409 | `A record with these values already exists.` |
| `23502` | `NOT NULL` bị vi phạm | 400 | `A required field is missing.` |

Mã Prisma cũng được map khi không có Postgres code: `P2002` → 409, `P2003`
→ 400, `P2014` → 400, `P2025` → 404, `P2034` → 409.

**Không lộ chi tiết nội bộ.** `message` thô của Prisma không bao giờ được
gửi cho client, vì nó chứa tên bảng, tên constraint và cả giá trị của dòng dữ
liệu (`Failing row contains (...)`). Quy tắc tách hai loại message:

- **Message do PostgreSQL sinh ra** (luôn nhắc tên object, ví dụ
  `violates check constraint "ck_file_size"`) → thay bằng message chung.
- **Message do ứng dụng viết** (trigger dùng `RAISE EXCEPTION`, ví dụ
  `opportunity ... is not open (status is DRAFT)`) → giữ lại, vì nó được viết
  cho người đọc; chỉ UUID được thay bằng `<id>`.

Lỗi Prisma không map được (code lạ, `PrismaClientValidationError`) trả 500 với
message `Internal server error` — không liệt kê model hay field name.

Kết quả sau khi xử lý (kiểm chứng trên database thật):

```text
1. CHECK violation (ck_file_size)             -> HTTP 400, không lộ tên bảng/constraint
2. CHECK violation (ck_opportunity_sla)       -> HTTP 400, không lộ tên bảng/constraint
3. Trigger business rule                      -> HTTP 400, giữ message "opportunity <id> is not open"
4. Foreign key violation                      -> HTTP 400, message chung
```

Chi tiết đầy đủ vẫn được ghi vào log server (mức `warn` cho lỗi 4xx, `error`
kèm stack cho lỗi 5xx).

## 9. Quy ước biến môi trường

| Biến | Dùng ở đâu | Bắt buộc |
| --- | --- | --- |
| `DATABASE_URL` | Prisma CLI, API, worker, script DB | Có (khi cần database) |
| `REDIS_URL` | BullMQ trong worker | Có (khi worker chạy) |
| `WEB_ORIGIN` | CORS của API | Không |
| `PORT` | Cổng lắng nghe | Không |

`SHADOW_DATABASE_URL` **không còn dùng** và đã bị gỡ khỏi `.env.example`.

File `.env` ở root chứa biến dùng chung. Mỗi app có thể có `.env` riêng để
ghi đè. Biến trong môi trường thật luôn thắng cả hai.

Cơ chế này dùng chung cho NestJS và Prisma CLI, nằm trong
`packages/config` (`resolveEnvFilePaths`). Lý do cần package riêng:
`@nestjs/config` phân giải `envFilePath` theo `process.cwd()`, mà dưới
Turborepo cwd của `apps/api` là thư mục app, nên file `.env` ở root không
bao giờ được đọc.

Các script trong `packages/database/scripts/` nạp `.env` theo thứ tự ưu tiên
`packages/database/.env.local` > `packages/database/.env` > `.env` ở root, và
biến đã có trong `process.env` luôn thắng.

## 10. Xử lý sự cố

**`/health/ready` trả `degraded`.** Xem log của API: thường là container
PostgreSQL chưa chạy hoặc `DATABASE_URL` sai. Kiểm tra:

```powershell
docker compose ps
```

**`DATABASE_URL is not set`.** File `.env` ở root chưa có, hoặc chạy lệnh từ
thư mục khác root.

**`database "researchos" does not exist`.** Chạy `pnpm db:reset`.

**`Error: P1001: Can't reach database server`.** PostgreSQL chưa chạy, hoặc
đang trỏ sai cổng. Nhớ container publish ra **5433**.

**`ECONNREFUSED ... 5432`.** `DATABASE_URL` đang dùng cổng 5432 (native
Postgres của Windows) thay vì 5433 (container).

**Sau khi đổi `ResearchOS.sql`, app báo lỗi type.** Chạy `pnpm db:reset` (để
sinh lại `schema.prisma`) rồi `pnpm db:generate`. Client được sinh lại tự động
trước mỗi lần build của package database, nhưng IDE cần chạy lệnh này để cập
nhật type.

**`db:drift` báo drift.** `schema.prisma` không khớp SQL — thường là do sửa
SQL mà chưa chạy `pnpm db:reset`. Chạy lại `pnpm db:reset` rồi `pnpm db:drift`.
Nếu vẫn còn drift sau khi reset, `transform.mjs` chưa xử lý được một đặc điểm
mới của SQL — cần bổ sung rule vào đó.

**Container không healthy.** `docker compose logs postgres`. Thường do port
5433 hoặc 6379 đã bị chiếm bởi service khác.

## 11. Tài liệu chính thức

- [ResearchOS.sql](./../ResearchOS.sql) — nguồn sự thật của schema.
- [docker-compose.yml](./../docker-compose.yml) — PostgreSQL + Redis cho local.
- [Prisma ORM 7](https://www.prisma.io/docs/orm/v7)
- [Prisma 7 upgrade guide](https://www.prisma.io/docs/guides/upgrade-prisma-orm/v7)
- [Prisma PostgreSQL connector](https://www.prisma.io/docs/orm/overview/databases/postgresql)
- [PostgreSQL — partial indexes](https://www.postgresql.org/docs/current/indexes-partial.html)
