"use client";

import { Canvas } from "@react-three/fiber";
import {
  ContactShadows,
  Environment,
  Lightformer,
  OrbitControls,
} from "@react-three/drei";
import SceneContent from "./MachineScene";

function StudioEnvironment() {
  return (
    <Environment resolution={128}>
      <Lightformer
        form="rect"
        intensity={3.4}
        position={[0, 5, -6]}
        scale={[8, 4, 1]}
      />
      <Lightformer
        form="rect"
        intensity={2.2}
        position={[-5, 2, 1]}
        rotation={[0, Math.PI / 2, 0]}
        scale={[5, 3, 1]}
      />
      <Lightformer
        form="ring"
        intensity={2.8}
        position={[4, 4, 4]}
        scale={2.5}
      />
    </Environment>
  );
}

export default function GameCanvas() {
  return (
    <Canvas
      shadows
      dpr={[1, 1.5]}
      camera={{ position: [6.9, 5.15, 7.8], fov: 38 }}
      gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
      aria-label="드래그로 회전하고 휠 또는 핀치로 확대할 수 있는 3D 인형뽑기 머신"
    >
      <OrbitControls
        makeDefault
        target={[0, 1.65, 0]}
        enableDamping
        dampingFactor={0.08}
        enablePan={false}
        minDistance={6.4}
        maxDistance={13}
        minPolarAngle={Math.PI * 0.16}
        maxPolarAngle={Math.PI * 0.49}
        rotateSpeed={0.62}
        zoomSpeed={0.72}
      />
      <StudioEnvironment />
      <SceneContent />
      <ContactShadows
        position={[0, -0.25, 0]}
        opacity={0.28}
        scale={9}
        blur={2.4}
        far={4}
      />
    </Canvas>
  );
}
