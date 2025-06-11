"use client";

import React, { useState, useEffect } from "react";
import { Trees } from "lucide-react";
import { redirect } from "next/navigation";
import { useAuth } from "@/app/utils/AuthContext";

export default function GameLoading() {
    const { user } = useAuth();
    const [mounted, setMounted] = useState(false);
    const [loadingProgress, setLoadingProgress] = useState(0);

    useEffect(() => {
        if (user) {
            redirect("/");
        }
    }, [user]);

    useEffect(() => {
        setMounted(true);
        // Simulate loading progress
        const interval = setInterval(() => {
            setLoadingProgress((prev) => {
                if (prev >= 100) {
                    clearInterval(interval);
                    return 100;
                }
                return prev + 1;
            });
        }, 50);
        return () => clearInterval(interval);
    }, []);

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
                <div className="absolute bottom-12 right-0 left-0 px-8 z-10">
                    <div className="w-full bg-white/20 rounded-full h-1.5">
                        <div
                            className="bg-white h-1.5 animate-pulse rounded-full transition-all duration-300"
                            style={{ width: '60%' }} // Static for demo; can be dynamic with state
                        ></div>
                    </div>
                </div>

                <div className="absolute bottom-4 right-4 font-mono text-xs text-muted-foreground">
                    Build: v2.4.3
                </div>
            </div>


        </div>
    );
}