"use client";

import {
  useEffect,
  useMemo,
  useRef,
  type MutableRefObject,
  type RefObject,
} from "react";
import { useFrame } from "@react-three/fiber";
import {
  CuboidCollider,
  CylinderCollider,
  RigidBody,
  interactionGroups,
  useBeforePhysicsStep,
  usePrismaticJoint,
  useRapier,
  useRevoluteJoint,
  type RapierRigidBody,
} from "@react-three/rapier";
import type { RopeImpulseJoint } from "@dimforge/rapier3d-compat";
import * as THREE from "three";
import {
  CLAW_GEOMETRY,
  FINGER_COLLIDER_END_OVERLAP,
  createClawGeometry,
  getClawPoseFromPlungerY,
  getOpenClawLowestY,
  sampleClawClearance,
} from "@/game/clawKinematics.mjs";
import { useClawSpecStore } from "@/game/clawSpecs";
import {
  RETRACTED_CABLE_LENGTH,
  calculateMaximumCableLength,
} from "@/game/cableTravel.mjs";
import {
  measureInextensibleCable,
  projectInextensibleCableVelocity,
} from "@/game/cableDynamics.mjs";
import { computeAxialForceCommand } from "@/game/clawActuator.mjs";
import {
  appendUmbilicalLead,
  createDynamicTubeGeometry,
  createUmbilicalHelix,
  createUmbilicalState,
  prependUmbilicalLead,
  projectPointsOutsideCylinder,
  sampleUmbilicalCenterline,
  stepUmbilicalState,
  updateDynamicTubeGeometry,
} from "@/game/umbilicalDynamics.mjs";
import { PRIZE_DECK_FLOOR_Y } from "@/game/machineDimensions.mjs";
import { useGameStore } from "@/game/store";
import type { ClawPartSpecs } from "@/game/types";

export const TROLLEY_Y = 4.02;
export const CHUTE_X = 2.28;
export const CHUTE_Z = 1.18;

const WIRE_GUIDE_CENTER_Y = TROLLEY_Y - 0.18;
const CLAW_ATTACHMENT_Y = 0.4;
const WIRE_GUIDE_RADIUS = 0.22;
const WIRE_GUIDE_HEIGHT = 0.08;
const WIRE_EXIT_LOCAL_Y = -WIRE_GUIDE_HEIGHT / 2;
const WIRE_EXIT_Y = WIRE_GUIDE_CENTER_Y + WIRE_EXIT_LOCAL_Y;
const PLUNGER_STROKE =
  CLAW_GEOMETRY.closedPlungerY - CLAW_GEOMETRY.openPlungerY;
const PLUNGER_OPEN_TARGET_Y = CLAW_GEOMETRY.openPlungerY;
const CLAW_START_Y =
  WIRE_EXIT_Y - RETRACTED_CABLE_LENGTH - CLAW_ATTACHMENT_Y;
const CLAW_LIMIT_X = 2.32;
const CLAW_LIMIT_Z = 1.38;
const FINGER_COUNT = 3;
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const BODY_INITIAL_POSITION: [number, number, number] = [
  0,
  CLAW_START_Y,
  0,
];
const HOUSING_COLLISION_GROUPS = interactionGroups([1], [0, 4]);
const FINGER_COLLISION_GROUPS = interactionGroups([2], [0]);
const LINKAGE_COLLISION_GROUPS = interactionGroups([3], [0]);
const WIRE_GUIDE_COLLISION_GROUPS = interactionGroups([4], [1]);
const FINGER_PATH_SEGMENTS = 24;
const FINGER_RING_SIDE_VERTICES = 8;
const UMBILICAL_PARTICLE_COUNT = 20;
const UMBILICAL_MAX_RENDER_SEGMENTS = 1200;
const UMBILICAL_RADIAL_SEGMENTS = 10;
const UMBILICAL_BODY_LEAD_SEGMENTS = 12;
const UMBILICAL_TROLLEY_LEAD_SEGMENTS = 12;
const UMBILICAL_TROLLEY_LEAD_LENGTH = 0.14;
const UMBILICAL_TROLLEY_CLEARANCE = 0.008;
const UMBILICAL_BODY_CLEARANCE = 0.008;
const HOUSING_TOP_COLUMN_CENTER_Y = 0.29;
const HOUSING_TOP_COLUMN_CENTER_RADIUS = (0.17 + 0.205) / 2;
const HOUSING_COLLIDER_CENTER_Y = 0.09;
const TROLLEY_BODY_SIZE = 0.64;
const HOUSING_COLLARS = [
  { y: 0.4, radius: 0.18, height: 0.022 },
  { y: 0.195, radius: 0.232, height: 0.028 },
  { y: 0.035, radius: 0.232, height: 0.024 },
  { y: -0.19, radius: 0.248, height: 0.024 },
] as const;
function getClawPartDimensions(specs: ClawPartSpecs) {
  return {
    housing: {
      radius: specs.housingDiameter / 2,
      halfHeight: specs.housingHeight / 2,
    },
    plunger: {
      shaftRadius: specs.plungerShaftDiameter / 2,
      shaftHalfHeight: specs.plungerShaftLength / 2,
      shaftY: specs.plungerShaftLength / 2 - 0.01,
      hubRadius: specs.plungerHubDiameter / 2,
      hubHalfHeight: specs.plungerHubThickness / 2,
    },
    rocker: {
      width: specs.linkWidth,
      thickness: specs.linkThickness,
    },
    hinge: {
      radius: specs.hingePinDiameter / 2,
      halfLength: specs.hingePinLength / 2,
    },
  };
}

interface HingePinTransformProps {
  position?: [number, number, number];
  quaternion?: [number, number, number, number];
  rotation?: [number, number, number];
}

function HingePinVisual({
  position,
  quaternion,
  rotation,
}: HingePinTransformProps) {
  const specs = useClawSpecStore((state) => state.specs);
  const hinge = useMemo(
    () => getClawPartDimensions(specs).hinge,
    [specs],
  );

  return (
    <mesh
      castShadow
      position={position}
      quaternion={quaternion}
      rotation={rotation}
    >
      <cylinderGeometry
        args={[hinge.radius, hinge.radius, hinge.halfLength * 2, 18]}
      />
      <meshStandardMaterial
        color="#777c78"
        metalness={0.94}
        roughness={0.22}
      />
    </mesh>
  );
}

function HingePinCollider({
  position,
  quaternion,
  rotation,
  friction,
  collisionGroups,
}: HingePinTransformProps & {
  friction?: number;
  collisionGroups: number;
}) {
  const specs = useClawSpecStore((state) => state.specs);
  const hinge = useMemo(
    () => getClawPartDimensions(specs).hinge,
    [specs],
  );

  return (
    <CylinderCollider
      args={[hinge.halfLength, hinge.radius]}
      position={position}
      quaternion={quaternion}
      rotation={rotation}
      friction={friction}
      restitution={0.01}
      mass={0.008}
      collisionGroups={collisionGroups}
    />
  );
}

function fingerWidthScaleAt(
  progress: number,
  taperStart: number,
  tipWidthScale: number,
) {
  if (progress <= taperStart) return 1;
  const range = Math.max(0.001, 1 - taperStart);
  const t = Math.min(1, (progress - taperStart) / range);
  const smooth = t * t * (3 - 2 * t);
  return 1 + (tipWidthScale - 1) * smooth;
}

interface MechanicalClawProps {
  bodies: MutableRefObject<Record<string, RapierRigidBody | null>>;
}

interface ClawFingerColliderProps {
  index: number;
  fingerRef: RefObject<RapierRigidBody | null>;
}

type ClawGeometry = ReturnType<typeof createClawGeometry>;

interface SegmentTransform {
  position: [number, number, number];
  quaternion: [number, number, number, number];
  length: number;
  widthScale?: number;
}

function approach(current: number, target: number, amount: number) {
  if (current < target) return Math.min(target, current + amount);
  return Math.max(target, current - amount);
}

