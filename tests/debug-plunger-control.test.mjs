import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  migratePersistedSettings,
  SETTINGS_STORAGE_VERSION,
} from "../game/settingsMigration.mjs";

test("the control deck exposes manual wire and claw controls", async () => {
  const [controls, panel, store, claw] = await Promise.all([
    readFile(new URL("../components/Controls.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/TuningPanel.tsx", import.meta.url), "utf8"),
    readFile(new URL("../game/store.ts", import.meta.url), "utf8"),
    readFile(
      new URL("../components/MechanicalClaw.tsx", import.meta.url),
      "utf8",
    ),
  ]);

  assert.match(controls, /aria-label="와이어 수동 승강"/);
  assert.match(controls, /direction: "lower"/);
  assert.match(controls, /direction: "raise"/);
  assert.match(controls, /aria-label="집게 수동 상태"/);
  assert.match(controls, /state: "open"/);
  assert.match(controls, /state: "closed"/);
  assert.match(
    controls,
    /manualCableDirection === direction \? null : direction/,
  );
  assert.doesNotMatch(panel, /플런저 강제 상태/);
  assert.match(store, /manualPlungerState: "open"/);
  assert.match(store, /manualCableDirection: null/);
  assert.match(claw, /state\.manualPlungerState === "closed"/);
  assert.match(claw, /state\.manualCableDirection/);
  assert.match(claw, /const closedTargetY = CLAW_GEOMETRY\.closedPlungerY/);
  assert.match(claw, /PLUNGER_OPEN_TARGET_Y/);
});

test("the claw tuning panel exposes every claw physics setting", async () => {
  const [panel, store] = await Promise.all([
    readFile(
      new URL("../components/TuningPanel.tsx", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../game/store.ts", import.meta.url), "utf8"),
  ]);
  const clawSettings = [
    "moveSpeed",
    "trolleyAcceleration",
    "returnSpeedMultiplier",
    "returnAccelerationMultiplier",
    "lowerSpeed",
    "liftSpeed",
    "swingLinearDamping",
    "housingAngularDamping",
    "plungerSpeed",
    "plungerMaxForce",
    "plungerPositionTolerance",
    "plungerVelocityTolerance",
    "plungerStallTimeout",
    "clawFriction",
  ];

  for (const setting of clawSettings) {
    assert.match(panel, new RegExp(`setting: "${setting}"`));
  }

  assert.match(
    store,
    /housingAngularDamping: \{ min: 0, max: 10 \}/,
  );
});

test("manual and automatic winches share fixed geometric cable limits", async () => {
  const [panel, store, claw] = await Promise.all([
    readFile(new URL("../components/TuningPanel.tsx", import.meta.url), "utf8"),
    readFile(new URL("../game/store.ts", import.meta.url), "utf8"),
    readFile(
      new URL("../components/MechanicalClaw.tsx", import.meta.url),
      "utf8",
    ),
  ]);

  assert.doesNotMatch(panel, /setting: "cableRetractedLength"/);
  assert.doesNotMatch(panel, /setting: "cableExtendedLength"/);
  assert.doesNotMatch(store, /cableRetractedLength:/);
  assert.doesNotMatch(store, /cableExtendedLength:/);
  assert.match(
    claw,
    /const minimumCableLength = RETRACTED_CABLE_LENGTH/,
  );
  assert.match(
    claw,
    /const maximumCableLength = useMemo\([\s\S]*?calculateMaximumCableLength/,
  );
  assert.match(claw, /cableLength\.current >= maximumCableLength - 0\.001/);
  assert.match(claw, /cableLength\.current <= minimumCableLength \+ 0\.001/);
});

test("linkage rigid bodies omit damping and use Rapier defaults", async () => {
  const [store, panel, claw] = await Promise.all([
    readFile(new URL("../game/store.ts", import.meta.url), "utf8"),
    readFile(new URL("../components/TuningPanel.tsx", import.meta.url), "utf8"),
    readFile(
      new URL("../components/MechanicalClaw.tsx", import.meta.url),
      "utf8",
    ),
  ]);
  const dampingSettings = [
    "plungerLinearDamping",
    "plungerAngularDamping",
    "rockerLinearDamping",
    "rockerAngularDamping",
    "fingerLinearDamping",
    "fingerAngularDamping",
  ];

  for (const setting of dampingSettings) {
    assert.doesNotMatch(store, new RegExp(setting));
    assert.doesNotMatch(panel, new RegExp(setting));
  }

  const fingerBody = claw.slice(
    claw.indexOf("function ClawFingerCollider"),
    claw.indexOf("function PlungerCollider"),
  );
  const plungerBody = claw.slice(
    claw.indexOf("function PlungerCollider"),
    claw.indexOf("function RockerLinkCollider"),
  );
  const rockerBody = claw.slice(
    claw.indexOf("function RockerLinkCollider"),
    claw.indexOf("function PlungerVisual"),
  );

  for (const body of [fingerBody, plungerBody, rockerBody]) {
    assert.doesNotMatch(body, /linearDamping=/);
    assert.doesNotMatch(body, /angularDamping=/);
  }
});

test("saved linkage damping is reset once for the zero-damping experiment", () => {
  const previous = {
    housingAngularDamping: 0.42,
    cableRetractedLength: 0.04,
    cableExtendedLength: 1.8,
    plungerDampingRatio: 1.1,
    plungerGripEngagementDistance: 0.012,
    plungerClosedStroke: 0.138,
  };
  const migrated = migratePersistedSettings(previous, 2);
  const preserved = migratePersistedSettings(
    previous,
    SETTINGS_STORAGE_VERSION,
  );

  assert.equal(migrated.housingAngularDamping, 0);
  assert.equal("cableRetractedLength" in migrated, false);
  assert.equal("cableExtendedLength" in migrated, false);
  assert.equal("plungerDampingRatio" in migrated, false);
  assert.equal("plungerGripEngagementDistance" in migrated, false);
  assert.equal("plungerClosedStroke" in migrated, false);
  assert.equal(preserved, previous);
});
