# pnpm workspace và Turborepo

Project dùng pnpm 12.15.0, có workspace duy nhất ở root, gồm web, api và worker. Turborepo 2.11.10 được bổ sung để điều phối/cache build, lint và test; pnpm tiếp tục quản lý dependency và workspace.

## Workspace được cấu hình thế nào?

File pnpm-workspace.yaml ở E:\Project\researchos:

~~~yaml
packages:
  - 'apps/*'
  - 'packages/*'

allowBuilds:
  sharp: false
  unrs-resolver: false
~~~

Hai mục packages gom các app và package dùng chung vào cùng workspace. Root luôn được bao gồm. packages có thể chưa tồn tại.

allowBuilds là lựa chọn cho phép/chặn script cài đặt của dependency, được giữ nguyên từ cấu hình Next.js đã tạo. Các giá trị false không loại dependency khỏi project; chúng không cho script build của các dependency đó chạy khi install.

Cấu hình từng nằm trong apps/web/pnpm-workspace.yaml đã được gom lên root, tránh tạo workspace con. packageManager của apps/web đã đồng bộ với root thành pnpm@12.15.0. Các app vẫn được sinh bằng CLI chính thức; việc tạo workspace không scaffold lại hoặc thay source nghiệp vụ.

Root package.json đã có private: true. Dùng một pnpm-lock.yaml chung tại root và commit nó cùng manifest, workspace config và source.

## Cài và kiểm tra

Chạy từ root:

~~~powershell
Set-Location 'E:\Project\researchos'
pnpm install
pnpm list -r --depth 0
~~~

Danh sách project phải có researchos, api, web và worker.

pnpm chọn project theo trường name trong package.json. Các tên hiện tại lần lượt là api, web và worker:

~~~powershell
pnpm --filter web dev
~~~

Ở một terminal khác:

~~~powershell
$env:PORT = '4000'
pnpm --filter api start:dev
~~~

Web mặc định dùng cổng 3000; API được đặt sang 4000 trong terminal này. Worker hiện vẫn là app NestJS mặc định, cần chuyển bootstrap và cấu hình consumer trước khi chạy như worker nền; xem scaffolding.md.

Các lệnh khác:

~~~powershell
# Chạy web và API cùng lúc qua Turborepo.
pnpm dev

# Chạy riêng từng app.
pnpm dev:web
pnpm dev:api

# Build, lint và test các package có script tương ứng, có cache.
pnpm build
pnpm lint
pnpm test

# Build riêng web, vẫn dùng cache của Turborepo.
pnpm exec turbo run build --filter=web

# Chạy test của API.
pnpm --filter api test

# Ví dụ thêm dependency vào đúng app, khi bắt đầu triển khai tính năng đó.
pnpm --filter api add @nestjs/config
~~~

Các lệnh dev từ root đã đặt API ở cổng 4000 qua cross-env để chạy trên Windows và Linux. Worker có lệnh pnpm dev:worker riêng, hiện dùng cổng 4001 vì source vẫn là HTTP scaffold; root pnpm dev chỉ chạy web và API. Khi chuyển worker thành application context/queue consumer, biến PORT sẽ không còn được dùng.

API có unit test do CLI sinh; worker được scaffold với --skip-tests nên chưa có test. Script test của worker dùng --passWithNoTests để báo rõ chưa có test thay vì làm thất bại task chung; khi thêm test thật, các assertion thất bại vẫn khiến lệnh lỗi.

Chỉ dùng --parallel cho các task phù hợp chạy đồng thời; các build có quan hệ phụ thuộc nên giữ thứ tự.

Khi có package nội bộ thực sự, khai báo dependency bằng workspace:* và cung cấp entry point/build hợp lệ cho package đó. Không tạo package rỗng chỉ để lấp đầy cấu trúc thư mục.

## Vai trò của Turborepo

