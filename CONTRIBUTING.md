# Contributing

Contributions are welcome. This document covers the one norm that matters most
here, then the practical details.

## The norm: claims must be checkable

This project's entire premise is that it shows what an atom actually is rather
than the familiar cartoon. That claim is only worth anything if it can be
verified, so **physics is validated by tests, not by whether the picture looks
right**. A render can be beautiful and completely wrong.

If you change anything in `src/physics/`, it needs a test that would fail if the
physics were wrong. Prefer tests that check against something independent:

- **Analytic results.** Hydrogen 1s has `⟨r⟩ = 1.5 a₀` exactly. The radial
  maximum sits at exactly one Bohr radius. Test against the closed form, not
  against your own implementation.
- **Mathematical identities.** Normalisation integrals equal 1. Orbitals are
  orthonormal. Unsöld's theorem says a filled subshell is exactly spherical, and
  that single test catches most spherical-harmonic mistakes.
- **Published measurements.** Copper's Fermi velocity is 1.57e6 m/s, its mean
  free path ~39 nm, its relaxation time ~25 fs. Slater's rules give Cu 4s a
  Z_eff of 3.70 and Cu 3d 7.85, and those are worked examples in textbooks.
- **Structural counts.** An orbital has exactly `n-l-1` radial nodes and `l`
  angular ones.

Tests that assert a function returns what it currently returns are not useful
here. If a test would pass against a subtly broken implementation, it is not
testing the physics.

## Be honest about approximations

Several parts of this are approximations, and the project treats saying so as
part of the work rather than an embarrassment:

- Slater screening is off by up to 6x for heavy elements over a filled d shell.
  The accuracy plot in the interface shows this rather than hiding it.
- Orbital energies overbind badly, by 5.4x for neon.
- The relativistic correction is scalar and first-order, not Dirac.
- Real drift velocity in a metal cannot be simulated, because the signal sits
  twenty orders of magnitude below the sampling noise.

If you add an approximation, say where it fails, in a comment and in the
interface if a user could be misled. If you can quantify the failure, do.

## Comment the *why*

The codebase is heavily commented, and deliberately so, because most of the
non-obvious decisions are physics decisions or hard-won rendering ones. Explain
why a thing is done, especially when the obvious approach is wrong. Several
comments exist purely to stop someone "simplifying" a subtlety back out:

- Complex spherical harmonics would make every p orbital a featureless doughnut.
- Rendering to `WebGL3DRenderTarget` layers silently writes nothing on some
  drivers, with no error at all.
- `height: auto` on a `<canvas>` is a feedback loop.

## Practical

```bash
npm ci          # reproducible install from the lockfile
npm run dev     # dev server with hot reload
npm test        # the full physics suite
npm run build   # typecheck, then production build
```

Before opening a pull request:

1. `npm test` passes.
2. `npm run typecheck` is clean.
3. `npm run build` succeeds.
4. If you touched rendering, check it in a browser at more than one HUD scale
   and at both desktop and mobile widths. Several past bugs were invisible at
   the default size.

TypeScript is in strict mode with `noUnusedLocals` and `noUnusedParameters`.

## Scope

Good things to work on, roughly in order of value:

- **Clementi-Roetti Roothaan-Hartree-Fock radial functions.** The single biggest
  accuracy improvement available. `src/physics/radial.ts` already exposes a
  `RadialBackend` interface so this can be dropped in without the renderer
  noticing.
- Molecular orbitals and chemical bonding (H₂, then heteronuclear).
- Adaptive volume resolution, so deep zooms toward the nucleus stay sharp.
- Better nuclear structure than a packed-sphere model.
- Accessibility: keyboard navigation and screen reader labelling.

Please open an issue before starting anything large, so effort is not wasted.
