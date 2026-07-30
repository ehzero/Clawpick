"use client";

import {
  BallCollider,
  CapsuleCollider,
  RigidBody,
  type RapierRigidBody,
} from "@react-three/rapier";
import { useGameStore } from "@/game/store";

const COLORS = [
  "#ff785a",
  "#ffd452",
  "#69d6c3",
  "#a996ff",
  "#ff9ac2",
  "#80b8ff",
];

interface PrizeProps {
  id: string;
  index: number;
  position: [number, number, number];
  registerBody: (id: string, body: RapierRigidBody | null) => void;
}

export function Prize({ id, index, position, registerBody }: PrizeProps) {
  // Narrow selectors keep the twenty prizes out of every unrelated slider drag.
  const mass = useGameStore((state) => state.settings.prizeMass);
  const friction = useGameStore((state) => state.settings.prizeFriction);
  const linearDamping = useGameStore(
    (state) => state.settings.prizeLinearDamping,
  );
  const angularDamping = useGameStore((state) => state.settings.angularDamping);
  const debug = useGameStore((state) => state.debug);
  const color = COLORS[index % COLORS.length];
  const accent = index % 2 === 0 ? "#fff5dc" : "#f8ebff";

  return (
    <RigidBody
      ref={(body) => registerBody(id, body)}
      colliders={false}
      position={position}
      linearDamping={linearDamping}
      angularDamping={angularDamping}
      // Rapier's linear sleep threshold is 0.1 m/s and is not settable from
      // the JS bindings. At this cabinet's scale a prize creeping well below
      // that is still visibly moving, so sleeping freezes it mid-drift and a
      // neighbour's contact restarts it — a visible stop/go stutter. Staying
      // awake costs little for twenty bodies; damping brings them to rest.
      canSleep={false}
      ccd
      userData={{ prizeId: id }}
      name={id}
    >
      <CapsuleCollider
        args={[0.16, 0.22]}
        position={[0, 0.19, 0]}
        friction={friction}
        restitution={0.03}
        mass={mass * 0.62}
      />
      <BallCollider
        args={[0.25]}
        position={[0, 0.52, 0]}
        friction={friction}
        restitution={0.03}
        mass={mass * 0.38}
      />

      <group name={`${id}-render-meshes`} visible={!debug}>
      <mesh castShadow receiveShadow position={[0, 0.18, 0]}>
        <capsuleGeometry args={[0.22, 0.3, 8, 14]} />
        <meshStandardMaterial color={color} roughness={0.86} />
      </mesh>
      <mesh castShadow position={[0, 0.52, 0]}>
        <sphereGeometry args={[0.27, 18, 14]} />
        <meshStandardMaterial color={color} roughness={0.82} />
      </mesh>
      <mesh castShadow position={[-0.19, 0.69, 0]}>
        <sphereGeometry args={[0.09, 12, 10]} />
        <meshStandardMaterial color={color} roughness={0.9} />
      </mesh>
      <mesh castShadow position={[0.19, 0.69, 0]}>
        <sphereGeometry args={[0.09, 12, 10]} />
        <meshStandardMaterial color={color} roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.5, 0.245]}>
        <sphereGeometry args={[0.12, 12, 10]} />
        <meshStandardMaterial color={accent} roughness={0.9} />
      </mesh>
      <mesh position={[-0.085, 0.59, 0.25]}>
        <sphereGeometry args={[0.018, 8, 8]} />
        <meshStandardMaterial color="#25231f" />
      </mesh>
      <mesh position={[0.085, 0.59, 0.25]}>
        <sphereGeometry args={[0.018, 8, 8]} />
        <meshStandardMaterial color="#25231f" />
      </mesh>
      </group>
    </RigidBody>
  );
}
