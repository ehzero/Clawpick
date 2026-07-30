"use client";

import {
  useMemo,
  useRef,
  type MutableRefObject,
  type RefObject,
} from "react";
import type * as THREE from "three";
import {
  CuboidCollider,
  CylinderCollider,
  RigidBody,
  interactionGroups,
  usePrismaticJoint,
  useBeforePhysicsStep,
  type RapierRigidBody,
} from "@react-three/rapier";
import { MotorModel } from "@dimforge/rapier3d-compat";
import {
  BRIDGE,
  RAIL,
  TROLLEY,
  createGantryGeometry,
} from "@/game/gantryGeometry.mjs";
import { useClawSpecStore } from "@/game/clawSpecs";
import { useGameStore } from "@/game/store";

/**
 * The overhead gantry as real mechanism: a bridge of three round rods on end
 * plates, riding the fixed side rods front-to-back, and a carriage straddling
 * the lower rod pair left-to-right.
 *
 * Both members are dynamic bodies held to their axis by a prismatic joint whose
 * limits are the mechanical end stops. Each axis is driven by the joint's own
 * velocity motor, so the drive works through the assembly's real inertia — a
 * stopping carriage settles, an end stop is a genuine impact, and the claw
 * hanging below pulls on the carriage.
 *
 * A velocity motor is the honest model here because the axis really is a geared
 * DC motor. That is the opposite of the claw plunger, which is a solenoid and
 * is therefore driven by bare force with no position feedback at all.
 */

/** Gantry members share a filter so they collide with prizes but not each other. */
const GANTRY_COLLISION_GROUPS = interactionGroups([5], [0]);

/** A cylinder's own axis is Y, so rods and wheels need turning onto X or Z. */
const ALONG_X: [number, number, number] = [0, 0, Math.PI / 2];
const ALONG_Z: [number, number, number] = [Math.PI / 2, 0, 0];

const STEEL = { color: "#c9ccc7", metalness: 0.94, roughness: 0.14 } as const;
const DARK_STEEL = { color: "#6f7370", metalness: 0.86, roughness: 0.28 } as const;
/** White nylon, as in the real machine. The flange is a shade off so the
 *  groove still reads at a distance. */
const NYLON = { color: "#f4f2ec", metalness: 0.04, roughness: 0.52 } as const;
const NYLON_FLANGE = {
  color: "#e2ded4",
  metalness: 0.04,
  roughness: 0.58,
} as const;

export interface AxisCommand {
  x: number;
  z: number;
}

interface GantryMechanismProps {
  bridgeRef: RefObject<RapierRigidBody | null>;
  trolleyRef: RefObject<RapierRigidBody | null>;
  drumRef: RefObject<THREE.Mesh | null>;
  /** Target axis velocities in m/s, written by the machine step each tick. */
  command: MutableRefObject<AxisCommand>;
  /** Mounted on the carriage body, e.g. the winch wire exit guide. */
  children?: React.ReactNode;
}

type GantryLayout = ReturnType<typeof createGantryGeometry>;
type WheelSpec = GantryLayout["wheel"];

const SIDES = [-1, 1] as const;

/**
 * A grooved nylon wheel. The rod sits down inside the groove and the flanges
 * reach past its centreline, which is what holds the wheel captive on the rod.
 */
function GroovedWheel({
  position,
  rotation,
  spec,
}: {
  position: [number, number, number];
  rotation: [number, number, number];
  spec: WheelSpec;
}) {
  return (
    <group position={position} rotation={rotation}>
      <mesh castShadow>
        <cylinderGeometry
          args={[spec.grooveRadius, spec.grooveRadius, spec.grooveWidth, 22]}
        />
        <meshStandardMaterial {...NYLON} />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh
          key={side}
          castShadow
          position={[
            0,
            (side * (spec.grooveWidth + spec.flangeWidth)) / 2,
            0,
          ]}
        >
          <cylinderGeometry
            args={[
              spec.flangeRadius,
              spec.flangeRadius,
              spec.flangeWidth,
              22,
            ]}
          />
          <meshStandardMaterial {...NYLON_FLANGE} />
        </mesh>
      ))}
    </group>
  );
}

