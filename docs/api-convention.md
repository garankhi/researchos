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
    constants/
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
| `POST` | `/<resource>/:id/<action>` | Hành động không phải CRUD |
| `PUT` | `/<resource>/:id` | Thay thế toàn bộ bản ghi |
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
- **Response lỗi không khai báo `type`.** Filter là global: server luôn trả
  `ApiErrorResponseDto` cho mọi lỗi, bất kể route khai báo gì. Khai báo
  `type` riêng là mô tả một body mà server không bao giờ gửi.

```typescript
  // Đúng — description chỉ gán nhãn cho mã trạng thái.
  @ApiNotFoundResponse({ description: 'Không tìm thấy cơ hội' })

  // Sai — server không bao giờ gửi body này.
  @ApiNotFoundResponse({ description: 'Không tìm thấy', type: ErrorDto })
```

- Tham số query dùng **DTO** (`@Query() dto: ListOpportunitiesQueryDto`), không
  dùng `@Query('page') page?: string` rời rạc.
- `@Param('id') id: string` — không ép kiểu ở controller; service hoặc pipe
  chịu trách nhiệm.
- **Mọi tham số đều phải có `description`.** Tham số path phải khai báo
  `@ApiParam({ name, description })` — NestJS chỉ sinh ra
  `{ name, in: "path" }` trần từ `@Param('id')`, không có gì để đọc. Tham số
  header dùng `@ApiHeader`, tham số query trong DTO lấy `description` từ
  `@ApiProperty`.

```typescript
  // Sai — Swagger hiện "id" mà không có gì để đọc.
  @Get(':id')
  findOne(@Param('id') id: string) { /* ... */ }

  // Đúng.
  @ApiParam({ name: 'id', description: 'Identifier of the opportunity.' })
  @Get(':id')
```

### Mã trạng thái theo phương thức

| Phương thức | Mã thành công | Decorator | Body |
| --- | --- | --- | --- |
| `GET` | 200 | `@ApiOkResponse` | không |
| `POST` | 201 | `@ApiCreatedResponse` | DTO |
| `POST` (job nền) | 202 | `@ApiAcceptedResponse` | DTO |
| `PUT` | 200 | `@ApiOkResponse` | DTO đầy đủ |
| `PATCH` | 200 | `@ApiOkResponse` | DTO `PartialType` |
| `DELETE` | 200 | `@ApiOkResponse` | không |

`PUT` thay thế toàn bộ bản ghi nên body là trạng thái mới đầy đủ. `PATCH`
chỉ cập nhật một phần nên body là DTO `PartialType`. `DELETE` trả về bản ghi
đã xoá để frontend không phải gọi thêm một lần. `POST` trả `202` chỉ khi
việc còn chạy sau khi trả lời (export, đồng bộ, digest, embedding).

## 5. DTO và validation

DTO là **hợp đồng API**, không phải model Prisma. Model Prisma có trường kỹ
thuật như `createdAt`, `internalNotes`; DTO không được phơi ra những trường đó.

```typescript
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateOpportunityDto {
  @ApiProperty({
    description: 'Tiêu đề hiển thị của cơ hội nghiên cứu.',
    example: 'Nghiên cứu vật liệu mới cho pinh năng lượng',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title: string;

  @ApiPropertyOptional({
    description: 'Mô tả dài hơn về cơ hội và người đang tìm đồng tác.',
    example: 'Giảng viên cần cộng tác viên',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;
}
```

Quy tắc:

- `@ApiProperty` bắt buộc cho mọi trường. `@ApiPropertyOptional` cho trường
  optional. Không có decorator thì `whitelist` sẽ xoá trường đó khỏi payload.
- **Mọi trường phải có `description`.** Đó là chỗ duy nhất ghi lại ý nghĩa
  của một trường, và `apps/api` kiểm tra điều này tự động — xem §13.
- Tên trường trong DTO dùng `camelCase`; mapping sang `snake_case` của
  PostgreSQL là việc của Prisma, không phải của DTO.
