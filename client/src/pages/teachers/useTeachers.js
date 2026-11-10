import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getTeachers } from '../../api/teachers.js';
import { errorText } from '../../messages.js';
import { cleanSearch } from '../../utils/teacherValidation.js';

const PAGE_SIZE = 10;

// Filters start from the address (?department=, ?status=, ?homeroom=, ?subject=) so other screens can link to a
// filtered list, e.g. the Departments screen (UC-114) → its teachers.
export function useTeachers() {
  const [params] = useSearchParams();
  const [teachers, setTeachers] = useState([]);
  const [stats, setStats] = useState(null);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [search, setSearch] = useState('');
  const [filterSubject, setFilterSubject] = useState(() => params.get('subject') ?? '');
  const [filterDepartment, setFilterDepartment] = useState(() => params.get('department') ?? '');
  const [filterHomeroom, setFilterHomeroom] = useState(() => params.get('homeroom') ?? '');
  const [filterStatus, setFilterStatus] = useState(() => params.get('status') ?? '');

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
        department: filterDepartment,
        homeroom: filterHomeroom,
        status: filterStatus,
      });
      setTeachers(data.teachers);
      setTotal(data.total);
      setTotalPages(data.totalPages);
      setStats(data.stats ?? null);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch, filterSubject, filterDepartment, filterHomeroom, filterStatus]);

  useEffect(() => { fetch(); }, [fetch]);

  function resetFilters() {
    setSearch('');
    setFilterSubject('');
    setFilterDepartment('');
    setFilterHomeroom('');
    setFilterStatus('');
    setPage(1);
  }

  // Filters as sent to the API – the export (UC-115) uses the same ones.
  const filters = { search: debouncedSearch, subject: filterSubject, department: filterDepartment, homeroom: filterHomeroom, status: filterStatus };

  return {
    teachers, total, totalPages, page, setPage, filters, stats,
    loading, error,
    search, setSearch,
    filterSubject, setFilterSubject,
    filterDepartment, setFilterDepartment,
    filterHomeroom, setFilterHomeroom,
    filterStatus, setFilterStatus,
    resetFilters,
  };
}
