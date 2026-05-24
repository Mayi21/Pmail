/**
 * Login Page Component
 */

import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { loginSchema } from '../api/auth';
import { useAuthStore } from '../stores/authStore';
import toast from 'react-hot-toast';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import LanguageSwitcher from '../components/LanguageSwitcher';

type LoginFormData = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { login, isLoading } = useAuthStore();
  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      username: '',
      password: '',
    },
  });

  const onSubmit = async (data: LoginFormData) => {
    try {
      await login(data.username, data.password);
      toast.success(t('auth.loginSuccess'));
      navigate('/');
    } catch (error: any) {
      // Handle specific login errors
      if (error.response) {
        const status = error.response.status;
        const errorData = error.response.data;

        if (status === 401) {
          // Invalid username or password
          toast.error(t('auth.loginFailed'));
        } else if (status === 429) {
          // Account lockout
          const minutesRemaining = errorData.minutes_remaining || 0;
          const isIpLockout = errorData.error?.includes('IP');
          const errorKey = isIpLockout ? 'error.ipLocked' : 'error.accountLocked';

          toast.error(
            t(errorKey, { minutes: minutesRemaining }),
            { duration: 6000 }
          );
        }
      }
      // Network errors are handled by interceptor
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-neo-warm-white px-4">
      <div className="w-full max-w-md">
        <div className="bg-white border-3 border-neo-black rounded-neo-xl p-8">
          {/* Language Switcher */}
          <div className="flex justify-end mb-4">
            <LanguageSwitcher />
          </div>

          {/* Logo and Title */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-neo-yellow border-3 border-neo-black mb-4">
              <svg
                className="w-8 h-8 text-neo-black"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                strokeWidth={2.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                />
              </svg>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-neo-black heading-neo-display">{t('app.title')}</h1>
            <p className="text-neo-gray mt-2">{t('app.subtitle')}</p>
          </div>

          {/* Login Form */}
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {/* Username */}
            <div>
              <label className="block text-sm font-bold text-neo-black mb-2">
                {t('auth.username')}
              </label>
              <input
                type="text"
                {...register('username')}
                className="input-neo w-full"
                placeholder={t('auth.enterUsername')}
              />
              {errors.username && (
                <p className="text-neo-red text-sm mt-1 font-medium">{errors.username.message}</p>
              )}
            </div>

            {/* Password */}
            <div>
              <label className="block text-sm font-bold text-neo-black mb-2">
                {t('auth.password')}
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  {...register('password')}
                  className="input-neo w-full pr-12"
                  placeholder={t('auth.enterPassword')}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center border-3 border-neo-black rounded-neo bg-white hover:bg-gray-50 active:translate-x-0.5 active:translate-y-0.5 transition-all"
                  aria-label={showPassword ? t('auth.hidePassword') : t('auth.showPassword')}
                >
                  <svg
                    className="w-5 h-5 text-neo-black"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    strokeWidth={2.5}
                  >
                    {showPassword ? (
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                      />
                    ) : (
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88"
                      />
                    )}
                  </svg>
                </button>
              </div>
              {errors.password && (
                <p className="text-neo-red text-sm mt-1 font-medium">{errors.password.message}</p>
              )}
            </div>

            {/* Remember Me */}
            <div className="flex items-center justify-between">
              <label className="flex items-center cursor-pointer">
                <input type="checkbox" className="w-5 h-5 border-3 border-neo-black rounded-neo-xs accent-neo-cyan cursor-pointer hover:border-4 transition-all" />
                <span className="ml-2 text-sm text-neo-black font-medium">{t('auth.rememberMe')}</span>
              </label>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="btn-neo-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? t('auth.loggingIn') : t('auth.login')}
            </button>
          </form>

          {/* Divider */}
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t-3 border-neo-black"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-3 bg-white text-neo-gray font-bold">{t('common.or', 'Or')}</span>
            </div>
          </div>

          {/* Register Link */}
          <div className="text-center">
            <span className="text-neo-black">{t('auth.dontHaveAccount')} </span>
            <Link
              to="/register"
              className="text-neo-black font-bold hover:underline decoration-3 decoration-neo-black"
            >
              {t('auth.signUp')}
            </Link>
          </div>

          {/* Guest Mode Link */}
          <div className="mt-4 text-center">
            <Link
              to="/guest"
              className="inline-block text-sm text-gray-600 hover:text-blue-600 transition"
            >
              <span role="img" aria-label="Guest mode">🎭</span> {t('guest.tryGuest')}
            </Link>
          </div>
        </div>

        {/* Features */}
        <div className="mt-8 flex justify-center space-x-6 text-sm text-neo-black font-medium">
          <div className="flex items-center">
            <svg className="w-5 h-5 mr-1.5 text-neo-green" fill="currentColor" viewBox="0 0 20 20" strokeWidth={2}>
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
            {t('app.features.free')}
          </div>
          <div className="flex items-center">
            <svg className="w-5 h-5 mr-1.5 text-neo-green" fill="currentColor" viewBox="0 0 20 20" strokeWidth={2}>
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
            {t('app.features.quick')}
          </div>
          <div className="flex items-center">
            <svg className="w-5 h-5 mr-1.5 text-neo-green" fill="currentColor" viewBox="0 0 20 20" strokeWidth={2}>
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
            {t('app.features.privacy')}
          </div>
        </div>
      </div>
    </div>
  );
}