| Nhu cầu | pnpm workspace | Turborepo bổ sung |
| --- | --- | --- |
| Cài dependency, link package nội bộ, giữ lockfile chung | Có | Dùng package manager hiện có |
| Chạy script theo package hoặc toàn workspace | Có, qua --filter và -r | Điều phối theo task graph |
| Chạy theo quan hệ phụ thuộc package | Có thứ tự topological mặc định cho recursive tasks | Khai báo quan hệ phụ thuộc giữa task chi tiết hơn |
| Cache kết quả build/lint/test ở mức task | Không có task cache tổng quát; dependency store và cache riêng của framework là việc khác | Có task cache với inputs/outputs cấu hình |
| Dùng chung cache task giữa máy dev và CI | Không phải chức năng workspace | Có remote caching khi cấu hình |

pnpm tự nó đủ cho ba app hiện tại. Dự án vẫn chọn thêm Turborepo sớm vì số cấu hình bổ sung ít, có task cache ngay từ đầu và sẵn đường mở rộng khi thêm package nội bộ hoặc CI. Chỉ khi chạy lại task với cùng input mới có cache hit; cài Turborepo không tự làm mọi lần build đầu tiên nhanh hơn.

## Cấu hình cache hiện tại

- build chạy ^build của dependency trước, lưu dist hoặc .next, bỏ cache nội bộ .next/cache khỏi output lưu trữ.
- lint và test lưu kết quả/log task; hiện không khai báo output coverage vì test không chạy ở chế độ coverage.
- dev là persistent task và cache: false; các biến môi trường được truyền qua đầy đủ cho dev.
- Thay đổi file .env ở root làm thay đổi hash chung; file .env trong từng app tham gia hash build/test của app đó.
- NODE_ENV tham gia hash chung; NEXT_PUBLIC_* tham gia hash build của web; CI tham gia hash test.
- Khi source bắt đầu dùng thêm biến môi trường lúc build/test, phải khai báo chúng vào env/globalEnv của turbo.json. Hash file .env không tự load file đó; framework hoặc thư viện config vẫn phải thực hiện việc load.

Cache hiện dùng local .turbo, đã nằm trong .gitignore. Remote cache chưa được bật/kết nối. Có thể kiểm tra task graph mà không chạy ứng dụng:

~~~powershell
pnpm exec turbo run build --dry=json
pnpm exec turbo run dev --filter=web --filter=api --dry=json
~~~

Turborepo dùng cùng pnpm, không thay thế pnpm workspace. Khi mở rộng cấu hình cần khai báo đúng inputs, outputs và biến môi trường để cache chính xác. Các tác vụ có side effect như migration, gửi email và xử lý queue không được xem như build task có thể phát lại từ cache.

Turbopack trong Next.js là bundler; Turborepo là công cụ điều phối/cache task cho monorepo. Hai công cụ có vai trò riêng.

## Kiểm chứng ngày 26/10/2026

- pnpm nhận đủ root và ba app web/api/worker.
- Task graph build có ba task; dev mặc định chỉ có web và API, cache tắt và persistent bật.
- Đã chạy turbo run build lint test thành công: 8 task (3 build, 3 lint, 2 test command). Web chưa có script test; worker không có test case và được phép kết thúc khi không tìm thấy test.
- Lượt đầu hoàn thành trong 24,16 giây; lượt chạy lại cùng input nhận 8/8 task từ local cache, báo thời gian task 128 ms. Đây là kết quả trên scaffold và máy hiện tại, không phải cam kết hiệu năng cho mọi thay đổi.
- Chưa kiểm chứng khởi động dev chung hoặc giao diện trong trình duyệt. Cổng 3000 và 4000 đang có tiến trình sử dụng nên đã giữ nguyên các tiến trình đó.

## Nguồn chính thức

- [pnpm workspace](https://pnpm.io/workspaces)
- [pnpm recursive tasks](https://pnpm.io/cli/recursive)
- [pnpm filtering](https://pnpm.io/filtering)
- [Turborepo running tasks](https://turborepo.dev/docs/crafting-your-repository/running-tasks)
- [Turborepo caching](https://turborepo.dev/docs/crafting-your-repository/caching)
