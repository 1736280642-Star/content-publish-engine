import type { PlatformPublishPayload, PublishAttemptStatus, PublishFailureCode, PublishPlatformKey } from "./types.js";

export interface AuthStatus {
  ok: boolean;
  status: "ready" | "pending_config" | "auth_required" | "manual_takeover_required" | "failed";
  message: string;
  nextAction: string;
  failureCode?: PublishFailureCode;
  missingConfig?: string[];
}

export interface ValidationResult {
  ok: boolean;
  message: string;
  nextAction: string;
  failureCode?: PublishFailureCode;
}

export interface PublishResult {
  ok: boolean;
  status: PublishAttemptStatus;
  mode: "mock" | "dry_run" | "real";
  publishStatus?: "submitted" | "confirmed" | "pending_review" | "failed";
  platformArticleId?: string;
  externalTaskId?: string;
  platformDraftId?: string;
  editorUrl?: string;
  publicUrl?: string;
  idempotencyKey?: string;
  publicUrlPending?: boolean;
  failureCode?: PublishFailureCode;
  failureReason?: string;
  nextAction: string;
  diagnosticSummary?: string;
}

export interface VerifyResult {
  ok: boolean;
  status: PublishAttemptStatus;
  publishStatus?: PublishResult["publishStatus"];
  verifyStatus: "verified" | "pending" | "failed";
  platformArticleId?: string;
  externalTaskId?: string;
  publicUrl?: string;
  publicUrlPending?: boolean;
  failureCode?: PublishFailureCode;
  failureReason?: string;
  nextAction: string;
}

export interface PublishAdapter {
  platform: PublishPlatformKey;
  checkAuth(): Promise<AuthStatus>;
  validatePayload(payload: PlatformPublishPayload): Promise<ValidationResult>;
  publish(payload: PlatformPublishPayload): Promise<PublishResult>;
  verify(result: PublishResult): Promise<VerifyResult>;
}

export interface PlatformCapabilities {
  directPublish: boolean;
  scheduledPublish: boolean;
  publicUrlLookup: boolean;
  livenessCheck: boolean;
  coverUpload: boolean;
  inlineImageUpload: boolean;
}

export interface PlatformPlugin {
  key: PublishPlatformKey;
  displayName: string;
  adapter: PublishAdapter;
  capabilities: PlatformCapabilities;
}
