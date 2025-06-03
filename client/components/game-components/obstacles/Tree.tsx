import React, { useEffect, useRef, useState, useMemo } from 'react';
import { ObjectLoader, MaterialLoader } from 'three';
import * as THREE from 'three';
import socket from '@/lib/socket';
import { useFrame } from '@react-three/fiber';

import type { Vegetation } from '@/app/types/types';

function rgba(r: number, g: number, b: number, a: number): string {
    return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${a})`;
}

export const TreeVisual: React.FC<{
    positions: Vegetation[],
    getGroundHeight: (x: number, z: number) => number;
}> = ({ positions, getGroundHeight }) => {

    // Create realistic tree geometries
    const geometry = useMemo(() => {
        // Main trunk - thicker and more imposing, height doubled from 26 to 52
        const mainTrunk = new THREE.CylinderGeometry(1.2, 1.5, 48, 64, 64, false);
        modifyGeometryForNaturalLook(mainTrunk);

        // Aerial roots - characteristic of banyan trees, height doubled from 26 to 52
        const aerialRoot = new THREE.CylinderGeometry(0.15, 0.25, 36, 8, 6, false);
        modifyGeometryForNaturalLook(aerialRoot);

        const largeCanopy = new THREE.SphereGeometry(2.8, 12, 8);   // Smaller radius & segments
        const mediumCanopy = new THREE.SphereGeometry(2.0, 10, 6);  // Reduced size & detail
        const smallCanopy = new THREE.SphereGeometry(1.4, 8, 5);    // Lightest/least dense

        // Wide spherical canopy to match other canopies, replacing cylinder
        const canopyPlate = new THREE.SphereGeometry(3.5, 12, 8); // Slightly larger than largeCanopy

        // Add organic variation
        [largeCanopy, mediumCanopy, smallCanopy, canopyPlate].forEach(geo => {
            modifyGeometryForOrganicShape(geo);
        });

        return {
            mainTrunk,
            aerialRoot,
            largeCanopy,
            mediumCanopy,
            smallCanopy,
            canopyPlate
        };
    }, []);


    // Helper function to add imperfections to geometry
    function modifyGeometryForNaturalLook(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
        const posAttr = geometry.attributes.position as THREE.BufferAttribute;
        const normal = new THREE.Vector3();

        for (let i = 0; i < posAttr.count; i++) {
            normal.fromBufferAttribute(geometry.attributes.normal as THREE.BufferAttribute, i);

            // Get current position
            const x = posAttr.getX(i);
            const y = posAttr.getY(i);
            const z = posAttr.getZ(i);

            // Calculate noise based on position (simulating bark texture)
            const noise = simplex3D(x * 0.8, y * 0.4, z * 0.8) * 0.15;

            // Apply noise in the direction of normal vector for realistic surface
            posAttr.setX(i, x + normal.x * noise);
            posAttr.setY(i, y + normal.y * noise);
            posAttr.setZ(i, z + normal.z * noise);
        }

        geometry.computeVertexNormals();
        return geometry;
    }

    // Helper function for more organic foliage shapes
    function modifyGeometryForOrganicShape(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
        const posAttr = geometry.attributes.position as THREE.BufferAttribute;

        for (let i = 0; i < posAttr.count; i++) {
            const x = posAttr.getX(i);
            const y = posAttr.getY(i);
            const z = posAttr.getZ(i);

            // More pronounced variation for canopy elements
            const xNoise = simplex3D(x * 0.5, y * 0.3, z * 0.5) * 0.35;
            const yNoise = simplex3D(x * 0.4, y * 0.5, z * 0.4) * 0.25;
            const zNoise = simplex3D(x * 0.5, y * 0.3, z * 0.5) * 0.35;

            // Create uneven, natural-looking surfaces
            posAttr.setX(i, x + xNoise);
            posAttr.setY(i, y + yNoise);
            posAttr.setZ(i, z + zNoise);
        }

        geometry.computeVertexNormals();
        return geometry;
    }

    // Simplified 3D simplex noise function for natural variation
    function simplex3D(x: number, y: number, z: number) {
        // Simple pseudorandom function that looks organic enough
        const dot = x * 12.9898 + y * 78.233 + z * 37.719;
        return Math.sin(dot) * 43758.5453 % 1;
    }

    // Rich, realistic materials
    const materials = useMemo(() => {
        // Bark texture for the trunk - deep brown with texture
        const barkTexture = createBarkTexture();
        const trunkMaterial = new THREE.MeshStandardMaterial({
            color: '#5D4037',
            roughness: 0.9,
            metalness: 0.1,
            map: barkTexture,
            normalScale: new THREE.Vector2(1, 1),
            bumpScale: 0.6,
        });

        // Aerial roots material - slightly lighter
        const rootMaterial = new THREE.MeshStandardMaterial({
            color: '#6D4C41',
            roughness: 0.85,
            metalness: 0.05,
            map: barkTexture,
            normalScale: new THREE.Vector2(0.8, 0.8),
        });

        // Foliage materials with rich green variations
        const canopyBaseMaterial = new THREE.MeshStandardMaterial({
            color: '#1B5E20',
            roughness: 0.8,
            metalness: 0.0,
            flatShading: false,
        });

        const canopyMidMaterial = new THREE.MeshStandardMaterial({
            color: '#2E7D32',
            roughness: 0.75,
            metalness: 0.0,
            flatShading: false,
        });

        const canopyTopMaterial = new THREE.MeshStandardMaterial({
            color: '#388E3C',
            roughness: 0.7,
            metalness: 0.0,
            flatShading: false,
        });

        // Horizontal plates material, now matching canopy style
        const plateMaterial = new THREE.MeshStandardMaterial({
            color: '#1B5E20',
            roughness: 0.8,
            metalness: 0.0,
            flatShading: false, // Changed to false to match other canopies
        });

        return {
            trunkMaterial,
            rootMaterial,
            canopyBaseMaterial,
            canopyMidMaterial,
            canopyTopMaterial,
            plateMaterial
        };
    }, []);

    // Create procedural bark texture
    function createBarkTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 256;
        const ctx = canvas.getContext('2d');

        // Base color
        if (ctx) {
            ctx.fillStyle = '#5D4037';
            ctx.fillRect(0, 0, 256, 256);
        }

        if (ctx) {
            // Create vertical striations
            for (let i = 0; i < 40; i++) {
                const x = Math.random() * 256;
                const width = 2 + Math.random() * 8;
                const height = 50 + Math.random() * 200;
                const y = Math.random() * (256 - height);

                ctx.fillStyle = `rgba(${60 + Math.random() * 40}, ${40 + Math.random() * 25}, ${30 + Math.random() * 15}, 0.7)`;
                ctx.fillRect(x, y, width, height);
            }

            // Add some horizontal cracks
            for (let i = 0; i < 30; i++) {
                const y = Math.random() * 256;
                const width = 20 + Math.random() * 80;
                const height = 1 + Math.random() * 3;
                const x = Math.random() * (256 - width);

                ctx.fillStyle = rgba(30, 20, 10, 0.8);
                ctx.fillRect(x, y, width, height);
            }
        }

        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(2, 4);
        return texture;
    }

    // Mesh references
    const mainTrunkRef = useRef<THREE.InstancedMesh>(null);
    const aerialRootsRef = useRef<THREE.InstancedMesh>(null);
    const largeCanopyRef = useRef<THREE.InstancedMesh>(null);
    const mediumCanopyRef = useRef<THREE.InstancedMesh>(null);
    const smallCanopyRef = useRef<THREE.InstancedMesh>(null);
    const canopyPlateRef = useRef<THREE.InstancedMesh>(null);
    const dummy = useMemo(() => new THREE.Object3D(), []);

    // Animation for subtle movement
    useFrame(({ clock }) => {
        if (!largeCanopyRef.current || !mediumCanopyRef.current || !smallCanopyRef.current || !canopyPlateRef.current) return;

        // Very subtle canopy movement to simulate wind for all canopy layers
        for (let i = 0; i < positions.length; i++) {
            dummy.position.copy(new THREE.Vector3(...positions[i].position));

            // Update largeCanopy
            largeCanopyRef.current.getMatrixAt(i, dummy.matrix);
            const largePosition = new THREE.Vector3();
            const largeQuaternion = new THREE.Quaternion();
            const largeScale = new THREE.Vector3();
            dummy.matrix.decompose(largePosition, largeQuaternion, largeScale);
            const windFactor = Math.sin(clock.elapsedTime * 0.5 + i) * 0.2;
            dummy.rotation.x = windFactor;
            dummy.rotation.z = windFactor * 0.7;
            dummy.position.copy(largePosition);
            dummy.scale.copy(largeScale);
            dummy.updateMatrix();
            largeCanopyRef.current.setMatrixAt(i, dummy.matrix);

            // Update mediumCanopy
            mediumCanopyRef.current.getMatrixAt(i, dummy.matrix);
            const mediumPosition = new THREE.Vector3();
            const mediumQuaternion = new THREE.Quaternion();
            const mediumScale = new THREE.Vector3();
            dummy.matrix.decompose(mediumPosition, mediumQuaternion, mediumScale);
            dummy.rotation.x = windFactor;
            dummy.rotation.z = windFactor * 0.7;
            dummy.position.copy(mediumPosition);
            dummy.scale.copy(mediumScale);
            dummy.updateMatrix();
            mediumCanopyRef.current.setMatrixAt(i, dummy.matrix);

            // Update smallCanopy
            smallCanopyRef.current.getMatrixAt(i, dummy.matrix);
            const smallPosition = new THREE.Vector3();
            const smallQuaternion = new THREE.Quaternion();
            const smallScale = new THREE.Vector3();
            dummy.matrix.decompose(smallPosition, smallQuaternion, smallScale);
            dummy.rotation.x = windFactor;
            dummy.rotation.z = windFactor * 0.7;
            dummy.position.copy(smallPosition);
            dummy.scale.copy(smallScale);
            dummy.updateMatrix();
            smallCanopyRef.current.setMatrixAt(i, dummy.matrix);

            // Update canopyPlate
            canopyPlateRef.current.getMatrixAt(i, dummy.matrix);
            const platePosition = new THREE.Vector3();
            const plateQuaternion = new THREE.Quaternion();
            const plateScale = new THREE.Vector3();
            dummy.matrix.decompose(platePosition, plateQuaternion, plateScale);
            dummy.rotation.x = windFactor;
            dummy.rotation.z = windFactor * 0.7;
            dummy.position.copy(platePosition);
            dummy.scale.copy(plateScale);
            dummy.updateMatrix();
            canopyPlateRef.current.setMatrixAt(i, dummy.matrix);
        }

        // Update matrices
        largeCanopyRef.current.instanceMatrix.needsUpdate = true;
        mediumCanopyRef.current.instanceMatrix.needsUpdate = true;
        smallCanopyRef.current.instanceMatrix.needsUpdate = true;
        canopyPlateRef.current.instanceMatrix.needsUpdate = true;
    });

    useEffect(() => {
        if (!mainTrunkRef.current || !aerialRootsRef.current ||
            !largeCanopyRef.current || !mediumCanopyRef.current ||
            !smallCanopyRef.current || !canopyPlateRef.current) return;

        // For each tree position
        positions.forEach((treePos, i) => {
            const { position, rotation, scale } = treePos;
            const baseScale = scale * 1.2;

            const groundHeight = getGroundHeight(position[0], position[2]);

            // --------- Main trunk ----------
            dummy.position.set(position[0], groundHeight, position[2]);
            dummy.rotation.set(0, rotation, 0);
            dummy.scale.set(baseScale, baseScale, baseScale);
            dummy.updateMatrix();
            mainTrunkRef.current ? mainTrunkRef.current.setMatrixAt(i, dummy.matrix) : null;

            // --------- Aerial roots ---------
            // Create multiple aerial roots around the trunk
            const numRoots = 12;
            for (let r = 0; r < numRoots; r++) {
                const rootIndex = i * numRoots + r;
                const angle = (r / numRoots) * Math.PI * 2 + rotation;
                const radiusOffset = 1.0 + Math.random() * 0.5;
                const heightOffset = -1.0 + Math.random() * 2.0;

                dummy.position.set(
                    position[0] + Math.sin(angle) * radiusOffset * baseScale,
                    groundHeight + heightOffset * baseScale,
                    position[2] + Math.cos(angle) * radiusOffset * baseScale
                );

                // Angle roots slightly outward from the center
                dummy.rotation.set(
                    Math.random() * 0.2 - 0.1,
                    angle + Math.PI,
                    Math.random() * 0.2 - 0.1
                );

                // Varied scales for natural look
                const rootScale = baseScale * (0.3 + Math.random() * 0.3);
                dummy.scale.set(rootScale, baseScale * (0.8 + Math.random() * 0.4), rootScale);

                dummy.updateMatrix();
                if (rootIndex < positions.length * numRoots) {
                    aerialRootsRef.current ? aerialRootsRef.current.setMatrixAt(rootIndex, dummy.matrix) : null;
                }
            }

            // --------- Canopy plate (spherical, at original position) ---------
            // Create the distinctive horizontal spread of a banyan tree
            dummy.position.set(position[0], groundHeight + 6.4 * baseScale, position[2]);
            dummy.rotation.set(0, rotation + Math.random() * 0.5, 0);
            dummy.scale.set(baseScale * 2.6, baseScale * 0.8, baseScale * 2.6); // Adjusted for spherical shape
            dummy.updateMatrix();
            canopyPlateRef.current ? canopyPlateRef.current.setMatrixAt(i, dummy.matrix) : null;

            // --------- Large canopy (bottom layer) ---------
            dummy.position.set(
                position[0],
                groundHeight + 20.4 * baseScale,
                position[2]
            );
            dummy.rotation.set(0, rotation + Math.random() * Math.PI, 0);
            dummy.scale.set(
                baseScale * 6.0,
                baseScale * 2.4,
                baseScale * 6.0
            );
            dummy.updateMatrix();
            largeCanopyRef.current ? largeCanopyRef.current.setMatrixAt(i, dummy.matrix) : null;

            // --------- Medium canopy (middle layer) ---------
            dummy.position.set(
                position[0] + (Math.random() - 0.5) * 0.5,
                groundHeight + 21.6 * baseScale,
                position[2] + (Math.random() - 0.5) * 0.5
            );
            dummy.rotation.set(0, rotation + Math.random() * Math.PI, 0);
            dummy.scale.set(
                baseScale * 3.5,
                baseScale * 1.0,
                baseScale * 3.5
            );
            dummy.updateMatrix();
            mediumCanopyRef.current ? mediumCanopyRef.current.setMatrixAt(i, dummy.matrix) : null;

            // --------- Small canopy (top layer) ---------
            dummy.position.set(
                position[0] + (Math.random() - 0.5) * 0.3,
                groundHeight + 20.6 * baseScale,
                position[2] + (Math.random() - 0.5) * 0.3
            );
            dummy.rotation.set(0, rotation + Math.random() * Math.PI, 0);
            dummy.scale.set(
                baseScale * 2.8,
                baseScale * 0.8,
                baseScale * 2.8
            );
            dummy.updateMatrix();
            smallCanopyRef.current ? smallCanopyRef.current.setMatrixAt(i, dummy.matrix) : null;
        });

        // Update all instance matrices
        mainTrunkRef.current.instanceMatrix.needsUpdate = true;
        aerialRootsRef.current.instanceMatrix.needsUpdate = true;
        largeCanopyRef.current.instanceMatrix.needsUpdate = true;
        mediumCanopyRef.current.instanceMatrix.needsUpdate = true;
        smallCanopyRef.current.instanceMatrix.needsUpdate = true;
        canopyPlateRef.current.instanceMatrix.needsUpdate = true;
    }, [positions]);

    return (
        <group>
            {/* Main trunk */}
            <instancedMesh
                ref={mainTrunkRef}
                args={[geometry.mainTrunk, materials.trunkMaterial, positions.length]}
                castShadow
                receiveShadow
                frustumCulled={false}
            />

            {/* Aerial roots - characteristic of banyan trees */}
            <instancedMesh
                ref={aerialRootsRef}
                args={[geometry.aerialRoot, materials.rootMaterial, positions.length * 12]}
                castShadow
                receiveShadow
                frustumCulled={false}
            />

            {/* Spherical canopy structure */}
            <instancedMesh
                ref={canopyPlateRef}
                args={[geometry.canopyPlate, materials.plateMaterial, positions.length]}
                castShadow
                receiveShadow
                frustumCulled={false}
            />

            {/* Large canopy (bottom layer) */}
            <instancedMesh
                ref={largeCanopyRef}
                args={[geometry.largeCanopy, materials.canopyBaseMaterial, positions.length]}
                castShadow
                receiveShadow
                frustumCulled={false}
            />

            {/* Medium canopy (middle layer) */}
            <instancedMesh
                ref={mediumCanopyRef}
                args={[geometry.mediumCanopy, materials.canopyMidMaterial, positions.length]}
                castShadow
                receiveShadow
                frustumCulled={false}
            />

            {/* Small canopy (top layer) */}
            <instancedMesh
                ref={smallCanopyRef}
                args={[geometry.smallCanopy, materials.canopyTopMaterial, positions.length]}
                castShadow
                receiveShadow
                frustumCulled={false}
            />
        </group>
    );
};

export const TreeColliders: React.FC<{ positions: Vegetation[], addObstacleRef: (ref: THREE.Mesh | null) => void }> =
    ({ positions, addObstacleRef }) => {

        // Create refs for all colliders
        const colliderRefs = useRef<(THREE.Mesh | null)[]>([]);

        useEffect(() => {
            // Initialize the array with null values
            colliderRefs.current = Array(positions.length * 2).fill(null); // Doubled to account for trunk and canopy plate colliders
        }, [positions.length]);

        return (
            <>
                {positions.map((treePos, index) => {
                    const { position, rotation, scale } = treePos;
                    const baseScale = scale * 1.2;
                    const groundHeight = position[1]; // Assuming position[1] is the y-coordinate set by getGroundHeight

                    return (
                        <group key={`tree-collider-group-${index}`}>
                            {/* Trunk collider */}
                            <mesh
                                name='tree-trunk'
                                ref={(ref) => {
                                    colliderRefs.current[index * 2] = ref;
                                    addObstacleRef(ref);
                                }}
                                position={treePos.position}
                                frustumCulled={false}
                                scale={[treePos.scale * 0.8, treePos.scale * 3.6, treePos.scale * 0.8]}
                            >
                                <cylinderGeometry args={[1.5, 1.5, 48, 8]} />
                                <meshBasicMaterial visible={false} />
                            </mesh>

                            {/* Spherical canopy plate collider */}
                            <mesh
                                name='tree-canopy-plate'
                                ref={(ref) => {
                                    colliderRefs.current[index * 2 + 1] = ref;
                                    addObstacleRef(ref);
                                }}
                                position={[position[0], groundHeight + 6.4 * baseScale, position[2]]}
                                rotation={[0, rotation + Math.random() * 0.5, 0]}
                                frustumCulled={false}
                                scale={[baseScale * 2.6, baseScale * 0.8, baseScale * 2.6]}
                            >
                                <sphereGeometry args={[3.5, 12, 8]} /> {/* Matches canopyPlate geometry */}
                                <meshBasicMaterial visible={false} />
                            </mesh>
                        </group>
                    );
                })}
            </>
        );
    };