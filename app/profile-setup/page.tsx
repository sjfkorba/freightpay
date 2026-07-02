"use client";

import { useState, useEffect } from "react";
import { useAuth } from "../../context/AuthContext";
import { db } from "../../lib/firebase";
import { doc, updateDoc } from "firebase/firestore";
import { useRouter } from "next/navigation";
import { Briefcase, FileText, Phone, MapPin, Save, AlertCircle } from "lucide-react";

export default function ProfileSetup() {
  const { user, profile, refreshProfile } = useAuth();
  const [firmName, setFirmName] = useState("");
  const [panNumber, setPanNumber] = useState("");
  const [mobileNumber, setMobileNumber] = useState("");
  const [officeAddress, setOfficeAddress] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  // यदि यूजर का प्रोफाइल पहले से ही कम्प्लीट है, तो उसे सीधे डैशबोर्ड पर भेजें
  useEffect(() => {
    if (profile?.isProfileComplete) {
      router.push("/dashboard");
    }
  }, [profile, router]);

 // ऊपर के इम्पोर्ट्स में 'setDoc' को जोड़ना होगा, इसलिए मैं डायरेक्ट बदला हुआ handleSubmit दे रहा हूँ:
const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  if (!user) return;
  setError("");
  setLoading(true);

  if (panNumber.length !== 10) {
    setError("PAN Number must be exactly 10 characters long.");
    setLoading(false);
    return;
  }
  if (mobileNumber.length !== 10) {
    setError("Mobile Number must be exactly 10 digits.");
    setLoading(false);
    return;
  }

  try {
    const { setDoc } = await import("firebase/firestore"); // Dynamic safe import if needed, or check your top imports
    const docRef = doc(db, "users", user.uid);
    
    // 🔥 यहाँ हमने updateDoc को बदलकर setDoc + merge: true कर दिया है
    await setDoc(docRef, {
      firmName,
      panNumber: panNumber.toUpperCase(),
      mobileNumber,
      officeAddress,
      isProfileComplete: true,
      updatedAt: new Date().toISOString(),
    }, { merge: true }); // यह लाइन बिना कलेक्शन/डॉक्यूमेंट के भी एरर नहीं आने देगी
    
    await refreshProfile();
    router.push("/dashboard");
  } catch (err: any) {
    setError(err.message || "Failed to update profile. Please try again.");
  } finally {
    setLoading(false);
  }
};

  return (
    <div className="min-h-screen bg-brand-light flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-xl w-full mx-auto bg-white rounded-3xl shadow-xl overflow-hidden border border-slate-100">
        
        {/* Header Ribbon */}
        <div className="bg-brand-navy p-6 text-center text-white">
          <h2 className="text-2xl font-bold tracking-tight">Complete Business Profile</h2>
          <p className="text-xs text-brand-cyan font-semibold uppercase tracking-wider mt-1">
            Required for activating your ERP workspace
          </p>
        </div>

        <div className="p-8">
          {error && (
            <div className="mb-6 p-4 bg-red-50 rounded-xl flex items-center gap-2 text-red-600 text-sm border border-red-100">
              <AlertCircle size={18} />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Firm Name */}
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500 block mb-2">
                Firm / Proprietor Name
              </label>
              <div className="relative">
                <Briefcase className="absolute left-4 top-3.5 text-slate-400" size={18} />
                <input
                  type="text"
                  required
                  placeholder="e.g., Sharma Transport Corp"
                  value={firmName}
                  onChange={(e) => setFirmName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 pl-12 pr-4 text-brand-navy focus:outline-none focus:border-brand-blue font-medium text-sm transition-all"
                />
              </div>
            </div>

            {/* PAN & Mobile Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* PAN Number */}
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-slate-500 block mb-2">
                  PAN Number
                </label>
                <div className="relative">
                  <FileText className="absolute left-4 top-3.5 text-slate-400" size={18} />
                  <input
                    type="text"
                    required
                    maxLength={10}
                    placeholder="ABCDE1234F"
                    value={panNumber}
                    onChange={(e) => setPanNumber(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 pl-12 pr-4 text-brand-navy focus:outline-none focus:border-brand-blue font-medium text-sm transition-all uppercase"
                  />
                </div>
              </div>

              {/* Mobile Number */}
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-slate-500 block mb-2">
                  Mobile Number
                </label>
                <div className="relative">
                  <Phone className="absolute left-4 top-3.5 text-slate-400" size={18} />
                  <input
                    type="tel"
                    required
                    maxLength={10}
                    placeholder="10-digit number"
                    value={mobileNumber}
                    onChange={(e) => setMobileNumber(e.target.value.replace(/\D/g, ""))} // Numbers only
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 pl-12 pr-4 text-brand-navy focus:outline-none focus:border-brand-blue font-medium text-sm transition-all"
                  />
                </div>
              </div>
            </div>

            {/* Office Address */}
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500 block mb-2">
                Office Address
              </label>
              <div className="relative">
                <MapPin className="absolute left-4 top-3.5 text-slate-400" size={18} />
                <textarea
                  required
                  rows={3}
                  placeholder="Full business or office address"
                  value={officeAddress}
                  onChange={(e) => setOfficeAddress(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 pl-12 pr-4 text-brand-navy focus:outline-none focus:border-brand-blue font-medium text-sm transition-all resize-none"
                />
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-brand-blue hover:bg-brand-blue/90 text-white font-bold py-3.5 rounded-xl shadow-lg flex justify-center items-center gap-2 text-sm uppercase tracking-wider transition-all active:scale-[0.99]"
            >
              <Save size={18} />
              {loading ? "Activating ERP..." : "Save & Launch Dashboard"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}