import { useCallback, useEffect, useRef, useState } from 'react';
import { getTeachers } from '../../api/teachers.js';
import { errorText } from '../../messages.js';
import { cleanSearch } from '../../utils/teacherValidation.js';

const PAGE_SIZE = 10;

export function useTeachers() {
  const [teachers, setTeachers] = useState([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [search, setSearch] = useState('');
  const [filterSubject, setFilterSubject] = useState('');
  const [filterHomeroom, setFilterHomeroom] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  // Debounce search
  const searchDebounce = useRef(null);
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    clearTimeout(searchDebounce.current);
    // cleaned like the server: NFC, no invisible characters, single spaces, at most 100 characters
    searchDebounce.current = setTimeout(() => setDebouncedSearch(cleanSearch(search)), 300);
    return () => clearTimeout(searchDebounce.current);
  }, [search]);

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getTeachers({
        page,
        limit: PAGE_SIZE,
        search: debouncedSearch,
        subject: filterSubject,
        homeroom: filterHomeroom,
        status: filterStatus,
      });
      setTeachers(data.teachers);
      setTotal(data.total);
      setTotalPages(data.totalPages);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch, filterSubject, filterHomeroom, filterStatus]);

  useEffect(() => { fetch(); }, [fetch]);

  function resetFilters() {
    setSearch('');
    setFilterSubject('');
    setFilterHomeroom('');
    setFilterStatus('');
    setPage(1);
  }

  return {
    teachers, total, totalPages, page, setPage,
    loading, error,
    search, setSearch,
    filterSubject, setFilterSubject,
    filterHomeroom, setFilterHomeroom,
    filterStatus, setFilterStatus,
    resetFilters,
  };
}
