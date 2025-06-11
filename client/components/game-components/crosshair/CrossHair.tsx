import React, { useImperativeHandle, forwardRef, useCallback, useRef } from 'react';

interface CrosshairRef {
    triggerHit: () => void;
}

export const Crosshair = React.memo(
    forwardRef<CrosshairRef, {}>((_, ref) => {
        const animationRef = useRef<HTMLDivElement>(null);

        const triggerHit = useCallback(() => {
            console.log("crosshair hit");
            
            // Force animation restart by removing and re-adding the animation class
            if (animationRef.current) {
                animationRef.current.classList.remove('hit-animation');
                // Force reflow to ensure class removal is processed
                void animationRef.current.offsetWidth;
                animationRef.current.classList.add('hit-animation');
            }
        }, []);

        useImperativeHandle(ref, () => ({
            triggerHit
        }));

        return (
            <>
                <style>
                    {`
                        .crosshair-container {
                            position: fixed;
                            top: 50%;
                            left: 50%;
                            transform: translate(-50%, -50%);
                            z-index: 1000;
                            pointer-events: none;
                        }

                        .crosshair-line {
                            position: absolute;
                            background-color: #ffffff;
                            box-shadow: 0 0 4px rgba(0, 0, 0, 0.8);
                        }

                        .horizontal-line {
                            width: 20px;
                            height: 2px;
                            top: 50%;
                            left: 50%;
                            transform: translate(-50%, -50%);
                        }

                        .vertical-line {
                            width: 2px;
                            height: 20px;
                            top: 50%;
                            left: 50%;
                            transform: translate(-50%, -50%);
                        }

                        .center-dot {
                            width: 2px;
                            height: 2px;
                            top: 50%;
                            left: 50%;
                            transform: translate(-50%, -50%);
                            background-color: #ffffff;
                            box-shadow: 0 0 4px rgba(0, 0, 0, 0.8);
                        }

                        /* Diagonal lines for hit animation */
                        .diagonal-line {
                            position: absolute;
                            width: 2px;
                            height: 15px;
                            background-color: #00ff00;
                            opacity: 0;
                            box-shadow: 0 0 8px #00ff00;
                        }

                        .diagonal-tl {
                            top: 50%;
                            left: 50%;
                            transform: translate(-50%, -50%) rotate(-45deg);
                            transform-origin: bottom center;
                        }

                        .diagonal-tr {
                            top: 50%;
                            left: 50%;
                            transform: translate(-50%, -50%) rotate(45deg);
                            transform-origin: bottom center;
                        }

                        .diagonal-bl {
                            top: 50%;
                            left: 50%;
                            transform: translate(-50%, -50%) rotate(135deg);
                            transform-origin: bottom center;
                        }

                        .diagonal-br {
                            top: 50%;
                            left: 50%;
                            transform: translate(-50%, -50%) rotate(225deg);
                            transform-origin: bottom center;
                        }

                        /* Hit animation */
                        .hit-animation .crosshair-line {
                            animation: crosshair-hit 0.15s ease-out;
                        }

                        .hit-animation .center-dot {
                            animation: center-hit 0.15s ease-out;
                        }

                        .hit-animation .diagonal-line {
                            animation: diagonal-expand 0.2s ease-out;
                        }

                        @keyframes crosshair-hit {
                            0% {
                                background-color: #ffffff;
                                box-shadow: 0 0 4px rgba(0, 0, 0, 0.8);
                            }
                            50% {
                                background-color: #00ff00;
                                box-shadow: 0 0 12px #00ff00, 0 0 4px rgba(0, 0, 0, 0.8);
                            }
                            100% {
                                background-color: #ffffff;
                                box-shadow: 0 0 4px rgba(0, 0, 0, 0.8);
                            }
                        }

                        @keyframes center-hit {
                            0% {
                                background-color: #ffffff;
                                transform: translate(-50%, -50%) scale(1);
                                box-shadow: 0 0 4px rgba(0, 0, 0, 0.8);
                            }
                            50% {
                                background-color: #00ff00;
                                transform: translate(-50%, -50%) scale(2);
                                box-shadow: 0 0 12px #00ff00, 0 0 4px rgba(0, 0, 0, 0.8);
                            }
                            100% {
                                background-color: #ffffff;
                                transform: translate(-50%, -50%) scale(1);
                                box-shadow: 0 0 4px rgba(0, 0, 0, 0.8);
                            }
                        }

                        @keyframes diagonal-expand {
                            0% {
                                opacity: 1;
                                transform: translate(-50%, -50%) rotate(var(--rotation)) scale(0.5);
                            }
                            50% {
                                opacity: 1;
                                transform: translate(-50%, -50%) rotate(var(--rotation)) scale(1) translateY(-10px);
                            }
                            100% {
                                opacity: 0;
                                transform: translate(-50%, -50%) rotate(var(--rotation)) scale(1.2) translateY(-20px);
                            }
                        }

                        .diagonal-tl { --rotation: -45deg; }
                        .diagonal-tr { --rotation: 45deg; }
                        .diagonal-bl { --rotation: 135deg; }
                        .diagonal-br { --rotation: 225deg; }
                    `}
                </style>
                
                <div 
                    className="crosshair-container" 
                    ref={animationRef}
                >
                    {/* Main crosshair lines */}
                    <div className="crosshair-line horizontal-line"></div>
                    <div className="crosshair-line vertical-line"></div>
                    <div className="crosshair-line center-dot"></div>
                    
                    {/* Diagonal hit indicators */}
                    <div className="diagonal-line diagonal-tl"></div>
                    <div className="diagonal-line diagonal-tr"></div>
                    <div className="diagonal-line diagonal-bl"></div>
                    <div className="diagonal-line diagonal-br"></div>
                </div>
            </>
        );
    })
);