function measurePlungerMotion(
  housing: RapierRigidBody,
  plunger: RapierRigidBody,
) {
  const housingPosition = housing.translation();
  const housingRotation = housing.rotation();
  const plungerPosition = plunger.translation();
  const plungerVelocity = plunger.linvel();
  const axis = Y_AXIS.clone().applyQuaternion(
    new THREE.Quaternion(
      housingRotation.x,
      housingRotation.y,
      housingRotation.z,
      housingRotation.w,
    ),
  );
  const openAnchor = new THREE.Vector3(
    housingPosition.x,
    housingPosition.y,
    housingPosition.z,
  ).addScaledVector(axis, CLAW_GEOMETRY.openPlungerY);
  const stroke = new THREE.Vector3(
    plungerPosition.x,
    plungerPosition.y,
    plungerPosition.z,
  )
    .sub(openAnchor)
    .dot(axis);
  const housingAnchorVelocity = housing.velocityAtPoint(openAnchor);
  const velocity = new THREE.Vector3(
    plungerVelocity.x - housingAnchorVelocity.x,
    plungerVelocity.y - housingAnchorVelocity.y,
    plungerVelocity.z - housingAnchorVelocity.z,
  ).dot(axis);

  return { axis, stroke, velocity };
}

function isPlungerSettled(
  motion: { stroke: number; velocity: number } | null,
  targetY: number,
  positionTolerance: number,
  velocityTolerance: number,
) {
  if (!motion) return false;
  const targetStroke = targetY - CLAW_GEOMETRY.openPlungerY;
  return (
    Math.abs(targetStroke - motion.stroke) <= positionTolerance &&
    Math.abs(motion.velocity) <= velocityTolerance
  );
}

function radialPoint(index: number, radius: number, y: number) {
  const theta = index * ((Math.PI * 2) / FINGER_COUNT) + Math.PI / 6;
  return new THREE.Vector3(
    Math.cos(theta) * radius,
    y,
    Math.sin(theta) * radius,
  );
}

function radialAxis(index: number): [number, number, number] {
  const theta = index * ((Math.PI * 2) / FINGER_COUNT) + Math.PI / 6;
  return [-Math.sin(theta), 0, Math.cos(theta)];
}

function plateBetween(
  start: THREE.Vector3,
  end: THREE.Vector3,
  widthAxis: THREE.Vector3,
): SegmentTransform {
  const direction = end.clone().sub(start);
  const length = direction.length();
  const lengthAxis = direction.clone().normalize();
  const normalizedWidthAxis = widthAxis.clone().normalize();
  const faceNormal = normalizedWidthAxis
    .clone()
    .cross(lengthAxis)
    .normalize();
  const rotation = new THREE.Matrix4().makeBasis(
    normalizedWidthAxis,
    lengthAxis,
    faceNormal,
  );
  const quaternion = new THREE.Quaternion().setFromRotationMatrix(rotation);
  const midpoint = start.clone().add(end).multiplyScalar(0.5);
  return {
    position: midpoint.toArray() as [number, number, number],
    quaternion: quaternion.toArray() as [number, number, number, number],
    length,
  };
}

function createFingerLinkagePath(
  index: number,
  geometry: ClawGeometry = CLAW_GEOMETRY,
) {
  const theta = thetaForIndex(index);
  const radial = new THREE.Vector3(Math.cos(theta), 0, Math.sin(theta));
  const hingeAxis = new THREE.Vector3(-Math.sin(theta), 0, Math.cos(theta));
  const controlPoints = geometry.curvePoints.map(
    (point) =>
      new THREE.Vector3(
        radial.x * point.r,
        point.y,
        radial.z * point.r,
      ),
  );
  const bendStartIndex = geometry.fingerStraightEndIndex;
  const curve = new THREE.CurvePath<THREE.Vector3>();
  curve.add(
    new THREE.LineCurve3(
      controlPoints[0],
      controlPoints[bendStartIndex],
    ),
  );
  curve.add(
    new THREE.CubicBezierCurve3(
      controlPoints[bendStartIndex],
      controlPoints[bendStartIndex + 1],
      controlPoints[bendStartIndex + 2],
      controlPoints[geometry.fingerCurveEndIndex],
    ),
  );
  curve.add(
    new THREE.LineCurve3(
      controlPoints[geometry.fingerCurveEndIndex],
      controlPoints.at(-1)!,
    ),
  );
  const plungerDirection = new THREE.Vector3(
    radial.x * geometry.fingerPlungerDirection.r,
    geometry.fingerPlungerDirection.y,
    radial.z * geometry.fingerPlungerDirection.r,
  ).normalize();
  const plungerArmEnd = plungerDirection
    .clone()
    .multiplyScalar(geometry.fingerPlungerLength);
  const plungerArm = plateBetween(
    new THREE.Vector3(),
    plungerArmEnd,
    hingeAxis,
  );

  return {
    curve,
    plungerArm,
    plungerArmEnd: plungerArmEnd.toArray() as [number, number, number],
  };
}

function createFingerStripGeometry(
  index: number,
  clawGeometry: ClawGeometry,
) {
  const theta = thetaForIndex(index);
  const hingeAxis = new THREE.Vector3(-Math.sin(theta), 0, Math.cos(theta));
  const linkage = createFingerLinkagePath(index, clawGeometry);
  const { curve } = linkage;
  const positions: number[] = [];
  const indices: number[] = [];

  for (let index = 0; index <= FINGER_PATH_SEGMENTS; index += 1) {
    const t = index / FINGER_PATH_SEGMENTS;
    const point = curve.getPoint(t);
    const pathTangent = curve.getTangent(t).normalize();
    const faceNormal = hingeAxis.clone().cross(pathTangent).normalize();
    const widthScale = fingerWidthScaleAt(
      t,
      clawGeometry.fingerTaperStart,
      clawGeometry.fingerTipWidthScale,
    );
    const halfWidth = (clawGeometry.fingerWidth * widthScale) / 2;
    const halfThickness = clawGeometry.fingerThickness / 2;
    const corners = [
      point
        .clone()
        .addScaledVector(hingeAxis, -halfWidth)
        .addScaledVector(faceNormal, -halfThickness),
      point
        .clone()
        .addScaledVector(hingeAxis, halfWidth)
        .addScaledVector(faceNormal, -halfThickness),
      point
        .clone()
        .addScaledVector(hingeAxis, halfWidth)
        .addScaledVector(faceNormal, halfThickness),
      point
        .clone()
        .addScaledVector(hingeAxis, -halfWidth)
        .addScaledVector(faceNormal, halfThickness),
    ];

    for (let side = 0; side < 4; side += 1) {
      const followingSide = (side + 1) % 4;
      positions.push(
        ...corners[side].toArray(),
        ...corners[followingSide].toArray(),
      );
    }
  }

  for (let index = 0; index < FINGER_PATH_SEGMENTS; index += 1) {
    const current = index * FINGER_RING_SIDE_VERTICES;
    const next = (index + 1) * FINGER_RING_SIDE_VERTICES;
    for (let side = 0; side < 4; side += 1) {
      const currentStart = current + side * 2;
      const currentEnd = currentStart + 1;
      const nextStart = next + side * 2;
      const nextEnd = nextStart + 1;
      indices.push(
        currentStart,
        nextStart,
        nextEnd,
        currentStart,
        nextEnd,
        currentEnd,
      );
    }
  }

  const startCap = positions.length / 3;
  const endCap = startCap + 4;
  const startPoint = curve.getPoint(0);
  const startTangent = curve.getTangent(0).normalize();
  const startNormal = hingeAxis.clone().cross(startTangent).normalize();
  const startHalfWidth = clawGeometry.fingerWidth / 2;
  const startHalfThickness = clawGeometry.fingerThickness / 2;
  const endPoint = curve.getPoint(1);
  const endTangent = curve.getTangent(1).normalize();
  const endNormal = hingeAxis.clone().cross(endTangent).normalize();
  const endHalfWidth =
    (clawGeometry.fingerWidth * clawGeometry.fingerTipWidthScale) / 2;
  const endHalfThickness = clawGeometry.fingerThickness / 2;

  for (const [point, normal, halfWidth, halfThickness] of [
    [startPoint, startNormal, startHalfWidth, startHalfThickness],
    [endPoint, endNormal, endHalfWidth, endHalfThickness],
  ] as const) {
    const corners = [
      point
        .clone()
        .addScaledVector(hingeAxis, -halfWidth)
        .addScaledVector(normal, -halfThickness),
      point
        .clone()
        .addScaledVector(hingeAxis, halfWidth)
        .addScaledVector(normal, -halfThickness),
      point
        .clone()
        .addScaledVector(hingeAxis, halfWidth)
        .addScaledVector(normal, halfThickness),
      point
        .clone()
        .addScaledVector(hingeAxis, -halfWidth)
        .addScaledVector(normal, halfThickness),
    ];
    for (const corner of corners) positions.push(...corner.toArray());
  }

  indices.push(
    startCap,
    startCap + 2,
    startCap + 1,
    startCap,
    startCap + 3,
    startCap + 2,
  );
  indices.push(
    endCap,
    endCap + 1,
    endCap + 2,
    endCap,
    endCap + 2,
    endCap + 3,
  );

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  return {
    curve,
    geometry,
    plungerArm: linkage.plungerArm,
    plungerArmEnd: linkage.plungerArmEnd,
  };
}

