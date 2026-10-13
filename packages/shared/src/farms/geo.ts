/**
 * Country → default currency. Country names come from `Intl.DisplayNames`
 * so they're localised for free; timezones from `Intl.supportedValuesOf`.
 */
const DATA =
  'AD:EUR AE:AED AF:AFN AG:XCD AI:XCD AL:ALL AM:AMD AO:AOA AR:ARS AS:USD AT:EUR AU:AUD AW:AWG AZ:AZN BA:BAM BB:BBD BD:BDT ' +
  'BE:EUR BF:XOF BG:EUR BH:BHD BI:BIF BJ:XOF BM:BMD BN:BND BO:BOB BR:BRL BS:BSD BT:BTN BW:BWP BY:BYN BZ:BZD CA:CAD CD:CDF ' +
  'CF:XAF CG:XAF CH:CHF CI:XOF CK:NZD CL:CLP CM:XAF CN:CNY CO:COP CR:CRC CU:CUP CV:CVE CY:EUR CZ:CZK DE:EUR DJ:DJF DK:DKK ' +
  'DM:XCD DO:DOP DZ:DZD EC:USD EE:EUR EG:EGP ER:ERN ES:EUR ET:ETB FI:EUR FJ:FJD FK:FKP FM:USD FO:DKK FR:EUR GA:XAF GB:GBP ' +
  'GD:XCD GE:GEL GF:EUR GH:GHS GI:GIP GL:DKK GM:GMD GN:GNF GP:EUR GQ:XAF GR:EUR GT:GTQ GU:USD GW:XOF GY:GYD HK:HKD HN:HNL ' +
  'HR:EUR HT:HTG HU:HUF ID:IDR IE:EUR IL:ILS IN:INR IQ:IQD IR:IRR IS:ISK IT:EUR JM:JMD JO:JOD JP:JPY KE:KES KG:KGS KH:KHR ' +
  'KI:AUD KM:KMF KN:XCD KP:KPW KR:KRW KW:KWD KY:KYD KZ:KZT LA:LAK LB:LBP LC:XCD LI:CHF LK:LKR LR:LRD LS:LSL LT:EUR LU:EUR ' +
  'LV:EUR LY:LYD MA:MAD MC:EUR MD:MDL ME:EUR MG:MGA MH:USD MK:MKD ML:XOF MM:MMK MN:MNT MO:MOP MQ:EUR MR:MRU MT:EUR MU:MUR ' +
  'MV:MVR MW:MWK MX:MXN MY:MYR MZ:MZN NA:NAD NC:XPF NE:XOF NG:NGN NI:NIO NL:EUR NO:NOK NP:NPR NR:AUD NZ:NZD OM:OMR PA:PAB ' +
  'PE:PEN PF:XPF PG:PGK PH:PHP PK:PKR PL:PLN PR:USD PS:ILS PT:EUR PW:USD PY:PYG QA:QAR RE:EUR RO:RON RS:RSD RU:RUB RW:RWF ' +
  'SA:SAR SB:SBD SC:SCR SD:SDG SE:SEK SG:SGD SI:EUR SK:EUR SL:SLE SM:EUR SN:XOF SO:SOS SR:SRD SS:SSP ST:STN SV:USD SY:SYP ' +
  'SZ:SZL TD:XAF TG:XOF TH:THB TJ:TJS TL:USD TM:TMT TN:TND TO:TOP TR:TRY TT:TTD TV:AUD TW:TWD TZ:TZS UA:UAH UG:UGX US:USD ' +
  'UY:UYU UZ:UZS VA:EUR VC:XCD VE:VES VN:VND VU:VUV WS:WST XK:EUR YE:YER YT:EUR ZA:ZAR ZM:ZMW ZW:ZWG';

export const COUNTRY_CURRENCY: Record<string, string> = Object.fromEntries(DATA.split(' ').map((pair) => pair.split(':')));
export const COUNTRY_CODES = Object.keys(COUNTRY_CURRENCY);

