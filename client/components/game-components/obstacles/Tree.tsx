import React, { useEffect, useRef, useState, useMemo } from 'react';
import { ObjectLoader, MaterialLoader } from 'three';
import * as THREE from 'three';
import socket from '@/lib/socket';
import { useFrame } from '@react-three/fiber';

import type { Vegetation } from '@/app/types/types';
import { useColliderRefs } from './useColliderRef';
import {
    CANOPY_PLATE_RADIUS,
    CANOPY_PLATE_Y_OFFSET,
    CANOPY_PLATE_SCALE,
    TRUNK_COLLIDER_RADIUS,
    TRUNK_COLLIDER_HEIGHT,
    TRUNK_COLLIDER_RADIAL_SCALE,
    TOP_CANOPY_RADIUS,
    TOP_CANOPY_Y_OFFSET,
    TOP_CANOPY_SCALE,
} from '../../../../shared/treeConstants';

function rgba(r: number, g: number, b: number, a: number): string {
    return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${a})`;
}

/**
 * A tree's `canopyHeightOffset` (added here, in the same baseScale units) is
 * baked in by generateTreePos.ts, not derived here. It used to be a per-tree
 * hash of rotation/scale — deterministic, but a fixed small spread regardless
 * of how tightly packed a cluster was, so it barely helped the actual problem
 * case: several close-together trees whose canopies all overlap and fight
 * over the player at once. Proximity-aware tiering needs to know which
 * *other* trees are nearby, which isn't knowable from a single tree's own
 * fields — that requires the full layout, so it has to happen at generation
 * time instead. Missing/legacy data (no field) just falls back to the base
 * height, same as tier 0.
 */
export function getCanopyYOffset(treePos: Vegetation): number {
    return CANOPY_PLATE_Y_OFFSET + (treePos.canopyHeightOffset ?? 0);
}

/**
 * Top canopy (the crown cluster above the trunk) sits at a fixed offset —
 * unlike the bottom plate, it isn't subject to the proximity-aware tiering
 * in generateTreePos.ts, since the trunk's own height already keeps
 * neighboring crowns from stacking the way low, wide bottom plates do.
 */
export function getTopCanopyYOffset(): number {
    return TOP_CANOPY_Y_OFFSET;
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

        // Top canopy — the crown cluster above the trunk, now a single solid
        // object (see TOP_CANOPY_* in shared/treeConstants.ts) rather than
        // three separately wind-swayed layers.
        const topCanopy = new THREE.SphereGeometry(TOP_CANOPY_RADIUS, 12, 8);

        // Wide spherical canopy to match other canopies, replacing cylinder
        const canopyPlate = new THREE.SphereGeometry(3.5, 12, 8); // Slightly larger than topCanopy

        // Add organic variation
        [topCanopy, canopyPlate].forEach(geo => {
            modifyGeometryForOrganicShape(geo);
        });

        return {
            mainTrunk,
            aerialRoot,
            topCanopy,
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

        // Top canopy (crown cluster) material
        const canopyBaseMaterial = new THREE.MeshStandardMaterial({
            color: '#1B5E20',
            roughness: 0.8,
            metalness: 0.0,
            flatShading: false,
        });

        // Bottom canopy plate — the one standable/collidable layer. It was
        // previously the exact same color (#1B5E20) as the non-standable
        // crown base above it, so there was no visual way to tell which
        // canopy a player could actually land on. Distinct lighter green
        // tone (vs. the crown's darker greens above) so it still reads as
        // "platform" without looking out of place among foliage.
        const plateMaterial = new THREE.MeshStandardMaterial({
            color: '#1F5A3A',
            roughness: 0.85,
            metalness: 0.0,
            flatShading: false,
        });

        return {
            trunkMaterial,
            rootMaterial,
            canopyBaseMaterial,
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
    const topCanopyRef = useRef<THREE.InstancedMesh>(null);
    const canopyPlateRef = useRef<THREE.InstancedMesh>(null);
    const dummy = useMemo(() => new THREE.Object3D(), []);

    // No wind-sway animation on either canopy layer: both are now solid,
    // collidable objects (see TreeColliders), placed once and never moved.
    // The old per-frame wind sway (and the medium/small layers it drove) used
    // Math.random()-seeded jitter computed independently on every client, so
    // no two players ever agreed on exactly where the crown was — harmless
    // while purely decorative, but not once it needs to be shootable/
    // standable the same way for everyone. Static + deterministic keeps the
    // visible mesh and the solid collider in permanent agreement, same
    // reasoning as canopyPlate already used.

    useEffect(() => {
        if (!mainTrunkRef.current || !aerialRootsRef.current ||
            !topCanopyRef.current || !canopyPlateRef.current) return;

        // For each tree position
        positions.forEach((treePos, i) => {
            const { position, rotation, scale } = treePos;
            const baseScale = scale * 1.2;

            const groundHeight = getGroundHeight(position[0], position[2]);

            // --------- Main trunk ----------
            // CylinderGeometry is centered on its own origin, so the trunk
            // must be raised by half its (scaled) height to sit on top of
            // the ground rather than being bisected by it. Roots/canopy
            // below are already anchored relative to groundHeight as the
            // trunk's base, so only the trunk's own placement needed this.
            const trunkHalfHeight = (geometry.mainTrunk as THREE.CylinderGeometry).parameters.height / 2;
            dummy.position.set(position[0], groundHeight + trunkHalfHeight * baseScale, position[2]);
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
            // Create the distinctive horizontal spread of a banyan tree.
            // Deliberately NOT lifted with the crown cluster below — this is
            // the low, wide understory layer meant to hide the trunk and
            // merge with neighboring trees into a dense canopy ceiling,
            // rather than track the (now much taller) trunk's top.
            dummy.position.set(position[0], groundHeight + getCanopyYOffset(treePos) * baseScale, position[2]);
            dummy.rotation.set(0, rotation + Math.random() * 0.5, 0);
            dummy.scale.set(baseScale * 8.0, baseScale * 1.6, baseScale * 8.0); // Wide and fat, not a thin flat leaf
            dummy.updateMatrix();
            canopyPlateRef.current ? canopyPlateRef.current.setMatrixAt(i, dummy.matrix) : null;

            // --------- Top canopy (crown cluster) ---------
            // Deterministic, like canopyPlate: no Math.random() in position
            // or rotation, so every client places (and collides with) it
            // identically. `canopyLift` is folded into TOP_CANOPY_Y_OFFSET.
            dummy.position.set(position[0], groundHeight + getTopCanopyYOffset() * baseScale, position[2]);
            dummy.rotation.set(0, rotation, 0);
            dummy.scale.set(
                baseScale * TOP_CANOPY_SCALE[0],
                baseScale * TOP_CANOPY_SCALE[1],
                baseScale * TOP_CANOPY_SCALE[2]
            );
            dummy.updateMatrix();
            topCanopyRef.current ? topCanopyRef.current.setMatrixAt(i, dummy.matrix) : null;
        });

        // Update all instance matrices
        mainTrunkRef.current.instanceMatrix.needsUpdate = true;
        aerialRootsRef.current.instanceMatrix.needsUpdate = true;
        topCanopyRef.current.instanceMatrix.needsUpdate = true;
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

            {/* Top canopy (crown cluster) */}
            <instancedMesh
                ref={topCanopyRef}
                args={[geometry.topCanopy, materials.canopyBaseMaterial, positions.length]}
                castShadow
                receiveShadow
                frustumCulled={false}
            />
        </group>
    );
};

// TreeColliders mirrors TreeVisual's canopyPlate transform (position
// groundHeight + getCanopyYOffset(...)*baseScale, scale
// [baseScale*8, baseScale*1.6, baseScale*8] on a radius-CANOPY_PLATE_RADIUS
// sphere) — this is what previously replaced rocks as the game's solid cover
// object, so client visual/collider and server occlusion all need this exact
// shape. The one deliberate difference: the collider skips the visual's
// extra `+ Math.random() * 0.5` rotation jitter (that's non-seeded per-frame
// randomness with no server-reproducible equivalent), so collision uses the
// tree's plain deterministic `rotation` field instead — a few degrees off
// from the rendered mesh, same tradeoff already made for rocks.

export const TreeColliders: React.FC<{
    positions: Vegetation[],
    addObstacleRef: (ref: THREE.Mesh | null) => void,
    removeObstacleRef: (ref: THREE.Mesh) => void,
    getGroundHeight: (x: number, z: number) => number,
}> =
    ({ positions, addObstacleRef, removeObstacleRef, getGroundHeight }) => {

        // Stable per-tree ref callbacks so a tree that scrolls out of view is
        // actually removed from the obstacle list instead of leaking forever
        // (see useColliderRefs for why that matters — this is what made rocks
        // tank FPS, and the canopy collider below is exactly as susceptible).
        const getRefCallback = useColliderRefs(addObstacleRef, removeObstacleRef);

        // Shared across every canopy collider instead of a fresh geometry per
        // tree. Segment count matters here (unlike the movement math, which is
        // analytic): Gun.tsx raycasts against the collider's actual triangles,
        // so a coarse sphere would be a coarse *shootable* shape.
        const canopyColliderGeometry = useMemo(
            () => new THREE.SphereGeometry(CANOPY_PLATE_RADIUS, 16, 12),
            [],
        );
        const topCanopyColliderGeometry = useMemo(
            () => new THREE.SphereGeometry(TOP_CANOPY_RADIUS, 16, 12),
            [],
        );
        const canopyColliderMaterial = useMemo(
            () => new THREE.MeshBasicMaterial({ visible: false }),
            [],
        );

        return (
            <>
                {positions.map((treePos, index) => {
                    const { position, rotation, scale } = treePos;
                    const baseScale = scale * 1.2;
                    const groundHeight = getGroundHeight(position[0], position[2]);
                    // Same centered-geometry issue as the visual trunk (see
                    // TreeVisual): raise by half the collider's own (scaled)
                    // height so its base sits on the ground instead of being
                    // bisected by it. Uses the live-computed groundHeight
                    // (matching the visual mesh) rather than the raw baked
                    // position from POS.json, so both stay anchored the same way.
                    // Height is scaled by baseScale (not a separate 3.6x
                    // multiplier) so the collider matches the visible trunk
                    // instead of extending ~3x taller than what's rendered.
                    const trunkColliderHalfHeight = (48 * baseScale) / 2;

                    return (
                        <React.Fragment key={`tree-collider-${index}`}>
                            <mesh
                                name='tree'
                                ref={getRefCallback(treePos.id ?? `tree-${index}`)}
                                position={[position[0], groundHeight + trunkColliderHalfHeight, position[2]]}
                                frustumCulled={false}
                                scale={[baseScale * 0.8, baseScale, baseScale * 0.8]}
                            >
                                <cylinderGeometry args={[1.5, 1.5, 48, 8]} />
                                <meshBasicMaterial visible={false} />
                            </mesh>
                            {/* Bottom canopy — solid cover, same ellipsoid-collider
                                treatment rocks used before they were removed. Generic
                                contact resolution in TPP.tsx already handles standing on
                                top of / sliding along any ellipsoid obstacle, so nothing
                                canopy-specific is needed there beyond this mesh existing. */}
                            <mesh
                                name='canopy'
                                ref={getRefCallback(`${treePos.id ?? `tree-${index}`}-canopy`)}
                                geometry={canopyColliderGeometry}
                                material={canopyColliderMaterial}
                                position={[
                                    position[0],
                                    groundHeight + getCanopyYOffset(treePos) * baseScale,
                                    position[2],
                                ]}
                                rotation={[0, rotation, 0]}
                                frustumCulled={false}
                                scale={[
                                    CANOPY_PLATE_SCALE[0] * baseScale,
                                    CANOPY_PLATE_SCALE[1] * baseScale,
                                    CANOPY_PLATE_SCALE[2] * baseScale,
                                ]}
                            />
                            {/* Top canopy — the crown cluster, now solid cover the
                                same way the bottom canopy plate already is. Rotation
                                uses the plain deterministic `rotation` field, matching
                                the visual mesh exactly since it no longer has any
                                per-frame jitter to diverge from. */}
                            <mesh
                                name='topCanopy'
                                ref={getRefCallback(`${treePos.id ?? `tree-${index}`}-topCanopy`)}
                                geometry={topCanopyColliderGeometry}
                                material={canopyColliderMaterial}
                                position={[
                                    position[0],
                                    groundHeight + getTopCanopyYOffset() * baseScale,
                                    position[2],
                                ]}
                                rotation={[0, rotation, 0]}
                                frustumCulled={false}
                                scale={[
                                    TOP_CANOPY_SCALE[0] * baseScale,
                                    TOP_CANOPY_SCALE[1] * baseScale,
                                    TOP_CANOPY_SCALE[2] * baseScale,
                                ]}
                            />
                        </React.Fragment>
                    );
                })}
            </>
        );
    };