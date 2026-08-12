# content-publish-engine

An experimental TypeScript engine for governed AI content production and multi-platform publishing in the Chinese content ecosystem.

> Status: `v0.1 experimental`. The deterministic production, validation, persistence, and lifecycle primitives are usable. Real publishing requires an authorized local bridge or a custom transport and must be validated against each platform's current rules.

## What it provides

- A frozen production contract that combines evidence, product, content-type, channel, expression, and promotion rules.
- Deterministic output checks for structure, traceable facts, prohibited terms, CTA integrity, URLs, and cross-channel similarity.
- WeChat, Juejin, CSDN, and Zhihu adapter contracts with `mock`, disabled, and real modes.
- Idempotent publish jobs, platform locks, persisted results, verification backoff, liveness states, and reliability metrics.
- Qwen, DeepSeek, and Doubao through an OpenAI-compatible provider interface.
- A standalone MCP server exposing publish preparation, execution, verification, and liveness tools.

## Safety model

Real publishing is disabled by default. Without `DIRECT_PUBLISH_ENABLED=true`, adapters run in mock mode unless `DIRECT_PUBLISH_MOCK=false` explicitly disables publishing. The built-in bridge transport only accepts loopback hosts and requires a bearer token.

The project does not ship browser selectors, cookies, platform credentials, or mechanisms intended to bypass CAPTCHA or platform risk controls. Use only accounts, APIs, and automation methods you are authorized to operate.

## Requirements

- Node.js 20 or newer
- npm 10 or newer recommended

## Install and verify

```bash
npm ci
npm run check
```

`npm run check` runs TypeScript checks, JavaScript syntax checks, tests, a clean build, and import checks against the built package.

## Package entry points

```typescript
import { compileProductionContract } from "content-publish-engine/content-production";
import { getCalendarMonthBounds } from "content-publish-engine/free-production";
import { getPublishAdapter, setDefaultTransport } from "content-publish-engine/publish-engine";
import { createBrowserPublishJobStore } from "content-publish-engine/platforms";
import { callAiProvider } from "content-publish-engine/ai-provider";
```

The repository can be used directly after `npm run build`. Publishing to npm is optional; before doing so, add the final GitHub `repository`, `bugs`, and `homepage` metadata to `package.json`.

## Mock publishing

```typescript
import { getPublishAdapter } from "content-publish-engine/publish-engine";

const adapter = getPublishAdapter("juejin");
const auth = await adapter.checkAuth();
// Mock mode is the default and never writes to an external platform.
```

## Real publishing

The default `BridgeTransport` calls an authorized local service:

```dotenv
DIRECT_PUBLISH_ENABLED=true
WECHATSYNC_BRIDGE_URL=http://127.0.0.1:9528
WECHATSYNC_BRIDGE_TOKEN=replace-with-a-local-secret
```

The bridge must implement `POST /auth/check`, `POST /publish`, and `POST /publish/verify`. A custom transport is usually the simplest integration path; see [`examples/custom-transport.mjs`](examples/custom-transport.mjs) and [`docs/adapter-guide.md`](docs/adapter-guide.md).

## MCP server

From a source checkout:

```bash
npm run mcp:start
```

From a built or installed package:

```bash
content-publish-engine-mcp
```

The server persists jobs and publish results to `.data/publish-jobs.json` by default. Override it with `PUBLISH_JOB_STORE_PATH`.

Available tools:

- `platform_auth_probe`
- `publish_content_preflight`
- `publish_job_create`
- `publish_job_run`
- `publish_job_get`
- `publish_job_verify`
- `publish_liveness_check`
- `publish_verification_due`

## Content media protocol

`content-media://media-asset-<uuid>` references can be rewritten to HTTPS URLs through `rewriteContentMediaSources`. The resolver is provided by the host application; the package does not assume a specific media backend.

## Configuration

Copy `.env.example` and supply only the providers and publishing mode you use. Never commit the resulting `.env` file. See [`docs/architecture.md`](docs/architecture.md) for component boundaries and durability behavior.

## Known limitations

- Platform adapters define validation and lifecycle behavior; real platform actions still require a bridge or custom transport.
- No live platform credentials are exercised in CI.
- File-backed job persistence is intended for a single local process or low-volume deployment, not distributed workers.
- Provider output quality and platform policy compliance remain the operator's responsibility.

## Contributing and security

See [`CONTRIBUTING.md`](CONTRIBUTING.md) before opening a pull request. Report vulnerabilities according to [`SECURITY.md`](SECURITY.md), not through a public issue.

## License

[MIT](LICENSE)
