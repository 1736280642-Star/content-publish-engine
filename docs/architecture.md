# Architecture

The project separates deterministic decision logic from external side effects.

```text
Evidence and rules
       |
       v
Content production contract -> model generation -> deterministic validation
                                                     |
                                                     v
Publish preflight -> adapter -> transport -> authorized bridge/platform
                         |                       |
                         v                       v
                 persisted job/result <- verify and liveness lifecycle
```

## Package boundaries

- `content-production`: immutable contracts, promotion resolution, generation orchestration, and validation.
- `free-production`: lightweight planning, risk gates, presentation, and file persistence.
- `publish-engine`: adapters, transport interface, idempotency, lifecycle, and reliability metrics.
- `platforms`: protocol helpers and file-backed job/ledger primitives.
- `ai-provider`: OpenAI-compatible provider calls and configuration checks.
- `servers`: MCP-facing orchestration. It must not contain credentials or platform automation details.

## Durability

MCP jobs persist their executable payload, lease state, terminal state, and latest publish/verification result. `publish_job_run` claims a job before executing and persists the result before returning. A restarted server can inspect and verify a completed job without republishing it.

The JSON store uses atomic rename writes and platform-level leases. It is appropriate for one local MCP server. Use a transactional database and distributed lock when multiple processes must execute jobs.

## Trust boundaries

AI output is untrusted and must pass deterministic validation. External transport responses are normalized into a finite status set. Credentials stay in the host environment and are never returned through MCP tools.
