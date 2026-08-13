# Adapter and transport guide

`PublishAdapter` owns platform validation and lifecycle behavior. `FormalPublishTransport` owns external I/O.

Implement a custom transport when your system already has an authorized API client, browser runner, or job service:

```typescript
interface FormalPublishTransport {
  checkAuth(platform): Promise<AuthStatus>;
  publish(platform, payload): Promise<PublishResult>;
  verify(platform, result): Promise<VerifyResult>;
}
```

## Required behavior

- Treat `payload.idempotencyKey` as immutable and reject duplicate external writes.
- Return `pending_verify` when the external action may have succeeded but cannot yet be confirmed.
- Never blindly retry an ambiguous publish action; verify first.
- Return `manual_takeover_required` for CAPTCHA, device confirmation, or platform risk controls.
- Do not expose cookies, tokens, DOM selectors, or raw private provider responses.

Install the transport once with `setDefaultTransport`, or inject it into `getPublishAdapter(platform, transport)` for isolated usage and tests.

## Registering a platform plugin

Use a plugin when the platform has its own adapter or capability profile:

```ts
import { registerPlatform } from "content-publish-engine/publish-engine";

registerPlatform({
  key: "example",
  displayName: "Example Platform",
  adapter,
  capabilities: {
    directPublish: true,
    scheduledPublish: false,
    publicUrlLookup: true,
    livenessCheck: true,
    coverUpload: false,
    inlineImageUpload: false
  }
});
```

Capability flags describe the executor itself. Engine-side due scheduling does not imply that a platform supports native scheduled publication, and accepting an existing platform media ID does not imply that the executor can upload raw assets.
