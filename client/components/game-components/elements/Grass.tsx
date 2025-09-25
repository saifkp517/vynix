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
    count = 60000,
    radius = 120,
    playerCenterRef,
    windStrength = 0.15,
    windSpeed = 0.3,
    hidePlayerRadius = 0,
    getGroundHeight
}: TallGrassProps) => {

    if (!playerCenterRef?.current) return null;


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

    // Chunk management
    const numChunks = 64;
    const chunkSize = Math.ceil(count / numChunks);
    const currentChunkIndex = useRef(0);
    const chunksToUpdatePerFrame = 2; // Update 2 chunks per frame for ~30k updates/sec at 60 FPS

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

    // Simplex noise for wind animation
    const noise = useMemo(() => new SimplexNoise(), []);

    // Modified distributeDenseGrass to support chunked initialization
    const distributeDenseGrass = (placedCount: { value: number }, maxCount: number, chunkIndex: number) => {
        const startIndex = chunkIndex * chunkSize;
        const endIndex = Math.min((chunkIndex + 1) * chunkSize, maxCount);
        const matrix = new THREE.Matrix4();
        const position = new THREE.Vector3();
        const rotation = new THREE.Euler();
        const quaternion = new THREE.Quaternion();
        const scale = new THREE.Vector3();

        const cellSize = Math.sqrt((Math.PI * radius * radius) / (count * 1));
        const gridSize = Math.ceil((radius * 2) / cellSize);
        const halfGrid = gridSize / 2;
        const grid: boolean[][] = Array(gridSize).fill(0).map(() => Array(gridSize).fill(false));

        // Distribute grass blades for the specified chunk
        for (let i = startIndex; i < endIndex && placedCount.value < maxCount; i++) {
            const theta = Math.random() * Math.PI * 2;
            const dist = Math.sqrt(Math.random()) * radius;

            const worldX = centerRef.current.x + dist * Math.cos(theta);
            const worldZ = centerRef.current.z + dist * Math.sin(theta);

            const gx = Math.floor((worldX - centerRef.current.x) / cellSize + halfGrid);
            const gz = Math.floor((worldZ - centerRef.current.z) / cellSize + halfGrid);

            if (gx < 0 || gx >= gridSize || gz < 0 || gz >= gridSize) continue;
            if (grid[gx][gz] && Math.random() > 0.1) continue;

            position.set(worldX, getGroundHeight(worldX, worldZ), worldZ);
            rotation.set(
                Math.random() * 0.2 - 0.1,
                Math.random() * Math.PI * 2,
                Math.random() * 0.2 - 0.1
            );
            quaternion.setFromEuler(rotation);

            const grassHeight = 2.8 + Math.random() * 1.4;
            const grassWidth = 0.2 + Math.random() * 0.3;
            scale.set(grassWidth, grassHeight, 1);

            originalPositions[i].copy(position);
            originalRotations[i].copy(rotation);
            originalScales[i].copy(scale);

            matrix.compose(position, quaternion, scale);
            matrices[i].copy(matrix);

            if (instancedMeshRef.current) {
                instancedMeshRef.current.setMatrixAt(i, matrix);
            }
            grid[gx][gz] = true;
            placedCount.value++;
        }
    };

    // Update chunk with wind animation and player hiding
    const updateChunk = (chunkIndex: number) => {
        const startIndex = chunkIndex * chunkSize;
        const endIndex = Math.min((chunkIndex + 1) * chunkSize, count);
        const matrix = new THREE.Matrix4();
        const quaternion = new THREE.Quaternion();

        for (let i = startIndex; i < endIndex; i++) {
            const position = originalPositions[i].clone();
            const rotation = originalRotations[i].clone();
            const scale = originalScales[i].clone();

            // Apply wind animation using 2D noise
            const windOffset = noise.noise(
                position.x * 0.1 + time.current * windSpeed,
                position.z * 0.1 + time.current * windSpeed
            ) * windStrength;
            rotation.x += windOffset;
            rotation.z += windOffset * 0.5;

            // Apply player hiding radius
            if (hidePlayerRadius > 0 && playerCenterRef.current) {
                const distToPlayer = position.distanceTo(playerCenterRef.current);
                if (distToPlayer < hidePlayerRadius) {
                    const scaleFactor = Math.max(0.1, 1 - distToPlayer / hidePlayerRadius);
                    scale.y *= scaleFactor;
                }
            }

            quaternion.setFromEuler(rotation);
            matrix.compose(position, quaternion, scale);
            matrices[i].copy(matrix);

            if (instancedMeshRef.current) {
                instancedMeshRef.current.setMatrixAt(i, matrix);
            }
        }
    };

    // Modified scheduleRedistribution for chunked updates
    const scheduleRedistribution = () => {
        if (redistributionTimeoutRef.current) {
            clearTimeout(redistributionTimeoutRef.current);
        }

        setIsRedistributing(true);
        currentChunkIndex.current = 0; // Reset chunk index for redistribution

        const redistributeNextChunk = () => {
            if (currentChunkIndex.current < numChunks) {
                const placedCount = { value: currentChunkIndex.current * chunkSize };
                distributeDenseGrass(placedCount, count, currentChunkIndex.current);
                currentChunkIndex.current++;
                if (instancedMeshRef.current) {
                    instancedMeshRef.current.instanceMatrix.needsUpdate = true;
                }
                redistributionTimeoutRef.current = setTimeout(redistributeNextChunk, 0);
            } else {
                lastCenterRef.current.copy(centerRef.current);
                setIsRedistributing(false);
            }
        };

        redistributeNextChunk();
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

        // FPS calculation
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

        // Initial distribution
        if (!isGrassInitialized.current) {
            const placedCount = { value: 0 };
            distributeDenseGrass(placedCount, count, 0); // Initialize first chunk
            currentChunkIndex.current = 1;
            isGrassInitialized.current = true;
            lastCenterRef.current.copy(centerRef.current);
            instancedMeshRef.current.instanceMatrix.needsUpdate = true;
        }

        // Check if redistribution is needed
        if (!isRedistributing && lastCenterRef.current.distanceToSquared(centerRef.current) > 15 * 15) {
            console.log("distribution needed")

            scheduleRedistribution();
        }

        // Update chunks for wind and player hiding
        if (!isRedistributing) {
            for (let i = 0; i < chunksToUpdatePerFrame; i++) {
                updateChunk(currentChunkIndex.current);
                currentChunkIndex.current = (currentChunkIndex.current + 1) % numChunks;
            }
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