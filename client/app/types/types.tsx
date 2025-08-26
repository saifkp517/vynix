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
}

export interface Player {
    id: string;
    username: string;
    health: number;
    kills: number;
    deaths: number;
}