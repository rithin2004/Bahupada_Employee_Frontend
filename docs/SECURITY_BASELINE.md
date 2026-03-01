# Security Baseline

## Implemented controls
- Argon2 password hashing.
- Account lock handling fields and failed-attempt counter.
- JWT access and refresh token separation.
- Role field at employee layer for policy expansion.

## Mandatory next controls before production
- Enforce lock duration and reset policy in auth flow.
- Add token revocation store (Redis) for refresh token rotation.
- Add API rate limiting per IP + user.
- Add audit logging middleware for sensitive endpoints.
- Add WAF and TLS termination configuration.
- Move secrets to managed secret store.
- Add SAST/DAST and dependency scans in CI.
