import { moment } from 'obsidian';
import en from './locales/en';
import zhCN from './locales/zh-CN';

export type SupportedLocale = 'en' | 'zh-CN';
export type LocaleSetting = 'auto' | SupportedLocale;

const translations: Record<SupportedLocale, Record<string, string>> = {
    'en': en,
    'zh-CN': zhCN,
};

let localeSetting: LocaleSetting = 'auto';

export function setLocale(setting: LocaleSetting): void {
    localeSetting = setting;
}

export function getLocaleSetting(): LocaleSetting {
    return localeSetting;
}

function detectLocale(): SupportedLocale {
    const raw = (moment.locale() || '').toLowerCase();
    if (raw.startsWith('zh')) return 'zh-CN';
    return 'en';
}

export function getCurrentLocale(): SupportedLocale {
    return localeSetting === 'auto' ? detectLocale() : localeSetting;
}

export function t(key: string, params?: Record<string, string | number>): string {
    const lang = getCurrentLocale();
    let str = translations[lang][key] ?? translations.en[key] ?? key;
    if (params) {
        Object.entries(params).forEach(([k, v]) => {
            str = str.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
        });
    }
    return str;
}
