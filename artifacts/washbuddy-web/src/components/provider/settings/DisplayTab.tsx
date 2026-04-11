import React, { useState, useEffect } from "react";
import { Card, Label } from "@/components/ui";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Moon, Sun, LayoutDashboard } from "lucide-react";

export function DisplayTab() {
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem("wb-dark-mode") === "true");
  const [landingPage, setLandingPage] = useState(() => localStorage.getItem("wb-landing-page") || "daily-board");

  useEffect(() => {
    localStorage.setItem("wb-dark-mode", String(darkMode));
    if (darkMode) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [darkMode]);

  useEffect(() => {
    localStorage.setItem("wb-landing-page", landingPage);
  }, [landingPage]);

  return (
    <div className="space-y-4 max-w-lg">
      <Card className="p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {darkMode ? <Moon className="h-5 w-5 text-indigo-400" /> : <Sun className="h-5 w-5 text-amber-500" />}
            <div>
              <Label className="mb-0 text-base">Dark Mode</Label>
              <p className="text-sm text-slate-500">Switch between light and dark themes</p>
            </div>
          </div>
          <Switch checked={darkMode} onCheckedChange={setDarkMode} />
        </div>
      </Card>

      <Card className="p-5">
        <div className="flex items-center gap-3 mb-3">
          <LayoutDashboard className="h-5 w-5 text-blue-500" />
          <div>
            <Label className="mb-0 text-base">Default Landing Page</Label>
            <p className="text-sm text-slate-500">Choose which page to show after login</p>
          </div>
        </div>
        <Select value={landingPage} onValueChange={setLandingPage}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="daily-board">Daily Board</SelectItem>
            <SelectItem value="bay-timeline">Bay Timeline</SelectItem>
          </SelectContent>
        </Select>
      </Card>
    </div>
  );
}
