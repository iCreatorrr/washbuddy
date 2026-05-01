import React from "react";
import { useAuth } from "@/contexts/auth";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { Button } from "./ui";
import { LogOut, Menu, User, MapPin, Calendar, Truck, LayoutDashboard, Settings, Users, Droplets, Route, Star, Shield, ClipboardList, RotateCcw, Building2, BarChart3, X, ArrowLeft, Bookmark } from "lucide-react";
import { NotificationBell } from "./notification-bell";
import { motion } from "framer-motion";

/**
 * Lets pages that suppress the AppLayout mobile header (currently
 * just `/find-a-wash` per Round 1 Phase A — EID §3.1) trigger the
 * shared mobile menu without rebuilding the menu themselves. The
 * dropdown panel is still owned by AppLayout; pages just toggle
 * `isOpen` from their own header replacement (e.g., the floating
 * top-right cluster on find-a-wash).
 */
type MobileMenuController = {
  isOpen: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
};
const MobileMenuContext = React.createContext<MobileMenuController | null>(null);
export function useMobileMenu(): MobileMenuController {
  const ctx = React.useContext(MobileMenuContext);
  if (!ctx) throw new Error("useMobileMenu must be used within AppLayout");
  return ctx;
}

export function AppLayout({ children, hideMobileHeader = false }: { children: React.ReactNode; hideMobileHeader?: boolean }) {
  const { user, logout, hasRole } = useAuth();
  const [location] = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false);

  // Auto-close mobile menu on route change
  React.useEffect(() => { setIsMobileMenuOpen(false); }, [location]);

  if (!user) return <>{children}</>;

  const getNavItems = () => {
    if (hasRole("PLATFORM_SUPER_ADMIN")) {
      return [
        { label: "Overview", icon: LayoutDashboard, href: "/admin" },
        { label: "All Bookings", icon: Calendar, href: "/admin/bookings" },
        { label: "Providers", icon: Users, href: "/admin/providers" },
        { label: "Reviews", icon: Shield, href: "/admin/reviews" },
      ];
    }
    if (hasRole("PROVIDER_STAFF") && !hasRole("PROVIDER_ADMIN")) {
      // Operator-only navigation (simplified)
      return [
        { label: "Daily Board", icon: Calendar, href: "/provider/daily-board" },
        { label: "Bay Timeline", icon: LayoutDashboard, href: "/provider/bay-timeline" },
        { label: "My Stats", icon: Star, href: "/operator/my-stats" },
        { label: "Help", icon: Settings, href: "/operator/help" },
      ];
    }
    if (hasRole("PROVIDER_ADMIN")) {
      return [
        { label: "Daily Board", icon: Calendar, href: "/provider/daily-board" },
        { label: "Bay Timeline", icon: LayoutDashboard, href: "/provider/bay-timeline" },
        { label: "Shift Overview", icon: ClipboardList, href: "/provider/shift-overview" },
        { label: "Clients", icon: Users, href: "/provider/clients" },
        { label: "Analytics", icon: BarChart3, href: "/provider/analytics" },
        { label: "Operators", icon: Star, href: "/provider/operator-performance" },
        { label: "Reviews", icon: Star, href: "/provider/reviews" },
        { label: "Audit Log", icon: ClipboardList, href: "/provider/audit-log" },
        { label: "Settings", icon: Settings, href: "/provider/settings" },
      ];
    }
    const isOperator = hasRole("FLEET_ADMIN") || hasRole("DISPATCHER") || hasRole("MAINTENANCE_MANAGER") || hasRole("READ_ONLY_ANALYST");
    if (isOperator) {
      const items = [
        { label: "Overview", icon: LayoutDashboard, href: "/fleet" },
        { label: "Vehicles", icon: Truck, href: "/fleet/vehicles" },
        { label: "Wash Requests", icon: ClipboardList, href: "/fleet/requests" },
        { label: "Programs", icon: RotateCcw, href: "/fleet/programs" },
      ];
      if (hasRole("FLEET_ADMIN") || hasRole("DISPATCHER") || hasRole("MAINTENANCE_MANAGER") || hasRole("READ_ONLY_ANALYST")) {
        items.push({ label: "Reports", icon: BarChart3, href: "/fleet/reports" });
      }
      if (hasRole("FLEET_ADMIN") || hasRole("MAINTENANCE_MANAGER")) {
        items.push({ label: "Settings", icon: Settings, href: "/fleet/settings" });
      }
      return items;
    }
    const customerItems = [
      { label: "Find a Wash", icon: MapPin, href: "/find-a-wash" },
      { label: "Saved", icon: Bookmark, href: "/saved" },
      { label: "My Bookings", icon: Calendar, href: "/bookings" },
      { label: "My Vehicles", icon: Truck, href: "/vehicles" },
    ];
    if (hasRole("DRIVER")) {
      customerItems.push({ label: "Wash Requests", icon: ClipboardList, href: "/fleet/requests" });
    }
    return customerItems;
  };

  const navItems = getNavItems();

  const getRoleAccent = () => {
    if (hasRole("PLATFORM_SUPER_ADMIN") || hasRole("PLATFORM_SUPPORT_ADMIN") || hasRole("PLATFORM_OPS_ADMIN")) return "border-l-4 border-slate-500";
    if (hasRole("PROVIDER_ADMIN") || hasRole("PROVIDER_STAFF")) return "border-l-4 border-teal-500";
    if (hasRole("FLEET_ADMIN") || hasRole("DISPATCHER") || hasRole("MAINTENANCE_MANAGER") || hasRole("READ_ONLY_ANALYST")) return "border-l-4 border-blue-500";
    return "border-l-4 border-cyan-500";
  };

  const menuController: MobileMenuController = {
    isOpen: isMobileMenuOpen,
    setOpen: setIsMobileMenuOpen,
    toggle: () => setIsMobileMenuOpen((v) => !v),
  };

  // When the mobile header is suppressed (find-a-wash) the dropdown
  // doesn't need to clear a 73px sticky header — anchor it at the
  // top of the viewport instead. The page renders its own top-right
  // hamburger trigger that calls into this controller.
  const dropdownTopOffset = hideMobileHeader ? "top-0" : "top-[73px]";

  return (
    <MobileMenuContext.Provider value={menuController}>
    <div className="min-h-screen bg-slate-50 flex">
      {/* Sidebar Desktop */}
      <aside className={cn("hidden lg:flex flex-col w-72 bg-slate-900 text-white fixed h-full z-20", getRoleAccent())}>
        <div className="p-6 flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center shadow-lg shadow-cyan-500/20">
            <Droplets className="h-6 w-6 text-white" />
          </div>
          <span className="text-2xl font-display font-bold tracking-tight">WashBuddy</span>
        </div>
        
        <nav className="flex-1 px-4 space-y-2 mt-4">
          {navItems.map((item) => {
            const isActive = location === item.href;
            return (
              <Link key={item.href} href={item.href} className="block">
                <div className={cn(
                  "flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 font-medium",
                  isActive 
                    ? "bg-blue-600/10 text-blue-400 border border-blue-500/20" 
                    : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                )}>
                  <item.icon className={cn("h-5 w-5", isActive ? "text-blue-400" : "text-slate-500")} />
                  {item.label}
                </div>
              </Link>
            );
          })}
        </nav>

        <div className="p-4 mt-auto">
          <div className="px-4 mb-3">
            <NotificationBell popoverDirection="up" />
          </div>
          <div className="bg-slate-800/50 rounded-2xl p-4 border border-slate-700/50">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 rounded-full bg-slate-700 flex items-center justify-center shrink-0">
                <User className="h-5 w-5 text-slate-300" />
              </div>
              <div className="overflow-hidden">
                <p className="text-sm font-bold text-white truncate">{user.firstName} {user.lastName}</p>
                <p className="text-xs text-slate-400 truncate">{user.email}</p>
              </div>
            </div>
            <Button variant="outline" className="w-full border-slate-600 text-slate-300 hover:bg-slate-700 hover:text-white hover:border-slate-500" onClick={logout}>
              <LogOut className="h-4 w-4 mr-2" />
              Sign Out
            </Button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      {/* min-w-0 is load-bearing: without it, a flex-item's default
          min-width: auto lets wide children (e.g. a horizontally scrollable
          day-picker on the booking page) push the whole main column past
          the viewport, breaking mobile. min-w-0 caps main at its allotted
          flex space and lets descendants' overflow-x-auto actually clip. */}
      <main className="flex-1 lg:pl-72 flex flex-col min-h-screen relative min-w-0">
        {/* Mobile Header — suppressed when `hideMobileHeader` is set
            (find-a-wash provides its own floating top-left button +
            top-right cluster per EID §3.1). Desktop sidebar header
            is unaffected; this only governs the mobile sticky bar. */}
        {!hideMobileHeader && (
          <header className="lg:hidden flex items-center justify-between p-4 bg-white border-b border-slate-200 sticky top-0 z-30 glass-panel">
            <div className="flex items-center gap-2">
              {/* In-app back button — popped browser history when there's
                  in-session navigation, otherwise stays hidden so the
                  landing page doesn't show a confusing "back to nothing". */}
              {window.history.length > 1 && location !== "/" && (
                <button
                  type="button"
                  onClick={() => window.history.back()}
                  aria-label="Back"
                  className="p-2 -ml-2 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors"
                >
                  <ArrowLeft className="h-5 w-5" />
                </button>
              )}
              <Droplets className="h-6 w-6 text-blue-600" />
              <span className="text-xl font-display font-bold text-slate-900">WashBuddy</span>
            </div>
            <div className="flex items-center gap-1">
              <NotificationBell />
              <Button variant="ghost" size="icon" onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} aria-label={isMobileMenuOpen ? "Close menu" : "Open menu"}>
                {isMobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
              </Button>
            </div>
          </header>
        )}

        {/* Mobile Menu Dropdown — backdrop dismisses on tap. No
            AnimatePresence and no exit animation: a 300ms height/
            opacity exit caused a visible desync where the icon (which
            reads isMobileMenuOpen synchronously) had already flipped
            back to the three-lines glyph while the menu was still
            rendering its exit. Users would tap the icon thinking it
            would close the visible menu, but state was already false,
            so the tap re-opened it. Instant render — when state is
            true the menu is visible; when false it isn't. The slide-in
            animation on entry is preserved via initial/animate. */}
        {isMobileMenuOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.15 }}
              onClick={() => setIsMobileMenuOpen(false)}
              className={cn("lg:hidden fixed inset-0 bg-black/40 z-10", dropdownTopOffset)}
              aria-hidden
            />
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              transition={{ duration: 0.15 }}
              className={cn("lg:hidden bg-slate-900 text-white overflow-hidden border-b border-slate-800 sticky z-20", dropdownTopOffset)}
            >
              <nav className="p-4 space-y-2">
                {navItems.map((item) => (
                  <Link key={item.href} href={item.href} className="block" onClick={() => setIsMobileMenuOpen(false)}>
                    <div className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-slate-800 text-slate-300">
                      <item.icon className="h-5 w-5" />
                      {item.label}
                    </div>
                  </Link>
                ))}
                <div className="pt-4 mt-4 border-t border-slate-800">
                  <Button variant="ghost" className="w-full text-slate-300 hover:bg-slate-800 hover:text-white" onClick={logout}>
                    <LogOut className="h-4 w-4 mr-2" /> Sign Out
                  </Button>
                </div>
              </nav>
            </motion.div>
          </>
        )}

        <div className="flex-1 p-4 md:p-8 w-full max-w-7xl mx-auto">
          {children}
        </div>
      </main>
    </div>
    </MobileMenuContext.Provider>
  );
}