function setMeshBetween(
  mesh: THREE.Mesh | null,
  start: THREE.Vector3,
  end: THREE.Vector3,
) {
  if (!mesh) return;
  const direction = end.clone().sub(start);
  const length = direction.length();
  mesh.position.copy(start).add(end).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(Y_AXIS, direction.normalize());
  mesh.scale.set(1, length, 1);
}

function createRockerLinkShape(index: number) {
  const openPose = getClawPoseFromPlungerY(CLAW_GEOMETRY.openPlungerY);
  const housingPivot = radialPoint(
    index,
    CLAW_GEOMETRY.housingPivot.r,
    CLAW_GEOMETRY.housingPivot.y,
  );
  const openHinge = radialPoint(
    index,
    openPose.hinge.r,
    openPose.hinge.y,
  );
  const rockerEnd = openHinge.clone().sub(housingPivot);
  const hingeAxis = new THREE.Vector3(...radialAxis(index));
  const pinQuaternion = new THREE.Quaternion().setFromUnitVectors(
    Y_AXIS,
    hingeAxis,
  );

  return {
    housingPivot: housingPivot.toArray() as [number, number, number],
    rockerLink: plateBetween(
      new THREE.Vector3(),
      rockerEnd,
      hingeAxis,
    ),
    rockerEnd: rockerEnd.toArray() as [number, number, number],
    pinQuaternion:
      pinQuaternion.toArray() as [number, number, number, number],
  };
}

function RockerLink({ index }: { index: number }) {
  const shape = useMemo(() => createRockerLinkShape(index), [index]);
  const specs = useClawSpecStore((state) => state.specs);
  const rockerParts = useMemo(
    () => getClawPartDimensions(specs).rocker,
    [specs],
  );

  return (
    <group name={`claw-rocker-visual-${index + 1}`}>
      <mesh
        castShadow
        position={shape.rockerLink.position}
        quaternion={shape.rockerLink.quaternion}
      >
        <boxGeometry
          args={[
            rockerParts.width,
            shape.rockerLink.length,
            rockerParts.thickness,
          ]}
        />
        <meshStandardMaterial
          color="#aeb2af"
          metalness={0.93}
          roughness={0.22}
        />
      </mesh>
      <HingePinVisual
        position={shape.rockerEnd}
        quaternion={shape.pinQuaternion}
      />
    </group>
  );
}

function ClawFingerVisual({ index }: { index: number }) {
  const specs = useClawSpecStore((state) => state.specs);
  const geometry = useMemo(() => createClawGeometry(specs), [specs]);
  const shape = useMemo(() => {
    const strip = createFingerStripGeometry(index, geometry);
    return {
      geometry: strip.geometry,
      plungerArm: strip.plungerArm,
    };
  }, [geometry, index]);

  return (
    <group
      name={`claw-finger-visual-${index + 1}`}
    >
      <mesh castShadow geometry={shape.geometry}>
        <meshStandardMaterial
          color="#d6d8d5"
          metalness={0.96}
          roughness={0.2}
        />
      </mesh>
      <mesh
        castShadow
        position={shape.plungerArm.position}
        quaternion={shape.plungerArm.quaternion}
      >
        <boxGeometry
          args={[
            geometry.fingerWidth * 0.9,
            shape.plungerArm.length,
            geometry.fingerThickness,
          ]}
        />
        <meshStandardMaterial
          color="#d0d3d0"
          metalness={0.96}
          roughness={0.19}
        />
      </mesh>
    </group>
  );
}

function ClawFingerCollider({
  index,
  fingerRef,
}: ClawFingerColliderProps) {
  const specs = useClawSpecStore((state) => state.specs);
  const geometry = useMemo(() => createClawGeometry(specs), [specs]);
  const debug = useGameStore((state) => state.debug);
  const clawFriction = useGameStore(
    (state) => state.settings.clawFriction,
  );
  const shape = useMemo(() => {
    const linkage = createFingerLinkagePath(index, geometry);
    const points = linkage.curve.getPoints(FINGER_PATH_SEGMENTS);
    const hingeAxis = new THREE.Vector3(...radialAxis(index));

    return {
      segments: points.slice(0, -1).map((point, segmentIndex) => ({
        ...plateBetween(point, points[segmentIndex + 1], hingeAxis),
        widthScale: fingerWidthScaleAt(
          (segmentIndex + 0.5) / FINGER_PATH_SEGMENTS,
          geometry.fingerTaperStart,
          geometry.fingerTipWidthScale,
        ),
      })),
      plungerArm: linkage.plungerArm,
    };
  }, [geometry, index]);
  const openPose = getClawPoseFromPlungerY(CLAW_GEOMETRY.openPlungerY);
  const hinge = radialPoint(index, openPose.hinge.r, openPose.hinge.y);
  const openFingerQuaternion = new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(...radialAxis(index)),
    openPose.angle,
  );

  return (
    <RigidBody
      ref={fingerRef}
      colliders={false}
      position={[
        BODY_INITIAL_POSITION[0] + hinge.x,
        BODY_INITIAL_POSITION[1] + hinge.y,
        BODY_INITIAL_POSITION[2] + hinge.z,
      ]}
      quaternion={openFingerQuaternion}
      canSleep={false}
      ccd
      name={`claw-finger-collider-${index + 1}`}
    >
      <group visible={!debug}>
        <ClawFingerVisual index={index} />
      </group>
      {shape.segments.map((segment, segmentIndex) => (
        <CuboidCollider
          key={segmentIndex}
          args={[
            (geometry.fingerWidth * (segment.widthScale ?? 1)) / 2,
            segment.length / 2 + FINGER_COLLIDER_END_OVERLAP,
            geometry.fingerThickness / 2,
          ]}
          position={segment.position}
          quaternion={segment.quaternion}
          friction={clawFriction}
          restitution={0.01}
          mass={0.005}
          collisionGroups={FINGER_COLLISION_GROUPS}
        />
      ))}
      <CuboidCollider
        args={[
          geometry.fingerWidth * 0.45,
          shape.plungerArm.length / 2,
          geometry.fingerThickness / 2,
        ]}
        position={shape.plungerArm.position}
        quaternion={shape.plungerArm.quaternion}
        friction={clawFriction}
        restitution={0.01}
        mass={0.02}
        collisionGroups={FINGER_COLLISION_GROUPS}
      />
    </RigidBody>
  );
}

