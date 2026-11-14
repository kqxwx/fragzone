# FRAGZONE administrator two-factor authentication

## Cloudflare secret required before production rollout

The API encrypts TOTP seeds at rest with AES-256-GCM. Before merging/deploying this change, create a 32-byte key locally:

```sh
openssl rand -hex 32
```

In Cloudflare Pages → fragzone → Settings → Variables and Secrets → Production, add a **Secret** named `TOTP_ENCRYPTION_KEY` and paste the generated 64-character hex value. Do not commit it, put it in a frontend variable, or send it in chat. Add the same secret to Preview only if preview deployments should allow staff logins.

Keep a secure offline copy. Losing or rotating this key makes existing encrypted TOTP seeds unreadable; staff will need an owner-assisted reset and re-enrollment.

## First login after deployment

- Existing staff sessions are no longer accepted because they predate MFA verification.
- Each staff member signs in with the usual email and password.
- On first login, the panel displays a setup key. In Google Authenticator choose **+ → Enter a setup key**, account name FRAGZONE, key type **Time based**, and enter the key.
- Enter the six-digit code to activate MFA.
- Save the one-time recovery codes in a password manager or another secure offline location.
- Subsequent logins require the current six-digit code. A recovery code can be used once if the phone is unavailable.

The setup key is shown only during enrollment and is never sent to an external QR service.

## Owner-only safeguards

- Owner sessions expire server-side after 8 hours; other staff sessions after 12 hours; player sessions retain the existing 14-day lifetime.
- Sensitive owner operations (role changes, settings changes, staff 2FA reset, and session revocation) require a fresh TOTP confirmation. The confirmation lasts five minutes.
- The owner can reset a staff member's 2FA from OWNER CONTROL. This revokes that staff member's sessions and forces enrollment on next login.
- The owner account itself cannot be reset from the staff reset control; use its one-time recovery codes if the authenticator is lost.

## Data safety

This change adds tables for encrypted TOTP secrets, short-lived login challenges, and hashed one-time recovery codes, plus MFA flags on sessions. It does not modify users, roles, tickets, punishments, or other existing account data.
