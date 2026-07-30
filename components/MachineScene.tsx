"use client";

import { useCallback, useRef } from "react";
import { RoundedBox, Text } from "@react-three/drei";
import {
  CuboidCollider,
  Physics,
  RigidBody,
  type IntersectionEnterPayload,
  type RapierRigidBody,
} from "@react-three/rapier";
import { Prize } from "./Prize";
import MechanicalClaw, { CHUTE_X, CHUTE_Z } from "./MechanicalClaw";
import {
  INTERNAL_PGS_ITERATIONS,
  PHYSICS_TIME_STEP,
  PRIZE_DECK_COLLIDER_CENTER_Y,
  PRIZE_DECK_COLLIDER_HALF_HEIGHT,
  SOLVER_ITERATIONS,
} from "@/game/machineDimensions.mjs";
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

const CABINET_COLORS = {
  pearl: "#f5f1eb",
  warmWhite: "#fffaf2",
  pink: "#e83f87",
  pinkDark: "#a91f5e",
  cyan: "#4ee4e7",
  ink: "#20202b",
  glass: "#cceff1",
} as const;

interface ChuteGuideWall {
  position: [number, number, number];
  size: [number, number, number];
}

const CHUTE_GUIDE_WALLS: ChuteGuideWall[] = [
  { position: [-0.585, 0.42, 0], size: [0.035, 0.62, 1.2] },
  { position: [0.585, 0.42, 0], size: [0.035, 0.62, 1.2] },
  { position: [0, 0.42, -0.585], size: [1.2, 0.62, 0.035] },
  { position: [0, 0.42, 0.585], size: [1.2, 0.62, 0.035] },
];

function CabinetGlassMaterial() {
  return (
    <meshPhysicalMaterial
      color={CABINET_COLORS.glass}
      transparent
      opacity={0.18}
      roughness={0.055}
      transmission={0.72}
      thickness={0.025}
      ior={1.48}
      metalness={0}
      depthWrite={false}
    />
  );
}

function AcrylicGuideMaterial() {
  return (
    <meshPhysicalMaterial
      color="#68d9df"
      transparent
      opacity={0.46}
      roughness={0.12}
      transmission={0.42}
      thickness={0.028}
      ior={1.49}
      metalness={0}
      attenuationColor="#35b9c2"
      attenuationDistance={0.35}
      depthWrite={false}
    />
  );
}

function PrizeDeckVisuals() {
  return (
    <>
      <mesh receiveShadow position={[0, -0.08, 0]}>
        <boxGeometry args={[6.02, 0.18, 3.82]} />
        <meshStandardMaterial
          color={CABINET_COLORS.warmWhite}
          metalness={0.08}
          roughness={0.48}
        />
      </mesh>
      <mesh receiveShadow position={[0, 0.025, -0.08]} rotation={[-0.018, 0, 0]}>
        <boxGeometry args={[5.66, 0.055, 3.46]} />
        <meshStandardMaterial color="#f1e8db" roughness={0.72} />
      </mesh>
      <group position={[CHUTE_X, 0, CHUTE_Z]}>
        <mesh receiveShadow position={[0, 0.08, 0]}>
          <boxGeometry args={[1.12, 0.06, 1.12]} />
          <meshStandardMaterial color="#15151c" roughness={0.7} />
        </mesh>
        {[-0.56, 0.56].map((x) => (
          <mesh key={`x-${x}`} castShadow position={[x, 0.18, 0]}>
            <boxGeometry args={[0.07, 0.2, 1.2]} />
            <meshStandardMaterial
              color={CABINET_COLORS.pink}
              metalness={0.34}
              roughness={0.28}
            />
          </mesh>
        ))}
        {[-0.56, 0.56].map((z) => (
          <mesh key={`z-${z}`} castShadow position={[0, 0.18, z]}>
            <boxGeometry args={[1.2, 0.2, 0.07]} />
            <meshStandardMaterial
              color={CABINET_COLORS.pink}
              metalness={0.34}
              roughness={0.28}
            />
          </mesh>
        ))}
        <group name="prize-chute-acrylic-guides">
          {CHUTE_GUIDE_WALLS.map(({ position, size }, index) => (
            <mesh key={index} position={position} renderOrder={3}>
              <boxGeometry args={size} />
              <AcrylicGuideMaterial />
            </mesh>
          ))}
        </group>
      </group>
    </>
  );
}

