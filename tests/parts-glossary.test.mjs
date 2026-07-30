import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [glossarySource, labSource, cssSource, clawSource] = await Promise.all([
  readFile(new URL("../app/PartsGlossaryModal.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/ClawLab.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  readFile(new URL("../components/MechanicalClaw.tsx", import.meta.url), "utf8"),
]);

test("opens the parts glossary as a modal from the simulation header", () => {
  assert.match(labSource, /PartsGlossaryModal/);
  assert.match(labSource, /setPartsOpen\(true\)/);
  assert.match(labSource, /부품 용어집/);
  assert.doesNotMatch(labSource, /href="\/parts"/);
  assert.match(glossarySource, /role="dialog"/);
  assert.match(glossarySource, /aria-modal="true"/);
  assert.match(glossarySource, /event\.key === "Escape"/);
  assert.match(glossarySource, /event\.target === event\.currentTarget/);
  assert.match(glossarySource, /부품 용어집 닫기/);
  assert.match(cssSource, /\.parts-modal-backdrop/);
  assert.match(cssSource, /\.parts-modal-scroll/);
});

test("documents machine, hoist, claw, and physics terminology", () => {
  for (const category of [
    "머신 외장",
    "트롤리·승강",
    "집게 기구",
    "물리 구현",
  ]) {
    assert.match(glossarySource, new RegExp(category));
  }

  for (const term of [
    "유리 인클로저",
    "출구 아크릴 가이드",
    "와이어 출구 가이드",
    "승강 와이어",
    "집게 몸통",
    "플런저",
    "로커 링크",
    "몸통 피벗",
    "이동 손가락 힌지",
    "곡선 손가락",
    "렌더 메시",
    "콜라이더",
    "폐쇄 링크",
  ]) {
    assert.match(glossarySource, new RegExp(term));
  }

  assert.doesNotMatch(glossarySource, /구동 휠/);
  assert.doesNotMatch(glossarySource, /Drive wheel/);
  assert.doesNotMatch(glossarySource, /손가락 끝단의 파지 패드/);
  assert.doesNotMatch(glossarySource, /name: "손가락 끝단"/);
  assert.match(glossarySource, /두 번 꺾인 곡선 손가락/);
  assert.doesNotMatch(clawSource, /FINGER_TIP_HULL/);
  assert.doesNotMatch(clawSource, /tipRadii/);
  assert.doesNotMatch(clawSource, /ConvexHullCollider/);
  assert.equal(
    [...clawSource.matchAll(/new THREE\.LineCurve3/g)].length,
    2,
  );
  assert.match(clawSource, /new THREE\.CubicBezierCurve3/);
  assert.doesNotMatch(clawSource, /new THREE\.CatmullRomCurve3/);
  assert.match(clawSource, /const FINGER_RING_SIDE_VERTICES = 8/);
  assert.match(clawSource, /current \+ side \* 2/);
  assert.match(clawSource, /const startCap = positions\.length \/ 3/);
  assert.match(clawSource, /const endCap = startCap \+ 4/);
  assert.match(clawSource, /geometry\.fingerThickness \/ 2,[\s\S]*friction=\{clawFriction\}/);
  assert.doesNotMatch(clawSource, /args=\{\[0\.09, 0\.09, 0\.07, 14\]\}/);
  assert.doesNotMatch(clawSource, /args=\{\[0\.065, 0\.065, 0\.05, 12\]\}/);
});

test("provides annotated diagrams, filtering, and copyable agent phrases", () => {
  assert.match(glossarySource, /function MachineDiagram/);
  assert.match(glossarySource, /function ClawDiagram/);
  assert.match(glossarySource, /type="search"/);
  assert.match(glossarySource, /setCategory/);
  assert.match(glossarySource, /navigator\.clipboard\.writeText/);
  assert.match(glossarySource, /대화용 표현 복사/);
  assert.match(cssSource, /\.parts-diagram-grid/);
  assert.match(cssSource, /\.parts-card-grid/);
});
