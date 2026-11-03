# GitHub tối giản

## Main và merge

Giữ ruleset hiện có: chặn xóa/force-push `main`, thay đổi qua PR, một approval,
bỏ approval cũ khi có commit mới và giải quyết các thảo luận trước khi merge.
Admin vẫn có thể bypass rule PR như cấu hình ban đầu.

Dùng squash merge và tự xóa branch sau merge. Không cần thêm nhánh staging
hoặc GitHub Environments ở giai đoạn này.

`dev` là nhánh mọi thay đổi được merge vào, và cần cùng bộ quy tắc với `main`:
chặn xóa/force-push, thay đổi qua PR, một approval, linear history và bắt
buộc check `checks` pass. Xem "Ruleset cho `dev`" bên dưới.

## Actions

Hai workflow, tách theo phụ thuộc:

| Workflow | Job | Chạy trên | Cần database |
| --- | --- | --- | --- |
| `ci.yml` | `checks` | PR, push vào `main`/`dev` | Không |
| `schema-drift.yml` | `db-drift` | PR, push vào `dev`/`main` | Có (Postgres) |

Job `checks` chạy: install theo lockfile, **codegen**, kiểm tra artifact
generated không bị stale, lint, test và build. Không cần database, Redis
hoặc secrets vì bộ unit test hiện tại dùng stub.

Job `db-drift` cần Postgres service nên để riêng một workflow. Một job trong
`ci.yml` không có `on:` riêng — nó thừa hưởng trigger của workflow, nên
tách ra mới nói rõ được check này chạy khi nào.

Workflow dùng Node.js 24, pnpm 12.15.0 và cache pnpm. Các action được pin
bằng commit SHA; quyền token mặc định là read, không được duyệt PR.
Chỉ cho phép action của GitHub và `pnpm/action-setup`.

Cả hai workflow dùng concurrency group theo ref và `cancel-in-progress`, nên
push thêm lần nữa vào cùng branch không xếp hàng thêm một lần chạy.

### Codegen và drift của client

Cả hai artifact generated đều được commit vào repo:

* `apps/api/openapi.json` — spec OpenAPI
* `apps/web/src/lib/api/` — client Orval, frontend import từ đây

Vì vậy CI **regenerate trước khi build**, rồi fail nếu có khác biệt:

```yaml
- run: pnpm codegen
- run: git diff --exit-code apps/api/openapi.json apps/web/src/lib/api
```

Chỉ kiểm tra spec là chưa đủ: client Orval mới là thứ frontend dùng, và nó có
thể stale trong khi spec vẫn đúng. Một ticket sửa DTO mà quên chạy
`pnpm codegen` sẽ fail ở đây thay vì ship client cũ.

`.gitattributes` chuẩn hoá working tree về LF, nên `git diff --exit-code` so
được byte-for-byte giống nhau trên Linux CI và trên Windows.

### Ruleset cho `dev`

Cần admin của repo. Tạo ba ruleset giống `main`, nhưng nhắm `dev`:

| Ruleset | Ruleset type | Rule |
| --- | --- | --- |
| `dev-1` | branch | Chặn xoá, chặn force-push, linear history |
| `dev-2` | branch | Thay đổi qua PR, 1 approval, dismiss stale reviews, resolve discussions |
| `dev-ci` | branch | Required status check `checks` |

Lệnh tạo:

```bash
gh api --method POST repos/garankhi/researchos/rulesets \
  -f name='dev-1' -f target='branch' -f enforcement='active' \
  -F conditions='{"ref_name":{"include":["refs/heads/dev"],"exclude":[]}}' \
  -f rules='[{"type":"deletion"},{"type":"non_fast_forward"},{"type":"linear_history"}]'

gh api --method POST repos/garankhi/researchos/rulesets \
  -f name='dev-2' -f target='branch' -f enforcement='active' \
  -F conditions='{"ref_name":{"include":["refs/heads/dev"],"exclude":[]}}' \
  -f rules='[{"type":"pull_request","parameters":{"required_approving_review_count":1,"dismiss_stale_reviews_on_push":true,"required_review_thread_resolution":true,"require_code_owner_review":false,"require_last_push_approval":false,"require_extra_approval_for_unattributed_changes":true,"allowed_merge_methods":["merge","squash","rebase"]}}]'

gh api --method POST repos/garankhi/researchos/rulesets \
  -f name='dev-ci' -f target='branch' -f enforcement='active' \
  -F conditions='{"ref_name":{"include":["refs/heads/dev"],"exclude":[]}}' \
  -f rules='[{"type":"required_status_checks","parameters":{"required_status_checks":[{"context":"checks"}],"strict_required_status_checks_policy":true,"do_not_enforce_on_create":false}}]'
```

Chỉ bật required status check sau khi đã có ít nhất một lần chạy thành công
trên GitHub, để tránh chặn merge bằng một check chưa tồn tại.

### Pull request template

`.github/pull_request_template.md` có sẵn: ticket key, flow label, base
branch và verify command. Base branch là `dev`, không phải `main`.

Label `flow:*` (`feat`, `fix`, `ci`, `refactor`, `docs`, `chore`) đi theo
tiền tố commit để máy đọc được loại thay đổi.

## Commit report cho Jira

`scripts/jira-commit-report.mjs` đọc lịch sử git và in sẵn nội dung comment
để post lên Jira. Script không tự gọi Jira — nó chỉ sinh text, việc network
làm ở chỗ khác, nên wording nằm trong diff và script không cần credential.

Mặc định range là `origin/dev..HEAD`: mọi commit branch này thêm trên `dev`.
Nếu để `origin/main..HEAD` thì mọi commit từ release gần nhất sẽ bị quy
về ticket đang hỏi — việc của người khác, ghi nhầm ticket.

```bash
pnpm jira:commit-report                 # dùng range mặc định
pnpm jira:commit-report -- --range origin/dev..HEAD --json
```

## Secrets

Bật secret scanning và push protection. `.env` và các file `.env.*` thật
được Git bỏ qua; chỉ commit `.env.example` với giá trị mẫu cho local.

Chưa cần GHCR, CD, Dependabot hoặc bộ kiểm tra OpenAPI riêng. Khi bắt đầu
deploy, bổ sung cấu hình production, secrets trên server và backup database.