function GlassEnclosure() {
  return (
    <group name="tempered-glass-enclosure">
      <mesh
        name="undecorated-front-glass"
        position={[0, 2.12, 1.805]}
        renderOrder={4}
      >
        <boxGeometry args={[5.52, 3.78, 0.025]} />
        <CabinetGlassMaterial />
      </mesh>
      <mesh position={[-2.845, 2.12, 0]} renderOrder={3}>
        <boxGeometry args={[0.025, 3.78, 3.42]} />
        <CabinetGlassMaterial />
      </mesh>
      <mesh position={[2.845, 2.12, 0]} renderOrder={3}>
        <boxGeometry args={[0.025, 3.78, 3.42]} />
        <CabinetGlassMaterial />
      </mesh>
      <mesh
        name="undecorated-rear-glass"
        position={[0, 2.12, -1.805]}
        renderOrder={3}
      >
        <boxGeometry args={[5.52, 3.78, 0.025]} />
        <CabinetGlassMaterial />
      </mesh>
    </group>
  );
}

function PrizeChuteGuideColliders() {
  return (
    <>
      {CHUTE_GUIDE_WALLS.map(({ position, size }, index) => (
        <CuboidCollider
          key={index}
          args={[size[0] / 2, size[1] / 2, size[2] / 2]}
          position={[
            CHUTE_X + position[0],
            position[1],
            CHUTE_Z + position[2],
          ]}
          friction={0.18}
          restitution={0}
        />
      ))}
    </>
  );
}

