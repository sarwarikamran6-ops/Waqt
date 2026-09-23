/** Quran translation languages → fawazahmed0 edition ids */
export type TranslationLang =
  | "none"
  | "en"
  | "ur"
  | "hi"
  | "fr"
  | "ru"
  | "uk"
  | "ko"
  | "ja"
  | "zh"
  | "sw"
  | "ha"
  | "yo"
  | "so"
  | "zu"
  | "af"
  | "am"
  | "tr"
  | "fa"
  | "id"
  | "bn"
  | "es"
  | "pt"
  | "de"
  | "it"
  | "nl"
  | "pl"
  | "th"
  | "vi"
  | "ta"
  | "ms"
  | "prs";

export type TranslationOption = {
  id: TranslationLang;
  edition: string | null;
  label: string;
  native: string;
};

export const TRANSLATIONS: TranslationOption[] = [
  { id: "none", edition: null, label: "Arabic only", native: "العربية فقط" },
  { id: "en", edition: "eng-mohammedmarmadu", label: "English", native: "English" },
  { id: "ur", edition: "urd-mahmoodulhassan", label: "Urdu", native: "اردو" },
  { id: "hi", edition: "hin-maulanaazizulha", label: "Hindi", native: "हिन्दी" },
  { id: "fr", edition: "fra-muhammadhamidul", label: "French", native: "Français" },
  { id: "ru", edition: "rus-elmirkuliev", label: "Russian", native: "Русский" },
  { id: "uk", edition: "ukr-mykhayloyakubov", label: "Ukrainian", native: "Українська" },
  { id: "ko", edition: "kor-hamidchoi", label: "Korean", native: "한국어" },
  { id: "ja", edition: "jpn-ryoichimita", label: "Japanese", native: "日本語" },
  { id: "zh", edition: "zho-majian", label: "Chinese", native: "中文" },
  { id: "tr", edition: "tur-diyanetisleri", label: "Turkish", native: "Türkçe" },
  { id: "fa", edition: "fas-bahaoddinkhorra", label: "Persian", native: "فارسی" },
  { id: "prs", edition: "prs-mawlawimuhammad", label: "Dari", native: "دری" },
  { id: "id", edition: "ind-indonesianislam", label: "Indonesian", native: "Bahasa Indonesia" },
  { id: "ms", edition: "msa-abdullahmuhamma", label: "Malay", native: "Bahasa Melayu" },
  { id: "bn", edition: "ben-muhiuddinkhan", label: "Bengali", native: "বাংলা" },
  { id: "ta", edition: "tam-abdulhameedbaqa", label: "Tamil", native: "தமிழ்" },
  { id: "sw", edition: "swa-alimuhsinalbarw", label: "Swahili", native: "Kiswahili" },
  { id: "ha", edition: "hau-abubakarmahmood", label: "Hausa", native: "Hausa" },
  { id: "yo", edition: "yor-shaykhaburahima", label: "Yoruba", native: "Yorùbá" },
  { id: "so", edition: "som-mahmudmuhammada", label: "Somali", native: "Soomaali" },
  { id: "zu", edition: "zul-iqembulezifundi", label: "Zulu", native: "isiZulu" },
  { id: "af", edition: "afr-imammabaker", label: "Afrikaans", native: "Afrikaans" },
  { id: "am", edition: "amh-muhammedsadiqan", label: "Amharic", native: "አማርኛ" },
  { id: "es", edition: "spa-juliocortes", label: "Spanish", native: "Español" },
  { id: "pt", edition: "por-samirelhayek", label: "Portuguese", native: "Português" },
  { id: "de", edition: "deu-aburidamuhammad", label: "German", native: "Deutsch" },
  { id: "it", edition: "ita-hamzarobertopic", label: "Italian", native: "Italiano" },
  { id: "nl", edition: "nld-sofianssiregar", label: "Dutch", native: "Nederlands" },
  { id: "pl", edition: "pol-jozefabielawski", label: "Polish", native: "Polski" },
  { id: "th", edition: "tha-kingfahadquranc", label: "Thai", native: "ไทย" },
  { id: "vi", edition: "vie-hassanabdulkari", label: "Vietnamese", native: "Tiếng Việt" },
];

export function editionForTranslation(id: TranslationLang | string | undefined): string | null {
  const hit = TRANSLATIONS.find((t) => t.id === id);
  if (hit) return hit.edition;
  // legacy: UI lang used as translation
  if (id === "ar") return null;
  if (id === "fr") return "fra-muhammadhamidul";
  return "eng-mohammedmarmadu";
}
