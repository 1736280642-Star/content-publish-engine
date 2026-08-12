# Official platform rule preflight

The publish engine separates two concerns:

1. **Payload validity** checks whether required engine fields such as `title` and `markdown` are present.
2. **Official platform rules** check only objective requirements supported by an identified first-party source.

The engine does not provide default rules for article length, promotional wording, technical depth, or external-link count. Those are editorial choices unless a platform publishes an objective constraint that can be represented and verified.

## Current coverage

| Platform | Coverage | Built-in behavior |
| --- | --- | --- |
| WeChat Official Account | `not_verified` | No platform-specific blocker is inferred. The configured transport and platform response are authoritative. |
| Juejin | `not_verified` | No category, tag, length, technical-depth, promotion, or link-count rule is inferred. |
| CSDN | `partial` | Missing article tags produces a sourced warning, not a blocker. |
| Zhihu | `not_verified` | No platform-specific blocker is inferred. The configured transport and platform response are authoritative. |

Current first-party source:

- CSDN Blog Development Team, [CSDN 博客创作中心使用指南](https://blog.csdn.net/blogdevteam/article/details/119778725), accessed 2026-08-12. The guide describes adding article tags in the editor workflow. It does not establish a stable public publishing API contract, so the engine reports a warning and lets the live adapter/platform decide.

## Maintenance rule

A new platform check must include:

- a first-party URL and publisher;
- the date the source was reviewed;
- an objective condition that can be evaluated from `PlatformPublishPayload`;
- a test showing the rule does not mutate user content;
- a decision on whether the condition is a blocker or warning, based on explicit wording in the source.

If any of those are missing, keep coverage as `not_verified` or `partial` and delegate enforcement to the transport. Never convert workbench-specific editorial preferences into publish-engine rules.
