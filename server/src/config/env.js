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
    port: Number(process.env.DB_PORT || 3306),
    user: required('DB_USER'),
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'educonnect',
    ssl: process.env.DB_SSL === 'true',
    sslCa: process.env.DB_SSL_CA || './certs/ca.pem',
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
};
