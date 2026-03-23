import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4 p-6">
          <AlertTriangle className="h-12 w-12 text-destructive opacity-60" />
          <h2 className="text-lg font-semibold text-foreground">Algo deu errado</h2>
          <p className="text-sm text-muted-foreground text-center max-w-md">
            Ocorreu um erro inesperado. Tente recarregar a página.
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={this.handleRetry}>
              <RefreshCw className="h-4 w-4 mr-1" /> Tentar novamente
            </Button>
            <Button variant="outline" onClick={() => window.location.reload()}>
              Recarregar página
            </Button>
          </div>
          {this.state.error && (
            <pre className="mt-4 text-xs text-muted-foreground bg-muted p-3 rounded max-w-lg overflow-auto max-h-32">
              {this.state.error.message}
            </pre>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}
