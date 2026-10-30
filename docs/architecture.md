# Kiến trúc ResearchOS

Ngày ghi nhận: 26/10/2026.

Kiến trúc nền đã thống nhất: Next.js + NestJS, monorepo pnpm, backend modular monolith và worker chạy bằng process/container riêng trên VPS. Phạm vi chức năng từng phase và chỉ tiêu nghiệm thu vẫn cần xác nhận; chọn kiến trúc này không đồng nghĩa đã chọn toàn bộ SRS làm phạm vi bàn giao.

Tham khảo quyết định: [ADR-0001](./adr/0001-modular-monolith-and-vps-worker.md).
Tạo project: [Hướng dẫn CLI chính chủ](./scaffolding.md).
Quản lý monorepo: [pnpm workspace và Turborepo](./workspace.md).
Tham khảo sản phẩm tương tự: [Công nghệ công khai của ResearchGate](./researchgate-tech-review.md).
Khuyến nghị UI: [Viewport, infinite scroll và virtualization](./frontend-viewport.md).
Nguồn nghiệp vụ: SRS PDF hiện có trong docs (119 trang); PDF tiếp tục được Git bỏ qua.

## Thành phần và trách nhiệm

| Thành phần | Công nghệ | Trách nhiệm |
| --- | --- | --- |
| Web | Next.js App Router + TypeScript | Giao diện, routing, rendering, các trang profile/CV theo quyền truy cập |
| Task runner | Turborepo trên pnpm workspace | Điều phối và cache build/lint/test; dev chạy không cache |
| API | NestJS + REST/OpenAPI | Nghiệp vụ, phân quyền, validation, transaction và tích hợp |
| Worker | NestJS application context + BullMQ | Xử lý job nền, chạy độc lập với HTTP API |
| Database | PostgreSQL | Dữ liệu nghiệp vụ, ràng buộc, audit và provenance |
| Data access | Prisma 7, kết hợp SQL khi cần | ORM và migration trong `packages/database`; xem [database.md](./database.md) |
| Queue | Redis + BullMQ | Lưu/điều phối job, retry, theo dõi trạng thái |
| Files | Object storage tương thích S3 | Evidence, dataset và file export; database lưu metadata |
| Search | PostgreSQL search/trigram, thêm vector khi cần | Điểm khởi đầu cho MVP nếu tiêu chí search cho phép |
| Search ở mức UC-06 | Đánh giá OpenSearch | BM25 + semantic search, sau khi chốt workload và benchmark |
| AI | Nhà cung cấp được phê duyệt | Retrieval có dẫn nguồn, giới hạn theo quyền và chính sách dữ liệu |

Worker là code Node.js do dự án phát triển và vận hành trên VPS. Cloudflare Workers + Queues là phương án thay thế chưa được chọn; cần thiết kế tích hợp theo runtime của Cloudflare nếu chuyển sang cách đó.

~~~mermaid
flowchart TD
    Browser["Trình duyệt"] --> Proxy["Reverse proxy / HTTPS"]
    Proxy --> Web["Next.js"]
    Proxy --> API["NestJS API"]
    Web --> API
    API <--> SSO["FPTU SSO"]
    API --> DB[("PostgreSQL")]
    API --> Queue["Redis / BullMQ"]
    Queue --> Worker["NestJS worker"]
    Worker --> DB
    Worker --> External["Crossref / ORCID / HR / Email / AI"]
    API --> Files["Object storage"]
    Worker --> Files
    API --> Search["Search / Retrieval"]
    Worker --> Search
~~~

## Cấu trúc repository dự kiến

~~~text
researchos/
  apps/
    web/                  Next.js
      src/
        app/              Route; Next.js sở hữu cây này
          _components/    Chỉ dùng trong segment gốc
        components/
          ui/             Primitive dùng chung, không biết nghiệp vụ
          providers/      Client provider toàn app
        features/         Một thư mục cho mỗi nghiệp vụ
        lib/              Hạ tầng; api/ do Orval sinh ra
        theme/            Cấu hình theme MUI
    api/                  NestJS HTTP API
      src/
        main.ts
        app.module.ts     Chỉ nối các module nghiệp vụ
        common/           Guard, decorator, filter, interceptor, pipe
        modules/          Một thư mục cho mỗi nghiệp vụ
    worker/               NestJS background worker
      src/
        main.ts
        app.module.ts
        common/
        modules/
        processors/        Một file cho mỗi loại job
  packages/
    config/               Cách tìm và nạp file .env dùng chung
    database/             Prisma schema, migration, client dùng chung API/worker
    contracts/            API contracts/client; không đưa ORM entities ra frontend
    backend-core/         Nghiệp vụ backend dùng chung cho API/worker nếu cần
  docs/
    architecture.md
    scaffolding.md
    api-convention.md
    database.md
    adr/
  package.json
  pnpm-workspace.yaml
  pnpm-lock.yaml
  turbo.json
~~~

