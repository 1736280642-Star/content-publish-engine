# Contributing

## Development workflow

1. Use Node.js 22.5 or newer; Node.js 24 LTS is recommended.
2. Run `npm ci`.
3. Add or update tests with the change.
4. Run `npm run check` before opening a pull request.

Keep platform-specific network actions behind `FormalPublishTransport`. Core packages must remain usable without platform credentials or any host application.

## Pull requests

- Explain the problem, implementation logic, and user impact.
- Keep real publishing disabled by default.
- Include failure handling and a safe next action in user-facing errors.
- Do not include credentials, cookies, private URLs, proprietary content, or production data.
- Treat changes to idempotency, job persistence, verification, and lifecycle states as high risk and add restart/concurrency tests.

## Adding a platform

Implement the four adapter phases: `checkAuth`, `validatePayload`, `publish`, and `verify`. Document required configuration, expected bridge responses, idempotency behavior, manual-takeover conditions, and platform-policy limitations.
