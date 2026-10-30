# Quy trình Jira

Ngày ghi nhận: 30/10/2026.

Tài liệu này là chuẩn cho cách team ResearchOS làm việc với Jira. Mục tiêu:
code nằm trong git, task nằm trong Jira, và hai thứ đó **luôn** trỏ về nhau.

Liên quan: [database.md](./database.md), [api-convention.md](./api-convention.md),
[scaffolding.md](./scaffolding.md).

---

## 1. Nguyên tắc

**Mỗi commit làm việc đều phải ghi rõ ticket nó làm việc cho.**

Cụ thể, commit subject phải chứa key của ticket:

```text
feat(db): RES-17 thêm bảng users
fix(api): RES-31 trả 409 khi trùng email
chore(deps): RES-17 nâng prisma lên 7.10.1
```

Đây là quy tắc duy nhất. Mọi thứ khác trong tài liệu này đều là cách thực
hiện quy tắc đó.

### Vì sao phải vậy

Commit là nơi **việc thực sự** được ghi lại. Ticket là nơi **ý định** được ghi
lại. Khi chúng tách rời nhau, ticket trở thành một danh sách việc chết, và sau
ba tháng không ai biết vì sao một dòng code tồn tại.

Ngược lại, khi commit mang key của ticket, thì:

- `git log --grep RES-17` cho ra toàn bộ lịch sử thay đổi của ticket đó.
- Đóng ticket, không sợ sót việc.
- Người khác đọc code thấy ngay vấn đề này giải quyết cái gì.

---

## 2. Quy ước commit

Repo dùng **Conventional Commits**, và key ticket nằm ở cuối subject, trong
ngoặc nếu cần:

```text
<type>(<scope>): <mô tả> RES-<number>
```

| Type | Dùng khi |
| --- | --- |
| `feat` | Thêm tính năng mà người dùng thấy được |
| `fix` | Sửa lỗi |
| `refactor` | Đổi cấu trúc, không đổi hành vi |
| `perf` | Tối ưu hiệu năng |
| `docs` | Tài liệu |
| `test` | Test |
| `chore` | Việc không ảnh hưởng mã nguồn |
| `ci` | Pipeline |
| `build` | Dependency, build config |

Scope là phần của workspace: `api`, `web`, `worker`, `db`, `config`, `docs`.

Ví dụ thực tế từ lịch sử repo:

```text
feat(db): derive the Prisma datamodel from ResearchOS.sql
fix(api): map database constraint violations to 4xx instead of 500
ci: fail the build when the datamodel drifts from ResearchOS.sql
```

### Key nằm ở đâu

`scripts/jira-commit-report.mjs` tìm key theo thứ tự:

1. **Commit subject** — cách chuẩn, nên luôn dùng cách này.
2. **Commit body** — khi một commit thực sự làm việc cho nhiều ticket.
3. **Tên branch** — fallback cho khi quên ghi vào subject.

Nếu một chỗ chứa **nhiều hơn một key**, commit đó bị báo là *mơ hồ* và bị bỏ
qua, chứ không được đoán. Xem §5.

### Branch

```text
feat/RES-17-thiet-ke-database
fix/RES-31-trung-email
```

Nhánh bắt đầu bằng key ticket. Nhánh tên không có key thì công cụ không
biết đánh file công việc vào ticket nào.

---

## 3. Sinh báo cáo commit

Công cụ đọc git và in ra phần nội dung comment. Nó **không** gọi Jira, không
cần credential, và cho ra kết quả giống nhau mọi lần.

```powershell
# Commits chưa có trên main
node scripts/jira-commit-report.mjs --range origin/main..HEAD

# Một range bất kỳ
node scripts/jira-commit-report.mjs --range main..HEAD~3

# Dạng JSON, để agent đọc và post
node scripts/jira-commit-report.mjs --range origin/main..HEAD --json
```

Đổi project key:

```powershell
$env:JIRA_PROJECT_KEY = "RES"
```

Mặc định đã là `RES`.

### Kết quả

Script in ra hai phần:

- **Comment cho mỗi ticket** — sẵn sàng để copy vào Jira.
- **Danh sách bị bỏ qua** — commit không mang key, hoặc mang nhiều key.

Danh sách bị bỏ qua **không phải** là danh sách rác. Nó là danh sách việc
chưa được ai ghi vào đúng chỗ.

### Vì sao không tự đăng comment

Script cố tình **không** gọi Jira. Ba lý do:

1. **Review được.** Nội dung comment nằm trong output, ai cũng đọc được
   trước khi nó xuất hiện trên Jira.
2. **Không cần credential.** Script chạy được trên máy không có quyền truy
   cập Jira, kể cả trong CI.
3. **Không tự ý ghi vào ticket người khác.** Comment trên Jira là thứ ai đó
   sẽ đọc và phản hồi. Agent tự ý ghi vào đó là hành xử không được hỏi.

Muốn đăng tự động thì dùng Atlassian MCP server (`user-atlassian`) — xem
[researchos-jira skill](../.cursor/skills/researchos-jira/SKILL.md).

---

## 4. Workflow của ticket

