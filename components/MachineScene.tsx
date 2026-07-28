"use client";

import { useCallback, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import {
  CuboidCollider,
  Physics,
  RigidBody,
  type IntersectionEnterPayload,
  type RapierRigidBody,
} from "@react-three/rapier";
import * as THREE from "three";
import { Prize } from "./Prize";
import { useGameStore } from "@/game/store";

const TOP_Y = 3.45;
const BOTTOM_Y = 1.56;
const CHUTE_X = 2.28;
const CHUTE_Z = 1.18;
const CLAW_LIMIT_X = 1.9;
const CLAW_LIMIT_Z = 1.12;

const PRIZE_POSITIONS: Array<[number, number, number]> = Array.from(
  { length: 20 },
  (_, index) => {
    const col = index % 5;
    const row = Math.floor(index / 5);
    const jitterX = ((index * 17) % 9) * 0.018;
    const jitterZ = ((index * 11) % 7) * 0.017;
    return [
      -1.72 + col * 0.68 + jitterX,
      0.38,
      -1.14 + row * 0.68 + jitterZ,
    ];
  },
);

interface ClawRigProps {
  bodies: React.MutableRefObject<Record<string, RapierRigidBody | null>>;
}

function ClawRig({ bodies }: ClawRigProps) {
  const armRefs = useRef<Array<RapierRigidBody | null>>([]);
  const capRef = useRef<THREE.Group>(null);
  const cableRef = useRef<THREE.Mesh>(null);
  const position = useRef({ x: 0, y: TOP_Y, z: 0 });
  const closure = useRef(0);
  const phaseElapsed = useRef(0);
  const lastPhase = useRef(useGameStore.getState().phase);
  const grabbed = useRef<string | null>(null);
  const direction = useMemo(() => new THREE.Vector3(), []);
  const quaternion = useMemo(() => new THREE.Quaternion(), []);
  const up = useMemo(() => new THREE.Vector3(0, 1, 0), []);
  const frameAccumulator = useRef(0);
  const frameCount = useRef(0);
  const minFps = useRef(60);
  const clawFriction = useGameStore((state) => state.settings.clawFriction);

  useFrame((_, unsafeDelta) => {
    const started = performance.now();
    const delta = Math.min(unsafeDelta, 0.04);
    const state = useGameStore.getState();
    const { settings, phase, input } = state;
    const p = position.current;

    frameAccumulator.current += delta;
    frameCount.current += 1;
    if (delta > 0) minFps.current = Math.min(minFps.current, 1 / delta);

    if (lastPhase.current !== phase) {
      lastPhase.current = phase;
      phaseElapsed.current = 0;
    } else {
      phaseElapsed.current += delta;
    }

    if (phase === "aiming") {
      p.x = THREE.MathUtils.clamp(
        p.x + input.x * settings.moveSpeed * delta,
        -CLAW_LIMIT_X,
        CLAW_LIMIT_X,
      );
      p.z = THREE.MathUtils.clamp(
        p.z + input.z * settings.moveSpeed * delta,
        -CLAW_LIMIT_Z,
        CLAW_LIMIT_Z,
      );
    }

    if (phase === "descending") {
      p.y = Math.max(BOTTOM_Y, p.y - settings.lowerSpeed * delta);
      if (p.y <= BOTTOM_Y + 0.001) state.setPhase("closing");
    }

    if (phase === "closing") {
      closure.current = Math.min(
        1,
        closure.current + settings.closeSpeed * delta,
      );
      if (closure.current >= 0.995) {
        let nearestId: string | null = null;
        let nearestDistance = Number.POSITIVE_INFINITY;
        for (const [id, body] of Object.entries(bodies.current)) {
          if (!body) continue;
          const bp = body.translation();
          const horizontal = Math.hypot(bp.x - p.x, bp.z - p.z);
          const vertical = Math.abs(bp.y - (p.y - 0.72));
          const distance = horizontal + vertical * 0.38;
          if (
            horizontal < settings.gripRadius &&
            vertical < 0.74 &&
            distance < nearestDistance
          ) {
            nearestId = id;
            nearestDistance = distance;
          }
        }
        grabbed.current = nearestId;
        state.record("grip_attempt", {
          captured: Boolean(grabbed.current),
          strength: settings.clawStrength,
        });
        state.setPhase("lifting");
      }
    }

    const applyGripAssist = () => {
      const id = grabbed.current;
      if (!id) return;
      const body = bodies.current[id];
      if (!body) return;
      const bp = body.translation();
      const velocity = body.linvel();
      const target = { x: p.x, y: p.y - 0.82, z: p.z };
      const dx = target.x - bp.x;
      const dy = target.y - bp.y;
      const dz = target.z - bp.z;
      const distance = Math.hypot(dx, dy, dz);
      if (distance > settings.gripRadius * 1.9) {
        grabbed.current = null;
        state.record("grip_lost", { distance: Number(distance.toFixed(3)) });
        return;
      }
      const stiffness = settings.clawStrength;
      body.applyImpulse(
        {
          x: (dx * stiffness - velocity.x * 1.8) * delta,
          y: (dy * stiffness - velocity.y * 1.5) * delta,
          z: (dz * stiffness - velocity.z * 1.8) * delta,
        },
        true,
      );
    };

    if (phase === "lifting") {
      applyGripAssist();
      p.y = Math.min(TOP_Y, p.y + settings.liftSpeed * delta);
      if (p.y >= TOP_Y - 0.001) state.setPhase("returning");
    }

    if (phase === "returning") {
      applyGripAssist();
      const distance = Math.hypot(CHUTE_X - p.x, CHUTE_Z - p.z);
      const step = Math.min(distance, settings.moveSpeed * 0.9 * delta);
      if (distance > 0.001) {
        p.x += ((CHUTE_X - p.x) / distance) * step;
        p.z += ((CHUTE_Z - p.z) / distance) * step;
      }
      if (distance < 0.025) state.setPhase("releasing");
    }

    if (phase === "releasing") {
      closure.current = Math.max(0, closure.current - 2.2 * delta);
      if (closure.current < 0.72) grabbed.current = null;
      if (closure.current <= 0.001) state.setPhase("settling");
    }

    if (phase === "settling" && phaseElapsed.current > 2.8) {
      if (!state.result) state.finish("lose");
      state.setPhase("result");
    }

    if (capRef.current) capRef.current.position.set(p.x, p.y, p.z);
    if (cableRef.current) {
      const length = 4.2 - p.y;
      cableRef.current.position.set(p.x, p.y + length / 2 + 0.16, p.z);
      cableRef.current.scale.y = Math.max(0.08, length);
    }

    const openTilt = 0.63;
    const closedTilt = -0.2;
    const tilt = THREE.MathUtils.lerp(openTilt, closedTilt, closure.current);
    const armLength = 1.12;

    armRefs.current.forEach((body, index) => {
      if (!body) return;
      const theta = index * ((Math.PI * 2) / 3) + Math.PI / 6;
      const outwardX = Math.cos(theta);
      const outwardZ = Math.sin(theta);
      const topX = p.x + outwardX * 0.2;
      const topZ = p.z + outwardZ * 0.2;
      direction
        .set(
          outwardX * Math.sin(tilt),
          -Math.cos(tilt),
          outwardZ * Math.sin(tilt),
        )
        .normalize();
      quaternion.setFromUnitVectors(up, direction);
      body.setNextKinematicTranslation({
        x: topX + direction.x * armLength * 0.5,
        y: p.y - 0.17 + direction.y * armLength * 0.5,
        z: topZ + direction.z * armLength * 0.5,
      });
      body.setNextKinematicRotation({
        x: quaternion.x,
        y: quaternion.y,
        z: quaternion.z,
        w: quaternion.w,
      });
    });

    if (frameAccumulator.current >= 0.5) {
      const fps = Math.round(frameCount.current / frameAccumulator.current);
      state.updateMetrics({
        fps,
        minFps: Math.round(Math.min(minFps.current, fps)),
        physicsMs: Number((performance.now() - started).toFixed(2)),
        activeBodies: Object.values(bodies.current).filter(Boolean).length,
      });
      frameAccumulator.current = 0;
      frameCount.current = 0;
    }
  });

  return (
    <>
      <mesh ref={cableRef} castShadow>
        <cylinderGeometry args={[0.018, 0.018, 1, 8]} />
        <meshStandardMaterial color="#24231f" metalness={0.7} roughness={0.3} />
      </mesh>

      <group ref={capRef}>
        <mesh castShadow>
          <cylinderGeometry args={[0.28, 0.34, 0.26, 24]} />
          <meshStandardMaterial color="#ff5b3d" metalness={0.45} roughness={0.24} />
        </mesh>
        <mesh position={[0, 0.16, 0]}>
          <cylinderGeometry args={[0.13, 0.2, 0.13, 20]} />
          <meshStandardMaterial color="#f8f2e7" metalness={0.65} roughness={0.2} />
        </mesh>
      </group>

      {[0, 1, 2].map((index) => (
        <RigidBody
          key={index}
          ref={(body) => {
            armRefs.current[index] = body;
          }}
          type="kinematicPosition"
          position={[0, 3, 0]}
          colliders={false}
          ccd
        >
          <CuboidCollider
            args={[0.075, 0.56, 0.095]}
            friction={clawFriction}
            restitution={0}
          />
          <mesh castShadow>
            <boxGeometry args={[0.15, 1.12, 0.19]} />
            <meshStandardMaterial
              color="#efede6"
              metalness={0.74}
              roughness={0.24}
            />
          </mesh>
          <mesh castShadow position={[0, -0.58, 0]}>
            <sphereGeometry args={[0.12, 12, 10]} />
            <meshStandardMaterial
              color="#ff765d"
              metalness={0.35}
              roughness={0.38}
            />
          </mesh>
        </RigidBody>
      ))}
    </>
  );
}

function Cabinet() {
  const finish = useGameStore((state) => state.finish);

  const handleWin = (payload: IntersectionEnterPayload) => {
    const id = payload.other.rigidBodyObject?.userData?.prizeId;
    const phase = useGameStore.getState().phase;
    if (
      typeof id === "string" &&
      (phase === "releasing" || phase === "settling")
    ) {
      finish("win");
    }
  };

  return (
    <>
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[3, 0.12, 1.9]} position={[0, -0.12, 0]} friction={1.1} />
        <CuboidCollider args={[0.12, 2.25, 1.9]} position={[-3, 2.1, 0]} />
        <CuboidCollider args={[0.12, 2.25, 1.9]} position={[3, 2.1, 0]} />
        <CuboidCollider args={[3, 2.25, 0.12]} position={[0, 2.1, -1.9]} />
        <CuboidCollider args={[3, 0.12, 1.9]} position={[0, 4.32, 0]} />
        <CuboidCollider
          sensor
          args={[0.52, 0.28, 0.52]}
          position={[CHUTE_X, 0.26, CHUTE_Z]}
          onIntersectionEnter={handleWin}
        />
      </RigidBody>

      <mesh receiveShadow position={[0, -0.14, 0]}>
        <boxGeometry args={[6.3, 0.3, 4.1]} />
        <meshStandardMaterial color="#e7dcc7" roughness={0.86} />
      </mesh>
      <mesh receiveShadow position={[CHUTE_X, 0.02, CHUTE_Z]}>
        <boxGeometry args={[1.18, 0.04, 1.18]} />
        <meshStandardMaterial color="#211f1b" roughness={0.68} />
      </mesh>
      <mesh position={[CHUTE_X, 0.04, CHUTE_Z]}>
        <torusGeometry args={[0.54, 0.035, 8, 32]} />
        <meshStandardMaterial color="#ff765d" emissive="#7c1e10" emissiveIntensity={0.45} />
      </mesh>

      {[
        [-2.88, 2.12, -1.78],
        [2.88, 2.12, -1.78],
        [-2.88, 2.12, 1.78],
        [2.88, 2.12, 1.78],
      ].map((position, index) => (
        <mesh
          key={index}
          castShadow
          position={position as [number, number, number]}
        >
          <boxGeometry args={[0.18, 4.25, 0.18]} />
          <meshStandardMaterial color="#302e28" metalness={0.68} roughness={0.32} />
        </mesh>
      ))}

      <mesh position={[0, 2.1, -1.86]}>
        <planeGeometry args={[5.7, 4.05]} />
        <meshStandardMaterial color="#f4eee3" roughness={0.9} />
      </mesh>
      <mesh position={[-2.91, 2.1, 0]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[3.55, 4.05]} />
        <meshPhysicalMaterial
          color="#bfe7e4"
          transparent
          opacity={0.12}
          roughness={0.1}
        />
      </mesh>
      <mesh position={[2.91, 2.1, 0]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[3.55, 4.05]} />
        <meshPhysicalMaterial
          color="#bfe7e4"
          transparent
          opacity={0.12}
          roughness={0.1}
        />
      </mesh>
      <mesh position={[0, 4.36, 0]}>
        <boxGeometry args={[6.25, 0.26, 4.05]} />
        <meshStandardMaterial color="#ff5b3d" metalness={0.18} roughness={0.42} />
      </mesh>
    </>
  );
}

