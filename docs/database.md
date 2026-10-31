# Database và Prisma

Ngày cập nhật: 31/10/2026.

Prisma 7.10.1 đã được cài đặt trong `packages/database`. Package này giữ
schema, migration và client dùng chung cho cả `apps/api` và `apps/worker`.

Liên quan: [architecture.md](./architecture.md), [api-convention.md](./api-convention.md),
[ADR-0001](./adr/0001-modular-monolith-and-vps-worker.md).

---

## 1. Vì sao Prisma nằm ở `packages/database`

`apps/api` và `apps/worker` dùng chung một database PostgreSQL. Đặt Prisma ở
một package riêng giữ đúng ranh giới đã nêu trong `architecture.md`:

- Không app nào import source của app kia.
- Worker và API dùng cùng một schema và cùng một client.
- Khi schema đổi, chỉ một chỗ cần cập nhật.

Cấu trúc:

```text
packages/database/
  prisma/
    schema.prisma        Model, enum, index
    migrations/          Migration do Prisma tạo ra, phải commit
  prisma.config.ts       Cấu hình Prisma CLI (Prisma 7)
  src/
    prisma.service.ts    PrismaService của NestJS
    prisma.module.ts     PrismaModule, đăng ký global
    index.ts             Public surface của package
    generated/           Client do Prisma sinh ra, KHÔNG commit
  scripts/
    setup-database.ps1   Tạo database và chạy migration
```

## 2. Yêu cầu

- Docker Desktop đang chạy; Compose dùng PostgreSQL 18.6.
- Node.js 24, pnpm 12.15.0.

## 3. Thiết lập lần đầu

Bước 1 — tạo file `.env` ở root. File này chứa biến dùng chung cho API,
worker và Prisma CLI:

```powershell
Copy-Item .env.example .env
```

Bước 2 — chạy PostgreSQL/Redis bằng Docker và áp dụng migration đã commit:

```powershell
pnpm install --frozen-lockfile
pnpm infra:up
pnpm db:migrate:deploy
```

Bản mẫu `.env` đã khớp với Docker: PostgreSQL ở `localhost:55432` để tránh
trùng PostgreSQL cài sẵn, database `researchos`, một tài khoản `postgres`
cho local. Không cần tạo các database dev/test/staging riêng.

```dotenv
DATABASE_URL="postgresql://postgres:postgres@localhost:55432/researchos?schema=public"
```

Nếu đổi `POSTGRES_PASSWORD`/`POSTGRES_PORT`, sửa `DATABASE_URL` cho khớp.
`POSTGRES_PASSWORD` chỉ thiết lập mật khẩu khi volume còn rỗng; đổi biến
này không tự đổi mật khẩu trong database đã có dữ liệu.

Bước 3 — kiểm tra và chạy app:

```powershell
pnpm db:status
pnpm dev
```

Ở terminal khác:

```powershell
Invoke-WebRequest 'http://localhost:4000/health/ready' | Select-Object -ExpandProperty Content
```

Kết quả mong đợi là `"status":"ok"`. Nếu là `"degraded"`, xem mục "Xử lý sự cố".

`pnpm infra:down` dừng container và giữ volume. Khi deploy, server có
Docker và volume riêng, dùng credentials riêng. Chưa cần tách tài khoản
migration hoặc tự chỉnh connection pool cho local.

Migration đầu tiên chỉ tạo enum và `audit_logs` đúng với `schema.prisma`
hiện tại. Bản SQL nghiệp vụ trong `docs/database/ResearchOS.sql` chưa được
đưa vào Prisma/migration; Compose không tự import bản SQL đó. Việc đồng bộ
schema nghiệp vụ là bước riêng, không được chạy cả hai cách khởi tạo lên
cùng database.

Nếu vẫn muốn dùng PostgreSQL cài trực tiếp trên máy, script
`packages/database/scripts/setup-database.ps1` vẫn dùng được; cập nhật
`DATABASE_URL` theo host/cổng/mật khẩu của bản cài đó.

## 4. Lệnh thường dùng

Chạy từ root:

| Lệnh | Tác dụng |
| --- | --- |
| `pnpm db:generate` | Sinh lại client từ `schema.prisma` |
| `pnpm db:migrate` | Tạo và áp dụng migration (chỉ khi dev) |
| `pnpm db:migrate:deploy` | Áp dụng migration đã có (CI, production) |
| `pnpm db:status` | Trạng thái migration |
| `pnpm db:studio` | Prisma Studio để xem và sửa dữ liệu |

`pnpm db:migrate` tương đương `prisma migrate dev`: nó tạo file migration mới
khi schema đổi và áp dụng các migration chưa chạy. **Chỉ dùng ở máy dev.**

`pnpm db:migrate:deploy` tương đương `prisma migrate deploy`: chỉ áp dụng
migration đã tồn tại, không sinh file mới. Dùng ở CI và production.

## 5. Quy tắc schema

Các quy tắc này bắt buộc và được kiểm tra khi review.

### 5.1 Ba trục trạng thái độc lập

`validationStatus`, `visibility` và `publicationStatus` là ba trục độc lập.
Không gộp thành một cột `status`. Lý do: một bản ghi có thể đã được xác
minh (`VERIFIED`) nhưng vẫn là `DRAFT` và chỉ hiện với `PRIVATE`. Gộp ba trục
lại sẽ mất thông tin và làm mọi truy vấn lọc phải suy đoán.

#### 5.1.1 Accept ≠ Publish: bài từ F0 khi nào lọt vào Discovery

Quy trình một bài được nghiệp thu từ F0:

```
user pull OpenAlex → candidate → user ACCEPT → DRAFT + PRIVATE
                                                          ↓ (chưa publish)
                                                    hồ sơ cá nhân của chính user
                                                          ↓ user PUBLISH
                                          release revision + SHARED + visibility
                                                          ↓
                                              Discovery + Search + Follow/Digest
```

Ba điểm phải giữ đúng:

1. **Accept chỉ set `import_state = 'ACCEPTED'`**, không đụng `sharing_status`
   (vẫn `DRAFT`) và không set `current_release_id`. Lý do: `guard_output_release`
   chỉ cho phép `current_release_id` trỏ tới một revision **đã release**
   (`released_at IS NOT NULL`), nên set sớm sẽ vi phạm trigger.

2. **Bài DRAFT hiện cho chính owner, không hiện cho ai khác.** View
   `owner_output_versions` + function `visible_owner_output_versions(actor)` lấy
   các output có `sharing_status <> 'SHARED'` của đúng owner đó. View
   `released_output_versions` — nguồn của Discovery và Search — vẫn chỉ lấy
   `sharing_status = 'SHARED'`, nên bài DRAFT không lọt ra ngoài.

3. **Visibility mặc định khi accept là `PRIVATE`.** Người dùng tự đổi qua
   profile edit. Search chỉ trả về bài đã publish, nên bài DRAFT của chính
   user **không** xuất hiện trong kết quả tìm kiếm — nó chỉ hiện trong hồ sơ
   cá nhân. Đây là hai danh sách tách biệt, không phải một danh sách có điều kiện.

4. **Publish là bước kế tiếp của luồng accept, và nó nằm trong MVP.** Publish
   là hành động `POST /outputs/:outputId/publish`, thực hiện trong **một
   transaction**:

   | Bước | Thay đổi | Ràng buộc bảo vệ |
   | --- | --- | --- |
   | 1 | release revision draft: `released_at`, `released_by` | trigger `guard_revision` — chỉ researcher quản lý được release, title không rỗng |
   | 2 | `research_outputs.current_release_id` → revision vừa release | trigger `guard_output_release` — `current_release_id` chỉ trỏ tới revision đã release |
   | 3 | `sharing_status = 'SHARED'`, `first_shared_at = now()` | check `ck_shared_output` — cần đủ owner + current release + first shared |
   | 4 | `visibility = 'FPTU_COMMUNITY'` | check `ck_output_access_scope` — `FPTU_COMMUNITY` thì `access_group_id` phải NULL |
   | 5 | revision `publication_status = 'PUBLISHED'` | — |

   **Chỉ owner được publish.** Quyền kiểm tra là `can_manage_output(actor,
   output)`, tức `owner_id = actor`. Đồng tác giả trên `output_authors` không
   có quyền publish — `owner_id` là người claim đầu tiên, và việc đồng tác giả
   không chuyển quyền sở hữu.

   Publish **không** đổi `import_state` — bài vẫn là `ACCEPTED`. Import state
   ghi nguồn gốc, sharing status ghi trạng thái hiện tại. Publish cũng không
   gọi lại nguồn ngoài và không sửa metadata nào — người dùng sửa trước, publish
   sau.

   Trigger `emit_research_update` tự ghi event `OUTPUT_SHARED` vào
   `research_updates`; Follow/Digest ở Main flow 3 đọc từ đó.