- Validate ở DTO bằng `class-validator`. Không tự viết `if` trong service cho
  việc kiểm tra hình dạng dữ liệu.
- `UpdateOpportunityDto` kế thừa `PartialType(CreateOpportunityDto)` từ
  `@nestjs/swagger`, để không lặp lại decorator.
- Enum trong DTO dùng `enum` của Prisma, và khai báo
  `@ApiProperty({ description, enum: X })`.
- DTO query có trường số cần `@Type(() => Number)` từ `class-transformer`, để
  schema Swagger và ép kiểu runtime thống nhất.

Global `ValidationPipe` đã bật `whitelist` và `forbidNonWhitelisted`, nên
payload có trường lạ sẽ trả `400` kèm danh sách trường không hợp lệ.

## 6. Lỗi

Mọi lỗi đi qua `HttpExceptionFilter` và có cùng một hình dạng:

```json
{
  "success": false,
  "data": null,
  "message": "opportunity_not_found",
  "statusCode": 404,
  "path": "/opportunities/abc",
  "timestamp": "2026-10-29T01:30:00.000Z"
}
```

`message` mang **mã lỗi** (`snake_case`), không phải câu tiếng Anh. Frontend
resolve mã này trong catalog `errors.codes`, nên server không bao giờ gửi tiếng
Anh cho người dùng — xem skill `researchos-localization`.

Mỗi mã là một *contract*: đổi tên một mã sẽ phá vỡ mọi bản dịch tham chiếu
tới nó. Thêm mã mới thay vì tái sử dụng mã cũ.

Catalog `errors.codes` chia làm ba tầng, mỗi tầng có một chủ sở hữu:

| Tầng | Đường dẫn trong catalog | Chủ sở hữu | Mọc theo |
| --- | --- | --- | --- |
| Generic | `errors.codes.*` | Backend | Tập HTTP status — **cố định** |
| Field | `errors.codes.fields.*` | Form / DTO | Các ràng buộc validation |
| Domain | `errors.codes.domain.*` | Từng module | Mã cụ thể của module đó |

Nhờ tách vậy, một module không thể vô tình ghi đè một mã generic, và luôn
rõ một mã mới thuộc tầng nào.

Trong service, dùng exception của NestJS — không trả lỗi bằng `throw new Error`:

| Tình huống | Exception |
| --- | --- |
| Dữ liệu không tồn tại | `NotFoundException` |
| Thiếu hoặc sai định dạng input | `BadRequestException` |
| Không đủ quyền | `ForbiddenException` |
| Chưa đăng nhập | `UnauthorizedException` |
| Xung đột với dữ liệu đã có | `ConflictException` |

Khi trạng thái HTTP không nói đủ — `404` chỉ nói "không có", không nói *cái
gì* không có — ném `CodedHttpException` để kèm mã cụ thể của module:

```typescript
throw new CodedHttpException('opportunity_not_found', HttpStatus.NOT_FOUND);
```

Mỗi module tự định nghĩa mã của riêng nó và thêm entry tương ứng vào
`errors.codes.domain` của cả hai locale trong cùng một thay đổi. Mã chung theo
HTTP status nằm sẵn trong `src/common/errors/error-codes.ts` — tập mã này cố
định và không mọc theo module.

**Các mã generic được kiểm tra tự động.** Spec
`src/common/errors/error-codes.spec.ts` đọc cả hai catalog từ đĩa và fail khi
một mã generic mà backend có thể phát ra lại thiếu trong locale nào đó. Nhờ
vậy một entry bị quên sẽ fail `pnpm --filter api test` thay vì lặng lẽ rơi về
một thông báo chung chung. Mã **domain** không nằm trong spec này — mỗi module
tự chịu trách nhiệm cho mã của mình.

Lỗi trả về **không chứa chi tiết nội bộ** (stack, SQL, tên bảng). Chi tiết
đi vào log.

Lỗi validation có thêm mảng `errors`, gom theo từng field để form hiển thị
đúng chỗ. `message` trong mỗi entry cũng là mã lỗi:

