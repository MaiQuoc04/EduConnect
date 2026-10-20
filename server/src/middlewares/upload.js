import multer from 'multer';
import { badRequest } from '../utils/AppError.js';
import { getNumberSetting } from '../utils/settings.js';

// Accepts one file in memory (req.file) with the size limit from system_settings (upload.max_file_mb).
// Usage: router.put('/avatar', requireAuth, uploadSingle('avatar'), handler)
export function uploadSingle(field, settingKey = 'upload.max_file_mb') {
  return async (req, res, next) => {
    const maxMb = await getNumberSetting(settingKey, 10);
    const handler = multer({ storage: multer.memoryStorage(), limits: { fileSize: maxMb * 1024 * 1024, files: 1 } });
    handler.single(field)(req, res, (err) => {
      if (err?.code === 'LIMIT_FILE_SIZE') {
        return next(badRequest('MSG_FILE_TOO_LARGE', `The file must not be larger than ${maxMb} MB.`, { maxMb }));
      }
      if (err) return next(badRequest('MSG_UPLOAD_FAILED', 'The file could not be uploaded.'));
      next();
    });
  };
}
