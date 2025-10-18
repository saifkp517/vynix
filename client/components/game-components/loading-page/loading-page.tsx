"use client";

import React, { useState, useEffect } from "react";
import { Trees } from "lucide-react";

export default function GameLoading() {
    const [mounted, setMounted] = useState(false);
    const [loadingText, setLoadingText] = useState("Initializing");

    const loadingStates = [
        "Initializing...",
        "Loading assets...",
        "Connecting to servers...",
        "Preparing arena...",
        "Almost ready..."
    ];

    if (!mounted) return null;

    return (
        <div className="flex min-h-screen bg-background text-foreground transition-colors overflow-hidden relative">
            {/* Background Image + Blur + Overlay */}
            <div className="absolute inset-0 z-0 pointer-events-none">
                <div className="absolute inset-0 bg-cover bg-center blur-md" style={{ backgroundImage: "url('/images/background.png')" }} />
                <div className="absolute inset-0 bg-black/10" />
            </div>

            <div className="hidden lg:flex lg:w-full bg-muted/40 flex-col items-center justify-center p-8 relative overflow-hidden">
                <div className="max-w-md space-y-8 text-center z-10">
                    <div>
                        <h1 className="text-5xl font-bold mb-2 text-primary">
                            <Trees className="inline-block mr-2 h-8 w-8" /> Zentra
                        </h1>
                        <h2 className="text-2xl font-semibold">Epic Combat Arena</h2>
                    </div>
                </div>

                {/* Option 1: Pulsing Dots Loader */}
                <div className="absolute bottom-16 left-1/2 transform -translate-x-1/2 z-10">
                    <div className="flex space-x-2">
                        <div className="w-3 h-3 bg-white rounded-full animate-pulse" style={{ animationDelay: '0ms' }}></div>
                        <div className="w-3 h-3 bg-white rounded-full animate-pulse" style={{ animationDelay: '150ms' }}></div>
                        <div className="w-3 h-3 bg-white rounded-full animate-pulse" style={{ animationDelay: '300ms' }}></div>
                        <div className="w-3 h-3 bg-white rounded-full animate-pulse" style={{ animationDelay: '450ms' }}></div>
                    </div>
                    <p className="text-white/80 text-sm mt-4 font-medium">{loadingText}</p>
                </div>

                {/* Option 2: Spinning Ring (uncomment to use instead) */}
                {/*
                <div className="absolute bottom-16 left-1/2 transform -translate-x-1/2 z-10">
                    <div className="relative">
                        <div className="w-12 h-12 border-4 border-white/20 border-t-white rounded-full animate-spin"></div>
                        <div className="absolute inset-0 w-12 h-12 border-4 border-transparent border-r-white/60 rounded-full animate-spin" style={{ animationDirection: 'reverse', animationDuration: '1.5s' }}></div>
                    </div>
                    <p className="text-white/80 text-sm mt-4 font-medium text-center">{loadingText}</p>
                </div>
                */}

                {/* Option 3: Bouncing Balls (uncomment to use instead) */}
                {/*
                <div className="absolute bottom-16 left-1/2 transform -translate-x-1/2 z-10">
                    <div className="flex space-x-1">
                        <div className="w-4 h-4 bg-white rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                        <div className="w-4 h-4 bg-white rounded-full animate-bounce" style={{ animationDelay: '100ms' }}></div>
                        <div className="w-4 h-4 bg-white rounded-full animate-bounce" style={{ animationDelay: '200ms' }}></div>
                    </div>
                    <p className="text-white/80 text-sm mt-4 font-medium text-center">{loadingText}</p>
                </div>
                */}

                {/* Option 4: Morphing Squares (uncomment to use instead) */}
                {/*
                <div className="absolute bottom-16 left-1/2 transform -translate-x-1/2 z-10">
                    <div className="grid grid-cols-2 gap-1 w-8 h-8">
                        <div className="bg-white animate-pulse" style={{ animationDelay: '0ms' }}></div>
                        <div className="bg-white animate-pulse" style={{ animationDelay: '200ms' }}></div>
                        <div className="bg-white animate-pulse" style={{ animationDelay: '400ms' }}></div>
                        <div className="bg-white animate-pulse" style={{ animationDelay: '600ms' }}></div>
                    </div>
                    <p className="text-white/80 text-sm mt-4 font-medium text-center">{loadingText}</p>
                </div>
                */}

                {/* Option 5: Typewriter Effect (uncomment to use instead) */}
                {/*
                <div className="absolute bottom-16 left-1/2 transform -translate-x-1/2 z-10">
                    <div className="text-white text-lg font-mono">
                        {loadingText}
                        <span className="animate-pulse">|</span>
                    </div>
                </div>
                */}

                <div className="absolute bottom-4 right-4 font-mono text-xs text-muted-foreground">
                    Build: v2.4.3
                </div>
            </div>
        </div>
    );
}