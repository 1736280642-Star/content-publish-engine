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
