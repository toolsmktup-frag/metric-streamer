import React, { useState, useMemo } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
  type RowSelectionState,
} from '@tanstack/react-table';
import { ArrowUpDown, ArrowUp, ArrowDown, ChevronRight } from 'lucide-react';
import { formatCurrency, formatNumber, formatPercent, formatRoas, getRoasColor, getProfitColor } from '@/lib/formatters';
import StatusBadge from './StatusBadge';
import type { Campaign } from '@/hooks/useMockData';

interface PerformanceTableProps {
  data: Campaign[];
  level?: 'campaign' | 'adset' | 'ad';
  onRowClick?: (row: Campaign) => void;
  onRowSelect?: (row: Campaign) => void;
  selectedRowId?: string;
}

const PerformanceTable = React.memo(function PerformanceTable({ data, level = 'campaign', onRowClick, onRowSelect, selectedRowId }: PerformanceTableProps) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  const columns = useMemo<ColumnDef<Campaign>[]>(() => {
    const cols: ColumnDef<Campaign>[] = [
      {
        id: 'select',
        header: ({ table }) => (
          <input
            type="checkbox"
            className="rounded border-border"
            checked={table.getIsAllRowsSelected()}
            onChange={table.getToggleAllRowsSelectedHandler()}
          />
        ),
        cell: ({ row }) => (
          <input
            type="checkbox"
            className="rounded border-border"
            checked={row.getIsSelected()}
            onChange={(e) => {
              e.stopPropagation();
              row.getToggleSelectedHandler()(e);
            }}
          />
        ),
        size: 40,
        enableSorting: false,
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ getValue }) => <StatusBadge status={getValue() as Campaign['status']} />,
        size: 100,
      },
      {
        accessorKey: 'name',
        header: level === 'campaign' ? 'Campanha' : level === 'adset' ? 'Conjunto' : 'Anúncio',
        cell: ({ row, getValue }) => {
          const creative = (row.original as any)?.creative;
          const thumbUrl = creative?.thumbnail_url || creative?.image_url;
          return (
            <div className="flex items-center gap-2">
              {level === 'ad' && thumbUrl && (
                <img
                  src={thumbUrl}
                  alt=""
                  className="h-9 w-9 rounded border border-border object-cover shrink-0"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
              )}
              <span className="font-medium text-foreground truncate block max-w-[280px]" title={getValue() as string}>
                {getValue() as string}
              </span>
              {onRowClick && !onRowSelect && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
            </div>
          );
        },
        size: 300,
      },
      {
        accessorKey: 'spend',
        header: 'Gasto',
        cell: ({ getValue }) => <span className="font-mono-value">{formatCurrency(getValue() as number)}</span>,
        size: 120,
      },
      {
        accessorKey: 'revenue',
        header: 'Faturamento',
        cell: ({ getValue }) => <span className="font-mono-value">{formatCurrency(getValue() as number)}</span>,
        size: 130,
      },
      {
        accessorKey: 'front_sales',
        header: 'Front',
        cell: ({ getValue }) => {
          const v = getValue() as number;
          return <span className="font-mono-value">{v > 0 ? v : '—'}</span>;
        },
        size: 70,
      },
      {
        accessorKey: 'bump_sales',
        header: 'Bump',
        cell: ({ getValue }) => {
          const v = getValue() as number;
          return <span className="font-mono-value">{v > 0 ? v : '—'}</span>;
        },
        size: 70,
      },
      {
        accessorKey: 'upsell_sales',
        header: 'Upsell',
        cell: ({ getValue }) => {
          const v = getValue() as number;
          return <span className="font-mono-value">{v > 0 ? v : '—'}</span>;
        },
        size: 70,
      },
      {
        accessorKey: 'sales',
        header: 'Total Vendas',
        cell: ({ getValue }) => <span className="font-mono-value font-semibold">{getValue() as number}</span>,
        size: 100,
      },
      {
        accessorKey: 'cpa',
        header: 'CPA',
        cell: ({ getValue }) => <span className="font-mono-value">{formatCurrency(getValue() as number)}</span>,
        size: 110,
      },
      {
        accessorKey: 'roas',
        header: 'ROAS',
        cell: ({ getValue }) => {
          const v = getValue() as number;
          return <span className={`font-mono-value font-semibold ${getRoasColor(v)}`}>{formatRoas(v)}</span>;
        },
        size: 90,
      },
      {
        accessorKey: 'profit',
        header: 'Lucro',
        cell: ({ getValue }) => {
          const v = getValue() as number;
          return <span className={`font-mono-value font-semibold ${getProfitColor(v)}`}>{formatCurrency(v)}</span>;
        },
        size: 120,
      },
      {
        id: 'conv_pagina',
        header: 'Conv. Pág.',
        accessorFn: (row) => row.landing_page_views > 0 ? (((row as any).front_sales || 0) / row.landing_page_views) * 100 : 0,
        cell: ({ getValue }) => {
          const v = getValue() as number;
          const color = v >= 2.5 ? 'text-kpi-positive' : v >= 1.5 ? 'text-kpi-warning' : v > 0 ? 'text-destructive' : 'text-muted-foreground';
          return <span className={`font-mono-value ${color}`}>{v > 0 ? `${v.toFixed(2)}%` : '—'}</span>;
        },
        size: 100,
      },
      {
        id: 'conv_checkout',
        header: 'Conv. Chk.',
        accessorFn: (row) => row.initiate_checkout > 0 ? (((row as any).front_sales || 0) / row.initiate_checkout) * 100 : 0,
        cell: ({ getValue }) => {
          const v = getValue() as number;
          const color = v >= 16 ? 'text-kpi-positive' : v >= 10 ? 'text-kpi-warning' : v > 0 ? 'text-destructive' : 'text-muted-foreground';
          return <span className={`font-mono-value ${color}`}>{v > 0 ? `${v.toFixed(1)}%` : '—'}</span>;
        },
        size: 100,
      },
      {
        id: 'ticket_medio',
        header: 'Ticket Médio',
        accessorFn: (row) => row.sales > 0 ? row.revenue / row.sales : 0,
        cell: ({ getValue }) => {
          const v = getValue() as number;
          return <span className="font-mono-value">{v > 0 ? formatCurrency(v) : '—'}</span>;
        },
        size: 110,
      },
      {
        id: 'hook',
        header: 'Hook',
        accessorFn: (row) => row.impressions > 0 && row.video_views > 0 ? (row.video_views / row.impressions) * 100 : 0,
        cell: ({ getValue }) => {
          const v = getValue() as number;
          return <span className="font-mono-value">{v > 0 ? `${v.toFixed(2)}%` : '—'}</span>;
        },
        size: 80,
      },
      {
        accessorKey: 'link_clicks',
        header: 'Cliques',
        cell: ({ getValue }) => <span className="font-mono-value">{formatNumber(getValue() as number)}</span>,
        size: 90,
      },
      {
        accessorKey: 'ctr',
        header: 'CTR',
        cell: ({ getValue }) => <span className="font-mono-value">{formatPercent(getValue() as number)}</span>,
        size: 80,
      },
      {
        accessorKey: 'impressions',
        header: 'Impressões',
        cell: ({ getValue }) => <span className="font-mono-value">{formatNumber(getValue() as number)}</span>,
        size: 110,
      },
    ];
    return cols;
  }, [level, onRowClick]);

  const totals = useMemo(() => {
    const spend = data.reduce((s, c) => s + c.spend, 0);
    const revenue = data.reduce((s, c) => s + c.revenue, 0);
    const sales = data.reduce((s, c) => s + c.sales, 0);
    const front_sales = data.reduce((s, c) => s + ((c as any).front_sales || 0), 0);
    const bump_sales = data.reduce((s, c) => s + ((c as any).bump_sales || 0), 0);
    const upsell_sales = data.reduce((s, c) => s + ((c as any).upsell_sales || 0), 0);
    const impressions = data.reduce((s, c) => s + c.impressions, 0);
    const clicks = data.reduce((s, c) => s + c.clicks, 0);
    const link_clicks = data.reduce((s, c) => s + c.link_clicks, 0);
    const landing_page_views = data.reduce((s, c) => s + (c.landing_page_views || 0), 0);
    const initiate_checkout = data.reduce((s, c) => s + (c.initiate_checkout || 0), 0);
    const video_views = data.reduce((s, c) => s + (c.video_views || 0), 0);
    return {
      spend, revenue, sales, front_sales, bump_sales, upsell_sales, impressions, link_clicks,
      cpa: sales > 0 ? spend / sales : 0,
      roas: spend > 0 ? revenue / spend : 0,
      profit: revenue - spend,
      ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
      conv_pagina: landing_page_views > 0 ? (front_sales / landing_page_views) * 100 : 0,
      conv_checkout: initiate_checkout > 0 ? (front_sales / initiate_checkout) * 100 : 0,
      ticket_medio: sales > 0 ? revenue / sales : 0,
      hook: impressions > 0 && video_views > 0 ? (video_views / impressions) * 100 : 0,
    };
  }, [data]);

  const table = useReactTable({
    data,
    columns,
    state: { sorting, rowSelection },
    onSortingChange: setSorting,
    onRowSelectionChange: setRowSelection,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    enableRowSelection: true,
  });

  const selectedCount = Object.keys(rowSelection).length;

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      {selectedCount > 0 && (
        <div className="flex items-center gap-3 px-4 py-2 bg-primary/5 border-b border-border">
          <span className="text-sm font-medium">{selectedCount} selecionada(s)</span>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            {table.getHeaderGroups().map(headerGroup => (
              <tr key={headerGroup.id} className="bg-table-header border-b border-border">
                {headerGroup.headers.map(header => (
                  <th
                    key={header.id}
                    className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap cursor-pointer select-none hover:bg-muted/50"
                    style={{ width: header.getSize() }}
                    onClick={header.column.getToggleSortingHandler()}
                  >
                    <div className="flex items-center gap-1">
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {header.column.getCanSort() && (
                        header.column.getIsSorted() === 'asc' ? <ArrowUp className="h-3 w-3" /> :
                        header.column.getIsSorted() === 'desc' ? <ArrowDown className="h-3 w-3" /> :
                        <ArrowUpDown className="h-3 w-3 opacity-30" />
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map(row => {
              const isSelected = selectedRowId === (row.original as any).id;
              return (
              <tr
                key={row.id}
                onClick={() => {
                  if (onRowSelect) onRowSelect(row.original);
                  else onRowClick?.(row.original);
                }}
                className={`border-b border-border transition-colors ${
                  isSelected
                    ? 'bg-emerald-50 dark:bg-emerald-950/30'
                    : row.getIsSelected()
                    ? 'bg-table-selected'
                    : 'hover:bg-table-hover'
                } ${onRowClick || onRowSelect ? 'cursor-pointer' : ''}`}
              >
                {row.getVisibleCells().map(cell => (
                  <td key={cell.id} className="px-3 py-2.5 whitespace-nowrap">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="bg-table-header border-t-2 border-border font-semibold">
              <td className="px-3 py-2.5" />
              <td className="px-3 py-2.5 text-xs text-muted-foreground">N/A</td>
              <td className="px-3 py-2.5 text-xs">{data.length} {level === 'campaign' ? 'CAMPANHAS' : level === 'adset' ? 'CONJUNTOS' : 'ANÚNCIOS'}</td>
              <td className="px-3 py-2.5 font-mono-value">{formatCurrency(totals.spend)}</td>
              <td className="px-3 py-2.5 font-mono-value">{formatCurrency(totals.revenue)}</td>
              <td className="px-3 py-2.5 font-mono-value">{totals.front_sales > 0 ? totals.front_sales : '—'}</td>
              <td className="px-3 py-2.5 font-mono-value">{totals.bump_sales > 0 ? totals.bump_sales : '—'}</td>
              <td className="px-3 py-2.5 font-mono-value">{totals.upsell_sales > 0 ? totals.upsell_sales : '—'}</td>
              <td className="px-3 py-2.5 font-mono-value font-semibold">{totals.sales}</td>
              <td className="px-3 py-2.5 font-mono-value">{formatCurrency(totals.cpa)}</td>
              <td className={`px-3 py-2.5 font-mono-value font-semibold ${getRoasColor(totals.roas)}`}>{formatRoas(totals.roas)}</td>
              <td className={`px-3 py-2.5 font-mono-value font-semibold ${getProfitColor(totals.profit)}`}>{formatCurrency(totals.profit)}</td>
              <td className={`px-3 py-2.5 font-mono-value ${totals.conv_pagina >= 2.5 ? 'text-kpi-positive' : totals.conv_pagina >= 1.5 ? 'text-kpi-warning' : totals.conv_pagina > 0 ? 'text-destructive' : 'text-muted-foreground'}`}>{totals.conv_pagina > 0 ? `${totals.conv_pagina.toFixed(2)}%` : '—'}</td>
              <td className={`px-3 py-2.5 font-mono-value ${totals.conv_checkout >= 16 ? 'text-kpi-positive' : totals.conv_checkout >= 10 ? 'text-kpi-warning' : totals.conv_checkout > 0 ? 'text-destructive' : 'text-muted-foreground'}`}>{totals.conv_checkout > 0 ? `${totals.conv_checkout.toFixed(1)}%` : '—'}</td>
              <td className="px-3 py-2.5 font-mono-value">{totals.ticket_medio > 0 ? formatCurrency(totals.ticket_medio) : '—'}</td>
              <td className="px-3 py-2.5 font-mono-value">{totals.hook > 0 ? `${totals.hook.toFixed(2)}%` : '—'}</td>
              <td className="px-3 py-2.5 font-mono-value">{formatNumber(totals.link_clicks)}</td>
              <td className="px-3 py-2.5 font-mono-value">{formatPercent(totals.ctr)}</td>
              <td className="px-3 py-2.5 font-mono-value">{formatNumber(totals.impressions)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
});

export default PerformanceTable;
