# Đồng bộ schema nghiệp vụ vào Prisma

Cập nhật 02/11/2026: database local đã áp dụng thành công cả
`20261031000000_init` và `20261101185146_domain_schema`. `schema.prisma`
đã có model nghiệp vụ sau introspection. Không cần init hay deploy lại.

Prisma 7.10.1 sinh sai hai back-relation khi `db pull`; bản schema hiện tại
đã sửa và validate thành công. Xem phần lưu ý P1012 bên dưới trước khi
introspect lại.

Đã tạo migration **`20261101185146_domain_schema`** bằng Prisma CLI:

```powershell
pnpm --filter @researchos/database exec prisma migrate dev --create-only --name domain_schema
```

CLI tự đặt timestamp trong tên thư mục. `--create-only` tạo file, chưa áp
dụng migration mới. File SQL trống do CLI sinh ra sau đó được điền bằng bản
sao nguyên vẹn của `docs/database/ResearchOS.sql`, gồm bảng, enum, index,
CHECK, view, function và trigger. Đây là custom SQL migration; Prisma không
tự sinh đầy đủ các phần PostgreSQL này chỉ từ model.

## Trạng thái lúc mới tạo file (trước khi deploy)

- Database ứng dụng vẫn chỉ có **một**: `researchos` ở `localhost:55432`.
- `20261031000000_init` giữ nguyên; migration domain mới **chưa áp dụng**.
- Đã chạy toàn bộ SQL mới trong một transaction rồi thay `COMMIT` cuối
  bằng `ROLLBACK` để kiểm tra. Sau kiểm tra vẫn chỉ có `audit_logs` và
  `_prisma_migrations`, lịch sử migration vẫn chỉ có init.
- Chưa chạy các smoke/concurrency test nghiệp vụ; các script đó yêu cầu
  database thử nghiệm riêng. Không khẳng định đã kiểm thử toàn bộ policy.
- `schema.prisma` chưa có model nghiệp vụ. Cần introspect sau khi áp dụng.

Prisma `migrate dev` có thể tự tạo rồi xóa một shadow database để kiểm tra
lịch sử. Đó là chi tiết của CLI, không phải database ứng dụng thứ hai mà
bạn cần giữ hoặc vận hành. `migrate deploy` bên dưới không cần shadow DB.

## Các bước deploy và introspect cho máy mới

Chạy từ root repo. Phần này ghi lại thứ tự thiết lập. Database local hiện
đã hoàn tất deploy; chỉ cần validate/generate/status để kiểm tra, không
cần chạy lại toàn bộ các bước.

### 1. Khởi động Docker và xem trạng thái

```powershell
pnpm infra:up
pnpm db:status
```

Lúc này `db:status` sẽ báo `20261101185146_domain_schema` chưa được áp dụng
và có thể trả exit code 1. Đây là trạng thái chờ áp dụng, không phải init lỗi.

### 2. Thêm các bảng nghiệp vụ vào database hiện có

Nếu database đã có dữ liệu cần giữ, backup trước. Sau khi review SQL, chạy:

```powershell
pnpm db:migrate:deploy
```

**Đây là lệnh thực sự thay đổi database.** Prisma chạy migration domain
chưa áp dụng; không chạy lại init. SQL đã kiểm tra không tạo lại hoặc xóa
`audit_logs`. Không tự chạy `ResearchOS.sql` lần nữa bằng psql.

### 3. Đồng bộ model Prisma và sinh client

Ngay sau khi deploy migration thành công, chạy theo thứ tự:

```powershell
pnpm --filter @researchos/database exec prisma db pull
```

Review/sửa hai back-relation theo phần P1012 bên dưới rồi mới chạy:

```powershell
pnpm --filter @researchos/database db:validate
pnpm db:generate
pnpm db:status
```

`db pull` đọc các bảng vừa có và cập nhật `schema.prisma`; không sửa dữ
liệu trong PostgreSQL. `db:generate` tạo client TypeScript. `db:status`
cuối cùng phải báo database up to date. Review và commit `schema.prisma`
cùng migration trước khi chia sẻ thay đổi cho người khác.

