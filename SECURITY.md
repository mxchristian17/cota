# Security policy

## Supported versions

Security fixes are made on the latest release.

| Version | Supported |
| --- | --- |
| 1.x | ✅ |

## Reporting a vulnerability

Please **do not open a public issue**. Use GitHub's private vulnerability reporting:
go to the repository's **Security** tab and choose **Report a vulnerability**.

Include what is affected (the web app, the optional server, a file importer…), how to reproduce it and the
impact you expect. You will get an answer within a few days. Once a fix is released, the report is published
with credit to you, unless you prefer otherwise.

## Scope notes

- The web app runs entirely in the browser; drawings opened from disk never leave the machine unless the user
  saves them to a server.
- The optional server stores password hashes (bcrypt), signs sessions with `JWT_SECRET` and encrypts the users'
  LLM keys with `SECRETS_ENCRYPTION_KEY`. In production it refuses to start with the default secrets. See
  [self-hosting](docs/self-hosting.md).
- DWG conversion runs external LibreDWG programs on uploaded files: keep them up to date on your server.
