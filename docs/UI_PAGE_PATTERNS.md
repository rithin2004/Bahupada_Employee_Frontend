# UI Page Patterns (Mandatory)

This document defines the baseline UI patterns for all admin/employee data pages.

## 1. Page Structure

- Use `AppShell` with correct `role` and `activeKey`.
- Keep module header compact:
  - page title
  - one-line description
- Primary content must be inside a `Card` with:
  - `CardHeader` for title/context
  - `CardContent` for controls + table + pagination

## 2. Search Pattern

- Show search input at top of the table card.
- Include explicit Search action (`Search` button or Enter submit).
- Search should reset to page 1.
- Preserve search query in URL or persisted page state when applicable.

## 3. Table Pattern

- Use shared table components:
  - `Table`, `TableHeader`, `TableBody`, `TableRow`, `TableHead`, `TableCell`
- Keep column order stable.
- Include clear empty state row (`No records found`).
- Support row selection/edit/delete where module requires it.

## 4. Pagination Pattern

- Use shared footer component: `PaginationFooter` for client pages.
- Server pages must match same UX:
  - `First`, `Previous`, `Next`, `Last`
  - page indicator (`Page X of Y`)
  - page size selector where relevant
- Show pagination controls only when needed (e.g. more than one page).
- Persist page number and page size across tab switches and revisits.

## 5. Loading Skeleton Pattern

- Every page route fetching data must provide `loading.tsx`.
- Loading layout should mirror final table layout:
  - header skeleton
  - search row skeleton
  - table header + row skeletons
- Do not show unrelated large summary boxes in loading state.
- Keep skeleton visible and readable in both light and dark themes.

## 6. State Management Pattern (Redux)

- Use Redux as source of truth for shared/persisted UI state.
- Persist per-page pagination state (page + pageSize) via keyed slice/hooks.
- Cache GET responses in Redux to reduce redundant calls on tab switch.
- Invalidate cache after write operations (POST/PATCH/DELETE).
- Avoid local state duplication when the value is shared across pages/tabs.

## 7. Performance Pattern

- Avoid loading all pages just to jump to last page.
- Use backend pagination (`page`, `page_size`, `total_pages`) directly.
- Keep request/response payloads bounded by page size.
- Log API latency in browser console for debugging (`[api:network] ... ms`).

## 8. Mobile Responsiveness Pattern

- Sidebar must collapse to menu button on mobile.
- Sidebar opens only on click and must have close button + overlay close.
- Search/actions should stack on small screens (`flex-col`) and align inline on larger screens.
- Tables should remain usable on smaller widths (scroll/compact spacing as needed).

## Implementation Checklist (Before PR/Merge)

- [ ] Search exists and works.
- [ ] Table exists with proper empty state.
- [ ] Pagination exists with first/prev/next/last behavior.
- [ ] Pagination state persists (Redux).
- [ ] Loading skeleton exists and matches table layout.
- [ ] No redundant API calls on tab switch.
- [ ] Mobile sidebar/menu behavior is correct.
