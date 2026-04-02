import React, { useState } from "react";
import { useListProviders, useListLocations, useListServices } from "@workspace/api-client-react";
import { Card, Badge, Button, ErrorState } from "@/components/ui";
import { formatCurrency } from "@/lib/utils";
import { Building2, MapPin, ChevronDown, ChevronRight, Clock, DollarSign, Eye, EyeOff } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

function ProviderLocations({ providerId }: { providerId: string }) {
  const { data, isLoading } = useListLocations(providerId, {
    query: { enabled: !!providerId },
    request: { credentials: 'include' }
  });

  if (isLoading) return <div className="h-16 animate-pulse bg-slate-100 rounded-xl" />;
  if (!data?.locations.length) return <p className="text-sm text-slate-400 italic py-4">No locations configured.</p>;

  return (
    <div className="space-y-4">
      {data.locations.map(loc => (
        <LocationCard key={loc.id} providerId={providerId} location={loc} />
      ))}
    </div>
  );
}

function LocationCard({ providerId, location: loc }: { providerId: string; location: any }) {
  const [showServices, setShowServices] = useState(false);
  const { data: servicesData, isLoading: isLoadingServices } = useListServices(providerId, loc.id, {
    query: { enabled: showServices },
    request: { credentials: 'include' }
  });

  return (
    <div className="bg-slate-50 rounded-xl border border-slate-200 overflow-hidden">
      <div className="p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 bg-white rounded-lg border border-slate-200 flex items-center justify-center text-slate-400">
            <MapPin className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="font-bold text-slate-900">{loc.name}</h4>
              {loc.isVisible ? (
                <span className="flex items-center gap-1 text-xs text-emerald-600"><Eye className="h-3 w-3" /> Visible</span>
              ) : (
                <span className="flex items-center gap-1 text-xs text-slate-400"><EyeOff className="h-3 w-3" /> Hidden</span>
              )}
            </div>
            <p className="text-sm text-slate-500">{loc.addressLine1}, {loc.city}, {loc.stateCode} {loc.postalCode}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs font-bold text-slate-400">Max {loc.maxConcurrentBookings} concurrent</span>
          <button
            onClick={() => setShowServices(!showServices)}
            className="flex items-center gap-1 text-xs font-bold text-primary hover:underline"
          >
            Services {showServices ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {showServices && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 border-t border-slate-200 pt-3">
              {isLoadingServices ? (
                <div className="h-12 animate-pulse bg-slate-100 rounded-lg" />
              ) : !servicesData?.services.length ? (
                <p className="text-sm text-slate-400 italic">No services at this location.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {servicesData.services.map(svc => (
                    <div key={svc.id} className="flex items-center justify-between p-3 bg-white rounded-lg border border-slate-100">
                      <div>
                        <p className="font-bold text-sm text-slate-900">{svc.name}</p>
                        <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                          <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {svc.durationMins} min</span>
                          <span className="flex items-center gap-1"><DollarSign className="h-3 w-3" /> {formatCurrency(svc.basePriceMinor)}</span>
                        </div>
                      </div>
                      {svc.isVisible ? (
                        <Badge variant="success" className="text-[10px]">Active</Badge>
                      ) : (
                        <Badge className="text-[10px]">Hidden</Badge>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function AdminProviders() {
  const { data, isLoading, isError, refetch } = useListProviders({ request: { credentials: 'include' } });
  const [expandedProvider, setExpandedProvider] = useState<string | null>(null);

  const providers = data?.providers || [];

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-3xl font-display font-bold text-slate-900">Providers</h1>
        <p className="text-slate-500 mt-2">View all wash facility providers, their locations, and services.</p>
      </div>

      {isError ? (
        <ErrorState message="Could not load providers." onRetry={() => refetch()} />
      ) : isLoading ? (
        <div className="space-y-4">
          {[1,2].map(i => <div key={i} className="h-32 animate-pulse bg-slate-100 rounded-2xl" />)}
        </div>
      ) : providers.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-3xl border border-dashed border-slate-300">
          <Building2 className="h-10 w-10 text-slate-300 mx-auto mb-3" />
          <h3 className="text-lg font-bold text-slate-900">No providers</h3>
          <p className="text-slate-500 text-sm">No wash facility providers have been registered.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {providers.map((p, idx) => {
            const isExpanded = expandedProvider === p.id;
            return (
              <motion.div key={p.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.05 }}>
                <Card className="overflow-hidden">
                  <div
                    className="p-6 cursor-pointer hover:bg-slate-50/50 transition-colors"
                    onClick={() => setExpandedProvider(isExpanded ? null : p.id)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="h-12 w-12 bg-gradient-to-br from-blue-500 to-cyan-400 rounded-xl flex items-center justify-center text-white font-bold text-lg shadow-lg shadow-blue-500/20">
                          {p.name.charAt(0)}
                        </div>
                        <div>
                          <h3 className="text-xl font-bold text-slate-900">{p.name}</h3>
                          <p className="text-sm text-slate-500">{p.contactEmail || "No contact email"}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        {p.payoutReady ? (
                          <Badge variant="success">Payouts Active</Badge>
                        ) : (
                          <Badge variant="warning">Pending Connect</Badge>
                        )}
                        <div className={`transition-transform ${isExpanded ? "rotate-90" : ""}`}>
                          <ChevronRight className="h-5 w-5 text-slate-400" />
                        </div>
                      </div>
                    </div>
                  </div>

                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="px-6 pb-6 border-t border-slate-100 pt-4">
                          <h4 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4">Locations & Services</h4>
                          <ProviderLocations providerId={p.id} />
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </Card>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