Bảng tổng kết:

| Giai đoạn | `import_state` | `sharing_status` | `released_at` | Ai thấy |
| --- | --- | --- | --- | --- |
| Candidate | `CANDIDATE` | `DRAFT` | NULL | chỉ user (màn hình review) |
| Accepted, chưa publish | `ACCEPTED` | `DRAFT` | NULL | chỉ owner (hồ sơ cá nhân) |
| Published | `ACCEPTED` | `SHARED` | có | `FPTU_COMMUNITY` — Discovery + Search |

> **Ngoài MVP:** tạo publication mới từ đầu bên trong platform rồi publish nó.
> Trong MVP, chỉ bài đã đi qua luồng ingest từ bên ngoài (OpenAlex) mới
> có đường publish này.

### 5.2 Mọi dữ liệu có nguồn gốc

Dữ liệu trong hệ thống đến từ nhiều chỗ, nên "nguồn" được chia thành **ba
trục độc lập**, không gộp làm một.

#### 5.2.1 `provenance` — ai đứng sau nội dung

`data_provenance_type` phân loại **chủ thể khẳng định giá trị**, không phải
kênh truyền dữ liệu.

| Giá trị | Nghĩa | Ví dụ |
| --- | --- | --- |
| `PAPER` | Được một công trình khoa học đã công bố khẳng định | `title`, `abstract`, danh sách tác giả của một bài báo |
| `AI_TRACE` | AI tạo ra **và có thể phát lại** (có Langfuse trace) | `research_records` có `trace_id` + `ai_task_description` |
| `AI_INF` | AI suy luận/đề xuất, **không** có trace | interest suy ra từ công bố; cạnh knowledge-graph do AI gợi ý |
| `HUMAN` | Do một con người chủ động khai/nhập | tiểu sử, sở thích do giảng viên nhập |
| `EXT` | Sự thật đã được đăng ký của một bên có thẩm quyền bên ngoài | HR (`department_unit`), OpenAlex (`venue`, `publication_year`, taxonomy) |
| `UNK` | **Có dữ liệu nhưng không truy được nguồn gốc** | dữ liệu migrate từ hệ thống cũ, bản ghi không rõ ai nhập |

Hai quy tắc phân định dễ nhầm:

- **AI không có trace là `AI_INF`, không phải `UNK`.** `AI_INF` biết chủ thể (AI)
  nhưng thiếu vết; `UNK` là **không biết** chủ thể.
- **`EXT` không phải "mọi API bên ngoài".** Hỏi "ai là người đóng dấu lên sự
  thật này": HR đóng dấu → `EXT`; người dùng tự gõ lại → `HUMAN` (dù
  `sourceRef` vẫn trỏ về HR).

Cùng một lần đồng bộ OpenAlex sinh ra nhiều field khác nhau:

| Field | Nguồn chuẩn | `provenance` |
| --- | --- | --- |
| `output_revisions.venue` / `publication_year` | OpenAlex — nơi công bố được lập chỉ mục | `EXT` |
| `output_revisions.title` / `abstract`, `output_authors.*` | Tác giả bài báo | `PAPER` |
| `research_outputs.doi` | OpenAlex | `EXT` |

OpenAlex không có trường publisher, không có volume/issue/pages, và abstract
đến dưới dạng `abstract_inverted_index` (JSON) chứ không phải text thẳng —
nên phải khôi phục lại thành text trước khi ghi vào
`output_revisions.abstract`.

→ Provenance phải ở **mức field**, không phải mức dòng.

#### 5.2.2 `sourceKind` + `sourceRef` — dữ liệu đến bằng cách nào

