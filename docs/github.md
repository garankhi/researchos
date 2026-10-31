# GitHub tối giản

## Main và merge

Giữ ruleset hiện có: chặn xóa/force-push `main`, thay đổi qua PR, một approval,
bỏ approval cũ khi có commit mới và giải quyết các thảo luận trước khi merge.
Admin vẫn có thể bypass rule PR như cấu hình ban đầu.

Dùng squash merge và tự xóa branch sau merge. Không cần thêm nhánh staging
hoặc GitHub Environments ở giai đoạn này.

## Actions

`.github/workflows/ci.yml` chạy một job `checks`: install theo lockfile, lint,
test và build. Chạy trên PR và push vào `main`/`dev`, không cần database,
Redis hoặc secrets vì bộ unit test hiện tại dùng stub.

Workflow dùng Node.js 24, pnpm 12.15.0 và cache pnpm. Các action được pin
bằng commit SHA; quyền token mặc định là read, không được duyệt PR.
Chỉ cho phép action của GitHub và `pnpm/action-setup`.

Sau khi push workflow và có lần chạy thành công trên GitHub, thêm `checks`
vào required status checks của ruleset `main-2`. Chưa bật yêu cầu này khi
workflow mới chỉ có ở local, để tránh chặn merge bằng một check chưa tồn tại.

CI này chưa kiểm thử database, Redis, trình duyệt hoặc triển khai server.

## Secrets

Bật secret scanning và push protection. `.env` và các file `.env.*` thật
được Git bỏ qua; chỉ commit `.env.example` với giá trị mẫu cho local.

Chưa cần GHCR, CD, Dependabot hoặc bộ kiểm tra OpenAPI riêng. Khi bắt đầu
deploy, bổ sung cấu hình production, secrets trên server và backup database.