Đây là pnpm workspace chứa các ứng dụng độc lập. Không cần chuyển riêng backend sang Nest CLI monorepo bằng lệnh generate app.

Trong `apps/api` và `apps/worker`, module nghiệp vụ nằm trong `src/modules/<tên-nghiệp-vụ>/` với tên file theo tên nghiệp vụ (`profiles.controller.ts`, `profiles.service.ts`, `profiles.module.ts`). Phần dùng chung không thuộc nghiệp vụ nào nằm ở `src/common/`; `src/common/` không được biết tới `Profile` hay `Opportunity`. `app.module.ts` chỉ nối module, không chứa logic nghiệp vụ. Chi tiết lệnh sinh code: [scaffolding.md](./scaffolding.md).

### Cấu trúc frontend

`apps/web` dùng cùng nguyên tắc phân tách như backend: nghiệp vụ và phần dùng chung không trộn lẫn.

~~~text
apps/web/src/
  app/                      Route; Next.js sở hữu cây này
    _components/            Chỉ dùng trong segment gốc
    <segment>/_components/  Chỉ dùng trong segment đó
  components/
    ui/                     Primitive dùng chung: LoadingSkeleton, ErrorState, EmptyState
    providers/              Client provider toàn app: theme, query
  features/                 Một thư mục cho mỗi nghiệp vụ
    <nghiệp-vụ>/
      index.ts              Barrel — điểm import duy nhất từ bên ngoài
      types.ts              Kiểu dữ liệu UI dùng
      hooks/                Hook gọi API và chuẩn hoá trạng thái
      components/           Component riêng của nghiệp vụ
  lib/                      Hạ tầng, không có logic nghiệp vụ
    api/                    DO ORVAL SINH RA — không sửa tay
    axios-instance.ts       Mutator cho Orval; phải nằm ngoài api/
  theme/                    Cấu hình theme MUI
~~~

Quy tắc giữ khi tổ chức frontend:

- **`src/lib/api/` là của Orval.** Config Orval chạy với `clean: true`, nên lần
  codegen sau sẽ xóa sạch thư mục đó rồi sinh lại. Mọi file viết tay đặt
  trong đó sẽ bị xóa. Quy tắc `no-restricted-imports` trong
  `apps/web/eslint.config.mjs` chặn import trực tiếp vào `src/lib/api/*`;
  import qua barrel `@/lib/api`.
- **`components/ui/` không biết gì về nghiệp vụ.** Cùng nguyên tắc với
  `src/common/` của backend: file ở đây không được nhắc tới `Profile`,
  `Opportunity`, `Taxonomy`.
- **`features/<nghiệp-vụ>/` đặt tên theo đúng module ở
  `apps/api/src/modules/<tên-nghiệp-vụ>/`** để tra nghiệp vụ được nhanh.
- **Feature không import chéo lẫn nhau.** Cần dữ liệu của feature khác thì
  gọi qua hook của feature đó.
- **Tách lớp transport và domain.** Orval sinh ra tầng transport: request,
  cache key, query lifecycle. Tầng domain nằm ở `features/<nghiệp-vụ>/hooks/`
  ánh xạ DTO sang kiểu domain và chuẩn hoá trạng thái để UI không phải
  phân biệt `isPending` (chưa có data) với `isFetching` (đang có request).
  `isPending` với query `enabled: false` đúng mãi, là nguồn lỗi "spinner
  không bao giờ dừng" quen thuộc.

Chi tiết cách viết feature (barrel, domain hook, loading/mutation/error states): skill `researchos-ui`.

Next.js gọi API NestJS; nghiệp vụ và quyết định phân quyền cuối cùng tập trung ở NestJS. Route Handler hoặc Server Action nếu dùng chỉ đảm nhiệm phần cần cho giao diện. API và worker dùng chung nghiệp vụ thông qua package backend có chủ sở hữu rõ ràng, tránh copy logic hoặc import thẳng source của ứng dụng kia.

Các module nghiệp vụ dự kiến: Identity/Access, Profiles/Publications, Taxonomy, Groups, Opportunities, Follow/Digest, Discovery, Assistant, Exports và Integrations. Projects, Circles, Collaboration, Knowledge/Validation, Research Records và Intelligence được thêm theo phase đã xác nhận.

## Cách chạy worker

Ví dụ: API nhận yêu cầu export, ghi yêu cầu vào database, phát job; worker nhận job, tạo file, cập nhật kết quả; frontend hiển thị tiến độ và link tải. Đồng bộ dữ liệu, gửi digest, tạo embedding và export lớn không giữ HTTP request chờ toàn bộ công việc hoàn thành.

Nest CLI tạo ứng dụng HTTP mặc định. Để biến app đó thành worker, cần chuyển bootstrap sang createApplicationContext và đăng ký queue/processor. CLI không tự tạo toàn bộ hệ thống xử lý job.

