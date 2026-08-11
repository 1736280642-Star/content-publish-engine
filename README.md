# content-publish-engine

AI content production and multi-platform publish engine for the Chinese content ecosystem.

## Features

### Content Production

- **Production Contract Compiler** — Compile task, evidence, product rules, channel rules, and expression rules into a single immutable `ProductionContractSnapshot` with 7 consistency assertions.
- **Output Validator** — Validate AI-generated markdown against the contract: title match, length range, required sections/artifacts, prohibited terms, fact trace verification, CTA integrity, URL allowlist, sensitive output detection, cross-channel similarity (shingle).
- **Promotion Resolver** — Deterministic CTA selection engine with multi-dimensional ranking (entity, channel, intent, content type, primary entity, priority) and conflict detection.
- **Production Service** — Orchestrate generate → validate → repair → re-validate with 3x technical retry and 1x repair attempt.
- **Free Production** — Lightweight content production framework with expression presets, risk/gap panels, file-based state repository, and brand-configurable WeChat layout renderer.

### Publish Engine

- **Multi-platform Adapters** — WeChat, Juejin, CSDN, Zhihu adapters with `checkAuth / validatePayload / publish / verify` four-phase interface and `mock / dry_run / real` mode switching.
- **Transport Injection** — Pluggable `FormalPublishTransport` interface with default `BridgeTransport` implementation for local bridge communication.
- **Verification Lifecycle** — Backoff-based verification scheduling with stable window (72h default), timeout detection (168h default), and state machine for `public_observed → stable_published → removed_after_publish`.
- **Reliability Metrics** — Submission acceptance rate, public conversion rate, 24h/72h survival rates, risk block rate, duplicate publish rate, URL backfill latency.
- **Rollout Readiness** — Threshold-based readiness evaluation with configurable blockers.
- **Engineering Primitives** — SHA256 idempotency keys, serialized mutation queue, observed verification deduplication, platform result merging.
- **Content Preflight** — Pre-publish content checks: title length, content depth, promotion risk, external link count, with Juejin-specific strict rules and one-time rewrite.

### Platform Protocol Library

- **CSDN Gateway** — HMAC-SHA256 API gateway header generation.
- **CSDN Format** — Markdown normalization (heading hierarchy shift, collapsed heading expansion) and HTML rendering.
- **WeChat Publish** — Formal publish status normalization and polling verification.
- **WeChat Content** — Article content format resolution (wechat_html or markdown).
- **Media Rewrite** — `workbench-media://` protocol to HTTPS URL rewriting.
- **Job Store** — File-based publish job queue with platform-level mutex locks and lease management.
- **Idempotency Ledger** — File-based idempotency tracking.

### AI Provider

- Unified calling layer for Qwen (DashScope), DeepSeek, and Doubao.
- OpenAI-compatible `chat/completions` interface.
- Timeout control, network/authentication error normalization.
- Standalone environment variable detection (no runtime-config dependency).

## Project Structure

```
content-publish-engine/
├── packages/
│   ├── content-production/     # Content production domain model (5 modules)
│   ├── free-production/        # Free content production framework (6 modules)
│   ├── publish-engine/         # Multi-platform publish engine (12 modules)
│   ├── platforms/              # Platform protocol library (7 modules, .mjs)
│   └── ai-provider/           # AI Provider unified layer (2 modules)
├── tests/                      # Test suite
├── package.json
└── tsconfig.json
```

## Quick Start

```bash
npm install
npm run typecheck
npm test
```

## Usage

### Content Production

```typescript
import { compileProductionContract, validateProductionOutput, runContentProduction } from "content-publish-engine/content-production";

const contract = compileProductionContract({
  task, evidencePack, productRule, contentTypeRule, channelRule, expressionRule,
  governance, promotionProfiles
});

const result = await runContentProduction({ contract, model: yourAiModel });
```

### Publish Engine

```typescript
import { getPublishAdapter, preflightPublishContent, buildPublishIdempotencyKey } from "content-publish-engine/publish-engine";

const adapter = getPublishAdapter("juejin");
const authStatus = await adapter.checkAuth();
const preflight = preflightPublishContent({ platform: "juejin", title, markdown });
const idempotencyKey = buildPublishIdempotencyKey(scheduleId, "juejin", contentHash);
```

### Custom Transport

```typescript
import { setDefaultTransport, type FormalPublishTransport } from "content-publish-engine/publish-engine";

const myTransport: FormalPublishTransport = {
  checkAuth: async (platform) => { ... },
  publish: async (platform, payload) => { ... },
  verify: async (platform, result) => { ... },
};

setDefaultTransport(myTransport);
```

### AI Provider

```typescript
import { callAiProvider } from "content-publish-engine/ai-provider";

const result = await callAiProvider({
  provider: "qwen",
  systemPrompt: "You are a technical writer.",
  userPrompt: "Write about...",
});
```

## Environment Variables

### AI Provider

| Variable | Description |
|----------|-------------|
| `DASHSCOPE_API_KEY` | Qwen API key |
| `QWEN_MODEL` | Qwen model name |
| `DEEPSEEK_API_KEY` | DeepSeek API key |
| `DEEPSEEK_MODEL` | DeepSeek model name |
| `DOUBAO_API_KEY` | Doubao API key |
| `DOUBAO_MODEL` | Doubao model name |

### Publish Engine

| Variable | Description | Default |
|----------|-------------|---------|
| `DIRECT_PUBLISH_ENABLED` | Enable real publishing | `false` (mock) |
| `WECHATSYNC_BRIDGE_URL` | Local bridge URL | `http://127.0.0.1:9528` |
| `WECHATSYNC_BRIDGE_TOKEN` | Bridge auth token | — |
| `DIRECT_PUBLISH_STABLE_AFTER_HOURS` | Stable window | `72` |
| `DIRECT_PUBLISH_VERIFICATION_TIMEOUT_HOURS` | Verification timeout | `168` |

## License

MIT
