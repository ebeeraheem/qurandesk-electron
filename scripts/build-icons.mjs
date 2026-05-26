/**
 * Regenerates platform icon assets from src/renderer/src/assets/logo.svg.
 *
 *   build/icon.png      — 1024×1024 PNG (Linux + electron-builder fallback)
 *   build/icon.icns     — macOS app icon
 *   build/icon.ico      — Windows installer + exe icon
 *   resources/icon.png  — embedded for the BrowserWindow (Linux primarily)
 *
 * Run after editing logo.svg:  npm run icons
 *
 * No native deps — `@resvg/resvg-js` is a wasm SVG renderer, `png2icons` is
 * pure JS. Means this works the same in CI on every OS.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Resvg } from '@resvg/resvg-js'
import png2icons from 'png2icons'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const SVG_PATH = join(ROOT, 'src/renderer/src/assets/logo.svg')
const BUILD_DIR = join(ROOT, 'build')
const RESOURCES_DIR = join(ROOT, 'resources')

const TARGET_SIZE = 1024

/** @returns {Buffer} */
function renderPng(svg, size) {
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: size },
    background: 'rgba(0, 0, 0, 0)'
  })
  return resvg.render().asPng()
}

/** @returns {Promise<void>} */
async function main() {
  const svg = await readFile(SVG_PATH)
  const png = renderPng(svg, TARGET_SIZE)

  await mkdir(BUILD_DIR, { recursive: true })
  await mkdir(RESOURCES_DIR, { recursive: true })

  await writeFile(join(BUILD_DIR, 'icon.png'), png)
  await writeFile(join(RESOURCES_DIR, 'icon.png'), png)

  // `png2icons.BICUBIC` resamples cleanly down to the small sub-icon sizes
  // (16, 32, 48, …) embedded inside .icns / .ico containers.
  const icns = png2icons.createICNS(png, png2icons.BICUBIC, 0)
  if (!icns) throw new Error('png2icons.createICNS returned null')
  await writeFile(join(BUILD_DIR, 'icon.icns'), icns)

  // 4th arg true = include all standard sizes (16, 24, 32, 48, 64, 128, 256).
  const ico = png2icons.createICO(png, png2icons.BICUBIC, 0, true)
  if (!ico) throw new Error('png2icons.createICO returned null')
  await writeFile(join(BUILD_DIR, 'icon.ico'), ico)

  console.log('Generated build/icon.{png,icns,ico} and resources/icon.png')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
