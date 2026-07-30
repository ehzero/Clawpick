import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import {
  appendUmbilicalLead,
  createDynamicTubeGeometry,
  createUmbilicalHelix,
  createUmbilicalState,
  measurePolylineLength,
  prependUmbilicalLead,
  sampleUmbilicalCenterline,
  stepUmbilicalState,
  updateDynamicTubeGeometry,
} from "../game/umbilicalDynamics.mjs";

test("the visual power cable sags under gravity while both ends stay pinned", () => {
  const top = new THREE.Vector3(0, 1, 0);
  const bottom = new THREE.Vector3(0, 0, 0);
  const state = createUmbilicalState({
    top,
    bottom,
    particleCount: 20,
    slack: 0.35,
  });

  for (let frame = 0; frame < 180; frame += 1) {
    stepUmbilicalState({
      ...state,
      top,
      bottom,
      delta: 1 / 60,
      slack: 0.35,
    });
  }

  assert.ok(state.current[0].distanceTo(top) < 1e-9);
  assert.ok(state.current.at(-1).distanceTo(bottom) < 1e-9);
  assert.ok(
    state.current[10].y < 0.5,
    "the free middle of the cable should hang below the straight connection",
  );
  assert.ok(measurePolylineLength(state.current) > top.distanceTo(bottom));
});

test("the rendered helix keeps one radius and an even pitch", () => {
  const axis = Array.from(
    { length: 9 },
    (_, index) => new THREE.Vector3(0, 2 - index * 0.25, 0),
  );
  const centerline = sampleUmbilicalCenterline(axis, 96);
  const strandDiameter = 0.06;
  const coilDiameter = 0.14;
  const expectedRadius = (coilDiameter - strandDiameter) / 2;
  const helix = createUmbilicalHelix({
    centerline,
    turns: 12,
    coilDiameter,
    strandDiameter,
  });

  const radialDistances = helix.map((point, index) =>
    point.distanceTo(centerline[index]),
  );
  for (const radius of radialDistances) {
    assert.ok(Math.abs(radius - expectedRadius) < 1e-9);
  }

  const segmentLengths = helix.slice(0, -1).map((point, index) =>
    point.distanceTo(helix[index + 1]),
  );
  const average =
    segmentLengths.reduce((sum, value) => sum + value, 0) /
    segmentLengths.length;
  assert.ok(
    Math.max(...segmentLengths) - Math.min(...segmentLengths) <
      average * 0.01,
  );
});

test("the power cable uses one continuous indexed tube mesh", () => {
  const radialSegments = 6;
  const geometry = createDynamicTubeGeometry({
    maxSegments: 4,
    radialSegments,
  });
  const points = Array.from(
    { length: 5 },
    (_, index) => new THREE.Vector3(0, index * 0.25, 0),
  );

  const segmentCount = updateDynamicTubeGeometry({
    geometry,
    points,
    radius: 0.03,
  });

  assert.equal(segmentCount, 4);
  assert.equal(geometry.drawRange.count, 4 * radialSegments * 6);
  const index = geometry.getIndex();
  assert.equal(index.getX(2), radialSegments);
  assert.equal(
    index.getX(radialSegments * 6),
    radialSegments,
    "adjacent tube spans must share the same intermediate ring",
  );

  const positions = geometry.getAttribute("position");
  const normals = geometry.getAttribute("normal");
  const triangle = [0, 1, 2].map((offset) => {
    const vertex = index.getX(offset);
    return new THREE.Vector3(
      positions.getX(vertex),
      positions.getY(vertex),
      positions.getZ(vertex),
    );
  });
  const faceNormal = triangle[1]
    .clone()
    .sub(triangle[0])
    .cross(triangle[2].clone().sub(triangle[0]))
    .normalize();
  const firstVertex = index.getX(0);
  const firstNormal = new THREE.Vector3(
    normals.getX(firstVertex),
    normals.getY(firstVertex),
    normals.getZ(firstVertex),
  );
  assert.ok(faceNormal.dot(firstNormal) > 0);

  for (let vertex = 0; vertex < 5 * radialSegments; vertex += 1) {
    const normalLength = Math.hypot(
      normals.getX(vertex),
      normals.getY(vertex),
      normals.getZ(vertex),
    );
    assert.ok(Number.isFinite(positions.getX(vertex)));
    assert.ok(Math.abs(normalLength - 1) < 1e-6);
  }
  geometry.dispose();
});

test("the cable axis is projected outside the moving housing cylinder", () => {
  const top = new THREE.Vector3(-1, 0, 0);
  const bottom = new THREE.Vector3(1, 0, 0);
  const state = createUmbilicalState({
    top,
    bottom,
    particleCount: 12,
    slack: 0,
  });

  stepUmbilicalState({
    ...state,
    top,
    bottom,
    delta: 1 / 60,
    slack: 0,
    gravity: 0,
    collisionCylinder: {
      center: new THREE.Vector3(),
      quaternion: new THREE.Quaternion(),
      radius: 0.4,
      halfHeight: 1,
    },
  });

  for (const point of state.current.slice(1, -1)) {
    assert.ok(
      Math.hypot(point.x, point.z) >= 0.4 - 1e-9 ||
        Math.abs(point.y) >= 1 - 1e-9,
    );
  }
});

test("a tangent lead connects the final coil turn into the housing", () => {
  const helix = [
    new THREE.Vector3(-0.8, 0.1, 0.1),
    new THREE.Vector3(-0.7, 0.1, 0.08),
    new THREE.Vector3(-0.6, 0.1, 0.05),
  ];
  const end = new THREE.Vector3(-0.3, 0.1, 0);
  const approachDirection = new THREE.Vector3(1, 0, 0);
  const connected = appendUmbilicalLead({
    helix,
    end,
    approachDirection,
    segmentCount: 12,
  });

  assert.equal(connected.length, helix.length + 12);
  assert.ok(connected.at(-1).distanceTo(end) < 1e-9);
  const finalTangent = connected
    .at(-1)
    .clone()
    .sub(connected.at(-2))
    .normalize();
  assert.ok(finalTangent.dot(approachDirection) > 0.99);
});

test("a straight lead leaves the trolley before joining the first coil", () => {
  const start = new THREE.Vector3(0, 1, 0);
  const departureDirection = new THREE.Vector3(0, -1, 0);
  const helix = [
    new THREE.Vector3(-0.08, 0.75, 0),
    new THREE.Vector3(-0.06, 0.68, 0.02),
    new THREE.Vector3(-0.04, 0.6, 0),
  ];
  const connected = prependUmbilicalLead({
    helix,
    start,
    departureDirection,
    segmentCount: 12,
  });

  assert.equal(connected.length, helix.length + 12);
  assert.ok(connected[0].distanceTo(start) < 1e-9);
  for (let index = 1; index <= 6; index += 1) {
    const segmentDirection = connected[index]
      .clone()
      .sub(connected[index - 1])
      .normalize();
    assert.ok(segmentDirection.dot(departureDirection) > 0.999999);
  }
  assert.ok(
    connected.at(-1).distanceTo(helix.at(-1)) < 1e-9,
  );
});
