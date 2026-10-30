# Quy ước tạo API

Ngày ghi nhận: 29/10/2026.

Tài liệu này là chuẩn bắt buộc cho mọi endpoint mới trong `apps/api`.
Mục tiêu: mọi API được tạo ra có cùng hình dạng, cùng cách kiểm tra quyền,
cùng cách trả lỗi, và frontend sinh tự động từ OpenAPI luôn khớp với backend.

Liên quan: [architecture.md](./architecture.md), [scaffolding.md](./scaffolding.md),
[ADR-0001](./adr/0001-modular-monolith-and-vps-worker.md).

---

## 1. Nguyên tắc bất di bất dịch

1. **Một nghiệp vụ = một module.** Không tạo controller lớn gồm nhiều nghiệp vụ.
2. **`common/` không biết nghiệp vụ.** File trong `src/common/` không được nhắc tới
   `Profile`, `Opportunity` hay bất kỳ entity cụ thể nào.
3. **Quyền được kiểm tra ở backend.** UI không phải nơi phân quyền.
4. **Ba trục trạng thái độc lập.** `validationStatus`, `visibility` và
   `publicationStatus` không được gộp thành một `status`.
5. **Mọi dữ liệu đều có nguồn gốc.** Tự nhập, imported và AI-inferred có
   `sourceKind` và `verificationStatus` riêng.
6. **Lỗi trả về có một hình dạng duy nhất.** Xem §6.

## 2. Vị trí file

```text
apps/api/src/
  main.ts                  Bootstrap: CORS, global pipe, global filter, Swagger
  app.module.ts           Chỉ nối module, không có logic nghiệp vụ
  common/                 Guard, decorator, filter, interceptor, pipe
    filters/
    guards/
    decorators/
    pipes/
  modules/
    <ten-nghiep-vu>/
      <ten-nghiep-vu>.controller.ts
      <ten-nghiep-vu>.service.ts
      <ten-nghiep-vu>.module.ts
      dto/
        <ten>.create.dto.ts
        <ten>.update.dto.ts
        <ten>.query.dto.ts
      entities/            Model Prisma, chỉ mô tả schema
```

Tạo module mới:

```powershell
pnpm --dir apps/api exec nest generate module modules/profiles
pnpm --dir apps/api exec nest generate controller modules/profiles/profiles --flat
pnpm --dir apps/api exec nest generate service modules/profiles/profiles --flat
pnpm --dir apps/api exec nest generate class modules/profiles/dto/create-profile.dto --flat
```

Luôn kèm `--flat`. Không có nó, CLI tạo thêm thư mục trùng tên và lặp hậu tố.

Import trong `apps/api` và `apps/worker` dùng hậu tố `.js` vì `tsconfig` đặt
`module: nodenext` và package có `"type": "module"`.

## 3. Quy ước URL

| Phương thức | Đường dẫn | Ý nghĩa |
| --- | --- | --- |
| `GET` | `/<resource>` | Liệt kê, có phân trang |
| `GET` | `/<resource>/:id` | Chi tiết một bản ghi |
| `POST` | `/<resource>` | Tạo mới |
| `PATCH` | `/<resource>/:id` | Cập nhật một phần |
| `DELETE` | `/<resource>/:id` | Xoá mềm nếu có `deletedAt` |

- `<resource>` là số nhiều, kebab-case: `opportunities`, `research-groups`.
- Dùng **tài nguyên con lồng nhau** khi đời sống của con phụ thuộc cha và
  không tồn tại độc lập:
  `/research-groups/:groupId/members`.
- Dùng **hành động** khi thao tác không phải CRUD:
  `/opportunities/:id/close`. Hành động là `POST`, dùng `PATCH` khi nó thực
  sự cập nhật một phần của tài nguyên.
- Không đặt `/api` trong đường dẫn. Reverse proxy ở tầng trên đã xử lý.
- Tài nguyên con độc lập dùng `/<resource>/:id/<sub-resource>`:
  `/publications/:id/authors`.
- Không lồng quá hai cấp.

## 4. Controller

Controller **chỉ** làm bốn việc: nhận input, gọi service, trả kết quả, khai
báo Swagger. Không có query Prisma trong controller, không có kiểm tra quyền
thủ công trong controller.

