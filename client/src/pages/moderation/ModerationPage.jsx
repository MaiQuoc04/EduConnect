import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { FeedTabs } from '../../components/feed/Feed.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useModerationBadge } from './useModerationBadge.js';
import ByClassTab from './ByClassTab.jsx';
import MessageReportsTab from './MessageReportsTab.jsx';
import RulesTab from './RulesTab.jsx';
import ViolatorsTab from './ViolatorsTab.jsx';
import { EMPTY_FILTERS } from './StatsFilters.jsx';
import '../../components/feed/feed.css';
import './ModerationPage.css';

// "Quy chuẩn cộng đồng" (moderation phase 6, FE-08 owner Anh, docs/moderation-plan.md): one page, four tabs, School
// Manager only (route + every API). Tables and filters only – no dashboard (docs/screens.md). The filters are shared by
// the first three tabs, so switching tabs keeps them.

const TABS = [
  { key: 'violators', label: 'Người vi phạm' },
  { key: 'classes', label: 'Theo lớp' },
  { key: 'rules', label: 'Quy tắc' },
  { key: 'reports', label: 'Báo cáo tin nhắn' },
];

export default function ModerationPage() {
  const [params, setParams] = useSearchParams();
  const tab = TABS.some((t) => t.key === params.get('tab')) ? params.get('tab') : 'violators';
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const { activeRole } = useAuth();
  const badge = useModerationBadge(activeRole === 'SCHOOL_MANAGER');

  return (
    <div className="moderation-page">
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <span>EduConnect</span>/<span>Trường</span>/<span className="current">Quy chuẩn cộng đồng</span>
      </nav>
      <div className="page-header">
        <div>
          <h1 className="headline-lg">Quy chuẩn cộng đồng</h1>
          <p>
            Vi phạm được phát hiện tự động hoặc qua báo cáo, bộ quy tắc kiểm tự động và các báo cáo tin nhắn đang chờ xử lý.
          </p>
        </div>
      </div>
      <FeedTabs
        tabs={TABS.map((t) => ({ ...t, count: t.key === 'reports' ? badge.pendingCount : 0 }))}
        active={tab}
        onChange={(key) => setParams(key === 'violators' ? {} : { tab: key }, { replace: true })}
        label="Mục của trang"
      />
      <div className="mod-body">
        {tab === 'violators' && <ViolatorsTab filters={filters} onFilters={setFilters} />}
        {tab === 'classes' && <ByClassTab filters={filters} onFilters={setFilters} />}
        {tab === 'rules' && <RulesTab filters={filters} onFilters={setFilters} />}
        {tab === 'reports' && <MessageReportsTab />}
      </div>
    </div>
  );
}
