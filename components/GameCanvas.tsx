"use client";

import { useEffect } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { ContactShadows } from "@react-three/drei";
import SceneContent from "./MachineScene";

function CameraSetup() {
  const camera = useThree((state) => state.camera);

  useEffect(() => {
    camera.lookAt(0, 1.65, 0);
    camera.updateProjectionMatrix();
  }, [camera]);

  return null;
}

export default function GameCanvas() {
  return (
    <Canvas
      shadows
      dpr={[1, 1.5]}
      camera={{ position: [6.9, 5.15, 7.8], fov: 38 }}
      gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
    >
      <CameraSetup />
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
