import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("the machine camera supports constrained drag orbit controls", async () => {
  const source = await readFile(
    new URL("../components/GameCanvas.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /<OrbitControls/);
  assert.match(source, /target=\{\[0, 1\.65, 0\]\}/);
  assert.match(source, /enableDamping/);
  assert.match(source, /enablePan=\{false\}/);
  assert.match(source, /minDistance=\{6\.4\}/);
  assert.match(source, /maxDistance=\{13\}/);
  assert.match(source, /minPolarAngle/);
  assert.match(source, /maxPolarAngle/);
});