**Không dùng `pnpm db:migrate` để áp dụng migration này hoặc tạo migration
kế tiếp trước khi hoàn tất `db pull` và validate.** Nếu schema Prisma chưa
có model nghiệp vụ mà đem làm đích của `migrate dev`, Prisma có thể đề nghị
xóa các bảng vừa thêm. Không chạy `db:reset` hoặc `db push` cho bước này.

Có thể mở `pnpm db:studio` để xem các bảng sau khi hoàn tất. Các cảnh báo
introspection về trigger/CHECK/index đặc thù cần được review; những phần
đó vẫn nằm trong PostgreSQL và SQL migration.

## Prisma 7.10.1: sửa P1012 sau db pull

Introspection hiện sinh lại hai field dưới đây thành kiểu optional đơn
(`?`). Cần giữ chúng là danh sách (`[]`) trong schema đã review:

| Model | Field back-relation | Kiểu đúng |
| --- | --- | --- |
| `output_revisions` | `research_outputs_research_outputs_id_current_release_idTooutput_revisions` | `research_outputs[]` |
| `research_outputs` | `output_revisions_output_revisions_output_idToresearch_outputs` | `output_revisions[]` |

Field đầu tránh lỗi validator yêu cầu UNIQUE chính xác cho cặp
`[id, current_release_id]`. FK ghép hiện có vẫn đảm bảo revision thuộc đúng
công trình; PK `research_outputs.id` vẫn giới hạn phía tham chiếu. Không
thêm `@@unique([id, current_release_id])` chỉ để làm validator im lặng.

Field thứ hai giữ đúng một công trình có nhiều revision. Unique index
`uq_output_editable_draft` chỉ giới hạn **một bản nháp chưa release**, không
giới hạn tổng số revision đã release. Giữ nguyên index và SQL migration.

Không cần chạy lại `db pull` để sửa lỗi này: bản schema trong repo đã được
sửa. Khi thật sự cần introspect lần sau, ưu tiên `prisma db pull --print`
để review trước khi ghi đè schema, kiểm tra lại hai field rồi validate và
generate. `pnpm test` của package database đã bao gồm `prisma validate` để
CI bắt lỗi P1012 này trước khi merge.

Có thể kiểm tra chỉ đọc xem model có đòi thay đổi SQL không:

```powershell
pnpm --filter @researchos/database exec prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script
```

Sau bản sửa hiện tại, kết quả là `-- This is an empty migration.`. Lệnh
diff không áp dụng SQL hoặc tạo migration mới.

## Kiểm tra tự động: `pnpm db:drift`

Lệnh trên so sánh schema.prisma với database đang chạy, nên nó chỉ phát
hiện được lệch khi database đã được dựng từ SQL mới nhất. `pnpm db:drift`
làm đúng việc đó một cách tự động và lặp lại được:

1. Tạo database tạm `researchos_drift` trên cùng server với database dev.
2. Áp dụng migration init (chứa `audit_logs` và bốn enum nền) rồi áp dụng
   `docs/database/ResearchOS.sql`.
3. So sánh database tạm với `schema.prisma` bằng `prisma migrate diff`.
4. Xoá database tạm.

Kết quả `-- This is an empty migration.` nghĩa là không có lệch. Nếu có,
lệnh in ra phần diff và thoát với mã lỗi. Lệnh chỉ đọc với database dev:
không ghi, không migrate, không xoá dữ liệu.

Chạy ở máy dev:

```powershell
pnpm db:drift
```

CI chạy lệnh này trong job `db-drift` với một PostgreSQL service, nên một
thay đổi sửa SQL mà quên introspect lại sẽ bị chặn trước khi merge.

Khi cần đồng bộ lại, dùng `prisma db pull --print` như bước 4 ở trên; lệnh
drift chỉ báo lệch, không tự sửa `schema.prisma`.

## Dựng database mới: `pnpm db:setup`

Đây là lệnh onboarding. Nó tạo database nếu chưa có, áp dụng migration rồi
seed taxonomy từ snapshot có sẵn trong repo — **không cần mạng, không cần
OpenAlex API key**.

```powershell
pnpm infra:up       # bật PostgreSQL và Redis
pnpm db:setup
```

Lệnh chạy theo thứ tự:

1. Tạo database nếu chưa tồn tại (đối với PostgreSQL không do Compose quản
   lý; Compose tự tạo qua `POSTGRES_DB`).
