import * as service from './schoolSettings.service.js';

// School Manager settings (Dung, 21/11/2026). Controllers check the request, call the service and send the result.

// GET /api/v1/school-settings – the values in force (built-in defaults while the table is missing, with ready: false)
export async function get(req, res) {
  res.json(await service.getSettings());
}

// PUT /api/v1/school-settings { teaching: { norm, homeroomNorm, maxOver, maxPerDay }, stamp }
export async function update(req, res) {
  const teaching = service.checkTeaching(req.body);
  const stamp = typeof req.body?.stamp === 'string' ? req.body.stamp : '';
  res.json(await service.updateSettings({ teaching, stamp }, req.user, req.ip));
}
