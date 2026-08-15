# Quantum Atom Visualiser

A physically honest atomic renderer. It draws the quantum probability density
of real atoms from real wavefunctions, at correct scale, and tells you where its
own model breaks down.

Every element from hydrogen to oganesson. A second mode shows how a metal
actually conducts electricity, and why an insulator does not.

```bash
npm ci
npm run dev
```

Then open <http://localhost:5173>.

---

## The premise

**You cannot see an atom.** An atom is 0.1 to 0.3 nm across; visible light has a
wavelength of 400 to 700 nm, thousands of times larger. Light cannot resolve
something far smaller than its own wavelength, so an atom can never form an
optical image. There is no photograph waiting to be taken.

Electrons are also not small spheres on orbits. That model was abandoned in 1926.

So "show me an atom as it really is" has to mean something more precise: render
the **quantum probability density |ψ|²** as a true volumetric cloud, computed
from the actual wavefunctions, at correct scale. That is what an atom physically
*is*. The output should look like a luminous, structured fog with sharp nodal
surfaces, not a solar system.

## What it does

### Single atom

- **Volumetric |ψ|² cloud**, raymarched on the GPU with temporal accumulation,
  so a still camera converges to a clean, noise-free image.
- **Monte Carlo point cloud**: every dot is one possible outcome of measuring
  the electron's position. Not a trajectory.
- **Contour surface** at a *solved* isovalue, not a guessed one. The density is
  integrated and the threshold bisected until the surface genuinely encloses the
  stated fraction of the electron probability.
- **Slice plane**, which does not integrate along the ray, so nodes appear as
  the sharp zeroes they really are.
- **Nucleus** with individual protons and neutrons for the correct nuclide,
  plus the measured Woods-Saxon charge density.
- **True scale**, where the nucleus is correctly invisible, with an exaggeration
  slider that always shows how much it is lying by.
- **Bohr orbits**, drawn faint and clearly labelled as the superseded model,
  because comparing it against the real density is instructive.
- **All 118 elements**, including the f block and relativistic heavy elements.

### Conduction

A block of real crystal with its ion cores and delocalised electron sea,
answering how copper carries current and why diamond does not. Materials:
copper, silver, gold, aluminium, silicon and diamond.

## What is computed, not faked

- **Wavefunctions.** ψ = R_nl(r) · Y_lm(θ, φ), using **real** spherical
  harmonics for l = 0..3. This matters: the complex harmonics that come
  straight out of the textbook derivation have a |ψ|² independent of φ, so
  rendering them directly turns every p orbital into a featureless doughnut. The
  familiar lobes are the real linear combinations.
- **Multi-electron screening** via Slater's rules, giving an effective nuclear
  charge per subshell. Without it a copper 4s orbital comes out about eight
  times too small. Reproduces the textbook worked values exactly (Cu 4s = 3.70,
  Cu 3d = 7.85).
- **Electron configurations** from the Madelung rule plus the 20 experimentally
  known exceptions. Copper is `[Ar] 3d¹⁰ 4s¹`, not the predicted `3d⁹ 4s²`, and
  that lone 4s electron outside a filled d shell is exactly why it conducts.
- **Nuclei** sized by R = r₀A^(1/3), with the neutron count taken from a
  specific nuclide rather than a rounded atomic weight. Chlorine is drawn as
  Cl-35, because no single chlorine nucleus has 18.45 neutrons.
- **Relativistic effects**, which dominate heavy atoms. See below.

## Verified by tests, not by eye

A render can be beautiful and completely wrong, so the physics is checked
numerically. **145 tests**, including:

| Check | Why it catches real bugs |
|---|---|
| ∫\|ψ\|²dV = 1 for all n ≤ 5 | Normalisation constants |
| ⟨ψᵢ\|ψⱼ⟩ = δᵢⱼ across all (l, m) | Orthogonality of the whole basis |
| Exactly n-l-1 radial and l angular nodes | Laguerre polynomial correctness |
| ⟨r⟩ = 1.5 a₀ for hydrogen 1s | Against the exact analytic result |
| Unsöld's theorem: a filled subshell is exactly spherical | Catches almost any spherical-harmonic error |
| 90% contour really encloses 0.90 | The isovalue solver |
| Cu Fermi velocity 1.57e6 m/s, mean free path ~39 nm | Against published measurements |
| Drift decays as exp(-t/τ) after the field is removed | The relaxation time is real, not a rendering lag |

## How wrong is the model? It tells you.

The interface grades itself against experiment rather than quietly presenting
approximations as measurements.

| | Grade | |
|---|---|---|
| **Node structure** | exact | Fixed by the quantum numbers; no approximation can spoil it |
| **Size** | *not graded* | ⟨r⟩ and a covalent radius are different quantities |
| **Ionisation energy** | exact → poor | H 1.0x, Na 1.4x, Cu 1.8x, **Ne 5.4x** |

An accuracy plot compares the computed radius against the measured covalent
radius across all 118 elements. The failure is specific rather than diffuse:

