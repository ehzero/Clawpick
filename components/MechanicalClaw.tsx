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
  useRevoluteJoint,
  type RapierRigidBody,
} from "@react-three/rapier";
import type { ImpulseJoint } from "@dimforge/rapier3d-compat";
import * as THREE from "three";
import {
  CLAW_GEOMETRY,
  getClawPose,
  sampleClawClearance,
} from "@/game/clawKinematics.mjs";
import { computeCableConstraint } from "@/game/cableDynamics.mjs";
import { useGameStore } from "@/game/store";

export const TROLLEY_Y = 4.02;
export const CHUTE_X = 2.28;
export const CHUTE_Z = 1.18;

const CABLE_ANCHOR_Y = TROLLEY_Y - 0.18;
const MIN_CABLE_LENGTH = 0.42;
const MAX_CABLE_LENGTH = 2.05;
const CLAW_ATTACHMENT_Y = 0.31;
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

interface MechanicalClawProps {
  bodies: MutableRefObject<Record<string, RapierRigidBody | null>>;
}

interface FingerJointProps {
  index: number;
  housingRef: RefObject<RapierRigidBody | null>;
  fingerRef: RefObject<RapierRigidBody | null>;
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

function FingerJoint({
  index,
  housingRef,
  fingerRef,
  closure,
}: FingerJointProps) {
  const hinge = radialPoint(
    index,
    CLAW_GEOMETRY.hingeRadius,
    CLAW_GEOMETRY.hingeY,
  );
  const axis = radialAxis(index);
  const joint = useRevoluteJoint(
    housingRef as RefObject<RapierRigidBody>,
    fingerRef as RefObject<RapierRigidBody>,
    [
    hinge.toArray(),
    [0, 0, 0],
    axis,
    [CLAW_GEOMETRY.minimumAngle, CLAW_GEOMETRY.maximumAngle],
    ],
  );

  useFrame(() => {
    const settings = useGameStore.getState().settings;
    const pose = getClawPose(closure.current);
    joint.current?.configureMotorPosition(
      pose.angle,
      settings.clawStrength * 5.5,
      8 + settings.clawStrength * 0.12,
    );
  });

  return null;
}

function ClawFinger({
  index,
  housingRef,
  fingerRef,
  closure,
}: FingerJointProps) {
  const geometry = CLAW_GEOMETRY;
  const clawFriction = useGameStore(
    (state) => state.settings.clawFriction,
  );
  const shape = useMemo(() => {
    const theta = index * ((Math.PI * 2) / FINGER_COUNT) + Math.PI / 6;
    const radial = new THREE.Vector3(Math.cos(theta), 0, Math.sin(theta));
    const origin = new THREE.Vector3();
    const knee = new THREE.Vector3(0, -geometry.proximalLength, 0);
    const tip = knee
      .clone()
      .addScaledVector(
        radial,
        Math.sin(geometry.bendAngle) * geometry.distalLength,
      )
      .add(
        new THREE.Vector3(
          0,
          -Math.cos(geometry.bendAngle) * geometry.distalLength,
          0,
        ),
      );
    return {
      proximal: between(origin, knee),
      distal: between(knee, tip),
      knee: knee.toArray() as [number, number, number],
      tip: tip.toArray() as [number, number, number],
    };
  }, [geometry, index]);
  const hinge = radialPoint(index, geometry.hingeRadius, geometry.hingeY);

  return (
    <>
      <RigidBody
        ref={fingerRef}
        colliders={false}
        position={[
          BODY_INITIAL_POSITION[0] + hinge.x,
          BODY_INITIAL_POSITION[1] + hinge.y,
          BODY_INITIAL_POSITION[2] + hinge.z,
        ]}
        linearDamping={0.18}
        angularDamping={0.62}
        canSleep={false}
        ccd
        name={`claw-finger-${index + 1}`}
      >
        <CapsuleCollider
          args={[
            Math.max(0.02, shape.proximal.length / 2 - geometry.tineRadius),
            geometry.tineRadius,
          ]}
          position={shape.proximal.position}
          quaternion={shape.proximal.quaternion}
          friction={clawFriction}
          restitution={0.01}
          mass={0.13}
          collisionGroups={FINGER_COLLISION_GROUPS}
        />
        <CapsuleCollider
          args={[
            Math.max(0.02, shape.distal.length / 2 - geometry.tineRadius),
            geometry.tineRadius,
          ]}
          position={shape.distal.position}
          quaternion={shape.distal.quaternion}
          friction={clawFriction}
          restitution={0.01}
          mass={0.08}
          collisionGroups={FINGER_COLLISION_GROUPS}
        />
        <BallCollider
          args={[geometry.scoopRadius]}
          position={shape.tip}
          friction={clawFriction}
          restitution={0}
          mass={0.04}
          collisionGroups={FINGER_COLLISION_GROUPS}
        />

        <mesh castShadow>
          <sphereGeometry args={[0.105, 16, 12]} />
          <meshStandardMaterial
            color="#d9b875"
            metalness={0.82}
            roughness={0.24}
          />
        </mesh>
        <mesh
          castShadow
          position={shape.proximal.position}
          quaternion={shape.proximal.quaternion}
          scale={[1, shape.proximal.length, 1]}
        >
          <cylinderGeometry args={[0.054, 0.065, 1, 14]} />
          <meshStandardMaterial
            color="#dfe2e0"
            metalness={0.92}
            roughness={0.16}
          />
        </mesh>
        <mesh castShadow position={shape.knee}>
          <sphereGeometry args={[0.063, 14, 10]} />
          <meshStandardMaterial
            color="#c8cbc9"
            metalness={0.9}
            roughness={0.18}
          />
        </mesh>
        <mesh
          castShadow
          position={shape.distal.position}
          quaternion={shape.distal.quaternion}
          scale={[1, shape.distal.length, 1]}
        >
          <cylinderGeometry args={[0.047, 0.057, 1, 14]} />
          <meshStandardMaterial
            color="#f0f1ee"
            metalness={0.94}
            roughness={0.14}
          />
        </mesh>
        <mesh
          castShadow
          position={shape.tip}
          rotation={[0, -thetaForIndex(index), 0]}
          scale={[1.2, 0.58, 0.82]}
        >
          <sphereGeometry args={[0.105, 16, 12]} />
          <meshStandardMaterial
            color="#d7dad8"
            metalness={0.9}
            roughness={0.2}
          />
        </mesh>
        <mesh
          position={shape.tip}
          rotation={[0, -thetaForIndex(index), 0]}
          scale={[1.05, 0.25, 0.68]}
        >
          <sphereGeometry args={[0.108, 14, 10]} />
          <meshStandardMaterial color="#d94f38" roughness={0.62} />
        </mesh>
      </RigidBody>

      <FingerJoint
        index={index}
        housingRef={housingRef}
        fingerRef={fingerRef}
        closure={closure}
      />
    </>
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
          <boxGeometry args={[0.64, 0.28, 0.48]} />
          <meshStandardMaterial color="#e85239" metalness={0.55} roughness={0.28} />
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
  const fingerRefs = [
    useRef<RapierRigidBody>(null),
    useRef<RapierRigidBody>(null),
    useRef<RapierRigidBody>(null),
  ];
  const cableRef = useRef<THREE.Mesh>(null);
  const gantryRef = useRef<THREE.Group>(null);
  const trolleyRef = useRef<THREE.Group>(null);
  const drumRef = useRef<THREE.Mesh>(null);
  const plungerRef = useRef<THREE.Group>(null);
  const connectorRefOne = useRef<THREE.Mesh>(null);
  const connectorRefTwo = useRef<THREE.Mesh>(null);
  const connectorRefThree = useRef<THREE.Mesh>(null);
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
  const lastTension = useRef(0);
  const ropeJoint = useRef<ImpulseJoint | null>(null);
  const powerCable = useMemo(
    () => {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        "position",
        new THREE.BufferAttribute(new Float32Array(30 * 3), 3),
      );
      return new THREE.Line(
        geometry,
        new THREE.LineBasicMaterial({ color: "#e6b84a" }),
      );
    },
    [],
  );
  const powerCableRef = useRef<THREE.Line>(null);
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
    if (!ropeJoint.current) {
      ropeJoint.current = world.createImpulseJoint(
        rapier.JointData.rope(
          MAX_CABLE_LENGTH,
          { x: 0, y: 0, z: 0 },
          { x: 0, y: CLAW_ATTACHMENT_Y, z: 0 },
        ),
        anchorBody,
        housing,
        true,
      );
      ropeJoint.current.setContactsEnabled(false);
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
    const cableConstraint = computeCableConstraint({
      anchor,
      attachment,
      anchorVelocity: {
        x: trolleyVelocity.current.x,
        y: 0,
        z: trolleyVelocity.current.z,
      },
      attachmentVelocity,
      targetLength: cableLength.current,
      stiffness: settings.cableStiffness,
      damping: settings.cableDamping,
      maxTension: 320,
    });
    const tension = cableConstraint.tension;
    lastTension.current = tension;
    if (tension > 0) {
      housing.applyImpulse(
        {
          x: cableConstraint.force.x * delta,
          y: cableConstraint.force.y * delta,
          z: cableConstraint.force.z * delta,
        },
        true,
      );
    }

    setMeshBetween(cableRef.current, anchor, attachment);

    const cableVector = attachment.clone().sub(anchor);
    const cableDirection = cableVector.clone().normalize();
    const side = new THREE.Vector3(1, 0, 0);
    if (Math.abs(cableDirection.dot(side)) > 0.92) side.set(0, 0, 1);
    side.cross(cableDirection).normalize();
    const binormal = cableDirection.clone().cross(side).normalize();
    const powerCablePosition = powerCableRef.current?.geometry.getAttribute(
      "position",
    ) as THREE.BufferAttribute | undefined;
    const cablePoints = powerCablePosition?.array as Float32Array | undefined;
    for (let index = 0; index < 30; index += 1) {
      const t = index / 29;
      const coilRadius = 0.045 * Math.sin(Math.PI * t);
      const phaseAngle = t * Math.PI * 18;
      const point = anchor
        .clone()
        .lerp(attachment, t)
        .addScaledVector(side, Math.cos(phaseAngle) * coilRadius)
        .addScaledVector(binormal, Math.sin(phaseAngle) * coilRadius);
      if (cablePoints) {
        cablePoints[index * 3] = point.x;
        cablePoints[index * 3 + 1] = point.y;
        cablePoints[index * 3 + 2] = point.z;
      }
    }
    if (powerCablePosition && powerCableRef.current) {
      powerCablePosition.needsUpdate = true;
      powerCableRef.current.geometry.computeBoundingSphere();
    }

    const pose = getClawPose(closure.current);
    if (plungerRef.current) plungerRef.current.position.y = pose.plungerY;

    for (let index = 0; index < FINGER_COUNT; index += 1) {
      const finger = fingerRefs[index].current;
      const connector =
        index === 0
          ? connectorRefOne.current
          : index === 1
            ? connectorRefTwo.current
            : connectorRefThree.current;
      if (!finger || !connector) continue;
      const theta = thetaForIndex(index);
      const linkStartLocal = new THREE.Vector3(
        Math.cos(theta) * pose.linkStart.r,
        pose.linkStart.y,
        Math.sin(theta) * pose.linkStart.r,
      );
      const linkStartWorld = linkStartLocal
        .applyQuaternion(housingQuaternion)
        .add(
          new THREE.Vector3(
            bodyPosition.x,
            bodyPosition.y,
            bodyPosition.z,
          ),
        );
      const fingerPosition = finger.translation();
      const fingerRotation = finger.rotation();
      const linkEndLocal = new THREE.Vector3(
        0,
        -CLAW_GEOMETRY.connectorTineOffset,
        0,
      )
        .applyQuaternion(
          new THREE.Quaternion(
            fingerRotation.x,
            fingerRotation.y,
            fingerRotation.z,
            fingerRotation.w,
          ),
        )
        .add(
          new THREE.Vector3(
            fingerPosition.x,
            fingerPosition.y,
            fingerPosition.z,
          ),
        );
      setMeshBetween(connector, linkStartWorld, linkEndLocal);
    }

    if (debugTensionRef.current) {
      setMeshBetween(debugTensionRef.current, anchor, attachment);
      const scale = THREE.MathUtils.clamp(tension / 80, 0.4, 2.4);
      debugTensionRef.current.scale.x = scale;
      debugTensionRef.current.scale.z = scale;
    }

    if (frameAccumulator.current >= 0.5) {
      const fps = Math.round(frameCount.current / frameAccumulator.current);
      state.updateMetrics({
        fps,
        minFps: Math.round(Math.min(minFps.current, fps)),
        physicsMs: Number((performance.now() - started).toFixed(2)),
        activeBodies:
          Object.values(bodies.current).filter(Boolean).length + 5,
        cableTension: Number(lastTension.current.toFixed(1)),
        cableLength: Number(cableLength.current.toFixed(2)),
        cableDistance: Number(cableConstraint.distance.toFixed(2)),
        swingAngle: Number(cableConstraint.swingAngle.toFixed(1)),
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
        <cylinderGeometry args={[0.018, 0.018, 1, 10]} />
        <meshStandardMaterial color="#20211f" metalness={0.82} roughness={0.28} />
      </mesh>
      <primitive ref={powerCableRef} object={powerCable} />
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
        angularDamping={swingDamping}
        enabledRotations={[false, true, false]}
        canSleep={false}
        ccd
        name="claw-solenoid-housing"
      >
        <CylinderCollider
          args={[0.2, 0.235]}
          position={[0, 0.02, 0]}
          friction={clawFriction}
          restitution={0.02}
          mass={0.72}
          collisionGroups={HOUSING_COLLISION_GROUPS}
        />
        <CylinderCollider
          args={[0.055, 0.12]}
          position={[0, 0.29, 0]}
          friction={clawFriction}
          mass={0.18}
          collisionGroups={HOUSING_COLLISION_GROUPS}
        />

        <mesh castShadow position={[0, 0.03, 0]}>
          <cylinderGeometry args={[0.225, 0.255, 0.42, 28]} />
          <meshStandardMaterial
            color="#e84e36"
            metalness={0.62}
            roughness={0.24}
          />
        </mesh>
        <mesh castShadow position={[0, 0.25, 0]}>
          <cylinderGeometry args={[0.13, 0.19, 0.12, 24]} />
          <meshStandardMaterial
            color="#e8e6df"
            metalness={0.88}
            roughness={0.16}
          />
        </mesh>
        <mesh castShadow position={[0, 0.35, 0]}>
          <torusGeometry args={[0.105, 0.03, 9, 22]} />
          <meshStandardMaterial
            color="#b9a36c"
            metalness={0.92}
            roughness={0.18}
          />
        </mesh>
        <mesh castShadow position={[0, -0.16, 0]}>
          <cylinderGeometry args={[0.31, 0.31, 0.075, 28]} />
          <meshStandardMaterial
            color="#3a3c38"
            metalness={0.72}
            roughness={0.28}
          />
        </mesh>
        <group ref={plungerRef}>
          <mesh castShadow>
            <cylinderGeometry args={[0.075, 0.075, 0.34, 18]} />
            <meshStandardMaterial
              color="#c7c9c4"
              metalness={0.94}
              roughness={0.12}
            />
          </mesh>
          <mesh castShadow position={[0, -0.15, 0]}>
            <cylinderGeometry args={[0.145, 0.145, 0.055, 22]} />
            <meshStandardMaterial
              color="#d9b86f"
              metalness={0.88}
              roughness={0.19}
            />
          </mesh>
        </group>
        {Array.from({ length: FINGER_COUNT }, (_, index) => {
          const theta = thetaForIndex(index);
          return (
            <group
              key={index}
              position={[
                Math.cos(theta) * CLAW_GEOMETRY.hingeRadius,
                CLAW_GEOMETRY.hingeY,
                Math.sin(theta) * CLAW_GEOMETRY.hingeRadius,
              ]}
              rotation={[0, -theta, 0]}
            >
              <mesh castShadow rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry args={[0.085, 0.085, 0.13, 16]} />
                <meshStandardMaterial
                  color="#d8b66b"
                  metalness={0.86}
                  roughness={0.22}
                />
              </mesh>
              <mesh position={[0, 0, 0.073]} rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry args={[0.026, 0.026, 0.02, 12]} />
                <meshStandardMaterial
                  color="#242622"
                  metalness={0.7}
                  roughness={0.3}
                />
              </mesh>
            </group>
          );
        })}
      </RigidBody>

      {Array.from({ length: FINGER_COUNT }, (_, index) => (
        <ClawFinger
          key={index}
          index={index}
          housingRef={housingRef}
          fingerRef={fingerRefs[index]}
          closure={closure}
        />
      ))}

      <mesh ref={connectorRefOne} castShadow>
        <cylinderGeometry args={[0.027, 0.027, 1, 10]} />
        <meshStandardMaterial color="#d9b86f" metalness={0.9} roughness={0.18} />
      </mesh>
      <mesh ref={connectorRefTwo} castShadow>
        <cylinderGeometry args={[0.027, 0.027, 1, 10]} />
        <meshStandardMaterial color="#d9b86f" metalness={0.9} roughness={0.18} />
      </mesh>
      <mesh ref={connectorRefThree} castShadow>
        <cylinderGeometry args={[0.027, 0.027, 1, 10]} />
        <meshStandardMaterial color="#d9b86f" metalness={0.9} roughness={0.18} />
      </mesh>
    </>
  );
}
