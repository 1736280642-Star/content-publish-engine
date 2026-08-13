# content-publish-engine

An automation engine that takes a completed article, publishes it to external platforms, discovers the public URL, and keeps verifying that the article remains live.

It deliberately does **not** generate, rewrite, plan, or score content. Your CMS, editor, AI agent, or Markdown workflow owns the article; this engine owns reliable publication.

## Publishing lifecycle

```text
completed article -> scheduled job -> authenticated publish -> platform acceptance
                  -> public URL discovery -> provisional public observation
                  -> 24h check -> 72h stable publication -> removal detection
```

Unlike draft-sync tools, a successful job means the engine performed the publish action and entered verification. Draft creation alone is not treated as publication.

## Included capabilities

- Adapter registry for WeChat Official Account, Juejin, CSDN, Zhihu, and third-party plugins.
- Idempotent jobs, content hashes, platform write locks, worker leases, and duplicate protection.
- Immediate and scheduled publication through one `PublishOrchestrator`.
- Read-only verification that never repeats an ambiguous publish action.
- Public URL discovery, verification backoff, 24/72-hour survival checks, stable publication, rejection, timeout, and removal states.
- JSON and SQLite repositories plus a distributed lock/repository contract.
- Long-running worker, MCP server, HTTP API, and authenticated local bridge.
- Webhook events, durable audit events, and in-process telemetry primitives.
- Versioned official-rule registry with source metadata.
- Generic asset resolution/upload contracts.
- Versioned browser-selector bundles and structure-change detection.
- An included WeChat Official Account executor using the official draft and free-publish APIs.

## Requirements

- Node.js 22.5 or newer. Node 24 LTS is recommended.

```bash
npm ci
npm run check
```

## SDK

```ts
import {
  PublishOrchestrator,
  SqlitePublishRepository
} from "content-publish-engine/publish-engine";

const repository = new SqlitePublishRepository(".data/publish.db");
const engine = new PublishOrchestrator({ repository });

const { job } = await engine.createJob({
  jobId: "request-42",
  platform: "wechat",
  article: {
    sourceId: "cms-article-42",
    title: "A completed article",
    markdown: "<p>Final HTML or Markdown body</p>",
    scheduledAt: new Date().toISOString()
  }
});

await engine.runPublishJob(job.id);
```

## Runtime entry points

```bash
npm run mcp:start
npm run http:start
npm run worker:start
npm run bridge:start
```

The worker processes due verification jobs before new publish jobs. SQLite is the default runtime repository; set `PUBLISH_REPOSITORY=json` for low-volume local JSON storage.

HTTP endpoints:

- `POST /v1/jobs`
- `GET /v1/jobs`
- `GET /v1/jobs/:id`
- `POST /v1/jobs/:id/run`
- `POST /v1/jobs/:id/verify`
- `POST /v1/run-due`
- `GET /v1/reliability`
- `GET /v1/telemetry`

MCP tools include platform discovery/auth, preflight, job creation/execution/read-only verification, due-job execution, liveness checks, and reliability metrics.

## Real platform execution

The built-in transport calls an authenticated loopback bridge:

```dotenv
PUBLISH_ENABLED=true
PUBLISH_BRIDGE_URL=http://127.0.0.1:9528
PUBLISH_BRIDGE_TOKEN=replace-with-a-local-secret
```

The repository includes a WeChat Official Account executor. Other platforms use the same plugin and transport contracts and require an authorized executor supplied by the operator. The project never ships account cookies or attempts to bypass CAPTCHA or risk controls.

Before the first live write, record the operator's explicit authorization locally:

```bash
npm run authorize -- wechat operator-name
```

The authorization record contains no platform credential and is ignored by Git through `.data/`.

For the included WeChat executor, also set `WECHAT_APP_ID` and `WECHAT_APP_SECRET`, start the bridge, then run the worker or call the HTTP/MCP run endpoint. The executor creates the official draft when needed, submits the free-publish action, and queries the same task for its public URL; it never treats draft creation as successful publication.

See [adapter guide](docs/adapter-guide.md), [official rule policy](docs/official-platform-rules.md), and [live authorization](docs/live-authorization.md).

## Storage and scale

- JSON: single-process local use.
- SQLite: durable local service with WAL and transactional claims/locks.
- Distributed deployments: implement `PublishRepository` and `DistributedLockProvider` with your database and lock service.

## License

[MIT](LICENSE)
