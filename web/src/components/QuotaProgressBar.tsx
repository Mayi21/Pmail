import React from 'react';
import { useTranslation } from 'react-i18next';

interface QuotaProgressBarProps {
  type: 'permanent' | 'temporary';
  current: number;
  max: number | null;
  showPercentage?: boolean;
  showLabel?: boolean;
}

export const QuotaProgressBar: React.FC<QuotaProgressBarProps> = ({
  type,
  current,
  max,
  showPercentage = true,
  showLabel = true,
}) => {
  const { t } = useTranslation();

  const status = React.useMemo(() => {
    if (max === null || max === -1) {
      return {
        percentage: 0,
        isUnlimited: true,
        isWarning: false,
        isFull: false,
        color: 'bg-neo-cyan',
      };
    }

    const percentage = Math.min((current / max) * 100, 100);
    const isWarning = percentage >= 80 && percentage < 100;
    const isFull = percentage >= 100;

    let color = 'bg-neo-blue';
    if (isFull) color = 'bg-neo-red';
    else if (isWarning) color = 'bg-neo-yellow';

    return { percentage, isUnlimited: false, isWarning, isFull, color };
  }, [current, max]);

  const label = type === 'permanent'
    ? t('quota.permanent_mailboxes')
    : t('quota.temporary_mailboxes');

  const percentageValue = status.isUnlimited ? 100 : status.percentage;

  return (
    <div className="space-y-2">
      {showLabel && (
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium text-neo-black">{label}</span>
          <span className="text-neo-black tabular-nums-neo">
            {current} / {status.isUnlimited ? '∞' : max}
            {showPercentage && !status.isUnlimited && (
              <span className="ml-2 text-neo-gray">
                ({status.percentage.toFixed(0)}%)
              </span>
            )}
          </span>
        </div>
      )}

      <div className="relative h-2 w-full overflow-hidden rounded-full bg-gray-200">
        <div
          className={`h-full transition-all duration-300 ${status.color}`}
          style={{ width: status.isUnlimited ? '100%' : `${status.percentage}%` }}
          role="progressbar"
          aria-valuenow={Math.round(percentageValue)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${label}: ${current} / ${status.isUnlimited ? '∞' : max}`}
        />
      </div>

      {status.isWarning && (
        <p className="text-xs text-neo-yellow font-medium" style={{ color: '#b8860b' }}>
          {t('quota.warning_near_limit')}
        </p>
      )}

      {status.isFull && (
        <p className="text-xs text-neo-red">
          {t('quota.error_quota_full')}
        </p>
      )}
    </div>
  );
};
