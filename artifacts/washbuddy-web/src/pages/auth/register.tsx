import React, { useState } from "react";
import { useAuth } from "@/contexts/auth";
import { Link, useLocation } from "wouter";
import { Button, Input, Label } from "@/components/ui";
import { motion } from "framer-motion";
import { Droplets } from "lucide-react";

export default function Register() {
  const { register } = useAuth();
  const [, setLocation] = useLocation();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    try {
      await register({
        email: fd.get("email") as string,
        password: fd.get("password") as string,
        firstName: fd.get("firstName") as string,
        lastName: fd.get("lastName") as string,
        phone: (fd.get("phone") as string) || undefined,
      });
      setLocation("/");
    } catch (err: any) {
      setError(err.message || "Failed to create account.");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-slate-50 relative overflow-hidden">
      {/* Form Side */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 z-10">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }} 
          animate={{ opacity: 1, scale: 1 }} 
          className="w-full max-w-xl bg-white p-8 sm:p-10 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.08)] border border-slate-100"
        >
          <div className="flex items-center justify-center w-16 h-16 bg-blue-50 text-blue-600 rounded-2xl mb-8 mx-auto shadow-inner">
            <Droplets className="h-8 w-8" />
          </div>
          
          <div className="text-center mb-8">
            <h2 className="text-3xl font-display font-bold text-slate-900">Create an Account</h2>
            <p className="text-slate-500 mt-2">Join WashBuddy to manage your fleet washing</p>
          </div>

          {error && (
            <div className="mb-6 p-4 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-sm font-medium">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>First Name</Label>
                <Input name="firstName" required />
              </div>
              <div>
                <Label>Last Name</Label>
                <Input name="lastName" required />
              </div>
            </div>
            <div>
              <Label>Email address</Label>
              <Input name="email" type="email" required />
            </div>
            <div>
              <Label>Phone (Optional)</Label>
              <Input name="phone" type="tel" />
            </div>
            <div>
              <Label>Password</Label>
              <Input name="password" type="password" required minLength={8} />
            </div>
            
            <Button type="submit" className="w-full" size="lg" isLoading={loading}>
              Create Account
            </Button>
          </form>

          <p className="mt-8 text-center text-slate-600 font-medium">
            Already have an account? <Link href="/login" className="text-primary hover:underline">Sign in</Link>
          </p>
        </motion.div>
      </div>

      {/* Hero Side */}
      <div className="hidden lg:flex lg:w-1/2 relative bg-gradient-to-br from-blue-700 via-blue-600 to-cyan-600">
        <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'radial-gradient(circle at 30% 50%, rgba(255,255,255,0.2) 0%, transparent 50%), radial-gradient(circle at 80% 30%, rgba(6,182,212,0.3) 0%, transparent 40%)' }} />
        <div className="absolute inset-0 flex flex-col justify-center p-16 text-white">
          <h2 className="font-display text-5xl font-bold leading-tight mb-6">Scale your fleet.<br/>We'll keep it clean.</h2>
          <div className="space-y-4 text-lg text-white/90">
            <p className="flex items-center gap-3">✨ Premium commercial wash network</p>
            <p className="flex items-center gap-3">📅 Real-time slot availability</p>
            <p className="flex items-center gap-3">💳 Seamless payments and billing</p>
          </div>
        </div>
      </div>
    </div>
  );
}
