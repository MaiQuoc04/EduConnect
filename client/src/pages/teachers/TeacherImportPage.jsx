import { downloadTeacherImportTemplate, importTeachers, previewTeacherImport } from '../../api/teachers.js';
import ImportAccountsPage, { IMPORT_TYPES } from '../admin/ImportAccountsPage.jsx';

// UC-116 Import Teachers (FE-03, School Manager, agreed 07/11/2026): FE-13's import page (UC-96) with the account
// type fixed to Teacher and the School Manager endpoints under /teachers/import. Same file, checks, preview and
// one-time passwords as UC-96.
const TEACHER_IMPORT = {
  types: IMPORT_TYPES.filter((t) => t.value === 'TEACHER'),
  defaultType: 'TEACHER',
  back: { to: '/teachers', label: 'Giáo viên' },
  title: 'Nhập giáo viên từ file',
  intro:
    'Tạo tài khoản cho nhiều giáo viên cùng lúc từ file Excel hoặc CSV. Cột “Tổ chuyên môn” ghi đúng tên một tổ trong danh sách hoặc để trống; môn chuyên môn gán sau ở hồ sơ từng giáo viên.',
  api: { downloadTemplate: downloadTeacherImportTemplate, preview: previewTeacherImport, importFile: importTeachers },
};

export default function TeacherImportPage() {
  return <ImportAccountsPage config={TEACHER_IMPORT} />;
}
