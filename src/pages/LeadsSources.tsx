import React from 'react';
import { useLeadStats } from '@/hooks/useAllLeads';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const LeadsSources: React.FC = () => {
  const { data: stats, isLoading } = useLeadStats();

  if (isLoading) return <div className="p-6 text-muted-foreground">Carregando...</div>;
  if (!stats) return <div className="p-6 text-muted-foreground">Sem dados disponíveis.</div>;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Fontes / UTMs</h1>

      {/* Chart by source */}
      <Card>
        <CardHeader><CardTitle className="text-base">Leads por Fonte</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={stats.bySource.slice(0, 12)}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="source" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} name="Leads" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Table source × medium */}
      <Card>
        <CardHeader><CardTitle className="text-base">Detalhamento Source × Medium</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fonte (utm_source)</TableHead>
                <TableHead>Meio (utm_medium)</TableHead>
                <TableHead className="text-right">Leads</TableHead>
                <TableHead className="text-right">% do Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stats.bySourceMedium.map((row, i) => (
                <TableRow key={i}>
                  <TableCell className="font-medium">{row.source}</TableCell>
                  <TableCell>{row.medium}</TableCell>
                  <TableCell className="text-right">{row.count}</TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {stats.total > 0 ? ((row.count / stats.total) * 100).toFixed(1) : 0}%
                  </TableCell>
                </TableRow>
              ))}
              {stats.bySourceMedium.length === 0 && (
                <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">Sem dados de UTM.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default LeadsSources;
