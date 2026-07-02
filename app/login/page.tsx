"use client";

import { useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Truck, Lock, Mail, AlertCircle } from "lucide-react";
import { auth } from "@/lib/firebase";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      router.push("/dashboard");
    } catch (err: any) {
      setError(err.message || "Invalid Email or Password");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-brand-navy md:bg-brand-light">
      <div className="w-full max-w-md bg-brand-navy text-white md:text-brand-navy md:bg-white p-8 rounded-3xl shadow-2xl md:shadow-lg border border-slate-800 md:border-slate-100 transition-all">
        
        {/* Header/Logo Section */}
        <div className="text-center mb-8">
          <div className="inline-flex p-4 bg-brand-blue/10 md:bg-brand-navy/5 text-brand-cyan md:text-brand-blue rounded-2xl mb-3">
            <Truck size={40} />
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight">FreightPay</h1>
          <p className="text-xs text-brand-cyan md:text-brand-blue font-semibold mt-1 uppercase tracking-wider">
            Coal Payment Discounting ERP
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-2 text-red-400 text-sm">
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-5">
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
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-slate-900 md:bg-slate-50 border border-slate-700 md:border-slate-200 rounded-xl py-3 pl-12 pr-4 text-white md:text-brand-navy focus:outline-none focus:border-brand-blue font-medium text-sm transition-all"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-brand-blue hover:bg-brand-blue/90 text-white font-bold py-3.5 rounded-xl shadow-lg shadow-brand-blue/20 active:scale-[0.99] transition-all text-sm uppercase tracking-wider flex justify-center items-center"
          >
            {loading ? "Authenticating..." : "Login to Account"}
          </button>
        </form>

        <div className="text-center mt-6">
          <p className="text-sm opacity-70">
            New to FreightPay?{" "}
            <Link href="/signup" className="text-brand-cyan md:text-brand-blue font-bold underline">
              Create an Account
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}