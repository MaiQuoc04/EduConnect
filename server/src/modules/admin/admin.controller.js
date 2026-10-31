import * as accountImport from './accountImport.service.js';
import * as accounts from './accounts.service.js';
import * as control from './accountControl.service.js';
import * as maintenance from './maintenance.service.js';
import * as settings from './settings.service.js';

// Multer reads file names as latin1; turn them back into UTF-8 so Vietnamese names show correctly.
function uploadedFile(req) {
  if (!req.file) return null;
  return { ...req.file, originalname: Buffer.from(req.file.originalname, 'latin1').toString('utf8') };
}

// UC-92 Create Account. The answer holds a password shown once: never cache it.
export async function createAccount(req, res) {
  const result = await accounts.createAccount({ body: req.body, actorId: req.user.userId, ip: req.ip });
  res.set('Cache-Control', 'no-store').status(201).json(result);
}

// UC-93 Import Accounts – template download.
export async function importTemplate(req, res) {
  const { fileName, contentType, buffer } = await accountImport.buildTemplate(req.query.type);
  res
    .set('Content-Type', contentType)
    .set('Content-Disposition', `attachment; filename="${fileName}"`)
    .send(buffer);
}

// UC-93 – check the file, nothing is saved.
export async function previewImport(req, res) {
  res.json(await accountImport.previewImport({ file: uploadedFile(req), type: req.body?.type }));
}

// UC-93 – create the valid rows; the answer holds passwords shown once.
export async function importAccounts(req, res) {
  const result = await accountImport.importAccounts({
    file: uploadedFile(req),
    type: req.body?.type,
    actorId: req.user.userId,
    ip: req.ip,
  });
  res.set('Cache-Control', 'no-store').status(201).json(result);
}

// ---------------------------------------------------------------- UC-94..98 accounts
const actorOf = (req) => ({ userId: req.user.userId, activeRole: req.user.activeRole });

export async function listAccounts(req, res) {
  res.json(await control.listAccounts(req.query)); // UC-94
}

export async function listClassOptions(_req, res) {
  res.json(await control.listClassOptions()); // UC-94 class filter
}

export async function exportAccounts(req, res) {
  const { fileName, contentType, buffer } = await control.exportAccounts(req.query); // UC-95
  res
    .set('Content-Type', contentType)
    .set('Content-Disposition', `attachment; filename="${fileName}"`)
    .send(buffer);
}

export async function getAccount(req, res) {
  res.json(await control.getAccount(req.params.id));
}

export async function updateIdentifiers(req, res) {
  res.json(await control.updateIdentifiers({ idParam: req.params.id, body: req.body })); // UC-96
}

export async function getSecurityState(req, res) {
  res.json(await control.getSecurityState({ idParam: req.params.id, actor: actorOf(req) }));
}

export async function resetPassword(req, res) {
  const result = await control.resetPassword({ idParam: req.params.id, actor: actorOf(req), ip: req.ip }); // UC-97
  res.set('Cache-Control', 'no-store').json(result);
}

export async function lockAccount(req, res) {
  res.json(await control.lockAccount({ idParam: req.params.id, actor: actorOf(req), reason: req.body?.reason, ip: req.ip })); // UC-98
}

export async function unlockAccount(req, res) {
  res.json(await control.unlockAccount({ idParam: req.params.id, actor: actorOf(req), ip: req.ip })); // UC-98
}

export async function clearTemporaryLock(req, res) {
  res.json(await control.clearTemporaryLock({ idParam: req.params.id, actor: actorOf(req), ip: req.ip })); // UC-98 1b
}

// ---------------------------------------------------------------- UC-99 settings
export async function listSettings(_req, res) {
  res.json(await settings.listSettings());
}

export async function updateSettings(req, res) {
  res.json(await settings.updateSettings({ values: req.body?.values, actorId: req.user.userId, ip: req.ip }));
}

// ---------------------------------------------------------------- UC-100 maintenance
export async function listMaintenance(_req, res) {
  res.json(await maintenance.listMaintenance());
}

export async function createMaintenance(req, res) {
  res.status(201).json(await maintenance.createMaintenance({ body: req.body, actorId: req.user.userId }));
}

export async function updateMaintenance(req, res) {
  res.json(await maintenance.updateMaintenance({ idParam: req.params.id, body: req.body }));
}

export async function endMaintenance(req, res) {
  res.json(await maintenance.endMaintenance({ idParam: req.params.id }));
}

export async function cancelMaintenance(req, res) {
  res.json(await maintenance.cancelMaintenance({ idParam: req.params.id }));
}

export async function currentMaintenance(_req, res) {
  res.json(await maintenance.currentMaintenance());
}

// ---------------------------------------------------------------- password reset requests
export async function listResetRequests(req, res) {
  res.json(await control.listResetRequests({ query: req.query, actor: actorOf(req) }));
}