- `sourceKind`: `SELF_DECLARED` | `IMPORTED` | `AI_INFERRED` | `SYSTEM`.
- `sourceRef`: trỏ về nguồn cụ thể (`OPENALEX:W2741809807`,
  `OPENALEX:10.1234/abc`, `HR:<employee id>`).

`sourceKind` là **kênh vận chuyển**, `provenance` là **chủ thể**. Hai trục
trực giao: dữ liệu từ OpenAlex vừa là `IMPORTED` vừa có `provenance = EXT`
(với `venue`) hoặc `PAPER` (với `title`).

#### 5.2.3 Bảng `field_provenance`

Vì provenance là mức field, nó nằm ở một bảng riêng thay vì một cột trên
mỗi bảng nghiệp vụ:

```
field_provenance(entity_type, entity_id, field_name,
                 source, source_ref, synced_at, verified_at, is_locked)
```

- Khóa chính gồm `source_ref`: khi một field bị ghi đè, **nguồn cũ không bị
  xóa** mà thêm một dòng. "Hệ thống từng đọc HR là đơn vị A, sau đó giảng viên
  đổi thành B" vẫn truy vết được.
- Chỉ **field tự động sinh** mới có dòng. Field người tự gõ là `HUMAN` theo
  định nghĩa nên không cần dòng.
- Bộ ghi provenance chạy **trong cùng transaction** với bộ ghi field. Field
  không có provenance là lỗi, không phải cảnh báo.
- `is_locked` được bật khi người dùng xác nhận một giá trị: **job đồng bộ
  không bao giờ ghi đè** field đã được xác nhận.

#### 5.2.4 Trạng thái xác minh

- `verificationStatus`: `UNVERIFIED` | `PENDING_REVIEW` | `VERIFIED` | `REJECTED`.

| `provenance` | Mặc định | Vào hàng chờ duyệt? |
| --- | --- | --- |
| `HUMAN` | `UNVERIFIED` (tự khai ≠ đã kiểm chứng) | trước lần công bố đầu tiên |
| `EXT` | `UNVERIFIED` (đáng tin hơn nhập tay) | lấy mẫu kiểm tra |
| `PAPER` | `PENDING_REVIEW` | có |
| `AI_TRACE` | `PENDING_REVIEW` | có |
| `AI_INF` | `PENDING_REVIEW` (bắt buộc) | có |
| `UNK` | `UNVERIFIED` | có — bắt buộc người phân xử |

Ba ràng buộc ở tầng database:

1. `AI_INF` **không bao giờ** được tự động nâng lên `VERIFIED`.
2. Field có `provenance = UNK` không được ở trạng thái `VERIFIED`.
3. Một field đã được người xác nhận thì job đồng bộ không ghi đè — chiều ưu
   tiên ghi đè là **một chiều**, con người thắng máy.

### 5.3 Đặt tên

- Tên bảng: số nhiều, snake_case (`research_groups`).
- Tên cột: snake_case. Prisma dùng `camelCase` trong model, map sang
  `snake_case` bằng `@map` để khớp quy ước SQL của Postgres.
- Tên trường quan hệ dùng số nhiều (`members`, `publications`); tên khóa ngoại
  dùng số ít (`groupId`, `publicationId`).

### 5.4 Chỉ mục và ràng buộc

- Mọi cột dùng để lọc theo quyền (`visibility`, `ownerId`, `groupId`) đều cần
  index.
- Ràng buộc duy nhất được đặt ở tầng database, không chỉ ở tầng ứng dụng.
- Dữ liệu nghiên cứu có xu hướng append-only: cân nhắc `createdAt` và
  `archivedAt` thay vì xoá cứng.

### 5.5 Audit trail

Bảng `audit_logs` đã có sẵn. Mọi thay đổi có ý nghĩa nên ghi một dòng vào
đó với `actorId`, `action`, `entity`, `entityId` và `payload`.

### 5.6 Còn để trống có chủ đích

Hiện schema **chưa có bảng nghiệp vụ**. Các mâu thuẫn SRS liệt kê ở
`architecture.md` ("Những điểm SRS cần chốt") chưa được giải quyết. Đặt bảng
lúc này sẽ khóa những quyết định sai vào schema.

Khi một nhóm nghiệp vụ được chốt, thêm model vào `schema.prisma` và chạy:

