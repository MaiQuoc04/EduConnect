import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api/client.js';
import { errorText } from '../../messages.js';

// GET /school-years (UC-20) for the list on SCR-18. reload() returns the fresh list.
export function useSchoolYears() {
  const [state, setState] = useState({ loading: true, years: [], error: '' });
  const reload = useCallback(async () => {
    try {
      const { data } = await api.get('/school-years');
      setState({ loading: false, years: data, error: '' });
      return data;
    } catch (err) {
      setState({ loading: false, years: [], error: errorText(err) });
      return [];
    }
  }, []);
  useEffect(() => {
    reload();
  }, [reload]);
  return { ...state, reload };
}

// GET /school-years/:id (UC-20): the year, its number of classes and its semesters.
export function useSchoolYear(id, version) {
  const [state, setState] = useState({ loading: false, data: null, error: '' });
  useEffect(() => {
    if (!id) {
      setState({ loading: false, data: null, error: '' });
      return undefined;
    }
    let alive = true;
    setState((s) => ({ ...s, loading: true, error: '' }));
    api
      .get(`/school-years/${id}`)
      .then(({ data }) => alive && setState({ loading: false, data, error: '' }))
      .catch((err) => alive && setState({ loading: false, data: null, error: errorText(err) }));
    return () => {
      alive = false;
    };
  }, [id, version]);
  return state;
}
