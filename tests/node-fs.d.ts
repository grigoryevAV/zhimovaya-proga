/**
 * Минимальное объявление node:fs для тестов: @types/node в проекте нет, а читать исходник CSS
 * нужно, чтобы проверить требования оформления (Д1–Д3).
 */
declare module 'node:fs' {
  export function readFileSync(path: string | URL, encoding: 'utf8'): string
}
