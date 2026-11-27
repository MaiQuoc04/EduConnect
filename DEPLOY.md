# DEPLOY.md — EduConnect

Danh sách kiểm khi đưa hệ thống lên production: **Vercel (FE) + VPS (BE) + Supabase (DB + Storage)**.

Viết để dùng được lúc 2 giờ sáng ngày deploy. Mỗi mục có lệnh hoặc giá trị cụ thể; phần "tại sao"
chỉ xuất hiện ở chỗ mà không hiểu lý do thì sẽ làm sai.

Nguồn sự thật về nghiệp vụ vẫn là `CLAUDE.md` và `docs/business-rules.md`. File này không đặt ra
luật mới, chỉ nói những gì phải kiểm khi rời khỏi `localhost`.

Khác với nhiều hướng dẫn trên mạng: database **không** nằm trên VPS. Supabase giữ cả Postgres lẫn
Storage, nên VPS chỉ chạy một tiến trình Node. Bỏ qua mọi hướng dẫn về tuning MySQL/Postgres,
`innodb_buffer_pool_size`, OOM killer giết database — không áp dụng ở đây.

---

## 0. Hai thứ quyết định trước, sửa sau rất đắt

**Supabase Free dừng project sau 7 ngày ít hoạt động.** Không phải cảnh báo, là hành vi mặc định.
Deploy xong rồi cả nhóm quay về viết báo cáo mười ngày, đến hôm demo thì database đã ngủ và phải
khôi phục thủ công. Mục 7 có cách giữ cho nó thức.

**Gói Free còn 5 GB egress, 1 GB file storage, 500 MB database và không có backup.** Ảnh và video
đính kèm bài đăng (FE-08) ăn vào đúng 1 GB đó. Đếm trước xem demo định đăng bao nhiêu ảnh.

> Nâng Supabase lên Pro gỡ được cả hai, nhưng hãy quyết **trước** khi in địa chỉ vào báo cáo, không
> phải vào tối hôm trước buổi bảo vệ.

---

## 1. Giai đoạn 0 — làm sớm vì có thời gian chờ

- [ ] **Mua tên miền, trỏ bản ghi A về IP của VPS**, bản ghi cho frontend về Vercel. Chờ DNS lan truyền.
      Trang DNS của Vietnix dùng **tên đầy đủ** ở cột NAME (`api.educonnect.info.vn`), không nhận `@`
      lẫn ô trống. Vercel yêu cầu **A record** cho tên miền gốc, không cho CNAME.
      Tên miền `.vn` cần giấy tờ cá nhân và thủ tục; `.com` mua là dùng.
- [ ] **Bật xác thực 2 bước cho Gmail**, tạo App Password tại `myaccount.google.com/apppasswords`.
      Chưa bật 2FA thì mục đó không hiện. Mã hiện ra dạng 4 nhóm 4 ký tự — **xoá hết dấu cách**.
- [ ] **Sinh `JWT_SECRET` mới cho production.** Không dùng lại chuỗi đang có trong `.env` của máy dev:
      nó đã đi qua chat nhóm, máy của năm người và có thể cả lịch sử git của ai đó.

```bash
openssl rand -hex 32
```

> **Khoá bị in ra màn hình thì coi như đã công khai.** `SUPABASE_SERVICE_ROLE_KEY` bỏ qua RLS trên
> **mọi** bảng — lộ nó là lộ cả database, không riêng Storage. Lỡ in ra thì vào Supabase xoay khoá
> ngay, đừng cân nhắc.

### Thử cổng 587 ngay ngày đầu có VPS

Nhiều nhà cung cấp VPS Việt Nam chặn SMTP ra ngoài với tài khoản mới. Chặn thì UC-02 (quên mật khẩu
qua OTP email) không chạy, mà lỗi sẽ hiện ra muộn và khó đoán.

```bash
apt install -y swaks
swaks --to <email-cua-ban> --server smtp.gmail.com:587 -tls \
      --auth-user <tai-khoan-gmail> --auth-password '<app password>'
```

Thấy `235 2.7.0 Accepted` rồi `250 2.0.0 OK` là thông. Không thì mở ticket xin mở cổng 587 outbound.
**Chạy xong đổi App Password** — `swaks` in mật khẩu ra màn hình dạng base64, mà base64 không phải
mã hoá.

---

## 2. Dựng VPS