function PlungerCollider({
  plungerRef,
}: {
  plungerRef: RefObject<RapierRigidBody | null>;
}) {
  const debug = useGameStore((state) => state.debug);
  const clawFriction = useGameStore(
    (state) => state.settings.clawFriction,
  );
  const specs = useClawSpecStore((state) => state.specs);
  const plungerParts = useMemo(
    () => getClawPartDimensions(specs).plunger,
    [specs],
  );

  return (
    <RigidBody
      ref={plungerRef}
      colliders={false}
      position={[
        BODY_INITIAL_POSITION[0],
        BODY_INITIAL_POSITION[1] + CLAW_GEOMETRY.openPlungerY,
        BODY_INITIAL_POSITION[2],
      ]}
      canSleep={false}
      ccd
      name="claw-plunger-collider"
    >
      <group visible={!debug}>
        <PlungerVisual />
      </group>
      <CylinderCollider
        args={[
          plungerParts.shaftHalfHeight,
          plungerParts.shaftRadius,
        ]}
        position={[0, plungerParts.shaftY, 0]}
        friction={clawFriction}
        mass={0.09}
        collisionGroups={LINKAGE_COLLISION_GROUPS}
      />
      <CylinderCollider
        args={[
          plungerParts.hubHalfHeight,
          plungerParts.hubRadius,
        ]}
        friction={clawFriction}
        mass={0.05}
        collisionGroups={LINKAGE_COLLISION_GROUPS}
      />
      {Array.from({ length: FINGER_COUNT }, (_, index) => {
        const theta = thetaForIndex(index);
        return (
          <group key={index} rotation={[0, -theta, 0]}>
            <HingePinCollider
              position={[CLAW_GEOMETRY.plungerRadius, 0, 0]}
              rotation={[Math.PI / 2, 0, 0]}
              friction={clawFriction}
              collisionGroups={LINKAGE_COLLISION_GROUPS}
            />
          </group>
        );
      })}
    </RigidBody>
  );
}

function RockerLinkCollider({
  index,
  rockerRef,
}: {
  index: number;
  rockerRef: RefObject<RapierRigidBody | null>;
}) {
  const shape = useMemo(() => createRockerLinkShape(index), [index]);
  const debug = useGameStore((state) => state.debug);
  const specs = useClawSpecStore((state) => state.specs);
  const rockerParts = useMemo(
    () => getClawPartDimensions(specs).rocker,
    [specs],
  );

  return (
    <RigidBody
      ref={rockerRef}
      colliders={false}
      position={[
        BODY_INITIAL_POSITION[0] + shape.housingPivot[0],
        BODY_INITIAL_POSITION[1] + shape.housingPivot[1],
        BODY_INITIAL_POSITION[2] + shape.housingPivot[2],
      ]}
      canSleep={false}
      ccd
      name={`claw-rocker-collider-${index + 1}`}
    >
      <group visible={!debug}>
        <RockerLink index={index} />
      </group>
      <CuboidCollider
        args={[
          rockerParts.width / 2,
          shape.rockerLink.length / 2,
          rockerParts.thickness / 2,
        ]}
        position={shape.rockerLink.position}
        quaternion={shape.rockerLink.quaternion}
        mass={0.025}
        collisionGroups={LINKAGE_COLLISION_GROUPS}
      />
      <HingePinCollider
        quaternion={shape.pinQuaternion}
        collisionGroups={LINKAGE_COLLISION_GROUPS}
      />
      <HingePinCollider
        position={shape.rockerEnd}
        quaternion={shape.pinQuaternion}
        collisionGroups={LINKAGE_COLLISION_GROUPS}
      />
    </RigidBody>
  );
}

function PlungerVisual() {
  const specs = useClawSpecStore((state) => state.specs);
  const plungerParts = useMemo(
    () => getClawPartDimensions(specs).plunger,
    [specs],
  );

  return (
    <group
      name="claw-central-plunger"
    >
      <mesh castShadow position={[0, plungerParts.shaftY, 0]}>
        <cylinderGeometry
          args={[
            plungerParts.shaftRadius,
            plungerParts.shaftRadius,
            plungerParts.shaftHalfHeight * 2,
            18,
          ]}
        />
        <meshStandardMaterial
          color="#929794"
          metalness={0.96}
          roughness={0.16}
        />
      </mesh>
      <mesh castShadow>
        <cylinderGeometry
          args={[
            plungerParts.hubRadius,
            plungerParts.hubRadius,
            plungerParts.hubHalfHeight * 2,
            24,
          ]}
        />
        <meshStandardMaterial
          color="#b7bbb8"
          metalness={0.95}
          roughness={0.18}
        />
      </mesh>
      {Array.from({ length: FINGER_COUNT }, (_, index) => {
        const theta = thetaForIndex(index);
        return (
          <group key={index} rotation={[0, -theta, 0]}>
            <HingePinVisual
              position={[CLAW_GEOMETRY.plungerRadius, 0, 0]}
              rotation={[Math.PI / 2, 0, 0]}
            />
          </group>
        );
      })}
    </group>
  );
}

function thetaForIndex(index: number) {
  return index * ((Math.PI * 2) / FINGER_COUNT) + Math.PI / 6;
}

function FingerClosedLoopJoints({
  index,
  housingRef,
  plungerRef,
  rockerRef,
  fingerRef,
}: {
  index: number;
  housingRef: RefObject<RapierRigidBody | null>;
  plungerRef: RefObject<RapierRigidBody | null>;
  rockerRef: RefObject<RapierRigidBody | null>;
  fingerRef: RefObject<RapierRigidBody | null>;
}) {
  const shape = useMemo(() => createRockerLinkShape(index), [index]);
  const linkage = useMemo(() => createFingerLinkagePath(index), [index]);
  const hingeAxis = useMemo(() => radialAxis(index), [index]);
  const plungerPin = useMemo(
    () =>
      radialPoint(index, CLAW_GEOMETRY.plungerRadius, 0).toArray() as [
        number,
        number,
        number,
      ],
    [index],
  );

  useRevoluteJoint(
    housingRef as RefObject<RapierRigidBody>,
    rockerRef as RefObject<RapierRigidBody>,
    [
      shape.housingPivot,
      [0, 0, 0],
      hingeAxis,
    ],
  );
  useRevoluteJoint(
    rockerRef as RefObject<RapierRigidBody>,
    fingerRef as RefObject<RapierRigidBody>,
    [
      shape.rockerEnd,
      [0, 0, 0],
      hingeAxis,
    ],
  );
  useRevoluteJoint(
    fingerRef as RefObject<RapierRigidBody>,
    plungerRef as RefObject<RapierRigidBody>,
    [
      linkage.plungerArmEnd,
      plungerPin,
      hingeAxis,
    ],
  );

  return null;
}

function ClawClosedLinkage({
  housingRef,
  plungerRef,
  rockerRefs,
  fingerRefs,
  targetPlungerY,
  actuatorForceRef,
}: {
  housingRef: RefObject<RapierRigidBody | null>;
  plungerRef: RefObject<RapierRigidBody | null>;
  rockerRefs: ReadonlyArray<RefObject<RapierRigidBody | null>>;
  fingerRefs: ReadonlyArray<RefObject<RapierRigidBody | null>>;
  targetPlungerY: MutableRefObject<number>;
  actuatorForceRef: MutableRefObject<number>;
}) {
  usePrismaticJoint(
    housingRef as RefObject<RapierRigidBody>,
    plungerRef as RefObject<RapierRigidBody>,
    [
      [0, CLAW_GEOMETRY.openPlungerY, 0],
      [0, 0, 0],
      [0, 1, 0],
      [0, PLUNGER_STROKE],
    ],
  );

  useBeforePhysicsStep(() => {
    const housing = housingRef.current;
    const plunger = plungerRef.current;
    if (!housing || !plunger) return;

    const { settings } = useGameStore.getState();
    const { plungerMaxForce } = settings;
    const targetStroke = THREE.MathUtils.clamp(
      targetPlungerY.current - CLAW_GEOMETRY.openPlungerY,
      0,
      PLUNGER_STROKE,
    );
    const motion = measurePlungerMotion(housing, plunger);
    const closing =
      targetStroke >= PLUNGER_STROKE * 0.5;
    const remainingTravel = closing
      ? PLUNGER_STROKE - motion.stroke
      : motion.stroke;
    const actuator = computeAxialForceCommand({
      direction: closing ? 1 : -1,
      relativeVelocity: motion.velocity,
      maxSpeed: settings.plungerSpeed,
      maxForce: plungerMaxForce,
      remainingTravel,
    });
    const plungerForce = motion.axis
      .clone()
      .multiplyScalar(actuator.force);
    const housingReactionForce = plungerForce
      .clone()
      .multiplyScalar(-1);

    plunger.resetForces(true);
    housing.resetForces(true);
    plunger.addForce(plungerForce, true);
    housing.addForce(housingReactionForce, true);
    actuatorForceRef.current = actuator.force;
  });

  return (
    <>
      {Array.from({ length: FINGER_COUNT }, (_, index) => (
        <FingerClosedLoopJoints
          key={index}
          index={index}
          housingRef={housingRef}
          plungerRef={plungerRef}
          rockerRef={rockerRefs[index]}
          fingerRef={fingerRefs[index]}
        />
      ))}
    </>
  );
}

