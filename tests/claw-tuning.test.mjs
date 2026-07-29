import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  getSimpleClawTuningLevel,
  getSimpleClawTuningPatch,
} from "../game/clawTuning.mjs";

test("grip strength changes the related actuator values monotonically", () => {
  const weak = getSimpleClawTuningPatch("grip", 0);
  const strong = getSimpleClawTuningPatch("grip", 100);

  assert.equal(strong.plungerMaxForce, 100);
  assert.ok(strong.plungerMaxForce > weak.plungerMaxForce);
  assert.ok(strong.clawFriction > weak.clawFriction);
});

test("grip strength reaches 100 only when every related value is strong", () => {
  const strong = getSimpleClawTuningPatch("grip", 100);
  const partial = {
    ...strong,
    clawFriction: 1.25,
  };

  assert.equal(getSimpleClawTuningLevel("grip", strong), 100);
  assert.ok(getSimpleClawTuningLevel("grip", partial) < 100);
});

test("simple tuning levels round-trip through their anchor settings", () => {
  for (const kind of ["grip", "speed", "stability"]) {
    const patch = getSimpleClawTuningPatch(kind, 63);
    const level = getSimpleClawTuningLevel(kind, patch);
    assert.ok(Math.abs(level - 63) < 0.001);
  }
});

test("the tuning panel separates simple and collapsible advanced settings", async () => {
  const [panel, styles] = await Promise.all([
    readFile(new URL("../components/TuningPanel.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(panel, /간단 설정/);
  assert.match(panel, /고급 설정/);
  assert.match(panel, /SIMPLE_TUNING_CONTROLS/);
  assert.match(panel, /getSimpleClawTuningPatch/);
  assert.match(panel, /<details/);
  assert.match(panel, /<summary>/);
  assert.match(panel, /aria-selected=\{settingsMode === "simple"\}/);
  assert.match(styles, /\.slider-list\s*\{[\s\S]*overflow-y: auto/);
  assert.match(styles, /\.tuning-panel\s*\{[\s\S]*max-height:/);
  assert.match(styles, /\.tuning-section\[open\] summary/);
});
