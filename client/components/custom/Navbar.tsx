'use client'
import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
    Bell,
    Menu,
    X,
    Trophy,
    Settings,
    LogOut,
    MessageSquare,
    User,
    Code,
    Home,
    Moon,
    Sun
} from 'lucide-react';
import Link from 'next/link';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useRouter } from 'next/navigation';
import { useThemeConfig } from '@/app/theme-provider';
import { useAuth } from '@/app/utils/AuthContext';

interface NavbarProps {
    username?: string;
    icon?: string;
    eloscore?: number;
}

const Navbar = ({ username, icon, eloscore }: NavbarProps) => {
    const { logOutUser } = useAuth();
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

    const router = useRouter();
    const { theme, updateTheme  } = useThemeConfig();

    const handleLogout = () => {
        // Add logout logic here
        logOutUser();
        // router.push('/login');
    };

    const toggleTheme = () => {
        const newTheme = theme.name === "dark" ? "light" : "dark";
        updateTheme({ name: newTheme });
    };
    


    return (
        <nav className={`rounded-xl ${theme.name === 'dark' ? 'bg-gray-900 text-white' : 'bg-white text-gray-900'} border-b ${theme.name === 'dark' ? 'border-gray-800' : 'border-gray-200'} w-full py-3 px-4`}>
            <div className="max-w-6xl mx-auto flex justify-between items-center">
                {/* Logo and Brand */}
                <div className="flex items-center space-x-2">
                    <Link href="/dashboard" className="flex items-center">
                        <Code className={`h-8 w-8 ${theme.name === 'dark' ? 'text-blue-400' : 'text-blue-600'}`} />
                        <span className="ml-2 text-xl font-bold">Vynix</span>
                    </Link>
                </div>

                {/* Desktop Navigation */}
                {/* <div className="hidden md:flex items-center space-x-6">
                    <Link href="/dashboard" className={`flex items-center ${theme.name === 'dark' ? 'text-gray-300 hover:text-blue-400' : 'text-gray-700 hover:text-blue-600'}`}>
                        <Home className="h-5 w-5 mr-1" />
                        <span>Home</span>
                    </Link>
                    <Link href="/battle" className={`flex items-center ${theme.name === 'dark' ? 'text-gray-300 hover:text-blue-400' : 'text-gray-700 hover:text-blue-600'}`}>
                        <Code className="h-5 w-5 mr-1" />
                        <span>Battle</span>
                    </Link>
                    <Link href="/practice" className={`flex items-center ${theme.name === 'dark' ? 'text-gray-300 hover:text-blue-400' : 'text-gray-700 hover:text-blue-600'}`}>
                        <User className="h-5 w-5 mr-1" />
                        <span>Practice</span>
                    </Link>
                    <Link href="/messages" className={`flex items-center ${theme.name === 'dark' ? 'text-gray-300 hover:text-blue-400' : 'text-gray-700 hover:text-blue-600'}`}>
                        <MessageSquare className="h-5 w-5 mr-1" />
                        <span>Messages</span>
                    </Link>
                </div> */}

                {/* User Section */}
                <div className="flex items-center space-x-4">
                    {/* Theme Toggle */}
                    <Button variant="ghost" size="icon" onClick={toggleTheme} className="hidden md:flex">
                        {theme.name === 'dark' ? (
                            <Sun className="h-5 w-5 text-yellow-300" />
                        ) : (
                            <Moon className="h-5 w-5" />
                        )}
                    </Button>

                    {/* Notifications */}
                    {/* <Button variant="ghost" size="icon" className="relative hidden md:flex">
                        <Bell className="h-5 w-5" />
                        <span className="absolute top-0 right-0 h-2 w-2 bg-red-500 rounded-full"></span>
                    </Button> */}

                    {/* User Profile and Score */}
                    <div className="flex items-center space-x-2">
                        <Badge variant="outline" className={`${theme.name === 'dark' ? 'bg-amber-900' : 'bg-amber-100'} hidden md:flex`}>
                            <Trophy className="w-3 h-3 mr-1 text-amber-500" />
                            {eloscore || 0}
                        </Badge>

                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" className="p-1 rounded-full flex items-center">
                                    <Avatar className="h-8 w-8">
                                        <AvatarImage src={icon || "/api/placeholder/30/30"} />
                                        <AvatarFallback>{username?.charAt(0) || 'U'}</AvatarFallback>
                                    </Avatar>
                                    <span className="mr-2 font-medium hidden md:inline">{username || 'User'}</span>
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className={`w-56 ${theme.name === 'dark' ? 'bg-gray-800 text-gray-100' : ''}`}>
                                <DropdownMenuLabel>My Account</DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem className="cursor-pointer">
                                    <User className="mr-2 h-4 w-4" />
                                    <span>Profile</span>
                                </DropdownMenuItem>
                                <DropdownMenuItem className="cursor-pointer">
                                    <Trophy className="mr-2 h-4 w-4" />
                                    <span>Battle History</span>
                                </DropdownMenuItem>
                                <DropdownMenuItem className="cursor-pointer">
                                    <Settings className="mr-2 h-4 w-4" />
                                    <span>Settings</span>
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={toggleTheme} className="cursor-pointer">
                                    {theme.name === 'dark' ? (
                                        <><Sun className="mr-2 h-4 w-4 text-yellow-300" /><span>Light Mode</span></>
                                    ) : (
                                        <><Moon className="mr-2 h-4 w-4" /><span>Dark Mode</span></>
                                    )}
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={handleLogout} className={`cursor-pointer ${theme.name === 'dark' ? 'text-red-400' : 'text-red-600'}`}>
                                    <LogOut className="mr-2 h-4 w-4" />
                                    <span>Log out</span>
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>

                    {/* Mobile Menu Button */}
                    <Button
                        variant="ghost"
                        size="icon"
                        className="md:hidden"
                        onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                    >
                        {mobileMenuOpen ? (
                            <X className="h-6 w-6" />
                        ) : (
                            <Menu className="h-6 w-6" />
                        )}
                    </Button>
                </div>
            </div>

            {/* Mobile Menu */}
            {mobileMenuOpen && (
                <div className={`md:hidden mt-3 pt-3 ${theme.name === 'dark' ? 'border-t border-gray-800' : 'border-t'}`}>
                    <div className="flex flex-col space-y-3 px-2">
                        <Link href="/dashboard" className={`flex items-center p-2 rounded-md ${theme.name === 'dark' ? 'hover:bg-gray-800' : 'hover:bg-gray-100'}`}>
                            <Home className="h-5 w-5 mr-3" />
                            <span>Home</span>
                        </Link>
                        <Link href="/battle" className={`flex items-center p-2 rounded-md ${theme.name === 'dark' ? 'hover:bg-gray-800' : 'hover:bg-gray-100'}`}>
                            <Code className="h-5 w-5 mr-3" />
                            <span>Battle</span>
                        </Link>
                        <Link href="/practice" className={`flex items-center p-2 rounded-md ${theme.name === 'dark' ? 'hover:bg-gray-800' : 'hover:bg-gray-100'}`}>
                            <User className="h-5 w-5 mr-3" />
                            <span>Practice</span>
                        </Link>
                        <Link href="/messages" className={`flex items-center p-2 rounded-md ${theme.name === 'dark' ? 'hover:bg-gray-800' : 'hover:bg-gray-100'}`}>
                            <MessageSquare className="h-5 w-5 mr-3" />
                            <span>Messages</span>
                        </Link>
                        <Link href="/notifications" className={`flex items-center p-2 rounded-md ${theme.name === 'dark' ? 'hover:bg-gray-800' : 'hover:bg-gray-100'}`}>
                            <Bell className="h-5 w-5 mr-3" />
                            <span>Notifications</span>
                            <span className="ml-auto h-2 w-2 bg-red-500 rounded-full"></span>
                        </Link>
                        <div className={`flex items-center justify-between p-2 rounded-md ${theme.name === 'dark' ? 'hover:bg-gray-800' : 'hover:bg-gray-100'}`}>
                            <div className="flex items-center">
                                <Trophy className="h-5 w-5 mr-3 text-amber-500" />
                                <span>ELO Score</span>
                            </div>
                            <Badge variant="outline" className={theme.name === 'dark' ? 'bg-amber-900' : 'bg-amber-100'}>
                                {eloscore || 0}
                            </Badge>
                        </div>
                        <button
                            onClick={toggleTheme}
                            className={`flex items-center p-2 rounded-md ${theme.name === 'dark' ? 'hover:bg-gray-800' : 'hover:bg-gray-100'}`}
                        >
                            {theme.name === 'dark' ? (
                                <>
                                    <Sun className="h-5 w-5 mr-3 text-yellow-300" />
                                    <span>Light Mode</span>
                                </>
                            ) : (
                                <>
                                    <Moon className="h-5 w-5 mr-3" />
                                    <span>Dark Mode</span>
                                </>
                            )}
                        </button>
                        <div className={`${theme.name === 'dark' ? 'border-t border-gray-800' : 'border-t'} pt-2`}>
                            <Button
                                variant="destructive"
                                className="w-full mt-2"
                                onClick={handleLogout}
                            >
                                <LogOut className="h-5 w-5 mr-2" />
                                Log Out
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </nav>
    );
};

export default Navbar;