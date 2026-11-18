# Parallax 2.0 and ALT 327K 2.0

Two installable web apps for Earth and Gaia.

- **Parallax 2.0** (`/parallax-2-0/`): a live world clock, with a sandbox for any offset, saved clocks, custom zones and a clock dial on each planet. A directory of about 172,000 places (GeoNames, CC BY 4.0) puts any town on Earth or Gaia on the board, a zone workshop makes zones at any offset, zones that follow a real place, and your own clock-change rules, and the Time Zone Sandbox edits any existing zone (offset, daylight saving), puts countries and towns on other zones, runs what-if scenarios and saves or shares the result as a code.
- **ALT 327K 2.0** (`/alt-327k-2-0/`): an altitude sandbox showing what the air does at any height, and who lives up there. Now a neon 3D flight up and down the line, a converter (feet, meters, miles, kilometers, yards, nautical miles), whole numbers only, and synthesized sounds (with a Sound on/off button).

The two apps link to each other: every clock in Parallax 2.0 has an Altitude link into ALT 327K 2.0, and every real place in ALT 327K 2.0 has a Local time link into Parallax 2.0. Both now share the Neon Core look, and Parallax 2.0 has a 3D time globe: the planet turning under its sun, with a world-time ring of hours locked to the sun.

The folders are named after the apps. The old `/high-noon/` and `/thin-air/` links redirect to the new ones.

Each app works offline after the first visit. The start page at the root links to both and lists the install steps.

Fonts: Unbounded, Space Grotesk, Barlow and Big Shoulders Display, under the SIL Open Font License 1.1 (see the `OFL` files in each app's `fonts/`). ALT 327K 2.0 also bundles Three.js r128 (MIT) in `vendor/` so the 3D scene works offline.

Map data: the land on Parallax 2.0's time globe (`parallax-2-0/land.json`) is Natural Earth's 1:50m land outlines (public domain), via the world-atlas package. Parallax 2.0 now also bundles Unbounded, Space Grotesk and Three.js r128, the same files as ALT 327K 2.0.
