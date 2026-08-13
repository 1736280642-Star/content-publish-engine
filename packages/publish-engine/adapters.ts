import { getDefaultTransport, type FormalPublishTransport } from "./transport.js";
import { defaultPlatformRegistry, type PlatformRegistry } from "./platform-registry.js";
import type { AuthStatus, PlatformCapabilities, PlatformPlugin, PublishAdapter, PublishResult, ValidationResult, VerifyResult } from "./adapter-types.js";
import type { PlatformPublishPayload, PublishPlatformKey } from "./types.js";

const builtInPlatforms = ["wechat", "juejin", "csdn", "zhihu"] as const;
const capabilities: PlatformCapabilities = { directPublish: true, scheduledPublish: false, publicUrlLookup: true, livenessCheck: true, coverUpload: false, inlineImageUpload: false };

function mode(): "mock" | "real" | "disabled" { return process.env.PUBLISH_ENABLED === "true" ? "real" : process.env.PUBLISH_MOCK === "false" ? "disabled" : "mock"; }
function validate(payload: PlatformPublishPayload): ValidationResult {
  if (!payload.jobId || !payload.contentHash || !payload.idempotencyKey) return { ok: false, message: "The publish payload is missing idempotency fields.", nextAction: "Create the job through PublishOrchestrator.", failureCode: "payload_invalid" };
  if (!payload.title.trim() || !payload.markdown.trim()) return { ok: false, message: "Title and article body are required.", nextAction: "Provide a completed article before publishing.", failureCode: "payload_invalid" };
  if (Number.isNaN(Date.parse(payload.scheduledAt))) return { ok: false, message: "scheduledAt is invalid.", nextAction: "Provide an ISO-compatible date.", failureCode: "payload_invalid" };
  return { ok: true, message: "Publish payload is valid.", nextAction: "The job can be published." };
}

export class TransportPublishAdapter implements PublishAdapter {
  constructor(readonly platform: PublishPlatformKey, private readonly transport: FormalPublishTransport = getDefaultTransport()) {}
  async checkAuth(): Promise<AuthStatus> {
    if (mode() === "mock") return { ok: true, status: "ready", message: `${this.platform} mock mode is ready.`, nextAction: "Run a mock publication or enable real publishing." };
    if (mode() === "disabled") return { ok: false, status: "pending_config", message: "Publishing is disabled.", nextAction: "Set PUBLISH_ENABLED=true after configuring an authorized executor.", missingConfig: ["PUBLISH_ENABLED"] };
    return this.transport.checkAuth(this.platform);
  }
  async validatePayload(payload: PlatformPublishPayload) { return validate(payload); }
  async publish(payload: PlatformPublishPayload): Promise<PublishResult> {
    if (mode() === "mock") return { ok: true, status: "published_pending_url", mode: "mock", publishStatus: "confirmed", idempotencyKey: payload.idempotencyKey, publicUrlPending: true, nextAction: "Mock publication completed without an external write." };
    if (mode() === "disabled") return { ok: false, status: "pending_config", mode: "dry_run", publishStatus: "failed", idempotencyKey: payload.idempotencyKey, publicUrlPending: true, failureCode: "pending_config", failureReason: "Publishing is disabled.", nextAction: "Configure an executor and enable publishing." };
    return this.transport.publish(this.platform, payload);
  }
  async verify(result: PublishResult): Promise<VerifyResult> {
    if (mode() !== "real") return { ok: result.ok, status: result.status, publishStatus: result.publishStatus, verifyStatus: result.publicUrl ? "verified" : "pending", platformArticleId: result.platformArticleId, externalTaskId: result.externalTaskId, publicUrl: result.publicUrl, publicUrlPending: !result.publicUrl, failureCode: result.failureCode, failureReason: result.failureReason, nextAction: result.nextAction };
    return this.transport.verify(this.platform, result);
  }
}

export function registerPlatform(plugin: PlatformPlugin, registry: PlatformRegistry = defaultPlatformRegistry) { registry.register(plugin); return plugin; }
export function registerTransportPlatform(key: PublishPlatformKey, displayName: string, transport?: FormalPublishTransport, registry: PlatformRegistry = defaultPlatformRegistry) { return registerPlatform({ key, displayName, adapter: new TransportPublishAdapter(key, transport), capabilities }, registry); }
export function registerBuiltInPlatforms(registry: PlatformRegistry = defaultPlatformRegistry, transport?: FormalPublishTransport) { for (const key of builtInPlatforms) if (!registry.get(key)) registerTransportPlatform(key, key === "wechat" ? "WeChat Official Account" : key.toUpperCase(), transport, registry); return registry; }
registerBuiltInPlatforms();

export function getPublishAdapter(platform: PublishPlatformKey, transport?: FormalPublishTransport): PublishAdapter { return transport ? new TransportPublishAdapter(platform, transport) : defaultPlatformRegistry.getAdapter(platform); }
export function getPublishPlatforms() { return defaultPlatformRegistry.list().map((item) => item.key); }
export function coercePublishPlatform(value: unknown): PublishPlatformKey | undefined { return typeof value === "string" && defaultPlatformRegistry.get(value) ? value : undefined; }
