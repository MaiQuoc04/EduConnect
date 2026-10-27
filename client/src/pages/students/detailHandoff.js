// Hands Student Detail data from Update Student (UC-09) back to Student Detail (UC-08) so the detail page shows the
// saved result without a new request. A history.back() cannot carry router state, hence a one-slot hand-off: set
// just before leaving the edit page, read on the detail page's first render, cleared once shown.
let slot = null;

export function handOverDetail(detail) {
  slot = detail;
}

// Not destructive, so React StrictMode's double render reads the same value; call clearHandedOverDetail() after.
export function peekHandedOverDetail(studentId) {
  return slot?.student?.studentId === studentId ? slot : null;
}

export function clearHandedOverDetail() {
  slot = null;
}