function CabinetFrame() {
  return (
    <group name="pillarless-cabinet-trim">
      {[-1.78, 1.78].flatMap((z) =>
        [0.12, 4.1].map((y) => (
          <RoundedBox
            key={`${z}-${y}`}
            castShadow
            args={[5.92, 0.22, 0.2]}
            radius={0.055}
            smoothness={4}
            position={[0, y, z]}
          >
            <meshPhysicalMaterial
              color={y > 2 ? CABINET_COLORS.pink : CABINET_COLORS.pearl}
              metalness={0.2}
              roughness={0.28}
              clearcoat={0.65}
            />
          </RoundedBox>
        )),
      )}
      {[-2.88, 2.88].flatMap((x) =>
        [0.12, 4.1].map((y) => (
          <RoundedBox
            key={`${x}-${y}`}
            castShadow
            args={[0.2, 0.22, 3.52]}
            radius={0.055}
            smoothness={4}
            position={[x, y, 0]}
          >
            <meshPhysicalMaterial
              color={y > 2 ? CABINET_COLORS.pink : CABINET_COLORS.pearl}
              metalness={0.2}
              roughness={0.28}
              clearcoat={0.65}
            />
          </RoundedBox>
        )),
      )}

      <mesh position={[0, 4, 1.84]}>
        <boxGeometry args={[5.44, 0.035, 0.03]} />
        <meshStandardMaterial
          color={CABINET_COLORS.cyan}
          emissive={CABINET_COLORS.cyan}
          emissiveIntensity={2}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}

function Marquee() {
  return (
    <group name="illuminated-marquee">
      <RoundedBox
        castShadow
        args={[6.26, 0.34, 4.04]}
        radius={0.14}
        smoothness={5}
        position={[0, 4.34, 0]}
      >
        <meshPhysicalMaterial
          color={CABINET_COLORS.pink}
          metalness={0.12}
          roughness={0.3}
          clearcoat={0.78}
          clearcoatRoughness={0.16}
        />
      </RoundedBox>
      <RoundedBox
        castShadow
        args={[5.72, 0.68, 0.18]}
        radius={0.16}
        smoothness={5}
        position={[0, 4.62, 1.97]}
      >
        <meshPhysicalMaterial
          color={CABINET_COLORS.warmWhite}
          emissive="#ffb8d4"
          emissiveIntensity={0.3}
          roughness={0.24}
          clearcoat={0.8}
        />
      </RoundedBox>
      <Text
        position={[0, 4.68, 2.075]}
        fontSize={0.38}
        letterSpacing={0.045}
        color={CABINET_COLORS.pinkDark}
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.012}
        outlineColor="#fffaf5"
      >
        CLAWPICK
      </Text>
      <Text
        position={[1.68, 4.44, 2.078]}
        fontSize={0.13}
        letterSpacing={0.12}
        color="#3f8f97"
        anchorX="center"
        anchorY="middle"
      >
        MINI
      </Text>
      <mesh position={[0, 4.24, 0]}>
        <boxGeometry args={[5.62, 0.045, 3.48]} />
        <meshStandardMaterial
          color="#fff8e9"
          emissive="#fff1c8"
          emissiveIntensity={1.4}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}

function ControlFascia() {
  return (
    <group name="front-control-fascia">
      <RoundedBox
        castShadow
        args={[5.8, 0.46, 0.58]}
        radius={0.12}
        smoothness={5}
        position={[0, 0.03, 1.98]}
        rotation={[-0.12, 0, 0]}
      >
        <meshPhysicalMaterial
          color={CABINET_COLORS.pink}
          metalness={0.16}
          roughness={0.3}
          clearcoat={0.76}
          clearcoatRoughness={0.16}
        />
      </RoundedBox>
      <RoundedBox
        castShadow
        args={[4.72, 0.065, 0.42]}
        radius={0.025}
        smoothness={3}
        position={[-0.18, 0.245, 2.01]}
        rotation={[-0.12, 0, 0]}
      >
        <meshStandardMaterial color="#f8eef0" metalness={0.18} roughness={0.3} />
      </RoundedBox>

      <group position={[-1.38, 0.29, 2.02]}>
        <mesh castShadow position={[0, 0.12, 0]}>
          <cylinderGeometry args={[0.055, 0.07, 0.27, 18]} />
          <meshStandardMaterial color="#31313a" metalness={0.55} roughness={0.32} />
        </mesh>
        <mesh castShadow position={[0, 0.3, 0]}>
          <sphereGeometry args={[0.125, 20, 14]} />
          <meshPhysicalMaterial
            color={CABINET_COLORS.cyan}
            emissive="#176d78"
            emissiveIntensity={0.35}
            metalness={0.3}
            roughness={0.24}
            clearcoat={0.8}
          />
        </mesh>
      </group>

      {[-0.45, 0.12].map((x, index) => (
        <group key={x} position={[x, 0.29, 2.02]}>
          <mesh castShadow>
            <cylinderGeometry args={[0.16, 0.16, 0.085, 24]} />
            <meshStandardMaterial color="#d4d0ca" metalness={0.58} roughness={0.25} />
          </mesh>
          <mesh castShadow position={[0, 0.052, 0]}>
            <cylinderGeometry args={[0.125, 0.125, 0.055, 24]} />
            <meshStandardMaterial
              color={index === 0 ? "#fff5ea" : CABINET_COLORS.cyan}
              emissive={index === 0 ? "#ff6f93" : "#42ccd0"}
              emissiveIntensity={1.1}
              roughness={0.24}
              toneMapped={false}
            />
          </mesh>
        </group>
      ))}

      <RoundedBox
        args={[0.94, 0.34, 0.08]}
        radius={0.035}
        smoothness={3}
        position={[0.88, 0.18, 2.275]}
        rotation={[0.08, 0, 0]}
      >
        <meshStandardMaterial color="#171820" roughness={0.4} />
      </RoundedBox>
      <Text
        position={[0.88, 0.19, 2.322]}
        fontSize={0.12}
        color="#83fff3"
        anchorX="center"
        anchorY="middle"
      >
        READY
      </Text>

      <group position={[2.05, 0.04, 2.27]}>
        <RoundedBox args={[0.72, 0.5, 0.12]} radius={0.055} smoothness={4}>
          <meshStandardMaterial color="#2a2a35" metalness={0.42} roughness={0.34} />
        </RoundedBox>
        <mesh position={[0, 0.07, 0.07]}>
          <boxGeometry args={[0.48, 0.055, 0.025]} />
          <meshStandardMaterial
            color={CABINET_COLORS.cyan}
            emissive={CABINET_COLORS.cyan}
            emissiveIntensity={0.9}
            toneMapped={false}
          />
        </mesh>
        <mesh position={[0.24, -0.15, 0.075]}>
          <cylinderGeometry args={[0.025, 0.025, 0.035, 12]} />
          <meshStandardMaterial color="#d9c477" metalness={0.9} roughness={0.18} />
        </mesh>
      </group>

      <Text
        position={[-0.25, -0.08, 2.295]}
        fontSize={0.125}
        letterSpacing={0.12}
        color="#fff7f5"
        anchorX="center"
        anchorY="middle"
      >
        LEISURE GAME
      </Text>
    </group>
  );
}

function LowerServiceCabinet() {
  return (
    <group name="lower-service-cabinet">
      <RoundedBox
        castShadow
        receiveShadow
        args={[6.25, 1.25, 4.04]}
        radius={0.18}
        smoothness={5}
        position={[0, -0.72, 0]}
      >
        <meshPhysicalMaterial
          color={CABINET_COLORS.pearl}
          metalness={0.18}
          roughness={0.34}
          clearcoat={0.65}
          clearcoatRoughness={0.2}
        />
      </RoundedBox>
      <RoundedBox
        args={[3.2, 0.84, 0.075]}
        radius={0.035}
        smoothness={3}
        position={[-0.56, -0.76, 2.055]}
      >
        <meshStandardMaterial color="#eee9e4" metalness={0.2} roughness={0.4} />
      </RoundedBox>
      <mesh castShadow position={[0.92, -0.76, 2.105]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.055, 0.055, 0.035, 20]} />
        <meshStandardMaterial color="#b9babd" metalness={0.92} roughness={0.18} />
      </mesh>

      {[-1.72, -1.58, -1.44, -1.3, -1.16].map((x) => (
        <mesh key={x} position={[x, -0.78, 2.102]}>
          <boxGeometry args={[0.065, 0.38, 0.024]} />
          <meshStandardMaterial color="#5b5b62" metalness={0.35} roughness={0.5} />
        </mesh>
      ))}

      <group position={[2.08, -0.72, 2.07]}>
        <RoundedBox args={[1.36, 0.82, 0.13]} radius={0.09} smoothness={4}>
          <meshStandardMaterial color={CABINET_COLORS.pinkDark} roughness={0.34} />
        </RoundedBox>
        <RoundedBox
          args={[1.03, 0.53, 0.08]}
          radius={0.055}
          smoothness={4}
          position={[0, -0.04, 0.09]}
        >
          <meshStandardMaterial color="#171820" roughness={0.72} />
        </RoundedBox>
        <mesh position={[0, -0.02, 0.142]} rotation={[-0.18, 0, 0]}>
          <boxGeometry args={[0.86, 0.39, 0.025]} />
          <meshStandardMaterial color="#2a2a33" roughness={0.58} />
        </mesh>
        <Text
          position={[0, 0.29, 0.145]}
          fontSize={0.115}
          letterSpacing={0.08}
          color="#fff4f3"
          anchorX="center"
          anchorY="middle"
        >
          PRIZE OUT
        </Text>
      </group>

      {[-2.6, 2.6].flatMap((x) =>
        [-1.62, 1.62].map((z) => (
          <group key={`${x}-${z}`} position={[x, -1.43, z]}>
            <mesh castShadow>
              <cylinderGeometry args={[0.12, 0.14, 0.2, 18]} />
              <meshStandardMaterial color="#303039" metalness={0.55} roughness={0.4} />
            </mesh>
            <mesh position={[0, -0.12, 0]}>
              <cylinderGeometry args={[0.16, 0.16, 0.045, 18]} />
              <meshStandardMaterial color="#18181d" roughness={0.64} />
            </mesh>
          </group>
        )),
      )}
    </group>
  );
}

