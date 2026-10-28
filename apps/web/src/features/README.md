# `src/features/` — feature code by business domain

Mỗi thư mục con là một nghiệp vụ, đặt tên theo đúng module tương ứng ở
`apps/api/src/modules/<tên-nghiệp-vụ>/`. Cấu trúc này song song với backend
để tra cứu nghiệp vụ được nhanh: thấy `features/taxonomy/` là biết nghiệp vụ
đó nằm ở `apps/api/src/modules/taxonomy/`.

## Cấu trúc một feature

~~~text
src/features/<domain>/
  index.ts        Barrel — điểm import duy nhất từ bên ngoài feature
  types.ts        Kiểu dữ liệu mà UI thực sự dùng
  hooks/          Hook gọi API và chuẩn hoá trạng thái
  components/     Component riêng của nghiệp vụ
~~~

Chưa có nghiệp vụ nào thì không tạo thư mục con. `health/` là ví dụ đầu
tiên.

## Quy tắc

- **Import qua barrel.** Dùng `@/features/health`, không import thẳng
  `@/features/health/hooks/use-api-health`. Nội bộ feature có thể đổi mà
  không ảnh hưởng nơi gọi.
- **Feature không import chéo lẫn nhau.** Feature cần dữ liệu của feature
  khác thì gọi API của feature đó qua hook của nó, không import trực tiếp
  file trong feature kia.
- **`components/ui/` không biết gì về nghiệp vụ.** File trong đó không được
  nhắc tới `Profile`, `Opportunity`, `Taxonomy`… — cùng nguyên tắc với
  `src/common/` của backend.
- **`src/lib/api/` là của Orval, không sửa tay.** Xem `.prettierignore` và
  quy tắc `no-restricted-imports` trong `eslint.config.mjs`. Code viết tay
  của feature đặt ở `hooks/` hoặc `components/`, không đặt trong
  `src/lib/api/`. Ngoại lệ duy nhất là **import kiểu** (`import type`):
  type bị xoá lúc build nên không kéo file đã bị xoá vào bundle, và giữ
  cho frontend nhìn thấy contract của API đúng với spec thay vì copy
  shape thủ công. Import *giá trị* từ `@/lib/api/*` vẫn bị chặn.

## Tách lớp

| Tầng | Nguồn | Chịu trách nhiệm |
| --- | --- | --- |
| Transport | Orval trong `src/lib/api/` | Request, cache key, query lifecycle |
| Domain | `src/features/<domain>/hooks/` | Ánh xạ DTO sang kiểu domain, chuẩn hoá trạng thái |
| UI | `src/features/<domain>/components/`, `src/components/ui/` | Hiển thị |

Lớp domain tồn tại để UI không phải phân biệt `isPending` (chưa có data —
với query `enabled: false` nó đúng mãi) với `isFetching` (đang có request).
Hook trả về trạng thái tường minh để màn hình chỉ cần render theo trạng
thái đó.
