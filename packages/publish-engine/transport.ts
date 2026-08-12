import type { DirectPublishPlatformKey, PlatformPublishPayload, PublishAttemptStatus, PublishFailureCode } from "./types.js";
import type { AuthStatus, PublishResult, VerifyResult } from "./adapter-types.js";

/**
 * Transport interface for the formal publish bridge.
 * Implement this interface to provide a custom transport (e.g. mock, test, or different bridge).
 */
export interface FormalPublishTransport {
  checkAuth(platform: DirectPublishPlatformKey): Promise<AuthStatus>;
  publish(platform: DirectPublishPlatformKey, payload: PlatformPublishPayload): Promise<PublishResult>;
  verify(platform: DirectPublishPlatformKey, result: PublishResult): Promise<VerifyResult>;
}

type BridgePlatform = "weixin" | "csdn" | "juejin" | "zhihu";

interface BridgePublishResponse {
  ok?: boolean;
  status?: PublishAttemptStatus;
  publishStatus?: PublishResult["publishStatus"];
  platformArticleId?: string;
  externalTaskId?: string;
  externalDraftId?: string;
  editorUrl?: string;
  publicUrl?: string;
  pendingCsvReturn?: boolean;
  failureCode?: PublishFailureCode;
  failureReason?: string;
  message?: string;
  nextAction?: string;
  diagnosticSummary?: string;
  duplicateProtected?: boolean;
}

const allowedStatuses: PublishAttemptStatus[] = [
  "precheck_failed",
  "publishing",
  "published_verified",
  "published_pending_url",
  "pending_verify",
  "public_observed",
  "stable_published",
  "platform_rejected",
  "removed_after_publish",
  "risk_blocked",
  "verification_timeout",
  "auth_expired",
  "failed",
  "manual_takeover_required",
  "pending_config"
];

function bridgePlatform(platform: DirectPublishPlatformKey): BridgePlatform {
  return platform === "wechat" ? "weixin" : platform;
}

function getBridgeUrl() {
  return process.env.WECHATSYNC_BRIDGE_URL || "http://127.0.0.1:9528";
}

function isLocalBridgeUrl(value: string) {
  try {
    const url = new URL(value);
    return ["localhost", "127.0.0.1", "::1", "[::1]", "host.docker.internal"].includes(url.hostname);
  } catch {
    return false;
  }
}

function getBridgeConfigError(): AuthStatus | undefined {
  const bridgeUrl = getBridgeUrl();
  const token = process.env.WECHATSYNC_BRIDGE_TOKEN?.trim();

  if (!isLocalBridgeUrl(bridgeUrl)) {
    return {
      ok: false,
      status: "pending_config",
      message: "正式发布 bridge 必须监听本机地址。",
      nextAction: "请把 WECHATSYNC_BRIDGE_URL 配置为 127.0.0.1、localhost 或 ::1。",
      missingConfig: ["WECHATSYNC_BRIDGE_URL"]
    };
  }

  if (!token) {
    return {
      ok: false,
      status: "pending_config",
      message: "正式发布 bridge 尚未配置访问令牌。",
      nextAction: "请在本机 .env.local 配置 WECHATSYNC_BRIDGE_TOKEN，且不要把令牌写入文档或聊天。",
      missingConfig: ["WECHATSYNC_BRIDGE_TOKEN"]
    };
  }
}

