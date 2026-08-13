import type { VerifyResult } from "./adapter-types.js";
import type { PublishAttemptStatus, PublishJob } from "./types.js";

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

export interface PublishLifecyclePolicy {
  stableAfterHours: number;
  verificationTimeoutHours: number;
  survivalMilestonesHours: number[];
  removalFailureThreshold: number;
}

export const DEFAULT_PUBLISH_LIFECYCLE_POLICY: PublishLifecyclePolicy = {
  stableAfterHours: 72,
  verificationTimeoutHours: 168,
  survivalMilestonesHours: [24, 72],
  removalFailureThreshold: 2
};

function configuredPolicy(overrides: Partial<PublishLifecyclePolicy> = {}): PublishLifecyclePolicy {
  const envNumber = (name: string, fallback: number) => {
    const value = Number(process.env[name]);
    return Number.isFinite(value) && value >= 0 ? value : fallback;
  };
  return {
    stableAfterHours: overrides.stableAfterHours ?? envNumber("PUBLISH_STABLE_AFTER_HOURS", DEFAULT_PUBLISH_LIFECYCLE_POLICY.stableAfterHours),
    verificationTimeoutHours: overrides.verificationTimeoutHours ?? envNumber("PUBLISH_VERIFICATION_TIMEOUT_HOURS", DEFAULT_PUBLISH_LIFECYCLE_POLICY.verificationTimeoutHours),
    survivalMilestonesHours: overrides.survivalMilestonesHours ?? DEFAULT_PUBLISH_LIFECYCLE_POLICY.survivalMilestonesHours,
    removalFailureThreshold: overrides.removalFailureThreshold ?? DEFAULT_PUBLISH_LIFECYCLE_POLICY.removalFailureThreshold
  };
}

function nextVerificationAt(verifiedAt: string, firstObserved: string | undefined, startedAt: string, policy: PublishLifecyclePolicy) {
  const now = Date.parse(verifiedAt);
  const observedAge = firstObserved ? Math.max(0, now - Date.parse(firstObserved)) : -1;
  const pendingAge = Math.max(0, now - Date.parse(startedAt));
  let interval = observedAge >= 0
    ? observedAge < 10 * MINUTE_MS ? 10 * MINUTE_MS : observedAge < HOUR_MS ? HOUR_MS : observedAge < 6 * HOUR_MS ? 6 * HOUR_MS : 24 * HOUR_MS
    : pendingAge < 10 * MINUTE_MS ? MINUTE_MS : pendingAge < HOUR_MS ? 10 * MINUTE_MS : pendingAge < 6 * HOUR_MS ? HOUR_MS : pendingAge < 24 * HOUR_MS ? 6 * HOUR_MS : 24 * HOUR_MS;
  if (observedAge >= 0) {
    const milestones = [...policy.survivalMilestonesHours, policy.stableAfterHours].map((hours) => hours * HOUR_MS).filter((value) => value > observedAge).sort((a, b) => a - b);
    if (milestones[0] !== undefined) interval = Math.max(MINUTE_MS, Math.min(interval, milestones[0] - observedAge));
  }
  return new Date(now + interval).toISOString();
}

export function isPublishVerificationDue(job: PublishJob, now: Date): boolean {
  return !job.nextVerificationAt || Number.isNaN(Date.parse(job.nextVerificationAt)) || Date.parse(job.nextVerificationAt) <= now.getTime();
}

export type PublishVerificationLifecycle = Pick<PublishJob, "urlStatus" | "firstPublicObservedAt" | "lastVerifiedAt" | "nextVerificationAt" | "verificationStartedAt" | "stablePublishedAt" | "removedAt" | "verificationCount" | "consecutiveVerificationFailures" | "failureCode" | "failureReason"> & { status: PublishAttemptStatus };

