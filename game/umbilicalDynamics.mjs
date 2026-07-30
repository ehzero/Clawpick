import * as THREE from "three";

const EPSILON = 1e-8;
const WORLD_UP = new THREE.Vector3(0, 1, 0);
const WORLD_RIGHT = new THREE.Vector3(1, 0, 0);

export function createUmbilicalState({
  top,
  bottom,
  particleCount,
  slack,
}) {
  const current = [];
  const previous = [];

  for (let index = 0; index <= particleCount; index += 1) {
    const t = index / particleCount;
    const sag = Math.sin(Math.PI * t);
    const point = top
      .clone()
      .lerp(bottom, t)
      .add(
        new THREE.Vector3(
          -slack * 0.55 * sag,
          -slack * 0.35 * sag,
          0,
        ),
      );
    current.push(point);
    previous.push(point.clone());
  }

  return { current, previous };
}

function pinEndpoints(current, previous, top, bottom) {
  current[0].copy(top);
  current.at(-1).copy(bottom);
  previous[0].copy(top);
  previous.at(-1).copy(bottom);
}

function solveDistanceConstraint(
  first,
  second,
  restLength,
  firstPinned,
  secondPinned,
) {
  const offset = second.clone().sub(first);
  const distance = offset.length();
  if (distance <= EPSILON) return;

  const error = (distance - restLength) / distance;
  if (firstPinned) {
    second.addScaledVector(offset, -error);
    return;
  }
  if (secondPinned) {
    first.addScaledVector(offset, error);
    return;
  }

  first.addScaledVector(offset, error * 0.5);
  second.addScaledVector(offset, -error * 0.5);
}

function solveExpandedCylinderCollision(point, cylinder) {
  const inverseRotation = cylinder.quaternion.clone().invert();
  const local = point
    .clone()
    .sub(cylinder.center)
    .applyQuaternion(inverseRotation);
  const radialDistance = Math.hypot(local.x, local.z);
  const verticalDistance = Math.abs(local.y);
  if (
    radialDistance >= cylinder.radius ||
    verticalDistance >= cylinder.halfHeight
  ) {
    return;
  }

  const radialPenetration = cylinder.radius - radialDistance;
  const capPenetration = cylinder.halfHeight - verticalDistance;
  if (radialPenetration <= capPenetration) {
    if (radialDistance > EPSILON) {
      const scale = cylinder.radius / radialDistance;
      local.x *= scale;
      local.z *= scale;
    } else {
      local.x = -cylinder.radius;
      local.z = 0;
    }
  } else {
    local.y =
      (local.y < 0 ? -1 : 1) * cylinder.halfHeight;
  }

  point.copy(
    local.applyQuaternion(cylinder.quaternion).add(cylinder.center),
  );
}

export function projectPointsOutsideCylinder(
  points,
  cylinder,
  { excludeStart = false, excludeEnd = false } = {},
) {
  const start = excludeStart ? 1 : 0;
  const end = points.length - (excludeEnd ? 1 : 0);
  for (let index = start; index < end; index += 1) {
    solveExpandedCylinderCollision(points[index], cylinder);
  }
  return points;
}

export function stepUmbilicalState({
  current,
  previous,
  top,
  bottom,
  delta,
  slack,
  gravity = -9.81,
  damping = 0.93,
  constraintIterations = 10,
  collisionCylinder,
}) {
  const particleCount = current.length - 1;
  if (particleCount < 2 || previous.length !== current.length) return;

  const timeStep = Math.min(1 / 30, Math.max(1 / 240, delta));
  const velocityRetention = Math.pow(damping, timeStep * 60);

  pinEndpoints(current, previous, top, bottom);
  for (let index = 1; index < particleCount; index += 1) {
    const point = current[index];
    const velocity = point
      .clone()
      .sub(previous[index])
      .multiplyScalar(velocityRetention);
    previous[index].copy(point);
    point.add(velocity);
    point.y += gravity * timeStep * timeStep;
  }

  const directLength = top.distanceTo(bottom);
  const segmentLength =
    (directLength + Math.max(0, slack)) / particleCount;

  for (let iteration = 0; iteration < constraintIterations; iteration += 1) {
    pinEndpoints(current, previous, top, bottom);
    const reverse = iteration % 2 === 1;
    for (let step = 0; step < particleCount; step += 1) {
      const index = reverse ? particleCount - 1 - step : step;
      solveDistanceConstraint(
        current[index],
        current[index + 1],
        segmentLength,
        index === 0,
        index + 1 === particleCount,
      );
    }
    if (collisionCylinder) {
      projectPointsOutsideCylinder(current, collisionCylinder, {
        excludeStart: true,
        excludeEnd: true,
      });
    }
  }

  pinEndpoints(current, previous, top, bottom);
}

