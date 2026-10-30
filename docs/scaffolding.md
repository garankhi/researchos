# Tạo scaffold bằng CLI chính chủ Next.js và NestJS

Hướng dẫn cho PowerShell tại E:\Project\researchos. Dùng create-next-app và @nestjs/cli chính thức để sinh ứng dụng; không dùng template tùy biến hoặc script tự sinh source.

Project hiện đã có apps/web, apps/api và apps/worker. Các bước generator bên dưới là tài liệu tham khảo để tạo mới; không chạy lại vào các app đang có. Các lệnh generator đã được thử trong thư mục tạm với create-next-app 16.4.3 và Nest CLI 12.0.10 ngày 26/10/2026. Số phiên bản cố định giúp tái hiện cấu trúc đã kiểm tra; có thể chủ động đổi sang latest khi cần cập nhật.

Workspace đã được cấu hình tại root. Xem [cách dùng workspace và khi nào thêm Turborepo](./workspace.md) cho project hiện tại.

## 1. Kiểm tra môi trường

~~~powershell
Set-Location 'E:\Project\researchos'
node --version
pnpm --version
~~~

Môi trường đã kiểm tra: Node.js 24.19.0. Project hiện dùng pnpm 12.15.0 theo package.json ở root. Hướng dẫn chọn Node.js 24, tối thiểu 24.9.0, để đồng bộ với toolchain NestJS 12 và test runner.

Nếu máy khác chưa có pnpm:

~~~powershell
npm.cmd install --global pnpm@12.15.0
~~~

Phần khởi tạo dưới đây dành cho một project mới chưa có package.json hoặc apps.

## 2. Khởi tạo pnpm workspace

Chỉ khi root project mới chưa có package.json:

~~~powershell
pnpm init
~~~

Sau đó mở package.json, đặt private thành true và giữ packageManager đồng bộ với phiên bản pnpm đã chọn (project hiện tại dùng pnpm@12.15.0). pnpm init có thể tự ghi cả devEngines.packageManager; hai khai báo phiên bản cần thống nhất. Đây là chỉnh cấu hình root, không phải tự sinh source thay cho CLI Next.js/NestJS.

Tạo file pnpm-workspace.yaml tại root bằng trình soạn thảo, với nội dung:

~~~yaml
packages:
  - 'apps/*'
  - 'packages/*'
~~~

Đây là cấu hình workspace của package manager. Các CLI Next.js/NestJS không tự tạo cấu hình chung này. Project hiện tại đã có file này và giữ thêm allowBuilds từ cấu hình web trước đó. Thư mục packages có thể để chưa tạo cho tới khi có package dùng chung.

Git repository và remote origin đã tồn tại; không cần chạy lại git init.

## 3. Tạo frontend bằng create-next-app

Chạy tại root:

~~~powershell
pnpm dlx create-next-app@16.4.3 apps/web --ts --eslint --tailwind --app --src-dir --import-alias '@/*' --use-pnpm --skip-install --disable-git --no-react-compiler --no-cache-components --no-agent-feedback --yes
~~~

