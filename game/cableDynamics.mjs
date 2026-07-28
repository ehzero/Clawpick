function length3(vector) {
  return Math.hypot(vector.x, vector.y, vector.z);
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function computeCableConstraint({
  anchor,
  attachment,
  anchorVelocity,
  attachmentVelocity,
  targetLength,
  stiffness,
  damping,
  maxTension = 520,
}) {
  const offset = {
    x: anchor.x - attachment.x,
    y: anchor.y - attachment.y,
    z: anchor.z - attachment.z,
  };
  const distance = Math.max(0.000001, length3(offset));
  const direction = {
    x: offset.x / distance,
    y: offset.y / distance,
    z: offset.z / distance,
  };
  const relativeVelocity = {
    x: anchorVelocity.x - attachmentVelocity.x,
    y: anchorVelocity.y - attachmentVelocity.y,
    z: anchorVelocity.z - attachmentVelocity.z,
  };
  const stretchRate =
    relativeVelocity.x * direction.x +
    relativeVelocity.y * direction.y +
    relativeVelocity.z * direction.z;
  const extension = distance - targetLength;
  const tension =
    extension > 0
      ? clamp(
          extension * stiffness +
            Math.max(0, stretchRate) * damping,
          0,
          maxTension,
        )
      : 0;
  const horizontalDistance = Math.hypot(offset.x, offset.z);
  const verticalDistance = Math.max(0.000001, Math.abs(offset.y));

  return {
    distance,
    extension,
    stretchRate,
    tension,
    swingAngle:
      Math.atan2(horizontalDistance, verticalDistance) * (180 / Math.PI),
    direction,
    force: {
      x: direction.x * tension,
      y: direction.y * tension,
      z: direction.z * tension,
    },
  };
}
