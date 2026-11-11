import 'dotenv/config';

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable ${name} (see .env.example)`);
  return value;
}

export const env = {
  isProduction: process.env.NODE_ENV === 'production',
  port: Number(process.env.PORT || 5000),
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  db: {
    host: required('DB_HOST'),
    port: Number(process.env.DB_PORT || 5432),
    user: required('DB_USER'),
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'postgres',
    ssl: process.env.DB_SSL === 'true',
    sslCa: process.env.DB_SSL_CA || '', // empty: SSL without verifying the server certificate
    poolMax: Number(process.env.DB_POOL_MAX || 3),
  },
  jwt: {
    secret: required('JWT_SECRET'),
    expiresIn: process.env.JWT_EXPIRES_IN || '8h',
  },
  // Outgoing email (OTP for UC-02). Without SMTP_HOST, development prints emails to the console.
  mail: {
    host: process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT || 587),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.MAIL_FROM || 'EduConnect <no-reply@educonnect.local>',
  },
  uploadDir: process.env.UPLOAD_DIR || './uploads',
  storage: readStorage(),
};

// File storage (Supabase Storage chosen 09/11/2026). STORAGE_DRIVER empty or "local": files stay on this server's disk
// (UPLOAD_DIR) and no Supabase setting is needed – same idea as SMTP_HOST, so anyone can run the server and tests on a
// throw-away database never fill the shared quota. "supabase": SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set,
// otherwise the server stops at start-up instead of failing at the first upload.
function readStorage() {
  const driver = (process.env.STORAGE_DRIVER || 'local').trim().toLowerCase();
  if (driver !== 'local' && driver !== 'supabase') {
    throw new Error('STORAGE_DRIVER must be "local" or "supabase" (see .env.example)');
  }
  const storage = {
    driver,
    supabaseUrl: (process.env.SUPABASE_URL || '').trim().replace(/\/+$/, ''),
    buckets: {
      avatars: (process.env.STORAGE_BUCKET_AVATARS || '').trim() || 'avatars',
      attachments: (process.env.STORAGE_BUCKET_ATTACHMENTS || '').trim() || 'attachments',
    },
  };
  const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (driver === 'supabase') {
    const missing = [!storage.supabaseUrl && 'SUPABASE_URL', !serviceRoleKey && 'SUPABASE_SERVICE_ROLE_KEY'].filter(Boolean);
    if (missing.length) {
      throw new Error(`STORAGE_DRIVER=supabase needs ${missing.join(' and ')} (see .env.example)`);
    }
    if (!/^https:\/\/[^/\s]+$/.test(storage.supabaseUrl)) {
      throw new Error('SUPABASE_URL must look like https://<project-ref>.supabase.co (see .env.example)');
    }
  }
  // The service role key bypasses RLS on every table: not enumerable, so logging or JSON-ing env never prints it.
  Object.defineProperty(storage, 'serviceRoleKey', { value: serviceRoleKey, enumerable: false });
  return storage;
}
