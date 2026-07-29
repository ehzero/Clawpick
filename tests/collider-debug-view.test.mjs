import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("debug mode keeps physics colliders and hides render meshes", async () => {
  const [scene, claw, prize, canvas] = await Promise.all([
    readFile(
      new URL("../components/MachineScene.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../components/MechanicalClaw.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../components/Prize.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../components/GameCanvas.tsx", import.meta.url),
      "utf8",
    ),
  ]);

  assert.match(scene, /<Physics[\s\S]*debug=\{debug\}/);
  assert.match(scene, /<Cabinet showVisuals=\{!debug\} \/>/);
  assert.match(scene, /<OverheadRails showVisuals=\{!debug\} \/>/);
  assert.match(scene, /name="cabinet-render-meshes" visible=\{showVisuals\}/);
  assert.match(claw, /name="overhead-rail-render-meshes" visible=\{showVisuals\}/);
  assert.match(claw, /name="trolley-render-meshes" visible=\{!debug\}/);
  assert.match(claw, /name="cable-render-meshes" visible=\{!debug\}/);
  assert.match(claw, /name="claw-render-meshes" visible=\{!debug\}/);
  assert.match(prize, /name=\{`\$\{id\}-render-meshes`\} visible=\{!debug\}/);
  assert.match(canvas, /\{!debug && <StudioEnvironment \/>\}/);
  assert.match(canvas, /\{!debug && \(\s*<ContactShadows/);
  assert.doesNotMatch(claw, /debugTensionRef/);
});
