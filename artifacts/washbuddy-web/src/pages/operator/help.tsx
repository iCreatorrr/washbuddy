import React, { useState } from "react";
import { Card, Button, Input, Label } from "@/components/ui";
import { HelpCircle, Mail, Phone, Send } from "lucide-react";
import { toast } from "sonner";

export default function OperatorHelp() {
  const [category, setCategory] = useState("General Feedback");
  const [description, setDescription] = useState("");

  const handleSubmit = () => {
    if (!description.trim()) { toast.error("Please describe your feedback"); return; }
    toast.success("Thank you for your feedback!");
    setDescription("");
  };

  return (
    <div className="space-y-6 max-w-xl mx-auto">
      <div className="text-center space-y-2">
        <HelpCircle className="h-12 w-12 text-blue-500 mx-auto" />
        <h1 className="text-2xl font-display font-bold text-slate-900">Help & Support</h1>
        <p className="text-slate-500">Get help or share feedback</p>
      </div>

      <Card className="p-5 space-y-3">
        <h2 className="font-bold text-slate-900">Contact Support</h2>
        <div className="flex items-center gap-3 text-sm text-slate-600">
          <Mail className="h-4 w-4 text-blue-500" /> support@washbuddy.com
        </div>
        <div className="flex items-center gap-3 text-sm text-slate-600">
          <Phone className="h-4 w-4 text-blue-500" /> 1-800-WASHBUDDY
        </div>
      </Card>

      <Card className="p-5 space-y-4">
        <h2 className="font-bold text-slate-900">Submit Feedback</h2>
        <div>
          <Label>Category</Label>
          <select value={category} onChange={(e) => setCategory(e.target.value)}
            className="w-full h-10 px-3 border border-slate-200 rounded-xl text-sm bg-white">
            <option>Bug Report</option><option>Feature Request</option>
            <option>General Feedback</option><option>Suggestion</option>
          </select>
        </div>
        <div>
          <Label>Description</Label>
          <textarea className="w-full border border-slate-200 rounded-xl p-3 text-sm" rows={4}
            value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Tell us what's on your mind..." />
        </div>
        <Button onClick={handleSubmit} className="w-full gap-2"><Send className="h-4 w-4" /> Submit Feedback</Button>
      </Card>

      <p className="text-center text-sm text-slate-400">Help articles coming soon</p>
    </div>
  );
}
