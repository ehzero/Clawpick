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
  BallCollider,
  CapsuleCollider,
  CylinderCollider,
  RigidBody,
  interactionGroups,
  useRapier,
  type RapierRigidBody,
} from "@react-three/rapier";
import type { RopeImpulseJoint } from "@dimforge/rapier3d-compat";
import * as THREE from "three";
import {
  CLAW_GEOMETRY,
  getClawPose,
  sampleClawClearance,
} from "@/game/clawKinematics.mjs";
import {
  measureInextensibleCable,
  projectInextensibleCableVelocity,
} from "@/game/cableDynamics.mjs";
import { useGameStore } from "@/game/store";

export const TROLLEY_Y = 4.02;
export const CHUTE_X = 2.28;
export const CHUTE_Z = 1.18;

const CABLE_ANCHOR_Y = TROLLEY_Y - 0.18;
const MIN_CABLE_LENGTH = 0.04;
const MAX_CABLE_LENGTH = 1.8;
const CLAW_ATTACHMENT_Y = 0.48;
const CLAW_START_Y =
  CABLE_ANCHOR_Y - MIN_CABLE_LENGTH - CLAW_ATTACHMENT_Y;
const CLAW_LIMIT_X = 2.32;
const CLAW_LIMIT_Z = 1.38;
const FINGER_COUNT = 3;
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const BODY_INITIAL_POSITION: [number, number, number] = [
  0,
  CLAW_START_Y,
  0,
];
const HOUSING_COLLISION_GROUPS = interactionGroups([1], [0]);
const FINGER_COLLISION_GROUPS = interactionGroups([2], [0, 2]);
const UMBILICAL_SEGMENTS = 48;

interface MechanicalClawProps {
  bodies: MutableRefObject<Record<string, RapierRigidBody | null>>;
}

interface ClawFingerVisualProps {
  index: number;
  fingerRef: RefObject<THREE.Group | null>;
}

interface ClawFingerColliderProps {
  index: number;
  fingerRef: RefObject<RapierRigidBody | null>;
}

interface ClawLinkageDriverProps {
  housingRef: RefObject<RapierRigidBody | null>;
  plungerRef: RefObject<THREE.Group | null>;
  rockerRefs: ReadonlyArray<RefObject<THREE.Group | null>>;
  fingerVisualRefs: ReadonlyArray<RefObject<THREE.Group | null>>;
  fingerColliderRefs: ReadonlyArray<RefObject<RapierRigidBody | null>>;
  closure: MutableRefObject<number>;
}

interface SegmentTransform {
  position: [number, number, number];
  quaternion: [number, number, number, number];
  length: number;
}