```json
{
  "success": false,
  "data": null,
  "message": "validation_failed",
  "statusCode": 400,
  "path": "/opportunities",
  "timestamp": "2026-10-29T01:30:00.000Z",
  "errors": [
    { "field": "title", "messages": ["title_required", "title_invalid"] }
  ]
}
```

`ValidationPipe` chạy với `errorFormat: 'grouped'`, nên `field` là đường dẫn
thật của property (`items.0.name`) và mỗi message là mã do decorator
class-validator mang theo.

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
`apiErrorCode(error)` trong `src/lib/api-error.ts` để lấy mã lỗi, đừng dùng
`String(error)` — nó ra `"AxiosError: Request failed with status code 500"`.

Giá trị `apiErrorCode()` trả về là **mã**, không phải câu hiển thị. Resolve nó
bằng `resolveErrorCode(t, code, t('unknown'))` trước khi render — nếu không,
người dùng sẽ đọc `opportunity_not_found` thay vì một câu thông báo. Xem skill
`researchos-localization`.

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

### Session guard và role guard

Hai guard chạy global, theo thứ tự:

| Guard | Câu hỏi | Trả lời | Mã |
| --- | --- | --- | --- |
| `SessionGuard` | Còn phiên hợp lệ không? | `401 Unauthorized` | `unauthorized` |
| `RoleGuard` | Người gọi có đủ role không? | `403 Forbidden` | `forbidden` |

- **Mọi route được bảo vệ sẵn.** Guard session đăng ký global, nên route
  không cần `@UseGuards(SessionGuard)`. Route công khai opt out bằng
  `@Public()` — đây là ngoại lệ hẹp, không phải mặc định.
- Role của route khai báo bằng `@Roles(ROLES.ADMIN)`. Guard yêu cầu **tất cả**
  role được liệt kê, không phải "một trong". Tên role lấy từ `ROLES` trong
  `src/common/constants/roles.ts` — literal rỗng là lỗi compile.
- Role được đọc **trực tiếp** ở mỗi request, không chụp lại trong session:
  thu hồi quyền có hiệu lực ở request kế tiếp, không cần đăng nhập lại.
- `@CurrentUserId()` trả về `string`, không phải `string | undefined`: guard
  session đã từ chối request không có phiên trước đó.
- Kiểm tra quyền theo bản ghi cụ thể nằm ở **service** của module, không
  nằm ở controller và không nằm ở guard trong `common/`.
- Cookie phiên là token **opaque** (`httpOnly`, `secure`, `sameSite: 'lax'`);
  database chỉ lưu hash SHA-256 của nó.

Chi tiết: skill `researchos-api-endpoint`
([`.cursor/skills/researchos-api-endpoint/SKILL.md`](../.cursor/skills/researchos-api-endpoint/SKILL.md)).

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

## 11b. Phân trang

Mọi endpoint trả danh sách dùng chung một contract:

**Query** — `PaginationQueryDto` trong `src/common/dto/pagination.dto.ts`:

| Trường | Mặc định | Ràng buộc | Ý nghĩa |
| --- | --- | --- | --- |
| `page` | `1` | `@Min(1)` | Số trang, bắt đầu từ 1 |
| `limit` | `20` | `@Min(1)`, `@Max(100)` | Số bản ghi một trang |
| `sort` | — | `@IsString()` | Khóa sắp xếp, `-createdAt` là giảm dần |

Controller nhận query bằng `@Query() query: PaginationQueryDto`, **không**
rải `@Query('page')` rời rạc — một DTO query mang `description` của nó vào
spec và được `ValidationPipe` ép kiểu kiểm tra một chỗ.

**Response** — payload gồm `items` và `meta`:

```json
{
  "success": true,
  "data": {
    "items": [{ "id": "abc", "title": "..." }],
    "meta": {
      "page": 1,
      "limit": 20,
      "total": 137,
      "totalPages": 7,
      "hasNextPage": true,
      "hasPreviousPage": false
    }
  },
  "message": ""
}
```

