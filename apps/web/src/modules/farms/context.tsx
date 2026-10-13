'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { Capability, FarmContext, Permission } from '@kit/shared';

const Ctx = createContext<FarmContext | null>(null);

export function FarmProvider({ value, children }: { value: FarmContext; children: ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** The current farm workspace (only inside /farms/[farm]). */
export function useFarm(): FarmContext {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useFarm() must be used inside a farm workspace');
  return ctx;
}

export function useCan(permission: Permission): boolean {
  return useFarm().membership.permissions.includes(permission);
}

export function useHasCapability(capability: Capability): boolean {
  return useFarm().capabilities.includes(capability);
}
