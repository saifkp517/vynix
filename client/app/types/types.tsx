import * as THREE from "three"

export interface TreeType {
    trunkRadiusTop: number;
    trunkRadiusBottom: number;
    barkDetailColor: string;
    foliageColor: string;
    foliageDensity: number;
    conicalTop?: boolean;
    aerialRoots?: boolean;
    trunkHeight: number;
    trunkColor: string;  // Hex color code or any valid CSS color value
    barkRoughness: number;  // A float between 0 and 1
    foliageRadius?: number;
    foliageHeight?: number;
    wideCanopy?: boolean;
};

export interface InstancedTreeProps {
    positions: []; // An array of positions for each tree instance
    scales?: number[]; // Optional scales for each tree
    ageVariations?: number[]; // Optional age variations for each tree
    type?: TreeType;
    getGroundHeight?: (x: number, z: number) => number;
};

export interface Vegetation {
    id?: string;
    type: string;
    position: [number, number, number];
    scale: number;
    rotation: number;
    // Baked at generation time (see server/scripts/generateTreePos.ts) rather
    // than derived client-side: whether two canopies need to be pushed far
    // apart depends on which *other* trees are nearby, which isn't knowable
    // from a single tree's own fields. Added to CANOPY_PLATE_Y_OFFSET in
    // Tree.tsx. Optional so older/hand-written POS.json data without it just
    // falls back to the base height.
    canopyHeightOffset?: number;
}

export interface Player {
    id: string;
    username: string;
    health: number;
    kills: number;
    deaths: number;
}