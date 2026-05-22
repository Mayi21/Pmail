/**
 * Cloudflare Turnstile Widget Component
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { TurnstileOptions } from '../types/turnstile';

interface TurnstileWidgetProps {
  siteKey: string;
  onSuccess: (token: string) => void;
  onError?: () => void;
  onExpire?: () => void;
  theme?: 'light' | 'dark' | 'auto';
  size?: 'normal' | 'compact';
}

export default function TurnstileWidget({
  siteKey,
  onSuccess,
  onError,
  onExpire,
  theme = 'light',
  size = 'normal',
}: TurnstileWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  // Use refs to store callbacks and avoid unnecessary re-renders
  const callbackRef = useRef(onSuccess);
  const errorCallbackRef = useRef(onError);
  const expireCallbackRef = useRef(onExpire);

  // Keep refs up to date without triggering effect re-runs
  useEffect(() => {
    callbackRef.current = onSuccess;
  }, [onSuccess]);

  useEffect(() => {
    errorCallbackRef.current = onError;
  }, [onError]);

  useEffect(() => {
    expireCallbackRef.current = onExpire;
  }, [onExpire]);

  const handleSuccess = useCallback((token: string) => {
    callbackRef.current?.(token);
  }, []);

  const handleError = useCallback(() => {
    errorCallbackRef.current?.();
  }, []);

  const handleExpire = useCallback(() => {
    expireCallbackRef.current?.();
  }, []);

  useEffect(() => {
    // Wait for Turnstile SDK to load
    const checkTurnstile = setInterval(() => {
      if (window.turnstile) {
        setIsLoaded(true);
        clearInterval(checkTurnstile);
      }
    }, 100);

    // Cleanup interval if component unmounts before SDK loads
    return () => clearInterval(checkTurnstile);
  }, []);

  useEffect(() => {
    if (!isLoaded || !containerRef.current || !window.turnstile) {
      return;
    }

    // Render Turnstile widget with stable callback wrappers
    const options: TurnstileOptions = {
      sitekey: siteKey,
      callback: handleSuccess,
      'error-callback': handleError,
      'expired-callback': handleExpire,
      theme,
      size,
    };

    try {
      widgetIdRef.current = window.turnstile.render(containerRef.current, options);
    } catch (error) {
      console.error('Failed to render Turnstile widget:', error);
    }

    // Cleanup on unmount
    return () => {
      if (widgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch (error) {
          console.error('Failed to remove Turnstile widget:', error);
        }
      }
    };
    // Only depend on stable values, not on callbacks
  }, [handleError, handleExpire, handleSuccess, isLoaded, siteKey, theme, size]);

  return (
    <div className="turnstile-container">
      <div ref={containerRef} />
      {!isLoaded && (
        <div className="flex items-center justify-center p-4 text-neo-gray text-sm">
          Loading verification...
        </div>
      )}
    </div>
  );
}
