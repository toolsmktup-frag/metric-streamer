import React, { useState } from 'react';
import {
  TrendingUp, Users, ShoppingBag, Calculator,
  Filter, Target, Grid3X3, DollarSign,
} from 'lucide-react';
import { useCustomerJourney } from '@/hooks/useCustomerJourney';
import { useRFM } from '@/hooks/useRFM';

import RFMTab from '@/components/intelligence/RFMTab';
import CohortTab from '@/components/intelligence/CohortTab';
import CACTab from '@/components/intelligence/CACTab';
import EscadaTab from '@/components/intelligence/EscadaTab';
import CrossSellTab from '@/components/intelligence/CrossSellTab';
import JornadasTab from '@/components/intelligence/JornadasTab';
import PerfisTab from '@/components/intelligence/PerfisTab';
import LTVTab from '@/components/intelligence/LTVTab';

type Tab = 'rfm' | 'cohort' | 'cac' | 'escada' | 'crosssell' | 'jornadas' | 'perfis' | 'ltv';

const JOURNEY_TABS: Tab[] = ['cac', 'escada', 'crosssell', 'jornadas', 'perfis', 'ltv'];

export default function EscadaValor() {
  const [tab, setTab] = useState<Tab>('rfm');

  const needsJourneys = JOURNEY_TABS.includes(tab);
  const { data: journeys = [], isLoading } = useCustomerJourney(needsJourneys);
  const { data: rfmData } = useRFM();

  const tabs: { key: Tab; label: string; icon: React.ElementType }[] = [
    { key: 'rfm',       label: 'Segmentação RFM',  icon: Target },
    { key: 'cohort',    label: 'Cohort Analysis',   icon: Grid3X3 },
    { key: 'cac',       label: 'CAC vs LTV',        icon: DollarSign },
    { key: 'escada',    label: 'Escada de Valor',   icon: TrendingUp },
    { key: 'crosssell', label: 'Cross-sell',        icon: Filter },
    { key: 'jornadas',  label: 'Jornadas',          icon: ShoppingBag },
    { key: 'perfis',    label: 'Perfis',            icon: Users },
    { key: 'ltv',       label: 'LTV',               icon: Calculator },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Inteligência de Cliente</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {tab === 'rfm'
            ? rfmData
              ? `${rfmData.totalCustomers.toLocaleString('pt-BR')} clientes analisados (Guru + Ticto) — RFM`
              : 'Calculando segmentos RFM...'
            : tab === 'cohort'
              ? 'LTV acumulado por mês de primeira compra — todas as plataformas'
            : tab === 'cac'
              ? 'Custo de aquisição vs LTV real por produto de entrada'
              : journeys.length > 0
                ? `${journeys.length.toLocaleString('pt-BR')} clientes únicos analisados (Ticto + Guru)`
                : 'Analisando dados de clientes...'}
        </p>
      </div>

      <div className="flex items-center gap-1 border-b border-border overflow-x-auto">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
              tab === t.key
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <t.icon className="h-4 w-4" />
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'rfm' && <RFMTab />}
      {tab === 'cohort' && <CohortTab />}
      {tab === 'cac' && <CACTab journeys={journeys} journeysLoading={isLoading} />}
      {tab === 'escada' && <EscadaTab journeys={journeys} isLoading={isLoading} />}
      {tab === 'crosssell' && <CrossSellTab journeys={journeys} />}
      {tab === 'jornadas' && <JornadasTab journeys={journeys} isLoading={isLoading} />}
      {tab === 'perfis' && <PerfisTab journeys={journeys} isLoading={isLoading} />}
      {tab === 'ltv' && <LTVTab journeys={journeys} isLoading={isLoading} />}
    </div>
  );
}
