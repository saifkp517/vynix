import React, { useState, useImperativeHandle, forwardRef } from 'react';

interface CrosshairRef {
    triggerHit: () => void;
}

export const Crosshair = React.memo(
    forwardRef<CrosshairRef, {}>((_, ref) => {
        const [hit, setHit] = useState<boolean>(false);

        useImperativeHandle(ref, () => ({
            triggerHit: () => {
                setHit(true);
                setTimeout(() => setHit(false), 150);
            }
        }));

        return (
            <div
                style={{
                    position: 'fixed',
                    top: '50%',
                    left: '50%',
                    width: '2px', // Slightly larger for visibility
                    height: '2px',
                    backgroundColor: hit ? 'rgba(255, 255, 255, 0.9)' : 'rgba(255, 0, 0, 0.7)', // Semi-transparent for smoother blending
                    borderRadius: '50%', // Circular shape for a modern look
                    transform: hit ? 'translate(-50%, -50%) scale(1.5)' : 'translate(-50%, -50%) scale(1)', // Scale up on hit
                    boxShadow: hit ? '0 0 12px 4px rgba(255, 255, 255, 0.8)' : '0 0 8px 2px rgba(255, 0, 0, 0.5)', // Glow effect
                    zIndex: 1000,
                    transition: 'all 0.15s ease', // Smooth transition for color, scale, and shadow
                    pointerEvents: 'none', // Prevent interference with mouse events
                }}
            >
                {/* Pseudo-element for crosshair lines */}
                <div
                    style={{
                        position: 'absolute',
                        top: '50%',
                        left: '50%',
                        width: '10px',
                        height: '1px',
                        backgroundColor: hit ? 'rgba(255, 255, 255, 0.7)' : 'rgba(255, 0, 0, 0.5)',
                        transform: 'translate(-50%, -50%)',
                        transition: 'background-color 0.15s ease',
                    }}
                />
                <div
                    style={{
                        position: 'absolute',
                        top: '50%',
                        left: '50%',
                        width: '1px',
                        height: '10px',
                        backgroundColor: hit ? 'rgba(255, 255, 255, 0.7)' : 'rgba(255, 0, 0, 0.5)',
                        transform: 'translate(-50%, -50%)',
                        transition: 'background-color 0.15s ease',
                    }}
                />
            </div>
        );
    })
);