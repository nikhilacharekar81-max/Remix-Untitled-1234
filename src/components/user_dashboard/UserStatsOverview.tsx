import React from 'react';
import { Briefcase, ShoppingBag, Star, TrendingUp } from 'lucide-react';
import { MetricCard } from '../ui/MetricCard';

interface UserStatsOverviewProps {
  totalOffers: number;
  activeOrdersCount: number;
  completedOrdersCount: number;
  rating: number;
  earnings: number;
}

export const UserStatsOverview: React.FC<UserStatsOverviewProps> = ({
  totalOffers,
  activeOrdersCount,
  completedOrdersCount,
  rating
}) => {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
      <MetricCard 
        title="Total Offers"
        value={totalOffers}
        icon={ShoppingBag}
        iconColor="text-emerald-600"
      />
      <MetricCard 
        title="Active Orders"
        value={activeOrdersCount}
        icon={Briefcase}
        iconColor="text-blue-600"
      />
      <MetricCard 
        title="Completed"
        value={completedOrdersCount}
        icon={TrendingUp}
        iconColor="text-emerald-600"
      />
      <MetricCard 
        title="Rating"
        value={rating.toFixed(1)}
        icon={Star}
        iconColor="text-amber-500 fill-amber-500"
      />
    </div>
  );
};
