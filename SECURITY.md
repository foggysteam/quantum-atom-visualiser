# Security Policy

## Reporting a vulnerability

Please report security issues privately rather than opening a public issue.

Use GitHub's [private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability)
on this repository (Security tab → Report a vulnerability).

Expect an acknowledgement within a week. There is no bounty programme.

## Threat model

Being clear about what this project is helps set expectations about what a
vulnerability in it would even mean.

This is a **fully client-side static web application**. It has:

- no server, no backend and no API
- no authentication, accounts or sessions
- no database
- no network requests at runtime (nothing is fetched, uploaded or reported)
- no secrets, API keys or credentials, and no configuration that could hold any
- no user-generated content, uploads or file parsing
- no cookies, and no analytics or third-party tracking

The only persisted state is two browser `localStorage` keys holding interface
preferences (HUD scale, and whether a first-run notice has been dismissed).
Both are validated against an allow-list when read, so a tampered value falls
back to the default rather than being trusted.

All computation is numerical physics running locally in the browser and in GPU
shaders. Nothing leaves the machine.

The realistic risks are therefore:

1. **Supply chain.** A compromised or malicious npm dependency. This is the main
   one and is addressed below.
2. **Hosting.** If you deploy the built output, the security of that deployment
   is yours: serve over HTTPS and set sensible response headers.
3. **Denial of service against yourself.** The renderer can be pushed to
   settings that will stall a weak GPU. That is a usability limit, not a
   security boundary.

## Dependency hygiene

The dependency tree is deliberately small: React, Three.js, and the Vite and
Vitest toolchains. There are no runtime dependencies beyond React and Three.js.

- `package-lock.json` is committed, so installs are reproducible.
- Use `npm ci` rather than `npm install` for reproducible, lockfile-exact installs.
- `npm run audit` checks for known advisories at moderate severity or above.

At the time of release the tree reports **0 known vulnerabilities**.

## If you self-host the built output

The build is static files. A reasonable Content Security Policy is:

```
default-src 'self';
script-src 'self';
style-src 'self' 'unsafe-inline';
img-src 'self' data:;
connect-src 'none';
object-src 'none';
base-uri 'self';
frame-ancestors 'none';
```

`style-src` needs `'unsafe-inline'` because the app sets a small number of
inline styles for grid placement and colour. `connect-src 'none'` is accurate:
the application makes no network requests after load.
