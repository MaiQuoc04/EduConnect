import { useAuth } from '../../context/AuthContext.jsx';
import ClassAttendancePage from './ClassAttendancePage.jsx';
import StudentAttendancePage from './StudentAttendancePage.jsx';

// /attendance (FE-12): teacher and School Manager take / correct attendance by class (SCR-56 / SCR-52); student and
// parent see their own or their child's attendance (SCR-53..55). The key resets the page on a role switch.
export default function AttendanceHome() {
  const { activeRole } = useAuth();
  const own = activeRole === 'STUDENT' || activeRole === 'PARENT';
  return own ? <StudentAttendancePage key={activeRole} /> : <ClassAttendancePage key={activeRole} />;
}
