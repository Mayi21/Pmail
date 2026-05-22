/**
 * Domain Form Component
 * Form for creating and editing domain configurations
 */

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';

interface DomainConfig {
  id?: number;
  domain: string;
  display_name: string;
  sort_order: number;
  description: string;
  is_active: boolean;
  is_default: boolean;
}

interface DomainFormProps {
  domain?: DomainConfig;
  onSubmit: (data: Partial<DomainConfig>) => void;
  onCancel: () => void;
  isSubmitting?: boolean;
  isEdit?: boolean;
}

export default function DomainForm({
  domain,
  onSubmit,
  onCancel,
  isSubmitting = false,
  isEdit = false,
}: DomainFormProps) {
  const { t } = useTranslation();
  const [formData, setFormData] = useState<Partial<DomainConfig>>({
    domain: '',
    display_name: '',
    sort_order: 0,
    description: '',
    is_active: true,
    is_default: false,
  });

  useEffect(() => {
    if (domain) {
      setFormData(domain);
    }
  }, [domain]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Validation
    if (!formData.domain) {
      toast.error(t('admin.domains.form.validationDomainRequired'));
      return;
    }

    // Basic domain format validation
    const domainRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
    if (!domainRegex.test(formData.domain)) {
      toast.error(t('admin.domains.form.validationDomainFormat'));
      return;
    }

    // Clean up empty strings - convert to undefined so backend treats them as "not provided"
    const submitData: Partial<DomainConfig> = {
      ...formData,
      display_name: formData.display_name?.trim() || undefined,
      description: formData.description?.trim() || undefined,
    };

    onSubmit(submitData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Domain */}
        <div>
          <label className="block text-sm font-bold mb-2">
            {t('admin.domains.form.domain')} *
          </label>
          <input
            type="text"
            value={formData.domain}
            onChange={(e) =>
              setFormData({ ...formData, domain: e.target.value.toLowerCase() })
            }
            placeholder="example.com"
            disabled={isEdit}
            className="w-full px-4 py-2 border-4 border-neo-black rounded-lg font-bold
                     focus:outline-none focus:ring-4 focus:ring-blue-300
                     disabled:bg-gray-200 disabled:cursor-not-allowed"
            required
          />
          {isEdit && (
            <p className="text-xs text-gray-500 mt-1">
              {t('admin.domains.form.domainCannotChange')}
            </p>
          )}
        </div>

        {/* Display Name */}
        <div>
          <label className="block text-sm font-bold mb-2">
            {t('admin.domains.form.displayName')}
          </label>
          <input
            type="text"
            value={formData.display_name}
            onChange={(e) => setFormData({ ...formData, display_name: e.target.value })}
            placeholder={t('admin.domains.form.displayNamePlaceholder')}
            className="w-full px-4 py-2 border-4 border-neo-black rounded-lg font-bold
                     focus:outline-none focus:ring-4 focus:ring-blue-300"
          />
        </div>

        {/* Sort Order */}
        <div>
          <label className="block text-sm font-bold mb-2">
            {t('admin.domains.form.sortOrder')}
            <span className="text-xs text-gray-600 ml-2">
              {t('admin.domains.form.sortOrderHint')}
            </span>
          </label>
          <input
            type="number"
            min="0"
            max="1000"
            value={formData.sort_order}
            onChange={(e) => setFormData({ ...formData, sort_order: Number(e.target.value) })}
            className="w-full px-4 py-2 border-4 border-neo-black rounded-lg font-bold
                     focus:outline-none focus:ring-4 focus:ring-blue-300"
          />
        </div>

        {/* Checkboxes */}
        <div className="space-y-4">
          {/* Active Status */}
          <label className="flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={formData.is_active}
              onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
              className="w-6 h-6 border-4 border-neo-black rounded cursor-pointer"
            />
            <span className="ml-3 font-bold">{t('admin.domains.form.active')}</span>
          </label>

          {/* Default Domain */}
          <label className="flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={formData.is_default}
              onChange={(e) => setFormData({ ...formData, is_default: e.target.checked })}
              className="w-6 h-6 border-4 border-neo-black rounded cursor-pointer"
            />
            <span className="ml-3 font-bold">{t('admin.domains.form.setAsDefault')}</span>
            <span className="ml-2 text-xs text-gray-500">
              {t('admin.domains.form.defaultHint')}
            </span>
          </label>
        </div>
      </div>

      {/* Description */}
      <div>
        <label className="block text-sm font-bold mb-2">
          {t('admin.domains.form.description')}
        </label>
        <textarea
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          placeholder={t('admin.domains.form.descriptionPlaceholder')}
          rows={3}
          className="w-full px-4 py-2 border-4 border-neo-black rounded-lg font-bold
                   focus:outline-none focus:ring-4 focus:ring-blue-300"
        />
      </div>

      {/* Cloudflare Setup Hint */}
      <div className="bg-blue-100 border-4 border-blue-400 rounded-lg p-4">
        <p className="font-bold text-blue-900 mb-2">
          {t('admin.domains.form.setupHint')}
        </p>
        <ol className="text-sm text-blue-800 list-decimal list-inside space-y-1">
          <li>{t('admin.domains.form.setupStep1')}</li>
          <li>{t('admin.domains.form.setupStep2')}</li>
          <li>{t('admin.domains.form.setupStep3')}</li>
        </ol>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-4 pt-4">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 px-6 py-3 bg-gray-300 border-4 border-neo-black rounded-lg font-bold
                   hover:shadow-neo transition-all"
        >
          {t('common.cancel')}
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          className="flex-1 px-6 py-3 bg-green-300 border-4 border-neo-black rounded-lg font-bold
                   hover:shadow-neo transition-all
                   disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSubmitting
            ? t('common.loading')
            : isEdit
            ? t('admin.domains.form.updateDomain')
            : t('admin.domains.form.createDomain')}
        </button>
      </div>
    </form>
  );
}