function TrolleyMechanism({
  gantryRef,
  trolleyRef,
  drumRef,
}: {
  gantryRef: RefObject<THREE.Group | null>;
  trolleyRef: RefObject<THREE.Group | null>;
  drumRef: RefObject<THREE.Mesh | null>;
}) {
  return (
    <>
      <group ref={gantryRef}>
        <mesh castShadow position={[0, 4.02, 0]}>
          <boxGeometry args={[5.35, 0.12, 0.15]} />
          <meshStandardMaterial color="#d8d8d2" metalness={0.88} roughness={0.2} />
        </mesh>
        <mesh castShadow position={[0, 3.91, 0]}>
          <boxGeometry args={[5.1, 0.08, 0.08]} />
          <meshStandardMaterial color="#555751" metalness={0.82} roughness={0.3} />
        </mesh>
      </group>

      <group ref={trolleyRef}>
        <mesh
          castShadow
          position={[0, 4.02, 0]}
          name="trolley-body-cube"
        >
          <boxGeometry
            args={[
              TROLLEY_BODY_SIZE,
              TROLLEY_BODY_SIZE,
              TROLLEY_BODY_SIZE,
            ]}
          />
          <meshStandardMaterial color="#242724" metalness={0.68} roughness={0.3} />
        </mesh>
        <mesh castShadow position={[0, 4.03, 0.326]}>
          <boxGeometry args={[0.72, 0.22, 0.035]} />
          <meshStandardMaterial color="#111311" metalness={0.35} roughness={0.48} />
        </mesh>
        <mesh castShadow position={[-0.16, 4.16, 0]}>
          <boxGeometry args={[0.24, 0.2, 0.34]} />
          <meshStandardMaterial color="#353733" metalness={0.72} roughness={0.3} />
        </mesh>
        <mesh
          ref={drumRef}
          castShadow
          position={[0.08, 4.03, 0]}
          rotation={[Math.PI / 2, 0, 0]}
        >
          <cylinderGeometry args={[0.13, 0.13, 0.26, 18]} />
          <meshStandardMaterial color="#d5b76f" metalness={0.85} roughness={0.22} />
        </mesh>
      </group>
    </>
  );
}

