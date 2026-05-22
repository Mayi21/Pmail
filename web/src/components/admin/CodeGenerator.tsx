/**
 * Code Generator Component
 * Form for generating redemption codes
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import NeoSelect from '@/components/NeoSelect';

interface TierConfig {
  id: number;
  tier_name: string;
  display_name: string;
}

interface CodeGeneratorProps {
  tiers: TierConfig[];
  onGenerate: (data: GenerateCodeData) => void;
  onCancel: () => void;
  isGenerating?: boolean;
}

export interface GenerateCodeData {
  tier_id: number;
  duration_type: 'permanent' | 'days' | 'months';
  duration_value: number;
  max_uses: number;
  expires_at: string | null;
  note: string;
  code_prefix: string;
  batch_size: number;
}

export default function CodeGenerator({
  tiers,
  onGenerate,
  onCancel,
  isGenerating = false,
}: CodeGeneratorProps) {
  const { t } = useTranslation();
  const [formData, setFormData] = useState<GenerateCodeData>({
    tier_id: tiers[0]?.id || 2,
    duration_type: 'months',
    duration_value: 1,
    max_uses: 1,
    expires_at: null,
    note: '',
    code_prefix: '',
    batch_size: 1,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Validation
    if (formData.batch_size < 1 || formData.batch_size > 100) {
      toast.error(t('admin.redemption.generateModal.validationBatchSize'));
      return;
    }

    if (formData.duration_type !== 'permanent' && formData.duration_value < 1) {
      toast.error(t('admin.redemption.generateModal.validationDuration'));
      return;
    }

    if (formData.max_uses < -1 || formData.max_uses === 0) {
      toast.error(t('admin.redemption.generateModal.validationMaxUses'));
      return;
    }

    if (formData.code_prefix.length > 10) {
      toast.error(t('admin.redemption.generateModal.validationPrefix'));
      return;
    }

    onGenerate(formData);
  };

  const setExpirationDays = (days: number) => {
    const date = new Date();
    date.setDate(date.getDate() + days);
    setFormData({ ...formData, expires_at: date.toISOString().split('T')[0] });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* Tier Selection */}
        <div>
          <label className="block text-xs font-bold mb-1">{t('admin.redemption.generateModal.targetTier')} *</label>
          <NeoSelect
            value={formData.tier_id}
            onChange={(value) => setFormData({ ...formData, tier_id: Number(value) })}
            options={tiers.map((tier) => ({
              value: tier.id,
              label: t(`tierNames.${tier.tier_name}`, { defaultValue: tier.display_name }),
            }))}
          />
        </div>

        {/* Duration Type */}
        <div>
          <label className="block text-xs font-bold mb-1">{t('admin.redemption.generateModal.durationType')} *</label>
          <NeoSelect
            value={formData.duration_type}
            onChange={(value) =>
              setFormData({ ...formData, duration_type: value as 'permanent' | 'days' | 'months' })
            }
            options={[
              { value: 'permanent', label: t('admin.redemption.generateModal.permanent') },
              { value: 'days', label: t('admin.redemption.generateModal.days') },
              { value: 'months', label: t('admin.redemption.generateModal.months') },
            ]}
          />
        </div>

        {/* Duration Value */}
        {formData.duration_type !== 'permanent' && (
          <div>
            <label className="block text-xs font-bold mb-1">
              {t('admin.redemption.generateModal.durationValue', { type: formData.duration_type })} *
            </label>
            <input
              type="number"
              min="1"
              value={formData.duration_value}
              onChange={(e) =>
                setFormData({ ...formData, duration_value: Number(e.target.value) })
              }
              className="w-full px-3 py-1.5 border-2 border-neo-black rounded font-bold text-sm
                       focus:outline-none focus:ring-2 focus:ring-blue-300"
              required
            />
          </div>
        )}

        {/* Max Uses */}
        <div>
          <label className="block text-xs font-bold mb-1">
            {t('admin.redemption.generateModal.maxUses')}
            <span className="text-xs text-gray-600 ml-1">{t('admin.redemption.generateModal.maxUsesHint')}</span>
          </label>
          <input
            type="number"
            min="-1"
            value={formData.max_uses}
            onChange={(e) => setFormData({ ...formData, max_uses: Number(e.target.value) })}
            className="w-full px-3 py-1.5 border-2 border-neo-black rounded font-bold text-sm
                     focus:outline-none focus:ring-2 focus:ring-blue-300"
            required
          />
        </div>

        {/* Batch Size */}
        <div>
          <label className="block text-xs font-bold mb-1">
            {t('admin.redemption.generateModal.batchSize')}
            <span className="text-xs text-gray-600 ml-1">{t('admin.redemption.generateModal.batchSizeHint')}</span>
          </label>
          <input
            type="number"
            min="1"
            max="100"
            value={formData.batch_size}
            onChange={(e) =>
              setFormData({ ...formData, batch_size: Number(e.target.value) })
            }
            className="w-full px-3 py-1.5 border-2 border-neo-black rounded font-bold text-sm
                     focus:outline-none focus:ring-2 focus:ring-blue-300"
            required
          />
        </div>

        {/* Code Expiration */}
        <div className="md:col-span-2">
          <label className="block text-xs font-bold mb-1">
            {t('admin.redemption.generateModal.codeExpiration')}
          </label>
          <div className="flex gap-2">
            <input
              type="date"
              value={formData.expires_at || ''}
              onChange={(e) =>
                setFormData({ ...formData, expires_at: e.target.value || null })
              }
              className="flex-1 px-3 py-1.5 border-2 border-neo-black rounded font-bold text-sm
                       focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
            <button
              type="button"
              onClick={() => setExpirationDays(30)}
              className="text-xs px-2 py-1 bg-gray-200 border border-neo-black rounded font-bold whitespace-nowrap"
            >
              +30d
            </button>
            <button
              type="button"
              onClick={() => setExpirationDays(90)}
              className="text-xs px-2 py-1 bg-gray-200 border border-neo-black rounded font-bold whitespace-nowrap"
            >
              +90d
            </button>
            <button
              type="button"
              onClick={() => setFormData({ ...formData, expires_at: null })}
              className="text-xs px-2 py-1 bg-gray-200 border border-neo-black rounded font-bold whitespace-nowrap"
            >
              {t('admin.redemption.generateModal.never')}
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Code Prefix */}
        <div>
          <label className="block text-xs font-bold mb-1">
            {t('admin.redemption.generateModal.codePrefix')}
            <span className="text-xs text-gray-600 ml-1">{t('admin.redemption.generateModal.codePrefixHint')}</span>
          </label>
          <input
            type="text"
            maxLength={10}
            value={formData.code_prefix}
            onChange={(e) =>
              setFormData({
                ...formData,
                code_prefix: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''),
              })
            }
            placeholder={t('admin.redemption.generateModal.codePrefixPlaceholder')}
            className="w-full px-3 py-1.5 border-2 border-neo-black rounded font-bold text-sm
                     focus:outline-none focus:ring-2 focus:ring-blue-300"
          />
        </div>

        {/* Note */}
        <div>
          <label className="block text-xs font-bold mb-1">{t('admin.redemption.generateModal.note')}</label>
          <input
            type="text"
            value={formData.note}
            onChange={(e) => setFormData({ ...formData, note: e.target.value })}
            placeholder={t('admin.redemption.generateModal.notePlaceholder')}
            className="w-full px-3 py-1.5 border-2 border-neo-black rounded font-bold text-sm
                     focus:outline-none focus:ring-2 focus:ring-blue-300"
          />
        </div>
      </div>

      {/* Summary */}
      <div className="bg-blue-100 border-2 border-blue-600 rounded p-2.5">
        <p className="font-bold text-blue-900 mb-1 text-xs">📋 {t('admin.redemption.generateModal.summary')}</p>
        <div className="text-xs text-blue-800 grid grid-cols-2 gap-x-4 gap-y-0.5">
          <div>• {t('admin.redemption.generateModal.willGenerate')} <strong>{formData.batch_size}</strong> {t('admin.redemption.generateModal.codes')}</div>
          <div>• {t('admin.redemption.generateModal.tier')} <strong>{(() => { const tier = tiers.find((tr) => tr.id === formData.tier_id); return tier ? t(`tierNames.${tier.tier_name}`, { defaultValue: tier.display_name }) : ''; })()}</strong></div>
          <div>• {t('admin.redemption.generateModal.duration')} <strong>{formData.duration_type === 'permanent' ? t('admin.redemption.permanent') : `${formData.duration_value} ${formData.duration_type}`}</strong></div>
          <div>• {t('admin.redemption.generateModal.maxUsesPerCode')} <strong>{formData.max_uses === -1 ? t('admin.redemption.generateModal.unlimited') : formData.max_uses}</strong></div>
          {formData.expires_at && (
            <div className="col-span-2">• {t('admin.redemption.generateModal.codeExpiration')} <strong>{formData.expires_at}</strong></div>
          )}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-3 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 px-4 py-2 bg-gray-300 border-2 border-neo-black rounded font-bold text-sm
                   hover:shadow-neo transition-all"
        >
          {t('admin.redemption.generateModal.cancel')}
        </button>
        <button
          type="submit"
          disabled={isGenerating}
          className="flex-1 px-4 py-2 bg-green-300 border-2 border-neo-black rounded font-bold text-sm
                   hover:shadow-neo transition-all
                   disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isGenerating ? t('admin.redemption.generateModal.generating') : t('admin.redemption.generateModal.generate', { count: formData.batch_size })}
        </button>
      </div>
    </form>
  );
}
