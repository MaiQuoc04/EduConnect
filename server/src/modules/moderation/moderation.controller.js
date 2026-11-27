import { sendWorkbook } from '../../utils/excel.js';
import { invalid, jsonBody, optionalEnum, optionalInt, optionalString, parseId } from '../../utils/requestParsers.js';
import * as service from './moderation.service.js';
import * as rules from './rules.service.js';
import * as violations from './violations.service.js';

// Moderation (FE-08, owner Anh, 25/11/2026). Express 5 forwards errors from async handlers.

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;

const messageIdOf = (req) => parseId(req.params.messageId, 'messageId');

// POST /moderation/message-reports { messageId, reason, note? } → 201 (new report) or 200 (already reported: nothing
// changes). Who may: an active member of the chat, checked in the service with FE-06's own checks.
export async function reportMessage(req, res) {
  const result = await service.reportMessage(req.user, service.parseMessageReport(req.body ?? {}));
  res.status(result.created ? 201 : 200).json(result);
}

// GET /moderation/message-reports?status=PENDING|HANDLED&page=&pageSize= (School Manager). Default PENDING.
export async function listMessageReports(req, res) {
  const query = req.query ?? {};
  res.json(
    await service.listMessageReports(req.user, {
      status: optionalEnum(query, 'status', service.QUEUE_STATUSES, 'PENDING'),
      page: optionalInt(query, 'page', { fallback: 1 }),
      pageSize: optionalInt(query, 'pageSize', { max: MAX_PAGE_SIZE, fallback: DEFAULT_PAGE_SIZE }),
    }),
  );
}

// GET /moderation/message-reports/:messageId (School Manager): the reported message alone, not logged.
export async function reportedMessage(req, res) {
  res.json(await service.getReportedMessage(req.user, messageIdOf(req)));
}

// POST /moderation/message-reports/:messageId/context { reason } (School Manager): "Xem hội thoại xung quanh" – 6 + 6,
// logged with the reason.
export async function context(req, res) {
  const body = jsonBody(req, ['reason']);
  res.json(await service.readReportContext(req.user, messageIdOf(req), { reason: body.reason }));
}

// PATCH /moderation/message-reports/:messageId { action: 'HIDE' | 'KEEP', supportNote? } (School Manager).
export async function resolveMessageReport(req, res) {
  const body = jsonBody(req, ['action', 'supportNote']);
  res.json(
    await service.resolveMessageReport(req.user, messageIdOf(req), { action: body.action, supportNote: body.supportNote }),
  );
}

// --- Phase 6: the "Quy chuẩn cộng đồng" screen (School Manager) -----------------------------------------------------

const DATE = /^\d{4}-\d{2}-\d{2}$/;

// A YYYY-MM-DD day that exists (2026-02-30 is refused), or null when not given.
function optionalDate(query, field) {
  const value = optionalString(query, field);
  if (value === undefined || value === '') return null;
  const [y, m, d] = value.split('-').map(Number);
  const day = new Date(Date.UTC(y, m - 1, d));
  if (!DATE.test(value) || day.getUTCFullYear() !== y || day.getUTCMonth() !== m - 1 || day.getUTCDate() !== d) {
    throw invalid(field);
  }
  return value;
}

/**
 * The shared filters of the statistics: from, to (YYYY-MM-DD, default the last 30 days), grade ("10" / "11" / "12"),
 * classId, role, category, contentType (COMMENT | MESSAGE), source (AUTO | REPORT), search (full name, accent-free).
 */
function statsFilter(query = {}) {
  const from = optionalDate(query, 'from');
  const to = optionalDate(query, 'to');
  if (from && to && from > to) throw invalid('from'); // both YYYY-MM-DD: text order is day order
  const grade = optionalString(query, 'grade') || null;
  if (grade && !/^\d{1,2}$/.test(grade)) throw invalid('grade');
  const search = optionalString(query, 'search') || null;
  if (search && [...search].length > 100) throw invalid('search');
  return {
    from,
    to,
    grade,
    classId: query.classId ? parseId(query.classId, 'classId') : null,
    role: optionalEnum(query, 'role', violations.ROLE_FILTERS, null),
    category: optionalEnum(query, 'category', violations.VIOLATION_CATEGORIES, null),
    contentType: optionalEnum(query, 'contentType', violations.CONTENT_TYPE_FILTERS, null),
    source: optionalEnum(query, 'source', violations.SOURCES, null),
    search,
  };
}

const paging = (query = {}) => ({
  page: optionalInt(query, 'page', { fallback: 1 }),
  pageSize: optionalInt(query, 'pageSize', { max: MAX_PAGE_SIZE, fallback: DEFAULT_PAGE_SIZE }),
});
const idOf = (req) => parseId(req.params.id, 'id');

// GET /moderation/violations – tab "Người vi phạm"
export async function listViolators(req, res) {
  res.json(await violations.listViolators(req.user, statsFilter(req.query), paging(req.query)));
}

// GET /moderation/violations/export – the same rows as an .xlsx
export async function exportViolators(req, res) {
  const { workbook, filename } = await violations.exportViolators(req.user, statsFilter(req.query));
  await sendWorkbook(res, workbook, filename);
}

// GET /moderation/violations/by-class – tab "Theo lớp"
export async function listByClass(req, res) {
  res.json(await violations.listByClass(req.user, statsFilter(req.query)));
}

// GET /moderation/violations/users/:userId – one person's history (no content)
export async function userHistory(req, res) {
  res.json(await violations.getUserHistory(req.user, parseId(req.params.userId, 'userId')));
}

// GET /moderation/violations/:id/content – ONE piece of content (logged)
export async function violationContent(req, res) {
  res.json(await violations.getViolationContent(req.user, idOf(req)));
}

// POST /moderation/violations/:id/unhide { reason }
export async function unhide(req, res) {
  const body = jsonBody(req, ['reason']);
  res.json(await violations.unhideViolation(req.user, idOf(req), body));
}

// GET /moderation/message-reports/summary – the menu badge
export async function messageReportSummary(req, res) {
  res.json(await service.getMessageReportSummary(req.user));
}

// GET /moderation/rules?from=&to=
export async function listRules(req, res) {
  const query = req.query ?? {};
  const from = optionalDate(query, 'from');
  const to = optionalDate(query, 'to');
  if (from && to && from > to) throw invalid('from');
  res.json(await rules.listRules(req.user, { from, to }));
}

// POST /moderation/rules { pattern, matchType, accentInsensitive?, category, isActive? }
export async function createRule(req, res) {
  res.status(201).json(await rules.createRule(req.user, req.body ?? {}));
}

// PATCH /moderation/rules/:id { any of the fields }
export async function updateRule(req, res) {
  res.json(await rules.updateRule(req.user, idOf(req), req.body ?? {}));
}

// DELETE /moderation/rules/:id (soft)
export async function deleteRule(req, res) {
  res.json(await rules.deleteRule(req.user, idOf(req)));
}

// POST /moderation/rules/test { text }
export async function testRules(req, res) {
  res.json(await rules.testRules(req.user, jsonBody(req, ['text'])));
}
