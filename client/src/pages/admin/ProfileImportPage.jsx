import { downloadImportTemplate, importAccounts, previewImport } from '../../api/admin.js';
import ImportAccountsPage, { IMPORT_TYPES } from './ImportAccountsPage.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { listOf, PROFILE_KINDS } from './profileKinds.js';

// UC-96 Import Accounts opened from a System Admin profile page (22/11/2026): same page and endpoints, with the
// account type fixed to the page's role. School Manager (23/11/2026) opens it from their student and parent lists.
export default function ProfileImportPage({ kind }) {
  const { activeRole } = useAuth();
  const profile = PROFILE_KINDS[kind];
  const config = {
    types: IMPORT_TYPES.filter((t) => t.value === profile.role),
    defaultType: profile.role,
    back: listOf(kind, activeRole),
    title: `Nhập ${profile.label.toLowerCase()} từ file`,
    intro: `Tạo nhiều tài khoản ${profile.label.toLowerCase()} cùng lúc từ file Excel hoặc CSV. Hệ thống kiểm tra từng dòng trước khi lưu.`,
    api: { downloadTemplate: downloadImportTemplate, preview: previewImport, importFile: importAccounts },
  };
  return <ImportAccountsPage config={config} />;
}
