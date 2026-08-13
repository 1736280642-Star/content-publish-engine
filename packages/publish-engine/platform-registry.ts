import type { PlatformPlugin, PublishAdapter } from "./adapter-types.js";
import type { PublishPlatformKey } from "./types.js";

export class PlatformRegistry {
  private readonly plugins = new Map<PublishPlatformKey, PlatformPlugin>();

  register(plugin: PlatformPlugin): void {
    if (!plugin.key.trim()) throw new Error("Platform key is required.");
    this.plugins.set(plugin.key, plugin);
  }

  unregister(key: PublishPlatformKey): boolean {
    return this.plugins.delete(key);
  }

  get(key: PublishPlatformKey): PlatformPlugin | undefined {
    return this.plugins.get(key);
  }

  getAdapter(key: PublishPlatformKey): PublishAdapter {
    const plugin = this.plugins.get(key);
    if (!plugin) throw new Error(`Platform is not registered: ${key}`);
    return plugin.adapter;
  }

  list(): PlatformPlugin[] {
    return [...this.plugins.values()];
  }
}

export const defaultPlatformRegistry = new PlatformRegistry();

export function listRegisteredPlatforms(registry: PlatformRegistry = defaultPlatformRegistry) {
  return registry.list().map(({ key, displayName, capabilities }) => ({ key, displayName, capabilities }));
}
