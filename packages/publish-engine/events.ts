import { randomUUID } from "node:crypto";
import type { PublishAuditEvent, PublishRepository } from "./repository.js";
import type { PublishJob } from "./types.js";

export type PublishEventType = "publish.job.created" | "publish.started" | "publish.accepted" | "publish.public_observed" | "publish.stable" | "publish.rejected" | "publish.removed" | "publish.auth_required" | "publish.manual_takeover_required" | "publish.failed";

export interface PublishEvent extends PublishAuditEvent { type: PublishEventType; jobId: string; }
export interface PublishEventSink { emit(event: PublishEvent): Promise<void>; }

export class RepositoryAuditSink implements PublishEventSink {
  constructor(private readonly repository: PublishRepository) {}
  async emit(event: PublishEvent) { await this.repository.appendAudit(event); }
}

export class WebhookEventSink implements PublishEventSink {
  constructor(private readonly url: string, private readonly secret?: string, private readonly fetcher: typeof fetch = fetch) {}
  async emit(event: PublishEvent) {
    const response = await this.fetcher(this.url, { method: "POST", headers: { "content-type": "application/json", ...(this.secret ? { authorization: `Bearer ${this.secret}` } : {}) }, body: JSON.stringify(event) });
    if (!response.ok) throw new Error(`Webhook returned HTTP ${response.status}.`);
  }
}

export class CompositeEventSink implements PublishEventSink {
  constructor(private readonly sinks: PublishEventSink[]) {}
  async emit(event: PublishEvent) { const results = await Promise.allSettled(this.sinks.map((sink) => sink.emit(event))); const failure = results.find((item) => item.status === "rejected"); if (failure?.status === "rejected") throw failure.reason; }
}

export function publishEvent(type: PublishEventType, job: PublishJob, details?: Record<string, unknown>): PublishEvent {
  return { id: randomUUID(), type, jobId: job.id, platform: job.platform, occurredAt: new Date().toISOString(), details };
}
