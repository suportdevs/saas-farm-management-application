import { Baby, Beef, Dna, Milk, Tractor, type LucideIcon } from 'lucide-react';
import type { FarmType } from '@kit/shared';

// Plain constants (no 'use client') so both server and client components can use them.

export const FARM_TYPE_ICONS: Record<FarmType, LucideIcon> = {
  dairy: Milk,
  beef: Beef,
  mixed: Tractor,
  breeding: Dna,
  calf_rearing: Baby,
};

export const GOALS: { id: string; label: string }[] = [
  { id: 'milk_yield', label: 'Increase milk yield' },
  { id: 'herd_health', label: 'Improve herd health' },
  { id: 'fertility', label: 'Better fertility & calving' },
  { id: 'feed_costs', label: 'Cut feed & vet costs' },
  { id: 'traceability', label: 'Traceability & compliance' },
  { id: 'team', label: 'Organise my team' },
  { id: 'growth', label: 'Grow the herd' },
  { id: 'profit', label: 'Know my profitability' },
];