export function sampleUmbilicalCenterline(current, segmentCount) {
  if (current.length < 2) return [];
  const curve = new THREE.CatmullRomCurve3(
    current.map((point) => point.clone()),
    false,
    "centripetal",
    0.5,
  );
  return curve.getSpacedPoints(segmentCount);
}

function tangentAt(points, index) {
  const previous = points[Math.max(0, index - 1)];
  const next = points[Math.min(points.length - 1, index + 1)];
  return next.clone().sub(previous).normalize();
}

export function createUmbilicalHelix({
  centerline,
  turns,
  coilDiameter,
  strandDiameter,
}) {
  if (centerline.length < 2) return [];

  const coilRadius = Math.max(
    0,
    (coilDiameter - strandDiameter) / 2,
  );
  const helix = [];
  let previousTangent = tangentAt(centerline, 0);
  const reference =
    Math.abs(previousTangent.dot(WORLD_UP)) < 0.9
      ? WORLD_UP
      : WORLD_RIGHT;
  const normal = new THREE.Vector3()
    .crossVectors(previousTangent, reference)
    .normalize();

  for (let index = 0; index < centerline.length; index += 1) {
    const tangent = tangentAt(centerline, index);
    if (index > 0) {
      const rotationAxis = new THREE.Vector3().crossVectors(
        previousTangent,
        tangent,
      );
      const axisLength = rotationAxis.length();
      if (axisLength > EPSILON) {
        rotationAxis.multiplyScalar(1 / axisLength);
        normal.applyAxisAngle(
          rotationAxis,
          Math.atan2(
            axisLength,
            THREE.MathUtils.clamp(
              previousTangent.dot(tangent),
              -1,
              1,
            ),
          ),
        );
      }
      normal
        .addScaledVector(tangent, -normal.dot(tangent))
        .normalize();
    }

    const binormal = new THREE.Vector3()
      .crossVectors(tangent, normal)
      .normalize();
    const progress = index / (centerline.length - 1);
    const phase = progress * Math.PI * 2 * turns;
    helix.push(
      centerline[index]
        .clone()
        .addScaledVector(normal, Math.cos(phase) * coilRadius)
        .addScaledVector(binormal, Math.sin(phase) * coilRadius),
    );
    previousTangent = tangent;
  }

  return helix;
}

export function appendUmbilicalLead({
  helix,
  end,
  approachDirection,
  segmentCount,
}) {
  if (helix.length < 2 || segmentCount < 1) return helix;

  const start = helix.at(-1);
  const startTangent = start
    .clone()
    .sub(helix.at(-2))
    .normalize();
  const endTangent = approachDirection.clone().normalize();
  const distance = start.distanceTo(end);
  const handleLength = Math.min(0.12, distance * 0.32);
  const curve = new THREE.CubicBezierCurve3(
    start,
    start.clone().addScaledVector(startTangent, handleLength),
    end.clone().addScaledVector(endTangent, -handleLength),
    end,
  );
  return [...helix, ...curve.getPoints(segmentCount).slice(1)];
}

export function prependUmbilicalLead({
  helix,
  start,
  departureDirection,
  segmentCount,
}) {
  if (helix.length < 2 || segmentCount < 2) return helix;

  const end = helix[0];
  const direction = departureDirection.clone().normalize();
  const endTangent = helix[1].clone().sub(end).normalize();
  const distance = start.distanceTo(end);
  const straightSegmentCount = Math.max(
    1,
    Math.min(segmentCount - 1, Math.round(segmentCount * 0.5)),
  );
  const transitionSegmentCount = segmentCount - straightSegmentCount;
  const straightLength = Math.min(0.1, distance * 0.45);
  const straightEnd = start
    .clone()
    .addScaledVector(direction, straightLength);
  const straightPoints = Array.from(
    { length: straightSegmentCount + 1 },
    (_, index) =>
      start
        .clone()
        .lerp(straightEnd, index / straightSegmentCount),
  );
  const transitionDistance = straightEnd.distanceTo(end);
  const handleLength = Math.min(0.1, transitionDistance * 0.32);
  const transition = new THREE.CubicBezierCurve3(
    straightEnd,
    straightEnd.clone().addScaledVector(direction, handleLength),
    end.clone().addScaledVector(endTangent, -handleLength),
    end,
  );

  return [
    ...straightPoints,
    ...transition.getPoints(transitionSegmentCount).slice(1),
    ...helix.slice(1),
  ];
}

