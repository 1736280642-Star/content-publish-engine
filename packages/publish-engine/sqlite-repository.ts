import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { PublishAuditEvent, PublishRepository } from "./repository.js";
import type { PublishAttempt, PublishJob, PublishPlatformKey } from "./types.js";

export class SqlitePublishRepository implements PublishRepository {
  private readonly db: DatabaseSync;

  constructor(filePath: string) {
    mkdirSync(dirname(filePath), { recursive: true });
    this.db = new DatabaseSync(filePath);
    this.db.exec("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS publish_jobs (id TEXT PRIMARY KEY, idempotency_key TEXT UNIQUE NOT NULL, platform TEXT NOT NULL, status TEXT NOT NULL, scheduled_at TEXT NOT NULL, next_verification_at TEXT, lease_owner TEXT, lease_expires_at TEXT, data TEXT NOT NULL); CREATE INDEX IF NOT EXISTS idx_publish_due ON publish_jobs(status, scheduled_at); CREATE INDEX IF NOT EXISTS idx_verify_due ON publish_jobs(status, next_verification_at); CREATE TABLE IF NOT EXISTS publish_attempts (id TEXT PRIMARY KEY, job_id TEXT NOT NULL, started_at TEXT NOT NULL, data TEXT NOT NULL); CREATE TABLE IF NOT EXISTS publish_audit (id TEXT PRIMARY KEY, job_id TEXT, occurred_at TEXT NOT NULL, data TEXT NOT NULL); CREATE TABLE IF NOT EXISTS publish_locks (lock_key TEXT PRIMARY KEY, owner TEXT NOT NULL, expires_at TEXT NOT NULL);");
  }

  private rowJob(row: unknown): PublishJob | undefined { return row ? JSON.parse(String((row as { data: unknown }).data)) as PublishJob : undefined; }
  private upsert(job: PublishJob) {
    this.db.prepare("INSERT INTO publish_jobs(id,idempotency_key,platform,status,scheduled_at,next_verification_at,lease_owner,lease_expires_at,data) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET platform=excluded.platform,status=excluded.status,scheduled_at=excluded.scheduled_at,next_verification_at=excluded.next_verification_at,lease_owner=excluded.lease_owner,lease_expires_at=excluded.lease_expires_at,data=excluded.data").run(job.id, job.idempotencyKey, job.platform, job.status, job.scheduledAt, job.nextVerificationAt ?? null, job.leaseOwner ?? null, job.leaseExpiresAt ?? null, JSON.stringify(job));
  }

