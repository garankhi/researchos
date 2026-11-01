# Redis và BullMQ

`apps/api` gửi job bằng `JobsService`. Redis lưu queue. `apps/worker` chạy
bằng `NestFactory.createApplicationContext` và nhận job qua `ProbeProcessor`.
Worker không mở HTTP port. API và worker chỉ dùng chung `packages/queue`,
không import source của nhau.

Queue `system-checks`, job `probe` là kiểm tra hạ tầng nội bộ. Job trả
`requestId`, PID worker, lần xử lý và thời điểm hoàn thành; không ghi bảng
nghiệp vụ, gửi email hoặc gọi dịch vụ ngoài. Chưa có HTTP endpoint tạo job.

## Chạy và thử thủ công

Sau khi có `.env` từ `.env.example`:

```powershell
pnpm install --frozen-lockfile
pnpm infra:up
pnpm dev:worker
```

Terminal khác:

```powershell
pnpm queue:probe
```

Lệnh probe tạo application context của API, gọi producer thật và chờ kết quả
tối đa 15 giây. JSON đầu ra chứa `producerPid` khác `workerPid`, xác nhận
job được xử lý ở process worker. Nếu chưa chạy worker, lệnh báo timeout.
API HTTP vẫn chạy bằng `pnpm dev:api` như trước.

## Kiểm thử tự động với Redis thật

```powershell
pnpm infra:up
pnpm test:queue
```

Lệnh tự build API/worker/package dùng chung và khởi động worker ở process
riêng. Test dùng một prefix Redis ngẫu nhiên, không cần Redis/database thứ
hai. API và worker kết nối database hiện có nhưng không ghi dữ liệu
nghiệp vụ. Test bao gồm:

1. API tạo job → Redis → worker xử lý → lưu kết quả và progress 100%.
2. Job lỗi tạm thời được retry rồi thành công.
3. Cùng job ID còn được lưu chỉ tạo một job.
4. Dừng sau ba lần thất bại, giữ job trong trạng thái failed.
5. Payload không hợp lệ bị đánh failed ngay, không retry.
6. API fail khởi động có thời hạn khi Redis không truy cập được.

Test dừng worker thử và chỉ xóa queue có prefix UUID của chính lần chạy.
`pnpm test` vẫn chạy unit test không cần Redis; `test:queue` là lệnh riêng
để CI hiện tại không phải thêm service bắt buộc.

## Cấu hình và giới hạn

- `REDIS_URL` bắt buộc cho API/worker; hỗ trợ `redis://`, `rediss://`,
  username/password và số database trong URL.
- `QUEUE_PREFIX` mặc định `researchos`; producer và consumer phải giống nhau.
- Producer fail nhanh khi enqueue lúc mất Redis; cả producer và consumer
  có thể reconnect. API chờ kết nối Redis tối đa 5 giây lúc khởi động.
- Worker concurrency 2; job mặc định ba attempts, backoff exponential từ 500ms.
- Chính sách dọn completed job: một giờ/100 job; failed job: một ngày/1000
  job. BullMQ dọn lazily khi có job kết thúc, đây không phải TTL tuyệt đối.
  Chống trùng bằng job ID chỉ có hiệu lực khi job đó còn được giữ.
- Docker Redis đã bật AOF/everysec và noeviction. Khi Redis đầy, cần xử lý
  lỗi enqueue; không bật eviction cho queue.
- Worker/API đăng ký shutdown hooks để đóng queue và kết nối khi nhận signal.

Khi thêm job nghiệp vụ thật, cần processor riêng, kiểm tra quyền, transaction
và idempotency theo nghiệp vụ. Với thao tác ghi DB rồi phát job cần đảm bảo
không mất job, dùng transactional outbox. Probe này không chứng minh
exactly-once cho email hay các tác vụ có side effect.

Nguồn: [NestJS queues](https://docs.nestjs.com/techniques/queues),
[BullMQ connections](https://docs.bullmq.io/guide/connections).
