import React from "react";
import { useAuth } from "@/contexts/auth";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { Button } from "./ui";
import { LogOut, Menu, User, MapPin, Calendar, Truck, LayoutDashboard, Settings, Users, Droplets, Route, Star, Shield, ClipboardList, RotateCcw, Building2, BarChart3 } from "lucide-react";
import { NotificationBell } from "./notification-bell";
import { motion, AnimatePresence } from "framer-motion";

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, logout, hasRole } = useAuth();
  const [location] = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false);

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
    if (hasRole("PROVIDER_ADMIN") || hasRole("PROVIDER_STAFF")) {
      return [
        { label: "Dashboard", icon: LayoutDashboard, href: "/provider" },
        { label: "Reviews", icon: Star, href: "/provider/reviews" },
        { label: "Locations & Services", icon: Settings, href: "/provider/settings" },
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
      { label: "Find a Wash", icon: MapPin, href: "/search" },
      { label: "Route Planner", icon: Route, href: "/route-planner" },
      { label: "My Bookings", icon: Calendar, href: "/bookings" },
      { label: "My Vehicles", icon: Truck, href: "/vehicles" },
    ];
    if (hasRole("DRIVER")) {
      customerItems.push({ label: "Wash Requests", icon: ClipboardList, href: "/fleet/requests" });
    }
    return customerItems;
  };

  const navItems = getNavItems();

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Sidebar Desktop */}
      <aside className="hidden lg:flex flex-col w-72 bg-slate-900 text-white fixed h-full z-20">
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
      <main className="flex-1 lg:pl-72 flex flex-col min-h-screen relative">
        {/* Mobile Header */}
        <header className="lg:hidden flex items-center justify-between p-4 bg-white border-b border-slate-200 sticky top-0 z-30 glass-panel">
          <div className="flex items-center gap-2">
            <Droplets className="h-6 w-6 text-blue-600" />
            <span className="text-xl font-display font-bold text-slate-900">WashBuddy</span>
          </div>
          <div className="flex items-center gap-1">
            <NotificationBell />
            <Button variant="ghost" size="icon" onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}>
              <Menu className="h-6 w-6" />
            </Button>
          </div>
        </header>

        {/* Mobile Menu Dropdown */}
        <AnimatePresence>
          {isMobileMenuOpen && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="lg:hidden bg-slate-900 text-white overflow-hidden border-b border-slate-800 sticky top-[73px] z-20"
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
          )}
        </AnimatePresence>

        <div className="flex-1 p-4 md:p-8 w-full max-w-7xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
