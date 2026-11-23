import { useState } from 'react';
import { Link } from 'react-router-dom';
import { exportAccounts } from '../../api/admin.js';
import Icon from '../../components/Icon.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { errorText } from '../../messages.js';
import { PROFILE_KINDS } from './profileKinds.js';

// FE-13 (owner: Linh), 23/11/2026: account buttons for the School Manager's student, teacher and parent lists
// (FE-02, FE-03, FE-14): "Thêm" (UC-95), "Nhập từ file" (UC-96), "Xuất tài khoản" (UC-98, every account of that type,
// same file as System Admin's). Teachers keep FE-03's own import (UC-116) and export (UC-115): only "Thêm" there.
//   <SchoolAccountButtons kind="students" />
export default function SchoolAccountButtons({ kind, create = true, importFile = true, exportFile = true }) {
  const toast = useToast();
  const [exporting, setExporting] = useState(false);
  const profile = PROFILE_KINDS[kind];
  const label = profile.label.toLowerCase();

  async function handleExport() {
    setExporting(true);
    try {
      await exportAccounts({ role: profile.role });
    } catch (err) {
      toast(errorText(err), { type: 'error' });
    } finally {
      setExporting(false);
    }
  }

  return (
    <>
      {exportFile && (
        <button type="button" className="btn btn-secondary" onClick={handleExport} disabled={exporting} title={`Xuất mọi tài khoản ${label}`}>
          <Icon name="download" size="sm" />
          {exporting ? 'Đang xuất…' : 'Xuất tài khoản'}
        </button>
      )}
      {importFile && (
        <Link to={`${profile.school.to}/import`} className="btn btn-secondary">
          <Icon name="upload_file" size="sm" />
          Nhập từ file
        </Link>
      )}
      {create && (
        <Link to={`${profile.school.to}/new`} className="btn btn-primary">
          <Icon name="person_add" size="sm" />
          Thêm {label}
        </Link>
      )}
    </>
  );
}
