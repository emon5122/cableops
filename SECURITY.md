# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| latest  | ✅        |

## Reporting a Vulnerability

If you discover a security vulnerability in CableOps, please report it responsibly.

### How to Report

1. **Do NOT** open a public GitHub issue for security vulnerabilities
2. Email your report to the project maintainers with the subject line: `[SECURITY] CableOps vulnerability report`
3. Include:
   - A description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)

### What to Expect

- **Acknowledgment** within 48 hours of your report
- **Assessment** within 7 days — we will evaluate severity and impact
- **Fix timeline** communicated after assessment
- **Credit** given to reporters in the release notes (unless you prefer anonymity)

## Security Considerations

### Authentication

CableOps uses [better-auth](https://www.better-auth.com/) for authentication with secure session management. Sessions are stored server-side in PostgreSQL.

### Database

- All database queries use parameterized statements via Drizzle ORM (no raw SQL injection risk)
- Database credentials should be stored in environment variables, never in source code

### Environment Variables

The following secrets must be kept confidential:

| Variable | Sensitivity |
|----------|------------|
| `DATABASE_URL` | Contains database credentials |
| `BETTER_AUTH_SECRET` | Used for session signing — compromise allows session forgery |

### Best Practices for Deployment

- Use HTTPS in production
- Set strong, unique values for `BETTER_AUTH_SECRET`
- Restrict database access to the application server only
- Keep dependencies updated — run `pnpm audit` regularly
- Use environment-specific configurations (never share `.env` files)

## Dependencies

We monitor dependencies for known vulnerabilities. Run `pnpm audit` to check for issues locally.
