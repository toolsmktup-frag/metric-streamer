import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { formatCurrency } from '@/lib/formatters';
import { useMetaGeo } from '@/hooks/useMetaData';
import { Globe } from 'lucide-react';

export default function GeograficoSection() {
  const { data: countryData = [], isLoading } = useMetaGeo();

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
        <Globe className="h-4 w-4 text-primary" />
        Geográfico
      </h3>

      {countryData.length === 0 && !isLoading && (
        <div className="rounded-lg border border-border bg-card p-6 text-center text-sm text-muted-foreground">
          Nenhum dado geográfico encontrado.
        </div>
      )}

      {countryData.length > 0 && (
        <>
          <div className="rounded-lg border border-border bg-card p-4">
            <h4 className="text-xs font-semibold text-muted-foreground mb-4">Top Países por Gasto</h4>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={countryData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(214, 20%, 90%)" />
                <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `R$${v}`} />
                <YAxis type="category" dataKey="country" tick={{ fontSize: 12 }} width={100} />
                <Tooltip formatter={(v: number) => [formatCurrency(v), 'Gasto']} />
                <Bar dataKey="spend" fill="hsl(152, 60%, 42%)" radius={[0, 4, 4, 0]} barSize={20} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="rounded-lg border border-border bg-card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-table-header border-b border-border">
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase">País</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase">Gasto</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase">Vendas</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase">Impressões</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase">CPA</th>
                </tr>
              </thead>
              <tbody>
                {countryData.map((row: any) => (
                  <tr key={row.country} className="border-b border-border hover:bg-table-hover">
                    <td className="px-3 py-2.5 font-medium">{row.country}</td>
                    <td className="px-3 py-2.5 font-mono-value">{formatCurrency(row.spend)}</td>
                    <td className="px-3 py-2.5 font-mono-value">{row.sales}</td>
                    <td className="px-3 py-2.5 font-mono-value">{row.impressions.toLocaleString('pt-BR')}</td>
                    <td className="px-3 py-2.5 font-mono-value">{row.sales > 0 ? formatCurrency(row.spend / row.sales) : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
