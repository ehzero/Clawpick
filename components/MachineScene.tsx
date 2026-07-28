"use client";

import { useCallback, useRef } from "react";
import {
  CuboidCollider,
  Physics,
  RigidBody,
  type IntersectionEnterPayload,
  type RapierRigidBody,
} from "@react-three/rapier";
import { Prize } from "./Prize";
import MechanicalClaw, {
  CHUTE_X,
  CHUTE_Z,
  OverheadRails,
} from "./MechanicalClaw";
import { useGameStore } from "@/game/store";

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
      <mesh receiveShadow position={[0, 0.01, 0]}>
        <boxGeometry args={[5.78, 0.06, 3.55]} />
        <meshStandardMaterial color="#e5d7bd" roughness={0.82} />
      </mesh>
      <group position={[CHUTE_X, 0.08, CHUTE_Z]}>
        <mesh receiveShadow>
          <boxGeometry args={[1.12, 0.06, 1.12]} />
          <meshStandardMaterial color="#1f211f" roughness={0.68} />
        </mesh>
        {[-0.56, 0.56].map((x) => (
          <mesh key={`x-${x}`} castShadow position={[x, 0.1, 0]}>
            <boxGeometry args={[0.07, 0.2, 1.2]} />
            <meshStandardMaterial color="#d94d36" metalness={0.48} roughness={0.34} />
          </mesh>
        ))}
        {[-0.56, 0.56].map((z) => (
          <mesh key={`z-${z}`} castShadow position={[0, 0.1, z]}>
            <boxGeometry args={[1.2, 0.2, 0.07]} />
            <meshStandardMaterial color="#d94d36" metalness={0.48} roughness={0.34} />
          </mesh>
        ))}
      </group>

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
          <boxGeometry args={[0.22, 4.25, 0.22]} />
          <meshStandardMaterial color="#323532" metalness={0.78} roughness={0.26} />
        </mesh>
      ))}

      {[-1.78, 1.78].flatMap((z) =>
        [0.12, 4.1].map((y) => (
          <mesh key={`${z}-${y}`} castShadow position={[0, y, z]}>
            <boxGeometry args={[5.9, 0.18, 0.16]} />
            <meshStandardMaterial color="#343633" metalness={0.78} roughness={0.28} />
          </mesh>
        )),
      )}
      {[-2.88, 2.88].flatMap((x) =>
        [0.12, 4.1].map((y) => (
          <mesh key={`${x}-${y}`} castShadow position={[x, y, 0]}>
            <boxGeometry args={[0.16, 0.18, 3.52]} />
            <meshStandardMaterial color="#343633" metalness={0.78} roughness={0.28} />
          </mesh>
        )),
      )}

      <mesh position={[0, 2.12, -1.82]}>
        <planeGeometry args={[5.55, 3.82]} />
        <meshStandardMaterial color="#ebe5d9" roughness={0.88} />
      </mesh>
      <mesh position={[0, 2.12, 1.81]}>
        <planeGeometry args={[5.52, 3.78]} />
        <meshPhysicalMaterial
          color="#bde3e2"
          transparent
          opacity={0.075}
          roughness={0.08}
          transmission={0.12}
          depthWrite={false}
        />
      </mesh>
      <mesh position={[-2.84, 2.12, 0]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[3.42, 3.78]} />
        <meshPhysicalMaterial
          color="#bfe7e4"
          transparent
          opacity={0.09}
          roughness={0.08}
          transmission={0.1}
          depthWrite={false}
        />
      </mesh>
      <mesh position={[2.84, 2.12, 0]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[3.42, 3.78]} />
        <meshPhysicalMaterial
          color="#bfe7e4"
          transparent
          opacity={0.09}
          roughness={0.08}
          transmission={0.1}
          depthWrite={false}
        />
      </mesh>
      <mesh position={[0, 4.36, 0]}>
        <boxGeometry args={[6.25, 0.26, 4.05]} />
        <meshStandardMaterial color="#ff5b3d" metalness={0.18} roughness={0.42} />
      </mesh>
      <mesh castShadow position={[0, 4.62, 0.02]}>
        <boxGeometry args={[5.8, 0.34, 3.72]} />
        <meshStandardMaterial
          color="#f4ead7"
          emissive="#ffcf89"
          emissiveIntensity={0.18}
          roughness={0.46}
        />
      </mesh>
      <mesh castShadow position={[0, 4.62, 1.91]}>
        <boxGeometry args={[5.42, 0.24, 0.08]} />
        <meshStandardMaterial
          color="#fff4d7"
          emissive="#ffc76d"
          emissiveIntensity={0.8}
          roughness={0.3}
        />
      </mesh>

      <group position={[-1.45, 0.2, 1.98]} rotation={[-0.16, 0, 0]}>
        <mesh castShadow>
          <boxGeometry args={[1.9, 0.2, 0.68]} />
          <meshStandardMaterial color="#e95138" metalness={0.38} roughness={0.38} />
        </mesh>
        <mesh castShadow position={[-0.42, 0.23, 0]}>
          <cylinderGeometry args={[0.055, 0.07, 0.34, 14]} />
          <meshStandardMaterial color="#262825" metalness={0.6} roughness={0.35} />
        </mesh>
        <mesh castShadow position={[-0.42, 0.43, 0]}>
          <sphereGeometry args={[0.13, 16, 12]} />
          <meshStandardMaterial color="#d8b86d" metalness={0.66} roughness={0.28} />
        </mesh>
        <mesh castShadow position={[0.38, 0.16, 0.02]}>
          <cylinderGeometry args={[0.16, 0.16, 0.09, 20]} />
          <meshStandardMaterial
            color="#fff3dc"
            emissive="#ff765d"
            emissiveIntensity={0.3}
            roughness={0.35}
          />
        </mesh>
      </group>

      <group position={[2.08, 0.48, 1.91]}>
        <mesh castShadow>
          <boxGeometry args={[1.28, 0.78, 0.16]} />
          <meshStandardMaterial color="#30322f" metalness={0.56} roughness={0.38} />
        </mesh>
        <mesh position={[0, 0.02, 0.09]} rotation={[0.1, 0, 0]}>
          <boxGeometry args={[0.94, 0.48, 0.05]} />
          <meshStandardMaterial color="#171816" roughness={0.58} />
        </mesh>
        <mesh castShadow position={[0.51, 0.29, 0.1]}>
          <cylinderGeometry args={[0.035, 0.035, 0.1, 12]} />
          <meshStandardMaterial color="#d8b86d" metalness={0.82} roughness={0.24} />
        </mesh>
        {[-0.46, 0.46].map((x) => (
          <mesh key={x} castShadow position={[x, -0.37, 0.1]}>
            <boxGeometry args={[0.06, 0.18, 0.05]} />
            <meshStandardMaterial color="#bfc2bd" metalness={0.82} roughness={0.24} />
          </mesh>
        ))}
      </group>
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
        <OverheadRails />
        {PRIZE_POSITIONS.map((position, index) => (
          <Prize
            key={`${round}-prize-${index}`}
            id={`prize-${index + 1}`}
            index={index}
            position={position}
            registerBody={registerBody}
          />
        ))}
        <MechanicalClaw bodies={bodies} />
      </Physics>
    </>
  );
}

export default SceneContent;