Lựa chọn: TypeScript, ESLint, Tailwind, App Router, src và alias @/*. React Compiler/Cache Components chưa bật ở bước scaffold. Các flag này là tùy chọn của CLI chính thức.

Nếu muốn tự trả lời các câu hỏi của CLI, dùng lệnh ngắn dưới đây THAY CHO lệnh trên:

~~~powershell
pnpm dlx create-next-app@16.4.3 apps/web --use-pnpm --skip-install --disable-git
~~~

Chỉ chạy một trong hai biến thể. Dùng --skip-install để cài dependency tập trung ở workspace; --disable-git giữ một Git repository duy nhất ở root.

## 4. Tạo backend bằng Nest CLI

Chạy tại root:

~~~powershell
pnpm dlx @nestjs/cli@12.0.10 new api --directory apps/api --package-manager pnpm --skip-install --skip-git --strict --no-observe
~~~

Đây là một NestJS HTTP application bình thường. Tên package mặc định là api. --no-observe bỏ qua bước thiết lập dịch vụ observability tại thời điểm scaffold.

Dùng đường dẫn tương đối apps/api từ root. Việc truyền đường dẫn Windows tuyệt đối vào --directory đã lỗi trong lần thử CLI này.

## 5. Tạo ứng dụng làm nền cho worker bằng Nest CLI

~~~powershell
pnpm dlx @nestjs/cli@12.0.10 new worker --directory apps/worker --package-manager pnpm --skip-install --skip-git --strict --no-observe --skip-tests
~~~

Nest CLI vẫn sinh HTTP application mặc định cho worker. Đây mới là nền ứng dụng để sau đó cấu hình chạy nền; chưa có queue/processor hoặc job nghiên cứu nào.

Không dùng nest generate app trong apps/api cho cấu trúc đã chọn: lệnh đó phục vụ Nest CLI monorepo, trong khi dự án đang dùng pnpm workspace với ba app độc lập.

## 6. Cài dependency chung

Sau khi đã tạo ba app và pnpm-workspace.yaml:

~~~powershell
pnpm install
pnpm list -r --depth 0
~~~

Giữ pnpm-lock.yaml tại root trong Git để cố định dependency thực tế. Dùng pnpm làm package manager chung cho workspace.

## 7. Chạy web và API

Terminal thứ nhất, tại root:

~~~powershell
pnpm --dir apps/web dev
~~~

Web mặc định mở tại http://localhost:3000.

Terminal thứ hai, tại root:

~~~powershell
$env:PORT = '4000'
pnpm --dir apps/api start:dev
~~~

API mặc định của NestJS sẽ mở tại http://localhost:4000 và trả về Hello World! ở đường dẫn /. Biến PORT ở đây chỉ áp dụng cho terminal hiện tại. Việc đặt API sang cổng 4000 tránh trùng cổng 3000 của Next.js.

Kiểm tra từ terminal khác:

~~~powershell
(Invoke-WebRequest 'http://localhost:4000/').Content
~~~

Scaffold chưa cấu hình API prefix, CORS, frontend gọi backend, SSO hoặc database. Khi triển khai nghiệp vụ, bổ sung các phần này có chủ đích.

## 8. Chuyển NestJS app thành worker

Đây là bước chỉnh code sau generator, không phải một flag tạo worker của Nest CLI.

Khi bắt đầu cấu hình background jobs, thay bootstrap trong apps/worker/src/main.ts bằng:

~~~typescript
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

const app = await NestFactory.createApplicationContext(AppModule);
app.enableShutdownHooks();
~~~

Cấu trúc import .js phù hợp với scaffold NestJS 12 ESM đã kiểm tra. createApplicationContext khởi tạo dependency injection mà không mở HTTP server.

Tiếp theo cần Redis và đăng ký BullModule/queue/processor trong worker. Có thể cài các package tương thích đã đối chiếu:

~~~powershell
pnpm --filter worker add --save-exact @nestjs/bullmq@12.0.0 bullmq@6.4.2 @nestjs/config@12.0.1
pnpm --filter api add --save-exact @nestjs/bullmq@12.0.0 bullmq@6.4.2 @nestjs/config@12.0.1
~~~

API sẽ là producer khi cần phát job; worker là consumer. Việc cài package chưa tự cấu hình kết nối Redis, processor, retry hay lịch chạy. Chỉ chạy worker như một dịch vụ nền sau khi các phần này đã được đăng ký. Nếu chỉ tạo application context mà chưa có queue hoặc tác vụ giữ event loop hoạt động, process có thể kết thúc.

Khi đã cấu hình xong, chạy tại root:

~~~powershell
pnpm --dir apps/worker start:dev
~~~

Worker xử lý queue trên VPS sau này cũng dùng code này, chạy bằng process/container riêng. Không cần thuê Cloudflare Workers cho kiến trúc đã chọn.

## 9. Sinh module nghiệp vụ bằng Nest CLI

Cấu trúc thư mục của `apps/api` và `apps/worker` dùng module theo nghiệp vụ: mỗi
nghiệp vụ là một thư mục trong `src/modules/`, phần dùng chung không thuộc
nghiệp vụ nào nằm trong `src/common/`.

~~~text
apps/api/src/
  main.ts
  app.module.ts          Chỉ nối các module nghiệp vụ
  common/                Guard, decorator, filter, interceptor, pipe
    filters/
  modules/
    health/              health.controller.ts, health.service.ts, dto/
    demo/                demo.controller.ts, demo.service.ts
    profiles/            Thêm sau khi chốt trách nhiệm
~~~

Ví dụ sau khi chốt tên module và trách nhiệm:

~~~powershell
pnpm --dir apps/api exec nest generate module modules/profiles
pnpm --dir apps/api exec nest generate module modules/taxonomy
pnpm --dir apps/api exec nest generate module modules/opportunities
~~~

CLI sẽ sinh module và cập nhật import theo cấu trúc ứng dụng. Không cần tạo đồng loạt tất cả module của mọi phase ngay từ đầu.

Luôn kèm cờ `--flat` khi sinh controller, service, guard hoặc class. Không có
cờ này, CLI tạo thêm một thư mục trùng tên và lặp lại hậu tố:

~~~powershell
# Không --flat -> src/modules/profiles/profiles/profiles.controller.ts (sai)
pnpm --dir apps/api exec nest generate controller modules/profiles/profiles --flat
# Có --flat  -> src/modules/profiles/profiles.controller.ts (đúng)
pnpm --dir apps/api exec nest generate service modules/profiles/profiles --flat

# DTO, entity và phần dùng chung cũng dùng --flat.
pnpm --dir apps/api exec nest generate class modules/profiles/dto/create-profile.dto --flat
pnpm --dir apps/api exec nest generate class modules/profiles/entities/profile.entity --flat
pnpm --dir apps/api exec nest generate guard common/guards/roles --flat
~~~

Lệnh sau sinh trọn CRUD (module + controller + service + dto + entities) trong
một lần:

~~~powershell
pnpm --dir apps/api exec nest generate resource modules/profiles
~~~

Quy tắc giữ khi tổ chức:

- `app.module.ts` chỉ nối module; nghiệp vụ và dependency nằm trong từng
  module.
- Module cần service của module khác thì `exports` service đó và `imports`
  module sở hữu. Không import chéo giữa hai thư mục module.
- `common/` chỉ chứa code không biết gì về nghiệp vụ. File nào nhắc tới
  `Profile` hay `Opportunity` thì thuộc module, không thuộc `common/`.
- Import trong `apps/api` và `apps/worker` dùng hậu tố `.js` vì tsconfig đặt
  `module: nodenext` và package có `"type": "module"`.
- Nghiệp vụ dùng chung giữa API và worker đặt ở `packages/backend-core/`,
  không copy logic và không import thẳng source của app kia.

## 10. Các lệnh kiểm tra

Chạy sau khi cài dependency:

~~~powershell
pnpm --dir apps/web lint
pnpm --dir apps/web build
pnpm --dir apps/api build
pnpm --dir apps/api test
pnpm --dir apps/worker build
~~~

Đây là những lệnh bạn chạy trên scaffold thực tế; tài liệu không coi việc kiểm tra CLI/generator là đã chạy thành công các bước build, test hoặc browser.

## Các bước triển khai tiếp theo

1. Chốt các mâu thuẫn SRS và phạm vi MVP trong architecture.md.
2. Thiết kế schema PostgreSQL trong `ResearchOS.sql` và dựng database bằng
   `pnpm db:reset`. Prisma đã được cài đặt làm ORM client; xem
   [database.md](./database.md).
3. Cấu hình Redis/BullMQ và thử một job xuyên suốt từ API tới worker.
4. Tích hợp SSO thật và chính sách phân quyền tài nguyên.
5. Kết nối Next.js với API, xử lý session và cache theo visibility.
6. Bổ sung OpenAPI, logging, CI và Docker cho môi trường triển khai.

## Tài liệu chính thức

- [create-next-app CLI](https://nextjs.org/docs/app/api-reference/cli/create-next-app)
- [Nest CLI usage](https://docs.nestjs.com/cli/usages)
- [Nest standalone applications](https://docs.nestjs.com/standalone-applications)
- [Nest queues / BullMQ](https://docs.nestjs.com/techniques/queues)
- [pnpm workspace](https://pnpm.io/workspaces)