```powershell
pnpm db:migrate
```

### 5.7 Search index

Bảng `search_index` là nguồn dữ liệu cho màn hình Search. Mô hình:

- **Bảng riêng, không phải materialized view.** Materialized view chỉ refresh
  theo lịch, nên một bài publish sẽ không xuất hiện trong Search ngay. Bảng
  riêng cho phép upsert tức thời theo từng dòng.
- **`doc` là `tsvector`**, lưu sẵn kết quả `to_tsvector('simple', ...)`.
  Cột `tsvector` không thể được truy vấn bằng GIN index nếu không lưu dạng
  cột thật — đây là lý do không dùng expression index như `idx_revision_fts`
  trên `output_revisions`.
- **Chỉ revision đã release của output đã publish mới được index.** Trigger
  `sync_search_index` tự đồng bộ:

  | Sự kiện | Hành động |
  | --- | --- |
  | `output_revisions` insert/update | index nếu revision đó là `current_release_id` **và** output `SHARED` |
  | `research_outputs` update → `SHARED` | index revision `current_release_id` |
  | `research_outputs` update → không còn `SHARED` (archive) | xoá khỏi index |

  Draft của chính owner (`sharing_status = 'DRAFT'`) **không** vào index —
  đúng với nguyên tắc ở §5.1.1: bài DRAFT chỉ hiện ở hồ sơ cá nhân.
- **`visibility` và `access_group_id` được copy vào index** để lọc quyền
  ngay tại bảng index, không cần join ngược về `research_outputs`. Check
  `ck_search_index_scope` giữ đúng quy tắc của `ck_output_access_scope`.
- **Tên tác giả lấy từ `output_authors`** (`author_name_string` theo
  `author_order`), fallback sang `authors_snapshot` nếu có key `name`.
  `authors_snapshot` là JSON tự do nên không có schema cố định để truy vấn.

#### 5.7.1 Bốn loại entity trong một index

`search_index` phục vụ **4 tab** của màn hình Search, nên `entity_type` có 4
giá trị. Kiểu dữ liệu là enum `search_entity_type`
(`OUTPUT` / `RESEARCHER` / `GROUP` / `OPPORTUNITY`); check
`ck_search_index_entity_type` giữ thêm một ràng buộc tường minh và trả lỗi
`23514` khi có giá trị lạ.

Enum này tách riêng, không dùng lại `entity_types` cũ (có `PROJECT` và `TOPIC`
nhưng thiếu `OPPORTUNITY`), vì tập giá trị của hai bảng khác nhau.

| `entity_type` | Nguồn | Điều kiện được index | `visibility` | `owner_id` |
| --- | --- | --- | --- | --- |
| `OUTPUT` | `research_outputs` + `output_revisions` | `sharing_status = 'SHARED'`, revision = `current_release_id` | theo `research_outputs.visibility` | `research_outputs.owner_id` |
| `RESEARCHER` | `users` + `researcher_profiles` | tài khoản active **và** `profile_confirmed_at` đã set | `FPTU_COMMUNITY` | chính người dùng |
| `GROUP` | `research_groups` | `is_active` và chưa `archived_at` | `FPTU_COMMUNITY` | `lead_id` |
| `OPPORTUNITY` | `research_opportunities` | `status = 'OPEN'` và chưa `archived_at` | `FPTU_COMMUNITY`, hoặc `RESEARCH_GROUP` nếu có `group_id` | `creator_id` |

Ba điểm phải giữ:

1. **`entity_id` đa dạng nên không có foreign key.** Một FK cứng
   (`entity_id → research_outputs`) sẽ loại được 3 loại còn lại. Thay vào đó:
   - trigger `guard_search_index_entity` kiểm tra entity tồn tại trước khi insert/update
   - trigger `sync_search_index_delete` xoá dòng index khi dòng nguồn bị xoá
   - `entity_type` ràng buộc bởi enum `search_entity_type` và check `ck_search_index_entity_type`

2. **Ba entity không có cột `visibility` thật.** `researcher_profiles`,
   `research_groups`, `research_opportunities` không có cột này — quyền phải
   **suy ra** từ trạng thái:
   - researcher: profile đã xác nhận → công khai; chưa xác nhận → không index
   - group: đang active → công khai
   - opportunity: `OPEN` → công khai; có `group_id` → chỉ thành viên group đó

