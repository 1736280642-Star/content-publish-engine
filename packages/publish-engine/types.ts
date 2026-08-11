/**
 * Publish engine types — extracted from the original workbench types.
 * These types are self-contained and do not reference other business types.
 */

export type DirectPublishPlatformKey = "wechat" | "juejin" | "csdn" | "zhihu";

export type ChannelKey = "wechat" | "csdn" | "juejin" | "zhihu_toutiao_general";

export type PublishScheduleStatus =
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

export type PublishAttemptStatus =
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
  | "unknown";

export type PublishUrlStatus = "pending" | "provisional" | "stable" | "removed" | "rejected";

export interface PublishPlatformResult {
  platform: DirectPublishPlatformKey;
  scheduleId: string;
  status: PublishScheduleStatus;
  platformArticleId?: string;
  publicUrl?: string;
  urlStatus?: PublishUrlStatus;
  firstPublicObservedAt?: string;
  lastVerifiedAt?: string;
  stablePublishedAt?: string;
  removedAt?: string;
  failureCode?: PublishFailureCode;
  failureReason?: string;
}

export interface PublishRecord {
  id: string;
  draftId: string;
  channel: ChannelKey;
  title: string;
  publishStatus: "queued" | "published" | "url_filled" | "failed";
  plannedPublishDate?: string;
  publishedUrl?: string;
  publishedAt?: string;
  urlStatus?: PublishUrlStatus;
  firstPublicObservedAt?: string;
  lastVerifiedAt?: string;
  stablePublishedAt?: string;
  removedAt?: string;
  exportedAt?: string;
  notes?: string;
  platformResults?: Partial<Record<DirectPublishPlatformKey, PublishPlatformResult>>;
  channelMetrics?: {
    impressions?: number;
    views?: number;
    likes?: number;
    favorites?: number;
    comments?: number;
    shares?: number;
    importedAt: string;
  };
}

export interface PlatformPublishPayload {
  scheduleId: string;
  contentHash: string;
  idempotencyKey: string;
  title: string;
  markdown: string;
  contentFormat?: "markdown" | "wechat_html";
  summary?: string;
  scheduledAt: string;
  sourceDraftId: string;
  publishRecordId?: string;
  matrixItemId?: string;
  coverMediaId?: string;
  categoryId?: string;
  tagIds?: string[];
  externalDraftId?: string;
  editorUrl?: string;
  dryRun?: boolean;
}

export interface PublishSchedule {
  id: string;
  platform: DirectPublishPlatformKey;
  status: PublishScheduleStatus;
  scheduledAt: string;
  draftId: string;
  platformVariantId?: string;
  publishRecordId?: string;
  matrixItemId?: string;
  contentFormat?: "markdown" | "wechat_html";
  contentHash: string;
  idempotencyKey: string;
  attemptIds: string[];
  latestAttemptId?: string;
  publishedAt?: string;
  platformArticleId?: string;
  externalTaskId?: string;
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
  pendingCsvReturn?: boolean;
  failureCode?: PublishFailureCode;
  failureReason?: string;
  nextAction?: string;
  retryCount: number;
  manualTakeoverReason?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface PublishAttempt {
  id: string;
  scheduleId: string;
  platform: DirectPublishPlatformKey;
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
  pendingCsvReturn?: boolean;
  failureCode?: PublishFailureCode;
  failureReason?: string;
  nextAction?: string;
  diagnosticSummary?: string;
}
