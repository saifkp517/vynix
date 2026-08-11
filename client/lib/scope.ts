// Sniper scope magnification.
//
// MAX_ZOOM is the only tuning knob: the scope steps through ZOOM_STEPS evenly
// spaced stops from 1x (no magnification) up to MAX_ZOOM.
//
// The raw magnification is deliberately never shown to the player — the HUD
// reports a percentage of the scope's range instead (see zoomPercent), so the
// number can be retuned without the readout changing meaning.
export const MAX_ZOOM = 1.5;
export const ZOOM_STEPS = 5;

export const ZOOM_LEVELS = Array.from(
    { length: ZOOM_STEPS },
    (_, i) => 1 + ((MAX_ZOOM - 1) * i) / (ZOOM_STEPS - 1)
);

/** Position of a zoom index within the scope's range, as a whole percentage. */
export const zoomPercent = (index: number) =>
    Math.round(((index + 1) / ZOOM_STEPS) * 100);