function SideRails({
  showVisuals,
  layout,
}: {
  showVisuals: boolean;
  layout: GantryLayout;
}) {
  const railX = [-layout.railX, layout.railX];
  const stopZ = [-layout.stopZ, layout.stopZ];
  return (
    <RigidBody type="fixed" colliders={false} name="gantry-side-rails">
      {railX.map((x) => (
        <CylinderCollider
          key={`rail-${x}`}
          args={[layout.railLength / 2, layout.rodRadius]}
          position={[x, RAIL.y, 0]}
          rotation={ALONG_Z}
          collisionGroups={GANTRY_COLLISION_GROUPS}
        />
      ))}
      {railX.flatMap((x) =>
        stopZ.map((z) => (
          <CylinderCollider
            key={`stop-${x}-${z}`}
            args={[RAIL.stopLength / 2, RAIL.stopRadius]}
            position={[x, RAIL.y, z]}
            rotation={ALONG_Z}
            collisionGroups={GANTRY_COLLISION_GROUPS}
          />
        )),
      )}

      <group name="overhead-rail-render-meshes" visible={showVisuals}>
        {railX.map((x) => (
          <group key={x}>
            <mesh castShadow position={[x, RAIL.y, 0]} rotation={ALONG_Z}>
              <cylinderGeometry
                args={[layout.rodRadius, layout.rodRadius, layout.railLength, 20]}
              />
              <meshStandardMaterial {...STEEL} />
            </mesh>
            {stopZ.map((z) => (
              <mesh
                key={z}
                castShadow
                position={[x, RAIL.y, z]}
                rotation={ALONG_Z}
              >
                <cylinderGeometry
                  args={[
                    RAIL.stopRadius,
                    RAIL.stopRadius,
                    RAIL.stopLength,
                    18,
                  ]}
                />
                <meshStandardMaterial {...DARK_STEEL} />
              </mesh>
            ))}
          </group>
        ))}
      </group>
    </RigidBody>
  );
}

/**
 * Holds each member to one axis and drives it. The prismatic limits are the end
 * stops, so overrunning is resolved by the solver rather than by clamping a
 * number.
 */
function GantryAxes({
  railAnchorRef,
  bridgeRef,
  trolleyRef,
  command,
  layout,
}: {
  railAnchorRef: RefObject<RapierRigidBody | null>;
  bridgeRef: RefObject<RapierRigidBody | null>;
  trolleyRef: RefObject<RapierRigidBody | null>;
  command: MutableRefObject<AxisCommand>;
  layout: GantryLayout;
}) {
  const bridgeJoint = usePrismaticJoint(
    railAnchorRef as RefObject<RapierRigidBody>,
    bridgeRef as RefObject<RapierRigidBody>,
    [
      // The anchor body already sits at the bridge height, so both anchors are
      // at their body origins and the constraint stays where it was.
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 1],
      [-layout.travelZ, layout.travelZ],
    ],
  );
  const trolleyJoint = usePrismaticJoint(
    bridgeRef as RefObject<RapierRigidBody>,
    trolleyRef as RefObject<RapierRigidBody>,
    [
      [0, TROLLEY.y - BRIDGE.y, 0],
      [0, 0, 0],
      [1, 0, 0],
      [-layout.travelX, layout.travelX],
    ],
  );

  useBeforePhysicsStep(() => {
    const stiffness = useGameStore.getState().settings.gantryDriveStiffness;
    const bridge = bridgeJoint.current;
    const trolley = trolleyJoint.current;
    if (bridge) {
      bridge.configureMotorModel(MotorModel.ForceBased);
      bridge.configureMotorVelocity(command.current.z, stiffness);
      // The joint is created once and never rebuilt, so resizing a wheel or rod
      // has to push the new travel through setLimits or the stop would not move.
      bridge.setLimits(-layout.travelZ, layout.travelZ);
    }
    if (trolley) {
      trolley.configureMotorModel(MotorModel.ForceBased);
      trolley.configureMotorVelocity(command.current.x, stiffness);
      trolley.setLimits(-layout.travelX, layout.travelX);
    }
  });

  return null;
}