async function fetchBridge(path: string, body: Record<string, unknown>) {
  const configError = getBridgeConfigError();
  if (configError) throw new Error(configError.message);

  const controller = new AbortController();
  const timeoutMs = Math.max(5_000, Number(process.env.DIRECT_PUBLISH_TIMEOUT_MS || 120_000));
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(`${getBridgeUrl().replace(/\/$/, "")}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.WECHATSYNC_BRIDGE_TOKEN?.trim()}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body),
      signal: controller.signal
    } as RequestInit);
  } finally {
    clearTimeout(timer);
  }
}

function normalizeStatus(value: unknown, fallback: PublishAttemptStatus): PublishAttemptStatus {
  return allowedStatuses.includes(value as PublishAttemptStatus) ? (value as PublishAttemptStatus) : fallback;
}

function failureCodeForResponse(response: Response): PublishFailureCode {
  if (response.status === 401 || response.status === 403) return "auth_required";
  if (response.status === 409) return "duplicate_protected";
  return "adapter_failed";
}

/**
 * Default transport implementation using the local wechatsync bridge.
 * Communicates via HTTP to a local bridge service (default: http://127.0.0.1:9528).
 */
export class BridgeTransport implements FormalPublishTransport {
  async checkAuth(platform: DirectPublishPlatformKey): Promise<AuthStatus> {
    const configError = getBridgeConfigError();
    if (configError) return configError;

    try {
      const response = await fetchBridge("/auth/check", { platform: bridgePlatform(platform), purpose: "formal_publish" });
      const payload = (await response.json().catch(() => ({}))) as {
        authenticated?: boolean;
        status?: AuthStatus["status"];
        message?: string;
        nextAction?: string;
        missingConfig?: string[];
      };

      return {
        ok: response.ok && payload.authenticated === true,
        status: payload.status || (response.status === 401 ? "auth_required" : response.ok ? "ready" : "failed"),
        message: payload.message || (response.ok ? `${platform} 正式发布登录态可用。` : `${platform} 正式发布登录态不可用。`),
        nextAction: payload.nextAction || (response.ok ? "可以执行正式发布。" : "请检查本机 runner、平台登录态和发布权限。"),
        missingConfig: payload.missingConfig
      };
    } catch (error) {
      return {
        ok: false,
        status: "failed",
        message: error instanceof Error ? error.message : "本机正式发布 bridge 不可达。",
        nextAction: "请启动本机 bridge 和 Arcs runner 后重试预检查。"
      };
    }
  }

  async publish(platform: DirectPublishPlatformKey, payload: PlatformPublishPayload): Promise<PublishResult> {
    try {
      const response = await fetchBridge("/publish", { platform: bridgePlatform(platform), ...payload });
      const result = (await response.json().catch(() => ({}))) as BridgePublishResponse;
      const status = normalizeStatus(result.status, response.ok ? "pending_verify" : "failed");

      return {
        ok: response.ok && result.ok !== false,
        status,
        mode: "real",
        publishStatus: result.publishStatus,
        platformArticleId: result.platformArticleId,
        externalTaskId: result.externalTaskId,
        externalDraftId: result.externalDraftId,
        editorUrl: result.editorUrl,
        publicUrl: result.publicUrl,
        idempotencyKey: payload.idempotencyKey,
        pendingCsvReturn: result.pendingCsvReturn,
        failureCode: result.failureCode || (!response.ok ? failureCodeForResponse(response) : undefined),
        failureReason: result.failureReason || (!response.ok ? result.message || `bridge HTTP ${response.status}` : undefined),
        nextAction: result.nextAction || (response.ok ? "等待发布验证。" : "请检查发布尝试详情后处理。"),
        diagnosticSummary: result.duplicateProtected ? "duplicate_protected_by_bridge" : result.diagnosticSummary
      };
    } catch (error) {
      return {
        ok: false,
        status: "failed",
        mode: "real",
        publishStatus: "failed",
        idempotencyKey: payload.idempotencyKey,
        failureCode: "adapter_failed",
        failureReason: error instanceof Error ? error.message : "本机正式发布 bridge 调用失败。",
        nextAction: "不要盲目重试；先检查平台后台是否已生成文章，再创建新的发布排程。"
      };
    }
  }

  async verify(platform: DirectPublishPlatformKey, result: PublishResult): Promise<VerifyResult> {
    if (!result.idempotencyKey) {
      return {
        ok: false,
        status: "pending_verify",
        verifyStatus: "pending",
        platformArticleId: result.platformArticleId,
        externalTaskId: result.externalTaskId,
        publicUrl: result.publicUrl,
        pendingCsvReturn: true,
        failureCode: "verification_failed",
        failureReason: "发布结果缺少 idempotencyKey，不能安全执行远端验证。",
        nextAction: "请先检查平台后台，再由人工回填发布结果。"
      };
    }

    try {
      const response = await fetchBridge("/publish/verify", {
        platform: bridgePlatform(platform),
        idempotencyKey: result.idempotencyKey,
        platformArticleId: result.platformArticleId,
        externalTaskId: result.externalTaskId
      });
      const payload = (await response.json().catch(() => ({}))) as BridgePublishResponse;
      const status = normalizeStatus(payload.status, response.ok ? "pending_verify" : "failed");

      return {
        ok: response.ok && payload.ok !== false,
        status,
        publishStatus: payload.publishStatus,
        verifyStatus:
          ["published_verified", "public_observed", "stable_published"].includes(status)
            ? "verified"
            : ["published_pending_url", "pending_verify"].includes(status)
              ? "pending"
              : "failed",
        platformArticleId: payload.platformArticleId || result.platformArticleId,
        externalTaskId: payload.externalTaskId || result.externalTaskId,
        publicUrl: payload.publicUrl || result.publicUrl,
        pendingCsvReturn: payload.pendingCsvReturn ?? !payload.publicUrl,
        failureCode: payload.failureCode,
        failureReason: payload.failureReason || (!response.ok ? payload.message : undefined),
        nextAction: payload.nextAction || (status === "pending_verify" ? "平台仍在处理，稍后只执行验证，不要重复发布。" : "发布验证已完成。")
      };
    } catch (error) {
      return {
        ok: false,
        status: "pending_verify",
        verifyStatus: "pending",
        platformArticleId: result.platformArticleId,
        externalTaskId: result.externalTaskId,
        publicUrl: result.publicUrl,
        pendingCsvReturn: true,
        failureCode: platform === "wechat" ? "verification_failed" : "publish_action_unconfirmed",
        failureReason: error instanceof Error ? error.message : "正式发布验证调用失败。",
        nextAction: "不要重复发布；恢复本机 bridge 后只执行验证。"
      };
    }
  }
}

/** Default singleton transport instance using the local bridge. */
let defaultTransport: FormalPublishTransport = new BridgeTransport();

export function getDefaultTransport(): FormalPublishTransport {
  return defaultTransport;
}

export function setDefaultTransport(transport: FormalPublishTransport): void {
  defaultTransport = transport;
}
