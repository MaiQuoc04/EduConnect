import * as service from './schoolSettings.service.js';

// School Manager settings (Dung, 21/11/2026). Controllers check the request, call the service and send the result.

// GET /api/v1/school-settings – the values in force (built-in defaults while the table is missing, with ready: false)
export async function get(req, res) {
  res.json(await service.getSettings());
}

// PUT /api/v1/school-settings { teaching?: { norm, homeroomNorm, maxOver, maxPerDay }, attendance?: { editDeadlineTime },
// stamp }
export async function update(req, res) {
  const values = service.checkBody(req.body);
  const stamp = typeof req.body?.stamp === 'string' ? req.body.stamp : '';
  res.json(await service.updateSettings({ values, stamp }, req.user, req.ip));
}