export default function GantryMechanism({
  bridgeRef,
  trolleyRef,
  drumRef,
  command,
  children,
}: GantryMechanismProps) {
  const debug = useGameStore((state) => state.debug);
  const specs = useClawSpecStore((state) => state.specs);
  const layout = useMemo(() => createGantryGeometry(specs), [specs]);
  const railAnchorRef = useRef<RapierRigidBody>(null);

  const rodZ = SIDES.map((side) => side * layout.rodSpacingZ);
  const axleX = SIDES.map((side) => side * layout.trolleyWheelSpacingX);
  const wheelZ = SIDES.map((side) => side * BRIDGE.wheelZ);

  // Heights local to each body.
  const tieLocalY = layout.tieY - BRIDGE.y;
  const plateBottom = -layout.rodRadius - 0.02;
  const plateTop = tieLocalY + layout.rodRadius + 0.02;
  const plateHeight = plateTop - plateBottom;
  const plateCentre = plateBottom + plateHeight / 2;

  const trolleyAxleY = layout.trolleyWheelY - TROLLEY.y;
  const carriageTop = TROLLEY.size / 2;
  const yokeTop = trolleyAxleY + 0.025;
  const yokeBottom = carriageTop - 0.03;
  const yokeHeight = yokeTop - yokeBottom;

  return (
    <>
      <RigidBody
        ref={railAnchorRef}
        type="fixed"
        colliders={false}
        position={[0, BRIDGE.y, 0]}
        name="gantry-rail-anchor"
      />
      <SideRails showVisuals={!debug} layout={layout} />

      <RigidBody
        ref={bridgeRef}
        colliders={false}
        position={[0, BRIDGE.y, 0]}
        canSleep={false}
        name="gantry-bridge"
      >
        {rodZ.map((z) => (
          <CylinderCollider
            key={`rod-${z}`}
            args={[layout.rodSpan / 2, layout.rodRadius]}
            position={[0, 0, z]}
            rotation={ALONG_X}
            mass={BRIDGE.mass * 0.35}
            friction={0.2}
            restitution={0}
            collisionGroups={GANTRY_COLLISION_GROUPS}
          />
        ))}
        <CylinderCollider
          args={[layout.rodSpan / 2, layout.rodRadius]}
          position={[0, tieLocalY, 0]}
          rotation={ALONG_X}
          mass={BRIDGE.mass * 0.15}
          friction={0.2}
          restitution={0}
          collisionGroups={GANTRY_COLLISION_GROUPS}
        />
        {SIDES.map((side) => (
          <CuboidCollider
            key={`plate-${side}`}
            args={[
              layout.endPlate.thickness / 2,
              plateHeight / 2,
              layout.endPlate.depth / 2,
            ]}
            position={[side * layout.endPlateX, plateCentre, 0]}
            mass={BRIDGE.mass * 0.075}
            friction={0.2}
            restitution={0}
            collisionGroups={GANTRY_COLLISION_GROUPS}
          />
        ))}

        <group name="gantry-bridge-render-meshes" visible={!debug}>
          {rodZ.map((z) => (
            <mesh key={z} castShadow position={[0, 0, z]} rotation={ALONG_X}>
              <cylinderGeometry
                args={[layout.rodRadius, layout.rodRadius, layout.rodSpan, 20]}
              />
              <meshStandardMaterial {...STEEL} />
            </mesh>
          ))}
          {/* Third rod above the pair, stiffening the frame and carrying the
              front rail wheels on brackets at its ends. */}
          <mesh castShadow position={[0, tieLocalY, 0]} rotation={ALONG_X}>
            <cylinderGeometry
              args={[
                layout.rodRadius,
                layout.rodRadius,
                layout.rodSpan,
                18,
              ]}
            />
            <meshStandardMaterial {...STEEL} />
          </mesh>

          {SIDES.map((side) => (
            <group key={side}>
              {/* The plate bolts against the wheels' inboard faces rather than
                  passing through their centres. */}
              <mesh
                castShadow
                position={[side * layout.endPlateX, plateCentre, 0]}
              >
                <boxGeometry
                  args={[
                    layout.endPlate.thickness,
                    plateHeight,
                    layout.endPlate.depth,
                  ]}
                />
                <meshStandardMaterial {...DARK_STEEL} />
              </mesh>
              {/* Front wheel fore, rear wheel aft: the Z spread between them is
                  the bridge's anti-tip base. Each hangs off a stub axle
                  projecting outboard from the plate face. */}
              {wheelZ.map((z) => (
                <group key={z}>
                  <mesh
                    castShadow
                    position={[
                      side * (layout.stubAxleX + layout.wheel.width / 2),
                      tieLocalY,
                      z,
                    ]}
                    rotation={ALONG_X}
                  >
                    <cylinderGeometry
                      args={[
                        0.016,
                        0.016,
                        layout.wheel.width + 0.03,
                        12,
                      ]}
                    />
                    <meshStandardMaterial {...STEEL} />
                  </mesh>
                  <GroovedWheel
                    position={[side * layout.railX, tieLocalY, z]}
                    rotation={ALONG_X}
                    spec={layout.wheel}
                  />
                </group>
              ))}
            </group>
          ))}
        </group>
      </RigidBody>

      <RigidBody
        ref={trolleyRef}
        colliders={false}
        position={[0, TROLLEY.y, 0]}
        canSleep={false}
        name="gantry-trolley"
      >
        <CuboidCollider
          args={[TROLLEY.size / 2, TROLLEY.size / 2, TROLLEY.size / 2]}
          mass={TROLLEY.mass}
          friction={0.3}
          restitution={0}
          collisionGroups={GANTRY_COLLISION_GROUPS}
        />
        <group name="trolley-render-meshes" visible={!debug}>
          <mesh castShadow name="trolley-body-cube">
            <boxGeometry args={[TROLLEY.size, TROLLEY.size, TROLLEY.size]} />
            <meshStandardMaterial
              color="#242724"
              metalness={0.68}
              roughness={0.3}
            />
          </mesh>
          <mesh castShadow position={[0, 0.01, TROLLEY.size / 2 + 0.006]}>
            <boxGeometry args={[0.72, 0.22, 0.035]} />
            <meshStandardMaterial
              color="#111311"
              metalness={0.35}
              roughness={0.48}
            />
          </mesh>

          {/* One yoke plate, on the centreline between the two rods and inboard
              of the wheels, carrying both axles. */}
          <mesh castShadow position={[0, yokeBottom + yokeHeight / 2, 0]}>
            <boxGeometry
              args={[TROLLEY.yoke.width, yokeHeight, TROLLEY.yoke.thickness]}
            />
            <meshStandardMaterial {...DARK_STEEL} />
          </mesh>
          {axleX.map((x) => (
            <group key={x}>
              <mesh
                castShadow
                position={[x, trolleyAxleY, 0]}
                rotation={ALONG_Z}
              >
                <cylinderGeometry
                  args={[0.014, 0.014, layout.rodSpacingZ * 2 + 0.08, 12]}
                />
                <meshStandardMaterial {...STEEL} />
              </mesh>
              {rodZ.map((z) => (
                <GroovedWheel
                  key={z}
                  position={[x, trolleyAxleY, z]}
                  rotation={ALONG_Z}
                  spec={layout.wheel}
                />
              ))}
            </group>
          ))}

          <mesh castShadow position={[-0.16, 0.14, 0]}>
            <boxGeometry args={[0.24, 0.2, 0.34]} />
            <meshStandardMaterial
              color="#353733"
              metalness={0.72}
              roughness={0.3}
            />
          </mesh>
          <mesh
            ref={drumRef}
            castShadow
            position={[0.08, 0.01, 0]}
            rotation={ALONG_Z}
          >
            <cylinderGeometry args={[0.13, 0.13, 0.26, 18]} />
            <meshStandardMaterial
              color="#d5b76f"
              metalness={0.85}
              roughness={0.22}
            />
          </mesh>
        </group>
        {children}
      </RigidBody>

      <GantryAxes
        railAnchorRef={railAnchorRef}
        bridgeRef={bridgeRef}
        trolleyRef={trolleyRef}
        command={command}
        layout={layout}
      />
    </>
  );
}
