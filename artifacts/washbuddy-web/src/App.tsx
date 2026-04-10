import { lazy, Suspense, useEffect } from "react";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider, useAuth } from "./contexts/auth";
import { AppLayout } from "./components/layout";
import { Toaster } from "sonner";

// Lazy-loaded pages (route-based code splitting)
const Login = lazy(() => import("./pages/auth/login"));
const Register = lazy(() => import("./pages/auth/register"));
const CustomerSearch = lazy(() => import("./pages/customer/search"));
const LocationDetail = lazy(() => import("./pages/customer/location-detail"));
const MyBookings = lazy(() => import("./pages/customer/my-bookings"));
const MyVehicles = lazy(() => import("./pages/customer/my-vehicles"));
const RoutePlanner = lazy(() => import("./pages/customer/route-planner"));
const ProviderDashboard = lazy(() => import("./pages/provider/dashboard"));
const DailyBoard = lazy(() => import("./pages/provider/daily-board"));
const ProviderSettings = lazy(() => import("./pages/provider/settings"));
const ProviderReviews = lazy(() => import("./pages/provider/reviews"));
const ProviderOnboarding = lazy(() => import("./pages/provider/onboarding"));
const AdminDashboard = lazy(() => import("./pages/admin/dashboard"));
const AdminBookings = lazy(() => import("./pages/admin/bookings"));
const AdminProviders = lazy(() => import("./pages/admin/providers"));
const AdminReviews = lazy(() => import("./pages/admin/reviews"));
const FleetOverview = lazy(() => import("./pages/fleet/overview"));
const FleetVehicles = lazy(() => import("./pages/fleet/vehicles"));
const FleetWashRequests = lazy(() => import("./pages/fleet/wash-requests"));
const FleetRecurringPrograms = lazy(() => import("./pages/fleet/recurring-programs"));
const FleetProgramDetail = lazy(() => import("./pages/fleet/program-detail"));
const FleetProgramForm = lazy(() => import("./pages/fleet/program-form"));
const FleetSettings = lazy(() => import("./pages/fleet/settings"));
const FleetReports = lazy(() => import("./pages/fleet/reports"));
const FleetNewRequest = lazy(() => import("./pages/fleet/new-request"));
const FleetRequestDetail = lazy(() => import("./pages/fleet/request-detail"));
const BookingDetail = lazy(() => import("./pages/shared/booking-detail"));
const NotFound = lazy(() => import("./pages/not-found"));

const PageSpinner = () => (
  <div className="min-h-screen flex items-center justify-center bg-slate-50">
    <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
  </div>
);

const queryClient = new QueryClient();

function isFleetOperator(hasRole: (r: string) => boolean) {
  return hasRole("FLEET_ADMIN") || hasRole("DISPATCHER") || hasRole("MAINTENANCE_MANAGER") || hasRole("READ_ONLY_ANALYST");
}

function RouteGuard({ children, allowedRoles }: { children: React.ReactNode, allowedRoles?: string[] }) {
  const { user, isLoading, hasRole } = useAuth();
  const [location, setLocation] = useLocation();

  const hasAccess = !allowedRoles || allowedRoles.some(r => hasRole(r));

  useEffect(() => {
    if (!isLoading) {
      if (!user) {
        setLocation("/login");
      } else if (!hasAccess) {
        if (hasRole("PLATFORM_SUPER_ADMIN")) setLocation("/admin");
        else if (hasRole("PROVIDER_ADMIN") || hasRole("PROVIDER_STAFF")) setLocation("/provider");
        else if (isFleetOperator(hasRole)) setLocation("/fleet");
        else setLocation("/search");
      }
    }
  }, [user, isLoading, hasRole, hasAccess, location, setLocation]);

  if (isLoading || !user) return <div className="min-h-screen flex items-center justify-center bg-slate-50"><div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" /></div>;
  if (!hasAccess) return null;

  return <AppLayout>{children}</AppLayout>;
}

function RootRedirect() {
  const { user, isLoading, hasRole } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading) {
      if (!user) {
        setLocation("/login");
      } else if (hasRole("PLATFORM_SUPER_ADMIN")) {
        setLocation("/admin");
      } else if (hasRole("PROVIDER_ADMIN") || hasRole("PROVIDER_STAFF")) {
        setLocation("/provider");
      } else if (isFleetOperator(hasRole)) {
        setLocation("/fleet");
      } else {
        setLocation("/search");
      }
    }
  }, [user, isLoading, hasRole, setLocation]);

  return <div className="min-h-screen flex items-center justify-center bg-slate-50"><div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" /></div>;
}

