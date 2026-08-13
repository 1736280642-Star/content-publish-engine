# Architecture

The engine begins with a completed article and ends only after platform publication and liveness verification.

```text
MCP / HTTP / SDK
       |
PublishOrchestrator -- events/audit/telemetry
       |
PublishRepository -- claims -- distributed lock contract
       |
PlatformRegistry -> adapter -> bridge/direct executor -> platform
       |                                      |
       +---- scheduler/worker <- verification-+
```

## Boundaries

- `publish-engine`: contracts, repository interfaces, registry, orchestrator, lifecycle, rules, events, assets, and metrics.
- `platforms`: platform formatting, official API executors, selector bundles, and authorization helpers.
- `servers`: MCP, HTTP, and local bridge entry points. All call the same orchestrator or executor contracts.
- `workers`: continuous due-publication and liveness processing.

The engine has no content-generation, product, campaign, planning-cycle, or editorial-workflow concepts.

## Reliability invariants

- One immutable content hash and idempotency key per job.
- An ambiguous external action is verified, never blindly repeated.
- Verification is read-only.
- Platform writes are serialized by named leases.
- Public discovery is provisional until later checks.
- Survival milestones and stable windows are persisted in the job.
- Repeated failure after a public observation can mark an article removed.

## Deployment

JSON is appropriate for one low-volume local process. SQLite provides durable local claims and WAL. Multi-instance deployments implement `PublishRepository` and `DistributedLockProvider` using transactional shared infrastructure.
