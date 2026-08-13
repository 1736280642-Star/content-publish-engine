import type { PublishAttempt, PublishJob, PublishPlatformKey } from "./types.js";

export interface PublishReliabilityMetrics {
  platform: PublishPlatformKey;
  total: number;
  submitted: number;
  uniqueArticles: number;
  publicObserved: number;
  stablePublished: number;
  removedAfterPublish: number;
  platformRejected: number;
  riskBlocked: number;
  duplicateProtectedAttempts: number;
  submissionAcceptanceRate: number | null;
  publicConversionRate: number | null;
  survival24hRate: number | null;
  survival72hRate: number | null;
  removalRate: number | null;
  averageUrlDiscoveryLatencyMinutes: number | null;
}

const rate = (n: number, d: number) => d ? Number((n / d).toFixed(4)) : null;
const hours = (from?: string, to?: string) => from && to ? (Date.parse(to) - Date.parse(from)) / 3_600_000 : 0;

function identity(job: PublishJob) {
  if (job.platformArticleId) return `${job.platform}:article:${job.platformArticleId}`;
  if (job.publicUrl) { try { const url = new URL(job.publicUrl); url.search = ""; url.hash = ""; return `${job.platform}:url:${url.toString().replace(/\/$/, "")}`; } catch { return `${job.platform}:url:${job.publicUrl}`; } }
  return `${job.platform}:job:${job.id}`;
}

export function buildPublishReliabilityMetrics(jobs: PublishJob[], attempts: PublishAttempt[]): PublishReliabilityMetrics[] {
  const platforms = [...new Set(jobs.map((job) => job.platform))];
  return platforms.map((platform) => {
    const platformJobs = jobs.filter((job) => job.platform === platform);
    const platformAttempts = attempts.filter((attempt) => attempt.platform === platform);
    const submitted = platformJobs.filter((job) => ["published_pending_url", "published_verified", "pending_verify", "public_observed", "stable_published", "removed_after_publish"].includes(job.status));
    const observedMap = new Map<string, PublishJob>();
    for (const job of platformJobs.filter((item) => item.firstPublicObservedAt)) observedMap.set(identity(job), job);
    const observed = [...observedMap.values()];
    const eligible24 = observed.filter((job) => job.removedAt || hours(job.firstPublicObservedAt, job.lastVerifiedAt) >= 24);
    const survived24 = eligible24.filter((job) => !job.removedAt || hours(job.firstPublicObservedAt, job.removedAt) >= 24);
    const eligible72 = observed.filter((job) => job.removedAt || hours(job.firstPublicObservedAt, job.lastVerifiedAt) >= 72);
    const survived72 = eligible72.filter((job) => !job.removedAt || hours(job.firstPublicObservedAt, job.removedAt) >= 72);
    const latencies = observed.map((job) => hours(job.publishedAt, job.firstPublicObservedAt) * 60).filter((value) => Number.isFinite(value) && value >= 0);
    return { platform, total: platformJobs.length, submitted: submitted.length, uniqueArticles: new Set(submitted.map((job) => job.article.sourceId || job.contentHash)).size, publicObserved: observed.length, stablePublished: observed.filter((job) => job.status === "stable_published").length, removedAfterPublish: observed.filter((job) => job.status === "removed_after_publish").length, platformRejected: platformJobs.filter((job) => job.status === "platform_rejected").length, riskBlocked: platformJobs.filter((job) => job.status === "risk_blocked").length, duplicateProtectedAttempts: platformAttempts.filter((attempt) => attempt.failureCode === "duplicate_protected").length, submissionAcceptanceRate: rate(submitted.length, platformJobs.length), publicConversionRate: rate(observed.length, submitted.length), survival24hRate: rate(survived24.length, eligible24.length), survival72hRate: rate(survived72.length, eligible72.length), removalRate: rate(observed.filter((job) => job.status === "removed_after_publish").length, observed.length), averageUrlDiscoveryLatencyMinutes: latencies.length ? Number((latencies.reduce((sum, value) => sum + value, 0) / latencies.length).toFixed(2)) : null };
  });
}

export interface ReliabilityThresholds { minimumSamples: number; minimumAcceptanceRate: number; minimumPublicConversionRate: number; minimumSurvival24hRate: number; minimumSurvival72hRate: number; maximumRemovalRate: number; }
export function evaluateReliability(metrics: PublishReliabilityMetrics[], thresholds: ReliabilityThresholds) { return metrics.map((metric) => { const blockers: string[] = []; if (metric.submitted < thresholds.minimumSamples) blockers.push("insufficient_samples"); if ((metric.submissionAcceptanceRate ?? 0) < thresholds.minimumAcceptanceRate) blockers.push("acceptance_rate_low"); if ((metric.publicConversionRate ?? 0) < thresholds.minimumPublicConversionRate) blockers.push("public_conversion_low"); if ((metric.survival24hRate ?? 0) < thresholds.minimumSurvival24hRate) blockers.push("survival_24h_low"); if ((metric.survival72hRate ?? 0) < thresholds.minimumSurvival72hRate) blockers.push("survival_72h_low"); if ((metric.removalRate ?? 0) > thresholds.maximumRemovalRate) blockers.push("removal_rate_high"); return { platform: metric.platform, ready: blockers.length === 0, blockers }; }); }
