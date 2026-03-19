/**
 * Generic CSV export utility with UTF-8 BOM for Excel compatibility.
 */
export function downloadCsv(
  rows: Record<string, string | number>[],
  columns: { key: string; label: string }[],
  filename: string,
) {
  const header = columns.map(c => `"${c.label}"`).join(';');
  const lines = rows.map(row =>
    columns.map(c => {
      const v = row[c.key];
      if (typeof v === 'number') return String(v).replace('.', ',');
      return `"${String(v ?? '').replace(/"/g, '""')}"`;
    }).join(';'),
  );

  const bom = '\uFEFF';
  const csv = bom + [header, ...lines].join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