```typescript
import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { OpportunitiesService } from './opportunities.service.js';
import { CreateOpportunityDto } from './dto/create-opportunity.dto.js';
import { UpdateOpportunityDto } from './dto/update-opportunity.dto.js';

@ApiTags('opportunities')
@Controller('opportunities')
export class OpportunitiesController {
  constructor(private readonly opportunitiesService: OpportunitiesService) {}

  @ApiOperation({ summary: 'Tạo cơ hội nghiên cứu' })
  @ApiCreatedResponse({ description: 'Cơ hội đã tạo', type: CreateOpportunityDto })
  @Post()
  create(@Body() dto: CreateOpportunityDto): Promise<CreateOpportunityDto> {
    return this.opportunitiesService.create(dto);
  }

  @ApiOperation({ summary: 'Lấy chi tiết một cơ hội' })
  @ApiOkResponse({ description: 'Chi tiết cơ hội' })
  @Get(':id')
  findOne(@Param('id') id: string): Promise<CreateOpportunityDto> {
    return this.opportunitiesService.findOne(id);
  }
}
```

Quy tắc:

- `@ApiTags` dùng đúng tên module, không dùng tiếng Việt có dấu.
- **Mỗi route bắt buộc có `@ApiOperation({ summary })`** với `summary` không rỗng.
  Không có ngoại lệ nào, kể cả route nhỏ. `summary` là phần mô tả của
  endpoint: trên Swagger UI nó hiện thành tiêu đề đậm ngay dưới đường dẫn,
  và là thứ người đọc thấy đầu tiên.

```typescript
  // Đúng — một dòng, mô tả route làm gì.
  @ApiOperation({ summary: 'Returns the greeting after a configurable delay' })

  // Sai — thiếu summary, Swagger chỉ hiện đường dẫn trần.
  @Get(':id')
  findOne(@Param('id') id: string): Promise<ProfileResponseDto> { /* ... */ }

  // Sai — câu thứ hai thuộc về `description`, không phải `summary`.
  @ApiOperation({ summary: 'Lấy chi tiết hồ sơ. Trả về 404 nếu không tìm thấy.' })
```

  Câu giải thích dài hơn nằm ở field `description` của chính decorator đó:

```typescript
  @ApiOperation({
    summary: 'Lấy chi tiết một hồ sơ',
    description:
      'Trả về 404 nếu hồ sơ không tồn tại hoặc người dùng không có quyền xem.',
  })
```

  `summary` được copy nguyên văn vào client Orval sinh ra dưới dạng JSDoc, nên
  nó cũng là thứ lập trình viên frontend đọc trong `src/lib/api/`.
- `@ApiOkResponse`/`@ApiCreatedResponse` luôn khai báo `type`.
- Tham số query dùng **DTO** (`@Query() dto: ListOpportunitiesQueryDto`), không
  dùng `@Query('page') page?: string` rời rạc.
- `@Param('id') id: string` — không ép kiểu ở controller; service hoặc pipe
  chịu trách nhiệm.

## 5. DTO và validation

DTO là **hợp đồng API**, không phải model Prisma. Model Prisma có trường kỹ
thuật như `createdAt`, `internalNotes`; DTO không được phơi ra những trường đó.

```typescript
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateOpportunityDto {
  @ApiProperty({ example: 'Nghiên cứu vật liệu mới cho pinh năng lượng' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title: string;

  @ApiPropertyOptional({ example: 'Giảng viên cần cộng tác viên' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;
}
```

Quy tắc:

- `@ApiProperty` bắt buộc cho mọi trường. `@ApiPropertyOptional` cho trường
  optional. Không có decorator thì `whitelist` sẽ xoá trường đó khỏi payload.
- Tên trường trong DTO dùng `camelCase`; mapping sang `snake_case` của
  PostgreSQL là việc của Prisma, không phải của DTO.
- Validate ở DTO bằng `class-validator`. Không tự viết `if` trong service cho
  việc kiểm tra hình dạng dữ liệu.
- `UpdateOpportunityDto` kế thừa `PartialType(CreateOpportunityDto)` từ
  `@nestjs/swagger`, để không lặp lại decorator.
- Enum trong DTO dùng `enum` của Prisma, và khai báo `@ApiProperty({ enum: X })`.

Global `ValidationPipe` đã bật `whitelist` và `forbidNonWhitelisted`, nên
payload có trường lạ sẽ trả `400` kèm danh sách trường không hợp lệ.

## 6. Lỗi

Mọi lỗi đi qua `HttpExceptionFilter` và có cùng một hình dạng:

```json
{
  "success": false,
  "data": null,
  "message": "Opportunity not found",
  "statusCode": 404,
  "path": "/opportunities/abc",
  "timestamp": "2026-10-29T01:30:00.000Z"
}
```