function CabinetVisuals({ showTopCover }: { showTopCover: boolean }) {
  return (
    <>
      <LowerServiceCabinet />
      <PrizeDeckVisuals />
      <GlassEnclosure />
      <CabinetFrame />
      {/* The marquee and its light panel roof the cabinet, so looking down at
          the gantry means taking them off. The ceiling collider stays. */}
      <group name="illuminated-marquee-group" visible={showTopCover}>
        <Marquee />
      </group>
      <ControlFascia />
      <pointLight
        position={[-1.8, 3.65, 0.4]}
        intensity={1.1}
        distance={5.2}
        color="#ffb4d2"
      />
      <pointLight
        position={[1.8, 3.65, 0.4]}
        intensity={1.05}
        distance={5.2}
        color="#bafff5"
      />
    </>
  );
}

function Cabinet({ showVisuals }: { showVisuals: boolean }) {
  const finish = useGameStore((state) => state.finish);
  const topCoverHidden = useGameStore((state) => state.topCoverHidden);

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
        <CuboidCollider
          args={[3, PRIZE_DECK_COLLIDER_HALF_HEIGHT, 1.9]}
          position={[0, PRIZE_DECK_COLLIDER_CENTER_Y, 0]}
          friction={1.1}
        />
        <CuboidCollider args={[0.12, 2.25, 1.9]} position={[-3, 2.1, 0]} />
        <CuboidCollider args={[0.12, 2.25, 1.9]} position={[3, 2.1, 0]} />
        <CuboidCollider args={[3, 2.25, 0.12]} position={[0, 2.1, -1.9]} />
        <CuboidCollider args={[3, 2.25, 0.12]} position={[0, 2.1, 1.9]} />
        <CuboidCollider args={[3, 0.12, 1.9]} position={[0, 4.32, 0]} />
        <PrizeChuteGuideColliders />
        <CuboidCollider
          sensor
          args={[0.52, 0.28, 0.52]}
          position={[CHUTE_X, 0.26, CHUTE_Z]}
          onIntersectionEnter={handleWin}
        />
      </RigidBody>

      <group name="cabinet-render-meshes" visible={showVisuals}>
        <CabinetVisuals showTopCover={!topCoverHidden} />
      </group>
    </>
  );
}

function SceneContent() {
  const bodies = useRef<Record<string, RapierRigidBody | null>>({});
  const round = useGameStore((state) => state.round);
  // Subscribe to the one setting the scene needs, so dragging an unrelated
  // slider does not re-render the whole cabinet.
  const gravity = useGameStore((state) => state.settings.gravity);
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
        gravity={[0, gravity, 0]}
        timeStep={PHYSICS_TIME_STEP}
        numSolverIterations={SOLVER_ITERATIONS}
        numInternalPgsIterations={INTERNAL_PGS_ITERATIONS}
        debug={debug}
      >
        <Cabinet showVisuals={!debug} />
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
