import React, { useState, useEffect } from "react";
import { Card, Badge, Button } from "@/components/ui";
import { Truck, MapPin, Calendar, FileText, Send, ArrowLeft, ArrowRight, CheckCircle2, Search, Loader2, ChevronRight, Clock, Sparkles } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useLocation, useSearch } from "wouter";
import { useAuth } from "@/contexts/auth";

const API_BASE = import.meta.env.VITE_API_URL || "";

function useAvailableVehicles() {
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadVehicles = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/fleet/vehicles`, { credentials: "include" });
        if (res.ok) {
          const d = await res.json();
          setVehicles(d.vehicles || []);
        }
      } catch {}
      setIsLoading(false);
    };
    loadVehicles();
  }, []);

  return { vehicles, isLoading };
}

const steps = [
  { label: "Vehicle", icon: Truck },
  { label: "Details", icon: Calendar },
  { label: "Review", icon: CheckCircle2 },
];

export default function NewWashRequest() {
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  const { user, hasRole } = useAuth();
  const { vehicles, isLoading: vehiclesLoading } = useAvailableVehicles();
  const isOperator = hasRole("FLEET_ADMIN") || hasRole("DISPATCHER") || hasRole("MAINTENANCE_MANAGER");
  const queryVehicleId = new URLSearchParams(searchString).get("vehicleId") || "";
  const [step, setStep] = useState(1);
  const [vehicleId, setVehicleId] = useState(queryVehicleId);
  const [requestType, setRequestType] = useState<"STRUCTURED" | "FLEXIBLE">("STRUCTURED");
  const [locationSearch, setLocationSearch] = useState("");
  const [locations, setLocations] = useState<any[]>([]);
  const [selectedLocationId, setSelectedLocationId] = useState("");
  const [selectedLocationName, setSelectedLocationName] = useState("");
  const [desiredDate, setDesiredDate] = useState("");
  const [desiredTime, setDesiredTime] = useState("");
  const [timeWindowCode, setTimeWindowCode] = useState("");
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [searchingLocations, setSearchingLocations] = useState(false);

  useEffect(() => {
    if (queryVehicleId && vehicles.length > 0) {
      const match = vehicles.find((v: any) => v.id === queryVehicleId);
      if (match) {
        setVehicleId(queryVehicleId);
        setStep(2);
      }
    }
  }, [queryVehicleId, vehicles]);

  useEffect(() => {
    if (!locationSearch || locationSearch.length < 2) {
      setLocations([]);
      return;
    }
    const timeout = setTimeout(() => {
      setSearchingLocations(true);
      fetch(`${API_BASE}/api/fleet/locations/search?q=${encodeURIComponent(locationSearch)}`, { credentials: "include" })
        .then((r) => {
          if (!r.ok) throw new Error();
          return r.json();
        })
        .then((d) => setLocations(d.locations || []))
        .catch(() => setLocations([]))
        .finally(() => setSearchingLocations(false));
    }, 300);
    return () => clearTimeout(timeout);
  }, [locationSearch]);

  const selectedVehicle = vehicles.find((v) => v.id === vehicleId);

  const handleSelectVehicle = (id: string) => {
    setVehicleId(id);
    setStep(2);
  };

  const handleSubmit = async () => {
    setError(null);
    setIsSubmitting(true);

    try {
      const body: any = {
        vehicleId,
        requestType,
        notes: notes || undefined,
      };

      if (requestType === "STRUCTURED") {
        if (selectedLocationId) body.desiredLocationId = selectedLocationId;
        if (desiredDate && desiredTime) {
          body.desiredStartAtUtc = new Date(`${desiredDate}T${desiredTime}`).toISOString();
        }
      } else {
        if (timeWindowCode) body.timeWindowCode = timeWindowCode;
      }

      const res = await fetch(`${API_BASE}/api/fleet/wash-requests`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.message || "Failed to create request");
        return;
      }

      setSuccess(true);
      setTimeout(() => setLocation("/fleet/requests"), 1500);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (success) {
    return (
      <div className="max-w-xl mx-auto py-20 text-center">
        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 200 }}>
          <CheckCircle2 className="h-16 w-16 text-emerald-500 mx-auto mb-4" />
        </motion.div>
        <h2 className="text-2xl font-display font-bold text-slate-900 mb-2">
          {isOperator ? "Wash Booked!" : "Request Submitted!"}
        </h2>
        <p className="text-slate-500">
          {isOperator
            ? "The wash has been booked. The assigned driver will be notified."
            : "Your wash request has been submitted for approval."}
        </p>
      </div>
    );
  }

  const getDueBadge = (v: any) => {
    if (!v.nextWashDueAtUtc) return null;
    const due = new Date(v.nextWashDueAtUtc);
    const now = new Date();
    const diffDays = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays < 0) {
      return <Badge className="bg-red-100 text-red-700 text-xs font-semibold">{Math.abs(diffDays)}d overdue</Badge>;
    }
    if (diffDays <= 3) {
      return <Badge className="bg-amber-100 text-amber-700 text-xs font-semibold">Due in {diffDays}d</Badge>;
    }
    return <Badge className="bg-slate-100 text-slate-600 text-xs">Due: {due.toLocaleDateString()}</Badge>;
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <button
          onClick={() => {
            if (step > 1) {
              setStep(step - 1);
            } else {
              setLocation("/fleet/requests");
            }
          }}
          className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-4 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> {step > 1 ? "Back" : "Back to Wash Requests"}
        </button>
        <div>
          <p className="text-sm font-bold text-blue-600 uppercase tracking-wider mb-1">
            {isOperator ? "Book Wash" : "New Request"}
          </p>
          <h1 className="text-3xl font-display font-bold text-slate-900">
            {isOperator ? "Book a Wash" : "Request a Wash"}
          </h1>
          <p className="text-slate-500 mt-1">
            {isOperator
              ? "Select a vehicle and book a wash directly."
              : "Follow the steps to submit a wash request for approval."}
          </p>
        </div>
      </motion.div>

      <div className="flex items-center gap-2">
        {steps.map((s, i) => {
          const stepNum = i + 1;
          const isActive = step === stepNum;
          const isComplete = step > stepNum;
          const StepIcon = s.icon;
          return (
            <React.Fragment key={s.label}>
              {i > 0 && (
                <div className={`flex-1 h-0.5 rounded ${isComplete ? "bg-blue-500" : "bg-slate-200"}`} />
              )}
              <button
                onClick={() => {
                  if (isComplete) setStep(stepNum);
                }}
                disabled={!isComplete && !isActive}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-all ${
                  isActive
                    ? "bg-blue-100 text-blue-700"
                    : isComplete
                    ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 cursor-pointer"
                    : "bg-slate-100 text-slate-400 cursor-default"
                }`}
              >
                {isComplete ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  <StepIcon className="h-4 w-4" />
                )}
                {s.label}
              </button>
            </React.Fragment>
          );
        })}
      </div>

      <AnimatePresence mode="wait">
        {step === 1 && (
          <motion.div
            key="step1"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            transition={{ duration: 0.2 }}
          >
            <Card className="p-6">
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2 mb-4">
                <Truck className="h-5 w-5 text-blue-500" />
                Select a Vehicle
              </h2>
              <p className="text-sm text-slate-500 mb-4">Choose the vehicle that needs washing. Click to continue.</p>
              {vehiclesLoading ? (
                <div className="py-8 text-center text-slate-400">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
                  Loading vehicles...
                </div>
              ) : vehicles.length === 0 ? (
                <p className="text-slate-500 text-sm py-8 text-center">No vehicles available. Contact your fleet manager.</p>
              ) : (
                <div className="space-y-2">
                  {vehicles.map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => handleSelectVehicle(v.id)}
                      className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 text-left transition-all group ${
                        vehicleId === v.id
                          ? "border-blue-500 bg-blue-50"
                          : "border-slate-200 hover:border-blue-300 hover:bg-blue-50/50"
                      }`}
                    >
                      <div className={`h-10 w-10 rounded-lg flex items-center justify-center shrink-0 ${
                        vehicleId === v.id ? "bg-blue-100 text-blue-600" : "bg-slate-100 text-slate-400 group-hover:bg-blue-100 group-hover:text-blue-500"
                      }`}>
                        <Truck className="h-5 w-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-slate-900">{v.unitNumber}</p>
                        <p className="text-xs text-slate-500">{v.categoryCode} · {v.depot?.name || "No depot"}</p>
                      </div>
                      {getDueBadge(v)}
                      <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-blue-500 shrink-0" />
                    </button>
                  ))}
                </div>
              )}
            </Card>
          </motion.div>
        )}

        {step === 2 && (
          <motion.div
            key="step2"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            transition={{ duration: 0.2 }}
            className="space-y-6"
          >
            {selectedVehicle && (
              <Card className="p-4 bg-blue-50 border-blue-200">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center">
                    <Truck className="h-5 w-5 text-blue-600" />
                  </div>
                  <div className="flex-1">
                    <p className="font-bold text-slate-900">{selectedVehicle.unitNumber}</p>
                    <p className="text-xs text-slate-500">{selectedVehicle.categoryCode} · {selectedVehicle.depot?.name || "No depot"}</p>
                  </div>
                  {getDueBadge(selectedVehicle)}
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                  >
                    Change
                  </button>
                </div>
              </Card>
            )}

            <Card className="p-6">
              <h2 className="text-lg font-bold text-slate-900 mb-4">Request Type</h2>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setRequestType("STRUCTURED")}
                  className={`p-4 rounded-xl border-2 text-left transition-all ${
                    requestType === "STRUCTURED"
                      ? "border-blue-500 bg-blue-50"
                      : "border-slate-200 hover:border-slate-300"
                  }`}
                >
                  <MapPin className={`h-5 w-5 mb-2 ${requestType === "STRUCTURED" ? "text-blue-600" : "text-slate-400"}`} />
                  <p className="font-bold text-slate-900">Structured</p>
                  <p className="text-xs text-slate-500 mt-1">Pick location, date & time</p>
                </button>
                <button
                  type="button"
                  onClick={() => setRequestType("FLEXIBLE")}
                  className={`p-4 rounded-xl border-2 text-left transition-all ${
                    requestType === "FLEXIBLE"
                      ? "border-blue-500 bg-blue-50"
                      : "border-slate-200 hover:border-slate-300"
                  }`}
                >
                  <Sparkles className={`h-5 w-5 mb-2 ${requestType === "FLEXIBLE" ? "text-blue-600" : "text-slate-400"}`} />
                  <p className="font-bold text-slate-900">Flexible</p>
                  <p className="text-xs text-slate-500 mt-1">Let fleet choose best option</p>
                </button>
              </div>
            </Card>

            {requestType === "STRUCTURED" && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                <Card className="p-6 space-y-4">
                  <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                    <MapPin className="h-5 w-5 text-blue-500" />
                    Location & Timing
                  </h2>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Preferred Location</label>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                      <input
                        type="text"
                        placeholder="Search for a wash location..."
                        value={selectedLocationName || locationSearch}
                        onChange={(e) => {
                          setLocationSearch(e.target.value);
                          setSelectedLocationId("");
                          setSelectedLocationName("");
                        }}
                        className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                      />
                      {searchingLocations && (
                        <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 animate-spin" />
                      )}
                    </div>
                    {locations.length > 0 && !selectedLocationId && (
                      <div className="mt-1 border border-slate-200 rounded-xl bg-white shadow-lg max-h-48 overflow-y-auto">
                        {locations.map((loc) => (
                          <button
                            key={loc.id}
                            type="button"
                            onClick={() => {
                              setSelectedLocationId(loc.id);
                              setSelectedLocationName(`${loc.name} — ${loc.city}, ${loc.regionCode}`);
                              setLocationSearch("");
                              setLocations([]);
                            }}
                            className="w-full text-left px-4 py-2.5 hover:bg-slate-50 text-sm border-b border-slate-100 last:border-0"
                          >
                            <p className="font-medium text-slate-900">{loc.name}</p>
                            <p className="text-xs text-slate-500">{loc.addressLine1}, {loc.city}, {loc.regionCode} · {loc.provider?.name}</p>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Preferred Date</label>
                      <input
                        type="date"
                        value={desiredDate}
                        onChange={(e) => setDesiredDate(e.target.value)}
                        min={new Date().toISOString().split("T")[0]}
                        className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Preferred Time</label>
                      <input
                        type="time"
                        value={desiredTime}
                        onChange={(e) => setDesiredTime(e.target.value)}
                        className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                      />
                    </div>
                  </div>
                </Card>
              </motion.div>
            )}

            {requestType === "FLEXIBLE" && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                <Card className="p-6">
                  <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2 mb-4">
                    <Clock className="h-5 w-5 text-blue-500" />
                    Time Window
                  </h2>
                  <select
                    value={timeWindowCode}
                    onChange={(e) => setTimeWindowCode(e.target.value)}
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                  >
                    <option value="">No preference</option>
                    <option value="ASAP">As soon as possible</option>
                    <option value="TODAY">Today</option>
                    <option value="THIS_WEEK">This week</option>
                    <option value="NEXT_WEEK">Next week</option>
                  </select>
                </Card>
              </motion.div>
            )}

            <Card className="p-6">
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2 mb-4">
                <FileText className="h-5 w-5 text-blue-500" />
                Additional Notes
              </h2>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Any special instructions or notes for this wash request..."
                rows={3}
                className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none"
              />
            </Card>

            <div className="flex justify-end">
              {requestType === "STRUCTURED" && !selectedLocationId && !desiredDate && (
                <p className="text-xs text-slate-400 self-center mr-3">Add a location or date to continue, or switch to Flexible.</p>
              )}
              <Button
                type="button"
                onClick={() => setStep(3)}
                disabled={requestType === "STRUCTURED" && !selectedLocationId && !desiredDate}
                className="bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50"
              >
                Review Request <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </motion.div>
        )}

        {step === 3 && (
          <motion.div
            key="step3"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            transition={{ duration: 0.2 }}
            className="space-y-6"
          >
            <Card className="p-6">
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2 mb-6">
                <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                Review Your Request
              </h2>

              <div className="space-y-4">
                <ReviewRow icon={Truck} label="Vehicle" value={selectedVehicle ? `${selectedVehicle.unitNumber} — ${selectedVehicle.categoryCode} · ${selectedVehicle.depot?.name || "No depot"}` : ""} />
                <ReviewRow icon={Calendar} label="Request Type" value={requestType === "STRUCTURED" ? "Structured (specific location & time)" : "Flexible (fleet chooses)"} />
                {requestType === "STRUCTURED" && selectedLocationName && (
                  <ReviewRow icon={MapPin} label="Location" value={selectedLocationName} />
                )}
                {requestType === "STRUCTURED" && desiredDate && desiredTime && (
                  <ReviewRow icon={Calendar} label="Date & Time" value={`${new Date(desiredDate + "T00:00:00").toLocaleDateString()} at ${desiredTime}`} />
                )}
                {requestType === "STRUCTURED" && desiredDate && !desiredTime && (
                  <ReviewRow icon={Calendar} label="Preferred Date" value={new Date(desiredDate + "T00:00:00").toLocaleDateString()} />
                )}
                {requestType === "FLEXIBLE" && timeWindowCode && (
                  <ReviewRow icon={Clock} label="Time Window" value={
                    { ASAP: "As soon as possible", TODAY: "Today", THIS_WEEK: "This week", NEXT_WEEK: "Next week" }[timeWindowCode] || timeWindowCode
                  } />
                )}
                {notes && (
                  <ReviewRow icon={FileText} label="Notes" value={notes} />
                )}
              </div>
            </Card>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <div className="flex justify-between">
              <Button
                type="button"
                variant="outline"
                onClick={() => setStep(2)}
              >
                <ArrowLeft className="h-4 w-4 mr-2" /> Edit Details
              </Button>
              <Button
                type="button"
                onClick={handleSubmit}
                disabled={!vehicleId || isSubmitting}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                {isSubmitting ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> {isOperator ? "Booking..." : "Submitting..."}</>
                ) : (
                  <><Send className="h-4 w-4 mr-2" /> {isOperator ? "Book Wash" : "Submit Request"}</>
                )}
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ReviewRow({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3 py-3 border-b border-slate-100 last:border-0">
      <div className="h-8 w-8 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
        <Icon className="h-4 w-4 text-slate-500" />
      </div>
      <div>
        <p className="text-xs text-slate-500 font-medium">{label}</p>
        <p className="text-sm font-medium text-slate-900">{value}</p>
      </div>
    </div>
  );
}