Cấu hình tối thiểu: **1 GB RAM, 10 GB ổ đĩa**. Database ở Supabase nên VPS chỉ chạy Node; nếu định
dùng chung máy cho việc khác thì lấy 2 GB.

### 2.1. Hệ điều hành

- [ ] **Ubuntu 24.04 LTS.** Không dùng bản không-LTS.
- [ ] **KHÔNG chạy `do-release-upgrade`** dù Ubuntu có gợi ý. Nâng cấp bản phân phối trên máy sắp
      deploy là rủi ro thuần tuý.
- [ ] `apt update && apt upgrade -y` rồi `reboot`.
- [ ] Image AZVPS **không cài sẵn `ufw`**: `apt install -y ufw` trước mục 2.2. `fail2ban` chạy được
      ngay sau `apt install`, jail `sshd` tự đọc journal của systemd, không cần `jail.local`.

### 2.2. Khoá máy chủ — làm trước khi cài gì khác

Máy mới lên mạng bị bot quét trong vài phút đầu.

```bash
apt install -y ufw fail2ban
ufw allow 22/tcp && ufw allow 80/tcp && ufw allow 443/tcp
ufw enable
systemctl enable --now fail2ban
```

> **Mở cổng 22 TRƯỚC KHI `ufw enable`.** Quên là tự khoá mình ra ngoài, phải vào bằng console/VNC
> của nhà cung cấp để cứu.
>
> Không mở cổng 5000. Node chỉ nghe `127.0.0.1`, nginx là thứ duy nhất nói chuyện với nó.

Khoá SSH, theo đúng thứ tự này:

1. Trên máy cá nhân: `ssh-keygen -t ed25519 -C "educonnect"`
2. Đọc khoá công khai (PowerShell: `Get-Content $env:USERPROFILE\.ssh\id_ed25519.pub`)
3. Trên VPS: `mkdir -p ~/.ssh && chmod 700 ~/.ssh`, rồi
   `echo '<dòng khoá>' >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys`
4. **Thử đăng nhập bằng khoá ở cửa sổ MỚI, giữ nguyên cửa sổ cũ.** Vào được mà không hỏi mật khẩu
   mới sang bước 5.
5. Tắt đăng nhập bằng mật khẩu:

```bash
cat > /etc/ssh/sshd_config.d/00-hardening.conf <<'EOF'
PasswordAuthentication no
PermitRootLogin prohibit-password
EOF
sshd -t && systemctl restart ssh
```

> **Tên file phải sắp xếp ĐẦU TIÊN (`00-`)** — `sshd` lấy giá trị gặp đầu tiên, và Ubuntu có sẵn
> `50-cloud-init.conf`.
>
> `sshd -t` kiểm cú pháp trước khi restart. Luôn chạy nó — một file hỏng là mất đường vào.

### 2.3. Swap

Không cần cho lúc chạy bình thường. Nó là bảo hiểm cho `npm ci`: cây phụ thuộc của client (Vite +
React 19) có thể ngốn thêm vài trăm MB trong vài chục giây.

```bash
fallocate -l 1G /swapfile && chmod 600 /swapfile
mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
echo 'vm.swappiness=10' >> /etc/sysctl.conf && sysctl -p
```

### 2.4. Node

- [ ] Cài **cùng số major** với máy phát triển. `server/package.json` ghi `"node": ">=20"`; kiểm
      `node -v` ở máy mình rồi cài đúng bản đó. Khác major là nguồn lỗi âm thầm: chạy ở máy mình,
      hỏng trên server, log không nói gì.

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs
npm i -g pm2
```

Bản `apt` mặc định của Ubuntu quá cũ.

### 2.5. Mã nguồn và pm2

```bash
git clone <repo> /opt/educonnect && cd /opt/educonnect/server
npm ci --omit=dev
# tạo .env theo mục 2.7 TRƯỚC khi start
pm2 start src/server.js --name educonnect-api --time
pm2 save && pm2 startup     # chạy dòng lệnh mà nó in ra
```

- [ ] **Chỉ một process. Không bật pm2 cluster.**

> Socket.io giữ trạng thái trong bộ nhớ từng process: client nối vào instance A sẽ không nhận được
> sự kiện phát từ instance B, nên bình luận realtime (FE-08) sẽ chạy với người này mà không chạy với
> người kia — lỗi khó chịu nhất để gỡ. Muốn nhiều instance phải thêm Redis adapter trước.
>
> `REMINDER_JOB` (FE-09 UC-69) cũng chạy trong tiến trình, mỗi giờ một lần. Một process là đúng.

### 2.6. Nginx + TLS — phần dễ sai nhất

HTTPS **bắt buộc**: Vercel chạy HTTPS, nên trình duyệt chặn mọi lời gọi từ trang HTTPS sang backend
`http://`. Không có TLS thì frontend không nói chuyện được với backend, kể cả khi cả hai đều chạy.

