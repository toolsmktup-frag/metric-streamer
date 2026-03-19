import { Navigate } from 'react-router-dom';
import { useMyPermissions, ModuleKey } from '@/hooks/useUserPermissions';

interface Props {
  children: React.ReactNode;
  requiredPermission: ModuleKey;
  fallbackPath?: string;
}

export default function PermissionRoute({ children, requiredPermission, fallbackPath = '/leads' }: Props) {
  const { data: permissions, isLoading } = useMyPermissions();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  // If no permissions row exists, allow access (admin/owner case)
  if (!permissions) return <>{children}</>;

  if (!permissions[requiredPermission]) {
    return <Navigate to={fallbackPath} replace />;
  }

  return <>{children}</>;
}