| | C | Cl | Xe | Cu | Ag | Au | U |
|---|---|---|---|---|---|---|---|
| model / measured | 1.3x | 1.1x | 1.7x | 2.6x | 3.7x | 5.7x | 6.6x |

Main-group elements sit near 1.1-1.7x. Everything perched on a **filled d shell**
blows out, because d electrons barely penetrate the core and so screen far worse
than Slater's flat constants assume.

Hydrogen reads 2.6x while the model there is the *exact* analytic solution,
which is the clearest proof that the offset is a difference of definition rather
than an error. `⟨r⟩ = 1.5 a₀` is simply not a bonding radius.

Energies always come out too deep, for two structural reasons: each electron is
given the full attraction to a screened nucleus, but the screening *is* the
other electrons, so their mutual repulsion is counted once per partner instead
of once per pair; and a real ionisation energy is a difference between two
atoms, since removing one electron lets the rest relax inward.

## Relativity in heavy atoms

A 1s electron orbits at roughly Z/137 of light speed. In hydrogen that is 0.7%.
In **gold it is 57%**, giving that electron 22% extra mass and contracting its
1s orbital to 82% of its non-relativistic size. In oganesson it reaches 86% of c.

This is not a curiosity. It is why gold is yellow (contraction narrows the
5d→6s gap until it absorbs blue rather than ultraviolet), why mercury is liquid,
why lead-acid cells give 2.1 V instead of 1.7 V, and why lawrencium is 7s²7p¹.

The correction is honest about its limits. It computes the **direct** effect
exactly and applies it by scaling each subshell's effective charge by its
Lorentz factor. It does **not** capture the **indirect** effect, where contracted
inner shells screen better so d and f orbitals *expand*. That needs a
self-consistent relativistic calculation. This is a Schrödinger atom with a mass
correction, not a Dirac atom, and the interface says so whenever it is enabled.

## Conduction

Copper at household current density, all computed:

| | |
|---|---|
| Fermi velocity (how fast electrons move) | ~1,570,000 m/s |
| Drift velocity (how fast the current moves) | ~0.00007 m/s |
| Field propagation (how fast the wire turns on) | ~0.66c |
| Time for one electron to travel one metre | ~3.8 hours |

The conduction electrons are already moving at over a million metres per second
in random directions, at absolute zero, with no field applied. Switching a field
on biases that existing chaos by about one part in ten billion. The lamp lights
instantly anyway, because what travels is the field, not the electrons.

**Why insulators do not conduct** is not that their electrons are stuck. Silicon
and diamond share a crystal structure and both have four bonded valence
electrons; only the band gap differs, 1.12 eV against 5.47 eV. That single
difference spans about thirty orders of magnitude in carrier density. To expect
one free electron you need a 6 µm cube of silicon, or a block of diamond roughly
**18,500 km on a side**, larger than the Earth.

**The honest limitation, stated in the interface.** Real drift is about 1e-10 of
the Fermi velocity, while the mean velocity of N simulated electrons has noise
of order v_F/√N. Seeing real drift emerge would need ~1e20 electrons: the signal
sits twenty orders of magnitude below the noise floor. So the simulation
reproduces the chaos exactly, computes drift analytically, and offers a field
amplification factor that is displayed on screen whenever it is not 1.

**Model validity is checked, not assumed.** Asking for household current density
through silicon requires 2.3e9 V/m, seventy times its breakdown strength, and
the Drude formula will happily return a drift velocity faster than light. The
interface refuses to print that number and explains why.

## Requirements

- **Node.js 20 or newer** to build. Any platform: Linux, macOS or Windows.
- **A browser with WebGL2.** Chrome, Edge, Firefox and Safari 15+ all qualify.
- **A discrete GPU is strongly recommended.** This raymarches a volumetric
  density field; integrated graphics will work but will be slow.

## Getting started

Any operating system, from the project directory:

```bash
npm ci
```

```bash
npm run dev
```

| Script | What it does |
|---|---|
| `npm run dev` | Development server with hot reload on port 5173 |
| `npm run build` | Typecheck, then production build into `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm test` | Run the physics test suite |
| `npm run test:watch` | Tests in watch mode |
| `npm run typecheck` | TypeScript only, no build |
| `npm run audit` | Dependency vulnerability check |

`npm ci` is preferred over `npm install`: it installs exactly what the committed
lockfile specifies.

### Deploying

The build output in `dist/` is fully static, with no server or backend, so it
can be hosted anywhere that serves files (GitHub Pages, Netlify, Cloudflare
Pages, S3, or any web server). See [SECURITY.md](SECURITY.md) for a suggested
Content Security Policy.

## Mobile

Usable on a phone, with a first-run notice saying it runs better on a desktop.
The layout drops to a single column: the canvas takes the screen and the
controls become a bottom sheet.

Quality is reduced automatically on touch-first or low-memory devices:

| | Desktop | Mobile |
|---|---|---|
| Density volume | 256³ (4096² atlas, ~134 MB) | 128³ (1536² atlas, ~14 MB) |
| Raymarch steps | 256 | 112 |
| Pixel ratio cap | 2 | 1.25 |
| Sampled points | 250,000 | 80,000 |

