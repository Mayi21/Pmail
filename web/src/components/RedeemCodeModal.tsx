import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useRedeemCode } from '@/hooks/useRedeemCode';
import toast from 'react-hot-toast';

interface RedeemCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const RedeemCodeModal: React.FC<RedeemCodeModalProps> = ({ isOpen, onClose }) => {
  const { t } = useTranslation();
  const [code, setCode] = useState('');
  const redeemMutation = useRedeemCode();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    redeemMutation.mutate(
      { code },
      {
        onSuccess: (data) => {
          toast.success(t('redeem.success', { tierName: t(`tierNames.${data.data.tier.name}`, { defaultValue: data.data.tier.display_name }) }));
          setCode('');
          onClose();
        },
        onError: (error: any) => {
          toast.error(error.response?.data?.error || error.message || t('redeem.error'));
        },
      }
    );
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <h2 className="mb-4 text-2xl font-bold text-gray-900">{t('redeem.title')}</h2>
        <p className="mb-6 text-sm text-gray-600">{t('redeem.description')}</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="code" className="block text-sm font-medium text-gray-700">
              {t('redeem.input_label')}
            </label>
            <input
              type="text"
              id="code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="ABCD-1234-EFGH-5678"
              required
              minLength={6}
              maxLength={50}
              disabled={redeemMutation.isPending}
            />
          </div>

          {redeemMutation.isError && (
            <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">
              {redeemMutation.error.message}
            </div>
          )}

          <div className="flex gap-3">
            <button
              type="submit"
              disabled={redeemMutation.isPending || !code}
              className="flex-1 rounded-lg bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {redeemMutation.isPending ? t('common.loading') : t('redeem.submit_button')}
            </button>
            <button
              type="button"
              onClick={() => {
                setCode('');
                onClose();
              }}
              className="flex-1 rounded-lg border border-gray-300 px-4 py-2 font-medium text-gray-700 hover:bg-gray-50"
            >
              {t('redeem.cancel_button')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
