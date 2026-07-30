import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [
  panelSource,
  inspectorSource,
  storeSource,
  kinematicsSource,
  clawSource,
  labSource,
  cssSource,
] =
  await Promise.all([
    readFile(
      new URL("../components/ClawSpecsPanel.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../components/InspectorPanel.tsx", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../game/clawSpecs.ts", import.meta.url), "utf8"),
    readFile(
      new URL("../game/clawKinematics.mjs", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../components/MechanicalClaw.tsx", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../app/ClawLab.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

test("shows editable claw component specifications in the right inspector", () => {
  assert.match(panelSource, /집게 부품 스펙/);
  assert.match(panelSource, /반복 부품은 하나만 표시/);
  assert.match(panelSource, /곡선 손가락/);
  assert.match(panelSource, /count: 3/);
  assert.match(panelSource, /type="number"/);
  assert.match(panelSource, /resetSpecs/);
  assert.match(panelSource, /<details className="spec-part-card"/);
  assert.match(inspectorSource, /"physics" \| "specs"/);
  assert.match(inspectorSource, /물리 튜닝/);
  assert.match(inspectorSource, /부품 스펙/);
  assert.match(inspectorSource, /role="tablist"/);
  assert.match(labSource, /setInspectorMode\("specs"\)/);
  assert.match(labSource, /집게 스펙/);
  assert.doesNotMatch(labSource, /href="\/claw-specs"/);
  assert.doesNotMatch(labSource, /ClawSpecsModal/);
  assert.doesNotMatch(cssSource, /\.spec-modal-backdrop/);
  assert.match(cssSource, /\.inspector-tabs/);
  assert.match(cssSource, /\.spec-panel-scroll/);
  assert.match(cssSource, /\.spec-parts-list/);
  assert.match(cssSource, /\.spec-input-wrap/);
});

test("persists safe editable dimensions and shares them with render and physics", () => {
  for (const key of [
    "powerCableDiameter",
    "powerCableCoilDiameter",
    "powerCableTurns",
    "powerCableSegments",
    "powerCableSlack",
    "housingDiameter",
    "plungerShaftLength",
    "linkWidth",
    "linkThickness",
    "fingerLength",
    "fingerTaperStart",
    "fingerTipWidthScale",
    "hingePinDiameter",
    "hingePinLength",
  ]) {
    assert.match(storeSource, new RegExp(key));
    assert.match(panelSource, new RegExp(key));
  }

  assert.match(storeSource, /persist\(/);
  assert.match(storeSource, /clawpick-claw-part-specs/);
  assert.match(
    storeSource,
    /powerCableSlack: \{ min: 0\.04, max: 2 \}/,
  );
  assert.match(
    storeSource,
    /powerCableTurns: \{ min: 6, max: 120 \}/,
  );
  assert.match(storeSource, /powerCableTurns: 28/);
  assert.match(
    storeSource,
    /powerCableSegments: \{ min: 48, max: 1200 \}/,
  );
  assert.match(storeSource, /powerCableSegments: 280/);
  assert.match(clawSource, /useClawSpecStore/);
  assert.match(clawSource, /createClawGeometry\(specs\)/);
  assert.match(clawSource, /fingerWidthScaleAt/);
  assert.match(
    clawSource,
    /geometry\.fingerWidth \* \(segment\.widthScale \?\? 1\)/,
  );
  assert.match(
    clawSource,
    /clawPartDimensions\.housing\.halfHeight/,
  );
  assert.match(
    clawSource,
    /clawPartSpecs\.powerCableDiameter \/ 2/,
  );
  assert.match(
    clawSource,
    /stepUmbilicalState\(\{[\s\S]*?slack: clawPartSpecs\.powerCableSlack/,
  );
  assert.match(clawSource, /createUmbilicalHelix\(\{/);
  assert.match(
    clawSource,
    /coilDiameter: clawPartSpecs\.powerCableCoilDiameter/,
  );
  assert.match(
    clawSource,
    /turns: clawPartSpecs\.powerCableTurns/,
  );
  assert.match(
    clawSource,
    /Math\.round\(clawPartSpecs\.powerCableSegments\)/,
  );
  assert.match(
    clawSource,
    /updateDynamicTubeGeometry\(\{[\s\S]*?geometry: umbilicalGeometry/,
  );
  assert.match(
    clawSource,
    /expandedHousingRadius[\s\S]*?clawPartDimensions\.housing\.radius[\s\S]*?cableEnvelopeRadius/,
  );
  assert.match(
    clawSource,
    /housingCollisionCylinder = \{[\s\S]*?radius: expandedHousingRadius/,
  );
  assert.match(
    clawSource,
    /projectPointsOutsideCylinder\([\s\S]*?umbilicalCenterline/,
  );
  assert.match(clawSource, /appendUmbilicalLead\(\{/);
  assert.match(clawSource, /prependUmbilicalLead\(\{/);
  assert.match(
    clawSource,
    /end: bodyConnection[\s\S]*?approachDirection:/,
  );
  assert.match(
    clawSource,
    /HOUSING_TOP_COLUMN_CENTER_Y \* housingMeshScaleY/,
  );
  assert.match(
    clawSource,
    /start: trolleyConnection[\s\S]*?departureDirection:/,
  );
  assert.match(clawSource, /name="power-umbilical-continuous-tube"/);
  assert.doesNotMatch(clawSource, /<instancedMesh/);
  assert.match(panelSource, /name: "나선형 전원공급 케이블"/);
  assert.match(panelSource, /key: "powerCableSegments"/);
  assert.match(panelSource, /scope: \["렌더 매시"\]/);
});

test("spec values support direct draft editing before commit", () => {
  assert.match(panelSource, /function SpecNumberInput/);
  assert.match(panelSource, /const \[draft, setDraft\] = useState/);
  assert.match(panelSource, /onChange=\{\(event\) => setDraft/);
  assert.match(panelSource, /onBlur=\{commit\}/);
  assert.match(panelSource, /event\.key === "Enter"/);
  assert.match(panelSource, /event\.key === "Escape"/);
  assert.match(panelSource, /normalizeClawPartSpecs\(\{/);
  assert.doesNotMatch(
    panelSource,
    /onChange=\{\(event\) => \{[\s\S]{0,240}updateSpec/,
  );
});

test("rocker links and fingers share one plate cross-section specification", () => {
  assert.match(panelSource, /name: "링크·손가락 공통 판재"/);
  assert.match(panelSource, /count: 6/);
  assert.match(clawSource, /width: specs\.linkWidth/);
  assert.match(clawSource, /thickness: specs\.linkThickness/);
  assert.match(kinematicsSource, /specs\.linkWidth \?\? specs\.fingerWidth/);
  assert.match(
    kinematicsSource,
    /specs\.linkThickness \?\? specs\.fingerThickness/,
  );
  assert.match(panelSource, /key: "fingerTaperStart"/);
  assert.match(panelSource, /key: "fingerTipWidthScale"/);
  assert.doesNotMatch(panelSource, /key: "rockerWidth"/);
  assert.doesNotMatch(panelSource, /key: "rockerThickness"/);
  assert.doesNotMatch(panelSource, /key: "fingerWidth"/);
  assert.doesNotMatch(panelSource, /key: "fingerThickness"/);
});

test("all rotational connections share one hinge pin object specification", () => {
  assert.match(panelSource, /name: "공통 힌지 핀"/);
  assert.match(panelSource, /count: 9/);
  assert.match(clawSource, /function HingePinVisual/);
  assert.match(clawSource, /function HingePinCollider/);
  assert.equal(clawSource.match(/<HingePinVisual/g)?.length, 3);
  assert.equal(clawSource.match(/<HingePinCollider/g)?.length, 3);

  for (const legacyKey of [
    "plungerConnectionPinDiameter",
    "plungerConnectionPinLength",
    "bodyPivotPinDiameter",
    "bodyPivotPinLength",
    "movingHingePinDiameter",
    "movingHingePinLength",
  ]) {
    assert.doesNotMatch(storeSource, new RegExp(legacyKey));
    assert.doesNotMatch(panelSource, new RegExp(legacyKey));
    assert.doesNotMatch(clawSource, new RegExp(legacyKey));
  }
});

test("the body-to-rocker pivot renders only the shared hinge pin", () => {
  assert.doesNotMatch(clawSource, /\[-0\.083, 0\.083\]\.map/);
  assert.doesNotMatch(
    clawSource,
    /cylinderGeometry args=\{\[0\.066, 0\.066, 0\.018, 18\]\}/,
  );
  assert.doesNotMatch(
    clawSource,
    /cylinderGeometry args=\{\[0\.027, 0\.027, 0\.02, 12\]\}/,
  );
});

test("the plunger connects hinge pins directly without yokes", () => {
  assert.doesNotMatch(panelSource, /플런저 요크/);
  assert.doesNotMatch(panelSource, /plungerYoke/);
  assert.doesNotMatch(storeSource, /plungerYoke/);
  assert.doesNotMatch(clawSource, /yokeHalfExtents|yokeX/);
  assert.match(
    clawSource,
    /<HingePinCollider[\s\S]*position=\{\[CLAW_GEOMETRY\.plungerRadius, 0, 0\]\}/,
  );
  assert.match(
    clawSource,
    /<HingePinVisual[\s\S]*position=\{\[CLAW_GEOMETRY\.plungerRadius, 0, 0\]\}/,
  );
});