```bash
apt install -y nginx certbot python3-certbot-nginx
```

```nginx
# /etc/nginx/sites-available/educonnect
server {
    server_name api.<ten-mien>;

    # Mặc định nginx chỉ cho body 1 MB. Ảnh và file đính kèm đi QUA server rồi mới lên Supabase
    # Storage, nên vẫn qua nginx: thiếu dòng này thì mọi lần tải tệp lên đều hỏng với 413, và lỗi
    # nằm ở log nginx chứ không vào log ứng dụng.
    client_max_body_size 55m;

    location /api/ {
        proxy_pass http://127.0.0.1:5000;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Socket.io: BẮT BUỘC có ba dòng Upgrade/Connection/http_version
    location /socket.io/ {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade    $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host       $host;
        proxy_read_timeout 3600s;
    }

    # Giữ lại cả khi STORAGE_DRIVER=supabase: database còn URL /uploads/... từ trước khi nhóm
    # chuyển sang Supabase Storage (09/11/2026). Xoá đi là mất ảnh cũ.
    location /uploads/ {
        proxy_pass http://127.0.0.1:5000;
        proxy_set_header Host $host;
    }
}
```

```bash
ln -s /etc/nginx/sites-available/educonnect /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
certbot --nginx -d api.<ten-mien>
systemctl list-timers | grep certbot   # xác nhận tự gia hạn có chạy
```

> **Thiếu `proxy_http_version 1.1` cùng hai header `Upgrade` và `Connection` thì WebSocket không
> bắt tay được.** Nó không báo lỗi rõ ràng: Socket.io âm thầm tụt về long-polling, bình luận vẫn
> hiện nhưng chậm và tốn request, hoặc console hiện một lỗi WebSocket khó hiểu. Rất nhiều hướng dẫn
> nginx trên mạng bỏ sót ba dòng này.
>
> `nginx -t` là bản tương đương `sshd -t`. Chạy trước mọi lần reload.

- [ ] Kiểm WebSocket thật, không chỉ xem trang có mở được:
      mở DevTools › Network › lọc `WS`, phải thấy một kết nối `101 Switching Protocols`.

### 2.7. Biến môi trường

Chép `server/.env.example` thành `.env` trên VPS rồi `chmod 600` **trước khi điền**, để file không
bao giờ tồn tại ở trạng thái ai cũng đọc được. `TZ` **không có** trong `.env.example`, phải tự thêm.

Những giá trị **khác** máy dev:

```ini
PORT=5000
CLIENT_ORIGIN=https://<ten-mien-vercel-production>
TZ=Asia/Ho_Chi_Minh

JWT_SECRET=<chuỗi hex mới sinh ở mục 1>

STORAGE_DRIVER=supabase
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...

SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=...
SMTP_PASS=<app password, đã xoá dấu cách>
MAIL_FROM=...

REMINDER_JOB=on
```

Điền bí mật không qua `nano` và không để lại vết trong `.bash_history`:

```bash
setsecret() {
  local K="$1"
  read -rsp "$K: " VAL; echo
  K="$K" VAL="$VAL" python3 -c 'import os, pathlib
k = os.environ["K"]; v = os.environ["VAL"]
p = pathlib.Path(".env"); out = []; done = False
for l in p.read_text().splitlines():
    if l.split("=", 1)[0] == k: out.append(k + "=" + v); done = True
    else: out.append(l)
if not done: out.append(k + "=" + v)
p.write_text("\n".join(out) + "\n")'
  unset VAL
}
setsecret DB_PASSWORD; setsecret SMTP_PASS; setsecret SUPABASE_SERVICE_ROLE_KEY
```

