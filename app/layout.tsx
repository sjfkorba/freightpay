import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "../context/AuthContext";

export const metadata: Metadata = {
  title: "FreightPay - Coal Payment Discounting ERP",
  description: "Advanced Freight Discounting and Fleet Management ERP",
  // 🔥 Favicon में अपना कस्टम लोगो लिंक करें
  icons: {
    icon: "/logo.png",
    apple: "/logo.png", // मोबाइल डिवाइसेस के लिए बुकमार्क आइकॉन
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-brand-light text-brand-navy min-h-screen antialiased">
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}