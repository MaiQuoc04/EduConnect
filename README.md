# EduConnect (SEP490-G39)

Code base chung của nhóm: **React (Vite)** + **Node.js/Express** + **Socket.io** + **MySQL** (đúng công nghệ trong Report 2).

```
educonnect/
├── CLAUDE.md   hướng dẫn cho AI agent (Claude Code tự đọc file này)
├── docs/       quy tắc nghiệp vụ đã chốt, 107 UC, phân quyền, 71 màn
├── database/   educonnect_schema_v0.2.sql (46 bảng, theo ERD_quyet_dinh.md)
├── server/     API Express – http://localhost:5000/api/v1
└── client/     Web React – http://localhost:5173
```

## 0. Dùng AI agent trong IDE
Claude Code tự đọc `CLAUDE.md` ở thư mục gốc. Khi giao việc, nêu rõ mã UC, ví dụ: *"Làm UC-07 View Student List (FE-02) theo docs/business-rules.md và docs/permissions.md"*. Nghiệp vụ mới chốt thì sửa `docs/business-rules.md` trước, rồi mới bảo agent code.

## 1. Cài lần đầu
Cần Node.js 20 trở lên (`node -v`).

```bash
cd server
npm install
copy .env.example .env      # macOS/Linux: cp .env.example .env
```
- Điền `DB_PASSWORD` (mật khẩu Aiven – nhóm trưởng gửi riêng) và `JWT_SECRET` (chuỗi ngẫu nhiên ≥ 32 ký tự, cả nhóm dùng **giống nhau**).
- Chép `ca.pem` (tải từ Aiven) vào `server/certs/ca.pem`.
- Kiểm tra kết nối: `npm run db:check` → phải báo `46 tables`.

```bash
cd ../client
npm install
```

## 2. Chạy khi code
Mở 2 cửa sổ terminal:
```bash
cd server && npm run dev     # API, tự khởi động lại khi sửa code (node --watch)
cd client && npm run dev     # Web, mở http://localhost:5173
```

## 3. Tài khoản đầu tiên
DB mới chưa có tài khoản nào. Một người (nhóm trưởng) chạy **một lần**:
```bash
cd server
npm run seed:admin -- admin "System Admin" "<mật khẩu>"
```
Sau đó đăng nhập web bằng `admin` + mật khẩu đó.

## 4. Quy ước code
- **Mỗi FE một thư mục** `server/src/modules/<tên>/` gồm `*.routes.js` → `*.controller.js` → `*.service.js` (SQL nằm ở service). Gắn route trong `server/src/routes.js` (đã ghi sẵn ai làm FE nào). Mẫu: `modules/auth` (UC-01 Sign In).
- **Phân quyền**: `requireAuth` + `requireRole('SCHOOL_MANAGER', ...)` theo **vai trò đang chọn** (`req.user.activeRole`). Phía web chỉ ẩn màn, server vẫn phải kiểm tra.
- **Xoá mềm cho mọi thứ**: không `DELETE` bảng nghiệp vụ, chỉ `UPDATE ... SET deleted_at = NOW()`; mọi `SELECT` lọc `deleted_at IS NULL`. Chỉ xoá cứng: bỏ thích (`post_likes`), `class_event_viewers`, `teacher_subjects`, `user_roles`, `student_parents`, OTP hết hạn.
- **Lỗi**: `throw badRequest('MSGxx', '...')` (xem `utils/AppError.js`); mọi lỗi trả về `{ code, message }`.
- **Nhiều câu SQL phải cùng thành công** (vd lưu điểm + lịch sử điểm): dùng `withTransaction` trong `config/db.js`.
- **Ghi nhật ký** việc quan trọng bằng `logActivity` (danh sách trong ERD 7f).
- Web gọi API qua `client/src/api/client.js` (đã tự gắn token).

## 5. Git
- Nhánh chính `main` (luôn chạy được) và `develop`. Mỗi người làm trên `feature/fe-xx-<tên-ngắn>`, mở Pull Request vào `develop`, cần 1 người review.
- **Không commit** `.env`, `ca.pem`, `node_modules` (đã có trong `.gitignore`).

## 6. Database dùng chung
- DB chung trên Aiven (MySQL 8.4, gói Free 1 GB): ai sửa/xoá dữ liệu thì cả nhóm thấy → dữ liệu thử nghiệm nên tạo trên MySQL local (đổi `.env`: `DB_HOST=127.0.0.1`, `DB_PORT=3306`, `DB_USER=root`, `DB_SSL=false`).
- Đổi cấu trúc bảng: báo nhóm trưởng, sửa file trong `database/` rồi mới chạy trên Aiven.
- Gói Free có thể tự tắt khi lâu không dùng → vào console.aiven.io bấm **Power on**.