function Router() {
  const { user } = useAuth();

  return (
    <Suspense fallback={<PageSpinner />}>
    <Switch>
      <Route path="/login">{user ? <RootRedirect /> : <Login />}</Route>
      <Route path="/register">{user ? <RootRedirect /> : <Register />}</Route>
      
      <Route path="/">
        <RootRedirect />
      </Route>

      {/* Customer Routes */}
      <Route path="/search">
        <RouteGuard><CustomerSearch /></RouteGuard>
      </Route>
      <Route path="/location/:id">
        <RouteGuard><LocationDetail /></RouteGuard>
      </Route>
      <Route path="/bookings">
        <RouteGuard><MyBookings /></RouteGuard>
      </Route>
      <Route path="/vehicles">
        <RouteGuard><MyVehicles /></RouteGuard>
      </Route>
      <Route path="/route-planner">
        <RouteGuard><RoutePlanner /></RouteGuard>
      </Route>

      {/* Provider Routes */}
      <Route path="/provider/onboarding">
        <RouteGuard allowedRoles={["PROVIDER_ADMIN"]}><ProviderOnboarding /></RouteGuard>
      </Route>
      <Route path="/provider/daily-board">
        <RouteGuard allowedRoles={["PROVIDER_ADMIN", "PROVIDER_STAFF"]}><DailyBoard /></RouteGuard>
      </Route>
      <Route path="/provider">
        <RouteGuard allowedRoles={["PROVIDER_ADMIN", "PROVIDER_STAFF"]}><DailyBoard /></RouteGuard>
      </Route>
      <Route path="/provider/reviews">
        <RouteGuard allowedRoles={["PROVIDER_ADMIN", "PROVIDER_STAFF"]}><ProviderReviews /></RouteGuard>
      </Route>
      <Route path="/provider/settings">
        <RouteGuard allowedRoles={["PROVIDER_ADMIN", "PROVIDER_STAFF"]}><ProviderSettings /></RouteGuard>
      </Route>

      {/* Admin Routes */}
      <Route path="/admin">
        <RouteGuard allowedRoles={["PLATFORM_SUPER_ADMIN"]}><AdminDashboard /></RouteGuard>
      </Route>
      <Route path="/admin/bookings">
        <RouteGuard allowedRoles={["PLATFORM_SUPER_ADMIN"]}><AdminBookings /></RouteGuard>
      </Route>
      <Route path="/admin/providers">
        <RouteGuard allowedRoles={["PLATFORM_SUPER_ADMIN"]}><AdminProviders /></RouteGuard>
      </Route>
      <Route path="/admin/reviews">
        <RouteGuard allowedRoles={["PLATFORM_SUPER_ADMIN"]}><AdminReviews /></RouteGuard>
      </Route>

      {/* Fleet Routes */}
      <Route path="/fleet">
        <RouteGuard allowedRoles={["FLEET_ADMIN", "DISPATCHER", "MAINTENANCE_MANAGER", "READ_ONLY_ANALYST", "DRIVER"]}><FleetOverview /></RouteGuard>
      </Route>
      <Route path="/fleet/vehicles">
        <RouteGuard allowedRoles={["FLEET_ADMIN", "DISPATCHER", "MAINTENANCE_MANAGER", "READ_ONLY_ANALYST", "DRIVER"]}><FleetVehicles /></RouteGuard>
      </Route>
      <Route path="/fleet/requests">
        <RouteGuard allowedRoles={["FLEET_ADMIN", "DISPATCHER", "MAINTENANCE_MANAGER", "READ_ONLY_ANALYST", "DRIVER"]}><FleetWashRequests /></RouteGuard>
      </Route>
      <Route path="/fleet/programs/new">
        <RouteGuard allowedRoles={["FLEET_ADMIN", "MAINTENANCE_MANAGER"]}><FleetProgramForm /></RouteGuard>
      </Route>
      <Route path="/fleet/programs/:id/edit">
        <RouteGuard allowedRoles={["FLEET_ADMIN", "MAINTENANCE_MANAGER"]}><FleetProgramForm /></RouteGuard>
      </Route>
      <Route path="/fleet/programs/:id">
        <RouteGuard allowedRoles={["FLEET_ADMIN", "DISPATCHER", "MAINTENANCE_MANAGER", "READ_ONLY_ANALYST"]}><FleetProgramDetail /></RouteGuard>
      </Route>
      <Route path="/fleet/programs">
        <RouteGuard allowedRoles={["FLEET_ADMIN", "DISPATCHER", "MAINTENANCE_MANAGER", "READ_ONLY_ANALYST"]}><FleetRecurringPrograms /></RouteGuard>
      </Route>
      <Route path="/fleet/reports">
        <RouteGuard allowedRoles={["FLEET_ADMIN", "DISPATCHER", "MAINTENANCE_MANAGER", "READ_ONLY_ANALYST"]}><FleetReports /></RouteGuard>
      </Route>
      <Route path="/fleet/settings">
        <RouteGuard allowedRoles={["FLEET_ADMIN", "MAINTENANCE_MANAGER"]}><FleetSettings /></RouteGuard>
      </Route>
      <Route path="/fleet/requests/new">
        <RouteGuard allowedRoles={["FLEET_ADMIN", "DISPATCHER", "MAINTENANCE_MANAGER", "DRIVER"]}><FleetNewRequest /></RouteGuard>
      </Route>
      <Route path="/fleet/requests/:id">
        <RouteGuard allowedRoles={["FLEET_ADMIN", "DISPATCHER", "MAINTENANCE_MANAGER", "READ_ONLY_ANALYST", "DRIVER"]}><FleetRequestDetail /></RouteGuard>
      </Route>

      {/* Shared */}
      <Route path="/bookings/:id">
        <RouteGuard><BookingDetail /></RouteGuard>
      </Route>

      <Route component={NotFound} />
    </Switch>
    </Suspense>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
        <AuthProvider>
          <Toaster position="top-right" richColors />
          <Router />
        </AuthProvider>
      </WouterRouter>
    </QueryClientProvider>
  );
}

export default App;
