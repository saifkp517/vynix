"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { Eye, EyeOff, Mail, Lock, Github, Code, Trophy, Zap, Terminal, UserPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { useThemeConfig } from "../theme-provider";
import { getRadiusClass } from "@/lib/theme-config";
import { redirect } from "next/navigation";
import { useAuth } from "../utils/AuthContext";
import axios from "axios";

export default function LoginPage() {

    const {user, loginUser, registerUser} = useAuth();
    const [username, setUsername] = useState("")
    const [email, setEmail] = useState("");
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [isLogin, setIsLogin] = useState(true);
    const { theme: configTheme } = useThemeConfig();
    const [mounted, setMounted] = useState(false);
    const [leaderboardData, setLeaderboardData] = useState([
        { name: "OverclockedMind", wins: 143, rank: 1 },
        { name: "SegfaultKing", wins: 137, rank: 2 },
        { name: "ByteCrusher", wins: 129, rank: 3 },
    ]);

    useEffect(() => {
        if (user) {
            redirect("/");
        }
    }, [user]);
    


    const handleAuth = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        setSuccess("");

        if (isLogin) {
            const result = await loginUser(email, password);
            if (result.success) {
                setSuccess("Logging in...");
                redirect("/");
            } else {
                setError(result.message || "Unexpected Error");
            }
        } else {
            const result = await registerUser(username!, email, password);
            if (result.success) {
                setSuccess(result.message);
                setIsLogin(true);
            } else {
                setError(result.message);
            }
        }
    };


    useEffect(() => {
        setMounted(true);
    }, []);

    if (!mounted) return null; // Ensure consistent hook calls


    const radiusClass = getRadiusClass(configTheme.borderRadius);

    return (
        <div className="flex min-h-screen bg-background text-foreground transition-colors overflow-hidden relative">

            {/* Animated Code Background */}
            <div className="absolute inset-0 opacity-10 pointer-events-none overflow-hidden">
                <div className="animate-scroll-slow font-mono text-xs opacity-50 text-primary">
                    {Array.from({ length: 50 }).map((_, i) => (
                        <div key={i} className="my-2">
                            {`function solve(array) {`}
                            <br />
                            {`  let dp = new Array(array.length).fill(0);`}
                            <br />
                            {`  dp[0] = array[0];`}
                            <br />
                            {`  for(let i = 1; i < array.length; i++) {`}
                            <br />
                            {`    dp[i] = Math.max(dp[i-1] + array[i], array[i]);`}
                            <br />
                            {`  }`}
                            <br />
                            {`  return Math.max(...dp);`}
                            <br />
                            {`}`}
                        </div>
                    ))}
                </div>
            </div>

            {/* Left Side (Game Stats & Leaderboard) */}
            <div className="hidden lg:flex lg:w-1/2 bg-muted/50 dark:bg-muted/30 flex-col items-center justify-center p-8 relative overflow-hidden">
                <div className="max-w-md space-y-8 text-center z-10">
                    <div>
                        <h1 className="text-5xl font-bold mb-2 text-primary">
                            <Terminal className="inline-block mr-2 h-8 w-8" /> AlgoArena
                        </h1>
                        <h2 className="text-2xl font-semibold">Problem Solving Battle Royale</h2>
                        <div className="flex justify-center gap-2 mt-3">
                            <Badge variant="outline" className="px-3 py-1">
                                <Zap className="h-4 w-4 mr-1" /> Daily Challenges
                            </Badge>
                            <Badge variant="outline" className="px-3 py-1">
                                <Trophy className="h-4 w-4 mr-1" /> Live Tournaments
                            </Badge>
                        </div>
                    </div>

                    <Card className={`bg-card/80 border-primary/20 ${radiusClass} overflow-hidden`}>
                        <CardHeader className="bg-primary/10 pb-2">
                            <CardTitle className="flex items-center justify-center">
                                <Trophy className="mr-2 h-5 w-5 text-primary" />
                                <span>Leaderboard Champions</span>
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="pt-4">
                            <div className="space-y-3">
                                {leaderboardData.map((player, index) => (
                                    <div key={index} className="flex items-center justify-between p-2 bg-muted/30 rounded">
                                        <div className="flex items-center">
                                            <span className={`w-6 h-6 flex items-center justify-center mr-2 ${index === 0 ? "bg-yellow-500/20 text-yellow-500" :
                                                index === 1 ? "bg-slate-300/20 text-slate-300" :
                                                    "bg-amber-700/20 text-amber-700"
                                                } rounded-full font-bold`}>
                                                {player.rank}
                                            </span>
                                            <span className="font-medium">{player.name}</span>
                                        </div>
                                        <span className="text-primary font-mono">
                                            {player.wins} <span className="text-xs text-muted-foreground">wins</span>
                                        </span>
                                    </div>
                                ))}
                            </div>

                            <div className="mt-6 text-sm text-muted-foreground italic">
                                "In CodeBattle, algorithms are your weapons, logic is your shield, and every solution is a victory."
                            </div>
                        </CardContent>
                    </Card>

                    <div className="animate-pulse text-primary font-semibold">
                        Next tournament starts in 02:43:18
                    </div>
                </div>

                {/* Decorative Elements */}
                <div className="absolute bottom-4 right-4 font-mono text-xs text-muted-foreground">
                    Build: v2.4.3 • Online Players: 1,342
                </div>
            </div>

            {/* Right Side (Login Form) */}
            <div className="w-full lg:w-1/2 flex items-center justify-center p-8">
                <Card className={`w-full max-w-md border-gray-300 shadow-lg relative ${radiusClass} overflow-hidden bg-white`}>
                    <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-orange-400 via-orange-500 to-orange-400"></div>

                    <CardHeader className="space-y-1">
                        <div className="flex justify-center mb-2">
                            <div className="w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center">
                                {isLogin ?
                                    <Code className="h-6 w-6 text-orange-600" /> :
                                    <UserPlus className="h-6 w-6 text-orange-600" />
                                }
                            </div>
                        </div>
                        <CardTitle className="text-2xl font-bold text-center text-gray-800">
                            {isLogin ? "Join The Battle" : "Create Your Account"}
                        </CardTitle>
                        <CardDescription className="text-center text-gray-600">
                            {isLogin ?
                                "Sign in to compete in coding challenges and climb the ranks" :
                                "Register to start your coding journey and join the competition"
                            }
                        </CardDescription>
                    </CardHeader>

                    <CardContent>
                        <form className="space-y-4" onSubmit={handleAuth}>
                            {/* Username Field */}
                            <div className="relative">
                                <Mail className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                                <Input onChange={(e) => setEmail(e.target.value)} placeholder="email" type="text" className="pl-10 text-gray-800 border-gray-300" />
                            </div>

                            {/* Registration-only fields */}
                            {!isLogin && (

                                <div className="relative">
                                    <Mail className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                                    <Input onChange={(e) => setUsername(e.target.value)} placeholder="username" type="text" className="pl-10 text-gray-800 border-gray-300" />
                                </div>
                            )}

                            {/* Password Field */}
                            <div className="relative">
                                <Lock className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                                <Input
                                    placeholder="password"
                                    onChange={(e) => setPassword(e.target.value)}
                                    type={showPassword ? "text" : "password"}
                                    className="pl-10 pr-10 text-gray-800 border-gray-300"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-3 top-3 text-gray-400 hover:text-gray-600"
                                >
                                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </button>
                            </div>

                            {/* Remember Me & Forgot Password (Login only) */}
                            {isLogin && (
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center space-x-2">
                                        <Checkbox id="remember" />
                                        <Label htmlFor="remember" className="text-sm font-medium cursor-pointer text-gray-800">Remember me</Label>
                                    </div>
                                    <Link href="/forgot-password" className="text-sm font-medium text-orange-600 hover:text-orange-500">
                                        Forgot password?
                                    </Link>
                                </div>
                            )}

                            {/* Terms & Conditions (Registration only) */}
                            {!isLogin && (
                                <div className="flex items-center space-x-2">
                                    <Checkbox id="terms" />
                                    <Label htmlFor="terms" className="text-sm font-medium cursor-pointer text-gray-800">
                                        I agree to the{" "}
                                        <Link href="/terms" className="text-orange-600 hover:text-orange-500">
                                            Terms & Conditions
                                        </Link>
                                    </Label>
                                </div>
                            )}

                            {/* Submit Button */}
                            <Button type="submit" className="w-full relative overflow-hidden bg-orange-600 text-white hover:bg-orange-500">
                                <span className="relative z-10">{isLogin ? "Enter Arena" : "Create Account"}</span>
                            </Button>
                            {success && <p className="text-gray-600">{success}</p>}
                            {error && <p className="text-gray-600">{error}</p>}
                        </form>

                        {/* Divider */}
                        <div className="relative my-4">
                            <div className="absolute inset-0 flex items-center">
                                <Separator className="w-full" />
                            </div>
                            <div className="relative flex justify-center text-xs uppercase">
                                <span className="bg-white px-2 text-gray-500">Or continue with</span>
                            </div>
                        </div>

                        {/* Social Login Buttons */}
                        <div className="grid grid-cols-2 gap-4">
                            <Button onClick={() => {}} variant="outline" type="button" className="w-full border-gray-300 text-gray-500 cursor-pointer">
                                <svg className="mr-2 h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">
                                    <path fill="#FFC107" d="M43.611,20.083H42V20H24v8h11.303c-1.649,4.657-6.08,8-11.303,8c-6.627,0-12-5.373-12-12c0-6.627,5.373-12,12-12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C12.955,4,4,12.955,4,24c0,11.045,8.955,20,20,20c11.045,0,20-8.955,20-20C44,22.659,43.862,21.35,43.611,20.083z" />
                                    <path fill="#FF3D00" d="M6.306,14.691l6.571,4.819C14.655,15.108,18.961,12,24,12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C16.318,4,9.656,8.337,6.306,14.691z" />
                                </svg>
                                Google
                            </Button>
                            <Button variant="outline" type="button" className="w-full border-gray-300 text-gray-500 cursor-pointer">
                                <Github className="mr-2 h-4 w-4" />
                                GitHub
                            </Button>
                        </div>
                    </CardContent>

                    {/* Footer (Toggle between Login/Register) */}
                    <CardFooter className="flex justify-center">
                        <p className="text-sm text-gray-600">
                            {isLogin ? "First time coder? " : "Already have an account? "}
                            <button
                                onClick={() => setIsLogin(!isLogin)}
                                className="cursor-pointer text-orange-600 hover:text-orange-500 font-medium "
                            >
                                {isLogin ? "Create your battle profile" : "Sign in instead"}
                            </button>
                        </p>
                    </CardFooter>
                </Card>
            </div>
        </div>
    );
}