Giá trị đi qua biến môi trường chứ không qua tham số dòng lệnh, nên không hiện trong `ps`. Không
dùng `sed` vì mật khẩu Supabase hay chứa `|`, `&`, `/`, `\` — `sed` sẽ hiểu nhầm chúng.

Kiểm lại mà không lộ giá trị. **Mẫu lọc phải có cả `KEY` và `TOKEN`**: tên biến
`SUPABASE_SERVICE_ROLE_KEY` kết thúc bằng `KEY`, một mẫu chỉ bắt `SECRET|PASSWORD` sẽ in nó ra
nguyên văn — đã xảy ra thật khi deploy lần đầu, và khoá đó phải xoay lại.

```bash
awk -F= '/^[A-Z]/ {
  k=$1; v=substr($0, length(k)+2);
  if (k ~ /PASSWORD|SECRET|PASS$|KEY|TOKEN/) printf "%-28s %s\n", k, (length(v) ? "da dien (" length(v) " ky tu)" : ">>> TRONG <<<");
  else printf "%-28s %s\n", k, (length(v) ? v : ">>> TRONG <<<");
}' .env
```

- [ ] `CLIENT_ORIGIN` dùng `https://`, không phải `http://`. Vercel chỉ phục vụ HTTPS nên `Origin`
      trình duyệt gửi lên luôn là `https://`; lệch một chữ `s` là CORS chặn cả REST lẫn Socket.io,
      mà lỗi hiện ra chỉ là "Network Error".
- [ ] `.env` có quyền `chmod 600` và thuộc user chạy pm2.
- [ ] **`.env` không bao giờ vào git.** Kiểm lại `.gitignore` trước lần commit đầu trên server.

---

## 3. Bốn cấu hình phải khớp nhau giữa hai nơi

Nhóm lỗi "chạy ở máy mình mà hỏng trên server", vì mỗi thứ sai một nửa ở một phía.

### 3.1. `trust proxy` ↔ Nginx — PHẢI SỬA CODE

`server/src/app.js` hiện là:

```js
app.set('trust proxy', true);
```

- [ ] Đổi thành `app.set('trust proxy', 1);`

> `true` nghĩa là tin **toàn bộ** chuỗi `X-Forwarded-For`, nên bất kỳ ai cũng gửi được header giả và
> `req.ip` thành địa chỉ họ bịa. EduConnect dùng `req.ip` để ghi `activity_logs` (business-rules §13)
> cho các hành động nhạy cảm: đặt lại mật khẩu, khoá tài khoản, đổi cài đặt hệ thống. Nhật ký truy
> vết với IP giả còn tệ hơn không có nhật ký.
>
> Sau nginx đúng một hop, nên giá trị đúng là `1`. Đặt **thiếu** (bỏ hẳn) thì mọi người dùng đều
> thành `127.0.0.1`; đặt **thừa** (`true`) thì khách tự bịa. Chỗ này không có mặc định an toàn.

### 3.2. `CLIENT_ORIGIN` ↔ tên miền Vercel

- [ ] `CLIENT_ORIGIN` bằng **đúng** tên miền production của Vercel.

`app.js` và `sockets/index.js` đều đọc `env.clientOrigin` cho CORS, nên sai một ký tự là cả API lẫn
Socket.io cùng bị chặn. Preview deployment của Vercel nằm ở subdomain ngẫu nhiên và sẽ bị chặn — đó
là chủ đích.

### 3.3. `VITE_*` được nhúng **lúc build** — PHẢI SỬA CODE

Client đang dựa vào proxy của Vite, thứ chỉ tồn tại khi `npm run dev`:

```js
// client/src/api/client.js:12
export const api = axios.create({ baseURL: '/api/v1' });

// client/src/context/SocketContext.jsx:25
const s = io({ auth: { token }, transports: ['websocket', 'polling'] });
```

Lên Vercel thì `/api/v1` trỏ vào chính Vercel và không có gì ở đó.

- [ ] `client.js`: `baseURL: import.meta.env.VITE_API_URL || '/api/v1'`
      Dùng `||`, **không dùng `??`**: `??` chỉ bắt `undefined`, nên một dòng `VITE_API_URL=`
      bỏ trống trong `.env` sẽ cho `baseURL` rỗng và mọi lời gọi API hỏng với lỗi 404 khó đoán.
