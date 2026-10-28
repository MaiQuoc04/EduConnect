import { useCallback, useEffect, useState } from 'react';
import { getTeacher } from '../../api/teachers.js';
import { errorText } from '../../messages.js';

// SCR-14: loads one teacher; `week` (YYYY-MM-DD, any day of the week) selects the schedule week.
export function useTeacherDetail(teacherId) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [error, setError] = useState(null);
  const [week, setWeek] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const result = await getTeacher(teacherId, { week });
      setData(result);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setLoading(false);
      setScheduleLoading(false);
    }
  }, [teacherId, week]);

  useEffect(() => { load(); }, [load]);

  // A new week only refreshes the schedule card (the rest of the page stays on screen).
  function changeWeek(value) {
    if (value === week) return;
    setScheduleLoading(true);
    setWeek(value);
  }

  return { data, loading, scheduleLoading, error, changeWeek, reload: load };
}
