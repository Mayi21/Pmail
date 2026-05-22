/**
 * Tier Form Component
 * Form for creating and editing tier configurations
 */

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';

interface TierConfig {
  id?: number;
  tier_name: string;
  display_name: string;
  sort_order: number;
  permanent_mailbox_quota: number;
  temporary_mailbox_quota: number;
  description: string;
  is_active: boolean;
}

interface TierFormProps {
  tier?: TierConfig;
  onSubmit: (data: Partial<TierConfig>) => void;
  onCancel: () => void;
  isSubmitting?: boolean;
  isEdit?: boolean;
}

export default function TierForm({
  tier,
  onSubmit,
  onCancel,
  isSubmitting = false,
  isEdit = false,
}: TierFormProps) {
  const { t } = useTranslation();
  const [formData, setFormData] = useState<Partial<TierConfig>>({
    tier_name: '',
    display_name: '',
    sort_order: 100,
    permanent_mailbox_quota: 1,
    temporary_mailbox_quota: 2,
    description: '',
    is_active: true,
  });

  useEffect(() => {
    if (tier) {
      setFormData(tier);
    }
  }, [tier]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Validation
    if (!formData.tier_name || !formData.display_name) {
      toast.error(t('admin.tiers.form.validationNameRequired'));
      return;
    }

    if (formData.permanent_mailbox_quota! < 0) {
      toast.error(t('admin.tiers.form.validationPermanentNegative'));
      return;
    }

    if (formData.temporary_mailbox_quota! < -1) {
      toast.error(t('admin.tiers.form.validationTemporaryInvalid'));
      return;
    }

    onSubmit(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Tier Name */}
        <div>
          <label className="block text-sm font-bold mb-2">
            {t('admin.tiers.form.tierName')} {t('admin.tiers.form.required')}
            <span className="text-xs text-gray-600 ml-2">{t('admin.tiers.form.tierNameHint')}</span>
          </label>
          <input
            type="text"
            value={formData.tier_name}
            onChange={(e) =>
              setFormData({ ...formData, tier_name: e.target.value.toLowerCase().replace(/\s/g, '_') })
            }
            placeholder={t('admin.tiers.form.tierNamePlaceholder')}
            disabled={isEdit && tier?.tier_name === 'basic'}
            className="w-full px-4 py-2 border-4 border-neo-black rounded-lg font-bold
                     focus:outline-none focus:ring-4 focus:ring-blue-300
                     disabled:bg-gray-200 disabled:cursor-not-allowed"
            required
          />
        </div>

        {/* Display Name */}
        <div>
          <label className="block text-sm font-bold mb-2">{t('admin.tiers.form.displayName')} {t('admin.tiers.form.required')}</label>
          <input
            type="text"
            value={formData.display_name}
            onChange={(e) => setFormData({ ...formData, display_name: e.target.value })}
            placeholder={t('admin.tiers.form.displayNamePlaceholder')}
            className="w-full px-4 py-2 border-4 border-neo-black rounded-lg font-bold
                     focus:outline-none focus:ring-4 focus:ring-blue-300"
            required
          />
        </div>

        {/* Sort Order */}
        <div>
          <label className="block text-sm font-bold mb-2">
            {t('admin.tiers.form.sortOrder')}
            <span className="text-xs text-gray-600 ml-2">{t('admin.tiers.form.sortOrderHint')}</span>
          </label>
          <input
            type="number"
            min="0"
            max="1000"
            value={formData.sort_order}
            onChange={(e) => setFormData({ ...formData, sort_order: Number(e.target.value) })}
            className="w-full px-4 py-2 border-4 border-neo-black rounded-lg font-bold
                     focus:outline-none focus:ring-4 focus:ring-blue-300"
            required
          />
        </div>

        {/* Active Status */}
        <div className="flex items-center">
          <label className="flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={formData.is_active}
              onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
              disabled={isEdit && tier?.tier_name === 'basic'}
              className="w-6 h-6 border-4 border-neo-black rounded cursor-pointer
                       disabled:cursor-not-allowed"
            />
            <span className="ml-3 font-bold">{t('admin.tiers.form.active')}</span>
          </label>
        </div>

        {/* Permanent Mailbox Quota */}
        <div>
          <label className="block text-sm font-bold mb-2">
            {t('admin.tiers.form.permanentQuota')} {t('admin.tiers.form.required')}
          </label>
          <input
            type="number"
            min="0"
            value={formData.permanent_mailbox_quota}
            onChange={(e) =>
              setFormData({ ...formData, permanent_mailbox_quota: Number(e.target.value) })
            }
            disabled={isEdit && tier?.tier_name === 'basic'}
            className="w-full px-4 py-2 border-4 border-neo-black rounded-lg font-bold
                     focus:outline-none focus:ring-4 focus:ring-blue-300
                     disabled:bg-gray-200 disabled:cursor-not-allowed"
            required
          />
        </div>

        {/* Temporary Mailbox Quota */}
        <div>
          <label className="block text-sm font-bold mb-2">
            {t('admin.tiers.form.temporaryQuota')} {t('admin.tiers.form.required')}
            <span className="text-xs text-gray-600 ml-2">{t('admin.tiers.form.temporaryQuotaHint')}</span>
          </label>
          <input
            type="number"
            min="-1"
            value={formData.temporary_mailbox_quota}
            onChange={(e) =>
              setFormData({ ...formData, temporary_mailbox_quota: Number(e.target.value) })
            }
            disabled={isEdit && tier?.tier_name === 'basic'}
            className="w-full px-4 py-2 border-4 border-neo-black rounded-lg font-bold
                     focus:outline-none focus:ring-4 focus:ring-blue-300
                     disabled:bg-gray-200 disabled:cursor-not-allowed"
            required
          />
        </div>
      </div>

      {/* Description */}
      <div>
        <label className="block text-sm font-bold mb-2">{t('admin.tiers.form.description')}</label>
        <textarea
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          placeholder={t('admin.tiers.form.descriptionPlaceholder')}
          rows={3}
          className="w-full px-4 py-2 border-4 border-neo-black rounded-lg font-bold
                   focus:outline-none focus:ring-4 focus:ring-blue-300"
        />
      </div>

      {/* Warning for basic tier */}
      {isEdit && tier?.tier_name === 'basic' && (
        <div className="bg-yellow-200 border-4 border-yellow-600 rounded-lg p-4">
          <p className="font-bold text-yellow-900">
            ⚠️ {t('admin.tiers.form.basicTierWarning')}
          </p>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-4 pt-4">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 px-6 py-3 bg-gray-300 border-4 border-neo-black rounded-lg font-bold
                   hover:shadow-neo transition-all"
        >
          {t('admin.tiers.form.cancel')}
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          className="flex-1 px-6 py-3 bg-green-300 border-4 border-neo-black rounded-lg font-bold
                   hover:shadow-neo transition-all
                   disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSubmitting ? t('admin.tiers.form.saving') : isEdit ? t('admin.tiers.form.updateTier') : t('admin.tiers.form.createTier')}
        </button>
      </div>
    </form>
  );
}
