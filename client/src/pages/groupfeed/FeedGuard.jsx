import { Outlet, useOutletContext } from 'react-router-dom';
import GroupPendingTab from '../groups/GroupPendingTab.jsx';
import { groupHasFeed } from '../groups/groupLabels.js';

// FE-05: parent route of every feed screen (SCR-35..SCR-38) inside GroupLayout. Chat-only groups and the School
// Manager in a class group (canSeeContent false, business-rules §2) get the locked placeholder; the server refuses
// them too. The group (g) is handed on to the feed pages unchanged.
export default function FeedGuard() {
  const g = useOutletContext();
  if (!g.canSeeContent || !groupHasFeed(g.groupType)) return <GroupPendingTab kind="feed" />;
  return <Outlet context={g} />;
}
