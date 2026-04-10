import React, { useState } from "react";
import { Button, Label } from "@/components/ui";
import { X, Send } from "lucide-react";
import { toast } from "sonner";

const API_BASE = import.meta.env.VITE_API_URL || "";

const TEMPLATES = [
  { id: "WASH_COMPLETE", label: "Wash complete", body: "Your wash is complete." },
  { id: "RUNNING_LATE", label: "Running late", body: "We're running approximately [X] minutes behind schedule. We apologize for the delay." },
  { id: "READY_FOR_PICKUP", label: "Ready for pickup", body: "Your bus is ready for pickup in [location]." },
  { id: "NEED_TO_DISCUSS", label: "Need to discuss", body: "We need to discuss something about your booking. Please contact us." },
  { id: "RESCHEDULED", label: "Rescheduled", body: "Your scheduled wash has been moved to [new time]. Please confirm or contact us." },
  { id: "CUSTOM", label: "Custom message", body: "" },
];

interface SendMessageProps {
  bookingId: string;
  driverName: string;
  onClose: () => void;
}

export function SendMessageDialog({ bookingId, driverName, onClose }: SendMessageProps) {
  const [templateId, setTemplateId] = useState("WASH_COMPLETE");
  const [body, setBody] = useState(TEMPLATES[0].body);
  const [sending, setSending] = useState(false);

  const handleTemplateChange = (id: string) => {
    setTemplateId(id);
    const tmpl = TEMPLATES.find((t) => t.id === id);
    if (tmpl) setBody(tmpl.body);
  };

  const handleSend = async () => {
    if (!body.trim()) { toast.error("Message cannot be empty"); return; }
    setSending(true);
    try {
      const res = await fetch(`${API_BASE}/api/bookings/${bookingId}/messages`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId: templateId !== "CUSTOM" ? templateId : null, body: body.trim() }),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.message || "Failed"); }
      toast.success(`Message sent to ${driverName}`);
      onClose();
    } catch (err: any) { toast.error(err.message); }
    finally { setSending(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl mx-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-slate-900">Message Driver</h3>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded-lg"><X className="h-5 w-5 text-slate-400" /></button>
        </div>

        <div className="space-y-4">
          <div>
            <Label>Template</Label>
            <select value={templateId} onChange={(e) => handleTemplateChange(e.target.value)}
              className="w-full h-10 px-3 border border-slate-200 rounded-xl text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none">
              {TEMPLATES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </div>

          <div>
            <Label>Message</Label>
            <textarea className="w-full border-2 border-slate-200 rounded-xl p-3 text-sm focus:border-blue-300 focus:outline-none"
              rows={4} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Type your message..." />
            <p className="text-xs text-slate-400 mt-1">Replace any [bracketed text] with actual values before sending.</p>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
            <Button className="flex-1 gap-2" onClick={handleSend} isLoading={sending}><Send className="h-4 w-4" /> Send Message</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
