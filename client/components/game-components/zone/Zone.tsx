import React, { useEffect, useState } from 'react';
import * as THREE from 'three';

interface MapBoundaryProps {
    color?: string;
    emissiveIntensity?: number;
    wallHeight?: number;
    wallThickness?: number;
    mapSize?: number; // total width and length (assumes square)
}

export const Zone: React.FC<MapBoundaryProps> = ({
    color = 'red',
    emissiveIntensity = 1,
    wallHeight = 200,
    wallThickness = 2,
    mapSize = 1000,
}) => {
    const [currentMapSize, setCurrentMapSize] = useState(mapSize);

    useEffect(() => {
        if (currentMapSize <= 0) return;
        const interval = setInterval(() => {
            setCurrentMapSize((prev) => (prev > 10 ? prev - 0.1 : 0));
        }, 100);
        return () => clearInterval(interval);
    }, [currentMapSize]);

    const halfMap = currentMapSize / 2;

    const materialProps: THREE.MeshStandardMaterialParameters = {
        color,
        emissive: color,
        emissiveIntensity,
        transparent: true,
    };

    return (
        <>
            {/* Front and Back Walls */}
            <mesh position={[0, wallHeight / 4, -halfMap]}>
                <boxGeometry args={[currentMapSize, wallHeight, wallThickness]} />
                <meshStandardMaterial {...materialProps} />
            </mesh>
            <mesh position={[0, wallHeight / 4, halfMap]}>
                <boxGeometry args={[currentMapSize, wallHeight, wallThickness]} />
                <meshStandardMaterial {...materialProps} />
            </mesh>

            {/* Left and Right Walls */}
            <mesh position={[-halfMap, wallHeight / 4, 0]}>
                <boxGeometry args={[wallThickness, wallHeight, currentMapSize]} />
                <meshStandardMaterial {...materialProps} />
            </mesh>
            <mesh position={[halfMap, wallHeight / 4, 0]}>
                <boxGeometry args={[wallThickness, wallHeight, currentMapSize]} />
                <meshStandardMaterial {...materialProps} />
            </mesh>
        </>
    );
};
