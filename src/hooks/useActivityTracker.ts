import { useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

const HEARTBEAT_INTERVAL = 60_000; // 1 minute
const IDLE_TIMEOUT = 120_000; // 2 minutes of inactivity = idle

/**
 * Tracks user activity by sending heartbeat pings every 60 seconds
 * while the user is actively interacting with the platform.
 */
export function useActivityTracker() {
  const lastActivity = useRef(Date.now());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const markActive = useCallback(() => {
    lastActivity.current = Date.now();
  }, []);

  useEffect(() => {
    // Listen for user interaction events
    const events = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];
    events.forEach(e => window.addEventListener(e, markActive, { passive: true }));

    const sendHeartbeat = async () => {
      // Don't send if idle
      if (Date.now() - lastActivity.current > IDLE_TIMEOUT) return;

      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        // Get org id
        const { data: orgId } = await (supabase as any).rpc('get_user_org_id');
        if (!orgId) return;

        await (supabase as any)
          .from('user_activity_logs')
          .insert({
            user_id: user.id,
            organization_id: orgId,
            active_at: new Date().toISOString(),
            page_path: window.location.pathname,
          });
      } catch {
        // Silent fail - best effort tracking
      }
    };

    // Send initial heartbeat
    sendHeartbeat();

    // Set up interval
    intervalRef.current = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL);

    return () => {
      events.forEach(e => window.removeEventListener(e, markActive));
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [markActive]);
}
