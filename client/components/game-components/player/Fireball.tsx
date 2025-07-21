import { useRef } from "react";
import { Vector3, Mesh, Box3 } from "three";
import { useFrame } from "@react-three/fiber";


interface FireballProps {
    position: Vector3;
    getGroundHeight: (x: number, z: number) => number;
    direction: Vector3;
    speed?: number;
    obstacles?: Mesh[];
    onExplode: (position: Vector3) => void;
};


export const Fireball: React.FC<FireballProps> = ({ position, getGroundHeight, direction, speed = 20, obstacles, onExplode }) => {
    const fireballRef = useRef<Mesh>(null);
    const startTime = useRef<number>(Date.now());

    const gravity = 9.8; // Gravity constant (adjust for desired arc height)



    useFrame(() => {
        if (!fireballRef.current) return;

        const elapsedTime = (Date.now() - startTime.current) / 1000;

        const initialPosition = fireballRef.current.position.clone();
        const initialVelocity = direction.clone().multiplyScalar(speed);

        // x and z are linear motion
        fireballRef.current.position.x = initialPosition.x + initialVelocity.x * elapsedTime;
        fireballRef.current.position.z = initialPosition.z + initialVelocity.z * elapsedTime;

        // y is affected by gravity (parabolic arc)
        fireballRef.current.position.y = initialPosition.y +
            initialVelocity.y * elapsedTime -
            0.5 * gravity * elapsedTime * elapsedTime;

        // Collision detection with ground and obstacles
        const fireballPosition = fireballRef.current.position.clone();


        if (fireballPosition.y <= getGroundHeight(fireballPosition.x, fireballPosition.z)) {
            onExplode(fireballPosition);
            return;
        }

        for (const obstacle of obstacles!) {

            const fireballBox = new Box3().setFromObject(fireballRef.current);
            const obstacleBox = new Box3().setFromObject(obstacle);


            const obstacleCenter = new Vector3();
            obstacleBox.getCenter(obstacleCenter);


            if (fireballBox.intersectsBox(obstacleBox)) {
                onExplode(fireballPosition);
                return;
            }
        }
    });

    return (
        <mesh ref={fireballRef} position={position} castShadow>
            <sphereGeometry args={[0.5, 16, 16]} />
            <meshStandardMaterial emissive={"orange"} emissiveIntensity={2} color="red" />
        </mesh>
    );
};