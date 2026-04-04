import React, { useState } from "react";
import { useAuth } from "@/contexts/auth";
import { Link, useLocation } from "wouter";
import { Button, Input, Label } from "@/components/ui";
import { motion } from "framer-motion";
import { Droplets } from "lucide-react";

export default function Login() {
  const { login } = useAuth();
  const [, setLocation] = useLocation();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    try {
      await login({
        email: fd.get("email") as string,
        password: fd.get("password") as string,
      });
      setLocation("/"); // AuthContext + App.tsx will route correctly
    } catch (err: any) {
      const raw = err?.message || "";
      const isNetworkError = raw.includes("404") || raw.includes("Failed to fetch") || raw.includes("NetworkError") || raw.includes("ECONNREFUSED");
      const apiMessage = err?.response?.data?.message || err?.data?.message;
      const message = isNetworkError
        ? "Unable to reach the server. Please check your connection and try again."
        : apiMessage
          || (typeof raw === "string" && raw.length < 100 && raw.includes("Invalid") ? raw : null)
          || "Invalid email or password. Please try again.";
      setError(message);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-slate-50 relative overflow-hidden">
      {/* Left side - Image */}
      <div className="hidden lg:flex lg:w-1/2 relative bg-gradient-to-br from-slate-900 via-blue-900 to-cyan-900">
        <div className="absolute inset-0 opacity-30" style={{ backgroundImage: 'radial-gradient(circle at 25% 25%, rgba(59,130,246,0.4) 0%, transparent 50%), radial-gradient(circle at 75% 75%, rgba(6,182,212,0.3) 0%, transparent 50%)' }} />
        <div className="absolute inset-0 flex flex-col justify-end p-12 text-white">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            <h1 className="font-display text-5xl font-bold leading-tight mb-4">Keep your fleet pristine.</h1>
            <p className="text-lg text-slate-300 max-w-md">The premier marketplace for commercial bus washing. Find locations, book slots, and manage your fleet seamlessly.</p>
          </motion.div>
        </div>
      </div>

      {/* Right side - Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 z-10">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }} 
          animate={{ opacity: 1, scale: 1 }} 
          className="w-full max-w-md bg-white p-8 sm:p-10 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.08)] border border-slate-100"
        >
          <div className="flex items-center justify-center w-16 h-16 bg-blue-50 text-blue-600 rounded-2xl mb-8 mx-auto shadow-inner">
            <Droplets className="h-8 w-8" />
          </div>
          
          <div className="text-center mb-8">
            <h2 className="text-3xl font-display font-bold text-slate-900">Welcome back</h2>
            <p className="text-slate-500 mt-2">Enter your credentials to access your account</p>
          </div>

          {error && (
            <div className="mb-6 p-4 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-sm font-medium">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <Label htmlFor="email">Email address</Label>
              <Input id="email" name="email" type="email" required placeholder="you@example.com" autoComplete="email" />
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <Input id="password" name="password" type="password" required placeholder="••••••••" autoComplete="current-password" />
            </div>
            
            <Button type="submit" className="w-full" size="lg" isLoading={loading}>
              Sign In
            </Button>
          </form>

          <p className="mt-8 text-center text-slate-600 font-medium">
            Don't have an account? <Link href="/register" className="text-primary hover:underline">Register here</Link>
          </p>
        </motion.div>

        {/* Decorative background blobs for mobile/desktop right side */}
        <div className="absolute top-0 right-0 -mr-24 -mt-24 w-96 h-96 rounded-full bg-blue-400/10 blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 right-1/4 -mb-24 w-80 h-80 rounded-full bg-cyan-400/10 blur-3xl pointer-events-none" />
      </div>
    </div>
  );
}
