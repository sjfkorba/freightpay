"use client";

import { useState } from "react";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { auth, db } from "../../lib/firebase";
import { doc, setDoc } from "firebase/firestore";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { UserPlus, Lock, Mail, AlertCircle } from "lucide-react";

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      
      // Firestore में यूजर का इनिशियल डेटाबेस डॉक्यूमेंट बनाना
      await setDoc(doc(db, "users", userCredential.user.uid), {
        email,
        isProfileComplete: false,
        createdAt: new Date().toISOString(),
      });
      
      // रजिस्ट्रेशन सफल होने के बाद सीधे प्रोफाइल सेटअप पर भेजें
      router.push("/profile-setup");
    } catch (err: any) {
      // फायरबेस एरर को यूजर फ्रेंडली मैसेज में बदलना
      if (err.code === "auth/email-already-in-use") {
        setError("This email is already registered.");
      } else if (err.code === "auth/weak-password") {
        setError("Password should be at least 6 characters long.");
      } else {
        setError(err.message || "Failed to create account. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-brand-navy md:bg-brand-light">
      <div className="w-full max-w-md bg-brand-navy text-white md:text-brand-navy md:bg-white p-8 rounded-3xl shadow-2xl md:shadow-lg border border-slate-800 md:border-slate-100">
        
        {/* 🔥 लॉगिन कार्ड के टॉप पर आपका लोगो और ब्रांडिंग */}
        <div className="flex flex-col items-center text-center space-y-3">
          <div className="h-16 w-16 bg-white rounded-2xl p-2 flex items-center justify-center shadow-md border border-slate-100">
            <img 
              src="/logo.png" 
              alt="FreightPay Logo" 
              className="object-contain h-full w-full"
            />
          </div>
          <div>
            <h2 className="text-xl font-black text-brand-navy tracking-tight">Welcome to FreightPay</h2>
            <p className="text-[11px] text-slate-400 font-medium mt-0.5">
              Sign in to manage your coal discounting workspace
            </p>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-2 text-red-400 text-sm">
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSignup} className="space-y-5">
          <div>
            <label className="text-xs font-bold uppercase tracking-wider block mb-2 opacity-80">Email Address</label>
            <div className="relative">
              <Mail className="absolute left-4 top-3.5 text-slate-400" size={18} />
              <input
                type="email"
                required
                placeholder="name@firm.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-slate-900 md:bg-slate-50 border border-slate-700 md:border-slate-200 rounded-xl py-3 pl-12 pr-4 text-white md:text-brand-navy focus:outline-none focus:border-brand-blue font-medium text-sm transition-all"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-bold uppercase tracking-wider block mb-2 opacity-80">Password</label>
            <div className="relative">
              <Lock className="absolute left-4 top-3.5 text-slate-400" size={18} />
              <input
                type="password"
                required
                placeholder="Create strong password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-slate-900 md:bg-slate-50 border border-slate-700 md:border-slate-200 rounded-xl py-3 pl-12 pr-4 text-white md:text-brand-navy focus:outline-none focus:border-brand-blue font-medium text-sm transition-all"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-brand-blue hover:bg-brand-blue/90 text-white font-bold py-3.5 rounded-xl shadow-lg active:scale-[0.99] transition-all text-sm uppercase tracking-wider flex justify-center items-center"
          >
            {loading ? "Creating Account..." : "Register Now"}
          </button>
        </form>

        <div className="text-center mt-6">
          <p className="text-sm opacity-70">
            Already have an account?{" "}
            <Link href="/login" className="text-brand-cyan md:text-brand-blue font-bold underline">
              Login here
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}