function SceneContent() {
  const bodies = useRef<Record<string, RapierRigidBody | null>>({});
  const round = useGameStore((state) => state.round);
  const settings = useGameStore((state) => state.settings);
  const debug = useGameStore((state) => state.debug);
  const registerBody = useCallback(
    (id: string, body: RapierRigidBody | null) => {
      bodies.current[id] = body;
    },
    [],
  );

  return (
    <>
      <color attach="background" args={["#eee6d8"]} />
      <fog attach="fog" args={["#eee6d8", 9, 17]} />
      <ambientLight intensity={1.25} />
      <directionalLight
        castShadow
        position={[3, 7, 4]}
        intensity={2.4}
        color="#fff4db"
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
      />
      <directionalLight position={[-5, 3, 2]} intensity={1.2} color="#b9dfff" />

      <Physics
        key={round}
        gravity={[0, settings.gravity, 0]}
        timeStep={1 / 60}
        debug={debug}
      >
        <Cabinet />
        {PRIZE_POSITIONS.map((position, index) => (
          <Prize
            key={`${round}-prize-${index}`}
            id={`prize-${index + 1}`}
            index={index}
            position={position}
            registerBody={registerBody}
          />
        ))}
        <ClawRig bodies={bodies} />
      </Physics>
    </>
  );
}

export default SceneContent;
