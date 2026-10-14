# Upstream

Vendored from [dmmulroy/anti-slop](https://github.com/dmmulroy/anti-slop) at commit `13909c9e07590f5a85d93c62712259fe14a883f7`.

The copy is `skills/install-anti-slop/assets/anti-slop` from that revision. Those assets match `src/` at the same commit, except the upstream rule tests are not part of the installed plugin.

## Installed paths

- `tools/oxlint/anti-slop/index.ts` — generic plugin (`anti-slop`)
- `tools/oxlint/anti-slop/effect/index.ts` — Effect plugin (`anti-slop-effect`)

## Deviations

None in the vendored rules. This repository enables every generic rule and the Effect rule group at `error`, plus native `oxc/no-accumulating-spread`. The `oxc` plugin is listed explicitly because the lint config in `vite.config.ts` turns default plugins off.
