export const RETRACTED_CABLE_LENGTH = 0.01;
export const CLAW_FLOOR_CLEARANCE = 0.01;

export function calculateMaximumCableLength({
  wireExitY,
  housingAttachmentY,
  openClawLowestY,
  floorY,
  clearance = CLAW_FLOOR_CLEARANCE,
}) {
  const extendedLength =
    wireExitY -
    housingAttachmentY +
    openClawLowestY -
    (floorY + clearance);
  return Math.max(RETRACTED_CABLE_LENGTH, extendedLength);
}
