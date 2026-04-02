import React, { useState } from "react";
import { useAuth } from "@/contexts/auth";
import { Link, useLocation } from "wouter";
import { Button, Input, Label } from "@/components/ui";
import { motion, AnimatePresence } from "framer-motion";
import { Droplets, Truck, Building2, Wrench, ArrowLeft, Check } from "lucide-react";

type AccountType = "driver" | "fleet_admin" | "provider_admin";

interface AccountOption {
  type: AccountType;
  label: string;
  description: string;
  icon: React.ElementType;
}

const ACCOUNT_OPTIONS: AccountOption[] = [
  {
    type: "driver",
    label: "Driver",
    description: "Find and book bus wash services",
    icon: Truck,
  },
  {
    type: "fleet_admin",
    label: "Fleet Operator",
    description: "Manage your fleet's washing operations",
    icon: Building2,
  },
  {
    type: "provider_admin",
    label: "Wash Provider",
    description: "List your facility and receive bookings",
    icon: Wrench,
  },
];

export default function Register() {
  const { register } = useAuth();
  const [, setLocation] = useLocation();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [accountType, setAccountType] = useState<AccountType | null>(null);

  const needsBusinessName = accountType === "fleet_admin" || accountType === "provider_admin";

  const handleContinue = () => {
    if (accountType) {
      setError("");
      setStep(2);
    }
  };

  const handleBack = () => {
    setError("");
    setStep(1);
  };

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
        accountType: accountType!,
        businessName: needsBusinessName ? (fd.get("businessName") as string) : undefined,
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
            <h2 className="text-3xl font-display font-bold text-slate-900">
              {step === 1 ? "Join WashBuddy" : "Create Your Account"}
            </h2>
            <p className="text-slate-500 mt-2">
              {step === 1
                ? "Select how you'll use the platform"
                : accountType === "driver"
                  ? "Set up your driver account"
                  : accountType === "fleet_admin"
                    ? "Set up your fleet operator account"
                    : "Set up your provider account"}
            </p>
          </div>

          {error && (
            <div className="mb-6 p-4 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-sm font-medium">
              {error}
            </div>
          )}

          <AnimatePresence mode="wait">
            {step === 1 ? (
              <motion.div
                key="step1"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
              >
                {/* Account type cards */}
                <div className="space-y-3 mb-8">
                  {ACCOUNT_OPTIONS.map((opt) => {
                    const isSelected = accountType === opt.type;
                    const Icon = opt.icon;
                    return (
                      <button
                        key={opt.type}
                        type="button"
                        onClick={() => setAccountType(opt.type)}
                        className={`w-full flex items-center gap-4 p-4 rounded-2xl border-2 transition-all duration-200 text-left ${
                          isSelected
                            ? "border-blue-500 bg-blue-50/50 shadow-md shadow-blue-100"
                            : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                        }`}
                      >
                        <div
                          className={`flex items-center justify-center w-12 h-12 rounded-xl ${
                            isSelected
                              ? "bg-blue-100 text-blue-600"
                              : "bg-slate-100 text-slate-500"
                          }`}
                        >
                          <Icon className="h-6 w-6" />
                        </div>
                        <div className="flex-1">
                          <div className="font-semibold text-slate-900">{opt.label}</div>
                          <div className="text-sm text-slate-500">{opt.description}</div>
                        </div>
                        {isSelected && (
                          <div className="flex items-center justify-center w-8 h-8 bg-blue-500 text-white rounded-full">
                            <Check className="h-4 w-4" />
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>

                <Button
                  type="button"
                  className="w-full"
                  size="lg"
                  disabled={!accountType}
                  onClick={handleContinue}
                >
                  Continue
                </Button>
              </motion.div>
            ) : (
              <motion.div
                key="step2"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.2 }}
              >
                <form onSubmit={handleSubmit} className="space-y-5">
                  {needsBusinessName && (
                    <div>
                      <Label>
                        {accountType === "fleet_admin" ? "Company / Fleet Name" : "Business Name"}
                      </Label>
                      <Input
                        name="businessName"
                        required
                        placeholder={
                          accountType === "fleet_admin"
                            ? "e.g. Northeast Bus Lines"
                            : "e.g. MetroClean Bus Wash"
                        }
                      />
                    </div>
                  )}

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

                  <div className="flex gap-3 pt-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="lg"
                      onClick={handleBack}
                      className="flex items-center gap-2"
                    >
                      <ArrowLeft className="h-4 w-4" />
                      Back
                    </Button>
                    <Button type="submit" className="flex-1" size="lg" isLoading={loading}>
                      Create Account
                    </Button>
                  </div>
                </form>
              </motion.div>
            )}
          </AnimatePresence>

          <p className="mt-8 text-center text-slate-600 font-medium">
            Already have an account?{" "}
            <Link href="/login" className="text-primary hover:underline">
              Sign in
            </Link>
          </p>
        </motion.div>
      </div>

      {/* Hero Side */}
      <div className="hidden lg:flex lg:w-1/2 relative bg-gradient-to-br from-blue-700 via-blue-600 to-cyan-600">
        <div
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage:
              "radial-gradient(circle at 30% 50%, rgba(255,255,255,0.2) 0%, transparent 50%), radial-gradient(circle at 80% 30%, rgba(6,182,212,0.3) 0%, transparent 40%)",
          }}
        />
        <div className="absolute inset-0 flex flex-col justify-center p-16 text-white">
          <h2 className="font-display text-5xl font-bold leading-tight mb-6">
            Scale your fleet.
            <br />
            We'll keep it clean.
          </h2>
          <div className="space-y-4 text-lg text-white/90">
            <p className="flex items-center gap-3">Premium commercial wash network</p>
            <p className="flex items-center gap-3">Real-time slot availability</p>
            <p className="flex items-center gap-3">Seamless payments and billing</p>
          </div>
        </div>
      </div>
    </div>
  );
}