  async createJob(job: PublishJob) {
    const result = this.db.prepare("INSERT OR IGNORE INTO publish_jobs(id,idempotency_key,platform,status,scheduled_at,next_verification_at,lease_owner,lease_expires_at,data) VALUES(?,?,?,?,?,?,?,?,?)").run(job.id, job.idempotencyKey, job.platform, job.status, job.scheduledAt, job.nextVerificationAt ?? null, job.leaseOwner ?? null, job.leaseExpiresAt ?? null, JSON.stringify(job));
    if (result.changes > 0) return { created: true, job };
    const existing = await this.getJobByIdempotencyKey(job.idempotencyKey);
    if (!existing) throw new Error(`Publish job ID conflicts with an existing job: ${job.id}`);
    return { created: false, job: existing };
  }
  async getJob(id: string) { return this.rowJob(this.db.prepare("SELECT data FROM publish_jobs WHERE id=?").get(id)); }
  async getJobByIdempotencyKey(key: string) { return this.rowJob(this.db.prepare("SELECT data FROM publish_jobs WHERE idempotency_key=?").get(key)); }
  async listJobs(filters: { platform?: PublishPlatformKey; status?: string } = {}) {
    return (this.db.prepare("SELECT data FROM publish_jobs ORDER BY scheduled_at").all() as unknown[]).map((row) => this.rowJob(row)!).filter((job) => (!filters.platform || job.platform === filters.platform) && (!filters.status || job.status === filters.status));
  }
  async listDueVerificationJobs(now: string, limit: number) {
    return (this.db.prepare("SELECT data FROM publish_jobs WHERE next_verification_at IS NOT NULL AND next_verification_at<=? ORDER BY next_verification_at LIMIT ?").all(now, limit) as unknown[]).map((row) => this.rowJob(row)!);
  }
  async listDuePublishJobs(now: string, limit: number, blockedPlatforms: PublishPlatformKey[] = []) {
    return (this.db.prepare("SELECT data FROM publish_jobs WHERE status='scheduled' AND scheduled_at<=? ORDER BY scheduled_at LIMIT ?").all(now, limit * 2) as unknown[]).map((row) => this.rowJob(row)!).filter((job) => !blockedPlatforms.includes(job.platform)).slice(0, limit);
  }
  async claimJob(id: string, workerId: string, leaseMs: number) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const job = await this.getJob(id); if (!job) { this.db.exec("ROLLBACK"); return undefined; }
      if (job.leaseOwner && Date.parse(job.leaseExpiresAt || "") > Date.now() && job.leaseOwner !== workerId) { this.db.exec("ROLLBACK"); return undefined; }
      job.leaseOwner = workerId; job.leaseExpiresAt = new Date(Date.now() + leaseMs).toISOString(); job.updatedAt = new Date().toISOString(); this.upsert(job); this.db.exec("COMMIT"); return job;
    } catch (error) { this.db.exec("ROLLBACK"); throw error; }
  }
  async heartbeat(id: string, workerId: string, leaseMs: number) { const job = await this.getJob(id); if (!job || job.leaseOwner !== workerId) return false; job.leaseExpiresAt = new Date(Date.now() + leaseMs).toISOString(); this.upsert(job); return true; }
  async saveJob(job: PublishJob, workerId?: string) { const current = await this.getJob(job.id); if (!current) throw new Error(`Publish job not found: ${job.id}`); if (workerId && current.leaseOwner && current.leaseOwner !== workerId) throw new Error("Publish job lease is owned by another worker."); job.leaseOwner = undefined; job.leaseExpiresAt = undefined; this.upsert(job); return job; }
  async appendAttempt(attempt: PublishAttempt) { this.db.prepare("INSERT INTO publish_attempts(id,job_id,started_at,data) VALUES(?,?,?,?)").run(attempt.id, attempt.jobId, attempt.startedAt, JSON.stringify(attempt)); }
  async listAttempts(jobId?: string) { const rows = jobId ? this.db.prepare("SELECT data FROM publish_attempts WHERE job_id=? ORDER BY started_at").all(jobId) : this.db.prepare("SELECT data FROM publish_attempts ORDER BY started_at").all(); return (rows as Array<{ data: unknown }>).map((row) => JSON.parse(String(row.data)) as PublishAttempt); }
  async appendAudit(event: PublishAuditEvent) { this.db.prepare("INSERT INTO publish_audit(id,job_id,occurred_at,data) VALUES(?,?,?,?)").run(event.id, event.jobId ?? null, event.occurredAt, JSON.stringify(event)); }
  async listAudit(jobId?: string) { const rows = jobId ? this.db.prepare("SELECT data FROM publish_audit WHERE job_id=? ORDER BY occurred_at").all(jobId) : this.db.prepare("SELECT data FROM publish_audit ORDER BY occurred_at").all(); return (rows as Array<{ data: unknown }>).map((row) => JSON.parse(String(row.data)) as PublishAuditEvent); }
  async acquireLock(key: string, owner: string, leaseMs: number) { this.db.exec("BEGIN IMMEDIATE"); try { const row = this.db.prepare("SELECT owner,expires_at FROM publish_locks WHERE lock_key=?").get(key) as { owner: string; expires_at: string } | undefined; if (row && Date.parse(row.expires_at) > Date.now() && row.owner !== owner) { this.db.exec("ROLLBACK"); return false; } this.db.prepare("INSERT INTO publish_locks(lock_key,owner,expires_at) VALUES(?,?,?) ON CONFLICT(lock_key) DO UPDATE SET owner=excluded.owner,expires_at=excluded.expires_at").run(key, owner, new Date(Date.now()+leaseMs).toISOString()); this.db.exec("COMMIT"); return true; } catch(error) { this.db.exec("ROLLBACK"); throw error; } }
  async releaseLock(key: string, owner: string) { this.db.prepare("DELETE FROM publish_locks WHERE lock_key=? AND owner=?").run(key, owner); }
  close() { this.db.close(); }
}
