# Viewport, infinite scroll và virtualization cho ResearchOS

Ngày đối chiếu: 26/10/2026. Đây là khuyến nghị lựa chọn thư viện cho frontend Next.js, chưa phải tính năng đã triển khai hoặc dependency đã được cài.

Frontend hiện khai báo Next.js 16.4.3, React/React DOM 19.3.0. Metadata các bản phát hành npm được kiểm tra theo tên package đầy đủ, tách biệt với manifest trên default branch của repository.

## Ba nhu cầu khác nhau

| Khái niệm | Công việc | Ví dụ trong ResearchOS |
| --- | --- | --- |
| Theo dõi viewport | Phát hiện một phần tử đi vào/ra vùng nhìn thấy hoặc vùng cuộn được chỉ định | Phần đánh dấu cuối feed xuất hiện thì đề nghị tải thêm |
| Infinite scroll | Tải tiếp dữ liệu khi người dùng cuộn; quản lý trang/cursor và trạng thái tải | Feed bài đăng hoặc hoạt động nghiên cứu |
| Virtualization | Chỉ render các hàng gần vùng nhìn thấy, kèm vùng đệm, để giới hạn số phần tử DOM | Danh sách lớn ở console vận hành hoặc bảng publication |

Viewport là vùng nội dung đang nhìn thấy. IntersectionObserver theo dõi giao nhau giữa phần tử và viewport/scroll container; việc giao nhau về hình học không mặc định chứng minh người dùng thực sự đọc nội dung.

Infinite scroll và virtualization có thể kết hợp. Infinite scroll giải quyết việc lấy thêm dữ liệu; virtualization giải quyết số lượng phần tử render. Chỉ thêm observer không tự làm một danh sách hàng nghìn phần tử thành danh sách ảo.

## Phân biệt các package có tên gần giống

| Package npm | Bản latest khi kiểm tra | Phạm vi và tương thích khai báo |
| --- | --- | --- |
| react-intersection-observer | 11.0.1 | Thư viện của thebuilder, bọc IntersectionObserver thành hook/component cho React; peer dependencies hỗ trợ React/React DOM 17, 18 và 19 |
| @researchgate/react-intersection-observer | 1.3.5 | Thư viện khác của ResearchGate; bản npm được kiểm tra chỉ khai báo peer dependencies React/React DOM ^16.3.2 |
| @researchgate/react-intersection-list | 3.0.12 | Component infinite scroll của ResearchGate; peer dependencies React/React DOM ^16.3.2 |
| react-intersection-list | 0.0.3 | Package khác không có scope, mô tả “Render on intersection”; bản latest phát hành năm 2018, khai báo React ^16.0.0 trong dependencies |

Các tên có và không có scope không thể dùng thay thế cho nhau. Đặc biệt, react-intersection-observer không phải @researchgate/react-intersection-observer.

Khuyến nghị cho ResearchOS là react-intersection-observer của thebuilder khi cần tích hợp viewport detection trong React. Chưa chọn ba package còn lại cho frontend React 19 hiện tại, và không ép bỏ qua peer dependency để cài chúng. Khai báo tương thích không thay thế kiểm tra thực tế, nhưng không thể suy ra hỗ trợ React 19 từ ngày cập nhật repository.

Manifest trên nhánh source có thể khác metadata của bản npm đã phát hành. Khi cài, cần kiểm tra bản phát hành cụ thể thay vì chỉ dựa vào README hoặc manifest nhánh mặc định.

