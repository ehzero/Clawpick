function length3(vector) {
  return Math.hypot(vector.x, vector.y, vector.z);
}

export function measureInextensibleCable({
  anchor,
  attachment,
  targetLength,
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
  const lengthError = distance - targetLength;
  const horizontalDistance = Math.hypot(offset.x, offset.z);
  const verticalDistance = Math.max(0.000001, Math.abs(offset.y));

  return {
    distance,
    lengthError,
    slack: Math.max(0, -lengthError),
    overrun: Math.max(0, lengthError),
    swingAngle:
      Math.atan2(horizontalDistance, verticalDistance) * (180 / Math.PI),
    direction,
  };
}

export function projectInextensibleCableVelocity({
  direction,
  anchorVelocity,
  bodyLinearVelocity,
  attachmentVelocity,
  targetLengthRate,
}) {
  const relativeVelocity = {
    x: anchorVelocity.x - attachmentVelocity.x,
    y: anchorVelocity.y - attachmentVelocity.y,
    z: anchorVelocity.z - attachmentVelocity.z,
  };
  const stretchRate =
    relativeVelocity.x * direction.x +
    relativeVelocity.y * direction.y +
    relativeVelocity.z * direction.z;
  const radialCorrection = stretchRate - targetLengthRate;

  return {
    radialRateBefore: stretchRate,
    targetLengthRate,
    radialCorrection,
    attachmentVelocity: {
      x: attachmentVelocity.x + direction.x * radialCorrection,
      y: attachmentVelocity.y + direction.y * radialCorrection,
      z: attachmentVelocity.z + direction.z * radialCorrection,
    },
    bodyLinearVelocity: {
      x: bodyLinearVelocity.x + direction.x * radialCorrection,
      y: bodyLinearVelocity.y + direction.y * radialCorrection,
      z: bodyLinearVelocity.z + direction.z * radialCorrection,
    },
  };
}
