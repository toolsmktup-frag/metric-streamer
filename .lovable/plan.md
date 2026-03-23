

## Diagnostic: Blank page for non-admin users

### Root Cause

The `user_profiles` table has TWO SELECT policies:
1. **"User reads own profile"** - `USING (id = auth.uid())` -- user can read their OWN row only
2. **"Admin reads org profiles"** - requires `get_user_role() = 'admin'` -- only admins can read OTHER profiles

The `lead_funnel_access` table has **NO documented migration** -- it was likely created manually or via an earlier session. If the RLS policies on this table are restrictive (or the table doesn't exist), the `useMyFunnelAccess` hook will throw an error, triggering the `hasError` fallback or crashing the page.

Additionally, the `useCurrentUserRole` hook queries `user_profiles.role` for the current user. This works fine (policy #1 allows it). But the real issue is that **`useLeadCampaigns` and `useLeadFunnels` both use `get_user_org_id()`** which queries `user_profiles` internally -- if the SECURITY DEFINER function `get_user_org_id()` returns NULL for some reason, ALL queries to `lead_campaigns`, `lead_funnels`, etc. will return empty results silently (RLS filters out everything).

The **WhatsApp bug** is separate: the WhatsApp page uses `ProtectedFullscreen` (no `AppLayout`), so navigating from WhatsApp to any other page forces a full remount of `AppLayout` + all its hooks simultaneously, which can cause a transient crash.

### Plan

#### Step 1: Create migration for `lead_funnel_access` table with proper RLS
Create a migration that ensures the `lead_funnel_access` table exists with correct RLS policies allowing:
- Users to SELECT their own access records (`user_id = auth.uid()`)
- Admins to SELECT/INSERT/DELETE all records in their org
- This is the most likely cause of the crash for non-admin users

**File:** New migration SQL

#### Step 2: Add `mod_leads` permission check to `/lead-campaigns` route
The `/lead-campaigns` route currently has NO `PermissionRoute` wrapper in `App.tsx`. A user without `mod_leads` permission can still navigate there directly. Add `PermissionRoute` with `requiredPermission="mod_leads"`.

**File:** `src/App.tsx`

#### Step 3: Fix WhatsApp route to use shared layout
Change the WhatsApp route from `ProtectedFullscreen` to `Protected` so it shares the `AppLayout` shell, preventing the unmount/remount crash when navigating away.

**File:** `src/App.tsx`
- Change: `<ProtectedFullscreen>` to `<Protected>` for WhatsApp route

**File:** `src/pages/WhatsAppChat.tsx`
- The page already handles its own full-width layout, so it should work inside `AppLayout` with minimal adjustment (may need to override padding/margins)

#### Step 4: Defensive error handling in hooks
Make the hooks used by LeadCampaigns more resilient by wrapping the Supabase calls in try/catch and returning empty arrays on failure instead of throwing.

**Files:** `src/hooks/useLeadFunnelAccess.ts`, `src/hooks/useLeadCampaigns.ts`, `src/hooks/useLeadFunnels.ts`

---

### Technical Details

The `get_user_org_id()` function is SECURITY DEFINER and reads `user_profiles.organization_id`. If the user's profile doesn't have an `organization_id` set, all org-scoped RLS policies evaluate to `false`, returning zero rows. This wouldn't cause a crash (just empty data), but if `lead_funnel_access` table doesn't exist or has broken RLS, the `useMyFunnelAccess` hook throws an unhandled error that crashes the component before the error boundary can catch it (React Query catches async errors but the component might still reference undefined data in a `useMemo`).

The fix ensures: (1) the table exists with correct policies, (2) routes are protected by permissions, (3) WhatsApp doesn't break layout transitions, (4) hooks never throw in a way that crashes rendering.

