# @vestara/cli

CLI entry point for the Vestara runtime, REPL, diagnostics, documentation
automation, and Workspace UI visual regression workflows.

The CLI also owns the `routing` command family and launches the optional Ink
Console. Both use the shared Workspace Runtime transport; neither owns routing
policy or provider state.

## Usage

Build the compiled CLI before running it:

```
pnpm --filter @vestara/cli build
pnpm vestara --help
pnpm vestara routing show
pnpm console
```

## Screenshot automation

The CLI delegates to the existing Playwright framework in
`apps/workspace/tests/visual`; it does not implement a second screenshot
runner.

```bash
pnpm vestara screenshots run
pnpm vestara screenshots run --viewport mobile --theme dark --routes dashboard,docs
pnpm vestara screenshots update --routes settings
pnpm vestara screenshots report
pnpm vestara screenshots clean
pnpm vestara screenshots check --json
```

`run` is non-mutating and forces comparison mode even if the calling process
contains `SCREENSHOT_MODE=update`. Only the explicit `update` action can select
baseline-update mode. The CLI validates all accepted arguments before invoking
Playwright and rejects unknown options.

Machine-readable execution results include `action`, delegated `command`,
`success`, `exitCode`, `stdout`, and `stderr`.

See [CLI.md](CLI.md) for the full option reference and
[the visual setup guide](../workspace/tests/visual/docs/SETUP.md) for browser,
baseline, and artifact management.

## Dependencies

The screenshot command uses Node's process and filesystem primitives and the
workspace package scripts. It introduces no Playwright dependency into the CLI
package.

Runtime dependencies remain declared in `package.json`; key integrations are
`@vestara/kernel`, `@vestara/workspace`, `@vestara/documentation`, and provider
runtime packages.

See [docs/](../docs/) for capability specifications and architecture.
