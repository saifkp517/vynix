"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { Eye, EyeOff, Mail, Lock, Swords, Shield, Crown, Zap as Lightning, Trees, Shield as Knight } from "lucide-react";

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
import { useThemeConfig } from "./theme-provider";
import { getRadiusClass } from "@/lib/theme-config";
import { redirect } from "next/navigation";

import { GameHeader } from "@/components/custom/GameHeader";
import { useAuth } from "./utils/AuthContext";


export default function GameLoginPage() {

  const { user, loginUser, registerUser } = useAuth();
  const [playerName, setPlayerName] = useState("")
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLogin, setIsLogin] = useState(true);
  const { theme: configTheme } = useThemeConfig();
  const [mounted, setMounted] = useState(false);

  const handleFullScreen = () => {
    if (document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen();
    }
    redirect("/forest")
  };


  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (isLogin) {
      const result = await loginUser(email, password);
      if (result.success) {
        setSuccess("Entering the battlefield...");
        redirect("/forest")
      } else {
        setError(result.message || "Unexpected Error");
      }
    } else {
      const result = await registerUser(playerName!, email, password);
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

      {/* Background Image + Blur + Overlay */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        {/* Image container with blur */}
        <div className="absolute inset-0 bg-cover bg-center blur-md" style={{ backgroundImage: "url('/images/background.png')" }} />

        {/* Optional: a soft translucent overlay */}
        <div className="absolute inset-0 bg-black/10" />
      </div>

      {/* Left Side (Game Stats & Leaderboard) */}
      <div className=" hidden lg:flex lg:w-1/2 bg-muted/40 flex-col items-center justify-center p-8 relative overflow-hidden">
        <div className="w-full text-center z-10">
          {/* RoomsUI would come in place of this div below */}
          {/* Header */}
          <GameHeader />


        </div>

        {/* Decorative Elements */}
        <div className="absolute bottom-4 right-4 font-mono text-xs text-muted-foreground">
          Build: v2.4.3
        </div>
      </div>

      {/* Right Side (Login Form) */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8">
        <Card className={`w-full max-w-md border-gray-300 shadow-lg relative ${radiusClass} overflow-hidden bg-white`}>
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 via-emerald-600 to-emerald-500"></div>

          <CardHeader className="space-y-1">
            <div className="flex justify-center mb-2">
              <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center">
                {isLogin ?
                  <Swords className="h-6 w-6 text-emerald-600" /> :
                  <Knight className="h-6 w-6 text-emerald-600" />
                }
              </div>
            </div>
            <CardTitle className="text-2xl font-bold text-center text-gray-800">
              {isLogin ? "Enter The Battlefield" : "Forge Your Legend"}
            </CardTitle>
            <CardDescription className="text-center text-gray-600">
              {isLogin ?
                "Sign in to battle fierce opponents and claim your glory" :
                "Register to begin your warrior's journey and join the fray"
              }
            </CardDescription>
          </CardHeader>

          <CardContent>
            <form className="space-y-4" onSubmit={handleAuth}>
              {/* Email Field */}
              <div className="relative">
                <Mail className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <Input onChange={(e) => setEmail(e.target.value)} placeholder="email" type="text" className="pl-10 text-gray-800 border-gray-300" />
              </div>

              {/* Registration-only fields */}
              {!isLogin && (
                <div className="relative">
                  <Mail className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                  <Input onChange={(e) => setPlayerName(e.target.value)} placeholder="player name" type="text" className="pl-10 text-gray-800 border-gray-300" />
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
                    <Label htmlFor="remember" className="text-sm font-medium cursor-pointer text-gray-800">Keep me battle-ready</Label>
                  </div>
                  <Link href="/forgot-password" className="text-sm font-medium text-emerald-700 hover:text-emerald-600">
                    Forgot password?
                  </Link>
                </div>
              )}

              {/* Terms & Conditions (Registration only) */}
              {!isLogin && (
                <div className="flex items-center space-x-2">
                  <Checkbox id="terms" />
                  <Label htmlFor="terms" className="text-sm font-medium cursor-pointer text-gray-800">
                    I accept the{" "}
                    <Link href="/terms" className="text-emerald-600 hover:text-emerald-500">
                      Code of Honor
                    </Link>
                  </Label>
                </div>
              )}

              {/* Submit Button */}
              {/* <Button type="submit" className="w-full relative overflow-hidden bg-emerald-600 text-white hover:bg-emerald-500">
                <span className="relative z-10">{isLogin ? "Charge Into Battle" : "Forge Account"}</span>
              </Button> */}
              <Button type="submit" className="w-full relative overflow-hidden bg-emerald-600 text-white hover:bg-emerald-500">
                <span className="relative z-10">Sign In</span>
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
                <span className="bg-white px-2 text-gray-500">Or join as</span>
              </div>
            </div>

            {/* Social Login Buttons */}
            <div className="grid ">
              <Button onClick={() => handleFullScreen} variant="outline" type="button" className="w-full border-gray-300 text-gray-300 cursor-pointer">
                <Crown className="h-4 w-4 mr-1 cursor-pointer" />
                <Link href="/forest">
                  Guest
                </Link>
              </Button>
            </div>
          </CardContent>

          {/* Footer (Toggle between Login/Register) */}
          <CardFooter className="flex justify-center">
            <p className="text-sm text-gray-600">
              {isLogin ? "New to the fight? " : "Already a warrior? "}
              <button
                onClick={() => setIsLogin(!isLogin)}
                className="cursor-pointer text-emerald-600 hover:text-emerald-500 font-medium "
              >
                {isLogin ? "Forge your warrior profile" : "Return to battle"}
              </button>
            </p>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}