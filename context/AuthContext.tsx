"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged, User } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "../lib/firebase";
import { useRouter, usePathname } from "next/navigation";

interface UserProfile {
  firmName: string;
  panNumber: string;
  mobileNumber: string;
  officeAddress: string;
  isProfileComplete: boolean;
}

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: true,
  refreshProfile: async () => {},
});

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  const fetchProfile = async (uid: string) => {
    try {
      const docRef = doc(db, "users", uid);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const data = docSnap.data() as UserProfile;
        setProfile(data);
        return data;
      }
      setProfile(null);
      return null;
    } catch (error) {
      console.error("Error fetching profile:", error);
      return null;
    }
  };

  const refreshProfile = async () => {
    if (user) await fetchProfile(user.uid);
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      
      if (currentUser) {
        const userProfile = await fetchProfile(currentUser.uid);
        
        // Dynamic Security Guard: बिना प्रोफाइल कम्पलीट किये डैशबोर्ड ब्लॉक रहेगा
        if (!userProfile || !userProfile.isProfileComplete) {
          if (pathname !== "/profile-setup") {
            router.push("/profile-setup");
          }
        } else if (pathname === "/login" || pathname === "/signup" || pathname === "/profile-setup" || pathname === "/") {
          router.push("/dashboard");
        }
      } else {
        setProfile(null);
        // अगर यूजर लॉग-इन नहीं है और डैशबोर्ड या प्रोफाइल सेटअप पर जाने की कोशिश करे, तो लॉगिन पर भेजें
        if (pathname.startsWith("/dashboard") || pathname === "/profile-setup") {
          router.push("/login");
        }
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user, pathname, router]);

  return (
    <AuthContext.Provider value={{ user, profile, loading, refreshProfile }}>
      {loading ? (
        <div className="h-screen w-screen flex flex-col items-center justify-center bg-brand-navy text-white">
          <div className="animate-spin rounded-full h-12 w-12 border-t-4 border-b-4 border-brand-cyan mb-4"></div>
          <p className="text-sm font-medium tracking-wide">FreightPay Tools Loading...</p>
        </div>
      ) : (
        children
      )}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);