`meta` nằm **bên trong** payload, cạnh `items`, chứ không nằm cạnh envelope.
Lý do: mutator của Orval chỉ giữ lại `data` khi unwrap, nên một field `meta`
ở tầng envelope sẽ bị rơi mất trước khi tới màn hình.

Dùng `buildPaginationMeta(query, count, total)` để dựng `meta` — đừng tự
tính `totalPages`.

Frontend dùng `usePagination()` trong `apps/web/src/utils/pagination.ts` để có
một cách phân trang giống nhau cho mọi danh sách.

## 12. Checklist trước khi mở Pull Request

- [ ] Endpoint có `@ApiTags`, `@ApiOperation` và `@Api*Response` kèm `type`.
- [ ] **Mọi route đều có `@ApiOperation({ summary })` với `summary` không rỗng.**
- [ ] Mã trạng thái thành công đúng theo phương thức (§4).
- [ ] DTO có `@ApiProperty`/`@ApiPropertyOptional` cho **mọi** trường, kèm
  `description`.
- [ ] Tham số path có `@ApiParam` kèm `description`; tham số header có
  `@ApiHeader` kèm `description`.
- [ ] Response lỗi **không** khai báo `type` — server luôn gửi
  `ApiErrorResponseDto`.
- [ ] Controller không chứa truy vấn Prisma.
- [ ] Controller trả payload thô — không tự dựng envelope.
- [ ] Lỗi dùng exception của NestJS, không dùng `throw new Error`.
- [ ] Mã lỗi mới đã có entry trong **cả hai** locale, ở đúng tầng của nó:
  `errors.codes` (generic), `errors.codes.fields` (validation) hoặc
  `errors.codes.domain` (mã của module).
- [ ] Endpoint trả danh sách dùng `PaginationQueryDto` và `buildPaginationMeta()`.
- [ ] Phân quyền đã được kiểm tra ở backend.
- [ ] Ghi nhiều bảng dùng `$transaction`.
- [ ] `pnpm --filter api build` chạy qua.
- [ ] `pnpm --filter api test` chạy qua.
- [ ] `pnpm --filter api openapi` đã chạy và `openapi.json` đã commit.
- [ ] `pnpm --filter api openapi:check` chạy qua (CI cũng chạy bước này).
- [ ] `pnpm --filter web orval` đã chạy nếu có thay đổi contract.
- [ ] Kiểm tra `openapi.json`: response `2xx` trỏ tới `*Envelope`, và không
  có component tên `String`/`Number`/`Boolean` (primitive phải inline).

## 13. Các quy tắc được kiểm tra tự động

Các quy tắc trong tài liệu này được **kiểm tra bằng code**, không phải bằng
mắt người review.

`apps/api/src/common/openapi/openapi-rules.ts` chứa các quy tắc, và
`apps/api/src/openapi-rules.spec.ts` dựng **document OpenAPI thật** rồi
fail `pnpm --filter api test` khi có quy tắc bị vi phạm.

| Quy tắc | Kiểm tra gì |
| --- | --- |
| `operation.summary` | Mọi route có `summary` khác rỗng |
| `operation.responses` | Mọi route khai báo ít nhất một response |
| `response.description` | Mọi response có `description` |
| `errorResponse.schema` | Mọi response lỗi trỏ tới envelope lỗi chung |
| `parameter.description` | Mọi tham số — path, header, query — có `description` |
| `bodyProperty.description` | Mọi trường của request body có `description` |
| `schemaProperty.description` | Mọi trường của DTO có `description` |
| `component.name` | Không có component tên `String`/`Number`/`Boolean` |
| `schema.reservedFields` | Không DTO nào dùng cả `success` và `data` |

Message của lỗi nêu rõ quy tắc, vị trí và cách sửa, nên một lần test đỏ là
đủ để biết cần thêm decorator nào:

```powershell
pnpm --filter api exec vitest run src/openapi-rules.spec.ts
```

Muốn đổi một quy tắc thì sửa ở `openapi-rules.ts` **và** thêm ca kiểm thử
tương ứng vào `openapi-rules.spec.ts`.
