# File storage – Supabase Storage buckets

The team chose Supabase Storage for images, videos and documents on 09/11/2026. This page says how to create the two
buckets **by hand on the Supabase Dashboard** (nothing in the code creates them) and why each one is set up this way.
It sits in `database/` next to the schema and the patches because, like them, it describes something that must exist
on the Supabase project before the code can use it; the team lead runs it together with
`patch_v0.3_attachment_storage.sql`.

Supabase Free plan limits (checked 10/11/2026): 1 GB storage, 5 GB egress per month, **50 MB per file**, no Storage
Image Transformations (images are compressed and resized in the browser before they are uploaded).

## Before you start

1. Supabase Dashboard > the EduConnect project > **Storage > Settings**: check that the global "Upload file size limit"
   is 50 MB. A bucket limit cannot be higher than this global limit.
2. Server `.env` (never committed): `STORAGE_DRIVER=supabase`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and the
   bucket names if they differ from the defaults (see `server/.env.example`). The service role key bypasses RLS on every
   table: it stays on the server only.
   Keep `STORAGE_DRIVER=local` on development machines and for tests on the throw-away database, so the shared quota
   stays clean.

## Bucket `avatars` – PUBLIC

Storage > **New bucket**:

| Field | Value |
|---|---|
| Name | `avatars` (or the value of `STORAGE_BUCKET_AVATARS`) |
| Public bucket | **on** |
| Restrict file size | on, **5 MB** |
| Allowed MIME types | `image/jpeg, image/png, image/webp` |

- Object path: `<userId>/<uuid>.<ext>`, e.g. `42/3f1c…9a.webp`.
- Why public: `avatarUrl` is returned by about 12 server files (sign-in, profile, conversations, group members,
  students, parents…). Signing every avatar link would touch FE-01, FE-02, FE-04, FE-06 and FE-14. The file name is a
  random UUID, so a link cannot be guessed. `users.avatar_url` stores the public URL.
- 5 MB is generous: avatars are cropped and compressed in the browser (about 512 px) before upload. The same MIME types
  as UC-06 accepts today (`detectImageType` in `server/src/utils/storage.js`).

## Bucket `attachments` – PRIVATE

Storage > **New bucket**:

| Field | Value |
|---|---|
| Name | `attachments` (or the value of `STORAGE_BUCKET_ATTACHMENTS`) |
| Public bucket | **off** |
| Restrict file size | on, **50 MB** (the Free plan maximum) |
| Allowed MIME types | the list below |

Allowed MIME types (copy as one comma-separated line):

```
image/jpeg, image/png, image/webp, image/gif, video/mp4, video/webm, video/quicktime, application/pdf, application/msword, application/vnd.openxmlformats-officedocument.wordprocessingml.document, application/vnd.ms-excel, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-powerpoint, application/vnd.openxmlformats-officedocument.presentationml.presentation, text/csv
```

| Kind (business rules §5) | Extensions | MIME types |
|---|---|---|
| Images | .jpg .jpeg .png .webp .gif | `image/jpeg`, `image/png`, `image/webp`, `image/gif` |
| Videos | .mp4 .webm .mov | `video/mp4`, `video/webm`, `video/quicktime` (.mov: see below) |
| Documents | .pdf | `application/pdf` |
| | .doc .docx | `application/msword`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document` |
| | .xls .xlsx | `application/vnd.ms-excel`, `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` |
| | .ppt .pptx | `application/vnd.ms-powerpoint`, `application/vnd.openxmlformats-officedocument.presentationml.presentation` |
| | .csv | `text/csv` (on Windows with Excel installed, browsers send `.csv` as `application/vnd.ms-excel`, already in the list) |

- Why `video/quicktime` (.mov): iPhones record video as .mov. Without it, parents and students who use an iPhone – a
  common case in Vietnam – would have their videos refused.
- Object paths (never the original file name, which may contain Vietnamese accents or odd characters; it is kept in
  `attachments.file_name`):
  - school feed (FE-08): `school-posts/<yyyy>/<mm>/<uuid>.<ext>`
  - group feed (FE-05, FE-07 activities are class feed posts): `posts/<yyyy>/<mm>/<uuid>.<ext>`
  - messages (FE-06): `messages/<groupId>/<uuid>.<ext>`
- The database row (`attachments`) keeps `bucket` + `storage_key` (the path above); the server signs a short-lived link
  from them every time the attachment is read.
- Why private: everything is soft deleted (business rules §14) – a deleted post, or a message deleted for everyone
  (§6), must not keep a link that opens forever. And this is school data: internal documents and photos of students,
  who are minors.
- Size: the bucket allows 50 MB for every file (one limit per bucket); the server applies the real limits from
  `system_settings` – `upload.max_file_mb` for images and documents, `upload.max_video_mb` for videos (§5, §13).

## The bucket settings are the SECOND check, not the first

Signed upload URLs do not limit the size or the type of what is sent, and the bucket checks the `Content-Type` header the
browser sends, not the file content. So the server must still:

1. check type and size **before** it hands out an upload URL (against `system_settings`);
2. check the stored object **after** the upload (real size, and the first bytes for the real type) before it inserts the
   `attachments` row, and remove the object if it does not match.

The bucket limits only stop what slips past the server (a bug, a hand-made request).

## Do not

- Add Storage policies (RLS on `storage.objects`) that let `anon` or `authenticated` read or write: the browser never
  talks to Storage with its own rights, only through URLs the server signs. Same idea as the database (RLS on, no
  policies).
- Put the service role key in the client (`VITE_…`), in a log, or in a commit.