Trong service, dùng exception của NestJS — không trả lỗi bằng `throw new Error`:

| Tình huống | Exception |
| --- | --- |
| Dữ liệu không tồn tại | `NotFoundException` |
| Thiếu hoặc sai định dạng input | `BadRequestException` |
| Không đủ quyền | `ForbiddenException` |
| Chưa đăng nhập | `UnauthorizedException` |
| Xung đột với dữ liệu đã có | `ConflictException` |

Lỗi trả về **không chứa chi tiết nội bộ** (stack, SQL, tên bảng, tên
constraint). Chi tiết đi vào log.

Lỗi từ database cũng đi qua filter và được map sang status code phù hợp, để
một lỗi dữ liệu người dùng nhập sai không bị báo thành 500:

| Mã lỗi Postgres | Ý nghĩa | Status |
| --- | --- | --- |
| `23514` | Vi phạm `CHECK` constraint, hoặc lỗi do trigger ném | 400 |
| `23503` | Vi phạm foreign key | 400 |
| `23505` | Vi phạm unique constraint | 409 |
| `23502` | `NOT NULL` bị vi phạm | 400 |

Message do PostgreSQL sinh ra được thay bằng message chung; message do trigger
viết thì được giữ lại (UUID thành `<id>`). Chi tiết gốc vẫn vào log. Xem
`docs/database.md` §8.2.

Lỗi validation có thêm mảng `errors`, gom theo từng field để form hiển thị
đúng chỗ:

```json
{
  "success": false,
  "data": null,
  "message": "title must be a string; title should not be empty",
  "statusCode": 400,
  "path": "/opportunities",
  "timestamp": "2026-10-29T01:30:00.000Z",
  "errors": [
    { "field": "title", "messages": ["must be a string", "should not be empty"] }
  ]
}
```

## 6b. Envelope của response thành công

Mọi response thành công đều được bọc trong envelope bởi
`ApiResponseInterceptor`:

```json
{
  "success": true,
  "data": { "id": "abc", "title": "..." },
  "message": ""
}
```

Controller **trả về payload thô** — không tự dựng envelope. Interceptor và
filter là hai nơi duy nhất quyết định hình dạng response, nên chúng không
bao giờ chồng lấn: exception ném ra không đi qua interceptor.

| File | Vai trò |
| --- | --- |
| `src/common/interceptors/api-response.interceptor.ts` | Bọc response thành công |
| `src/common/filters/http-exception.filter.ts` | Bọc lỗi |
| `src/common/dto/api-response.dto.ts` | Mô tả DTO của envelope |
| `src/common/openapi/envelope-transform.ts` | Sửa OpenAPI để mô tả đúng envelope |

### Vì sao phải sửa OpenAPI

Swagger chỉ biết payload mà controller khai báo. Nếu không sửa, client
sinh ra ở frontend sẽ mô tả payload thô, còn server thật lại trả envelope
— hai bên lệch nhau. `envelope-transform.ts` bọc schema của mọi response
`2xx` vào envelope, nên `openapi.json` mô tả đúng thứ server thật sự gửi.

Quy tắc của transform:

- **Idempotent.** Chạy hai lần không bọc hai lần.
- **Payload nguyên thủy không được nâng thành component.** Một payload
  `type: string` phải nằm inline trong envelope. Nếu nâng thành component
  tên `String`, Orval sinh ra `models/string.ts` với `export type String =
  string`, và `export * from './string'` trong barrel sẽ che mất global
  `String` — một cái bẫy rất khó phát hiện.
- **`data` của envelope lỗi là `nullable`, không phải `type: "null"`.**
  OpenAPI 3.0 không có type `null`; dùng `type: "null"` làm Orval validate
  fail.

### Frontend không cần tự unwrap

Orval sinh operation với **type của envelope** làm generic
(`axiosInstance<HealthStatusDtoEnvelope>(...)`). Mutator
`src/lib/axios-instance.ts` bóc một lớp bằng conditional type:

```typescript
export type Unwrap<T> = T extends { data: infer D } ? D : T;
```

Nên `query.data` là payload (`HealthStatusDto`), không phải envelope. Toàn
bộ code frontend cũ tiếp tục chạy mà không cần sửa một dòng nào.

Lỗi thì **không** đi qua mutator: axios reject với body thô, nên
`error.response.data` vẫn là envelope lỗi đầy đủ. Dùng helper
`apiErrorMessage(error)` trong `src/lib/api-error.ts` để lấy message, đừng
dùng `String(error)` — nó ra `"AxiosError: Request failed with status code
500"`.