Ban đầu có thể chạy web, API, worker, PostgreSQL và Redis trên một VPS bằng các process/container riêng. Cần giới hạn concurrency và tài nguyên worker; chung máy vẫn chia sẻ CPU/RAM và điểm lỗi. Khi cần, chuyển worker sang máy khác có kết nối mạng riêng phù hợp tới Redis/database.

Với job nghiệp vụ, dùng transaction/ràng buộc database, idempotency và retry có giới hạn. Dùng transactional outbox cho trường hợp cần đảm bảo phát job sau khi ghi dữ liệu. Gửi email không được mặc định coi là exactly-once chỉ nhờ queue; cần ledger/idempotency và khả năng của nhà cung cấp email.

## Các nguyên tắc phải giữ từ đầu

- Backend kiểm tra role, ownership, membership và visibility cho từng tài nguyên.
- Search, Assistant, export và digest dùng cùng chính sách quyền; lọc dữ liệu trước khi đưa vào prompt hoặc gửi email.
- Dữ liệu tự nhập, imported và AI-inferred có nguồn gốc, thời điểm và trạng thái xác nhận riêng.
- Record validation status, visibility và publication status là ba trục độc lập.
- AI tạo gợi ý; người có thẩm quyền xác nhận taxonomy, quan hệ tri thức và nghiên cứu chính thức.
- Lỗi nguồn dữ liệu bên ngoài không chặn việc đọc dữ liệu đã lưu.
- Không bắt đầu bằng microservices hoặc graph database chỉ vì số lượng màn hình lớn. Đánh giá tách dịch vụ/database sau khi đo và xác định nhu cầu.

## Ba mục tiêu triển khai

| Mục tiêu | Phạm vi và mức đầu tư |
| --- | --- |
| MVP/đồ án | Tập trung SSO, profile, taxonomy, discovery, group hub, opportunities, follow/digest, LLKH thô và Assistant tra cứu; vận hành đơn giản |
| Dùng thực tế trong trường | Có thể giữ cùng phạm vi MVP, nhưng cần staging, CI/CD, backup đã thử khôi phục, monitoring, rollback và người phụ trách vận hành |
| Toàn bộ SRS/quy mô lớn | Bổ sung các phase nâng cao, mở rộng API/worker/search theo tải và đo các tiêu chí nghiệm thu; không mặc định buộc phải microservices |

Phạm vi tính năng và quy mô là hai quyết định riêng. Đủ màn hình chưa đủ để gọi là sẵn sàng vận hành thực tế.

## Những điểm SRS cần chốt

| Vấn đề | Nội dung cần thống nhất |
| --- | --- |
| Quyền xem đơn quan tâm | BR-08 mô tả minh bạch trong cộng đồng; S-14/S-16, ERD và PR-03 mô tả riêng tư |
| Matching | UC-16 tính điểm/xếp hạng; BR-11 và S-33 hạn chế/cấm điểm và xếp hạng giảng viên |
| Project lifecycle | UC-21 có phê duyệt và trạng thái khác với BR-17/S-39; màn hình mô tả không có workflow phê duyệt mặc định |
| Digest | BR-19 quy định hàng tuần, trong khi S-18 mô tả Daily/Weekly/Monthly |
| LLKH | Phần MVP chỉ Word/Excel thô; UC-05/BR-20 mô tả phạm vi nhiều mức; cần chốt phase và template |
| Search/performance | NFR chung đề xuất search p95 <= 3 giây, workload chưa chốt; UC-06 đặt p95 <= 500 ms cho kết quả đầu, 500 concurrent searches, 1 triệu papers/100.000 researchers |
| Availability | NFR chung đề xuất 99,5% hàng tháng; một số UC yêu cầu 99,9% cho chức năng; cần thống nhất cách đo và phụ thuộc |
| Tích hợp và vai trò | Xác nhận giao thức SSO, quyền API HR/nguồn học thuật, actor operator/reviewer, lịch ngày làm việc và chính sách dữ liệu gửi AI |

PostgreSQL full-text search thông thường không tương đương BM25. Nếu UC-06 là tiêu chí bắt buộc ngay từ đầu, cần thiết kế/benchmark search phù hợp thay vì xem lựa chọn search gọn cho MVP là đã đáp ứng yêu cầu.

## Tài liệu chính thức

- [Next.js Backend for Frontend](https://nextjs.org/docs/app/guides/backend-for-frontend)
- [NestJS Queues](https://docs.nestjs.com/techniques/queues)
- [BullMQ Workers](https://docs.bullmq.io/guide/workers)
- [pnpm Workspaces](https://pnpm.io/workspaces)
- [PostgreSQL Full Text Search](https://www.postgresql.org/docs/current/textsearch.html)
- [pgvector](https://github.com/pgvector/pgvector)
- [OpenSearch BM25](https://docs.opensearch.org/latest/search-plugins/keyword-search/)
- [OpenSearch Hybrid Search](https://docs.opensearch.org/latest/vector-search/ai-search/hybrid-search/index/)
- [Cloudflare Queues](https://developers.cloudflare.com/queues/get-started/)