- [ ] `SocketContext.jsx`: `io(import.meta.env.VITE_SOCKET_URL || undefined, { ... })`
- [ ] Tạo `client/.env.example` ghi hai biến này (hiện chưa có file đó).
- [ ] Trên Vercel đặt `VITE_API_URL=https://api.<ten-mien>/api/v1` và
      `VITE_SOCKET_URL=https://api.<ten-mien>`

> Giữ fallback `'/api/v1'` để `npm run dev` ở máy vẫn chạy qua proxy như cũ, không ai phải tạo
> `.env` để code chạy.
>
> **Đổi biến này trên Vercel phải build lại**, restart không ăn thua: Vite thay giá trị vào mã nguồn
> lúc build.

### 3.4. `TZ`

- [ ] `TZ=Asia/Ho_Chi_Minh` trong `.env` của server.

Supabase đã đặt múi giờ Việt Nam nên `db.js` nhận đúng chuỗi ngày giờ, nhưng tiến trình Node trên
VPS mặc định chạy UTC — mọi chỗ JavaScript tự tính giờ sẽ lệch 7 tiếng.

---

## 4. Vercel

- [ ] **SPA rewrite về `index.html`.** Tạo `client/vercel.json`:

```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

> Thiếu thì mở thẳng `/students/12` hay `/school-feed?post=5` trả 404; chỉ bấm từ trang chủ mới chạy.
> EduConnect dùng React Router và có nhiều đường dẫn sâu, kể cả link chia sẻ một bài đăng.
>
> **Kiểm bằng cách gõ thẳng một URL sâu vào thanh địa chỉ**, không phải bấm từ trang chủ. Đây là lỗi
> hay lọt nhất vì bấm trong app thì không bao giờ thấy.

- [ ] Root Directory của project Vercel trỏ vào `client/`.
- [ ] Build command `npm run build`, output `dist`.

---

## 5. Supabase

### 5.1. Session pooler, KHÔNG phải Transaction pooler

- [ ] `DB_PORT` là cổng của **Session pooler** (xem Supabase › Connect › Session pooler).

> `sockets/notificationListener.js` giữ một kết nối riêng chạy `LISTEN` để đẩy thông báo FE-09 theo
> thời gian thực. **Transaction pooler không hỗ trợ `LISTEN`/`NOTIFY`** — kết nối vẫn mở, truy vấn
> thường vẫn chạy, chỉ riêng thông báo là không bao giờ tới. Không có lỗi nào được ghi ra.
>
> `.env.example` có gợi ý đổi sang Transaction pooler khi gặp "max clients reached". Trên production
> **đừng làm thế**; giảm `DB_POOL_MAX` thay vì đổi pooler.

- [ ] `DB_POOL_MAX` đặt vừa phải (5–10). Pooler của gói Free dùng chung cho cả project.

### 5.2. Storage

- [ ] `STORAGE_DRIVER=supabase`. Để `local` thì ảnh nằm trên đĩa VPS: mất khi dựng lại máy, và
      `avatar_url` trong database sẽ trỏ vào file không còn ở đâu cả.
- [ ] Kiểm CORS của hai bucket cho phép tên miền Vercel — client tải tệp lên **thẳng** Supabase bằng
      signed URL, không đi qua backend. Xem `database/README-storage.md`.
- [ ] Sau khi đổi driver: thử tải một ảnh lên **trên production**, rồi mở lại bài đăng đó ở một
      trình duyệt khác để chắc URL công khai đọc được.

### 5.3. Hạn mức

- [ ] Biết trước: 5 GB egress, 1 GB storage, 500 MB database, **không có backup**, dừng sau 7 ngày
      ít hoạt động.

---

## 6. Kiểm trên server thật

Những thứ này chỉ có ý nghĩa khi thử ở production, không phải ở `localhost`.

- [ ] `curl https://api.<ten-mien>/api/v1/health` trả `{"status":"ok", ...}` kèm phiên bản Postgres.
      Trả được nghĩa là Node sống **và** database trả lời.
- [ ] Đăng nhập bằng một tài khoản mỗi vai trò. Sai mật khẩu 5 lần phải bị khoá tạm (UC-01).
- [ ] **Realtime**: mở cùng một bài đăng ở hai trình duyệt khác nhau, một bên bình luận, bên kia phải
      hiện thông báo có bình luận mới mà không cần tải lại trang.
