import React, { createContext, useContext, useState, useEffect } from "react";
import axios from "axios";
import { redirect } from "next/navigation";

const API_URL = process.env.BACKEND_URL; // Replace with your actual API URL

type ResponseType = {
  success: true;
  message: string; // You can replace `any` with a more specific type if you know the response structure
} | {
  success: false;
  message: string;
};

// Define the context type
interface AuthContextType {
  user: any; // Replace `any` with a proper user type if available
  setUser: React.Dispatch<React.SetStateAction<any>>;
  loggedIn: boolean;
  setLoggedIn: React.Dispatch<React.SetStateAction<boolean>>;
  loading: boolean;
  fetchUser: () => Promise<void>;
  loginUser: (email: string, password: string) => Promise<{ success: boolean; message: string }>;
  registerUser: (username: string, email: string, password: string) => Promise<{ success: boolean; message: string }>;
  fetchUserDetails: () => Promise<{ success: boolean; message?: string }>;
  logOutUser: () => Promise<{ success: boolean; message: string }>;
}

interface user_type {
  username: string;
}



import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

const LoadingSpinner = ({ className }: any) => {
  return (
    <div className={cn("flex items-center justify-center h-full", className)}>
      <Loader2 className="w-10 h-10 animate-spin text-primary" />
    </div>
  );
};

export default LoadingSpinner;


// Create Context
const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Provider Component
export const AuthProvider = ({ children }: { children: React.ReactNode }) => {

  const loginUser = async (email: string, password: string) => {
    try {
      const res = await axios.post(`${API_URL}/auth/login`, { email, password }, { withCredentials: true });
      setLoggedIn(true);
      return { success: true, message: "Successfully Logged In" };
    } catch (error: any) {
      console.error("Login Error:", error);

      if (error.code === "ERR_NETWORK") {
        return { success: false, message: "Network Error - Please try again later" };
      } else if (error.response?.status.toString().startsWith("40")) {
        return { success: false, message: "Invalid Credentials" };
      } else {
        return { success: false, message: "Server Error" };
      }
    }
  }

  const registerUser = async (username: string, email: string, password: string) => {
    try {
      const res = await axios.post(`${API_URL}/auth/register`, { username, email, password });

      return { success: true, message: "User Created Successfully!" };
    } catch (error: any) {
      console.error("Register Error:", error);

      if (error.response?.status.toString().startsWith("40")) {
        return { success: false, message: "User Already Exists" };
      } else if (error.request) {
        return { success: false, message: "No Response from Server" };
      } else {
        return { success: false, message: "Request Failed" };
      }
    }
  };

  const fetchUserDetails = async () => {
    try {
      const res = await axios.get(`${API_URL}/auth/me`, { withCredentials: true });
      console.log(res);
      return { success: true };
    } catch (error: any) {
      console.log("fetchUserDetails Error: " + error);
      return { success: false, message: "Error detching details" };
    }
  }

  const logOutUser = async () => {
    try {
      await axios.post(`${API_URL}/auth/logout`, {}, { withCredentials: true });
      setLoggedIn(false);
      return { success: true, message: "Logged Out Successfully!" };
    } catch (error: any) {
      console.log(error);
      return { success: false, message: "Error logging out" };
    }
  }

  const [user, setUser] = useState<any>(null);
  const [loggedIn, setLoggedIn] = useState(false);
  const [loading, setLoading] = useState(true);

  // Function to fetch user info
  const fetchUser = async () => {
    try {
      const res = await axios.get(`${API_URL}/auth/me`, { withCredentials: true });
      if (res) {
        setUser(res.data);
        setLoggedIn(true);
      }
    } catch (error) {
      console.error("Error fetching user:", error);
    } finally {
      console.log("finally")
      setLoading(false);
    }
  };

  // Fetch user info on mount
  useEffect(() => {
    fetchUser();
  }, []);

  return (
    <AuthContext.Provider value={{
      user,
      setUser,
      loggedIn,
      setLoggedIn,
      loading,
      fetchUser,
      loginUser,
      registerUser,
      fetchUserDetails,
      logOutUser
    }}>
       {!loading ? children : <LoadingSpinner />}
    </AuthContext.Provider>
  );
};

// Custom Hook for easy access
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
