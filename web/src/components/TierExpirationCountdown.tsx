import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface TierExpirationCountdownProps {
  expiresAt: string | null;
  showIcon?: boolean;
  format?: 'full' | 'short';
}

interface TimeRemaining {
  isPermanent: boolean;
  isExpired: boolean;
  displayText: string;
  colorClass: string;
}

export const TierExpirationCountdown: React.FC<TierExpirationCountdownProps> = ({
  expiresAt,
  showIcon = true,
  format = 'full',
}) => {
  const { t } = useTranslation();

  const calculateTimeRemaining = (expiresAt: string | null): TimeRemaining => {
    if (!expiresAt) {
      return {
        isPermanent: true,
        isExpired: false,
        displayText: t('tier.permanent'),
        colorClass: 'text-green-600',
      };
    }

    const now = new Date();
    const expireDate = new Date(expiresAt);
    const diffMs = expireDate.getTime() - now.getTime();

    if (diffMs <= 0) {
      return {
        isPermanent: false,
        isExpired: true,
        displayText: t('tier.expired'),
        colorClass: 'text-red-600',
      };
    }

    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

    let displayText = '';
    let colorClass = 'text-gray-600';

    if (days > 7) {
      displayText = format === 'full'
        ? `${days} ${t('tier.days_remaining')}`
        : `${days}d`;
      colorClass = 'text-green-600';
    } else if (days > 0) {
      displayText = format === 'full'
        ? `${days} ${t('tier.days')} ${hours} ${t('tier.hours')}`
        : `${days}d ${hours}h`;
      colorClass = 'text-yellow-600';
    } else if (hours > 0) {
      displayText = format === 'full'
        ? `${hours} ${t('tier.hours')} ${minutes} ${t('tier.minutes')}`
        : `${hours}h ${minutes}m`;
      colorClass = 'text-orange-600';
    } else {
      displayText = format === 'full'
        ? `${minutes} ${t('tier.minutes')}`
        : `${minutes}m`;
      colorClass = 'text-red-600';
    }

    return {
      isPermanent: false,
      isExpired: false,
      displayText,
      colorClass,
    };
  };

  const [timeRemaining, setTimeRemaining] = useState<TimeRemaining>(() =>
    calculateTimeRemaining(expiresAt)
  );

  useEffect(() => {
    if (!expiresAt) return;

    const interval = setInterval(() => {
      setTimeRemaining(calculateTimeRemaining(expiresAt));
    }, 60000); // 每分钟更新一次

    return () => clearInterval(interval);
  }, [expiresAt]);

  const getIconAndLabel = () => {
    if (timeRemaining.isPermanent) return { icon: '♾️', label: 'Permanent' };
    if (timeRemaining.isExpired) return { icon: '⏰', label: 'Expired' };
    return { icon: '⏳', label: 'Time remaining' };
  };

  const { icon, label } = getIconAndLabel();

  return (
    <div className="inline-flex items-center gap-2">
      {showIcon && (
        <span className="text-lg" role="img" aria-label={label}>
          {icon}
        </span>
      )}
      <span className={`font-medium tabular-nums-neo ${timeRemaining.colorClass}`}>
        {timeRemaining.displayText}
      </span>
    </div>
  );
};