- [ ] **Chuông thông báo**: School Manager đăng một bài có gửi thông báo, tài khoản nhận phải thấy
      chuông đổi số mà không tải lại trang. Chạy được nghĩa là `LISTEN` đúng (mục 5.1).
- [ ] **Tải tệp**: đăng một bài có ảnh, kiểm ảnh hiện trên thẻ ngoài bảng tin.
- [ ] **Email**: chạy quên mật khẩu, kiểm hộp thư thật nhận được OTP.
- [ ] Mở thẳng một URL sâu (mục 4).
- [ ] **Đổi mật khẩu mọi tài khoản seed.** Seed dùng chung một mật khẩu, đã ghi trong
      `database/educonnect_seed_small_v0.3.sql` và file đó nằm trong git.

---

## 7. Sau khi chạy được

### Cập nhật code sau khi đã deploy

Frontend **tự động**: Vercel build lại mỗi lần merge vào `develop`. Backend **không** — VPS giữ bản
code lúc clone cho tới khi có người vào kéo về. Đây là đánh đổi có chủ ý: một PR hỏng merge lúc nửa
đêm không tự làm sập API.

```bash
ssh root@<ip-vps>
cd /opt/educonnect && git pull
# gói mới? phải cài trước khi restart, nếu không server chết với "Cannot find module"
git diff HEAD@{1} --name-only | grep -q 'server/package-lock.json' && (cd server && npm ci --omit=dev)
# biến môi trường mới? .env không nằm trong git nên nó sống sót, nhưng biến bắt buộc mới thì server không lên
git diff HEAD@{1} --name-only | grep -q 'server/.env.example' && echo "CO BIEN MOI, xem lai .env"
pm2 restart educonnect-api
pm2 logs educonnect-api --lines 30     # Ctrl+C để thoát, không dừng server
curl -s localhost:5000/api/v1/health
```

- [ ] **Patch SQL không tự chạy.** `git pull` chỉ lấy code. Một patch mới trong `database/` phải do
      team lead chạy tay trên Supabase, và chạy **trước** khi restart server. Quên bước này thì lỗi
      chỉ hiện ra khi có người bấm đúng chức năng dùng cột mới — không phải lúc khởi động.

### Giữ Supabase khỏi ngủ

- [ ] Một cron bên ngoài (cron-job.org hoặc GitHub Actions) gọi
      `https://api.<ten-mien>/api/v1/health` mỗi 10–15 phút.

Endpoint này truy vấn database, nên một mũi tên trúng hai đích: Supabase thấy có hoạt động nên không
dừng project, và nếu sau này chuyển sang nền tảng có spin-down thì nó cũng giữ service thức.

### Sao lưu — làm ngay

- [ ] `pg_dump` theo lịch, **chép ra khỏi Supabase**.

Gói Free không có backup nào. Snapshot của nhà cung cấp VPS không cứu được database vì database
không nằm ở đó.

### Xoay vòng log — ngày đầu, đừng đợi

Ổ đĩa đầy ở dự án kiểu này gần như luôn do log.

- [ ] `pm2 install pm2-logrotate`
- [ ] Kiểm `logrotate` đã quản lý nginx access log
- [ ] Cân nhắc đổi `morgan('dev')` sang `morgan('combined')` ở production — `dev` có mã màu ANSI,
      đọc trong file log rất khó chịu.

---

## Để dành — chưa làm, đã cân nhắc

- **Redis adapter cho Socket.io.** Chỉ cần khi chạy nhiều instance. Hiện một process là đủ.
- **Rate limit.** Hệ thống chưa có. Khoá đăng nhập sau 5 lần sai là theo tài khoản, không theo IP,
  nên chưa có chỗ nào khoá nhầm người. Thêm limiter theo IP thì `trust proxy` ở mục 3.1 trở thành
  vấn đề bảo mật thật sự chứ không chỉ là nhật ký sai.
- **Thu hồi JWT.** Hiện không có. Tài khoản bị chiếm, đổi mật khẩu xong thì token cũ vẫn dùng được
  tới khi hết hạn.
- **CI tự động deploy.** Hiện là `git pull && npm ci && pm2 restart` bằng tay. Đủ cho quy mô này;
  GitHub Actions chỉ đáng làm khi có nhiều người cùng deploy.
- **Dọn tệp mồ côi trong Storage.** Script hiện chỉ quét thư mục `tmp/`, chưa quét `school-posts/`.
