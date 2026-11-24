import { AppLanguage } from '../types';

// Format month label according to active language ('en' -> October 2026, 'vi' -> Tháng 10/2026)
export function formatMonthLabel(monthKeyOrStr: string, language: AppLanguage = 'en'): string {
  if (!monthKeyOrStr) return '';
  let year = '';
  let month = '';

  const matchKey = monthKeyOrStr.match(/^(\d{4})-(\d{1,2})$/);
  if (matchKey) {
    year = matchKey[1];
    month = matchKey[2].padStart(2, '0');
  } else {
    const matchSlash = monthKeyOrStr.match(/(\d{1,2})\/(\d{4})/);
    if (matchSlash) {
      month = matchSlash[1].padStart(2, '0');
      year = matchSlash[2];
    }
  }

  if (!year || !month) return monthKeyOrStr;

  if (language === 'vi') {
    return `Tháng ${month}/${year}`;
  }

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  const mIndex = parseInt(month, 10) - 1;
  const monthName = monthNames[mIndex] || month;
  return `${monthName} ${year}`;
}

// Retrieve a list of N recent months with localized labels
export function getRecentMonthsList(
  count: number = 6,
  language: AppLanguage = 'en'
): { key: string; label: string; isCurrent: boolean }[] {
  const result: { key: string; label: string; isCurrent: boolean }[] = [];
  const now = new Date();

  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const key = `${year}-${month}`;
    const label = formatMonthLabel(key, language);
    result.push({
      key,
      label,
      isCurrent: i === 0,
    });
  }

  return result;
}
