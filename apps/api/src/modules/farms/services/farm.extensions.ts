import { CAPABILITIES, type Capability } from '@kit/shared';
import type { db } from '../../../core';
import type { Farm } from '../models';

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

type ContextExtender = (farm: Farm) => Promise<object> | object;
type SummaryExtender = (farmIds: string[]) => Promise<Map<string, object>>;
type SeatGuard = (farm: Farm, seatsInUse: number) => Promise<void> | void;
type FarmListener = (farm: Farm, tx: Tx) => Promise<void> | void;
type DeletingListener = (farm: Farm) => Promise<void> | void;
type CapabilityProvider = (farmIds: string[]) => Promise<Map<string, Capability[]>>;

/**
 * Extension points of the farms (tenant) module. Other modules plug in here
 * from their `setup()`, so the tenant core never depends on them — e.g. the
 * subscriptions module adds the plan to every farm context and enforces seat
 * limits, without the farms module knowing about plans.
 */
class FarmExtensions {
  private readonly contextExtenders: ContextExtender[] = [];
  private readonly summaryExtenders: SummaryExtender[] = [];
  private readonly seatGuards: SeatGuard[] = [];
  private readonly createdListeners: FarmListener[] = [];
  private readonly deletingListeners: DeletingListener[] = [];
  private capabilityProvider: CapabilityProvider | null = null;

  /** Adds fields to GET /farms/:farm. */
  extendContext(fn: ContextExtender) {
    this.contextExtenders.push(fn);
  }
  /** Adds fields to each farm in GET /farms (called once per list, batched). */
  extendSummaries(fn: SummaryExtender) {
    this.summaryExtenders.push(fn);
  }
  /** Throw to stop a new seat (member or invitation) being added. */
  addSeatGuard(fn: SeatGuard) {
    this.seatGuards.push(fn);
  }
  /** Runs inside the farm-creation transaction. */
  onCreated(fn: FarmListener) {
    this.createdListeners.push(fn);
  }
  /** Runs before a farm is deleted (rows still exist). */
  onDeleting(fn: DeletingListener) {
    this.deletingListeners.push(fn);
  }
  /**
   * Supplies the plan capabilities of each farm (batched). Module permissions
   * are gated by them; without a provider every capability is on.
   */
  provideCapabilities(fn: CapabilityProvider) {
    this.capabilityProvider = fn;
  }

  async context(farm: Farm) {
    const parts = await Promise.all(this.contextExtenders.map((fn) => fn(farm)));
    return Object.assign({}, ...parts) as Record<string, unknown>;
  }
  async summaries(farmIds: string[]) {
    const maps = await Promise.all(this.summaryExtenders.map((fn) => fn(farmIds)));
    return (id: string) => Object.assign({}, ...maps.map((m) => m.get(id) ?? {})) as Record<string, unknown>;
  }
  async guardSeat(farm: Farm, seatsInUse: number) {
    for (const guard of this.seatGuards) await guard(farm, seatsInUse);
  }
  async created(farm: Farm, tx: Tx) {
    for (const fn of this.createdListeners) await fn(farm, tx);
  }
  async deleting(farm: Farm) {
    for (const fn of this.deletingListeners) await fn(farm);
  }
  async capabilities(farmIds: string[]): Promise<(farmId: string) => Capability[]> {
    const map = this.capabilityProvider ? await this.capabilityProvider(farmIds) : null;
    return (id) => (map ? (map.get(id) ?? []) : [...CAPABILITIES]);
  }
}

export const farmExtensions = new FarmExtensions();