> `success` và `data` là tên dành riêng cho envelope. Một DTO nghiệp vụ có
> đúng hai field đó sẽ bị bóc nhầm một lớp.

## 7. Service và truy cập dữ liệu

Service giữ toàn bộ nghiệp vụ và là nơi duy nhất chạm vào Prisma.

- Dùng `PrismaService` từ `@researchos/database`, không tạo `PrismaClient`
  mới trong service.
- Không truyền `PrismaService` xuyên suốt như tham số hàm. NestJS inject nó
  qua constructor; DI giúp test dễ hơn.
- Ghi nhiều bảng liên quan dùng `$transaction`. Xem §9.
- Trả về entity của Prisma hoặc DTO. Trả thẳng entity sẽ làm lộ trường nội
  bộ; cân nhắc map sang DTO response.

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

## 8. Quyền và kiểm tra truy cập

Backend kiểm tra **role, ownership, membership và visibility** cho từng tài
nguyên. Không có ngoại lệ.

- Guard dùng chung nằm ở `src/common/guards/`.
- Việc kiểm tra quyền theo tài nguyên cụ thể (người này có thấy bản ghi này
  không) là logic nghiệp vụ, nên nằm trong service của module, không nằm trong
  guard ở `common/`.
- Lọc dữ liệu **trước** khi đưa vào prompt AI hoặc gửi email. Search,
  Assistant, export và digest dùng chung một chính sách quyền.
- Khi endpoint yêu cầu đăng nhập, dùng guard; khi endpoint công khai, ghi rõ
  bằng comment trong controller.

## 9. Transaction, idempotency và job nền

- Ghi nhiều bảng liên quan: dùng `$transaction`.
- Job nền: dùng transaction/outbox để đảm bảo phát job **sau khi** ghi dữ liệu.
- Endpoint tạo tài nguyên nên nhận `Idempotency-Key` header; lưu key và
  trả lại kết quả cũ nếu key lặp lại.
- Tác vụ nền phải idempotent và retry có giới hạn.
- Export lớn, đồng bộ dữ liệu, digest và embedding **không** giữ HTTP request
  chờ — ghi yêu cầu vào database, phát job, trả `202` kèm id để frontend poll.

## 10. Swagger và client frontend

```powershell
pnpm --filter api openapi     # sinh apps/api/openapi.json
pnpm --filter web orval       # sinh client trong apps/web/src/lib/api
pnpm codegen                  # chạy cả hai
```

- `openapi.json` được commit. Không có nó, `orval` không có nguồn để sinh.
- Client frontend sinh tự động từ OpenAPI — **không** viết tay lời gọi API
  trong `apps/web`. Chỉ tay đổi khi contract thực sự đổi.
- Backend và frontend deploy không đồng thời: client phải tương thích ngược
  với API cũ. Vì vậy **không xoá field** đã có; hãy đánh dấu deprecated trước.
- Mọi endpoint mới phải có `@ApiOperation` và `@Api*Response` đầy đủ, nếu
  không Swagger sẽ mô tả sai và client sinh ra sẽ sai.

## 11. Test

- Unit test đặt cạnh file: `*.spec.ts`, chạy bằng Vitest.
- Test service dùng Prisma thật cần database test. Dùng database riêng cho
  test, không dùng database dev.
- `pnpm --filter api test`

## 12. Checklist trước khi mở Pull Request

- [ ] Endpoint có `@ApiTags`, `@ApiOperation` và `@Api*Response` kèm `type`.
- [ ] **Mọi route đều có `@ApiOperation({ summary })` với `summary` không rỗng.**
- [ ] DTO có `@ApiProperty`/`@ApiPropertyOptional` cho **mọi** trường.
- [ ] Controller không chứa truy vấn Prisma.
- [ ] Controller trả payload thô — không tự dựng envelope.
- [ ] Lỗi dùng exception của NestJS, không dùng `throw new Error`.
- [ ] Phân quyền đã được kiểm tra ở backend.
- [ ] Ghi nhiều bảng dùng `$transaction`.
- [ ] `pnpm --filter api build` chạy qua.
- [ ] `pnpm --filter api test` chạy qua.
- [ ] `pnpm --filter api openapi` đã chạy và `openapi.json` đã commit.
- [ ] `pnpm --filter web orval` đã chạy nếu có thay đổi contract.
- [ ] Kiểm tra `openapi.json`: response `2xx` trỏ tới `*Envelope`, và không
  có component tên `String`/`Number`/`Boolean` (primitive phải inline).
