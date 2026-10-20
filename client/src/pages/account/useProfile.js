import { useEffect, useState } from 'react';
import { api } from '../../api/client.js';
import { errorText } from '../../messages.js';

// Loads GET /account/profile (UC-04) for SCR-03 and SCR-04.
export function useProfile() {
  const [state, setState] = useState({ loading: true, data: null, error: '' });
  useEffect(() => {
    let alive = true;
    api
      .get('/account/profile')
      .then(({ data }) => alive && setState({ loading: false, data, error: '' }))
      .catch((err) => alive && setState({ loading: false, data: null, error: errorText(err) }));
    return () => {
      alive = false;
    };
  }, []);
  return state;
}
