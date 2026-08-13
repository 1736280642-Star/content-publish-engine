# Browser selector bundles

Browser executors must load selectors from versioned JSON bundles rather than embedding account-specific DOM paths in core code. Each bundle contains `schemaVersion`, `platform`, `version`, and a `selectors` object. Required selectors participate in structure-change detection before any publish click.

Do not commit browser profiles, cookies, tokens, captured private responses, or account-specific selectors.
