# Database và Prisma

Ngày ghi nhận: 29/10/2026.

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

- PostgreSQL 14 trở lên. Đã kiểm tra với PostgreSQL 17.
- Node.js 24, pnpm 12.15.0.

## 3. Thiết lập lần đầu

Bước 1 — tạo file `.env` ở root. File này chứa biến dùng chung cho API,
worker và Prisma CLI:

```powershell
Copy-Item .env.example .env
```

Bước 2 — tạo database và chạy migration. Script hỏi mật khẩu, không nhận
mật khẩu qua tham số để nó không bị lưu vào history:

```powershell
pwsh packages/database/scripts/setup-database.ps1
```

Bước 3 — điền `DATABASE_URL` trong `.env` bằng mật khẩu thật của bạn:

```dotenv
DATABASE_URL="postgresql://postgres:<password>@localhost:5432/researchos?schema=public"
```

Bước 4 — kiểm tra:

```powershell
pnpm db:status
Invoke-WebRequest 'http://localhost:4000/health/ready' | Select-Object -ExpandProperty Content
```

Kết quả mong đợi là `"status":"ok"`. Nếu là `"degraded"`, xem mục "Xử lý sự cố".

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

### 5.2 Mọi dữ liệu có nguồn gốc

Mọi bản ghi có thể do người nhập, hệ thống import hoặc AI tạo ra đều cần:

- `sourceKind`: `SELF_DECLARED` | `IMPORTED` | `AI_INFERRED` | `SYSTEM`.
- `verificationStatus`: `UNVERIFIED` | `PENDING_REVIEW` | `VERIFIED` | `REJECTED`.
- `sourceRef`: trỏ về nguồn gốc (DOI, ORCID, ID ngoài, prompt của AI...).

AI tạo gợi ý; người có thẩm quyền xác nhận taxonomy, quan hệ tri thức và
nghiên cứu chính thức. Vì vậy dữ liệu `AI_INFERRED` mặc định là
`PENDING_REVIEW`, không phải `VERIFIED`.

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

**`database "researchos" does not exist`.** Chạy
`pwsh packages/database/scripts/setup-database.ps1`.

**`Error: P1001: Can't reach database server`.** PostgreSQL chưa chạy. Kiểm tra
bằng `Get-Service postgresql*` trên Windows.

**Sau khi đổi `schema.prisma`, app báo lỗi type.** Chạy `pnpm db:generate`.
Client được sinh lại tự động trước mỗi lần build của package database, nhưng
IDE cần chạy lệnh này để cập nhật type.

**Migration bị lệch.** `pnpm --filter @researchos/database db:migrate:reset`
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
