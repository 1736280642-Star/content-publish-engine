import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { PublishAuditEvent, PublishRepository } from "./repository.js";
import type { PublishAttempt, PublishJob, PublishPlatformKey } from "./types.js";

interface RepositoryState {
  version: 1;
  jobs: PublishJob[];
  attempts: PublishAttempt[];
  audits: PublishAuditEvent[];
  locks: Record<string, { owner: string; expiresAt: string }>;
}

const emptyState = (): RepositoryState => ({ version: 1, jobs: [], attempts: [], audits: [], locks: {} });

export class JsonPublishRepository implements PublishRepository {
  private operation: Promise<unknown> = Promise.resolve();

  constructor(private readonly filePath: string) {}

  private async read(): Promise<RepositoryState> {
    try {
      const parsed = JSON.parse(await readFile(this.filePath, "utf8")) as Partial<RepositoryState>;
      return {
        version: 1,
        jobs: Array.isArray(parsed.jobs) ? parsed.jobs : [],
        attempts: Array.isArray(parsed.attempts) ? parsed.attempts : [],
        audits: Array.isArray(parsed.audits) ? parsed.audits : [],
        locks: parsed.locks && typeof parsed.locks === "object" ? parsed.locks : {}
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyState();
      throw error;
    }
  }

  private async write(state: RepositoryState): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
    await rename(temporaryPath, this.filePath);
  }

  private mutate<T>(action: (state: RepositoryState) => T | Promise<T>): Promise<T> {
    const next = this.operation.then(async () => {
      const state = await this.read();
      const result = await action(state);
      await this.write(state);
      return result;
    });
    this.operation = next.then(() => undefined, () => undefined);
    return next;
  }

  async createJob(job: PublishJob) {
    return this.mutate((state) => {
      const existing = state.jobs.find((item) => item.idempotencyKey === job.idempotencyKey);
      if (existing) return { created: false, job: structuredClone(existing) };
      state.jobs.push(structuredClone(job));
      return { created: true, job: structuredClone(job) };
    });
  }

  async getJob(id: string) { return structuredClone((await this.read()).jobs.find((item) => item.id === id)); }
  async getJobByIdempotencyKey(key: string) { return structuredClone((await this.read()).jobs.find((item) => item.idempotencyKey === key)); }
  async listJobs(filters: { platform?: PublishPlatformKey; status?: string } = {}) {
    return structuredClone((await this.read()).jobs.filter((job) => (!filters.platform || job.platform === filters.platform) && (!filters.status || job.status === filters.status)));
  }

  async listDueVerificationJobs(now: string, limit: number) {
    const statuses = new Set(["pending_verify", "published_pending_url", "published_verified", "public_observed", "stable_published", "manual_takeover_required", "risk_blocked", "auth_expired"]);
    return structuredClone((await this.read()).jobs
      .filter((job) => statuses.has(job.status) && job.nextVerificationAt && Date.parse(job.nextVerificationAt) <= Date.parse(now))
      .sort((a, b) => String(a.nextVerificationAt).localeCompare(String(b.nextVerificationAt)))
      .slice(0, limit));
  }

  async listDuePublishJobs(now: string, limit: number, blockedPlatforms: PublishPlatformKey[] = []) {
    const blocked = new Set(blockedPlatforms);
    return structuredClone((await this.read()).jobs
      .filter((job) => job.status === "scheduled" && !blocked.has(job.platform) && Date.parse(job.scheduledAt) <= Date.parse(now))
      .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))
      .slice(0, limit));
  }

  async claimJob(id: string, workerId: string, leaseMs: number) {
    return this.mutate((state) => {
      const job = state.jobs.find((item) => item.id === id);
      if (!job) return undefined;
      const now = Date.now();
      if (job.leaseOwner && Date.parse(job.leaseExpiresAt || "") > now && job.leaseOwner !== workerId) return undefined;
      job.leaseOwner = workerId;
      job.leaseExpiresAt = new Date(now + leaseMs).toISOString();
      job.updatedAt = new Date(now).toISOString();
      return structuredClone(job);
    });
  }

  async heartbeat(id: string, workerId: string, leaseMs: number) {
    return this.mutate((state) => {
      const job = state.jobs.find((item) => item.id === id);
      if (!job || job.leaseOwner !== workerId) return false;
      job.leaseExpiresAt = new Date(Date.now() + leaseMs).toISOString();
      job.updatedAt = new Date().toISOString();
      return true;
    });
  }

  async saveJob(job: PublishJob, workerId?: string) {
    return this.mutate((state) => {
      const index = state.jobs.findIndex((item) => item.id === job.id);
      if (index < 0) throw new Error(`Publish job not found: ${job.id}`);
      if (workerId && state.jobs[index].leaseOwner && state.jobs[index].leaseOwner !== workerId) throw new Error("Publish job lease is owned by another worker.");
      const stored = structuredClone(job);
      stored.leaseOwner = undefined;
      stored.leaseExpiresAt = undefined;
      state.jobs[index] = stored;
      return structuredClone(stored);
    });
  }

  async appendAttempt(attempt: PublishAttempt) { await this.mutate((state) => { state.attempts.push(structuredClone(attempt)); }); }
  async listAttempts(jobId?: string) { return structuredClone((await this.read()).attempts.filter((attempt) => !jobId || attempt.jobId === jobId)); }
  async appendAudit(event: PublishAuditEvent) { await this.mutate((state) => { state.audits.push(structuredClone(event)); }); }
  async listAudit(jobId?: string) { return structuredClone((await this.read()).audits.filter((event) => !jobId || event.jobId === jobId)); }

  async acquireLock(key: string, owner: string, leaseMs: number) {
    return this.mutate((state) => {
      const lock = state.locks[key];
      if (lock && Date.parse(lock.expiresAt) > Date.now() && lock.owner !== owner) return false;
      state.locks[key] = { owner, expiresAt: new Date(Date.now() + leaseMs).toISOString() };
      return true;
    });
  }

  async releaseLock(key: string, owner: string) {
    await this.mutate((state) => { if (state.locks[key]?.owner === owner) delete state.locks[key]; });
  }
}
