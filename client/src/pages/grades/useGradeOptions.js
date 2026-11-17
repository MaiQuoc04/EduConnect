import { useEffect, useState } from 'react';
import { getGradeOptions } from '../../api/grades.js';
import { errorText } from '../../messages.js';

// School years with their semesters, grade levels and the current year / semester (FE-11 pickers).
export default function useGradeOptions() {
  const [state, setState] = useState({ loading: true, data: null, error: '' });
  useEffect(() => {
    let alive = true;
    getGradeOptions()
      .then((data) => alive && setState({ loading: false, data, error: '' }))
      .catch((err) => alive && setState({ loading: false, data: null, error: errorText(err) }));
    return () => {
      alive = false;
    };
  }, []);
  const semesters = state.data?.years.flatMap((y) => y.semesters.map((s) => ({ ...s, yearName: y.yearName, schoolYearId: y.schoolYearId }))) ?? [];
  return { ...state, semesters };
}
