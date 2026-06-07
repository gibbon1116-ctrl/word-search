export class CapacityService {
  async estimate(): Promise<{ usage?: number; quota?: number; persisted?: boolean }> {
    const estimate = await navigator.storage?.estimate?.();
    const persisted = await navigator.storage?.persisted?.();
    return {
      usage: estimate?.usage,
      quota: estimate?.quota,
      persisted,
    };
  }
}

export const capacityService = new CapacityService();
