/** Public, application-neutral contracts for publish execution and verification. */

export type PublishPlatformKey = string;

export type PublishJobStatus =
  | "scheduled"
  | "precheck_failed"
  | "publishing"
  | "published_verified"
  | "published_pending_url"
  | "pending_verify"
  | "public_observed"
  | "stable_published"
  | "platform_rejected"
  | "removed_after_publish"
  | "risk_blocked"
  | "verification_timeout"
  | "auth_expired"
  | "failed"
  | "manual_takeover_required"
  | "pending_config";

export type PublishAttemptStatus = Exclude<PublishJobStatus, "scheduled">;
export type PublishFailureCode =
  | "auth_required"
  | "pending_config"
  | "payload_invalid"
  | "platform_not_supported"
  | "platform_review_pending"
  | "publish_action_unconfirmed"
  | "verification_failed"
  | "platform_rejected"
  | "removed_after_publish"
  | "risk_blocked"
  | "verification_timeout"
  | "auth_expired"
  | "content_blocked"
  | "manual_takeover_required"
  | "duplicate_protected"
  | "adapter_failed"
  | "structure_changed"
  | "unknown";

export type PublishUrlStatus = "pending" | "provisional" | "stable" | "removed" | "rejected";

export interface ArticleAssetInput {
  id?: string;
  role: "cover" | "inline";
  source: { type: "url"; url: string } | { type: "file"; path: string } | { type: "platform_media"; mediaId: string };
  alt?: string;
  mimeType?: string;
}

export interface PublishArticleInput {
  sourceId?: string;
  title: string;
  markdown: string;
  summary?: string;
  contentFormat?: "markdown" | "html";
  scheduledAt?: string;
  categoryId?: string;
  tagIds?: string[];
  assets?: ArticleAssetInput[];
  metadata?: Record<string, unknown>;
}

export interface PlatformPublishPayload {
  jobId: string;
  contentHash: string;
  idempotencyKey: string;
  title: string;
  markdown: string;
  summary?: string;
  contentFormat?: "markdown" | "html";
  scheduledAt: string;
  sourceId?: string;
  categoryId?: string;
  tagIds?: string[];
  assets?: ArticleAssetInput[];
  metadata?: Record<string, unknown>;
  platformDraftId?: string;
  editorUrl?: string;
  dryRun?: boolean;
}

export interface PublishJob {
  id: string;
  platform: PublishPlatformKey;
  status: PublishJobStatus;
  scheduledAt: string;
  article: PublishArticleInput;
  contentHash: string;
  idempotencyKey: string;
  attemptIds: string[];
  latestAttemptId?: string;
  publishedAt?: string;
  platformArticleId?: string;
  externalTaskId?: string;
  platformDraftId?: string;
  editorUrl?: string;
  publicUrl?: string;
  urlStatus?: PublishUrlStatus;
  firstPublicObservedAt?: string;
  lastVerifiedAt?: string;
  nextVerificationAt?: string;
  verificationStartedAt?: string;
  stablePublishedAt?: string;
  removedAt?: string;
  verificationCount?: number;
  consecutiveVerificationFailures?: number;
  publicUrlPending?: boolean;
  failureCode?: PublishFailureCode;
  failureReason?: string;
  nextAction?: string;
  retryCount: number;
  manualTakeoverReason?: string;
  leaseOwner?: string;
  leaseExpiresAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PublishAttempt {
  id: string;
  jobId: string;
  platform: PublishPlatformKey;
  contentHash: string;
  idempotencyKey: string;
  status: PublishAttemptStatus;
  startedAt: string;
  finishedAt?: string;
  mode: "mock" | "dry_run" | "real";
  authStatus: "ready" | "pending_config" | "auth_required" | "manual_takeover_required" | "failed";
  payloadStatus: "valid" | "invalid";
  publishStatus?: "submitted" | "confirmed" | "pending_review" | "failed";
  verifyStatus?: "verified" | "pending" | "failed" | "not_started";
  platformArticleId?: string;
  externalTaskId?: string;
  publicUrl?: string;
  urlStatus?: PublishUrlStatus;
  verificationKind?: "initial" | "liveness";
  publicUrlPending?: boolean;
  failureCode?: PublishFailureCode;
  failureReason?: string;
  nextAction?: string;
  diagnosticSummary?: string;
}
