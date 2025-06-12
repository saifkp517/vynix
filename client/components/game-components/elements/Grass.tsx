import { memo, useRef, useMemo, useEffect, RefObject, useState } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { SimplexNoise } from 'three-stdlib';

type TallGrassProps = {
    count?: number;
    radius?: number;
    playerCenterRef: RefObject<THREE.Vector3>;
    windStrength?: number;
    windSpeed?: number;
    hidePlayerRadius?: number;
    getGroundHeight: (x: number, z: number) => number;
};

const TallGrass = memo(({
    count = 80000,
    radius = 50,
    playerCenterRef,
    windStrength = 0.15,
    windSpeed = 0.3,
    hidePlayerRadius = 0,
    getGroundHeight
}: TallGrassProps) => {

    if (!playerCenterRef?.current) return null;

    console.log("grass test rendered")

    const centerRef = useRef<THREE.Vector3>(playerCenterRef.current.clone() ?? new THREE.Vector3());
    const instancedMeshRef = useRef<THREE.InstancedMesh | null>(null);
    const time = useRef(0);
    const lastTime = useRef(performance.now());
    const fpsLastTime = useRef(performance.now());
    const framesSinceLast = useRef(0);
    const measuredFPS = useRef(60);
    const isGrassInitialized = useRef(false);
    const placedCountRef = useRef({ value: 0 });
    const lastCenterRef = useRef<THREE.Vector3>(centerRef.current.clone());
    
    // Add state to control when redistribution should happen
    const [isRedistributing, setIsRedistributing] = useState(false);
    const redistributionTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    // Create grass geometry
    const grassGeometry = useMemo(() => {
        const geo = new THREE.BufferGeometry();
        const heightSegments = 4;
        const widthSegments = 4;

        const vertices = [];
        const indices = [];
        const colors = [];

        const colorSets = [
            {
                top: new THREE.Color(0x91e160),
                bottom: new THREE.Color(0x0a2000),
                tip: new THREE.Color(0xc4e17f)
            },
            {
                top: new THREE.Color(0x7bc44c),
                bottom: new THREE.Color(0x0a2000),
                tip: new THREE.Color(0xb5d279)
            },
            {
                top: new THREE.Color(0xa5ea6e),
                bottom: new THREE.Color(0x0a2000),
                tip: new THREE.Color(0xd3eaa0)
            }
        ];

        const colorSet = colorSets[Math.floor(Math.random() * colorSets.length)];

        for (let h = 0; h <= heightSegments; h++) {
            const y = h / heightSegments;
            const widthScale = 1 - Math.pow(y, 2);
            const bendFactor = Math.pow(y, 2) * 0.3;
            const xCurve = Math.sin(y * Math.PI) * bendFactor;
            const zTwist = y * y * 0.07 * Math.sin(y * Math.PI * 2);

            for (let w = 0; w <= widthSegments; w++) {
                const x = (w / widthSegments - 0.5) * 0.65 * widthScale + xCurve;
                const z = zTwist * (w / widthSegments - 0.5);

                vertices.push(x, y, z);

                if (y > 0.8) {
                    const color = new THREE.Color().lerpColors(colorSet.top, colorSet.tip, (y - 0.8) / 0.2);
                    colors.push(color.r, color.g, color.b);
                } else {
                    const color = new THREE.Color().lerpColors(colorSet.bottom, colorSet.top, y);
                    colors.push(color.r, color.g, color.b);
                }
            }
        }

        for (let h = 0; h < heightSegments; h++) {
            for (let w = 0; w < widthSegments; w++) {
                const first = h * (widthSegments + 1) + w;
                const second = first + (widthSegments + 1);

                indices.push(first, second, first + 1);
                indices.push(second, second + 1, first + 1);
            }
        }

        geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        geo.setIndex(indices);
        geo.computeVertexNormals();

        return geo;
    }, []);

    const grassMaterial = useMemo(() => {
        return new THREE.MeshStandardMaterial({
            vertexColors: true,
            side: THREE.DoubleSide,
            roughness: 0.8,
            metalness: 0.1,
            emissive: new THREE.Color(0x0a3302),
            emissiveIntensity: 0.05,
        });
    }, []);

    const matrices = useMemo(() => Array.from({ length: count }, () => new THREE.Matrix4()), [count]);
    const originalPositions = useMemo(() => Array.from({ length: count }, () => new THREE.Vector3()), [count]);
    const originalRotations = useMemo(() => Array.from({ length: count }, () => new THREE.Euler()), [count]);
    const originalScales = useMemo(() => Array.from({ length: count }, () => new THREE.Vector3()), [count]);

    // Debounced redistribution function
    const scheduleRedistribution = () => {
        if (redistributionTimeoutRef.current) {
            clearTimeout(redistributionTimeoutRef.current);
        }

        setIsRedistributing(true);
        
        redistributionTimeoutRef.current = setTimeout(() => {
            const placedCount = { value: 0 };
            distributeDenseGrass(placedCount, count);
            
            if (instancedMeshRef.current) {
                instancedMeshRef.current.instanceMatrix.needsUpdate = true;
            }
            
            lastCenterRef.current.copy(centerRef.current);
            setIsRedistributing(false);
        }, 100); // 100ms delay to prevent frequent updates
    };

    const distributeDenseGrass = (placedCount: { value: number }, maxCount: number) => {
        const matrix = new THREE.Matrix4();
        const position = new THREE.Vector3();
        const rotation = new THREE.Euler();
        const quaternion = new THREE.Quaternion();
        const scale = new THREE.Vector3();

        const cellSize = Math.sqrt((Math.PI * radius * radius) / (count * 1));
        const gridSize = Math.ceil((radius * 2) / cellSize);
        const halfGrid = gridSize / 2;
        const grid: boolean[][] = Array(gridSize).fill(0).map(() => Array(gridSize).fill(false));

        // First pass - systematic grid placement
        for (let gx = 0; gx < gridSize && placedCount.value < maxCount; gx++) {
            for (let gz = 0; gz < gridSize && placedCount.value < maxCount; gz++) {
                const worldX = centerRef.current.x + (gx - halfGrid) * cellSize + (Math.random() * 0.6 - 0.3) * cellSize;
                const worldZ = centerRef.current.z + (gz - halfGrid) * cellSize + (Math.random() * 0.6 - 0.3) * cellSize;

                const distSq = Math.pow(worldX - centerRef.current.x, 2) + Math.pow(worldZ - centerRef.current.z, 2);
                if (distSq > radius * radius) continue;

                position.set(worldX, 0, worldZ);
                placeGrassBlade(position, placedCount);
                grid[gx][gz] = true;
            }
        }

        // Second pass - fill remaining blades
        if (placedCount.value < maxCount) {
            const maxAttempts = maxCount * 5;
            for (let i = 0; i < maxAttempts && placedCount.value < maxCount; i++) {
                const theta = Math.random() * Math.PI * 2;
                const dist = Math.sqrt(Math.random()) * radius;

                const worldX = centerRef.current.x + dist * Math.cos(theta);
                const worldZ = centerRef.current.z + dist * Math.sin(theta);

                const gx = Math.floor((worldX - centerRef.current.x) / cellSize + halfGrid);
                const gz = Math.floor((worldZ - centerRef.current.z) / cellSize + halfGrid);

                if (gx < 0 || gx >= gridSize || gz < 0 || gz >= gridSize) continue;
                if (grid[gx][gz] && Math.random() > 0.1) continue;

                position.set(worldX, 0, worldZ);
                placeGrassBlade(position, placedCount);
                grid[gx][gz] = true;
            }
        }

        function placeGrassBlade(position: THREE.Vector3, placedCount: { value: number }) {
            if (placedCount.value >= count) return;

            position.y = getGroundHeight(position.x, position.z);
            rotation.set(
                (Math.random() * 0.2 - 0.1),
                Math.random() * Math.PI * 2,
                (Math.random() * 0.2 - 0.1)
            );
            quaternion.setFromEuler(rotation);

            const grassHeight = 2.8 + Math.random() * 1.4;
            const grassWidth = 0.2 + Math.random() * 0.3;
            scale.set(grassWidth, grassHeight, 1);

            originalPositions[placedCount.value].copy(position);
            originalRotations[placedCount.value].copy(rotation);
            originalScales[placedCount.value].copy(scale);

            matrix.compose(position, quaternion, scale);
            matrices[placedCount.value].copy(matrix);

            if (instancedMeshRef.current) {
                instancedMeshRef.current.setMatrixAt(placedCount.value, matrix);
            }
            placedCount.value++;
        }
    };

    // Cleanup timeout on unmount
    useEffect(() => {
        return () => {
            if (redistributionTimeoutRef.current) {
                clearTimeout(redistributionTimeoutRef.current);
            }
        };
    }, []);

    useFrame((state) => {
        if (!instancedMeshRef.current || !playerCenterRef.current) return;

        time.current += state.clock.elapsedTime * 0.0002;

        const now = performance.now();
        framesSinceLast.current++;
        if (now - fpsLastTime.current >= 1000) {
            measuredFPS.current = (framesSinceLast.current * 1000) / (now - fpsLastTime.current);
            fpsLastTime.current = now;
            framesSinceLast.current = 0;
        }
        lastTime.current = now;

        // Update centerRef if player moves significantly
        const distanceMoved = centerRef.current.distanceToSquared(playerCenterRef.current);
        if (distanceMoved > 15 * 15) {
            centerRef.current.copy(playerCenterRef.current);
        }

        // Check if redistribution is needed (but don't do it immediately)
        if (
            !isGrassInitialized.current ||
            (!isRedistributing && lastCenterRef.current.distanceToSquared(centerRef.current) > 15 * 15)
        ) {
            if (!isGrassInitialized.current) {
                // Initial distribution - do it immediately
                const placedCount = { value: 0 };
                distributeDenseGrass(placedCount, count);
                instancedMeshRef.current.instanceMatrix.needsUpdate = true;
                isGrassInitialized.current = true;
                lastCenterRef.current.copy(centerRef.current);
            } else {
                // Subsequent redistributions - use debounced approach
                scheduleRedistribution();
            }
        }

        // Only update instance matrix if not currently redistributing
        if (!isRedistributing) {
            instancedMeshRef.current.instanceMatrix.needsUpdate = true;
        }
    });

    return (
        <instancedMesh
            ref={instancedMeshRef}
            args={[grassGeometry, grassMaterial, count]}
            frustumCulled={false}
            castShadow
            receiveShadow
        />
    );
});

export default TallGrass;