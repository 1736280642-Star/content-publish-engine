import type { PublishAttempt, PublishJob, PublishPlatformKey } from "./types.js";

export interface PublishAuditEvent {
  id: string;
  jobId?: string;
  type: string;
  occurredAt: string;
  platform?: PublishPlatformKey;
  details?: Record<string, unknown>;
}

export interface PublishRepository {
  /** Atomic compare-and-claim plus named locks make this contract suitable for distributed implementations. */
  createJob(job: PublishJob): Promise<{ created: boolean; job: PublishJob }>;
  getJob(id: string): Promise<PublishJob | undefined>;
  getJobByIdempotencyKey(idempotencyKey: string): Promise<PublishJob | undefined>;
  listJobs(filters?: { platform?: PublishPlatformKey; status?: string }): Promise<PublishJob[]>;
  listDueVerificationJobs(now: string, limit: number): Promise<PublishJob[]>;
  listDuePublishJobs(now: string, limit: number, blockedPlatforms?: PublishPlatformKey[]): Promise<PublishJob[]>;
  claimJob(id: string, workerId: string, leaseMs: number): Promise<PublishJob | undefined>;
  heartbeat(id: string, workerId: string, leaseMs: number): Promise<boolean>;
  saveJob(job: PublishJob, workerId?: string): Promise<PublishJob>;
  appendAttempt(attempt: PublishAttempt): Promise<void>;
  listAttempts(jobId?: string): Promise<PublishAttempt[]>;
  appendAudit(event: PublishAuditEvent): Promise<void>;
  listAudit(jobId?: string): Promise<PublishAuditEvent[]>;
  acquireLock(key: string, owner: string, leaseMs: number): Promise<boolean>;
  releaseLock(key: string, owner: string): Promise<void>;
}

export interface DistributedLockProvider {
  acquire(key: string, owner: string, leaseMs: number): Promise<boolean>;
  renew(key: string, owner: string, leaseMs: number): Promise<boolean>;
  release(key: string, owner: string): Promise<void>;
}

export class DistributedLockingRepository implements PublishRepository {
  constructor(private readonly repository: PublishRepository, private readonly locks: DistributedLockProvider) {}
  createJob(job: PublishJob) { return this.repository.createJob(job); }
  getJob(id: string) { return this.repository.getJob(id); }
  getJobByIdempotencyKey(key: string) { return this.repository.getJobByIdempotencyKey(key); }
  listJobs(filters?: { platform?: PublishPlatformKey; status?: string }) { return this.repository.listJobs(filters); }
  listDueVerificationJobs(now: string, limit: number) { return this.repository.listDueVerificationJobs(now, limit); }
  listDuePublishJobs(now: string, limit: number, blockedPlatforms?: PublishPlatformKey[]) { return this.repository.listDuePublishJobs(now, limit, blockedPlatforms); }
  claimJob(id: string, workerId: string, leaseMs: number) { return this.repository.claimJob(id, workerId, leaseMs); }
  heartbeat(id: string, workerId: string, leaseMs: number) { return this.repository.heartbeat(id, workerId, leaseMs); }
  saveJob(job: PublishJob, workerId?: string) { return this.repository.saveJob(job, workerId); }
  appendAttempt(attempt: PublishAttempt) { return this.repository.appendAttempt(attempt); }
  listAttempts(jobId?: string) { return this.repository.listAttempts(jobId); }
  appendAudit(event: PublishAuditEvent) { return this.repository.appendAudit(event); }
  listAudit(jobId?: string) { return this.repository.listAudit(jobId); }
  acquireLock(key: string, owner: string, leaseMs: number) { return this.locks.acquire(key, owner, leaseMs); }
  releaseLock(key: string, owner: string) { return this.locks.release(key, owner); }
}
