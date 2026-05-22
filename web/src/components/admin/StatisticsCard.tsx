/**
 * Statistics Card Component
 * Displays a single statistic with neo-brutalism styling
 */

import { ReactNode } from 'react';

interface StatisticsCardProps {
  title: string;
  value: string | number;
  icon?: ReactNode;
  trend?: {
    value: string;
    isPositive: boolean;
  };
  color?: 'blue' | 'green' | 'purple' | 'orange' | 'pink';
}

const colorClasses = {
  blue: 'bg-blue-300 border-blue-600',
  green: 'bg-green-300 border-green-600',
  purple: 'bg-purple-300 border-purple-600',
  orange: 'bg-orange-300 border-orange-600',
  pink: 'bg-pink-300 border-pink-600',
};

export default function StatisticsCard({
  title,
  value,
  icon,
  trend,
  color = 'blue',
}: StatisticsCardProps) {
  return (
    <div
      className={`
        ${colorClasses[color]}
        border-4 border-neo-black rounded-lg p-6
        shadow-neo-lg
        hover:shadow-neo
        hover:translate-x-[4px] hover:translate-y-[4px]
        transition-all duration-200
      `}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm font-bold uppercase tracking-wider text-black/70 mb-2">
            {title}
          </p>
          <p className="text-4xl font-black text-black">{value}</p>
          {trend && (
            <div className="mt-3 flex items-center gap-2">
              <span
                className={`text-sm font-bold ${
                  trend.isPositive ? 'text-green-700' : 'text-red-700'
                }`}
              >
                {trend.isPositive ? '↑' : '↓'} {trend.value}
              </span>
            </div>
          )}
        </div>
        {icon && (
          <div className="ml-4 p-3 bg-white border-4 border-neo-black rounded-lg">
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}