export function OverheadRails({
  showVisuals = true,
}: {
  showVisuals?: boolean;
}) {
  return (
    <group name="overhead-rail-render-meshes" visible={showVisuals}>
      {[-2.56, 2.56].map((x) => (
        <group key={x}>
          <mesh castShadow position={[x, 4.02, 0]}>
            <boxGeometry args={[0.12, 0.14, 3.35]} />
            <meshStandardMaterial color="#c7c9c4" metalness={0.9} roughness={0.18} />
          </mesh>
          <mesh castShadow position={[x, 3.94, 0]}>
            <boxGeometry args={[0.2, 0.07, 3.42]} />
            <meshStandardMaterial color="#343633" metalness={0.75} roughness={0.32} />
          </mesh>
          {[-1.64, 1.64].map((z) => (
            <mesh key={z} castShadow position={[x, 4.01, z]}>
              <boxGeometry args={[0.28, 0.22, 0.16]} />
              <meshStandardMaterial color="#555650" metalness={0.65} roughness={0.36} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

export default function MechanicalClaw({ bodies }: MechanicalClawProps) {
  const { world, rapier } = useRapier();
  const anchorRef = useRef<RapierRigidBody>(null);
  const housingRef = useRef<RapierRigidBody>(null);
  const plungerColliderRef = useRef<RapierRigidBody>(null);
  const rockerColliderRefs = [
    useRef<RapierRigidBody>(null),
    useRef<RapierRigidBody>(null),
    useRef<RapierRigidBody>(null),
  ];
  const fingerColliderRefs = [
    useRef<RapierRigidBody>(null),
    useRef<RapierRigidBody>(null),
    useRef<RapierRigidBody>(null),
  ];
  const cableRef = useRef<THREE.Mesh>(null);
  const gantryRef = useRef<THREE.Group>(null);
  const trolleyRef = useRef<THREE.Group>(null);
  const drumRef = useRef<THREE.Mesh>(null);
  const umbilicalCurrent = useRef<THREE.Vector3[]>([]);
  const umbilicalPrevious = useRef<THREE.Vector3[]>([]);
  const umbilicalGeometry = useMemo(
    () =>
      createDynamicTubeGeometry({
        maxSegments: UMBILICAL_MAX_RENDER_SEGMENTS,
        radialSegments: UMBILICAL_RADIAL_SEGMENTS,
      }),
    [],
  );
  const plungerY = useRef<number>(CLAW_GEOMETRY.openPlungerY);
  const cableLength = useRef(RETRACTED_CABLE_LENGTH);
  const trolleyPosition = useRef({ x: 0, z: 0 });
  const trolleyVelocity = useRef({ x: 0, z: 0 });
  const phaseElapsed = useRef(0);
  const lastPhase = useRef(useGameStore.getState().phase);
  const frameAccumulator = useRef(0);
  const frameCount = useRef(0);
  const minFps = useRef(60);
  const actuatorForce = useRef(0);
  const lastPlungerStroke = useRef(0);
  const observedPlungerVelocity = useRef(0);
  const ropeJoint = useRef<RopeImpulseJoint | null>(null);
  const ropeJointLength = useRef(Number.NaN);
  const debug = useGameStore((state) => state.debug);
  const clawFriction = useGameStore((state) => state.settings.clawFriction);
  const swingLinearDamping = useGameStore(
    (state) => state.settings.swingLinearDamping,
  );
  const housingAngularDamping = useGameStore(
    (state) => state.settings.housingAngularDamping,
  );
  const clawPartSpecs = useClawSpecStore((state) => state.specs);
  const clawPartDimensions = useMemo(
    () => getClawPartDimensions(clawPartSpecs),
    [clawPartSpecs],
  );
  const editableClawGeometry = useMemo(
    () => createClawGeometry(clawPartSpecs),
    [clawPartSpecs],
  );
  const maximumCableLength = useMemo(
    () =>
      calculateMaximumCableLength({
        wireExitY: WIRE_EXIT_Y,
        housingAttachmentY: CLAW_ATTACHMENT_Y,
        openClawLowestY: getOpenClawLowestY(
          editableClawGeometry,
        ),
        floorY: PRIZE_DECK_FLOOR_Y,
      }),
    [editableClawGeometry],
  );
  const housingScale = useMemo(
    () => [
      clawPartSpecs.housingDiameter / 0.44,
      clawPartSpecs.housingHeight / 0.62,
      clawPartSpecs.housingDiameter / 0.44,
    ] as [number, number, number],
    [clawPartSpecs.housingDiameter, clawPartSpecs.housingHeight],
  );

  useEffect(() => {
    const previousSolverIterations = world.numSolverIterations;
    const previousInternalIterations = world.numInternalPgsIterations;
    // Rapier exposes solver tuning through mutable World properties.
    // eslint-disable-next-line react-hooks/immutability
    world.numSolverIterations = Math.max(previousSolverIterations, 12);
    world.numInternalPgsIterations = Math.max(
      previousInternalIterations,
      2,
    );

    return () => {
      world.numSolverIterations = previousSolverIterations;
      world.numInternalPgsIterations = previousInternalIterations;
    };
  }, [world]);

  useEffect(
    () => () => {
      const joint = ropeJoint.current;
      if (joint && world.getImpulseJoint(joint.handle)) {
        world.removeImpulseJoint(joint, true);
      }
      ropeJoint.current = null;
    },
    [world],
  );

  useEffect(
    () => () => {
      umbilicalGeometry.dispose();
    },
    [umbilicalGeometry],
  );

  useFrame((_, unsafeDelta) => {
    const started = performance.now();
    const delta = Math.min(unsafeDelta, 0.04);
    const state = useGameStore.getState();
    const { settings, phase, input } = state;
    const minimumCableLength = RETRACTED_CABLE_LENGTH;
    cableLength.current = THREE.MathUtils.clamp(
      cableLength.current,
      minimumCableLength,
      maximumCableLength,
    );
    const housing = housingRef.current;
    const anchorBody = anchorRef.current;
    const plunger = plungerColliderRef.current;
    if (!housing || !anchorBody) return;

    frameAccumulator.current += delta;
    frameCount.current += 1;
    if (delta > 0) minFps.current = Math.min(minFps.current, 1 / delta);

    if (lastPhase.current !== phase) {
      lastPhase.current = phase;
      phaseElapsed.current = 0;
    } else {
      phaseElapsed.current += delta;
    }

    const forceClosed =
      phase === "aiming"
        ? state.manualPlungerState === "closed"
        : phase === "closing" ||
          phase === "lifting" ||
          phase === "returning";
    const closedTargetY = CLAW_GEOMETRY.closedPlungerY;
    const plungerDestination = forceClosed
      ? closedTargetY
      : PLUNGER_OPEN_TARGET_Y;
    plungerY.current = plungerDestination;
    const measuredPlungerMotion = plunger
      ? measurePlungerMotion(housing, plunger)
      : null;
    if (measuredPlungerMotion) {
      const rawVelocity =
        (measuredPlungerMotion.stroke - lastPlungerStroke.current) /
        Math.max(delta, 0.0001);
      const smoothing = 1 - Math.exp(-delta * 18);
      observedPlungerVelocity.current = THREE.MathUtils.lerp(
        observedPlungerVelocity.current,
        rawVelocity,
        smoothing,
      );
      lastPlungerStroke.current = measuredPlungerMotion.stroke;
    }
    const plungerMotion = measuredPlungerMotion
      ? {
          ...measuredPlungerMotion,
          velocity: observedPlungerVelocity.current,
        }
      : null;

    const previousCableLength = cableLength.current;
    let desiredX = 0;
    let desiredZ = 0;
    if (phase === "aiming") {
      desiredX = input.x * settings.moveSpeed;
      desiredZ = input.z * settings.moveSpeed;
    } else if (phase === "returning") {
      const dx = CHUTE_X - trolleyPosition.current.x;
      const dz = CHUTE_Z - trolleyPosition.current.z;
      const distance = Math.hypot(dx, dz);
      if (distance > 0.02) {
        desiredX =
          (dx / distance) *
          settings.moveSpeed *
          settings.returnSpeedMultiplier;
        desiredZ =
          (dz / distance) *
          settings.moveSpeed *
          settings.returnSpeedMultiplier;
      }
    }

    const acceleration =
      settings.trolleyAcceleration *
      (phase === "aiming"
        ? 1
        : settings.returnAccelerationMultiplier);
    trolleyVelocity.current.x = approach(
      trolleyVelocity.current.x,
      desiredX,
      acceleration * delta,
    );
    trolleyVelocity.current.z = approach(
      trolleyVelocity.current.z,
      desiredZ,
      acceleration * delta,
    );
    trolleyPosition.current.x = THREE.MathUtils.clamp(
      trolleyPosition.current.x + trolleyVelocity.current.x * delta,
      -CLAW_LIMIT_X,
      CLAW_LIMIT_X,
    );
    trolleyPosition.current.z = THREE.MathUtils.clamp(
      trolleyPosition.current.z + trolleyVelocity.current.z * delta,
      -CLAW_LIMIT_Z,
      CLAW_LIMIT_Z,
    );

    if (
      Math.abs(trolleyPosition.current.x) >= CLAW_LIMIT_X &&
      Math.sign(trolleyVelocity.current.x) ===
        Math.sign(trolleyPosition.current.x)
    ) {
      trolleyVelocity.current.x = 0;
    }
    if (
      Math.abs(trolleyPosition.current.z) >= CLAW_LIMIT_Z &&
      Math.sign(trolleyVelocity.current.z) ===
        Math.sign(trolleyPosition.current.z)
    ) {
      trolleyVelocity.current.z = 0;
    }

    const manualCableDirection =
      phase === "aiming" ? state.manualCableDirection : null;
    if (manualCableDirection === "lower") {
      cableLength.current = Math.min(
        maximumCableLength,
        cableLength.current + settings.lowerSpeed * delta,
      );
      if (cableLength.current >= maximumCableLength - 0.001) {
        state.setManualCableDirection(null);
      }
    } else if (manualCableDirection === "raise") {
      cableLength.current = Math.max(
        minimumCableLength,
        cableLength.current - settings.liftSpeed * delta,
      );
      if (cableLength.current <= minimumCableLength + 0.001) {
        state.setManualCableDirection(null);
      }
    } else if (phase === "descending") {
      cableLength.current = Math.min(
        maximumCableLength,
        cableLength.current + settings.lowerSpeed * delta,
      );
      const bodyPosition = housing.translation();
      const actualLength = Math.hypot(
        trolleyPosition.current.x - bodyPosition.x,
        WIRE_EXIT_Y - (bodyPosition.y + CLAW_ATTACHMENT_Y),
        trolleyPosition.current.z - bodyPosition.z,
      );
      if (
        cableLength.current >= maximumCableLength - 0.001 &&
        (actualLength >= maximumCableLength - 0.07 ||
          phaseElapsed.current > 3)
      ) {
        state.setPhase("closing");
      }
    }

    if (phase === "closing") {
      const stoppedUnderLoad =
        phaseElapsed.current > settings.plungerStallTimeout &&
        plungerMotion !== null &&
        Math.abs(plungerMotion.velocity) <=
          settings.plungerVelocityTolerance;
      if (
        isPlungerSettled(
          plungerMotion,
          closedTargetY,
          settings.plungerPositionTolerance,
          settings.plungerVelocityTolerance,
        ) ||
        stoppedUnderLoad
      ) {
        state.record("grip_attempt", {
          contactModel: "collider-only",
          actuator: "plunger-stroke",
          maxForce: settings.plungerMaxForce,
          measuredForce: Number(
            Math.abs(actuatorForce.current).toFixed(2),
          ),
        });
        state.setPhase("lifting");
      }
    }

    if (!manualCableDirection && phase === "lifting") {
      cableLength.current = Math.max(
        minimumCableLength,
        cableLength.current - settings.liftSpeed * delta,
      );
      if (cableLength.current <= minimumCableLength + 0.001) {
        state.setPhase("returning");
      }
    }

    if (phase === "returning") {
      const distance = Math.hypot(
        CHUTE_X - trolleyPosition.current.x,
        CHUTE_Z - trolleyPosition.current.z,
      );
      if (distance < 0.035 && Math.hypot(desiredX, desiredZ) < 0.01) {
        state.setPhase("releasing");
      }
    }

    if (phase === "releasing") {
      const stoppedUnderLoad =
        phaseElapsed.current > settings.plungerStallTimeout &&
        plungerMotion !== null &&
        Math.abs(plungerMotion.velocity) <=
          settings.plungerVelocityTolerance;
      if (
        isPlungerSettled(
          plungerMotion,
          PLUNGER_OPEN_TARGET_Y,
          settings.plungerPositionTolerance,
          settings.plungerVelocityTolerance,
        ) ||
        stoppedUnderLoad
      ) {
        state.setPhase("settling");
      }
    }

    if (phase === "settling" && phaseElapsed.current > 3.1) {
      if (!state.result) state.finish("lose");
      state.setPhase("result");
    }

    if (gantryRef.current) {
      gantryRef.current.position.z = trolleyPosition.current.z;
    }
    if (trolleyRef.current) {
      trolleyRef.current.position.x = trolleyPosition.current.x;
      trolleyRef.current.position.z = trolleyPosition.current.z;
    }
    anchorBody.setNextKinematicTranslation({
      x: trolleyPosition.current.x,
      y: WIRE_GUIDE_CENTER_Y,
      z: trolleyPosition.current.z,
    });
    if (
      !ropeJoint.current ||
      Math.abs(ropeJointLength.current - cableLength.current) > 0.002
    ) {
      const previousJoint = ropeJoint.current;
      if (
        previousJoint &&
        world.getImpulseJoint(previousJoint.handle)
      ) {
        world.removeImpulseJoint(previousJoint, true);
      }
      ropeJoint.current = world.createImpulseJoint(
        rapier.JointData.rope(
          cableLength.current,
          { x: 0, y: WIRE_EXIT_LOCAL_Y, z: 0 },
          { x: 0, y: CLAW_ATTACHMENT_Y, z: 0 },
        ),
        anchorBody,
        housing,
        true,
      ) as RopeImpulseJoint;
      ropeJoint.current.setContactsEnabled(true);
      ropeJointLength.current = cableLength.current;
    }
    if (drumRef.current) {
      drumRef.current.rotation.y +=
        (phase === "descending" ? 1 : phase === "lifting" ? -1 : 0) *
        delta *
        5;
    }

    const bodyPosition = housing.translation();
    const bodyRotation = housing.rotation();
    const housingQuaternion = new THREE.Quaternion(
      bodyRotation.x,
      bodyRotation.y,
      bodyRotation.z,
      bodyRotation.w,
    );
    const attachmentOffset = new THREE.Vector3(
      0,
      CLAW_ATTACHMENT_Y,
      0,
    ).applyQuaternion(housingQuaternion);
    const attachment = new THREE.Vector3(
      bodyPosition.x + attachmentOffset.x,
      bodyPosition.y + attachmentOffset.y,
      bodyPosition.z + attachmentOffset.z,
    );
    const anchor = new THREE.Vector3(
      trolleyPosition.current.x,
      WIRE_EXIT_Y,
      trolleyPosition.current.z,
    );
    const attachmentVelocity = housing.velocityAtPoint(attachment);
    const cableState = measureInextensibleCable({
      anchor,
      attachment,
      targetLength: cableLength.current,
    });
    const targetLengthRate =
      (cableLength.current - previousCableLength) / Math.max(delta, 0.0001);
    if (
      phase === "descending" ||
      phase === "lifting" ||
      cableState.distance >= cableLength.current - 0.025
    ) {
      const projectedVelocity = projectInextensibleCableVelocity({
        direction: cableState.direction,
        anchorVelocity: {
          x: trolleyVelocity.current.x,
          y: 0,
          z: trolleyVelocity.current.z,
        },
        bodyLinearVelocity: housing.linvel(),
        attachmentVelocity,
        targetLengthRate,
      });
      housing.setLinvel(
        projectedVelocity.bodyLinearVelocity,
        true,
      );
    }

    setMeshBetween(cableRef.current, anchor, attachment);

    const bodyWorldPosition = new THREE.Vector3(
      bodyPosition.x,
      bodyPosition.y,
      bodyPosition.z,
    );
    const cableEnvelopeRadius =
      clawPartSpecs.powerCableCoilDiameter / 2;
    const cableStrandRadius =
      clawPartSpecs.powerCableDiameter / 2;
    const trolleyOutwardDirection = new THREE.Vector3(-1, 0, 0);
    const trolleyConnectionInset = cableStrandRadius * 0.35;
    const trolleyConnection = new THREE.Vector3(
      trolleyPosition.current.x -
        (TROLLEY_BODY_SIZE / 2 - trolleyConnectionInset),
      TROLLEY_Y,
      trolleyPosition.current.z,
    );
    const umbilicalTop = trolleyConnection
      .clone()
      .addScaledVector(
        trolleyOutwardDirection,
        cableEnvelopeRadius +
          UMBILICAL_TROLLEY_CLEARANCE +
          trolleyConnectionInset,
      )
      .add(new THREE.Vector3(0, -UMBILICAL_TROLLEY_LEAD_LENGTH, 0));
    const expandedHousingRadius =
      clawPartDimensions.housing.radius +
      cableEnvelopeRadius +
      UMBILICAL_BODY_CLEARANCE;
    const expandedHousingHalfHeight =
      clawPartDimensions.housing.halfHeight +
      cableEnvelopeRadius +
      UMBILICAL_BODY_CLEARANCE;
    const outwardDirection = new THREE.Vector3(-1, 0, 0)
      .applyQuaternion(housingQuaternion)
      .normalize();
    const housingMeshScaleY =
      clawPartSpecs.housingHeight / 0.62;
    const housingMeshScaleRadius =
      clawPartSpecs.housingDiameter / 0.44;
    const bodyConnectionY =
      HOUSING_TOP_COLUMN_CENTER_Y * housingMeshScaleY;
    const bodyConnectionRadius =
      HOUSING_TOP_COLUMN_CENTER_RADIUS * housingMeshScaleRadius;
    const umbilicalBottom = bodyWorldPosition
      .clone()
      .add(
        new THREE.Vector3(
          -expandedHousingRadius,
          bodyConnectionY,
          0,
        ).applyQuaternion(housingQuaternion),
      );
    const bodyConnection = bodyWorldPosition
      .clone()
      .add(
        new THREE.Vector3(
          -(
            bodyConnectionRadius -
            cableStrandRadius * 0.35
          ),
          bodyConnectionY,
          0,
        ).applyQuaternion(housingQuaternion),
      );
    const housingCollisionCenter = bodyWorldPosition
      .clone()
      .add(
        new THREE.Vector3(
          0,
          HOUSING_COLLIDER_CENTER_Y,
          0,
        ).applyQuaternion(housingQuaternion),
      );
    const housingCollisionCylinder = {
      center: housingCollisionCenter,
      quaternion: housingQuaternion,
      radius: expandedHousingRadius,
      halfHeight: expandedHousingHalfHeight,
    };
    if (
      umbilicalCurrent.current.length !==
      UMBILICAL_PARTICLE_COUNT + 1
    ) {
      const initialState = createUmbilicalState({
        top: umbilicalTop,
        bottom: umbilicalBottom,
        particleCount: UMBILICAL_PARTICLE_COUNT,
        slack: clawPartSpecs.powerCableSlack,
      });
      umbilicalCurrent.current = initialState.current;
      umbilicalPrevious.current = initialState.previous;
    }
    stepUmbilicalState({
      current: umbilicalCurrent.current,
      previous: umbilicalPrevious.current,
      top: umbilicalTop,
      bottom: umbilicalBottom,
      delta,
      slack: clawPartSpecs.powerCableSlack,
      gravity: settings.gravity,
      collisionCylinder: housingCollisionCylinder,
    });

    const umbilicalRenderSegments = Math.min(
      UMBILICAL_MAX_RENDER_SEGMENTS,
      Math.max(2, Math.round(clawPartSpecs.powerCableSegments)),
    );
    const umbilicalBodyLeadSegments = Math.min(
      UMBILICAL_BODY_LEAD_SEGMENTS,
      Math.max(1, umbilicalRenderSegments - 3),
    );
    const umbilicalTrolleyLeadSegments = Math.min(
      UMBILICAL_TROLLEY_LEAD_SEGMENTS,
      Math.max(
        2,
        umbilicalRenderSegments - umbilicalBodyLeadSegments - 2,
      ),
    );
    const umbilicalCoilSegments =
      umbilicalRenderSegments -
      umbilicalBodyLeadSegments -
      umbilicalTrolleyLeadSegments;
    const umbilicalCenterline = sampleUmbilicalCenterline(
      umbilicalCurrent.current,
      umbilicalCoilSegments,
    );
    projectPointsOutsideCylinder(
      umbilicalCenterline,
      housingCollisionCylinder,
    );
    const umbilicalCoilPoints = createUmbilicalHelix({
      centerline: umbilicalCenterline,
      turns: clawPartSpecs.powerCableTurns,
      coilDiameter: clawPartSpecs.powerCableCoilDiameter,
      strandDiameter: clawPartSpecs.powerCableDiameter,
    });
    const bodyConnectedUmbilical = appendUmbilicalLead({
      helix: umbilicalCoilPoints,
      end: bodyConnection,
      approachDirection: outwardDirection.clone().negate(),
      segmentCount: umbilicalBodyLeadSegments,
    });
    const umbilicalPoints = prependUmbilicalLead({
      helix: bodyConnectedUmbilical,
      start: trolleyConnection,
      departureDirection: trolleyOutwardDirection,
      segmentCount: umbilicalTrolleyLeadSegments,
    });
    updateDynamicTubeGeometry({
      geometry: umbilicalGeometry,
      points: umbilicalPoints,
      radius: clawPartSpecs.powerCableDiameter / 2,
    });

    if (frameAccumulator.current >= 0.5) {
      const fps = Math.round(frameCount.current / frameAccumulator.current);
      state.updateMetrics({
        fps,
        minFps: Math.round(Math.min(minFps.current, fps)),
        physicsMs: Number((performance.now() - started).toFixed(2)),
        activeBodies:
          Object.values(bodies.current).filter(Boolean).length + 9,
        cableError: Number((cableState.overrun * 1000).toFixed(1)),
        cableLength: Number(cableLength.current.toFixed(2)),
        cableDistance: Number(cableState.distance.toFixed(2)),
        swingAngle: Number(cableState.swingAngle.toFixed(1)),
        tipClearance: Number(
          (
            sampleClawClearance(101, editableClawGeometry) * 1000
          ).toFixed(0),
        ),
        plungerForce: Number(
          Math.abs(actuatorForce.current).toFixed(2),
        ),
        plungerStroke: Number(
          ((plungerMotion?.stroke ?? 0) * 1000).toFixed(1),
        ),
        plungerVelocity: Number(
          (plungerMotion?.velocity ?? 0).toFixed(3),
        ),
      });
      frameAccumulator.current = 0;
      frameCount.current = 0;
    }
  });

  return (
    <>
      <group name="trolley-render-meshes" visible={!debug}>
        <TrolleyMechanism
          gantryRef={gantryRef}
          trolleyRef={trolleyRef}
          drumRef={drumRef}
        />
      </group>
      <RigidBody
        ref={anchorRef}
        type="kinematicPosition"
        colliders={false}
        position={[0, WIRE_GUIDE_CENTER_Y, 0]}
        name="wire-exit-guide"
      >
        <group name="wire-exit-guide-render-meshes" visible={!debug}>
          <mesh castShadow>
            <cylinderGeometry
              args={[
                WIRE_GUIDE_RADIUS,
                WIRE_GUIDE_RADIUS,
                WIRE_GUIDE_HEIGHT,
                24,
              ]}
            />
            <meshStandardMaterial
              color="#b9bdb9"
              metalness={0.92}
              roughness={0.2}
            />
          </mesh>
          <mesh
            castShadow
            position={[0, -0.02, 0]}
            rotation={[Math.PI / 2, 0, 0]}
          >
            <torusGeometry args={[0.17, 0.05, 8, 24]} />
            <meshStandardMaterial
              color="#2f312d"
              metalness={0.82}
              roughness={0.28}
            />
          </mesh>
        </group>
        <CylinderCollider
          args={[WIRE_GUIDE_HEIGHT / 2, WIRE_GUIDE_RADIUS]}
          friction={0.12}
          restitution={0}
          collisionGroups={WIRE_GUIDE_COLLISION_GROUPS}
        />
      </RigidBody>
      <group name="cable-render-meshes" visible={!debug}>
        <mesh ref={cableRef} castShadow>
          <cylinderGeometry args={[0.012, 0.012, 1, 10]} />
          <meshStandardMaterial color="#7b1f27" metalness={0.42} roughness={0.42} />
        </mesh>
        <mesh
          castShadow
          frustumCulled={false}
          name="power-umbilical-continuous-tube"
        >
          <primitive object={umbilicalGeometry} attach="geometry" />
          <meshStandardMaterial color="#171918" roughness={0.7} />
        </mesh>
      </group>

      <RigidBody
        ref={housingRef}
        colliders={false}
        position={BODY_INITIAL_POSITION}
        linearDamping={swingLinearDamping}
        angularDamping={housingAngularDamping}
        enabledRotations={[true, true, true]}
        canSleep={false}
        ccd
        name="claw-solenoid-housing"
      >
        <CylinderCollider
          args={[
            clawPartDimensions.housing.halfHeight,
            clawPartDimensions.housing.radius,
          ]}
          position={[0, HOUSING_COLLIDER_CENTER_Y, 0]}
          friction={clawFriction}
          restitution={0.02}
          mass={1.02}
          collisionGroups={HOUSING_COLLISION_GROUPS}
        />

        <group name="claw-render-meshes" visible={!debug}>
        <group scale={housingScale}>
        <mesh castShadow position={[0, 0.29, 0]}>
          <cylinderGeometry args={[0.17, 0.205, 0.25, 32]} />
          <meshStandardMaterial
            color="#cfd2cf"
            metalness={0.96}
            roughness={0.17}
          />
        </mesh>
        <mesh castShadow position={[0, 0.115, 0]}>
          <cylinderGeometry args={[0.225, 0.225, 0.16, 32]} />
          <meshStandardMaterial
            color="#bfc3c0"
            metalness={0.94}
            roughness={0.2}
          />
        </mesh>
        <mesh castShadow position={[0, -0.055, 0]}>
          <cylinderGeometry args={[0.18, 0.18, 0.25, 32]} />
          <meshStandardMaterial
            color="#d9dcda"
            metalness={0.97}
            roughness={0.15}
          />
        </mesh>
        {HOUSING_COLLARS.map((collar) => (
          <mesh
            key={collar.y}
            castShadow
            position={[0, collar.y, 0]}
          >
            <cylinderGeometry
              args={[
                collar.radius,
                collar.radius,
                collar.height,
                32,
              ]}
            />
            <meshStandardMaterial
              color="#aeb3b0"
              metalness={0.98}
              roughness={0.14}
            />
          </mesh>
        ))}
        <mesh castShadow position={[0, -0.205, 0]}>
          <cylinderGeometry args={[0.245, 0.245, 0.075, 30]} />
          <meshStandardMaterial
            color="#aeb2af"
            metalness={0.94}
            roughness={0.2}
          />
        </mesh>
        </group>

        {Array.from({ length: FINGER_COUNT }, (_, index) => {
          const theta = thetaForIndex(index);
          return (
            <group key={index} rotation={[0, -theta, 0]}>
              <HingePinVisual
                position={[
                  CLAW_GEOMETRY.housingPivot.r,
                  CLAW_GEOMETRY.housingPivot.y,
                  0,
                ]}
                rotation={[Math.PI / 2, 0, 0]}
              />
            </group>
          );
        })}
        </group>
      </RigidBody>

      <PlungerCollider plungerRef={plungerColliderRef} />
      {Array.from({ length: FINGER_COUNT }, (_, index) => (
        <RockerLinkCollider
          key={index}
          index={index}
          rockerRef={rockerColliderRefs[index]}
        />
      ))}
      {Array.from({ length: FINGER_COUNT }, (_, index) => (
        <ClawFingerCollider
          key={index}
          index={index}
          fingerRef={fingerColliderRefs[index]}
        />
      ))}
      <ClawClosedLinkage
        housingRef={housingRef}
        plungerRef={plungerColliderRef}
        rockerRefs={rockerColliderRefs}
        fingerRefs={fingerColliderRefs}
        targetPlungerY={plungerY}
        actuatorForceRef={actuatorForce}
      />
    </>
  );
}
