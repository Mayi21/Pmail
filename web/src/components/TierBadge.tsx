import React from 'react';
import { useTranslation } from 'react-i18next';

interface TierBadgeProps {
  tierName: string;
  displayName: string;
  size?: 'sm' | 'md' | 'lg';
  showIcon?: boolean;
}

const tierColors: Record<string, { bg: string; text: string; border: string; icon: string; ariaLabel: string }> = {
  basic: { bg: 'bg-neo-warm-white', text: 'text-neo-black', border: 'border-neo-gray', icon: '🆓', ariaLabel: 'Free tier' },
  premium: { bg: 'bg-neo-blue/20', text: 'text-neo-black', border: 'border-neo-blue', icon: '⭐', ariaLabel: 'Premium tier' },
  vip1: { bg: 'bg-neo-magenta/20', text: 'text-neo-black', border: 'border-neo-magenta', icon: '💎', ariaLabel: 'VIP tier' },
  vip2: { bg: 'bg-neo-yellow/30', text: 'text-neo-black', border: 'border-neo-yellow', icon: '👑', ariaLabel: 'VIP2 tier' },
  enterprise: { bg: 'bg-neo-green/20', text: 'text-neo-black', border: 'border-neo-green', icon: '🏢', ariaLabel: 'Enterprise tier' },
};

const sizeClasses = {
  sm: 'px-2 py-0.5 text-xs',
  md: 'px-3 py-1 text-sm',
  lg: 'px-4 py-1.5 text-base',
};

export const TierBadge: React.FC<TierBadgeProps> = ({
  tierName,
  displayName,
  size = 'md',
  showIcon = true,
}) => {
  const { t } = useTranslation();
  const colors = tierColors[tierName] || tierColors.basic;
  const translatedName = t(`tierNames.${tierName}`, { defaultValue: displayName });

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border font-medium ${colors.bg} ${colors.text} ${colors.border} ${sizeClasses[size]}`}
    >
      {showIcon && <span role="img" aria-label={colors.ariaLabel}>{colors.icon}</span>}
      <span>{translatedName}</span>
    </span>
  );
};
