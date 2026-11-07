# Redis và BullMQ

`apps/api` gửi job bằng `JobsService`. Redis lưu queue. `apps/worker` chạy
bằng `NestFactory.createApplicationContext` và nhận job qua `ProbeProcessor`.
Worker không mở HTTP port. API và worker chỉ dùng chung `packages/queue`,
không import source của nhau.

Queue `system-checks`, job `probe` là kiểm tra hạ tầng nội bộ. Job trả
`requestId`, PID worker, lần xử lý và thời điểm hoàn thành; không ghi bảng
nghiệp vụ, gửi email hoặc gọi dịch vụ ngoài. CLI này tiếp tục hoạt động độc lập
với API job bền vững bên dưới.

## Job bền vững và API polling (RES-27)

PostgreSQL là nguồn trạng thái: `background_jobs` giữ owner, loại job,
idempotency key, payload, kết quả và số lần thực thi; `outbox` giữ các lần phát
`WORK`/`DLQ`. Schema nguồn nằm trong DBML + PostgreSQL supplement, được sinh
thành `ResearchOS.sql`; hai migration additive bổ sung các bảng và queue scope.
Chạy `pnpm db:migrate:deploy` trước khi khởi động code mới.

Các endpoint đều dùng session cookie và envelope tiêu chuẩn:

| Endpoint | Quyền | Kết quả |
| --- | --- | --- |
| `POST /jobs/probes` | ADMIN | `202`, `{ id, status, attempts, statusUrl }` |
| `GET /jobs/:id` | Chủ job | `200`, trạng thái lưu trong PostgreSQL |
| `POST /jobs/:id/retry` | ADMIN và chủ job | `202`, tạo generation mới cho job FAILED |

Body submit: `{ "idempotencyKey": "<UUID-v4>", "failuresBeforeSuccess": 0 }`.
Owner lấy từ session, không nhận trong body. Cùng owner/type/key và input trả
lại cùng job; input khác trả `409`. Người khác đọc/retry trả `404`, kể cả admin.
Chưa đăng nhập trả `401`; probe/retry thiếu ADMIN trả `403`.

`status` là `PENDING` (gồm đang chờ, đang xử lý, đang retry), `COMPLETED` hoặc
`FAILED`. `attempts` là số lần thực thi trong generation hiện tại. Poll theo
`statusUrl`, ví dụ mỗi giây, dừng ở trạng thái cuối; endpoint không trả payload,
stack trace hay thông tin process. Chưa có màn hình polling; client Orval đã có
contract để các feature dùng lại.

Worker chạy dispatcher mỗi 500ms, lấy tối đa 10 outbox bằng `FOR UPDATE SKIP
LOCKED`. Dispatcher chờ Redis tối đa 5 giây trước khi giữ khóa SQL, dùng
connection producer fail nhanh. Nếu publish lỗi thì rollback và thử lại. Crash
sau `Queue.add` nhưng trước commit sẽ phát lại cùng transport ID
`<logical-job-id>-<generation>`. API/worker phải dùng cùng `QUEUE_PREFIX`; scope
này cũng được lưu trong database để worker khác prefix không lấy nhầm job.

Queue `background-jobs` thực thi job có tối đa 3 attempts, backoff exponential.
Handler khóa bản ghi job và commit kết quả cùng thay đổi nghiệp vụ trong một
transaction. Redelivery sau khi Redis đã dọn job cũng không lặp side effect DB.
Sau 30 giây, dispatcher kiểm tra lại các job PENDING đã phát: Redis mất job thì
phát lại; BullMQ đã đánh failed ngoài handler (ví dụ stalled quá giới hạn) thì
ghi FAILED và tạo outbox DLQ. `dead-letter-jobs` giữ tham chiếu job/generation,
không có consumer tự retry vô hạn. FAILED + payload vẫn nằm trong PostgreSQL
để có thể kiểm tra và retry ngay cả khi Redis mất dữ liệu.

Retry thủ công chỉ áp dụng FAILED, khóa bản ghi, tăng generation, reset attempts
và tạo outbox mới trong cùng transaction; giữ logical id và idempotency key.
Hai lệnh retry đồng thời chỉ một lệnh thắng. DLQ cũ giữ lại làm lịch sử.
Probe generation 0 cho phép mô phỏng 0–3 lỗi; generation sau thành công để thử
luồng recovery. Đây là hành vi riêng của diagnostic, không phải policy retry
của các job nghiệp vụ.

Feature ghi DB rồi phát job phải gọi helper dùng chung
`BackgroundJobsService.submitInTransaction(tx, ownerId, kind, key, payload)`
trong chính transaction ghi nghiệp vụ. Helper không enqueue Redis. Worker chỉ
thấy outbox sau commit; rollback xóa cả thay đổi nghiệp vụ lẫn job/outbox.
`submit(...)` là dạng tiện dụng khi chỉ cần tạo job. Feature dùng chung
`background-jobs` đăng ký cặp `[kind, handler]` trong `backgroundJobHandlers`
của worker trước khi submit. Handler tự kiểm tra payload và xử lý job của mình.
Tác vụ gọi dịch vụ ngoài phải truyền business idempotency key cho nhà cung cấp;
transaction SQL không đảm bảo exactly-once cho email hay HTTP side effect.

Outbox/job/DLQ được giữ để phục vụ idempotency và điều tra; chưa có chính sách
prune tự động. Khi bổ sung retention cần quyết định rõ thời hạn idempotency,
không chỉ xóa theo retention của BullMQ.

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
nghiệp vụ cho probe cũ. Bộ durable-job tạo user/session/job fixture riêng, dọn
chúng sau test và chỉ dùng queue prefix UUID của lần chạy. Test bao gồm:

1. API tạo job → Redis → worker xử lý → lưu kết quả và progress 100%.
2. Job lỗi tạm thời được retry rồi thành công.
3. Cùng job ID còn được lưu chỉ tạo một job.
4. Dừng sau ba lần thất bại, giữ job trong trạng thái failed.
5. Payload không hợp lệ bị đánh failed ngay, không retry.
6. API fail khởi động có thời hạn khi Redis không truy cập được.
7. HTTP 202/envelope, 401/403/404, validation và owner isolation bằng session thật.
8. Rollback nghiệp vụ + job + outbox; request idempotent đồng thời.
9. Redis lỗi lúc publication, dispatcher đồng thời, phát lại sau rollback.
10. Worker khởi động lại, Redis mất job, terminal transport failure, DLQ và retry generation mới.
11. Redelivery sau khi Redis dọn job không thay đổi kết quả đã commit.

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

Khi thêm job nghiệp vụ thật, dùng helper outbox và processor riêng, kiểm tra
quyền và idempotency theo nghiệp vụ như phần trên.

Nguồn: [NestJS queues](https://docs.nestjs.com/techniques/queues),
[BullMQ connections](https://docs.bullmq.io/guide/connections).
