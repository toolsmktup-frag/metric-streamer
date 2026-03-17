import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { formatCurrency } from '@/lib/formatters';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useMetaDevices } from '@/hooks/useMetaData';

function DataSection({ data }: { data: { name: string; spend: number; sales: number; impressions: number }[] }) {
  if (data.length === 0) {
    return <div className="rounded-lg border border-border bg-card p-6 text-center text-sm text-muted-foreground">Sem dados</div>;
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-card p-4">
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(214, 20%, 90%)" />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `R$${v}`} />
            <Tooltip formatter={(v: number) => [formatCurrency(v), 'Gasto']} />
            <Bar dataKey="spend" fill="hsl(152, 60%, 42%)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-table-header border-b border-border">
              <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase">Nome</th>
              <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase">Gasto</th>
              <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase">Vendas</th>
              <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase">Impressões</th>
            </tr>
          </thead>
          <tbody>
            {data.map(row => (
              <tr key={row.name} className="border-b border-border hover:bg-table-hover">
                <td className="px-3 py-2.5 font-medium">{row.name}</td>
                <td className="px-3 py-2.5 font-mono-value">{formatCurrency(row.spend)}</td>
                <td className="px-3 py-2.5 font-mono-value">{row.sales}</td>
                <td className="px-3 py-2.5 font-mono-value">{row.impressions.toLocaleString('pt-BR')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function Dispositivos() {
  const { data, isLoading } = useMetaDevices();

  const platformData = data?.platformData || [];
  const positionData = data?.positionData || [];
  const deviceData = data?.deviceData || [];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-foreground">Dispositivos & Plataformas</h1>
      <Tabs defaultValue="platform">
        <TabsList>
          <TabsTrigger value="platform">Plataforma</TabsTrigger>
          <TabsTrigger value="position">Posição</TabsTrigger>
          <TabsTrigger value="device">Dispositivo</TabsTrigger>
        </TabsList>
        <TabsContent value="platform"><DataSection data={platformData} /></TabsContent>
        <TabsContent value="position"><DataSection data={positionData} /></TabsContent>
        <TabsContent value="device"><DataSection data={deviceData} /></TabsContent>
      </Tabs>
    </div>
  );
}
