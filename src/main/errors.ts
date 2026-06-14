import log from 'electron-log/main'
import type { AppError, AppErrorCode } from '../shared/api'
import { recordDiagnostic } from './diagnostics'

/**
 * Build an `AppError` and log it. Every user-facing error in the main process
 * should flow through here so the log file accumulates the technical detail
 * The renderer receives only `userMessage`; technical detail stays in logs and
 * the privacy-safe diagnostics buffer.
 */
export function appError(code: AppErrorCode, userMessage: string, detail?: unknown): AppError {
  const detailStr =
    detail instanceof Error
      ? (detail.stack ?? detail.message)
      : detail != null
        ? String(detail)
        : undefined
  log.error(`[${code}] ${userMessage}${detailStr ? `\n  detail: ${detailStr}` : ''}`)
  recordDiagnostic(code, detail ?? userMessage, { userMessage })
  return { code, userMessage }
}

/**
 * Throw an `AppError` from an IPC handler so the renderer sees the friendly
 * message via Electron's default error serialization. The thrown object is
 * still an `Error` (so it serializes), with the AppError fields attached for
 * any future structured-error path.
 */
export function throwAppError(code: AppErrorCode, userMessage: string, detail?: unknown): never {
  const err = appError(code, userMessage, detail)
  throw Object.assign(new Error(err.userMessage), err)
}

export function isAppError(x: unknown): x is AppError {
  return !!x && typeof x === 'object' && 'code' in x && 'userMessage' in x
}