Trạng thái trong project `RES`, cho issue type `Task`:

| Trạng thái | Nhóm | Ý nghĩa |
| --- | --- | --- |
| `To Do` | new | Chưa bắt đầu |
| `In Development` | indeterminate | Đang làm |
| `In Review` | indeterminate | Đang chờ review |
| `To Test` | indeterminate | Đã review, chờ test |
| `Done` | done | Xong |
| `Closed` | new | Huỷ hoặc lưu trữ |

Luồng bình thường:

```text
To Do → In Development → In Review → To Test → Done
```

### Khi nào chuyển trạng thái

| Tình huống | Chuyển sang |
| --- | --- |
| Bắt đầu làm | `In Development` |
| Mở pull request | `In Review` |
| PR được merge, chờ test | `To Test` |
| Test xong, nghiệm thu | `Done` |
| Không làm nữa | `Closed` |

**Chuyển trạng thái khi PR merge, không phải trước.** `To Test` là trạng thái
chờ test — đặt nó sớm thì tester không biết cái gì cần test.

### Tên transition không phải tên trạng thái

Một transition tới `Done` có thể tên là `Review->Done`. Vì vậy, đừng đoán
tên transition. Đọc ra trước:

```text
listJiraIssueTransitions   → lấy danh sách transition hợp lệ của issue
transitionJiraIssue        → truyền transitionId
```

Tool trả về trạng thái mà issue thực sự rơi vào, nên không cần đọc lại.

---

## 5. Một commit, nhiều ticket

Đôi khi một commit thực sự làm việc cho hai ticket:

```text
feat(api): RES-17 và RES-31 thêm endpoint users
```

Công cụ **không** đoán. Commit bị đưa vào danh sách bỏ qua với lý do
`mentions RES-17, RES-31`.

Đây là cố ý. Chọn bừa một ticket thì công việc của ticket kia **biến mất**
khỏi báo cáo, và đó là loại mất dữ liệu khó phát hiện nhất.

Cách xử lý:

1. **Tách commit** — mỗi ticket một commit. Đây là cách tốt nhất.
2. **Ghi key của ticket chính vào subject**, ticket còn lại nói ở body. Báo cáo
   sẽ file công việc vào ticket trong subject, và **ticket trong body sẽ không
   xuất hiện** — phần việc đó phải được báo cáo bằng tay. Chỉ dùng cách này
   khi thực sự là một việc.
3. **Tách ra thành hai ticket riêng**, mỗi ticket một commit.

---

## 6. Squash merge

Khi merge bằng `--squash`, git ghi một commit duy nhất, body chứa toàn bộ
các commit gốc. Công cụ **mở rộng** commit đó, nên mỗi commit gốc được báo
cáo riêng và vẫn gắn với đúng ticket.

Điều này quan trọng vì squash merge là cách phổ biến nhất để merge, và nếu
không mở rộng thì toàn bộ công việc của branch sẽ bị gộp về một commit
không rõ ticket.

> Lưu ý: khi squash, hãy viết key ticket vào **subject của từng commit gốc**,
> không chỉ vào subject của commit tổng hợp. Commit gốc mới là thứ được
> mở rộng và dùng để tìm key.

---

## 7. Người mới bắt đầu

```powershell
# 1. Lấy ticket
#    Mở RES trong Jira, tìm ticket cần làm.

# 2. Tạo branch có key ticket
git switch -c feat/RES-17-thiet-ke-database

# 3. Làm việc, commit với key
git add -A
git commit -m "feat(db): RES-17 them bang users"

# 4. Xem báo cáo trước khi đăng
node scripts/jira-commit-report.mjs --range origin/main..HEAD

# 5. Đăng lên Jira (bằng tay hoặc qua MCP server)
#    RES-17 → comment với nội dung báo cáo

# 6. Mở PR, merge
#    Sau khi merge, chuyển RES-17 sang To Test.
```

---

## 8. Khi mọi thứ lệch

| Tình huống | Cách xử lý |
| --- | --- |
| Đã merge nhưng chưa chuyển trạng thái | Chuyển trạng thái, không cần commit |
| Quên ghi key trong commit | `git commit --amend` nếu chưa push; nếu đã push thì báo cáo thủ công bằng `git log` |
| Commit gộp nhiều ticket | Tách lại bằng `git rebase -i`, hoặc báo cáo thủ công |
| Báo cáo rỗng nhưng đã có code | Commit chưa mang key — sửa subject |
| Nhánh không có key trong tên | Đặt lại tên nhánh, hoặc ghi key vào subject |

Sửa lịch sử đã push thì cần `git push --force-with-lease`. Chỉ làm khi nhánh
chưa có người nào khác pull, và nói với team trước.

---

## 9. Liên hệ

| Việc | Ở đâu |
| --- | --- |
| Sinh báo cáo commit | `scripts/jira-commit-report.mjs` |
| Hướng dẫn cho agent | [researchos-jira skill](../.cursor/skills/researchos-jira/SKILL.md) |
| MCP server | `user-atlassian`, từ `https://mcp.atlassian.com/v2/mcp` |
