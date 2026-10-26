---
status: accepted
date: 2026-10-26
---

# Modular monolith với worker chạy trên VPS

ResearchOS dùng monorepo pnpm với frontend Next.js, backend NestJS chia theo module nghiệp vụ và worker NestJS chạy bằng process/container riêng. PostgreSQL lưu dữ liệu chính; BullMQ và Redis điều phối tác vụ nền. Ban đầu các thành phần có thể chạy trên cùng VPS; worker có thể chuyển sang máy khác khi cần tăng tài nguyên.

Lựa chọn này tập trung nghiệp vụ và phân quyền ở backend, giữ các giao dịch liên quan trong một database, đồng thời cho phép tác vụ đồng bộ, digest, export và embedding chạy độc lập với HTTP API. Microservices làm tăng chi phí giao tiếp, triển khai và nhất quán dữ liệu khi các ranh giới nghiệp vụ còn đang được hoàn thiện.

Worker ở đây là chương trình Node.js do dự án phát triển và vận hành. Cloudflare Workers + Queues là phương án triển khai khác, cần đánh giá runtime và thiết kế tích hợp riêng; chưa được chọn cho kiến trúc ban đầu.

Hệ quả: nhóm quản lý backup, restart, tài nguyên và monitoring trên VPS. Chạy riêng container vẫn chia sẻ CPU/RAM nếu chung máy, và một VPS vẫn là điểm lỗi chung. Tác vụ phải có idempotency, retry có giới hạn và cơ chế điều tra khi thất bại.

Phạm vi chức năng MVP, SLO và các mâu thuẫn SRS vẫn cần chốt riêng. Quyết định này không mặc định cam kết toàn bộ SRS hoặc hiệu năng UC-06.