/** Countries that still farm in imperial units by default. */
const IMPERIAL = new Set(['US', 'LR', 'MM']);

export const UNIT_SYSTEMS = ['metric', 'imperial'] as const;
export type UnitSystem = (typeof UNIT_SYSTEMS)[number];
export const MILK_UNITS = ['L', 'kg', 'gal', 'lb'] as const;
export type MilkUnit = (typeof MILK_UNITS)[number];
export const WEIGHT_UNITS = ['kg', 'lb'] as const;
export type WeightUnit = (typeof WEIGHT_UNITS)[number];
export const AREA_UNITS = ['ha', 'ac'] as const;
export type AreaUnit = (typeof AREA_UNITS)[number];

export const UNIT_LABELS = {
  L: 'Litres',
  kg: 'Kilograms',
  gal: 'US gallons',
  lb: 'Pounds',
  ha: 'Hectares',
  ac: 'Acres',
} as const;

/** Sensible localisation defaults for a newly selected country. */
export function countryDefaults(country: string) {
  const imperial = IMPERIAL.has(country);
  return {
    currency: COUNTRY_CURRENCY[country] ?? 'USD',
    unitSystem: (imperial ? 'imperial' : 'metric') as UnitSystem,
    milkUnit: (imperial ? 'lb' : 'L') as MilkUnit,
    weightUnit: (imperial ? 'lb' : 'kg') as WeightUnit,
    areaUnit: (imperial ? 'ac' : 'ha') as AreaUnit,
  };
}

export const isValidTimeZone = (tz: string) => {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};

export const isValidCurrency = (code: string) => {
  if (!/^[A-Z]{3}$/.test(code)) return false;
  try {
    new Intl.NumberFormat('en', { style: 'currency', currency: code });
    return true;
  } catch {
    return false;
  }
};

export const isValidLocale = (tag: string) => {
  try {
    return Intl.getCanonicalLocales(tag).length === 1;
  } catch {
    return false;
  }
};

/** Display locales offered for number/date formatting. */
export const LOCALES: { tag: string; label: string }[] = [
  { tag: 'en-US', label: 'English (United States)' },
  { tag: 'en-GB', label: 'English (United Kingdom)' },
  { tag: 'en-AU', label: 'English (Australia)' },
  { tag: 'en-IN', label: 'English (India)' },
  { tag: 'en-NZ', label: 'English (New Zealand)' },
  { tag: 'en-IE', label: 'English (Ireland)' },
  { tag: 'en-ZA', label: 'English (South Africa)' },
  { tag: 'en-KE', label: 'English (Kenya)' },
  { tag: 'bn-BD', label: 'বাংলা (Bangladesh)' },
  { tag: 'hi-IN', label: 'हिन्दी (India)' },
  { tag: 'ur-PK', label: 'اردو (Pakistan)' },
  { tag: 'es-ES', label: 'Español (España)' },
  { tag: 'es-MX', label: 'Español (México)' },
  { tag: 'es-AR', label: 'Español (Argentina)' },
  { tag: 'pt-BR', label: 'Português (Brasil)' },
  { tag: 'fr-FR', label: 'Français (France)' },
  { tag: 'de-DE', label: 'Deutsch (Deutschland)' },
  { tag: 'nl-NL', label: 'Nederlands (Nederland)' },
  { tag: 'it-IT', label: 'Italiano (Italia)' },
  { tag: 'pl-PL', label: 'Polski (Polska)' },
  { tag: 'tr-TR', label: 'Türkçe (Türkiye)' },
  { tag: 'ru-RU', label: 'Русский (Россия)' },
  { tag: 'ar-SA', label: 'العربية (السعودية)' },
  { tag: 'id-ID', label: 'Bahasa Indonesia' },
  { tag: 'vi-VN', label: 'Tiếng Việt' },
  { tag: 'zh-CN', label: '中文 (中国)' },
  { tag: 'ja-JP', label: '日本語 (日本)' },
];
