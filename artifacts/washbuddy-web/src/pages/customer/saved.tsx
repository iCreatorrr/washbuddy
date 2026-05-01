import { Card } from "@/components/ui";
import { Bookmark } from "lucide-react";

/**
 * /saved — placeholder page reachable from the customer hamburger
 * menu. Round 1 Phase A scaffolds the route so the menu entry has
 * a destination; the real saved-searches and saved-providers
 * surface lands in v1.5 per PRD §10 and `04-future-considerations.md`.
 *
 * No data fetching, no state, no functionality — pure stub.
 */
export default function Saved() {
  return (
    <div className="space-y-4">
      <Card className="text-center py-16 border-dashed">
        <Bookmark className="h-10 w-10 text-slate-300 mx-auto mb-3" />
        <h2 className="text-lg font-bold text-slate-900 mb-1">Saved coming soon</h2>
        <p className="text-sm text-slate-500 max-w-md mx-auto">
          Save searches and favorite providers will live here. Available in a future update.
        </p>
      </Card>
    </div>
  );
}