Nguồn package: [thebuilder](https://github.com/thebuilder/react-intersection-observer), [ResearchGate observer](https://github.com/researchgate/react-intersection-observer), [ResearchGate list](https://github.com/researchgate/react-intersection-list). Metadata phát hành: [observer không scope](https://registry.npmjs.org/react-intersection-observer), [observer ResearchGate](https://registry.npmjs.org/%40researchgate%2Freact-intersection-observer), [list ResearchGate](https://registry.npmjs.org/%40researchgate%2Freact-intersection-list), [list không scope](https://registry.npmjs.org/react-intersection-list).

## Chọn công cụ theo nhu cầu

| Nhu cầu | Khuyến nghị | Khi nào sử dụng |
| --- | --- | --- |
| Theo dõi một vài phần tử, ít dependency | IntersectionObserver có sẵn trong trình duyệt | Logic đơn giản, nhóm sẵn sàng quản lý lifecycle/ref/cleanup |
| Theo dõi viewport thuận tiện trong React | react-intersection-observer | Cần hook như useInView, callback hoặc component tích hợp vào UI |
| Feed tải tiếp và quản lý trạng thái dữ liệu | Observer kết hợp TanStack Query useInfiniteQuery | Observer xác định thời điểm tải; Query quản lý pages, cursor, loading, error và cache |
| Danh sách lớn với UI tự thiết kế | TanStack Virtual | Cần headless virtualizer, tự kiểm soát markup và style |
| Danh sách cần component dựng sẵn | React Virtuoso | Cần component danh sách, item có chiều cao thay đổi, có thể tận dụng khả năng tải thêm |
| Animation khi xuất hiện, project đã dùng Motion | Motion useInView hoặc whileInView | Tận dụng thư viện animation đã có thay vì thêm observer wrapper riêng |

Các thư viện này bổ sung vào Next.js hiện tại; không yêu cầu đổi framework. Không có một thư viện tốt nhất cho tất cả các nhu cầu trong bảng. Cũng không cần cài tất cả ngay từ scaffold.

TanStack Virtual và React Virtuoso là phương án virtualization, không phải bản thay thế trực tiếp cho mọi thao tác viewport detection. TanStack Query xử lý dữ liệu tải theo trang; bản thân useInfiniteQuery không phải observer theo dõi viewport.

## Áp dụng theo màn hình ResearchOS

| Màn hình | Phương án ban đầu | Khi nào mở rộng |
| --- | --- | --- |
| Search researcher/publication, opportunities và bảng quản trị thông thường | Phân trang rõ ràng; giữ query/filter/page trong URL khi phù hợp | Bổ sung virtualization khi đã đo thấy render/DOM quá lớn |
| Feed cộng đồng khi phase này được triển khai | Cursor pagination + react-intersection-observer + useInfiniteQuery nếu dùng TanStack Query cho dữ liệu client | Thêm virtualization khi số item tích lũy ảnh hưởng hiệu năng |
| Console vận hành, reconciliation hoặc bảng dữ liệu dài | Phân trang phía server trước | Đánh giá TanStack Virtual nếu cần cuộn qua nhiều hàng trong một màn hình |
| Card/section có animation | Dùng observer hiện có, hoặc Motion nếu dự án đã chọn Motion | Chỉ thêm animation phục vụ trải nghiệm cụ thể |

Quy mô dataset trong database không tự động quyết định số hàng cần render trên frontend. Một triệu publication vẫn có thể được hiển thị bằng các trang kết quả nhỏ. Virtualization cũng không thay thế pagination và filtering phía backend.

## Nguyên tắc khi triển khai

- Trong Next.js App Router, phần dùng hook/ref và API trình duyệt nằm trong Client Component. Giữ ranh giới client nhỏ, không chuyển toàn bộ trang sang client chỉ vì có một sentinel quan sát.
- Khi tải tiếp, kiểm tra còn trang và không có request tải dữ liệu đang chạy; xử lý lỗi và retry, tránh callback observer phát nhiều request trùng.
- API có cursor/sort ổn định theo contract, tiếp tục áp dụng authorization và visibility; observer không quyết định quyền xem dữ liệu.
- Feed có nút tải thêm hoặc phương án điều khiển tương đương bằng bàn phím, trạng thái loading/error/end rõ ràng; việc thêm item không tự chuyển focus hoặc làm mất vị trí đọc.
- Kiểm tra điều hướng quay lại, khôi phục vị trí cuộn và hành vi trên màn hình nhỏ. Đánh giá khả năng đọc bằng công cụ hỗ trợ nếu dùng virtualization.
- Chọn virtualization dựa trên đo hiệu năng và hành vi thực tế. Không đặt một ngưỡng số item cố định rồi coi mọi danh sách đều cần virtualize.
- Dữ liệu cache cá nhân hóa phải tách theo người dùng/phạm vi truy cập và được xử lý phù hợp khi logout hoặc đổi tài khoản.

## Thứ tự bổ sung đề xuất

1. Hoàn thiện các màn hình tìm kiếm bằng pagination và API contract.
2. Thêm react-intersection-observer khi có chức năng cụ thể cần viewport detection.
3. Khi triển khai feed, kết hợp quản lý cursor/page với observer; useInfiniteQuery là lựa chọn nếu frontend dùng TanStack Query.
4. Đo DOM/render/scroll và chỉ thêm TanStack Virtual hoặc React Virtuoso cho màn hình có nhu cầu.

## Tài liệu chính thức

- [Intersection Observer API](https://developer.mozilla.org/en-US/docs/Web/API/Intersection_Observer_API)
- [react-intersection-observer](https://github.com/thebuilder/react-intersection-observer)
- [TanStack Query Infinite Queries](https://tanstack.com/query/latest/docs/framework/react/guides/infinite-queries)
- [TanStack Virtual](https://tanstack.com/virtual/latest/docs/introduction)
- [React Virtuoso](https://virtuoso.dev/)
- [Motion useInView](https://motion.dev/docs/react-use-in-view)
- [Next.js use client](https://nextjs.org/docs/app/api-reference/directives/use-client)
