import React, { useState } from "react";
import { useListVehicles, useCreateVehicle } from "@workspace/api-client-react";
import { Card, Button, Input, Label, Badge } from "@/components/ui";
import { Truck, Plus } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

export default function MyVehicles() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useListVehicles({ request: { credentials: 'include' } });
  const createMutation = useCreateVehicle({ request: { credentials: 'include' } });
  const [showForm, setShowForm] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    try {
      await createMutation.mutateAsync({
        data: {
          unitNumber: fd.get("unitNumber") as string,
          categoryCode: fd.get("categoryCode") as string,
          licensePlate: (fd.get("licensePlate") as string) || undefined,
        }
      });
      queryClient.invalidateQueries({ queryKey: ["/api/vehicles"] });
      setShowForm(false);
    } catch (err) {
      alert("Failed to add vehicle");
    }
  };

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-display font-bold text-slate-900">My Vehicles</h1>
          <p className="text-slate-500 mt-2">Manage your fleet to speed up booking.</p>
        </div>
        <Button onClick={() => setShowForm(!showForm)}>
          {showForm ? "Cancel" : <><Plus className="h-4 w-4 mr-2" /> Add Vehicle</>}
        </Button>
      </div>

      {showForm && (
        <Card className="p-6 bg-blue-50/50 border-blue-100">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label>Unit Number *</Label>
                <Input name="unitNumber" required placeholder="e.g. Bus 104" />
              </div>
              <div>
                <Label>Category *</Label>
                <select name="categoryCode" className="flex h-12 w-full rounded-xl border-2 border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-900">
                  <option value="MOTORCOACH">Motorcoach</option>
                  <option value="SCHOOL_BUS">School Bus</option>
                  <option value="TRANSIT">Transit</option>
                  <option value="MINIBUS">Minibus</option>
                </select>
              </div>
              <div>
                <Label>License Plate</Label>
                <Input name="licensePlate" placeholder="Optional" />
              </div>
            </div>
            <div className="flex justify-end">
              <Button type="submit" isLoading={createMutation.isPending}>Save Vehicle</Button>
            </div>
          </form>
        </Card>
      )}

      {isLoading ? (
        <div className="grid grid-cols-2 gap-4">
          {[1,2].map(i => <Card key={i} className="h-24 animate-pulse bg-slate-100 border-none" />)}
        </div>
      ) : data?.vehicles.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-3xl border border-dashed border-slate-300">
          <Truck className="h-12 w-12 text-slate-300 mx-auto mb-4" />
          <h3 className="text-lg font-bold text-slate-900">No vehicles added</h3>
          <p className="text-slate-500">Add your first vehicle to get started.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {data?.vehicles.map(v => (
            <Card key={v.id} className="p-5 flex items-center gap-4">
              <div className="h-12 w-12 bg-slate-100 rounded-xl flex items-center justify-center shrink-0">
                <Truck className="h-6 w-6 text-slate-500" />
              </div>
              <div>
                <h3 className="font-bold text-lg text-slate-900">{v.unitNumber}</h3>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="default">{v.categoryCode}</Badge>
                  {v.licensePlate && <span className="text-xs text-slate-500 uppercase font-mono bg-slate-100 px-2 py-0.5 rounded border">{v.licensePlate}</span>}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
