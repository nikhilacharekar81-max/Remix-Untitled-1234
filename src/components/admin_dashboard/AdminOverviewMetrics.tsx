import React from 'react';
import { Users, Briefcase, ShieldCheck, Layers } from 'lucide-react';
import { MetricCard } from '../ui/MetricCard';

interface AdminOverviewMetricsProps {
  usersCount: number;
  gigsCount: number;
  ordersCount: number;
  totalVolume: number;
}

export const AdminOverviewMetrics: React.FC<AdminOverviewMetricsProps> = ({
  usersCount,
  gigsCount,
  ordersCount,
  totalVolume
}) => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      <MetricCard 
        title="Total Users"
        value={usersCount}
        icon={Users}
        iconColor="text-emerald-600"
        badgeText="Active platform members"
        badgeColor="text-emerald-600"
      />
      <MetricCard 
        title="Total Gigs"
        value={gigsCount}
        icon={Layers}
        iconColor="text-indigo-600"
        badgeText="Published & pending services"
        badgeColor="text-indigo-600"
      />
      <MetricCard 
        title="Total Orders"
        value={ordersCount}
        icon={Briefcase}
        iconColor="text-blue-600"
        badgeText="Milestones & workstreams"
        badgeColor="text-blue-600"
      />
      <MetricCard 
        title="Escrow Volume"
        value={`$${totalVolume}`}
        icon={ShieldCheck}
        iconColor="text-emerald-600"
        badgeText="Secured in 14d Vault"
        badgeColor="text-emerald-600"
      />
    </div>
  );
};
