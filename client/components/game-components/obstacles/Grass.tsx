import { memo, useRef, useMemo, useEffect } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { SimplexNoise } from 'three-stdlib';

type TallGrassProps = {
    count?: number;
    radius?: number;
    center?: [number, number, number];
    windStrength?: number;
    windSpeed?: number;
    hidePlayerRadius?: number;
    getGroundHeight: (x: number, z: number) => number;
};

const TallGrass = memo(({
    count = 150000, // Maximum count for performance constraints
    radius = 150, // REDUCED radius to increase density
    center = [0, 0, 0],
    windStrength = 0.15,
    windSpeed = 0.3,
    hidePlayerRadius = 0, // Player radius
    getGroundHeight
}: TallGrassProps) => {
    const instancedMeshRef = useRef<THREE.InstancedMesh | null>(null);
    useThree();
    const time = useRef(0);
    const lastTime = useRef(performance.now());
    const fpsLastTime = useRef(performance.now());
    const framesSinceLast = useRef(0);
    const measuredFPS = useRef(60); // default to 60 initially

    // Create noise for natural grass distribution
    const noise = useMemo(() => new SimplexNoise(), []);

    // Create a MUCH WIDER grass blade geometry for maximum coverage
    const grassGeometry = useMemo(() => {
        // Create a custom 3D blade shape that's EXTRA wide for extreme coverage
        const geo = new THREE.BufferGeometry();

        // Balance detail and performance
        const heightSegments = 4;
        const widthSegments = 4; // Increased for better blade shape

        // Calculate vertices
        const vertices = [];
        const indices = [];
        const colors = [];

        // Create vertex colors for gradient effect with super dark base for better coverage
        const colorSets = [
            {
                top: new THREE.Color(0x91e160),      // Lighter green for top
                bottom: new THREE.Color(0x0a2000),   // DARKER green for bottom (better coverage)
                tip: new THREE.Color(0xc4e17f)       // Light tip color
            },
            {
                top: new THREE.Color(0x7bc44c),      // Slightly darker green
                bottom: new THREE.Color(0x0a2000),   // DARKER base (better coverage)
                tip: new THREE.Color(0xb5d279)       // Slightly darker tip
            },
            {
                top: new THREE.Color(0xa5ea6e),      // Brighter green
                bottom: new THREE.Color(0x0a2000),   // DARKER base (better coverage)
                tip: new THREE.Color(0xd3eaa0)       // Very light tip
            }
        ];

        // Choose a random color set for this blade
        const colorSet = colorSets[Math.floor(Math.random() * colorSets.length)];

        // Create blade vertices - WIDER blade for better coverage
        for (let h = 0; h <= heightSegments; h++) {
            const y = h / heightSegments; // Normalized height (0 to 1)

            // Calculate blade width - MUCH wider at base, still tapers but not as much
            const widthScale = 1 - Math.pow(y, 2); // LESS tapering

            // Add natural curve
            const bendFactor = Math.pow(y, 2) * 0.3;
            const xCurve = Math.sin(y * Math.PI) * bendFactor;

            // Add slight twist around y-axis as it goes up
            const zTwist = y * y * 0.07 * Math.sin(y * Math.PI * 2);

            // For each width segment - WIDER blade
            for (let w = 0; w <= widthSegments; w++) {
                const x = (w / widthSegments - 0.5) * 0.65 * widthScale + xCurve; // MUCH WIDER blade (0.65)
                const z = zTwist * (w / widthSegments - 0.5);

                // Add vertex
                vertices.push(x, y, z);

                // Add color gradient from bottom to top with selected color set
                if (y > 0.8) {
                    // Tip of blade is lightest
                    const color = new THREE.Color().lerpColors(colorSet.top, colorSet.tip, (y - 0.8) / 0.2);
                    colors.push(color.r, color.g, color.b);
                } else {
                    // Main blade gradient
                    const color = new THREE.Color().lerpColors(colorSet.bottom, colorSet.top, y);
                    colors.push(color.r, color.g, color.b);
                }
            }
        }

        // Create faces (triangles)
        for (let h = 0; h < heightSegments; h++) {
            for (let w = 0; w < widthSegments; w++) {
                const first = h * (widthSegments + 1) + w;
                const second = first + (widthSegments + 1);

                // First triangle
                indices.push(first, second, first + 1);

                // Second triangle
                indices.push(second, second + 1, first + 1);
            }
        }

        // Set attributes
        geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        geo.setIndex(indices);

        // Compute normals for proper lighting
        geo.computeVertexNormals();

        return geo;
    }, []);

    // Create material that uses vertex colors
    const grassMaterial = useMemo(() => {
        return new THREE.MeshStandardMaterial({
            vertexColors: true,
            side: THREE.DoubleSide,
            roughness: 0.8,
            metalness: 0.1,
            // Add subsurface scattering-like effect for realism
            emissive: new THREE.Color(0x0a3302),
            emissiveIntensity: 0.05,
        });
    }, []);

    // Store matrices for animation
    const matrices = useMemo(() => Array.from({ length: count }, () => new THREE.Matrix4()), [count]);
    const originalPositions = useMemo(() => Array.from({ length: count }, () => new THREE.Vector3()), [count]);
    const originalRotations = useMemo(() => Array.from({ length: count }, () => new THREE.Euler()), [count]);
    const originalScales = useMemo(() => Array.from({ length: count }, () => new THREE.Vector3()), [count]);

    // Even grass distribution - removed strategic patches in favor of uniform coverage
    useEffect(() => {
        if (!instancedMeshRef.current) return;

        const matrix = new THREE.Matrix4();
        const position = new THREE.Vector3();
        const rotation = new THREE.Euler();
        const quaternion = new THREE.Quaternion();
        const scale = new THREE.Vector3();

        // For tracking placed count
        const placedCount = { value: 0 };
        const targetCount = count;

        // ULTRA EVEN DISTRIBUTION - no patches, just pure density
        distributeDenseGrass(placedCount, targetCount);

        // Update the instance matrix buffer
        instancedMeshRef.current.instanceMatrix.needsUpdate = true;

        // Function to place grass with extreme density and evenness
        function distributeDenseGrass(placedCount: { value: number }, maxCount: number) {
            // Use a cellular-like grid approach for ultra-even distribution
            // Calculate cell size based on radius and blade count for maximum density
            const cellSize = Math.sqrt((Math.PI * radius * radius) / (maxCount * 1.5));

            // Create a grid-based distribution with jitter
            // This ensures even coverage while maintaining natural randomness
            const gridSize = Math.ceil((radius * 2) / cellSize);
            const halfGrid = gridSize / 2;

            // Create a grid with cell assignments to track filled positions
            const grid: boolean[][] = Array(gridSize).fill(0).map(() => Array(gridSize).fill(false));

            // First pass - systematic grid placement
            for (let gx = 0; gx < gridSize && placedCount.value < maxCount; gx++) {
                for (let gz = 0; gz < gridSize && placedCount.value < maxCount; gz++) {
                    // Convert grid position to world position
                    const worldX = center[0] + (gx - halfGrid) * cellSize + (Math.random() * 0.6 - 0.3) * cellSize;
                    const worldZ = center[2] + (gz - halfGrid) * cellSize + (Math.random() * 0.6 - 0.3) * cellSize;

                    // Check if in radius
                    const distSq = Math.pow(worldX - center[0], 2) + Math.pow(worldZ - center[2], 2);
                    if (distSq > radius * radius) continue;

                    // Place grass blade
                    position.set(worldX, 0, worldZ);

                    // Noise-based density factor - avoid gaps by using high acceptance threshold
                    const densityNoise = noise.noise(position.x * 0.05, position.z * 0.05);
                    if (densityNoise < -0.1) continue; // Very high threshold for maximum density

                    // Place the grass blade and mark cell as filled
                    placeGrassBlade(position, placedCount);
                    grid[gx][gz] = true;
                }
            }

            // Second pass - fill any remaining blades in empty spaces
            // Focus on filling gaps in the cellular pattern
            if (placedCount.value < maxCount) {
                // Try many positions to ensure we use all available count
                const maxAttempts = maxCount * 5;

                for (let i = 0; i < maxAttempts && placedCount.value < maxCount; i++) {
                    // Random position within circle
                    const theta = Math.random() * Math.PI * 2;
                    // Square root for uniform density across the circle
                    const dist = Math.sqrt(Math.random()) * radius;

                    const worldX = center[0] + dist * Math.cos(theta);
                    const worldZ = center[2] + dist * Math.sin(theta);

                    // Convert to grid cell
                    const gx = Math.floor((worldX - center[0]) / cellSize + halfGrid);
                    const gz = Math.floor((worldZ - center[2]) / cellSize + halfGrid);

                    // Check if cell is valid
                    if (gx < 0 || gx >= gridSize || gz < 0 || gz >= gridSize) continue;

                    // Prioritize filling empty cells
                    if (grid[gx][gz]) {
                        // Skip already filled cells most of the time
                        if (Math.random() > 0.1) continue;
                    }

                    // Place the grass blade
                    position.set(worldX, 0, worldZ);
                    placeGrassBlade(position, placedCount);
                    grid[gx][gz] = true;
                }
            }
        }

        // Helper function to place a single grass blade with extreme density settings
        function placeGrassBlade(position: THREE.Vector3, placedCount: { value: number }) {
            if (placedCount.value >= count) return;

            // Get height at this position
            position.y = getGroundHeight(position.x, position.z);

            // Random rotation around Y axis with slight tilt
            rotation.set(
                (Math.random() * 0.2 - 0.1),
                Math.random() * Math.PI * 2,
                (Math.random() * 0.2 - 0.1)
            );
            quaternion.setFromEuler(rotation);

            // WIDER, SHORTER blades for better ground coverage
            // Using shorter but wider blades creates more density per blade
            const grassHeight = 1.8 + Math.random() * 1.4; // Shorter (avg 2.9 vs 3.7)

            // MUCH wider blades for ultimate coverage
            const grassWidth = 0.4 + Math.random() * 0.3; // WAY wider (0.4-0.7 vs 0.25-0.35)

            scale.set(grassWidth, grassHeight, 1);

            // Store original transforms for animation
            originalPositions[placedCount.value].copy(position);
            originalRotations[placedCount.value].copy(rotation);
            originalScales[placedCount.value].copy(scale);

            // Combine transforms
            matrix.compose(position, quaternion, scale);
            matrices[placedCount.value].copy(matrix);

            // Apply to instance
            instancedMeshRef.current!.setMatrixAt(placedCount.value, matrix);

            // Increment count
            placedCount.value++;
        }

    }, [count, radius, center, hidePlayerRadius, getGroundHeight, matrices, originalPositions, originalRotations, originalScales, noise]);

    // Optimized animation - less computation per blade
    useFrame((state) => {
        if (!instancedMeshRef.current) return;

        time.current += state.clock.elapsedTime * 0.0002;

        const windTime = state.clock.elapsedTime * windSpeed;
        const position = new THREE.Vector3();
        const rotation = new THREE.Euler();
        const quaternion = new THREE.Quaternion();
        const scale = new THREE.Vector3();
        const matrix = new THREE.Matrix4();

        // Only update a subset of blades each frame for even better performance
        // Complete cycle every ~5 frames (more optimized)
        const now = performance.now();
        framesSinceLast.current++;

        if (now - fpsLastTime.current >= 1000) {
            measuredFPS.current = (framesSinceLast.current * 1000) / (now - fpsLastTime.current);
            fpsLastTime.current = now;
            framesSinceLast.current = 0;
        }

        const currentFPS = measuredFPS.current;
        lastTime.current = now;

        // Clamp FPS range between 10 and 60 for mapping
        const clampedFPS = Math.max(10, Math.min(currentFPS, 60));

        // Inverse scale: Higher FPS → lower smoothness rate (smoother updates)
        const grassSmoothnessRate = Math.round(10 - ((clampedFPS - 0) / 50) * 9); // Scale 10→1

        const updateCount = Math.floor(count / grassSmoothnessRate);
        const startIndex = Math.floor((state.clock.elapsedTime * 10) % grassSmoothnessRate) * updateCount;
        const endIndex = Math.min(startIndex + updateCount, count);

        // Update subset of blades with wind effect
        for (let i = startIndex; i < endIndex; i++) {
            // Get original transforms
            position.copy(originalPositions[i]);
            rotation.copy(originalRotations[i]);
            scale.copy(originalScales[i]);

            if (!position.x && !position.z) continue; // Skip uninitialized blades

            // Calculate wind effect - use simplified noise sampling
            // Use the blade's position but with much lower resolution noise
            const simplifiedX = Math.floor(position.x * 0.05) * 20; // More aggressive simplification
            const simplifiedZ = Math.floor(position.z * 0.05) * 20;

            const windX = noise.noise(
                simplifiedX * 0.01 + windTime * 0.5,
                simplifiedZ * 0.01 + windTime * 0.5
            ) * windStrength;

            const windZ = noise.noise(
                simplifiedX * 0.01 + windTime * 0.5 + 100,
                simplifiedZ * 0.01 + windTime * 0.5 + 100
            ) * windStrength;

            // Apply minimal wind effect to maintain density
            // Less wind bending preserves the dense appearance
            rotation.x = originalRotations[i].x + windX * scale.y * 0.6; // Reduced wind effect
            rotation.z = originalRotations[i].z + windZ * scale.y * 0.6; // Reduced wind effect

            quaternion.setFromEuler(rotation);

            // Compose and apply matrix
            matrix.compose(position, quaternion, scale);
            instancedMeshRef.current.setMatrixAt(i, matrix);
        }

        // Update instance matrices
        instancedMeshRef.current.instanceMatrix.needsUpdate = true;
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