3. **Một bảng, một hàm lọc quyền.** Cả 4 loại dùng chung bộ ba giá trị
   visibility, nên `visible_search_index(actor)` áp cùng một quy tắc cho tất cả.

> Trước khi mở rộng, index chỉ có `OUTPUT`. Đó là lý do RES-85 và RES-95
> (4 tab) không khớp với schema — xem §5.7.2.

- **Quan hệ với các view ở `ResearchOS.sql` (dòng ~1550-1577).** Đây là ba
  view cùng nói về "bài nào đã công bố", và chúng **không thay thế nhau**:

  | View | Lấy bài nào | Dùng cho |
  | --- | --- | --- |
  | `released_output_versions` | output `SHARED`, revision = `current_release_id` | Discovery, danh sách bài đã đăng |
  | `group_output_releases` | revision mà **group đã ghim** (`accepted_revision_id`) | trang bên trong group |
  | `owner_output_versions` | output **chưa** `SHARED` — bản nháp của chính chủ | hồ sơ cá nhân |
  | `search_index` (bảng) | output `SHARED`, revision = `current_release_id` | Search |

  Ba điểm phải giữ đúng:

  1. **`search_index` bám `current_release_id`, không bám revision ghim của
     group.** Một group có thể ghim revision cũ (`accepted_revision_id` khác
     `current_release_id`) — group vẫn hiện bản cũ trong `group_output_releases`,
     còn Search hiện bản mới nhất. Đây là chủ ý: Search là bản đọc công khai
     của công trình, còn group là bản trình bày riêng.

  2. **`search_index` và `released_output_versions` cùng nguồn.** Cùng một
     điều kiện (`SHARED` + `current_release_id` + `released_at IS NOT NULL`),
     nên hai nguồn không lệch nhau. `search_index` chỉ thêm phần *tìm kiếm*.

  3. **`owner_output_versions` là vùng riêng, không phải nguồn của Search.**
     Bài `DRAFT` của owner nằm ở view này và **không** vào `search_index`.

  → Bảng `search_index` **không** thay thế `released_output_versions`. Nếu
  sau này bỏ bảng index, Discovery vẫn chạy; nếu bỏ view, Search vẫn chạy.

Index liên quan:

```sql
CREATE INDEX idx_search_index_doc ON search_index USING gin(doc);
CREATE INDEX idx_search_index_title_trgm ON search_index USING gin(title gin_trgm_ops);
CREATE INDEX idx_search_index_scope ON search_index(visibility, access_group_id);
CREATE INDEX idx_search_index_type ON search_index(entity_type);
```

Query mẫu — **luôn** đi qua `visible_search_index(actor)`, không tự viết
điều kiện visibility:

```sql
-- Một tab: lọc theo entity_type
SELECT v.entity_type, v.entity_id, v.title, ts_rank(v.doc, q) AS rank
FROM visible_search_index($1) v, websearch_to_tsquery('simple', $2) q
WHERE v.doc @@ q
  AND v.entity_type = $3
ORDER BY rank DESC;
```

`visible_search_index` lặp lại đúng logic của `can_view_output`:

| `visibility` | Ai thấy |
| --- | --- |
| `PRIVATE` | chỉ owner (`s.owner_id = actor`) |
| `RESEARCH_GROUP` | thành viên của `access_group_id` |
| `FPTU_COMMUNITY` | mọi người |

> **Vì sao cần nhánh `owner`:** một bài `SHARED` nhưng `visibility = 'PRIVATE'`
> vẫn phải tìm được bởi chính chủ. `released_output_versions` cũng đưa bài đó
> vào, và `can_view_output` cho owner quyền xem — nếu query Search chỉ lọc
> theo `FPTU_COMMUNITY`/`RESEARCH_GROUP` thì owner **không** tìm được bài của
> mình. Đây là điểm dễ sai, và cũng là lý do các hàm `visible_*` có sẵn thay
> vì để service tự viết điều kiện.

#### 5.7.2 Mâu thuẫn đã gặp: 4 tab nhưng index chỉ có OUTPUT

