import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { formatCurrency } from '@/lib/formatters';
import { useMetaDemographics } from '@/hooks/useMetaData';
import { Users } from 'lucide-react';

export default function DemograficosSection() {
  const { data, isLoading } = useMetaDemographics();

  const ageData = data?.ageData || [];
  const genderData = data?.genderData || [];
  const noData = ageData.length === 0 && genderData.length === 0 && !isLoading;

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
        <Users className="h-4 w-4 text-primary" />
        Demográficos
      </h3>

      {noData && (
        <div className="rounded-lg border border-border bg-card p-6 text-center text-sm text-muted-foreground">
          Nenhum dado demográfico encontrado.
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-lg border border-border bg-card p-4">
          <h4 className="text-xs font-semibold text-muted-foreground mb-4">Gasto por Faixa Etária</h4>
          {ageData.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={ageData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(214, 20%, 90%)" />
                <XAxis dataKey="age" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `R$${v}`} />
                <Tooltip formatter={(v: number) => [formatCurrency(v), 'Gasto']} />
                <Bar dataKey="spend" fill="hsl(152, 60%, 42%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[280px] text-sm text-muted-foreground">Sem dados</div>
          )}
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <h4 className="text-xs font-semibold text-muted-foreground mb-4">Gasto por Gênero</h4>
          {genderData.length > 0 ? (
            <div className="flex items-center justify-center gap-8">
              <ResponsiveContainer width={200} height={200}>
                <PieChart>
                  <Pie data={genderData} cx="50%" cy="50%" innerRadius={55} outerRadius={80} dataKey="value" strokeWidth={2}>
                    {genderData.map((entry: any, i: number) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number) => [formatCurrency(v), 'Gasto']} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2">
                {genderData.map((g: any) => (
                  <div key={g.name} className="flex items-center gap-2 text-sm">
                    <span className="h-3 w-3 rounded-full" style={{ backgroundColor: g.color }} />
                    <span>{g.name}</span>
                    <span className="font-mono-value ml-2">{formatCurrency(g.value)}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-[200px] text-sm text-muted-foreground">Sem dados</div>
          )}
        </div>
      </div>

      {ageData.length > 0 && (
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-table-header border-b border-border">
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase">Faixa Etária</th>
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase">Gasto</th>
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase">Vendas</th>
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase">CPA</th>
              </tr>
            </thead>
            <tbody>
              {ageData.map((row: any) => (
                <tr key={row.age} className="border-b border-border hover:bg-table-hover">
                  <td className="px-3 py-2.5 font-medium">{row.age}</td>
                  <td className="px-3 py-2.5 font-mono-value">{formatCurrency(row.spend)}</td>
                  <td className="px-3 py-2.5 font-mono-value">{row.sales}</td>
                  <td className="px-3 py-2.5 font-mono-value">{row.sales > 0 ? formatCurrency(row.spend / row.sales) : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
