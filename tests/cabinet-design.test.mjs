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
  assert.match(source, /transmission=\{0\.72\}/);
  assert.match(source, /thickness=\{0\.025\}/);
  assert.match(source, /clearcoat=\{0\.65\}/);
  assert.match(source, />\s*CLAWPICK\s*<\/Text>/);
  assert.match(source, />\s*PRIZE OUT\s*<\/Text>/);
  assert.match(source, />\s*LEISURE GAME\s*<\/Text>/);
  assert.match(source, /emissiveIntensity=\{2\}/);
});

test("the prize chute has matching acrylic visuals and physical guides", async () => {
  const source = await readFile(
    new URL("../components/MachineScene.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /const CHUTE_GUIDE_WALLS: ChuteGuideWall\[\]/);
  assert.equal(
    source.match(/\{ position: \[[^\n]+size: \[[^\n]+\}/g)?.length,
    4,
  );
  assert.match(source, /function AcrylicGuideMaterial\(/);
  assert.match(source, /color="#68d9df"/);
  assert.match(source, /opacity=\{0\.46\}/);
  assert.match(source, /attenuationColor="#35b9c2"/);
  assert.match(source, /function PrizeChuteGuideColliders\(/);
  assert.match(source, /<PrizeChuteGuideColliders \/>/);
  assert.match(source, /friction=\{0\.18\}/);
  assert.match(source, /restitution=\{0\}/);
});

test("all four enclosure sides stay glass without corner pillars", async () => {
  const source = await readFile(
    new URL("../components/MachineScene.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /name="undecorated-front-glass"/);
  assert.match(source, /name="undecorated-rear-glass"/);
  assert.equal(source.match(/<CabinetGlassMaterial \/>/g)?.length, 4);
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
  assert.match(
    source,
    /<CuboidCollider args=\{\[3, 2\.25, 0\.12\]\} position=\{\[0, 2\.1, 1\.9\]\} \/>/,
  );
  assert.match(
    source,
    /<group name="cabinet-render-meshes" visible=\{showVisuals\}>[\s\S]*?<CabinetVisuals \/>/,
  );
});