**The physics is identical.** Only the sampling resolution of the picture
changes.

## Architecture

```
src/
  physics/     Pure numerical physics, no rendering. Fully unit tested.
               wavefunctions, Slater screening, aufbau, nuclei, sampling,
               118-element data, density grid + isovalue solver, orbital
               energies, relativistic corrections, conduction materials,
               Drude electron gas
  render/      GPU work. Atlas volume bake, raymarch + temporal accumulation,
               isosurface, slice plane, point cloud, nucleus, crystal lattice,
               electron gas
  scale/       True scale, exaggeration factor, logarithmic atom-to-nucleus zoom
  ui/          React panels, log-axis plots, device capability detection
  AtomView.tsx / ConductionView.tsx / App.tsx (mode switch)
tools/         Build-time generators (not shipped)
```

### Colormaps

The two scientific colormaps are original, generated by
`node tools/generate-colormaps.mjs`. They are constructed as paths through
Oklab with lightness rising exactly linearly, which is what makes them
perceptually uniform: equal steps in the data give equal steps in perceived
brightness. A rainbow map instead invents bright and dark bands that are not in
the data, and readers see them as structure.

The uniformity is verified rather than asserted. `colormaps.test.ts` converts
the fitted output back into Oklab and measures the lightness actually produced,
checking that it is monotonic *and* evenly spaced. Nothing guarantees a
polynomial fit preserves the property its construction was designed for, so the
test closes that loop.

Two details that cost real debugging time, both recorded in the generator:

- **Clipping against the sRGB gamut makes a colormap unfittable.** The gamut
  boundary is bumpy, and clipping welds those bumps into the colour curve.
  Raising the polynomial degree from 6 to 14 only moved the error from 36/255
  to 24/255. Fitting a smooth envelope *underneath* the boundary instead
  brought it to under 1/255.
- **Monomial least squares on [0,1] is ill-conditioned.** Accuracy stopped
  improving with degree and briefly got worse. Fitting on a centred domain,
  `u = 2t - 1`, fixed it.

World units are **Bohr radii** throughout the atom renderer and **nanometres**
in the conduction view. Conversion to picometres or femtometres happens only at
the display boundary, never inside the physics.

The `physics/` directory has no dependency on Three.js or React and can be used
on its own.

### Two design decisions worth knowing

**Dynamic range.** Electron density spans eight to ten orders of magnitude. In
copper the nuclear cusp is around ten million times denser than the 4s cloud you
actually want to look at. Nothing can display that at once, so the volume stores
**log** density and exposes for the **valence shell**, letting the core saturate,
exactly as a camera pointed at a lit window does. Normalising to the peak
instead gives a black screen with one bright dot.

**The volume is a 2D tiled atlas, not a 3D texture.** The obvious implementation
renders slices into a `WebGL3DRenderTarget`. On Chrome/ANGLE/D3D11 that silently
writes nothing: the framebuffer reports COMPLETE, `glClear` on the bound layer
works, the draw call issues, `glGetError` stays clean, and the fragments never
land. The identical draw into an ordinary 2D target writes correctly. So slices
are laid out in a grid in one 2D texture with a hand-written trilinear filter,
filled in a single draw call.

## Known limits

- **Slater screening degrades for heavy elements**, by up to 6x over a filled d
  shell. The accuracy plot shows exactly where. `radial.ts` exposes a
  `RadialBackend` interface so tabulated Roothaan-Hartree-Fock (Clementi-Roetti)
  functions can be dropped in without the renderer noticing. This is the single
  biggest accuracy upgrade available.
- **Orbital energies are poor** for multi-electron atoms, as documented above.
- **The relativistic correction is scalar and first-order**, not Dirac.
- **A uniform grid cannot resolve a 1s core and a valence shell at once** when
  they differ in size by a factor of a hundred. For heavier atoms the core is
  drawn as an unresolved bright point; the interface says so when it happens,
  and the radial plot still shows every shell exactly.
- **Mobile performance is untested on real hardware.** The reduced quality
  profile is reasoned rather than measured.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). The short version: physics changes need
tests that would fail if the physics were wrong, and approximations should say
where they break.

## Further reading

- Slater, J. C. "Atomic Shielding Constants", *Phys. Rev.* **36**, 57 (1930)
- Clementi, E. and Roetti, C. "Roothaan-Hartree-Fock atomic wavefunctions",
  *Atomic Data and Nuclear Data Tables* **14**, 177 (1974)
- Stodolna, A. S. et al. "Hydrogen Atoms under Magnification: Direct Observation
  of the Nodal Structure of Stark States", *Phys. Rev. Lett.* **110**, 213001
  (2013)
- Pyykkö, P. "Relativistic effects in structural chemistry", *Chem. Rev.* **88**,
  563 (1988)
- Ashcroft, N. W. and Mermin, N. D. *Solid State Physics* (1976), for the Drude
  and Sommerfeld treatments of conduction

## Licence

[MIT](LICENSE).
