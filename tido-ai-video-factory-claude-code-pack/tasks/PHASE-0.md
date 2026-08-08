# Phase 0 Task Brief

Do not implement production business logic.

## Deliverables

1. ADR monorepo/tooling.
2. ADR ORM/database.
3. ADR worker-to-API communication.
4. ADR schema code generation.
5. ADR auth.
6. Runnable local stack.
7. Lint/typecheck/test.
8. Health endpoints.
9. Mock provider framework.
10. CI.
11. Environment validation.
12. Secret handling.

## Required report before coding

- assumptions
- open decisions
- dependency compatibility
- proposed file tree
- implementation order
- rollback strategy

## Exit

- docker data services start;
- web/api/composer/workers boot;
- CI pass;
- no real provider key;
- schema validation pass;
- one fake queued job completes.
