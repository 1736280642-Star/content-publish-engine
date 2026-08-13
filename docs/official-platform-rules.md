# Official platform rule preflight

The engine separates payload validity from objective platform rules.

- Payload checks only require fields needed to execute a job, such as `title` and `markdown`.
- Platform checks are accepted only when they cite a first-party source, carry a rule version and review date, and can be evaluated without changing the article.

The engine does not assume limits for article length, promotional wording, technical depth, or external-link count. Those remain the caller's editorial decisions unless a platform publishes an explicit, machine-verifiable requirement.

## Current coverage

| Platform | Coverage | Built-in behavior |
| --- | --- | --- |
| WeChat Official Account | `not_verified` | The official API response and configured executor are authoritative. |
| Juejin | `not_verified` | No editorial rule is inferred. |
| CSDN | `partial` | Missing article tags produces a sourced warning, not a blocker. |
| Zhihu | `not_verified` | No editorial rule is inferred. |

Current first-party source:

- CSDN Blog Development Team, [CSDN Blog Creation Center User Guide](https://blog.csdn.net/blogdevteam/article/details/119778725), reviewed 2026-08-12. It describes article tags in the editor flow but does not establish a stable public publishing API contract.

## Adding or updating a rule

Every rule must include a first-party URL and publisher, review date, version, effective date, objective condition, non-mutating test, and an evidence-based blocker-or-warning decision. Otherwise keep coverage `not_verified` or `partial` and let the live platform response decide.