2. `prisma migrate deploy` — áp dụng migration.
3. `pnpm db:seed` — nhập taxonomy từ snapshot, và tạo tài khoản development.

```powershell
pnpm db:setup
```

## Dữ liệu tham chiếu: `pnpm db:seed`

Lệnh này nhập taxonomy OpenAlex vào `research_fields`, `research_subfields`
và `research_topics`, đồng thời tạo tài khoản development.

```powershell
pnpm db:seed
```

Lệnh đọc từ **snapshot có sẵn** trong repo
(`packages/database/scripts/data/openalex-taxonomy.json`), nên chạy nhanh và
không cần mạng.

Cả ba cấp dùng `source = 'OPENALEX'` và `external_id` là canonical URL của
OpenAlex. Taxonomy được **nhập một lần, không đồng bộ định kỳ** — topic do
người dùng đề xuất mới là thứ đi qua hàng đợi duyệt, topic nhập từ nguồn
không cần duyệt.

Mỗi lần chạy là idempotent: ghi bằng upsert trên `(source, external_id)`,
nên chạy lại cho ra cùng các dòng với cùng id nội bộ. Lệnh tự build package
trước, vì seed dùng Prisma client đã biên dịch trong `dist/` (Prisma 7 sinh
client dạng TypeScript, Node không chạy được trực tiếp).

Cùng cơ chế đó, `prisma db seed` cũng chạy được vì `prisma.config.ts` khai
báo `migrations.seed`.

### Nguồn trực tiếp từ OpenAlex: `pnpm db:seed:online`

Bản seed tải taxonomy từ API OpenAlex thay vì đọc snapshot:

```powershell
pnpm db:seed:online
```

Cần mạng, mất khoảng 90 giây, và dùng chung hạn mức ngày của request không
có API key. Chỉ dùng khi muốn nạp lại taxonomy từ nguồn.

Hai bản seed dùng chung phần ghi vào database, nên kết quả giống hệt nhau.

### Làm mới snapshot: `pnpm db:taxonomy:export`

Lệnh này tải taxonomy từ OpenAlex và ghi lại file snapshot, theo thứ tự ổn
định nên diff nhỏ:

```powershell
pnpm db:taxonomy:export
```

Snapshot được commit vào repo. Cập nhật nó bằng tay, kèm code đã đổi, chứ
không phải tự động mỗi lần seed.

### Tài khoản development

Tài khoản development cho local login (FPTU SSO chưa có tài liệu) được tạo
cùng lúc với taxonomy, bởi cả `pnpm db:seed` và `pnpm db:seed:online`:

```powershell
pnpm db:seed
```

Bốn tài khoản, phủ đúng các vai trò cần phát triển:

| Email | `user_type` | Quyền |
| --- | --- | --- |
| `admin@researchos.local` | `STAFF` | `ADMIN` + `RESEARCHER` |
| `faculty@researchos.local` | `FACULTY` | researcher qua luật nền, không có dòng grant |
| `student@researchos.local` | `STUDENT` | `RESEARCHER` |
| `guest@researchos.local` | `STAFF` | không có quyền |

`FACULTY` là researcher nhờ luật nền trong `effective_user_access`, nên không
cần dòng `user_role_assignments` nào. Các grant khác dùng
`grant_source = 'SYSTEM'` với `granted_by = NULL`, đúng theo check
`ck_grant_source_actor`.

Mật khẩu của cả bốn tài khoản là `ResearchOS!Dev2026`, hash bằng Argon2id.
PHC string lưu kèm thuật toán và tham số
(`$argon2id$v=19$m=...,t=...,p=...`), nên backend đọc được thông số để verify.

Tài khoản này dùng chung một mật khẩu đã biết, nên chỉ có ý nghĩa ở máy
local. `user_sessions` **không** được seed. Session phải do endpoint login cấp,
vì chỉ endpoint đó biết token thô, còn database chỉ lưu hash của nó.

Phần seed tài khoản cũng idempotent: tài khoản đã có thì giữ nguyên id và các
grant, chỉ làm mới credential để mật khẩu mới có hiệu lực ngay.

## Quy trình tổng quát cho lần đồng bộ tiếp theo

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
