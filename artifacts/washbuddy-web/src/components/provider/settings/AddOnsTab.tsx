import React, { useState, useEffect, useCallback } from "react";
import { Card, Badge, Button, Input, Label } from "@/components/ui";
import {
  Package, ClipboardList, Plus, MoreVertical,
  Coffee, GlassWater, Cookie, UtensilsCrossed, Apple, Citrus,
  Droplets, Sparkles, Eraser, Wind, Leaf, SprayCan,
  Fuel, Gauge, Thermometer, Wrench, Shield, Snowflake,
  Sofa, ShowerHead, Wifi, Tv, Armchair, Bed,
  ShoppingBag, Gift, Star, Box, CircleDot,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { formatCurrency, cn } from "@/lib/utils";

const API_BASE = import.meta.env.VITE_API_URL || "";

const CATEGORIES: Record<string, { label: string; emoji: string }> = {
  RESTROOM_SUPPLIES: { label: "Restroom Supplies", emoji: "\u{1F6BF}" },
  DRIVER_AMENITIES: { label: "Driver Amenities", emoji: "\u2615" },
  VEHICLE_SUPPLIES: { label: "Vehicle Supplies", emoji: "\u{1F527}" },
  SPECIALTY_TREATMENTS: { label: "Specialty Treatments", emoji: "\u2728" },
  CUSTOM: { label: "Additional Items", emoji: "\u{1F4E6}" },
};

const ICON_NAMES = [
  "Coffee", "GlassWater", "Cookie", "UtensilsCrossed", "Apple", "Citrus",
  "Droplets", "Sparkles", "Eraser", "Wind", "Leaf", "SprayCan",
  "Fuel", "Gauge", "Thermometer", "Wrench", "Shield", "Snowflake",
  "Sofa", "ShowerHead", "Wifi", "Tv", "Armchair", "Bed",
  "Package", "ShoppingBag", "Gift", "Star", "Box", "CircleDot",
];

interface AddOn {
  id: string;
  category: string;
  name: string;
  description?: string | null;
  iconName: string;
  priceMinor: number;
  quantityMode: string;
  isActive: boolean;
  displayOrder: number;
}

const ICON_MAP: Record<string, React.ComponentType<any>> = {
  Coffee, GlassWater, Cookie, UtensilsCrossed, Apple, Citrus,
  Droplets, Sparkles, Eraser, Wind, Leaf, SprayCan,
  Fuel, Gauge, Thermometer, Wrench, Shield, Snowflake,
  Sofa, ShowerHead, Wifi, Tv, Armchair, Bed,
  Package, ShoppingBag, Gift, Star, Box, CircleDot,
};

function DynamicIcon({ name, className }: { name: string; className?: string }) {
  const Icon = ICON_MAP[name] || Package;
  return <Icon className={className} />;
}

function IconPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="w-full justify-start gap-2">
          <DynamicIcon name={value} className="h-4 w-4" />
          {value}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80">
        <div className="grid grid-cols-6 gap-2">
          {ICON_NAMES.map((name) => (
            <button
              key={name}
              className={cn("p-2 rounded-lg hover:bg-slate-100", value === name && "bg-blue-100 ring-2 ring-blue-500")}
              onClick={() => { onChange(name); setOpen(false); }}
            >
              <DynamicIcon name={name} className="h-5 w-5 mx-auto" />
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function AddOnsTab({ providerId }: { providerId: string }) {
  const [locations, setLocations] = useState<{ id: string; name: string }[]>([]);
  const [selectedLocId, setSelectedLocId] = useState("");
  const [addOns, setAddOns] = useState<AddOn[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editItem, setEditItem] = useState<AddOn | null>(null);
  const [isNew, setIsNew] = useState(false);

  // Form state
  const [itemName, setItemName] = useState("");
  const [itemCategory, setItemCategory] = useState("RESTROOM_SUPPLIES");
  const [itemPrice, setItemPrice] = useState("");
  const [itemMode, setItemMode] = useState("COUNTABLE");
  const [itemIcon, setItemIcon] = useState("Package");
  const [itemDesc, setItemDesc] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`${API_BASE}/api/providers/${providerId}/locations`, { credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        const locs = d.locations || [];
        setLocations(locs);
        if (locs.length > 0 && !selectedLocId) setSelectedLocId(locs[0].id);
      })
      .catch(() => {});
  }, [providerId]);

  const loadAddOns = useCallback(async () => {
    if (!selectedLocId) return;
    setIsLoading(true);
    try {
      const r = await fetch(`${API_BASE}/api/providers/${providerId}/locations/${selectedLocId}/add-ons`, { credentials: "include" });
      const d = await r.json();
      setAddOns(d.addOns || []);
    } catch {
      toast.error("Failed to load add-ons");
    } finally {
      setIsLoading(false);
    }
  }, [providerId, selectedLocId]);

  useEffect(() => { loadAddOns(); }, [loadAddOns]);

  const initFromTemplate = async () => {
    try {
      await fetch(`${API_BASE}/api/providers/${providerId}/locations/${selectedLocId}/add-ons/init-from-template`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: "{}",
      });
      toast.success("Template items created");
      loadAddOns();
    } catch {
      toast.error("Failed to initialize template");
    }
  };

  const toggleItem = async (id: string, isActive: boolean) => {
    try {
      await fetch(`${API_BASE}/api/providers/${providerId}/locations/${selectedLocId}/add-ons/${id}`, {
        method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive }),
      });
      setAddOns((prev) => prev.map((a) => (a.id === id ? { ...a, isActive } : a)));
    } catch {
      toast.error("Failed to update");
    }
  };

  const deleteItem = async (id: string) => {
    try {
      await fetch(`${API_BASE}/api/providers/${providerId}/locations/${selectedLocId}/add-ons/${id}`, {
        method: "DELETE", credentials: "include",
      });
      toast.success("Item deleted");
      setAddOns((prev) => prev.filter((a) => a.id !== id));
    } catch {
      toast.error("Failed to delete");
    }
  };

  const openCreate = () => {
    setIsNew(true);
    setEditItem({} as AddOn);
    setItemName("");
    setItemCategory("RESTROOM_SUPPLIES");
    setItemPrice("");
    setItemMode("COUNTABLE");
    setItemIcon("Package");
    setItemDesc("");
  };

  const openEdit = (item: AddOn) => {
    setIsNew(false);
    setEditItem(item);
    setItemName(item.name);
    setItemCategory(item.category);
    setItemPrice((item.priceMinor / 100).toFixed(2));
    setItemMode(item.quantityMode);
    setItemIcon(item.iconName);
    setItemDesc(item.description || "");
  };

  const handleSave = async () => {
    if (!itemName.trim()) { toast.error("Name is required"); return; }
    setSaving(true);
    try {
      const body = {
        name: itemName,
        category: itemCategory,
        priceMinor: Math.round(parseFloat(itemPrice || "0") * 100),
        quantityMode: itemMode,
        iconName: itemIcon,
        description: itemDesc || null,
        currencyCode: "USD",
        isActive: true,
      };
      if (isNew) {
        await fetch(`${API_BASE}/api/providers/${providerId}/locations/${selectedLocId}/add-ons`, {
          method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      } else {
        await fetch(`${API_BASE}/api/providers/${providerId}/locations/${selectedLocId}/add-ons/${editItem!.id}`, {
          method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      }
      toast.success(isNew ? "Item created" : "Item updated");
      setEditItem(null);
      loadAddOns();
    } catch {
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  };

  // Group add-ons by category
  const grouped = addOns.reduce<Record<string, AddOn[]>>((acc, a) => {
    (acc[a.category] = acc[a.category] || []).push(a);
    return acc;
  }, {});

  if (isLoading) {
    return <div className="space-y-4">{[1, 2].map((i) => <div key={i} className="h-24 animate-pulse bg-slate-100 rounded-xl" />)}</div>;
  }

  return (
    <div className="space-y-4">
      {locations.length > 1 && (
        <div>
          <Label>Location</Label>
          <select className="w-full h-10 px-3 border border-slate-200 rounded-xl text-sm bg-white"
            value={selectedLocId} onChange={(e) => setSelectedLocId(e.target.value)}>
            {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>
      )}

      {addOns.length === 0 ? (
        <div className="text-center py-16 space-y-4">
          <Package className="h-12 w-12 mx-auto text-slate-400" />
          <h3 className="text-lg font-bold text-slate-900">Set up your add-ons catalog</h3>
          <p className="text-sm text-slate-500 max-w-md mx-auto">
            Add-ons let your operators offer restroom supplies, driver amenities, and specialty treatments during washes — increasing revenue per visit.
          </p>
          <div className="flex gap-3 justify-center">
            <Button onClick={initFromTemplate}>
              <ClipboardList className="h-4 w-4 mr-2" /> Start from Template
            </Button>
            <Button variant="outline" onClick={openCreate}>
              <Plus className="h-4 w-4 mr-2" /> Create from Scratch
            </Button>
          </div>
        </div>
      ) : (
        <>
          {Object.entries(CATEGORIES).map(([cat, meta]) => {
            const items = grouped[cat];
            if (!items?.length) return null;
            return (
              <Collapsible key={cat} defaultOpen>
                <Card className="overflow-hidden">
                  <CollapsibleTrigger className="flex items-center gap-2 w-full p-4 hover:bg-slate-50 text-left">
                    <span className="text-lg">{meta.emoji}</span>
                    <span className="font-bold text-slate-900 flex-1">{meta.label}</span>
                    <Badge className="text-[10px]">{items.length}</Badge>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="px-2 pb-3 space-y-0.5">
                      {items.sort((a, b) => a.displayOrder - b.displayOrder).map((item) => (
                        <div key={item.id} className="flex items-center gap-3 py-2.5 px-3 rounded-lg hover:bg-slate-50 group">
                          <Switch checked={item.isActive} onCheckedChange={(v) => toggleItem(item.id, v)} />
                          <DynamicIcon name={item.iconName} className="h-5 w-5 text-slate-400 shrink-0" />
                          <span className="text-sm font-medium flex-1 text-slate-800">{item.name}</span>
                          <span className="text-sm text-slate-500">{formatCurrency(item.priceMinor)}</span>
                          <Badge variant="default" className="text-[10px] shrink-0">
                            {item.quantityMode === "COUNTABLE" ? "per unit" : "flat"}
                          </Badge>
                          <Button size="sm" variant="ghost" className="opacity-0 group-hover:opacity-100 h-7 px-2" onClick={() => openEdit(item)}>
                            Edit
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button size="icon" variant="ghost" className="h-7 w-7 opacity-0 group-hover:opacity-100">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => openEdit(item)}>Edit</DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem className="text-red-600" onClick={() => deleteItem(item.id)}>Delete</DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      ))}
                    </div>
                  </CollapsibleContent>
                </Card>
              </Collapsible>
            );
          })}
          <Button variant="outline" className="w-full" onClick={openCreate}>
            <Plus className="h-4 w-4 mr-2" /> Add Custom Item
          </Button>
        </>
      )}

      <Dialog open={!!editItem} onOpenChange={(o) => !o && setEditItem(null)}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{isNew ? "Add Item" : "Edit Item"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div><Label>Name</Label><Input value={itemName} onChange={(e) => setItemName(e.target.value)} /></div>
            <div>
              <Label>Category</Label>
              <Select value={itemCategory} onValueChange={setItemCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(CATEGORIES).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Price ($)</Label><Input type="number" step="0.01" value={itemPrice} onChange={(e) => setItemPrice(e.target.value)} /></div>
            <div>
              <Label>Quantity Mode</Label>
              <div className="flex gap-4 mt-1">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" checked={itemMode === "COUNTABLE"} onChange={() => setItemMode("COUNTABLE")} />
                  <span className="text-sm">Per unit (countable)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" checked={itemMode === "FLAT"} onChange={() => setItemMode("FLAT")} />
                  <span className="text-sm">Flat fee</span>
                </label>
              </div>
            </div>
            <div><Label>Icon</Label><IconPicker value={itemIcon} onChange={setItemIcon} /></div>
            <div><Label>Description (optional)</Label><Textarea value={itemDesc} onChange={(e) => setItemDesc(e.target.value)} rows={2} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditItem(null)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
