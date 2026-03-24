import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Zap, Wifi, History } from 'lucide-react';
import WzFlowList from '@/components/wz-automation/WzFlowList';
import WzInstanceManager from '@/components/wz-automation/WzInstanceManager';
import WzExecucoesList from '@/components/wz-automation/WzExecucoesList';

const TABS = [
  { value: 'fluxos', label: 'Fluxos', icon: Zap },
  { value: 'instancias', label: 'Instâncias', icon: Wifi },
  { value: 'execucoes', label: 'Execuções', icon: History },
] as const;

export default function WzAutomacoes() {
  const [searchParams, setSearchParams] = useSearchParams();
  const currentTab = searchParams.get('tab') || 'fluxos';

  const handleTabChange = (value: string) => {
    setSearchParams({ tab: value });
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Zap className="h-6 w-6 text-primary" />
          Automações WhatsApp
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Gerencie fluxos, instâncias e execuções
        </p>
      </div>

      <Tabs value={currentTab} onValueChange={handleTabChange}>
        <TabsList>
          {TABS.map(({ value, label, icon: Icon }) => (
            <TabsTrigger key={value} value={value} className="gap-2">
              <Icon className="h-4 w-4" />
              {label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="fluxos" className="mt-6">
          <WzFlowList embedded />
        </TabsContent>

        <TabsContent value="instancias" className="mt-6">
          <WzInstanceManager embedded />
        </TabsContent>

        <TabsContent value="execucoes" className="mt-6">
          <WzExecucoesList />
        </TabsContent>
      </Tabs>
    </div>
  );
}
