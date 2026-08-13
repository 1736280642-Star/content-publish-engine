import { resolve } from "node:path";
import { JsonPublishRepository } from "./json-repository.js";
import { SqlitePublishRepository } from "./sqlite-repository.js";
import { PublishOrchestrator } from "./orchestrator.js";
import { CompositeEventSink, RepositoryAuditSink, WebhookEventSink } from "./events.js";
import { defaultPlatformRegistry } from "./platform-registry.js";
import { PublishTelemetry } from "./observability.js";
import "./adapters.js";

export function createPublishRepositoryFromEnv() {
  const driver = (process.env.PUBLISH_REPOSITORY || "sqlite").toLowerCase();
  if (driver === "json") return new JsonPublishRepository(resolve(process.env.PUBLISH_JSON_PATH || ".data/publish-state.json"));
  if (driver === "sqlite") return new SqlitePublishRepository(resolve(process.env.PUBLISH_SQLITE_PATH || ".data/publish.db"));
  throw new Error(`Unsupported PUBLISH_REPOSITORY: ${driver}`);
}

export function createPublishRuntime() {
  const repository = createPublishRepositoryFromEnv();
  const telemetry = new PublishTelemetry();
  const audit = new RepositoryAuditSink(repository);
  const eventSink = process.env.PUBLISH_WEBHOOK_URL
    ? new CompositeEventSink([audit, new WebhookEventSink(process.env.PUBLISH_WEBHOOK_URL, process.env.PUBLISH_WEBHOOK_SECRET)])
    : audit;
  const orchestrator = new PublishOrchestrator({ repository, registry: defaultPlatformRegistry, eventSink, telemetry });
  return { repository, registry: defaultPlatformRegistry, telemetry, orchestrator };
}
