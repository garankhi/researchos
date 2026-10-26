# Công nghệ công khai của ResearchGate và đối chiếu với ResearchOS

Kiểm tra ngày 26/10/2026. Đây là đánh giá dựa trên GitHub công khai và tài liệu của chủ repo, không phải sơ đồ hạ tầng production được ResearchGate xác nhận.

Kết luận: bằng chứng công khai cho thấy hệ sinh thái React/TypeScript, PHP, Java, Python và các công cụ dữ liệu/hạ tầng. Các bằng chứng này không tạo lý do để đổi Next.js/NestJS của ResearchOS. Nên học cách xử lý dữ liệu học thuật, thiết kế trải nghiệm và tổ chức tooling, đồng thời giữ lựa chọn triển khai phù hợp với quy mô dự án.

## Phương pháp và giới hạn

- Đã đọc hai trang GitHub API, mỗi trang tối đa 100 repo: tổng cộng 134 public repo, 51 repo không đánh dấu fork và 83 fork tại thời điểm kiểm tra.
- Đã kiểm tra README/manifest của một số repo đại diện, bao gồm hai thư viện React và monorepo tooling.
- Repo tồn tại, được cập nhật hoặc không bị archive chỉ chứng minh trạng thái repo đó. Không đủ để xác nhận thư viện/dịch vụ vẫn được dùng trong sản phẩm chính.
- Repo fork và repo cũ được tách khỏi bằng chứng triển khai hiện tại. Ngôn ngữ chủ đạo do GitHub gắn cho repo cũng không phải tỷ trọng ngôn ngữ của hệ thống ResearchGate.
- Chưa có bằng chứng từ các nguồn đã xem để xác nhận sản phẩm chính dùng Next.js, NestJS, Prisma, BullMQ hoặc Turborepo. Điều này không chứng minh họ không dùng các công cụ đó trong hệ thống riêng.

