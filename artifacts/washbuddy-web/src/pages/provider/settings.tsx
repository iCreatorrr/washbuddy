import React, { useState } from "react";
import { useAuth } from "@/contexts/auth";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LocationsTab } from "@/components/provider/settings/LocationsTab";
import { ServicesTab } from "@/components/provider/settings/ServicesTab";
import { AddOnsTab } from "@/components/provider/settings/AddOnsTab";
import { DiscountsTab } from "@/components/provider/settings/DiscountsTab";
import { SubscriptionsTab } from "@/components/provider/settings/SubscriptionsTab";
import { TeamTab } from "@/components/provider/settings/TeamTab";
import { NotificationsTab } from "@/components/provider/settings/NotificationsTab";
import { DisplayTab } from "@/components/provider/settings/DisplayTab";

export default function ProviderSettings() {
  const { user } = useAuth();
  const providerId = user?.roles.find((r: any) => r.scope === "provider")?.scopeId || "";
  const [activeTab, setActiveTab] = useState("locations");

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-3xl font-display font-bold text-slate-900">Settings</h1>
        <p className="text-slate-500 mt-1">Manage your locations, services, team, and preferences.</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex flex-wrap h-auto gap-1 bg-slate-100 p-1 rounded-xl">
          <TabsTrigger value="locations">Locations</TabsTrigger>
          <TabsTrigger value="services">Services</TabsTrigger>
          <TabsTrigger value="addons">Add-Ons</TabsTrigger>
          <TabsTrigger value="discounts">Discounts</TabsTrigger>
          <TabsTrigger value="subscriptions">Subscriptions</TabsTrigger>
          <TabsTrigger value="team">Team</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
          <TabsTrigger value="display">Display</TabsTrigger>
        </TabsList>

        <TabsContent value="locations" className="mt-6">
          <LocationsTab providerId={providerId} />
        </TabsContent>
        <TabsContent value="services" className="mt-6">
          <ServicesTab providerId={providerId} />
        </TabsContent>
        <TabsContent value="addons" className="mt-6">
          <AddOnsTab providerId={providerId} />
        </TabsContent>
        <TabsContent value="discounts" className="mt-6">
          <DiscountsTab providerId={providerId} />
        </TabsContent>
        <TabsContent value="subscriptions" className="mt-6">
          <SubscriptionsTab providerId={providerId} />
        </TabsContent>
        <TabsContent value="team" className="mt-6">
          <TeamTab providerId={providerId} />
        </TabsContent>
        <TabsContent value="notifications" className="mt-6">
          <NotificationsTab />
        </TabsContent>
        <TabsContent value="display" className="mt-6">
          <DisplayTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
