import React, { useState } from 'react';
import { Wifi, WifiOff, Smartphone, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useWhatsAppInstances, getInstanceDisplayName } from '@/hooks/useWhatsApp';
import InstanceHub from '@/components/whatsapp/InstanceHub';

export default function WzInstanceManager({ embedded = false }: { embedded?: boolean }) {
  const { instances, loading, refetch } = useWhatsAppInstances();
  const [hubOpen, setHubOpen] = useState(false);

  return (
    <div className={embedded ? 'space-y-6' : 'p-6 space-y-6 max-w-4xl mx-auto'}>
      {!embedded && (
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Instâncias WhatsApp</h1>
            <p className="text-sm text-muted-foreground mt-1">
              As mesmas instâncias conectadas no Chat — usadas nas automações
            </p>
          </div>
          <Button onClick={() => setHubOpen(true)} className="gap-2">
            <Settings className="h-4 w-4" />
            Gerenciar Instâncias
          </Button>
        </div>
      )}
      {embedded && (
        <div className="flex justify-end">
          <Button onClick={() => setHubOpen(true)} className="gap-2">
            <Settings className="h-4 w-4" />
            Gerenciar Instâncias
          </Button>
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[1, 2].map(i => (
            <div key={i} className="h-20 rounded-xl border border-border bg-card animate-pulse" />
          ))}
        </div>
      ) : instances.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center mb-4">
            <Wifi className="h-10 w-10 text-primary" />
          </div>
          <h3 className="text-lg font-semibold text-foreground mb-1">Nenhuma instância conectada</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Conecte uma instância no Chat para usá-la nas automações.
          </p>
          <Button onClick={() => setHubOpen(true)} className="gap-2">
            <Settings className="h-4 w-4" /> Gerenciar Instâncias
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {instances.map(inst => {
            const isConnected = inst.status === 'connected';
            return (
              <div
                key={inst.id}
                className="rounded-xl border border-border bg-card p-4 flex items-center gap-4"
              >
                {/* Avatar */}
                <div className="relative shrink-0">
                  {inst.profile_pic_url ? (
                    <img src={inst.profile_pic_url} alt="" className="h-10 w-10 rounded-full object-cover" />
                  ) : (
                    <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                      <Smartphone className="h-5 w-5 text-muted-foreground" />
                    </div>
                  )}
                  <span className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-card ${
                    isConnected ? 'bg-emerald-500' : 'bg-destructive'
                  }`} />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-foreground">{getInstanceDisplayName(inst)}</h3>
                  <p className="text-xs text-muted-foreground truncate">
                    {inst.phone_number || inst.instance_name}
                  </p>
                </div>

                {/* Status badge */}
                <Badge variant={isConnected ? 'default' : 'destructive'} className="text-xs">
                  {isConnected ? 'Conectado' : 'Desconectado'}
                </Badge>
              </div>
            );
          })}
        </div>
      )}

      <InstanceHub
        instances={instances}
        open={hubOpen}
        onOpenChange={setHubOpen}
        onRefetch={refetch}
      />
    </div>
  );
}
