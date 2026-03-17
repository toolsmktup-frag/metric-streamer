import { create } from 'zustand';

export interface DateRange {
  start: Date;
  end: Date;
  label: string;
}

interface FilterState {
  dateRange: DateRange;
  campaigns: string[];
  adsets: string[];
  ads: string[];
  status: 'all' | 'active' | 'paused';
  platform: 'all' | 'facebook' | 'instagram' | 'audience_network' | 'messenger';
  searchQuery: string;
  lastUpdated: Date;
  // Funil ativo — null = visão geral (todos os funis)
  activeFunnelId: string | null;
  compareEnabled: boolean;
  setDateRange: (range: DateRange) => void;
  setCampaigns: (ids: string[]) => void;
  setAdsets: (ids: string[]) => void;
  setAds: (ids: string[]) => void;
  setStatus: (status: FilterState['status']) => void;
  setPlatform: (platform: FilterState['platform']) => void;
  setSearchQuery: (query: string) => void;
  setActiveFunnelId: (id: string | null) => void;
  setCompareEnabled: (enabled: boolean) => void;
  refresh: () => void;
}

const thirtyDaysAgo = new Date();
thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29);
thirtyDaysAgo.setHours(0, 0, 0, 0);
const endOfDay = new Date();
endOfDay.setHours(23, 59, 59, 999);

export const useFilterStore = create<FilterState>((set) => ({
  dateRange: { start: thirtyDaysAgo, end: endOfDay, label: 'Últimos 30 dias' },
  campaigns: [],
  adsets: [],
  ads: [],
  status: 'all',
  platform: 'all',
  searchQuery: '',
  lastUpdated: new Date(),
  activeFunnelId: null,
  compareEnabled: false,
  setDateRange: (range) => set({ dateRange: range }),
  setCampaigns: (ids) => set({ campaigns: ids }),
  setAdsets: (ids) => set({ adsets: ids }),
  setAds: (ids) => set({ ads: ids }),
  setStatus: (status) => set({ status }),
  setPlatform: (platform) => set({ platform }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  setActiveFunnelId: (id) => set({ activeFunnelId: id }),
  setCompareEnabled: (enabled) => set({ compareEnabled: enabled }),
  refresh: () => set({ lastUpdated: new Date() }),
}));
