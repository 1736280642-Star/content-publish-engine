# Security policy

## Supported version

Security fixes currently target the latest `0.1.x` release line. The project is experimental and does not promise production support.

## Reporting a vulnerability

Do not open a public issue containing credentials, private platform URLs, request bodies, or exploit details. Contact the repository maintainer privately through the security-reporting channel configured on the GitHub repository. Include the affected version, impact, reproduction steps with redacted data, and a proposed mitigation when possible.

Until a private contact is configured, keep the repository private rather than publishing a vulnerability report publicly.

## Credential boundaries

- Keep API keys and bridge tokens in environment variables or a local secret manager.
- Never commit `.env`, cookies, browser profiles, private URLs, or captured platform sessions.
- The default bridge transport accepts only loopback hosts and requires `WECHATSYNC_BRIDGE_TOKEN`.
- Logs and issue reports must redact authorization headers, provider responses containing private data, and unpublished content.

## Platform safety

Use only platform accounts and publishing methods you are authorized to automate. Do not add CAPTCHA bypasses, credential extraction, stealth automation, or undocumented account takeover behavior.
