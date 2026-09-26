# Coding standards

Everything a tool can check is enforced by `pnpm check` (tsconfig, the Oxlint and Oxfmt configs, Knip, Vitest). Those configs are the source of truth for it. This file holds only what they can't check.

- Name things in the domain's words from CONTEXT.md, and avoid the terms it lists as "avoid". No ambiguous abbreviations.
- Comments explain why, not what. JSDoc for what callers need to know; line comments for implementation notes.
- Values of unknown shape are `unknown` and get narrowed with a schema or a type guard, never cast.
- Throw only `Error` subclasses. Catch only where you can handle the error or turn it into a JSON-RPC error; don't catch just to log and rethrow.
- YAGNI: no options, parameters or abstractions without a current use.
- Tests check behavior through public interfaces, not private details.