function approach(current: number, target: number, amount: number) {
  if (current < target) return Math.min(target, current + amount);
  return Math.max(target, current - amount);
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

function between(start: THREE.Vector3, end: THREE.Vector3): SegmentTransform {
  const direction = end.clone().sub(start);
  const length = direction.length();
  const quaternion = new THREE.Quaternion().setFromUnitVectors(
    Y_AXIS,
    direction.clone().normalize(),
  );
  const midpoint = start.clone().add(end).multiplyScalar(0.5);
  return {
    position: midpoint.toArray() as [number, number, number],
    quaternion: quaternion.toArray() as [number, number, number, number],
    length,
  };
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

function createFingerStripGeometry(index: number) {
  const theta = thetaForIndex(index);
  const radial = new THREE.Vector3(Math.cos(theta), 0, Math.sin(theta));
  const hingeAxis = new THREE.Vector3(-Math.sin(theta), 0, Math.cos(theta));
  const controlPoints = CLAW_GEOMETRY.curvePoints.map(
    (point) =>
      new THREE.Vector3(
        radial.x * point.r,
        point.y,
        radial.z * point.r,
      ),
  );
  const curve = new THREE.CatmullRomCurve3(
    controlPoints,
    false,
    "centripetal",
  );
  const samples = 24;
  const positions: number[] = [];
  const indices: number[] = [];

  for (let index = 0; index <= samples; index += 1) {
    const t = index / samples;
    const point = curve.getPoint(t);
    const pathTangent = curve.getTangent(t).normalize();
    const faceNormal = hingeAxis.clone().cross(pathTangent).normalize();
    const halfWidth = CLAW_GEOMETRY.fingerWidth / 2;
    const halfThickness = CLAW_GEOMETRY.fingerThickness / 2;
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

    for (const corner of corners) positions.push(...corner.toArray());
  }

  for (let index = 0; index < samples; index += 1) {
    const current = index * 4;
    const next = (index + 1) * 4;
    for (let side = 0; side < 4; side += 1) {
      const followingSide = (side + 1) % 4;
      indices.push(
        current + side,
        next + side,
        next + followingSide,
        current + side,
        next + followingSide,
        current + followingSide,
      );
    }
  }
  indices.push(0, 2, 1, 0, 3, 2);
  const last = samples * 4;
  indices.push(last, last + 1, last + 2, last, last + 2, last + 3);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  const plungerDirection = new THREE.Vector3(
    radial.x * CLAW_GEOMETRY.fingerPlungerDirection.r,
    CLAW_GEOMETRY.fingerPlungerDirection.y,
    radial.z * CLAW_GEOMETRY.fingerPlungerDirection.r,
  ).normalize();
  const plungerArmEnd = plungerDirection
    .clone()
    .multiplyScalar(CLAW_GEOMETRY.fingerPlungerLength);
  const plungerArm = plateBetween(
    new THREE.Vector3(),
    plungerArmEnd,
    hingeAxis,
  );

  return {
    curve,
    geometry,
    plungerArm,
    plungerArmEnd: plungerArmEnd.toArray() as [number, number, number],
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

function setInstanceBetween(
  mesh: THREE.InstancedMesh | null,
  index: number,
  start: THREE.Vector3,
  end: THREE.Vector3,
) {
  if (!mesh) return;
  const direction = end.clone().sub(start);
  const length = direction.length();
  const midpoint = start.clone().add(end).multiplyScalar(0.5);
  const quaternion = new THREE.Quaternion().setFromUnitVectors(
    Y_AXIS,
    direction.normalize(),
  );
  const matrix = new THREE.Matrix4().compose(
    midpoint,
    quaternion,
    new THREE.Vector3(1, length, 1),
  );
  mesh.setMatrixAt(index, matrix);
}

function ClawLinkageDriver({
  housingRef,
  plungerRef,
  rockerRefs,
  fingerVisualRefs,
  fingerColliderRefs,
  closure,
}: ClawLinkageDriverProps) {
  // Shared closed-loop joints over-constrain Rapier, so the body-mounted rocker
  // and visible mechanism stay local while only contact colliders follow it.
  const openPose = useMemo(() => getClawPose(0), []);
  useFrame(() => {
    const housing = housingRef.current;
    const plunger = plungerRef.current;
    if (!housing || !plunger) return;

    const pose = getClawPose(closure.current);
    const housingTranslation = housing.translation();
    const housingPosition = new THREE.Vector3(
      housingTranslation.x,
      housingTranslation.y,
      housingTranslation.z,
    );
    const housingRotation = housing.rotation();
    const housingQuaternion = new THREE.Quaternion(
      housingRotation.x,
      housingRotation.y,
      housingRotation.z,
      housingRotation.w,
    );
    const toWorldPosition = (localPosition: THREE.Vector3) =>
      localPosition.applyQuaternion(housingQuaternion).add(housingPosition);

    plunger.position.set(0, pose.plungerY, 0);

    for (let index = 0; index < FINGER_COUNT; index += 1) {
      const rocker = rockerRefs[index].current;
      const fingerVisual = fingerVisualRefs[index].current;
      const fingerCollider = fingerColliderRefs[index].current;

      const hingeAxis = new THREE.Vector3(...radialAxis(index));
      const rockerLocalRotation = new THREE.Quaternion().setFromAxisAngle(
        hingeAxis,
        pose.rockerAngle - openPose.rockerAngle,
      );
      const fingerLocalRotation = new THREE.Quaternion().setFromAxisAngle(
        hingeAxis,
        pose.angle,
      );
      const fingerLocalPosition = radialPoint(
        index,
        pose.hinge.r,
        pose.hinge.y,
      );

      rocker?.quaternion.copy(rockerLocalRotation);
      if (fingerVisual) {
        fingerVisual.position.copy(fingerLocalPosition);
        fingerVisual.quaternion.copy(fingerLocalRotation);
      }
      if (fingerCollider) {
        fingerCollider.setNextKinematicTranslation(
          toWorldPosition(fingerLocalPosition.clone()),
        );
        fingerCollider.setNextKinematicRotation(
          housingQuaternion.clone().multiply(fingerLocalRotation),
        );
      }
    }
  });

  return null;
}

function RockerLink({
  index,
  rockerRef,
}: {
  index: number;
  rockerRef: RefObject<THREE.Group | null>;
}) {
  const shape = useMemo(() => {
    const openPose = getClawPose(0);
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
  }, [index]);

  return (
    <group ref={rockerRef} position={shape.housingPivot}>
      <mesh
        castShadow
        position={shape.rockerLink.position}
        quaternion={shape.rockerLink.quaternion}
      >
        <boxGeometry args={[0.078, shape.rockerLink.length, 0.028]} />
        <meshStandardMaterial
          color="#aeb2af"
          metalness={0.93}
          roughness={0.22}
        />
      </mesh>
      <mesh
        castShadow
        position={shape.rockerEnd}
        quaternion={shape.pinQuaternion}
      >
        <cylinderGeometry args={[0.058, 0.058, 0.115, 18]} />
        <meshStandardMaterial
          color="#777c78"
          metalness={0.94}
          roughness={0.22}
        />
      </mesh>
    </group>
  );
}

function ClawFingerVisual({
  index,
  fingerRef,
}: ClawFingerVisualProps) {
  const geometry = CLAW_GEOMETRY;
  const shape = useMemo(() => {
    const theta = index * ((Math.PI * 2) / FINGER_COUNT) + Math.PI / 6;
    const radial = new THREE.Vector3(Math.cos(theta), 0, Math.sin(theta));
    const points = geometry.curvePoints.map(
      (point) =>
        new THREE.Vector3(
          radial.x * point.r,
          point.y,
          radial.z * point.r,
        ),
    );
    const strip = createFingerStripGeometry(index);
    const openPose = getClawPose(0);
    const hingeAxis = new THREE.Vector3(...radialAxis(index));
    const pinQuaternion = new THREE.Quaternion().setFromUnitVectors(
      Y_AXIS,
      hingeAxis,
    );
    const openFingerQuaternion = new THREE.Quaternion().setFromAxisAngle(
      hingeAxis,
      openPose.angle,
    );
    return {
      geometry: strip.geometry,
      plungerArm: strip.plungerArm,
      plungerArmEnd: strip.plungerArmEnd,
      pinQuaternion:
        pinQuaternion.toArray() as [number, number, number, number],
      openFingerQuaternion:
        openFingerQuaternion.toArray() as [
          number,
          number,
          number,
          number,
        ],
      tip: points.at(-1)!.toArray() as [number, number, number],
    };
  }, [geometry, index]);
  const openPose = getClawPose(0);
  const hinge = radialPoint(index, openPose.hinge.r, openPose.hinge.y);

  return (
    <group
      ref={fingerRef}
      position={hinge.toArray()}
      quaternion={shape.openFingerQuaternion}
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
      <mesh
        castShadow
        position={shape.plungerArmEnd}
        quaternion={shape.pinQuaternion}
      >
        <cylinderGeometry
          args={[
            geometry.fingerWidth * 0.66,
            geometry.fingerWidth * 0.66,
            0.096,
            18,
          ]}
        />
        <meshStandardMaterial
          color="#c8cbc8"
          metalness={0.94}
          roughness={0.18}
        />
      </mesh>
      <mesh castShadow quaternion={shape.pinQuaternion}>
        <cylinderGeometry
          args={[
            geometry.fingerWidth * 0.72,
            geometry.fingerWidth * 0.72,
            0.1,
            18,
          ]}
        />
        <meshStandardMaterial
          color="#c8cbc8"
          metalness={0.94}
          roughness={0.18}
        />
      </mesh>
      <mesh
        castShadow
        position={shape.tip}
        rotation={[0, -thetaForIndex(index), 0]}
        scale={[1.06, 0.5, 0.72]}
      >
        <sphereGeometry args={[0.075, 16, 12]} />
        <meshStandardMaterial
          color="#c9ccc9"
          metalness={0.92}
          roughness={0.24}
        />
      </mesh>
    </group>
  );
}

function ClawFingerCollider({
  index,
  fingerRef,
}: ClawFingerColliderProps) {
  const geometry = CLAW_GEOMETRY;
  const clawFriction = useGameStore(
    (state) => state.settings.clawFriction,
  );
  const shape = useMemo(() => {
    const theta = thetaForIndex(index);
    const radial = new THREE.Vector3(Math.cos(theta), 0, Math.sin(theta));
    const points = geometry.curvePoints.map(
      (point) =>
        new THREE.Vector3(
          radial.x * point.r,
          point.y,
          radial.z * point.r,
        ),
    );

    return {
      segments: points.slice(0, -1).map((point, segmentIndex) =>
        between(point, points[segmentIndex + 1]),
      ),
      tip: points.at(-1)!.toArray() as [number, number, number],
    };
  }, [geometry, index]);
  const openPose = getClawPose(0);
  const hinge = radialPoint(index, openPose.hinge.r, openPose.hinge.y);
  const openFingerQuaternion = new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(...radialAxis(index)),
    openPose.angle,
  );

  return (
    <RigidBody
      ref={fingerRef}
      type="kinematicPosition"
      colliders={false}
      position={[
        BODY_INITIAL_POSITION[0] + hinge.x,
        BODY_INITIAL_POSITION[1] + hinge.y,
        BODY_INITIAL_POSITION[2] + hinge.z,
      ]}
      quaternion={openFingerQuaternion}
      ccd
      name={`claw-finger-collider-${index + 1}`}
    >
      {shape.segments.map((segment, segmentIndex) => (
        <CapsuleCollider
          key={segmentIndex}
          args={[
            Math.max(
              0.02,
              segment.length / 2 - geometry.tineRadius,
            ),
            geometry.tineRadius,
          ]}
          position={segment.position}
          quaternion={segment.quaternion}
          friction={clawFriction}
          restitution={0.01}
          mass={0.07}
          collisionGroups={FINGER_COLLISION_GROUPS}
        />
      ))}
      <BallCollider
        args={[geometry.scoopRadius]}
        position={shape.tip}
        friction={clawFriction}
        restitution={0}
        mass={0.04}
        collisionGroups={FINGER_COLLISION_GROUPS}
      />
    </RigidBody>
  );
}

function PlungerVisual({
  plungerRef,
}: {
  plungerRef: RefObject<THREE.Group | null>;
}) {
  return (
    <group
      ref={plungerRef}
      position={[0, CLAW_GEOMETRY.openPlungerY, 0]}
      name="claw-central-plunger"
    >
      <mesh castShadow position={[0, 0.27, 0]}>
        <cylinderGeometry args={[0.052, 0.052, 0.56, 18]} />
        <meshStandardMaterial
          color="#929794"
          metalness={0.96}
          roughness={0.16}
        />
      </mesh>
      <mesh castShadow>
        <cylinderGeometry args={[0.13, 0.13, 0.065, 24]} />
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
            <mesh castShadow position={[0.065, 0, 0]}>
              <boxGeometry args={[0.13, 0.045, 0.055]} />
              <meshStandardMaterial
                color="#aeb3b0"
                metalness={0.94}
                roughness={0.2}
              />
            </mesh>
            <mesh
              castShadow
              position={[CLAW_GEOMETRY.plungerRadius, 0, 0]}
              rotation={[Math.PI / 2, 0, 0]}
            >
              <cylinderGeometry args={[0.024, 0.024, 0.085, 12]} />
              <meshStandardMaterial
                color="#686d69"
                metalness={0.9}
                roughness={0.24}
              />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

function thetaForIndex(index: number) {
  return index * ((Math.PI * 2) / FINGER_COUNT) + Math.PI / 6;
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
        {[-2.55, 2.55].map((x) => (
          <group key={x} position={[x, 4.01, 0]}>
            {[-0.1, 0.1].map((z) => (
              <mesh
                key={z}
                castShadow
                position={[0, -0.08, z]}
                rotation={[0, 0, Math.PI / 2]}
              >
                <cylinderGeometry args={[0.09, 0.09, 0.07, 14]} />
                <meshStandardMaterial
                  color="#292b28"
                  metalness={0.68}
                  roughness={0.34}
                />
              </mesh>
            ))}
          </group>
        ))}
      </group>

      <group ref={trolleyRef}>
        <mesh castShadow position={[0, 4.02, 0]}>
          <boxGeometry args={[0.88, 0.34, 0.64]} />
          <meshStandardMaterial color="#242724" metalness={0.68} roughness={0.3} />
        </mesh>
        <mesh castShadow position={[0, 3.84, 0]}>
          <cylinderGeometry args={[0.15, 0.15, 0.08, 24]} />
          <meshStandardMaterial color="#b9bdb9" metalness={0.92} roughness={0.2} />
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
        <mesh
          castShadow
          position={[0, 3.82, 0]}
          rotation={[Math.PI / 2, 0, 0]}
        >
          <torusGeometry args={[0.11, 0.035, 8, 18]} />
          <meshStandardMaterial color="#2f312d" metalness={0.82} roughness={0.28} />
        </mesh>
        {[-0.22, 0.22].flatMap((x) =>
          [-0.17, 0.17].map((z) => (
            <mesh
              key={`${x}-${z}`}
              castShadow
              position={[x, 3.84, z]}
              rotation={[Math.PI / 2, 0, 0]}
            >
              <cylinderGeometry args={[0.065, 0.065, 0.05, 12]} />
              <meshStandardMaterial color="#1f211f" metalness={0.5} roughness={0.42} />
            </mesh>
          )),
        )}
      </group>
    </>
  );
}

export function OverheadRails() {
  return (
    <group>
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
  const fingerColliderRefs = [
    useRef<RapierRigidBody>(null),
    useRef<RapierRigidBody>(null),
    useRef<RapierRigidBody>(null),
  ];
  const fingerVisualRefs = [
    useRef<THREE.Group>(null),
    useRef<THREE.Group>(null),
    useRef<THREE.Group>(null),
  ];
  const rockerRefs = [
    useRef<THREE.Group>(null),
    useRef<THREE.Group>(null),
    useRef<THREE.Group>(null),
  ];
  const cableRef = useRef<THREE.Mesh>(null);
  const gantryRef = useRef<THREE.Group>(null);
  const trolleyRef = useRef<THREE.Group>(null);
  const drumRef = useRef<THREE.Mesh>(null);
  const plungerRef = useRef<THREE.Group>(null);
  const umbilicalRef = useRef<THREE.InstancedMesh>(null);
  const debugTensionRef = useRef<THREE.Mesh>(null);
  const closure = useRef(0);
  const cableLength = useRef(MIN_CABLE_LENGTH);
  const trolleyPosition = useRef({ x: 0, z: 0 });
  const trolleyVelocity = useRef({ x: 0, z: 0 });
  const phaseElapsed = useRef(0);
  const lastPhase = useRef(useGameStore.getState().phase);
  const frameAccumulator = useRef(0);
  const frameCount = useRef(0);
  const minFps = useRef(60);
  const ropeJoint = useRef<RopeImpulseJoint | null>(null);
  const ropeJointLength = useRef(Number.NaN);
  const debug = useGameStore((state) => state.debug);
  const clawFriction = useGameStore((state) => state.settings.clawFriction);
  const swingDamping = useGameStore(
    (state) => state.settings.swingDamping,
  );

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

  useFrame((_, unsafeDelta) => {
    const started = performance.now();
    const delta = Math.min(unsafeDelta, 0.04);
    const state = useGameStore.getState();
    const { settings, phase, input } = state;
    const housing = housingRef.current;
    const anchorBody = anchorRef.current;
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
        desiredX = (dx / distance) * settings.moveSpeed * 0.9;
        desiredZ = (dz / distance) * settings.moveSpeed * 0.9;
      }
    }

    const acceleration = phase === "aiming" ? 5.2 : 3.8;
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

    if (phase === "descending") {
      cableLength.current = Math.min(
        MAX_CABLE_LENGTH,
        cableLength.current + settings.lowerSpeed * delta,
      );
      const bodyPosition = housing.translation();
      const actualLength = Math.hypot(
        trolleyPosition.current.x - bodyPosition.x,
        CABLE_ANCHOR_Y - (bodyPosition.y + CLAW_ATTACHMENT_Y),
        trolleyPosition.current.z - bodyPosition.z,
      );
      if (
        cableLength.current >= MAX_CABLE_LENGTH - 0.001 &&
        (actualLength >= MAX_CABLE_LENGTH - 0.07 || phaseElapsed.current > 3)
      ) {
        state.setPhase("closing");
      }
    }

    if (phase === "closing") {
      closure.current = Math.min(
        1,
        closure.current + settings.closeSpeed * delta,
      );
      if (closure.current >= 0.995) {
        state.record("grip_attempt", {
          contactModel: "collider-only",
          strength: settings.clawStrength,
        });
        state.setPhase("lifting");
      }
    }

    if (phase === "lifting") {
      cableLength.current = Math.max(
        MIN_CABLE_LENGTH,
        cableLength.current - settings.liftSpeed * delta,
      );
      if (cableLength.current <= MIN_CABLE_LENGTH + 0.001) {
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
      closure.current = Math.max(0, closure.current - 2.1 * delta);
      if (closure.current <= 0.001) state.setPhase("settling");
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
      y: CABLE_ANCHOR_Y,
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
          { x: 0, y: 0, z: 0 },
          { x: 0, y: CLAW_ATTACHMENT_Y, z: 0 },
        ),
        anchorBody,
        housing,
        true,
      ) as RopeImpulseJoint;
      ropeJoint.current.setContactsEnabled(false);
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
      CABLE_ANCHOR_Y,
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
        attachmentVelocity,
        targetLengthRate,
      });
      housing.setLinvel(projectedVelocity.velocity, true);
    }

    setMeshBetween(cableRef.current, anchor, attachment);

    const umbilicalTop = anchor
      .clone()
      .add(new THREE.Vector3(-0.29, 0.03, -0.04));
    const umbilicalBottomOffset = new THREE.Vector3(
      -0.24,
      0.19,
      -0.02,
    ).applyQuaternion(housingQuaternion);
    const umbilicalBottom = new THREE.Vector3(
      bodyPosition.x,
      bodyPosition.y,
      bodyPosition.z,
    ).add(umbilicalBottomOffset);
    const umbilicalPoints: THREE.Vector3[] = [];
    for (let index = 0; index <= UMBILICAL_SEGMENTS; index += 1) {
      const t = index / UMBILICAL_SEGMENTS;
      const sag = Math.sin(Math.PI * t);
      const phaseAngle = t * Math.PI * 24;
      const coilRadius = 0.006 + 0.022 * Math.sin(Math.PI * t);
      umbilicalPoints.push(
        umbilicalTop
          .clone()
          .lerp(umbilicalBottom, t)
          .add(new THREE.Vector3(-0.12 * sag, -0.055 * sag, 0))
          .add(
            new THREE.Vector3(
              Math.cos(phaseAngle) * coilRadius,
              0,
              Math.sin(phaseAngle) * coilRadius,
            ),
          ),
      );
    }
    for (let index = 0; index < UMBILICAL_SEGMENTS; index += 1) {
      setInstanceBetween(
        umbilicalRef.current,
        index,
        umbilicalPoints[index],
        umbilicalPoints[index + 1],
      );
    }
    if (umbilicalRef.current) {
      umbilicalRef.current.instanceMatrix.needsUpdate = true;
    }

    if (debugTensionRef.current) {
      setMeshBetween(debugTensionRef.current, anchor, attachment);
    }

    if (frameAccumulator.current >= 0.5) {
      const fps = Math.round(frameCount.current / frameAccumulator.current);
      state.updateMetrics({
        fps,
        minFps: Math.round(Math.min(minFps.current, fps)),
        physicsMs: Number((performance.now() - started).toFixed(2)),
        activeBodies:
          Object.values(bodies.current).filter(Boolean).length + 5,
        cableError: Number((cableState.overrun * 1000).toFixed(1)),
        cableLength: Number(cableLength.current.toFixed(2)),
        cableDistance: Number(cableState.distance.toFixed(2)),
        swingAngle: Number(cableState.swingAngle.toFixed(1)),
        tipClearance: Number((sampleClawClearance() * 1000).toFixed(0)),
      });
      frameAccumulator.current = 0;
      frameCount.current = 0;
    }
  });

  return (
    <>
      <TrolleyMechanism
        gantryRef={gantryRef}
        trolleyRef={trolleyRef}
        drumRef={drumRef}
      />
      <RigidBody
        ref={anchorRef}
        type="kinematicPosition"
        colliders={false}
        position={[0, CABLE_ANCHOR_Y, 0]}
        name="winch-rope-anchor"
      />

      <mesh ref={cableRef} castShadow>
        <cylinderGeometry args={[0.012, 0.012, 1, 10]} />
        <meshStandardMaterial color="#7b1f27" metalness={0.42} roughness={0.42} />
      </mesh>
      <instancedMesh
        ref={umbilicalRef}
        args={[undefined, undefined, UMBILICAL_SEGMENTS]}
        castShadow
      >
        <cylinderGeometry args={[0.021, 0.021, 1, 7]} />
        <meshStandardMaterial color="#171918" roughness={0.7} />
      </instancedMesh>
      {debug && (
        <mesh ref={debugTensionRef}>
          <cylinderGeometry args={[0.008, 0.008, 1, 6]} />
          <meshBasicMaterial color="#3aff8e" transparent opacity={0.7} />
        </mesh>
      )}

      <RigidBody
        ref={housingRef}
        colliders={false}
        position={BODY_INITIAL_POSITION}
        linearDamping={0.18 + swingDamping * 0.28}
        angularDamping={0.35 + swingDamping * 0.72}
        enabledRotations={[false, true, false]}
        canSleep={false}
        ccd
        name="claw-solenoid-housing"
      >
        <CylinderCollider
          args={[0.23, 0.22]}
          position={[0, 0.17, 0]}
          friction={clawFriction}
          restitution={0.02}
          mass={0.78}
          collisionGroups={HOUSING_COLLISION_GROUPS}
        />
        <CylinderCollider
          args={[0.14, 0.185]}
          position={[0, -0.08, 0]}
          friction={clawFriction}
          mass={0.24}
          collisionGroups={HOUSING_COLLISION_GROUPS}
        />

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
        {[0.4, 0.195, 0.035, -0.19].map((y, index) => (
          <mesh key={y} castShadow position={[0, y, 0]}>
            <torusGeometry
              args={[index === 0 ? 0.145 : index === 3 ? 0.19 : 0.205, 0.018, 8, 28]}
            />
            <meshStandardMaterial
              color="#aeb3b0"
              metalness={0.98}
              roughness={0.14}
            />
          </mesh>
        ))}
        <mesh castShadow position={[0, 0.455, 0]}>
          <cylinderGeometry args={[0.085, 0.105, 0.09, 24]} />
          <meshStandardMaterial
            color="#b8bcb9"
            metalness={0.96}
            roughness={0.18}
          />
        </mesh>
        <mesh castShadow position={[0, 0.505, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.055, 0.015, 8, 20]} />
          <meshStandardMaterial
            color="#737874"
            metalness={0.9}
            roughness={0.24}
          />
        </mesh>
        <mesh castShadow position={[0, -0.205, 0]}>
          <cylinderGeometry args={[0.245, 0.245, 0.075, 30]} />
          <meshStandardMaterial
            color="#aeb2af"
            metalness={0.94}
            roughness={0.2}
          />
        </mesh>

        {Array.from({ length: FINGER_COUNT }, (_, index) => {
          const theta = thetaForIndex(index);
          return (
            <group key={index} rotation={[0, -theta, 0]}>
              <mesh
                castShadow
                position={[
                  CLAW_GEOMETRY.housingPivot.r,
                  CLAW_GEOMETRY.housingPivot.y,
                  0,
                ]}
                rotation={[Math.PI / 2, 0, 0]}
              >
                <cylinderGeometry args={[0.052, 0.052, 0.16, 16]} />
                <meshStandardMaterial
                  color="#747975"
                  metalness={0.92}
                  roughness={0.24}
                />
              </mesh>
              {[-0.083, 0.083].map((z) => (
                <mesh
                  key={z}
                  castShadow
                  position={[
                    CLAW_GEOMETRY.housingPivot.r,
                    CLAW_GEOMETRY.housingPivot.y,
                    z,
                  ]}
                  rotation={[Math.PI / 2, 0, 0]}
                >
                  <cylinderGeometry args={[0.066, 0.066, 0.018, 18]} />
                  <meshStandardMaterial
                    color="#c9ccca"
                    metalness={0.96}
                    roughness={0.16}
                  />
                </mesh>
              ))}
              <mesh
                position={[
                  CLAW_GEOMETRY.housingPivot.r,
                  CLAW_GEOMETRY.housingPivot.y,
                  0.094,
                ]}
                rotation={[Math.PI / 2, 0, 0]}
              >
                <cylinderGeometry args={[0.027, 0.027, 0.02, 12]} />
                <meshStandardMaterial
                  color="#4f5450"
                  metalness={0.86}
                  roughness={0.28}
                />
              </mesh>
            </group>
          );
        })}
        {Array.from({ length: FINGER_COUNT }, (_, index) => (
          <RockerLink
            key={index}
            index={index}
            rockerRef={rockerRefs[index]}
          />
        ))}
        <PlungerVisual plungerRef={plungerRef} />
        {Array.from({ length: FINGER_COUNT }, (_, index) => (
          <ClawFingerVisual
            key={index}
            index={index}
            fingerRef={fingerVisualRefs[index]}
          />
        ))}
      </RigidBody>

      <ClawLinkageDriver
        housingRef={housingRef}
        plungerRef={plungerRef}
        rockerRefs={rockerRefs}
        fingerVisualRefs={fingerVisualRefs}
        fingerColliderRefs={fingerColliderRefs}
        closure={closure}
      />

      {Array.from({ length: FINGER_COUNT }, (_, index) => (
        <ClawFingerCollider
          key={index}
          index={index}
          fingerRef={fingerColliderRefs[index]}
        />
      ))}
    </>
  );
}
