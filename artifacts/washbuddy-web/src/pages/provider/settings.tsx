import React from "react";
import { useAuth } from "@/contexts/auth";
import { useListLocations, useListServices } from "@workspace/api-client-react";
import { Card, Badge, Button } from "@/components/ui";
import { MapPin, Settings, Clock, DollarSign } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

function LocationServices({ providerId, locationId }: { providerId: string; locationId: string }) {
  const { data, isLoading } = useListServices(providerId, locationId, {
    request: { credentials: 'include' }
  });

  if (isLoading) return <div className="h-20 animate-pulse bg-slate-100 rounded-xl" />;

  const services = data?.services || [];

  if (services.length === 0) {
    return (
      <div className="p-6 bg-slate-50 rounded-xl border border-dashed border-slate-300 text-center text-slate-400">
        No services configured yet.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {services.map(svc => (
        <div key={svc.id} className="p-4 bg-slate-50 rounded-xl border border-slate-200">
          <div className="flex items-center justify-between mb-2">
            <p className="font-bold text-slate-900">{svc.name}</p>
            {svc.isVisible ? (
              <Badge variant="success" className="text-xs">Active</Badge>
            ) : (
              <Badge className="text-xs">Hidden</Badge>
            )}
          </div>
          {svc.description && <p className="text-sm text-slate-500 mb-3">{svc.description}</p>}
          <div className="flex items-center gap-4 text-sm text-slate-600">
            <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {svc.durationMins} min</span>
            <span className="text-sm font-medium">{formatCurrency(svc.basePriceMinor)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function ProviderSettings() {
  const { user } = useAuth();
  const providerId = user?.roles.find(r => r.scope === "provider")?.scopeId || "";
  
  const { data, isLoading } = useListLocations(providerId, { 
    query: { enabled: !!providerId },
    request: { credentials: 'include' }
  });

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold text-slate-900">Locations & Services</h1>
          <p className="text-slate-500 mt-2">Manage your facilities, hours, and service offerings.</p>
        </div>
      </div>

      {isLoading ? (
        <div className="h-32 animate-pulse bg-slate-100 rounded-2xl" />
      ) : !data?.locations.length ? (
        <div className="text-center py-20 bg-white rounded-3xl border border-dashed border-slate-300">
          <MapPin className="h-12 w-12 text-slate-300 mx-auto mb-4" />
          <h3 className="text-lg font-bold text-slate-900">No locations found</h3>
          <p className="text-slate-500">Contact platform admin to set up your first location.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {data.locations.map(loc => (
            <Card key={loc.id} className="p-6 md:p-8">
              <div className="flex flex-col md:flex-row justify-between md:items-start gap-6">
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <h2 className="text-2xl font-bold text-slate-900">{loc.name}</h2>
                    {loc.isVisible ? <Badge variant="success">Active</Badge> : <Badge>Hidden</Badge>}
                  </div>
                  <p className="text-slate-500 flex items-center gap-2 font-medium">
                    <MapPin className="h-4 w-4" /> {loc.addressLine1}, {loc.city}, {loc.stateCode}
                  </p>
                  <p className="text-sm text-slate-400 mt-1">
                    Max concurrent washes: {loc.maxConcurrentBookings}
                  </p>
                </div>
              </div>

              <div className="mt-8 pt-8 border-t border-slate-100">
                <h3 className="text-lg font-bold text-slate-900 mb-4">Services at this location</h3>
                <LocationServices providerId={providerId} locationId={loc.id} />
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
