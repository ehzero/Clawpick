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
    velocity: {
      x: attachmentVelocity.x + direction.x * radialCorrection,
      y: attachmentVelocity.y + direction.y * radialCorrection,
      z: attachmentVelocity.z + direction.z * radialCorrection,
    },
  };
}

export function bodyVelocityForAttachmentTarget({
  bodyVelocity,
  attachmentVelocity,
  targetAttachmentVelocity,
}) {
  const rotationalVelocity = {
    x: attachmentVelocity.x - bodyVelocity.x,
    y: attachmentVelocity.y - bodyVelocity.y,
    z: attachmentVelocity.z - bodyVelocity.z,
  };

  return {
    x: targetAttachmentVelocity.x - rotationalVelocity.x,
    y: targetAttachmentVelocity.y - rotationalVelocity.y,
    z: targetAttachmentVelocity.z - rotationalVelocity.z,
  };
}

export function computeSuspensionTiltTorque({
  bodyUp,
  angularVelocity,
  swingDamping,
  softLimit = Math.PI / 10,
  hardLimit = (Math.PI * 5) / 36,
}) {
  const upLength = Math.max(
    0.000001,
    Math.hypot(bodyUp.x, bodyUp.y, bodyUp.z),
  );
  const normalizedUp = {
    x: bodyUp.x / upLength,
    y: bodyUp.y / upLength,
    z: bodyUp.z / upLength,
  };
  const tiltAngle = Math.acos(
    Math.min(1, Math.max(-1, normalizedUp.y)),
  );
  const axis = {
    x: -normalizedUp.z,
    y: 0,
    z: normalizedUp.x,
  };
  const axisLength = Math.hypot(axis.x, axis.z);
  const softExcess = Math.max(0, tiltAngle - softLimit);
  const hardExcess = Math.max(0, tiltAngle - hardLimit);
  const restoringMagnitude =
    softExcess * (0.8 + swingDamping * 0.6) +
    hardExcess * 3;
  const damping = 0.05 + swingDamping * 0.12;

  return {
    tiltAngle,
    torque: {
      x:
        (axisLength > 0.000001
          ? (axis.x / axisLength) * restoringMagnitude
          : 0) -
        angularVelocity.x * damping,
      y: 0,
      z:
        (axisLength > 0.000001
          ? (axis.z / axisLength) * restoringMagnitude
          : 0) -
        angularVelocity.z * damping,
    },
  };
}
