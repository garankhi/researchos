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

## Trạng thái đang tải

| Đang tải gì | Dùng |
| --- | --- |
| Một khối nội dung sẽ được thay bằng data (list, card, panel) | **Skeleton** — giữ chỗ, không nhảy layout |
| Một mutation đang chạy (submit, save, delete) | **Spinner trong nút** — layout không đổi |

Skeleton cho phần nội dung: `LoadingSkeleton`, `ListItemSkeleton` trong
`src/components/ui/feedback.tsx`.

Mutation không đổi layout nên chỉ báo ở chỗ bấm:

```tsx
<Button variant="contained" loading={mutation.isPending}>
  Lưu
</Button>
```

`loading` của MUI v9 tự hiện `CircularProgress` và disable nút, nên không
thể bấm hai lần. Luôn bind cờ `isPending` của **mutation**, không phải của
query — `isPending` của query `enabled: false` đúng mãi, sẽ khiến nút kẹt
vĩnh viễn.

## Phản hồi cho mutation

**Mọi mutation đều phải có phản hồi.** Người dùng bấm nút mà không thấy
gì không biết click đã ăn hay chưa. Cả hai kết quả đều phải có phản hồi.

| Kết quả | Hiển thị ở đâu | Tự tắt? |
| --- | --- | --- |
| Thành công | **Snackbar** | Có (~4s) |
| Lỗi | **Inline, ngay cạnh thứ gây lỗi** | Không |
| Lỗi validation | Dưới từng input sai | Không |
| Lỗi không có chỗ để hiện | Snackbar với `autoHideDuration: null` | Không |

Bất đối xứng này là điểm mấu chốt: **thành công là thông báo, thất bại là
trạng thái**. Form lỗi validation hiện lỗi dưới các input và giữ người
dùng ở lại trang. Form thành công thì báo một cái rồi đi tiếp.

Snackbar là kênh *thông báo*, không phải kênh *trạng thái*:

- Nó tự ẩn. Lỗi người dùng không kịp đọc trong 4 giây là lỗi họ sẽ lặp
  lại.
- Nó tách rời khỏi nguyên nhân. Lỗi nằm dưới input chỉ vào input; toast ở
  góc màn hình không chỉ vào gì cả.
- Nó không hiển thị tốt các message validation theo từng field.

Ngoại lệ: lỗi không có chỗ để hiện inline (sync nền, thao tác hàng loạt,
logout thất bại) thì dùng snackbar `autoHideDuration: null` kèm nút thử lại.

Đặt phản hồi trong `onSuccess` / `onError` của mutation hook, không đặt
trong click handler, để nó luôn chạy dù mutation được gọi từ đâu:

```tsx
const mutation = useCreateProfile({
  onSuccess: () => showSnackbar({ severity: 'success', message: 'Đã tạo hồ sơ.' }),
  onError: (error) => setFieldErrors(apiFieldErrors(error)),
});
```

Message lỗi lấy từ `apiErrorMessage(error)`, không dùng `String(error)`.
Không dựng message thành công từ `useEffect` theo `mutation.isSuccess` — nó
chạy hai lần dưới React Strict Mode.
