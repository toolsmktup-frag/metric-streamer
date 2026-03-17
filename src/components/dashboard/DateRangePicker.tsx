import React, { useState } from 'react';
import { Calendar as CalendarIcon, ChevronDown } from 'lucide-react';
import { useFilterStore } from '@/stores/filterStore';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { DateRange as DayPickerRange } from 'react-day-picker';

const PRESETS = [
  { label: 'Hoje', getDates: () => { const d = new Date(); d.setHours(0,0,0,0); const e = new Date(); e.setHours(23,59,59,999); return { start: d, end: e }; }},
  { label: 'Ontem', getDates: () => { const d = new Date(); d.setDate(d.getDate()-1); d.setHours(0,0,0,0); const e = new Date(d); e.setHours(23,59,59,999); return { start: d, end: e }; }},
  { label: 'Últimos 3 dias', getDates: () => { const e = new Date(); const d = new Date(); d.setDate(d.getDate()-2); d.setHours(0,0,0,0); return { start: d, end: e }; }},
  { label: 'Últimos 7 dias', getDates: () => { const e = new Date(); const d = new Date(); d.setDate(d.getDate()-6); d.setHours(0,0,0,0); return { start: d, end: e }; }},
  { label: 'Últimos 14 dias', getDates: () => { const e = new Date(); const d = new Date(); d.setDate(d.getDate()-13); d.setHours(0,0,0,0); return { start: d, end: e }; }},
  { label: 'Últimos 30 dias', getDates: () => { const e = new Date(); const d = new Date(); d.setDate(d.getDate()-29); d.setHours(0,0,0,0); return { start: d, end: e }; }},
  { label: 'Este mês', getDates: () => { const d = new Date(); d.setDate(1); d.setHours(0,0,0,0); return { start: d, end: new Date() }; }},
];

const DateRangePicker = React.memo(function DateRangePicker() {
  const { dateRange, setDateRange } = useFilterStore();
  const [open, setOpen] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);
  const [customRange, setCustomRange] = useState<DayPickerRange | undefined>(undefined);

  const handlePreset = (preset: typeof PRESETS[0]) => {
    const dates = preset.getDates();
    setDateRange({ ...dates, label: preset.label });
    setShowCalendar(false);
    setOpen(false);
  };

  const handleCustomApply = () => {
    if (customRange?.from && customRange?.to) {
      const start = new Date(customRange.from);
      start.setHours(0, 0, 0, 0);
      const end = new Date(customRange.to);
      end.setHours(23, 59, 59, 999);
      const label = `${format(start, 'dd/MM', { locale: ptBR })} - ${format(end, 'dd/MM', { locale: ptBR })}`;
      setDateRange({ start, end, label });
      setShowCalendar(false);
      setOpen(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={(v) => { setOpen(v); if (!v) setShowCalendar(false); }}>
      <PopoverTrigger asChild>
        <button className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted transition-colors">
          <CalendarIcon className="h-4 w-4 text-muted-foreground" />
          {dateRange.label}
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent className={cn("p-1", showCalendar ? "w-auto" : "w-48")} align="end">
        {!showCalendar ? (
          <div>
            {PRESETS.map(preset => (
              <button
                key={preset.label}
                className={`w-full text-left px-3 py-2 text-sm rounded-md transition-colors ${
                  dateRange.label === preset.label ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
                }`}
                onClick={() => handlePreset(preset)}
              >
                {preset.label}
              </button>
            ))}
            <div className="border-t border-border mt-1 pt-1">
              <button
                className={`w-full text-left px-3 py-2 text-sm rounded-md transition-colors ${
                  !PRESETS.some(p => p.label === dateRange.label) ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
                }`}
                onClick={() => {
                  setCustomRange({ from: dateRange.start, to: dateRange.end });
                  setShowCalendar(true);
                }}
              >
                Personalizado
              </button>
            </div>
          </div>
        ) : (
          <div className="p-2 space-y-3">
            <Calendar
              mode="range"
              selected={customRange}
              onSelect={setCustomRange}
              numberOfMonths={2}
              locale={ptBR}
              disabled={(date) => date > new Date()}
              className={cn("p-3 pointer-events-auto")}
            />
            <div className="flex items-center justify-between px-1">
              <button
                onClick={() => setShowCalendar(false)}
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                Voltar
              </button>
              <button
                onClick={handleCustomApply}
                disabled={!customRange?.from || !customRange?.to}
                className="px-4 py-1.5 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                Aplicar
              </button>
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
});

export default DateRangePicker;
