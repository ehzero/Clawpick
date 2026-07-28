"use client";

import { Canvas } from "@react-three/fiber";
import { ContactShadows, OrbitControls } from "@react-three/drei";
import SceneContent from "./MachineScene";

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
