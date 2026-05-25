import surahsData from './surahs.json'

export type SurahInfo = {
  number: number
  name_ar: string
  name_en: string
  meaning_en: string
}

/** Frozen — bundled reference data, immutable at runtime. */
export const SURAHS: readonly SurahInfo[] = Object.freeze(surahsData as SurahInfo[])

/** Look up by 1-indexed surah number. Returns `undefined` for out-of-range. */
export function getSurah(number: number): SurahInfo | undefined {
  if (!Number.isInteger(number) || number < 1 || number > SURAHS.length) return undefined
  return SURAHS[number - 1]
}
