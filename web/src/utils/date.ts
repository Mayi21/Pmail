/**
 * Date utility functions with localization support
 */

import { format as dateFnsFormat, formatDistanceToNow as dateFnsFormatDistanceToNow } from 'date-fns';
import { zhCN, enUS } from 'date-fns/locale';
import i18n from '../i18n';

// Map language codes to date-fns locales
const locales: Record<string, Locale> = {
  'en': enUS,
  'zh': zhCN,
};

/**
 * Get the current locale for date-fns based on i18n language
 */
function getLocale(): Locale {
  const lang = i18n.language;
  return locales[lang] || enUS;
}

/**
 * Parse a date string that may be in SQLite format or ISO format
 * SQLite format: YYYY-MM-DD HH:MM:SS
 * ISO format: YYYY-MM-DDTHH:MM:SSZ
 */
function parseDateString(dateStr: string): Date {
  // If already in ISO format (contains 'T'), use as is
  if (dateStr.includes('T')) {
    return new Date(dateStr);
  }
  // Convert SQLite format to ISO format for consistent parsing
  const isoFormat = dateStr.replace(' ', 'T') + 'Z';
  return new Date(isoFormat);
}

/**
 * Format a date with localization support
 */
export function format(date: Date | number | string, formatStr: string): string {
  const dateObj = typeof date === 'string' ? parseDateString(date) : date;
  return dateFnsFormat(dateObj, formatStr, { locale: getLocale() });
}

/**
 * Format distance to now with localization support
 */
export function formatDistanceToNow(date: Date | number | string, options?: { addSuffix?: boolean }): string {
  const dateObj = typeof date === 'string' ? parseDateString(date) : date;
  return dateFnsFormatDistanceToNow(dateObj, {
    locale: getLocale(),
    ...options
  });
}