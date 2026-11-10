import * as service from './uploads.service.js';

export async function sign(req, res) {
  res.status(201).json(await service.signUpload(req.user, req.body ?? {}));
}

export async function confirm(req, res) {
  res.json(await service.confirmUpload(req.user, req.body ?? {}));
}
