// systems/checkCollisions.ts
import {
  Vector3,
  Box3,
  Sphere,
  Mesh,
  SphereGeometry,
  CylinderGeometry,
  Matrix4,
} from "three";

export type CollisionType = "box" | "sphere" | "cylinder-side" | "cylinder-top" | "cylinder-bottom" | "";

export interface CollisionResult {
  isColliding: boolean;
  collisionType: CollisionType;
  collisionNormal: Vector3 | null;
}

export function checkCollisions(
  playerPosition: Vector3,
  obstacles: any
): CollisionResult {
  const playerBox = new Box3().setFromCenterAndSize(playerPosition, new Vector3(1, 2, 1));
  const playerSphere = new Sphere(playerPosition.clone(), 1.5);

  const playerCenter = new Vector3();
  playerBox.getCenter(playerCenter);

  for (const obstacle of obstacles) {
    if (!obstacle) continue;

    const isObstacleSphere = obstacle.geometry instanceof SphereGeometry;
    const isObstacleCylinder = obstacle.geometry instanceof CylinderGeometry;

    if (isObstacleSphere) {
      const obstaclePosition = obstacle.position.clone();
      const obstacleRadius = obstacle.geometry.parameters.radius * obstacle.scale.x;

      const distance = playerCenter.distanceTo(obstaclePosition);
      const minDistance = playerSphere.radius + obstacleRadius;

      if (distance < minDistance) {
        const normal = new Vector3().subVectors(playerCenter, obstaclePosition).normalize();
        return {
          isColliding: true,
          collisionType: "sphere",
          collisionNormal: normal,
        };
      }
    }

    else if (isObstacleCylinder) {
      const obstaclePosition = new Vector3();
      obstacle.getWorldPosition(obstaclePosition);

      const obstacleScale = new Vector3();
      obstacle.getWorldScale(obstacleScale);

      const radiusTop = obstacle.geometry.parameters.radiusTop;
      const radiusBottom = obstacle.geometry.parameters.radiusBottom || radiusTop;

      const radius = Math.max(radiusTop, radiusBottom) * Math.max(obstacleScale.x, obstacleScale.z);
      const height = obstacle.geometry.parameters.height * obstacleScale.y;

      const cylinderMatrix = obstacle.matrixWorld.clone();
      const cylinderUpVector = new Vector3(0, 1, 0).applyMatrix4(
        new Matrix4().extractRotation(cylinderMatrix)
      ).normalize();

      const cylinderCenter = obstaclePosition.clone();
      const cylinderEnd1 = cylinderCenter.clone().addScaledVector(cylinderUpVector, height / 2);
      const cylinderEnd2 = cylinderCenter.clone().addScaledVector(cylinderUpVector, -height / 2);

      const toPlayer = new Vector3().subVectors(playerCenter, cylinderEnd1);
      const axisLine = new Vector3().subVectors(cylinderEnd2, cylinderEnd1);
      const axisLength = axisLine.length();
      const axisNormalized = axisLine.clone().normalize();

      const projectionLength = toPlayer.dot(axisNormalized);
      const projectionPoint = cylinderEnd1.clone().addScaledVector(axisNormalized, projectionLength);

      const withinLength = projectionLength >= 0 && projectionLength <= axisLength;

      if (withinLength) {
        const dist = playerCenter.distanceTo(projectionPoint);
        if (dist < radius + playerSphere.radius) {
          const normal = new Vector3().subVectors(playerCenter, projectionPoint).normalize();
          return {
            isColliding: true,
            collisionType: "cylinder-side",
            collisionNormal: normal,
          };
        }
      } else {
        const endPoint = projectionLength < 0 ? cylinderEnd1 : cylinderEnd2;
        const distToEnd = playerCenter.distanceTo(endPoint);

        if (distToEnd < radius + playerSphere.radius) {
          const normal = new Vector3().subVectors(playerCenter, endPoint).normalize();
          return {
            isColliding: true,
            collisionType: projectionLength < 0 ? "cylinder-top" : "cylinder-bottom",
            collisionNormal: normal,
          };
        }
      }
    }

    else {
      const obstacleBox = new Box3().setFromObject(obstacle);

      if (playerBox.intersectsBox(obstacleBox)) {
        const obstacleCenter = new Vector3();
        obstacleBox.getCenter(obstacleCenter);

        const playerMin = playerBox.min;
        const playerMax = playerBox.max;
        const obstacleMin = obstacleBox.min;
        const obstacleMax = obstacleBox.max;

        const overlapX = Math.min(playerMax.x - obstacleMin.x, obstacleMax.x - playerMin.x);
        const overlapY = Math.min(playerMax.y - obstacleMin.y, obstacleMax.y - playerMin.y);
        const overlapZ = Math.min(playerMax.z - obstacleMin.z, obstacleMax.z - playerMin.z);

        const normal = new Vector3();
        if (overlapX <= overlapY && overlapX <= overlapZ) {
          normal.set(Math.sign(playerCenter.x - obstacleCenter.x), 0, 0);
        } else if (overlapY <= overlapX && overlapY <= overlapZ) {
          normal.set(0, Math.sign(playerCenter.y - obstacleCenter.y), 0);
        } else {
          normal.set(0, 0, Math.sign(playerCenter.z - obstacleCenter.z));
        }

        return {
          isColliding: true,
          collisionType: "box",
          collisionNormal: normal,
        };
      }
    }
  }

  return {
    isColliding: false,
    collisionType: "",
    collisionNormal: null,
  };
}
