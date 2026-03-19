import React, { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { LogOut, Clock, ShieldX } from 'lucide-react';

type RouteState = 'loading' | 'authed' | 'unauthed' | 'pending' | 'blocked';

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<RouteState>('loading');

  useEffect(() => {
    let cancelled = false;

    async function checkAccess(userId: string) {
      const { data } = await (supabase as any)
        .from('user_profiles')
        .select('status')
        .eq('id', userId)
        .maybeSingle();

      if (cancelled) return;

      const status = data?.status;
      if (status === 'active') {
        setState('authed');
      } else if (status === 'blocked') {
        setState('blocked');
      } else {
        // pending or no profile yet
        setState('pending');
      }
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        setState('unauthed');
      } else {
        checkAccess(session.user.id);
      }
    });

    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        setState('unauthed');
      } else {
        checkAccess(data.session.user.id);
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setState('unauthed');
  };

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

  if (state === 'pending') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4 max-w-md px-6">
          <div className="mx-auto h-16 w-16 rounded-full bg-amber-500/10 flex items-center justify-center">
            <Clock className="h-8 w-8 text-amber-500" />
          </div>
          <h1 className="text-xl font-bold text-foreground">Aguardando aprovação</h1>
          <p className="text-sm text-muted-foreground">
            Sua conta foi criada com sucesso! Um administrador precisa aprovar seu acesso antes que você possa utilizar o sistema.
          </p>
          <Button variant="outline" onClick={handleLogout} className="gap-2">
            <LogOut className="h-4 w-4" />
            Sair
          </Button>
        </div>
      </div>
    );
  }

  if (state === 'blocked') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4 max-w-md px-6">
          <div className="mx-auto h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center">
            <ShieldX className="h-8 w-8 text-destructive" />
          </div>
          <h1 className="text-xl font-bold text-foreground">Acesso bloqueado</h1>
          <p className="text-sm text-muted-foreground">
            Seu acesso foi desativado pelo administrador. Entre em contato caso acredite que isso seja um erro.
          </p>
          <Button variant="outline" onClick={handleLogout} className="gap-2">
            <LogOut className="h-4 w-4" />
            Sair
          </Button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
