import * as departmentService from './department.service.js';
import { departmentBody, departmentIdParam } from './teacher.validation.js';

// UC-114 Manage Departments – School Manager.

// GET /api/v1/departments
export async function list(_req, res) {
  res.json(await departmentService.listDepartments());
}

// POST /api/v1/departments  { name, subjectIds }
export async function create(req, res) {
  res.status(201).json(await departmentService.createDepartment(departmentBody(req, { partial: false })));
}

// PATCH /api/v1/departments/:id  { name?, subjectIds? }
export async function update(req, res) {
  res.json(await departmentService.updateDepartment(departmentIdParam(req), departmentBody(req, { partial: true })));
}

// DELETE /api/v1/departments/:id  (soft delete)
export async function remove(req, res) {
  await departmentService.deleteDepartment(departmentIdParam(req));
  res.status(204).end();
}
