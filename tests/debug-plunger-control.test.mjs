import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  createMachineState,
  stepMachine,
} from "../game/machineStep.mjs";
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
  // Both manual controls have to reach the machine step, which is where the
  // open/closed mapping itself is asserted (tests/machine-step.test.mjs).
  assert.match(claw, /manualPlungerState: state\.manualPlungerState/);
  assert.match(claw, /manualCableDirection: state\.manualCableDirection/);
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

test("every physics setting is reachable from the tuning panel", async () => {
  const [panel, store] = await Promise.all([
    readFile(new URL("../components/TuningPanel.tsx", import.meta.url), "utf8"),
    readFile(new URL("../game/store.ts", import.meta.url), "utf8"),
  ]);

  // Derived from the store rather than a hand-kept list, so a setting added to
  // PHYSICS_SETTING_LIMITS without a slider fails here instead of shipping
  // untunable.
  const limits = store.slice(
    store.indexOf("PHYSICS_SETTING_LIMITS"),
    store.indexOf("function clampSetting"),
  );
  const settings = [...limits.matchAll(/^ {2}([a-zA-Z]+): \{ min:/gm)].map(
    (match) => match[1],
  );
  assert.ok(settings.length > 15, "should have found the limit table");

  const missing = settings.filter(
    (setting) => !panel.includes(`setting: "${setting}"`),
  );
  assert.deepEqual(
    missing,
    [],
    `settings with no slider in the panel: ${missing.join(", ")}`,
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
  // Travel comes from the retracted constant and the geometric maximum, never
  // from a tunable setting.
  assert.match(claw, /minimumCableLength: RETRACTED_CABLE_LENGTH/);
  assert.match(
    claw,
    /const maximumCableLength = useMemo\([\s\S]*?calculateMaximumCableLength/,
  );
});

test("the manual and automatic winches stop at the same two limits", () => {
  const limits = {
    minimumCableLength: 0.01,
    maximumCableLength: 2.4,
    trolleyMinX: -2.04,
    trolleyMaxX: 2.32,
    trolleyLimitZ: 1.38,
    chuteX: 2.28,
    chuteZ: 1.18,
  };
  const settings = {
    moveSpeed: 1.35,
    trolleyAcceleration: 5.2,
    returnSpeedMultiplier: 0.9,
    returnAccelerationMultiplier: 0.73,
    lowerSpeed: 1.1,
    liftSpeed: 1.25,
    plungerStallTimeout: 2.4,
    plungerPositionTolerance: 0.006,
    plungerVelocityTolerance: 0.018,
    plungerSpeed: 0.19,
    plungerMaxForce: 18,
    gantryDriveStiffness: 900,
    gantryCoastRatio: 0.45,
  };
  const plunger = { openY: -0.42, closedY: -0.298, motion: null };

  const wind = ({ phase, manualCableDirection }) => {
    let machine = {
      ...createMachineState(
        manualCableDirection === "raise" || phase === "lifting"
          ? limits.maximumCableLength
          : limits.minimumCableLength,
      ),
      phase,
    };
    for (let index = 0; index < 600; index += 1) {
      machine = stepMachine({
        machine,
        phase,
        result: null,
        input: { x: 0, z: 0 },
        manualPlungerState: "open",
        manualCableDirection,
        settings,
        limits,
        plunger,
        trolley: { x: 0, z: 0 },
        actualCableLength: machine.cableLength,
        dt: 1 / 60,
      }).machine;
    }
    return machine.cableLength;
  };

  assert.equal(
    wind({ phase: "aiming", manualCableDirection: "lower" }),
    wind({ phase: "descending", manualCableDirection: null }),
    "manual and automatic lowering must reach the same geometric stop",
  );
  assert.equal(
    wind({ phase: "aiming", manualCableDirection: "raise" }),
    wind({ phase: "lifting", manualCableDirection: null }),
    "manual and automatic lifting must reach the same retracted stop",
  );
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
