import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("the cabinet uses a modular ToysPop-inspired visual structure", async () => {
  const source = await readFile(
    new URL("../components/MachineScene.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /function LowerServiceCabinet\(/);
  assert.match(source, /function PrizeDeckVisuals\(/);
  assert.match(source, /function GlassEnclosure\(/);
  assert.match(source, /function CabinetFrame\(/);
  assert.match(source, /function Marquee\(/);
  assert.match(source, /function ControlFascia\(/);
  assert.match(source, /name="pillarless-cabinet-trim"/);
  assert.match(source, /name="tempered-glass-enclosure"/);
  assert.match(source, /name="illuminated-marquee"/);
  assert.match(source, /name="front-control-fascia"/);
  assert.match(source, /name="lower-service-cabinet"/);
  assert.match(source, /name="prize-chute-acrylic-guides"/);
});

test("the cabinet renders manufactured details instead of flat planes", async () => {
  const source = await readFile(
    new URL("../components/MachineScene.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /<RoundedBox/g);
  assert.match(source, /envMapIntensity=\{2\.2\}/);
  assert.match(source, /clearcoat=\{0\.65\}/);
  assert.match(source, />\s*CLAWPICK\s*<\/Text>/);
  assert.match(source, />\s*PRIZE OUT\s*<\/Text>/);
  assert.match(source, />\s*LEISURE GAME\s*<\/Text>/);
  assert.match(source, /emissiveIntensity=\{2\}/);
});

test("transparent cabinet parts stay free of refraction", async () => {
  const source = await readFile(
    new URL("../components/MachineScene.tsx", import.meta.url),
    "utf8",
  );

  // `transmission` makes the renderer draw the scene into a second target and
  // mipmap it every frame, and the glass tunnel covers most of the viewport, so
  // it cost a doubled scene render for an effect the reflections already sell.
  assert.doesNotMatch(source, /transmission=/);
  // Only read inside the transmission branch, so these are dead without it.
  // Matched with `=` so the prose explaining the removal does not trip this.
  assert.doesNotMatch(source, /attenuationColor=|attenuationDistance=/);
});

test("the prize chute has matching acrylic visuals and physical guides", async () => {
  const source = await readFile(
    new URL("../components/MachineScene.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /function ChuteGuideTunnel\(/);
  assert.match(source, /name="chute-guide-tunnel"/);
  assert.match(source, /createChuteGuideOutline\(\)/);
  assert.match(source, /function AcrylicGuideMaterial\(/);
  assert.match(source, /color="#68d9df"/);
  assert.match(source, /opacity=\{0\.46\}/);
  assert.match(source, /envMapIntensity=\{1\.4\}/);
  assert.match(source, /function PrizeChuteGuideColliders\(/);
  assert.match(source, /<PrizeChuteGuideColliders \/>/);
  assert.match(source, /createChuteGuideColliders\(\)/);
  assert.match(source, /friction=\{0\.18\}/);
  assert.match(source, /restitution=\{0\}/);
});

test("the chute guides are one tunnel, not four loose panels", async () => {
  const source = await readFile(
    new URL("../components/MachineScene.tsx", import.meta.url),
    "utf8",
  );

  // Four panels each spanned 1.2 across a tunnel measuring 1.205 outside, so
  // every corner was left with a slot. Both the mesh and the barrier now come
  // from one outline, the same fix the enclosure glass already had.
  assert.doesNotMatch(source, /CHUTE_GUIDE_WALLS|ChuteGuideWall/);
  assert.match(source, /function useGlassShellGeometry\(/);
  assert.match(source, /function useChuteGuideGeometry\(/);
  // The enclosure and the guides are the same shape at two scales, so one
  // extrusion builder serves both rather than each rolling its own.
  assert.equal(source.match(/new THREE\.ExtrudeGeometry/g)?.length, 1);
});

test("all four enclosure sides stay glass without corner pillars", async () => {
  const source = await readFile(
    new URL("../components/MachineScene.tsx", import.meta.url),
    "utf8",
  );

  // One extruded tunnel now, so all four sides come from a single closed
  // outline with a hole through it — see tests/glass-shell.test.mjs for the
  // geometry itself.
  assert.match(source, /name="glass-shell-tunnel"/);
  assert.match(source, /new THREE\.ExtrudeGeometry/);
  assert.match(source, /shape\.holes\.push/);
  assert.equal(source.match(/<CabinetGlassMaterial \/>/g)?.length, 1);
  assert.doesNotMatch(source, /undecorated-front-glass|undecorated-rear-glass/);
  assert.doesNotMatch(source, /MeshReflectorMaterial/);
  assert.doesNotMatch(source, /rear-interior-mirror/);
  assert.doesNotMatch(source, /rear-interior-panel/);
  assert.doesNotMatch(source, /front-gasket/);
  assert.doesNotMatch(source, /cornerPositions/);
  assert.doesNotMatch(source, /args=\{\[0\.26, 4\.26, 0\.26\]\}/);
});

test("detailed cabinet visuals keep the simple physics shell", async () => {
  const source = await readFile(
    new URL("../components/MachineScene.tsx", import.meta.url),
    "utf8",
  );

  assert.match(
    source,
    /<RigidBody type="fixed" colliders=\{false\}>[\s\S]*?<CuboidCollider args=\{\[3, 0\.12, 1\.9\]\}/,
  );
  // The walls are still plain cuboids on that one fixed body, but their extents
  // come from the glass outline now. Hand-written wall literals are what let the
  // barrier drift away from the pane, so the scene must not carry any.
  assert.match(source, /<GlassWallColliders \/>/);
  assert.doesNotMatch(
    source,
    /<CuboidCollider args=\{\[[\d.]+, 2\.25, [\d.]+\]\}/,
    "wall extents belong to createGlassWallColliders, not to the scene",
  );
  assert.match(
    source,
    /<group name="cabinet-render-meshes" visible=\{showVisuals\}>[\s\S]*?<CabinetVisuals /,
  );
  // The marquee roofs the cabinet, so it gets its own toggle for looking down
  // at the gantry — without touching the ceiling collider.
  assert.match(
    source,
    /name="illuminated-marquee-group" visible=\{showTopCover\}/,
  );
});