export function createDynamicTubeGeometry({
  maxSegments,
  radialSegments,
}) {
  const ringCount = maxSegments + 1;
  const vertexCount = ringCount * radialSegments;
  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const indices = new Uint16Array(
    maxSegments * radialSegments * 6,
  );
  let indexOffset = 0;

  for (let segment = 0; segment < maxSegments; segment += 1) {
    const currentRing = segment * radialSegments;
    const nextRing = (segment + 1) * radialSegments;
    for (let side = 0; side < radialSegments; side += 1) {
      const nextSide = (side + 1) % radialSegments;
      const a = currentRing + side;
      const b = nextRing + side;
      const c = nextRing + nextSide;
      const d = currentRing + nextSide;
      indices[indexOffset] = a;
      indices[indexOffset + 1] = d;
      indices[indexOffset + 2] = b;
      indices[indexOffset + 3] = b;
      indices[indexOffset + 4] = d;
      indices[indexOffset + 5] = c;
      indexOffset += 6;
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.BufferAttribute(positions, 3).setUsage(
      THREE.DynamicDrawUsage,
    ),
  );
  geometry.setAttribute(
    "normal",
    new THREE.BufferAttribute(normals, 3).setUsage(
      THREE.DynamicDrawUsage,
    ),
  );
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.setDrawRange(0, 0);
  geometry.userData.dynamicTube = { maxSegments, radialSegments };
  return geometry;
}

export function updateDynamicTubeGeometry({
  geometry,
  points,
  radius,
}) {
  const metadata = geometry.userData.dynamicTube;
  if (!metadata || points.length < 2) {
    geometry.setDrawRange(0, 0);
    return 0;
  }

  const { maxSegments, radialSegments } = metadata;
  const segmentCount = Math.min(maxSegments, points.length - 1);
  const positions = geometry.getAttribute("position");
  const normals = geometry.getAttribute("normal");
  let previousTangent = tangentAt(points, 0);
  const reference =
    Math.abs(previousTangent.dot(WORLD_UP)) < 0.9
      ? WORLD_UP
      : WORLD_RIGHT;
  const frameNormal = new THREE.Vector3()
    .crossVectors(previousTangent, reference)
    .normalize();

  for (let ring = 0; ring <= segmentCount; ring += 1) {
    const tangent = tangentAt(points, ring);
    if (ring > 0) {
      const rotationAxis = new THREE.Vector3().crossVectors(
        previousTangent,
        tangent,
      );
      const axisLength = rotationAxis.length();
      if (axisLength > EPSILON) {
        rotationAxis.multiplyScalar(1 / axisLength);
        frameNormal.applyAxisAngle(
          rotationAxis,
          Math.atan2(
            axisLength,
            THREE.MathUtils.clamp(
              previousTangent.dot(tangent),
              -1,
              1,
            ),
          ),
        );
      }
      frameNormal
        .addScaledVector(tangent, -frameNormal.dot(tangent))
        .normalize();
    }

    const frameBinormal = new THREE.Vector3()
      .crossVectors(tangent, frameNormal)
      .normalize();
    for (let side = 0; side < radialSegments; side += 1) {
      const angle = (side / radialSegments) * Math.PI * 2;
      const surfaceNormal = frameNormal
        .clone()
        .multiplyScalar(Math.cos(angle))
        .addScaledVector(frameBinormal, Math.sin(angle))
        .normalize();
      const vertex = ring * radialSegments + side;
      const position = points[ring]
        .clone()
        .addScaledVector(surfaceNormal, radius);
      positions.setXYZ(vertex, position.x, position.y, position.z);
      normals.setXYZ(
        vertex,
        surfaceNormal.x,
        surfaceNormal.y,
        surfaceNormal.z,
      );
    }
    previousTangent = tangent;
  }

  positions.needsUpdate = true;
  normals.needsUpdate = true;
  geometry.setDrawRange(
    0,
    segmentCount * radialSegments * 6,
  );
  return segmentCount;
}

export function measurePolylineLength(points) {
  let length = 0;
  for (let index = 0; index < points.length - 1; index += 1) {
    length += points[index].distanceTo(points[index + 1]);
  }
  return length;
}