RES-85 ghi "FTS + trigram over outputs, researchers, groups and opportunities"
và RES-95 yêu cầu 4 tab (`research`, `people`, `group`, `opportunity`), nhưng
bảng `search_index` ban đầu chỉ chứa OUTPUT — và FK cứng
`entity_id → research_outputs` khiến 3 loại còn lại không thể vào.

Đã giải quyết bằng cách bỏ FK cứng, thêm check `entity_type` và trigger
kiểm tra toàn vẹn (xem §5.7.1). Ba entity không có cột `visibility` nên quyền
được suy ra từ trạng thái.

> `search_index` phủ 4 loại trên. Project, seminar, research record và topic
> chưa vào Search trong MVP.

## 6. Truy cập dữ liệu trong code

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

## 7. Quy ước biến môi trường

| Biến | Dùng ở đâu | Bắt buộc |
| --- | --- | --- |
| `DATABASE_URL` | Prisma CLI, API, worker | Có (khi cần database) |
| `POSTGRES_PASSWORD` | Docker PostgreSQL local | Có |
| `POSTGRES_PORT` | Cổng PostgreSQL trên máy local, mặc định 55432 | Không |
| `REDIS_PORT` | Cổng Redis trên máy local, mặc định 6379 | Không |
| `REDIS_URL` | Dành cho BullMQ khi tích hợp processor đầu tiên | Chưa dùng |
| `SHADOW_DATABASE_URL` | `prisma migrate dev` | Không |
| `WEB_ORIGIN` | CORS của API | Không |
| `PORT` | Cổng lắng nghe | Không |

File `.env` ở root chứa biến dùng chung. Mỗi app có thể có `.env` riêng để
ghi đè. Biến trong môi trường thật luôn thắng cả hai.

Cơ chế này dùng chung cho NestJS và Prisma CLI, nằm trong
`packages/config` (`resolveEnvFilePaths`). Lý do cần package riêng:
`@nestjs/config` phân giải `envFilePath` theo `process.cwd()`, mà dưới
Turborepo cwd của `apps/api` là thư mục app, nên file `.env` ở root không
bao giờ được đọc.

## 8. Xử lý sự cố

**`/health/ready` trả `degraded`.** Xem log của API: thường là sai mật khẩu
hoặc database chưa được tạo. Kiểm tra bằng:

```powershell
pnpm db:status
```

**`DATABASE_URL is not set`.** File `.env` ở root chưa có, hoặc chạy lệnh từ
thư mục khác root. File `.env` phải ở root workspace.

**`database "researchos" does not exist`.** Chạy `pnpm infra:up`, kiểm tra
`DATABASE_URL` trỏ đúng Docker ở cổng `55432`.

**`Error: P1001: Can't reach database server`.** Kiểm tra Docker Desktop đang
chạy, rồi dùng `pnpm infra:status` và `pnpm infra:logs`.

**Sau khi đổi `schema.prisma`, app báo lỗi type.** Chạy `pnpm db:generate`.
Client được sinh lại tự động trước mỗi lần build của package database, nhưng
IDE cần chạy lệnh này để cập nhật type.

**Migration bị lệch.** `pnpm --filter @researchos/database db:reset`
xoá và dựng lại database từ đầu. Chỉ dùng ở máy dev.

## 9. Migration và production

- `prisma/migrations/` phải được commit. Migration là mã, không phải artefact.
- Production chạy `pnpm db:migrate:deploy` trước khi khởi động app.
- Không chạy `prisma migrate dev` ở production: lệnh này có thể sinh
  migration mới và hỏi xoá dữ liệu.
- Migration phải tương thích ngược: ứng dụng phiên bản cũ vẫn phải chạy
  được với schema mới. Thêm cột thì an toàn; xoá hoặc đổi kiểu cột thì cần
  migration nhiều bước.

## 10. Tài liệu chính thức

- [Prisma ORM 7](https://www.prisma.io/docs/orm/v7)
- [Prisma 7 upgrade guide](https://www.prisma.io/docs/guides/upgrade-prisma-orm/v7)
- [Prisma PostgreSQL connector](https://www.prisma.io/docs/orm/overview/databases/postgresql)
- [Prisma migrations](https://www.prisma.io/docs/orm/prisma-migrate/understanding-prisma-migrate)
