# Contributing to Cota

Thanks for helping! Bug reports, ideas, documentation, examples and code are all welcome.

## Reporting bugs and asking for features

Open an [issue](https://github.com/mxchristian17/cota/issues/new/choose). For bugs, the most useful report is the
**exact sequence of commands** you typed (Cota is command driven, so a bug can usually be replayed from it),
what you expected, what happened, and your browser. Attach the `.cota` file if you can.

Security problems: see [SECURITY.md](SECURITY.md), do not open a public issue.

## Development setup

```bash
git clone https://github.com/mxchristian17/cota.git
cd cota/services/web
npm install
npm run dev
```

The optional server is in `services/api` (see its [README](services/api/README.md)). The web app works
without it. Read the [architecture guide](docs/architecture.md) before a large change.

## Before you open a pull request

```bash
cd services/web
npm run typecheck
npm test
npm run test:e2e          # npx playwright install chromium, once
```

and, if you touched the server, `.venv/bin/pytest` and `.venv/bin/ruff check .` in `services/api`.

- **Tests:** new behavior needs tests. Commands are tested headless with `src/test/engineHarness.ts`, which
  types input into the command line exactly like a user; UI flows get a Playwright test in `tests/e2e/`.
- **Commands:** a new command goes in `src/core/commands/impl/`, is registered in `registry.ts`, appears
  in a menu in `src/core/ui/menus.ts`, and the reference is regenerated with
  `UPDATE_DOCS=1 npx vitest run commandsDoc`.
- **Behavior:** Cota follows the conventions CAD users expect (prompts, options, defaults, mouse buttons). When in
  doubt, match the long-established behavior of classic desktop CAD and describe it in the PR.
- **Scope:** keep pull requests focused on one change. Describe what changed and how you tested it.
- **Style:** TypeScript strict, small pure functions in `src/core/`, no new runtime dependencies without
  discussing them first. English is preferred for new comments; much of the existing code is commented in
  Spanish, and that is fine too.
- **Commits:** short imperative subject, for example `feat: add DIMSPACE equal spacing` or
  `fix: TRIM with crossing window`.

## License of contributions

Cota is licensed under the [Apache License 2.0](LICENSE). By submitting a contribution you agree that it is
licensed under the same terms (section 5 of the license), and that you have the right to submit it.

**Sign off your commits** (`git commit -s`). The `Signed-off-by:` line certifies the
[Developer Certificate of Origin](https://developercertificate.org/): you wrote the change, or you have the
right to submit it under this license.

**Write it yourself.** Implement behavior from your own knowledge, public specifications (such as the published
DXF reference) and standards. Do not paste text, help pages, dialogs, icons, screenshots or support files
(`.pat`, `.lin`, menus) from commercial CAD products, nor code from vendor SDKs or obtained by decompiling. If
an AI tool helped you, review the result and make sure you can certify it as above.

## Code of Conduct

This project follows the [Code of Conduct](CODE_OF_CONDUCT.md). By participating you agree to uphold it.
