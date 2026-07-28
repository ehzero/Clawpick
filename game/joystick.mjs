const DIAGONAL_COMPONENT = Math.SQRT1_2;

const EIGHT_WAY_VECTORS = [
  { x: 1, z: 0 },
  { x: DIAGONAL_COMPONENT, z: DIAGONAL_COMPONENT },
  { x: 0, z: 1 },
  { x: -DIAGONAL_COMPONENT, z: DIAGONAL_COMPONENT },
  { x: -1, z: 0 },
  { x: -DIAGONAL_COMPONENT, z: -DIAGONAL_COMPONENT },
  { x: 0, z: -1 },
  { x: DIAGONAL_COMPONENT, z: -DIAGONAL_COMPONENT },
];

export function getEightWayInput(deltaX, deltaY, deadZone = 0) {
  if (Math.hypot(deltaX, deltaY) <= deadZone) {
    return { x: 0, z: 0, index: -1 };
  }

  const sector = Math.PI / 4;
  const index = (Math.round(Math.atan2(deltaY, deltaX) / sector) + 8) % 8;

  return { ...EIGHT_WAY_VECTORS[index], index };
}

export function clampJoystickOffset(deltaX, deltaY, maxDistance) {
  const distance = Math.hypot(deltaX, deltaY);

  if (distance === 0 || distance <= maxDistance) {
    return { x: deltaX, y: deltaY };
  }

  const scale = maxDistance / distance;
  return { x: deltaX * scale, y: deltaY * scale };
}
