// Hands Parent Detail data from Update Parent (UC-106) back to Parent Detail (UC-105) so the detail page shows the
// saved result without a new request (the PATCH answers with the same "parent" object as UC-105). A history.back()
// cannot carry router state, hence a one-slot hand-off: set just before leaving the edit page, read on the detail
// page's first render, cleared once shown. Same mechanism as FE-02's pages/students/detailHandoff.js.
let slot = null;

export function handOverParentDetail(detail) {
  slot = detail;
}

// Not destructive, so React StrictMode's double render reads the same value; call clearHandedOverParentDetail() after.
export function peekHandedOverParentDetail(parentId) {
  return slot?.parent?.parentId === parentId ? slot : null;
}

export function clearHandedOverParentDetail() {
  slot = null;
}