export function resolvePublishVerificationLifecycle(job: PublishJob, result: VerifyResult, verifiedAt: string, overrides: Partial<PublishLifecyclePolicy> = {}): PublishVerificationLifecycle {
  const policy = configuredPolicy(overrides);
  const verificationCount = (job.verificationCount || 0) + 1;
  const verificationStartedAt = job.verificationStartedAt || verifiedAt;
  const publicUrl = result.publicUrl || job.publicUrl;
  const explicitlyRejected = result.status === "platform_rejected" || result.failureCode === "platform_rejected";
  const explicitlyRemoved = result.status === "removed_after_publish" || result.failureCode === "removed_after_publish";
  const publicConfirmed = Boolean(publicUrl) && result.ok && ["published_verified", "public_observed", "stable_published"].includes(result.status);

  if (explicitlyRejected) return { status: "platform_rejected", urlStatus: "rejected", firstPublicObservedAt: job.firstPublicObservedAt, lastVerifiedAt: verifiedAt, nextVerificationAt: undefined, verificationStartedAt, stablePublishedAt: job.stablePublishedAt, removedAt: job.removedAt, verificationCount, consecutiveVerificationFailures: (job.consecutiveVerificationFailures || 0) + 1, failureCode: "platform_rejected", failureReason: result.failureReason };

  if (publicConfirmed) {
    const firstPublicObservedAt = job.firstPublicObservedAt || verifiedAt;
    const observedAge = Date.parse(verifiedAt) - Date.parse(firstPublicObservedAt);
    const stable = Boolean(job.firstPublicObservedAt) && observedAge >= policy.stableAfterHours * HOUR_MS;
    return { status: stable ? "stable_published" : "public_observed", urlStatus: stable ? "stable" : "provisional", firstPublicObservedAt, lastVerifiedAt: verifiedAt, nextVerificationAt: stable ? new Date(Date.parse(verifiedAt) + 24 * HOUR_MS).toISOString() : nextVerificationAt(verifiedAt, firstPublicObservedAt, verificationStartedAt, policy), verificationStartedAt, stablePublishedAt: stable ? job.stablePublishedAt || verifiedAt : job.stablePublishedAt, removedAt: undefined, verificationCount, consecutiveVerificationFailures: 0, failureCode: undefined, failureReason: undefined };
  }

  const failures = (job.consecutiveVerificationFailures || 0) + 1;
  const wasPublic = Boolean(job.firstPublicObservedAt || job.urlStatus === "provisional" || job.urlStatus === "stable");
  if (wasPublic && failures >= policy.removalFailureThreshold && (explicitlyRemoved || ["published_pending_url", "pending_verify"].includes(result.status))) {
    return { status: "removed_after_publish", urlStatus: "removed", firstPublicObservedAt: job.firstPublicObservedAt, lastVerifiedAt: verifiedAt, nextVerificationAt: undefined, verificationStartedAt, stablePublishedAt: job.stablePublishedAt, removedAt: verifiedAt, verificationCount, consecutiveVerificationFailures: failures, failureCode: "removed_after_publish", failureReason: result.failureReason || "The previously public article is no longer accessible after repeated checks." };
  }

  const timedOut = !wasPublic && Date.parse(verifiedAt) - Date.parse(verificationStartedAt) >= policy.verificationTimeoutHours * HOUR_MS;
  const status: PublishAttemptStatus = result.status === "published_pending_url" ? "published_pending_url" : ["risk_blocked", "auth_expired", "pending_config"].includes(result.status) ? result.status : result.status === "manual_takeover_required" ? "risk_blocked" : "pending_verify";
  return { status: timedOut ? "verification_timeout" : status, urlStatus: wasPublic ? job.urlStatus || "provisional" : "pending", firstPublicObservedAt: job.firstPublicObservedAt, lastVerifiedAt: verifiedAt, nextVerificationAt: timedOut ? undefined : new Date(Date.parse(verifiedAt) + (status === "risk_blocked" ? 6 * HOUR_MS : Date.parse(nextVerificationAt(verifiedAt, job.firstPublicObservedAt, verificationStartedAt, policy)) - Date.parse(verifiedAt))).toISOString(), verificationStartedAt, stablePublishedAt: job.stablePublishedAt, removedAt: job.removedAt, verificationCount, consecutiveVerificationFailures: failures, failureCode: timedOut ? "verification_timeout" : result.failureCode, failureReason: timedOut ? "The platform did not expose a public URL within the verification window." : result.failureReason };
}
