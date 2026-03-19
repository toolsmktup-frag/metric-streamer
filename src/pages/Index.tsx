import { Navigate } from 'react-router-dom';
import { useMyPermissions } from '@/hooks/useUserPermissions';

const Index = () => {
  const { data: permissions, isLoading } = useMyPermissions();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  // If no permissions row or mod_resumo enabled, go to resumo
  if (!permissions || permissions.mod_resumo) {
    return <Navigate to="/resumo" replace />;
  }

  // Fallback to first available module
  if (permissions.mod_leads) return <Navigate to="/leads" replace />;
  if (permissions.mod_trafego) return <Navigate to="/campanhas" replace />;
  if (permissions.mod_anuncios) return <Navigate to="/criativos" replace />;
  if (permissions.mod_whatsapp) return <Navigate to="/whatsapp" replace />;

  return <Navigate to="/resumo" replace />;
};

export default Index;
