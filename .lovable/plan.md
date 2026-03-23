

## Issues Found

### Issue 1: `/lead-campaigns` blank page (production)
The page renders completely white -- no sidebar, no content. This indicates the component is crashing during render. The `LeadCampaignsPage` uses `useCurrentUserRole` which queries `user_profiles.role`, `useMyFunnelAccess` which queries `lead_funnel_access`, and `useLeadCampaigns` which queries `lead_campaigns`. If any of these tables/columns are missing or RLS blocks access, the hook throws and the entire page crashes with no error boundary to catch it.

### Issue 2: WhatsApp navigation crash
When navigating from `/whatsapp` (uses `ProtectedFullscreen` -- no `AppLayout`) back to a funnel page (uses `Protected` -- with `AppLayout`), the full re-mount of `AppLayout` and its dependent hooks can cause a brief crash, resulting in a blank page that requires a manual refresh.

---

## Plan

### Step 1: Add error boundary protection to LeadCampaignsPage
Wrap the page content in a try/catch-safe pattern. Add fallback error states to the hooks (`useLeadCampaigns`, `useMyFunnelAccess`, `useCurrentUserRole`) so that if any query fails, the page still renders with a meaningful error message instead of going blank.

**File:** `src/pages/LeadCampaigns.tsx`
- Add error handling: check `isError` from each hook and display an error message
- Ensure the page renders the layout (header, empty state) even when queries fail

### Step 2: Fix WhatsApp back-navigation crash
The WhatsApp page uses `ProtectedFullscreen` (no layout), while funnel pages use `Protected` (with `AppLayout`). When React re-mounts `AppLayout` after it was unmounted, hooks inside may fail transiently.

**File:** `src/pages/WhatsAppChat.tsx`
- Add `AppLayout` wrapper (with sidebar) to the WhatsApp page via the `Protected` route instead of `ProtectedFullscreen`, or
- Use `window.location.href` for navigation back to funnel pages to force a clean load

**File:** `src/App.tsx`
- Change WhatsApp route from `ProtectedFullscreen` to `Protected` so it shares the same layout shell, preventing unmount/remount issues

### Step 3: Add global React Error Boundary
Create a reusable `ErrorBoundary` component to prevent blank screens across the app.

**File:** `src/components/ErrorBoundary.tsx` (new)
- Class component that catches render errors
- Shows a "Something went wrong" message with a retry button

**File:** `src/App.tsx`
- Wrap route contents with the ErrorBoundary

---

### Technical Details

The blank page is almost certainly caused by an unhandled promise rejection in one of the hooks. React Query's default behavior when `throwOnError` is not set is to NOT throw during render, so the issue is more likely in the `useMemo` blocks that process `myAccess` or `visibleFunnels` -- if the data shape is unexpected (e.g., missing `campaign_id` column), the `.filter()` or `.some()` calls could throw.

The WhatsApp navigation issue happens because `ProtectedFullscreen` completely unmounts `AppLayout`, and when navigating back, `AppLayout` remounts and re-runs all its initialization hooks simultaneously, which can cause a race condition.

