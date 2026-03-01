# Implementation Notes

## What is implemented now
- Modular FastAPI backend with domain routers and services.
- PostgreSQL-first modeling with UUID keys and stock movement ledger.
- Purchase bill posting updates inventory batches and writes immutable stock movements.
- Packing auto-assignment with supervisor:packer grouping logic (`1:4` target).
- Delivery run optimization scaffold with route order + reverse load sequence.
- Payment recording with basic double-entry ledger rows.

## What remains for production-complete scope
- Full RBAC permission matrix tables and middleware enforcement.
- Idempotency-key middleware and request replay protection.
- Full pricing hierarchy (customer override, route contracts, schemes, effective dates).
- Full invoice versioning with immutable snapshots and audit links.
- Google Maps live optimization integration (currently deterministic ordering placeholder).
- Full accounts module (journal entries, trial balance dimensions, aging, reconciliation).
- Full HR/payroll and schemes rules engine.
- Web and mobile full feature implementation.
