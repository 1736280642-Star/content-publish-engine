export interface PublishTelemetrySnapshot { counters: Record<string, number>; durationsMs: Record<string, { count: number; total: number; max: number }>; }

export class PublishTelemetry {
  private counters = new Map<string, number>(); private durations = new Map<string, { count: number; total: number; max: number }>();
  increment(name: string, labels: Record<string, string> = {}) { const key = this.key(name, labels); this.counters.set(key, (this.counters.get(key) || 0) + 1); }
  observe(name: string, durationMs: number, labels: Record<string, string> = {}) { const key = this.key(name, labels); const value = this.durations.get(key) || { count: 0, total: 0, max: 0 }; value.count += 1; value.total += durationMs; value.max = Math.max(value.max, durationMs); this.durations.set(key, value); }
  snapshot(): PublishTelemetrySnapshot { return { counters: Object.fromEntries(this.counters), durationsMs: Object.fromEntries(this.durations) }; }
  private key(name: string, labels: Record<string, string>) { const suffix = Object.entries(labels).sort().map(([key, value]) => `${key}=${value}`).join(","); return suffix ? `${name}{${suffix}}` : name; }
}