Nguồn kiểm kê: [org ResearchGate](https://github.com/orgs/researchgate/repositories), [API trang 1](https://api.github.com/orgs/researchgate/repos?per_page=100&sort=pushed&type=public&page=1), [API trang 2](https://api.github.com/orgs/researchgate/repos?per_page=100&sort=pushed&type=public&page=2).

## Bằng chứng theo nhóm công nghệ

| Nhóm | Repo/tài liệu đã kiểm tra | Điều có thể kết luận |
| --- | --- | --- |
| React, JavaScript/TypeScript | [react-intersection-observer](https://github.com/researchgate/react-intersection-observer), [react-intersection-list](https://github.com/researchgate/react-intersection-list), [react-fast-highlight](https://github.com/researchgate/react-fast-highlight) | Có các thư viện UI React, theo dõi viewport, infinite scroll và highlight code do org công khai |
| PHP / dependency injection | [injektor](https://github.com/researchgate/injektor) | Có container DI cho PHP; README thư viện yêu cầu PHP 8.1+, không xác định phiên bản PHP của toàn sản phẩm |
| Java / REST / document database | [restler](https://github.com/researchgate/restler) | Thư viện REST cho document database; ví dụ service dùng Dropwizard và MongoDB |
| GraphQL | [graphql-php](https://github.com/researchgate/graphql-php) | Org có fork GraphQL implementation cho PHP; riêng fork này chưa chứng minh kiến trúc API hiện tại |
| Python / Crossref / GCP / BigQuery | [crossref-snapshot-mount](https://github.com/researchgate/crossref-snapshot-mount) | Có pipeline công khai cho snapshot Crossref, xử lý dữ liệu bằng Python, VM, Cloud Storage và BigQuery |
| Tooling và monorepo | [tooling/package.json](https://github.com/researchgate/tooling/blob/master/package.json), [spire](https://github.com/researchgate/spire), [gradle-release](https://github.com/researchgate/gradle-release) | Có tooling JavaScript dùng workspaces packages/*, Spire và plugin release Lerna; có plugin release cho Gradle |
| Email QA | [emailonacid](https://github.com/researchgate/emailonacid) | Có thư viện kiểm tra hồi quy hiển thị email qua Email on Acid API |
| Streaming và deployment | [kafka-metamorph](https://github.com/researchgate/kafka-metamorph), [spinnaker-helm](https://github.com/researchgate/spinnaker-helm) | Có code liên quan Kafka consumer và Helm chart Spinnaker; không suy ra chúng là yêu cầu cho ResearchOS |

Ngoài ra org có fork liên quan Elasticsearch, Flink, Kubernetes và nhiều module Puppet. Đây là dấu vết công nghệ, chưa phải bằng chứng đủ để liệt kê chúng như toàn bộ stack production đang chạy.

Ví dụ cần đọc kỹ: [puppetlabs-postgresql](https://github.com/researchgate/puppetlabs-postgresql) ghi rõ bản fork được giữ làm dự phòng sau khi chuyển sang repo upstream. Sự tồn tại của fork này không cho biết hiện PostgreSQL được dùng cho phần nào của sản phẩm.

## Khả năng dùng trực tiếp các thư viện React

Đã đọc manifest ở default branch qua GitHub API:

| Package | Version trong manifest | React peer dependency |
| --- | --- | --- |
| @researchgate/react-intersection-observer | 1.3.5 | ^16.3.2 hoặc ^17.0.0 |
| @researchgate/react-intersection-list | 3.0.12 | ^16.3.2 |

Nguồn: [observer package.json](https://github.com/researchgate/react-intersection-observer/blob/master/package.json), [list package.json](https://github.com/researchgate/react-intersection-list/blob/main/package.json).

ResearchOS hiện khai báo React/React DOM 19.3.0. Hai manifest trên không khai báo hỗ trợ React 19. Vì vậy chưa đưa chúng vào dependency của dự án và không ép cài bỏ qua peer dependency. Ngày cập nhật repo mới không đủ để kết luận tương thích với React mới.

Có thể học cách dùng IntersectionObserver cho feed, danh sách publication và lazy loading. Việc chọn thư viện hoặc dùng API trình duyệt trực tiếp cần kiểm tra tương thích, accessibility và hành vi thực tế của UI.

Khuyến nghị cụ thể cho frontend React 19, bao gồm phân biệt package có/không có scope và metadata npm so với manifest source: [Viewport, infinite scroll và virtualization](./frontend-viewport.md).

## Đề xuất cho ResearchOS

Đây là khuyến nghị cho dự án, không phải mô tả ResearchGate:

1. Giữ Next.js + TypeScript cho giao diện. Khi làm feed/discovery, áp dụng pagination/cursor và tải thêm theo viewport với phương án điều hướng dễ sử dụng.
2. Giữ NestJS modular monolith và REST/OpenAPI theo kiến trúc đã thống nhất. Chỉ cân nhắc GraphQL khi nhu cầu query của client và chi phí vận hành có cơ sở rõ ràng.
3. Giữ PostgreSQL làm dữ liệu nghiệp vụ. Ví dụ MongoDB trong Restler và BigQuery trong pipeline không quyết định database phù hợp cho membership, permission, opportunity và audit của ResearchOS.
4. Ưu tiên data foundation: chuẩn hóa DOI/ORCID, phát hiện trùng, xác nhận đúng tác giả, lưu nguồn/timestamp, xử lý xung đột và pending confirmation.
5. Tách các bước ingest, normalize, reconcile, cập nhật search và thông báo thành job có checkpoint/idempotency. Repo Crossref là tham khảo tốt về việc tách làm sạch dữ liệu và tải dữ liệu để dễ retry.
6. Tiếp tục pnpm + Turborepo cho package/tooling dùng chung. Repo tooling chứng minh một cách tổ chức shared tooling của ResearchGate, không yêu cầu ResearchOS chuyển sang Spire/Lerna.
7. Đánh giá chất lượng hiển thị email khi triển khai digest; không bắt buộc dùng dịch vụ Email on Acid chỉ vì có repo này.
8. Chưa bổ sung PHP, Java, Kafka, Kubernetes hoặc BigQuery chỉ để giống danh sách công nghệ của ResearchGate. Bổ sung theo workload, phạm vi và khả năng vận hành thực tế.

Với ResearchOS, ưu tiên học từ ResearchGate là dữ liệu học thuật đáng tin cậy, trải nghiệm tìm kiếm/profile/feed và khả năng kiểm soát tác vụ nền. Các quyết định hạ tầng vẫn theo SRS và quy mô đã chốt.

## Nguồn tuyển dụng và giới hạn xác minh

Các kết quả tìm kiếm còn hiển thị tin Senior Frontend Engineer có React/TypeScript/PHP/GraphQL tại Lever. Khi mở trực tiếp để kiểm tra, URL trả 404; trang careers hiện liên kết sang Personio. Báo cáo không dùng các kết quả đó để xác nhận stack production hiện tại.

Nguồn kiểm tra: [ResearchGate careers](https://www.researchgate.net/careers), [Personio được careers liên kết](https://researchgate.jobs.personio.de/).

## Thay đổi trong repository

Chỉ thêm tài liệu đánh giá và liên kết từ architecture.md. Không đổi framework, database, dependency hoặc source ứng dụng từ kết quả khảo sát này.
