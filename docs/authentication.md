# Session, đổi mật khẩu bắt buộc và công việc frontend còn lại

## Backend hiện có

Session cookie được resolve mỗi request. `AuthPrincipal.mustChangePassword`
được đọc live từ `local_credentials`, không lưu snapshot trong session. Cờ này
chỉ áp dụng cho session LOCAL; quyền ADMIN/RESEARCHER của tài khoản không đổi.

`SessionGuard` chặn mọi route protected với `403` và message
`must_change_password` khi cờ bật, kể cả ADMIN. Chỉ các handler gắn
`@AllowPasswordChangePending()` được phép tiếp tục: `GET /me`,
`POST /auth/logout`, `POST /auth/change-password`. Decorator chỉ dành cho từng
method, không bỏ qua xác thực session hoặc role guard. Login/health/demo vẫn
theo chính sách public hiện có.

### POST /auth/change-password

- Cookie session LOCAL còn hiệu lực; không nhận userId/sessionId từ body.
- Body gồm `currentPassword` và `newPassword`. Mật khẩu hiện tại dài 1–1024 ký
  tự; mật khẩu mới dài 12–1024 ký tự và khác mật khẩu hiện tại. Không trim hoặc
  áp quy tắc bắt buộc trộn loại ký tự.
- Giới hạn 5 request/phút cho mỗi client theo throttler hiện tại.
- Service khóa theo thứ tự `users → local_credentials → user_sessions`, kiểm
  tra lại trạng thái tài khoản và hiệu lực session trong transaction, xác minh
  mật khẩu hiện tại rồi hash mật khẩu mới bằng cùng thư viện Argon2id đang dùng
  cho credential development. Session OIDC không đổi mật khẩu LOCAL qua route này.
- Ghi hash mới và `must_change_password=false` cùng transaction. Trigger DB có
  sẵn cập nhật mốc đổi mật khẩu và revoke tất cả session cũ, kể cả session gọi
  endpoint. Không cần migration mới cho thay đổi này.
- Thành công: `200`, envelope với `data: { changed: true }`, xóa session cookie.
  Client phải đăng nhập lại; không tự cấp session mới.
- Sai mật khẩu hiện tại: `401 / invalid_credentials`; session hết hạn/revoked:
  `401`; OIDC: `403`; mật khẩu mới giống cũ: `400 / password_unchanged`;
  input không hợp lệ: `400 / validation_failed` và lỗi theo field.

Backend không có endpoint reset/quên mật khẩu trong thay đổi này.

## Frontend đổi mật khẩu — CHƯA triển khai

Phần này là handoff để làm giao diện sau; hiện form login vẫn chỉ báo cảnh báo.

1. Khi login hoặc `GET /me` trả `mustChangePassword=true`, chuyển tới màn hình
   đổi mật khẩu và giữ `returnTo` đã sanitize. Không mở chức năng nghiệp vụ chỉ
   dựa vào role trong payload.
2. Xử lý `403 / must_change_password` từ mọi API protected bằng cùng luồng này;
   vẫn cho logout. Không coi mã này là session hết hạn.
3. Form dùng client Orval được sinh sẵn cho endpoint trên, nhập mật khẩu hiện
   tại/mới, xác nhận lại mật khẩu mới ở client; dùng đúng giới hạn 12–1024 ký tự.
   Không ghi mật khẩu vào log, store hoặc cache.
4. Sau thành công, hủy request protected còn chạy, xóa session store và cache
   dữ liệu người dùng, điều hướng tới login. Chỉ phục hồi returnTo sau lần đăng
   nhập mới thành công. Không thử lại với cookie cũ.
5. Localize validation/domain codes đã có trong catalog. Kiểm thử reload ở
   màn hình đổi mật khẩu, nhập sai, logout, session hết hạn và điều hướng an toàn.

## Cache session đã sửa

`useMe` chỉ ghi user vào Zustand khi query thành công. Khi `/me` trả 401, hook
ẩn cached data và clear store. TanStack Query có thể vẫn giữ payload cũ sau lỗi,
nhưng payload đó không được dùng để khôi phục tài khoản sau chuỗi 401 → 500.
Lỗi mạng/500 đơn thuần giữ nguyên tài khoản đã biết trong store; chúng không
chứng minh session đã bị thu hồi. Effect dùng payload gốc làm dependency, không
dùng object mapping được tạo lại mỗi render.
