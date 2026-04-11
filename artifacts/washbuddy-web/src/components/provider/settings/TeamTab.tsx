import React, { useState, useEffect } from "react";
import { Card, Badge, Button, Input, Label } from "@/components/ui";
import { Plus, Users, UserX } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

const API_BASE = import.meta.env.VITE_API_URL || "";

interface TeamMember {
  membershipId: string;
  userId: string;
  userName: string;
  userEmail: string;
  role: string;
  locationName: string | null;
  isActive: boolean;
  createdAt: string;
}

interface Location {
  id: string;
  name: string;
}

export function TeamTab({ providerId }: { providerId: string }) {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [editMember, setEditMember] = useState<TeamMember | null>(null);
  const [confirmDeactivate, setConfirmDeactivate] = useState<TeamMember | null>(null);

  // Invite form
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("PROVIDER_STAFF");
  const [inviteLocationId, setInviteLocationId] = useState("");
  const [saving, setSaving] = useState(false);

  // Edit form
  const [editRole, setEditRole] = useState("");
  const [editLocationId, setEditLocationId] = useState("");

  useEffect(() => {
    Promise.all([
      fetch(`${API_BASE}/api/providers/${providerId}/team`, { credentials: "include" }).then((r) => r.json()),
      fetch(`${API_BASE}/api/providers/${providerId}/locations`, { credentials: "include" }).then((r) => r.json()),
    ]).then(([teamData, locData]) => {
      setMembers(teamData.members || []);
      setLocations(locData.locations || []);
    }).catch(() => toast.error("Failed to load team"))
      .finally(() => setIsLoading(false));
  }, [providerId]);

  const reload = async () => {
    const r = await fetch(`${API_BASE}/api/providers/${providerId}/team`, { credentials: "include" });
    const d = await r.json();
    setMembers(d.members || []);
  };

  const handleInvite = async () => {
    if (!inviteEmail.trim()) { toast.error("Email is required"); return; }
    setSaving(true);
    try {
      const body: Record<string, unknown> = { email: inviteEmail, role: inviteRole };
      if (inviteLocationId) body.locationId = inviteLocationId;
      const r = await fetch(`${API_BASE}/api/providers/${providerId}/team/invite`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        toast.error(err.message || "Failed to invite");
        return;
      }
      toast.success("Invitation sent");
      setShowInvite(false);
      setInviteEmail("");
      reload();
    } catch {
      toast.error("Failed to invite");
    } finally {
      setSaving(false);
    }
  };

  const handleEditOpen = (m: TeamMember) => {
    setEditMember(m);
    setEditRole(m.role);
    setEditLocationId("");
  };

  const handleEditSave = async () => {
    if (!editMember) return;
    setSaving(true);
    try {
      const body: Record<string, unknown> = { role: editRole };
      if (editLocationId) body.locationId = editLocationId;
      await fetch(`${API_BASE}/api/providers/${providerId}/team/${editMember.membershipId}`, {
        method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      toast.success("Member updated");
      setEditMember(null);
      reload();
    } catch {
      toast.error("Failed to update");
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async () => {
    if (!confirmDeactivate) return;
    setSaving(true);
    try {
      await fetch(`${API_BASE}/api/providers/${providerId}/team/${confirmDeactivate.membershipId}`, {
        method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: false }),
      });
      toast.success("Member deactivated");
      setConfirmDeactivate(null);
      reload();
    } catch {
      toast.error("Failed to deactivate");
    } finally {
      setSaving(false);
    }
  };

  const roleLabel = (r: string) => {
    if (r === "PROVIDER_ADMIN") return "Admin";
    if (r === "PROVIDER_STAFF") return "Operator";
    return r;
  };

  if (isLoading) {
    return <div className="space-y-3">{[1, 2, 3].map((i) => <div key={i} className="h-16 animate-pulse bg-slate-100 rounded-xl" />)}</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setShowInvite(true)}><Plus className="h-4 w-4 mr-2" /> Invite Team Member</Button>
      </div>

      {members.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-3xl border border-dashed border-slate-300">
          <Users className="h-12 w-12 text-slate-300 mx-auto mb-4" />
          <h3 className="text-lg font-bold text-slate-900 mb-1">No team members</h3>
          <p className="text-slate-500">Invite operators and admins to manage your locations.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {members.map((m) => (
            <Card key={m.membershipId} className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="font-bold text-slate-900 truncate">{m.userName || "Pending"}</span>
                    <Badge variant={m.role === "PROVIDER_ADMIN" ? "warning" : "default"}>{roleLabel(m.role)}</Badge>
                    {!m.isActive && <Badge variant="error" className="text-[10px]">Inactive</Badge>}
                  </div>
                  <p className="text-sm text-slate-500 truncate">{m.userEmail}</p>
                  {m.locationName && <p className="text-xs text-slate-400 mt-0.5">Assigned: {m.locationName}</p>}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button size="sm" variant="outline" onClick={() => handleEditOpen(m)}>Edit</Button>
                  {m.isActive && (
                    <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-700" onClick={() => setConfirmDeactivate(m)}>
                      <UserX className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Invite Dialog */}
      <Dialog open={showInvite} onOpenChange={setShowInvite}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Invite Team Member</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Email</Label><Input type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="operator@example.com" /></div>
            <div>
              <Label>Role</Label>
              <Select value={inviteRole} onValueChange={setInviteRole}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="PROVIDER_ADMIN">Provider Admin</SelectItem>
                  <SelectItem value="PROVIDER_STAFF">Provider Operator</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Assigned Location (optional)</Label>
              <Select value={inviteLocationId} onValueChange={setInviteLocationId}>
                <SelectTrigger><SelectValue placeholder="All locations" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All locations</SelectItem>
                  {locations.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowInvite(false)}>Cancel</Button>
            <Button onClick={handleInvite} disabled={saving}>{saving ? "Sending..." : "Send Invite"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editMember} onOpenChange={(o) => !o && setEditMember(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Edit Team Member</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-slate-600">{editMember?.userName} ({editMember?.userEmail})</p>
            <div>
              <Label>Role</Label>
              <Select value={editRole} onValueChange={setEditRole}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="PROVIDER_ADMIN">Provider Admin</SelectItem>
                  <SelectItem value="PROVIDER_STAFF">Provider Operator</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Assigned Location</Label>
              <Select value={editLocationId} onValueChange={setEditLocationId}>
                <SelectTrigger><SelectValue placeholder="All locations" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All locations</SelectItem>
                  {locations.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditMember(null)}>Cancel</Button>
            <Button onClick={handleEditSave} disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Deactivate Confirmation */}
      <Dialog open={!!confirmDeactivate} onOpenChange={(o) => !o && setConfirmDeactivate(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Deactivate Member</DialogTitle></DialogHeader>
          <p className="text-sm text-slate-600">
            This will revoke <strong>{confirmDeactivate?.userName || confirmDeactivate?.userEmail}</strong>'s access to WashBuddy. Are you sure?
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDeactivate(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDeactivate} disabled={saving}>{saving ? "..." : "Deactivate"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
