"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { Truck } from "lucide-react";
import { auth, db } from "@/lib/firebase";

export default function SplashScreen() {
  const router = useRouter();
  const [statusMessage, setStatusMessage] = useState("Initializing ERP...");

  useEffect(() => {
    // 2.5 सेकंड का मिनिमम होल्ड टाइम ताकि फ्लटर जैसा स्प्लैश फील आए
    const splashTimer = setTimeout(() => {
      const unsubscribe = onAuthStateChanged(auth, async (user) => {
        if (user) {
          setStatusMessage("Checking business profile...");
          try {
            const docRef = doc(db, "users", user.uid);
            const docSnap = await getDoc(docRef);

            if (docSnap.exists() && docSnap.data().isProfileComplete) {
              setStatusMessage("Access Granted. Opening Dashboard...");
              router.push("/dashboard");
            } else {
              setStatusMessage("Profile incomplete. Redirecting...");
              router.push("/profile-setup");
            }
          } catch (error) {
            console.error("Error fetching profile:", error);
            router.push("/login");
          }
        } else {
          setStatusMessage("Secure gateway ready...");
          router.push("/login");
        }
      });

      return () => unsubscribe();
    }, 2500);

    return () => clearTimeout(splashTimer);
  }, [router]);

  return (
    <div className="h-screen w-screen flex flex-col items-center justify-between bg-brand-navy text-white p-8 select-none">
      {/* Top Spacer for Center Alignment */}
      <div></div>

      {/* Center Logo & Brand Name */}
      <div className="flex flex-col items-center animate-fade-in text-center">
        {/* Animated Icon Container */}
        <div className="p-5 bg-brand-blue/10 border border-brand-blue/20 text-brand-cyan rounded-3xl mb-5 shadow-2xl shadow-brand-blue/20 relative overflow-hidden group">
          <Truck size={56} className="animate-pulse" />
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full animate-[shimmer_2s_infinite]" />
        </div>
        
        {/* Main Title */}
        <h1 className="text-4xl font-black tracking-tight bg-gradient-to-b from-white to-slate-300 bg-clip-text text-transparent">
          FreightPay
        </h1>
        
        {/* Subtitle */}
        <p className="text-xs text-brand-cyan font-bold uppercase tracking-widest mt-2">
          Coal Payment Discounting ERP
        </p>
      </div>

      {/* Bottom Loading / Progress Section */}
      <div className="w-full max-w-xs flex flex-col items-center mb-6">
        {/* Custom Native-like Linear Progress Indicator */}
        <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden mb-3">
          <div className="h-full bg-gradient-to-r from-brand-blue to-brand-cyan rounded-full animate-[loading-bar_2s_ease-in-out_infinite]" />
        </div>
        
        {/* Dynamic Status Text */}
        <p className="text-[11px] text-slate-400 font-medium tracking-wide animate-pulse">
          {statusMessage}
        </p>
      </div>
    </div>
  );
}