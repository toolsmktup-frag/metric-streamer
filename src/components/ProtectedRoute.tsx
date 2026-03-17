import React, { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<'loading' | 'authed' | 'unauthed'>('loading');

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setState(session ? 'authed' : 'unauthed');
    });

    supabase.auth.getSession().then(({ data }) => {
      setState(data.session ? 'authed' : 'unauthed');
    });

    return () => subscription.unsubscribe();
  }, []);

  if (state === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (state === 'unauthed') {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}
