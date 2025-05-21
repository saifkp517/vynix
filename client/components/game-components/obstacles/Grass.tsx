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
    patchCount?: number;
    patchSize?: number;
    hidePlayerRadius?: number;
    getGroundHeight: (x: number, z: number) => number;
};

const TallGrass = memo(({
    count = 20000, // Maximum count for performance
    radius = 180, // Reduced radius to create denser patches
    center = [0, 0, 0],
    windStrength = 0.15,
    windSpeed = 0.5,
    patchCount = 30, // Fewer, more concentrated patches
    patchSize = 6, // Smaller patch size for super tight clumps
    hidePlayerRadius = 40, // Area around center where grass is extra dense for hiding
    getGroundHeight
}: TallGrassProps) => {
    const instancedMeshRef = useRef<THREE.InstancedMesh | null>(null);
    useThree();
    const time = useRef(0);
    
    // Create noise for natural grass distribution
    const noise = useMemo(() => new SimplexNoise(), []);
    
    // Create a thicker grass blade geometry for better coverage
    const grassGeometry = useMemo(() => {
        // Create a custom 3D blade shape that's wider and provides better coverage
        const geo = new THREE.BufferGeometry();
        
        // Fewer height segments to save on geometry complexity
        const heightSegments = 5;
        const widthSegments = 3;
        
        // Calculate vertices
        const vertices = [];
        const indices = [];
        const colors = [];
        
        // Create vertex colors for gradient effect with dark base for better coverage
        const colorSets = [
            {
                top: new THREE.Color(0x91e160),      // Lighter green for top
                bottom: new THREE.Color(0x1a3e06),   // Very dark green for bottom (darker for better coverage)
                tip: new THREE.Color(0xc4e17f)       // Light tip color
            },
            {
                top: new THREE.Color(0x7bc44c),      // Slightly darker green
                bottom: new THREE.Color(0x1c3a0e),   // Very dark base (darker for better coverage)
                tip: new THREE.Color(0xb5d279)       // Slightly darker tip
            },
            {
                top: new THREE.Color(0xa5ea6e),      // Brighter green
                bottom: new THREE.Color(0x15300a),   // Extremely dark base (darker for better coverage)
                tip: new THREE.Color(0xd3eaa0)       // Very light tip
            }
        ];
        
        // Choose a random color set for this blade
        const colorSet = colorSets[Math.floor(Math.random() * colorSets.length)];
        
        // Create blade vertices - wider blade for better coverage
        for (let h = 0; h <= heightSegments; h++) {
            const y = h / heightSegments; // Normalized height (0 to 1)
            
            // Calculate blade width - wider at base, still tapers but not as much
            const widthScale = 1 - Math.pow(y, 1.7) * 0.7; // Less tapering
            
            // Add natural curve
            const bendFactor = Math.pow(y, 2) * 0.3; // Increased bend
            const xCurve = Math.sin(y * Math.PI) * bendFactor;
            
            // Add slight twist around y-axis as it goes up
            const zTwist = y * y * 0.07 * Math.sin(y * Math.PI * 2);
            
            // For each width segment - wider blade
            for (let w = 0; w <= widthSegments; w++) {
                const x = (w / widthSegments - 0.5) * 0.35 * widthScale + xCurve; // Wider blade (0.35 vs 0.2)
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
    
    // Strategic patch placement - concentrate patches to form good hiding spots
    const patchPositions = useMemo(() => {
        const positions = [];
        
        // Create a super dense central area for hiding
        const centraldensity = Math.floor(patchCount * 0.3); // 30% of patches in center
        for (let i = 0; i < centraldensity; i++) {
            // Create patches in the central hide zone
            const theta = Math.random() * Math.PI * 2;
            const r = Math.random() * hidePlayerRadius;
            positions.push(new THREE.Vector2(
                center[0] + r * Math.cos(theta),
                center[2] + r * Math.sin(theta)
            ));
        }
        
        // Create several dense patches in strategic locations
        const strategicPatches = 4; // Strategic dense hiding spots
        for (let s = 0; s < strategicPatches; s++) {
            // Create a central point for this strategic hiding area
            const angle = s * (Math.PI * 2 / strategicPatches);
            const dist = radius * 0.4; // Position strategic areas at 40% radius
            
            const centerX = center[0] + dist * Math.cos(angle);
            const centerZ = center[2] + dist * Math.sin(angle);
            
            // Add several tightly clustered patches here
            const patchesPerStrategic = Math.floor((patchCount - centraldensity) / (strategicPatches + 1));
            for (let p = 0; p < patchesPerStrategic; p++) {
                const localTheta = Math.random() * Math.PI * 2;
                const localR = Math.random() * (patchSize * 1.2); // Tight clustering
                
                positions.push(new THREE.Vector2(
                    centerX + localR * Math.cos(localTheta),
                    centerZ + localR * Math.sin(localTheta)
                ));
            }
        }
        
        // Remaining patches scattered around
        const remainingCount = patchCount - centraldensity - (strategicPatches * Math.floor((patchCount - centraldensity) / (strategicPatches + 1)));
        for (let i = 0; i < remainingCount; i++) {
            const theta = Math.random() * Math.PI * 2;
            // Vary the distance from center - some patches closer, some further
            const r = (radius * 0.3) + (Math.random() * radius * 0.7); // Between 30-100% of radius
            
            positions.push(new THREE.Vector2(
                center[0] + r * Math.cos(theta),
                center[2] + r * Math.sin(theta)
            ));
        }
        
        return positions;
    }, [patchCount, radius, center, patchSize, hidePlayerRadius]);
    
    // Setup grass instances in patches
    useEffect(() => {
        if (!instancedMeshRef.current) return;
        
        const matrix = new THREE.Matrix4();
        const position = new THREE.Vector3();
        const rotation = new THREE.Euler();
        const quaternion = new THREE.Quaternion();
        const scale = new THREE.Vector3();
        
        // Create a density map to ensure we use all our blade count budget
        // and concentrate in important areas
        const placedCount = { value: 0 };
        const targetCount = count;
        
        // Two-pass approach - first place grass in strategic areas, then fill remaining count
        
        // First pass - place in strategic areas with high density
        placeStrategicGrass(placedCount, targetCount);
        
        // Second pass - fill remaining count with general grass
        if (placedCount.value < targetCount) {
            placeGeneralGrass(placedCount, targetCount);
        }
        
        // Update the instance matrix buffer
        instancedMeshRef.current.instanceMatrix.needsUpdate = true;
        
        // Function to place grass in strategic hiding spots
        function placeStrategicGrass(placedCount: { value: number }, maxCount: number) {
            // Calculate center area grass count (dense for hiding)
            const centerGrassCount = Math.min(Math.floor(maxCount * 0.6), maxCount - placedCount.value);
            
            // Place center area grass (super dense for hiding)
            for (let i = 0; i < centerGrassCount && placedCount.value < maxCount; i++) {
                // Calculate position in the center area
                const angle = Math.random() * Math.PI * 2;
                const dist = Math.pow(Math.random(), 0.7) * hidePlayerRadius; // Higher power = more concentration
                
                position.set(
                    center[0] + dist * Math.cos(angle),
                    0,
                    center[2] + dist * Math.sin(angle)
                );
                
                // Ensure good coverage - no gaps in hide area
                const densityNoise = noise.noise(position.x * 0.08, position.z * 0.08);
                if (densityNoise < -0.3 && dist > hidePlayerRadius * 0.5) continue;
                
                // Place the grass blade
                placeGrassBlade(position, placedCount);
            }
            
            // Place strategic patches grass
            const remainingStrategic = Math.min(Math.floor(maxCount * 0.3), maxCount - placedCount.value);
            for (let i = 0; i < remainingStrategic && placedCount.value < maxCount; i++) {
                // Use the first few patch positions (strategic ones)
                const strategicPatchCount = Math.min(patchPositions.length, 12); // First 12 positions are strategic
                const patchIndex = Math.floor(Math.random() * strategicPatchCount);
                const patchCenter = patchPositions[patchIndex];
                
                // Position within the patch (denser distribution)
                const angle = Math.random() * Math.PI * 2;
                const dist = Math.pow(Math.random(), 1.4) * patchSize; // Higher power = tighter clustering
                
                position.set(
                    patchCenter.x + dist * Math.cos(angle),
                    0,
                    patchCenter.y + dist * Math.sin(angle)
                );
                
                // Place the grass blade
                placeGrassBlade(position, placedCount);
            }
        }
        
        // Function to place general grass across the entire area
        function placeGeneralGrass(placedCount: { value: number }, maxCount: number) {
            // How many attempts to place remaining grass
            const attemptMultiplier = 1.5; // Try more placements than remaining count
            const remainingAttempts = Math.floor((maxCount - placedCount.value) * attemptMultiplier);
            
            for (let i = 0; i < remainingAttempts && placedCount.value < maxCount; i++) {
                // Choose a random patch
                const patchIndex = Math.floor(Math.random() * patchPositions.length);
                const patchCenter = patchPositions[patchIndex];
                
                // Position within the patch (Gaussian-like distribution)
                const angle = Math.random() * Math.PI * 2;
                const dist = Math.pow(Math.random(), 1.1) * patchSize;
                
                position.set(
                    patchCenter.x + dist * Math.cos(angle),
                    0,
                    patchCenter.y + dist * Math.sin(angle)
                );
                
                // Less strict density check for remaining grass
                const distFromCenter = Math.sqrt(
                    Math.pow(position.x - center[0], 2) + 
                    Math.pow(position.z - center[2], 2)
                );
                
                // Skip if too close to already dense center area
                if (distFromCenter < hidePlayerRadius * 1.1 && Math.random() > 0.3) continue;
                
                // Create clear empty spaces between patches
                const densityNoise = noise.noise(position.x * 0.04, position.z * 0.04);
                
                // Higher threshold creates more distinct patches
                if (densityNoise < -0.2) continue; 
                
                // Place the grass blade
                placeGrassBlade(position, placedCount);
            }
        }
        
        // Helper function to place a single grass blade
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
            
            // Calculate distance from center for height variation
            const distFromCenter = Math.sqrt(
                Math.pow(position.x - center[0], 2) + 
                Math.pow(position.z - center[2], 2)
            );
            
            // Vary grass height - taller in hide zones, shorter elsewhere for optimal coverage
            let baseHeight;
            if (distFromCenter < hidePlayerRadius) {
                // Taller grass in hide zones (player height)
                baseHeight = 4.0 + Math.random() * 0.8;
            } else {
                // Medium to shorter elsewhere
                baseHeight = 2.8 + Math.random() * 1.8;
            }
            
            // Add some noise variation to height
            const heightVariation = noise.noise(position.x * 0.05, position.z * 0.05) * 0.3 + 0.9;
            const grassHeight = baseHeight * heightVariation;
            
            // Wider blades for better coverage
            // Width partly inverse to height but with minimum width to ensure coverage
            const grassWidth = 0.25 + (1.0/grassHeight) * Math.random() * 0.3;
            
            // Make grass in hide zones even wider
            const widthMultiplier = distFromCenter < hidePlayerRadius ? 1.25 : 1.0;
            
            scale.set(grassWidth * widthMultiplier, grassHeight, 1);
            
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
        
    }, [count, radius, center, patchPositions, patchCount, patchSize, hidePlayerRadius, getGroundHeight, matrices, originalPositions, originalRotations, originalScales, noise]);
    
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
        
        // Only update a subset of blades each frame to improve performance
        // Complete cycle every ~3 frames
        const updateCount = Math.floor(count / 3);
        const startIndex = Math.floor((state.clock.elapsedTime * 10) % 3) * updateCount;
        const endIndex = Math.min(startIndex + updateCount, count);
        
        // Update subset of blades with wind effect
        for (let i = startIndex; i < endIndex; i++) {
            // Get original transforms
            position.copy(originalPositions[i]);
            rotation.copy(originalRotations[i]);
            scale.copy(originalScales[i]);
            
            if (!position.x && !position.z) continue; // Skip uninitialized blades
            
            // Calculate wind effect - use simplified noise sampling
            // Use the blade's position but with lower resolution noise
            const simplifiedX = Math.floor(position.x * 0.1) * 10;
            const simplifiedZ = Math.floor(position.z * 0.1) * 10;
            
            const windX = noise.noise(
                simplifiedX * 0.01 + windTime * 0.5,
                simplifiedZ * 0.01 + windTime * 0.5
            ) * windStrength;
            
            const windZ = noise.noise(
                simplifiedX * 0.01 + windTime * 0.5 + 100,
                simplifiedZ * 0.01 + windTime * 0.5 + 100
            ) * windStrength;
            
            // Calculate distance from center for wind strength variation
            const distFromCenter = Math.sqrt(
                Math.pow(position.x - center[0], 2) + 
                Math.pow(position.z - center[2], 2)
            );
            
            // Less wind in hiding spots for better cover
            const hideZoneWindReduction = distFromCenter < hidePlayerRadius ? 0.6 : 1.0;
            
            // Apply wind effect - taller grass bends more
            rotation.x = originalRotations[i].x + windX * scale.y * hideZoneWindReduction;
            rotation.z = originalRotations[i].z + windZ * scale.y * hideZoneWindReduction;
            
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