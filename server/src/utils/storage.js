import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { env } from '../config/env.js';

// ASSUMPTION: until the team picks the cloud storage provider (business-rules §15), files are saved on the API
// server's disk (UPLOAD_DIR, default server/uploads) and served at /uploads. Only this module needs to change later;
// callers keep storing the returned URL in the DB.
export const uploadRoot = path.resolve(process.cwd(), env.uploadDir);

export async function saveFile(folder, buffer, extension) {
  const name = `${crypto.randomUUID()}${extension}`;
  const dir = path.join(uploadRoot, folder);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, name), buffer);
  return `/uploads/${folder}/${name}`;
}

// Detects JPEG / PNG / WebP from the file content (the browser-supplied MIME type can be wrong).
export function detectImageType(buffer) {
  if (buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return '.jpg';
  if (buffer.length > 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return '.png';
  }
  if (buffer.length > 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
    return '.webp';
  }
  return null;
}
