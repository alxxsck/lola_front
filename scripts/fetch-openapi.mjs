import { mkdir, rename, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import process from 'node:process'

const sourceUrl = process.env.LOLA_OPENAPI_URL ?? 'http://localhost:3000/docs-json'
const targetPath = resolve(process.cwd(), 'openapi/lola-backend.json')
const temporaryPath = `${targetPath}.tmp`

const response = await fetch(sourceUrl)

if (!response.ok) {
  throw new Error(`Unable to fetch OpenAPI from ${sourceUrl}: HTTP ${response.status}`)
}

const document = await response.json()

if (!document.openapi || !document.paths || !document.components?.schemas) {
  throw new Error(`Response from ${sourceUrl} is not a complete OpenAPI document`)
}

function sortObject(value) {
  if (Array.isArray(value)) return value.map(sortObject)
  if (!value || typeof value !== 'object') return value

  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nestedValue]) => [key, sortObject(nestedValue)]),
  )
}

await mkdir(dirname(targetPath), { recursive: true })
await writeFile(temporaryPath, `${JSON.stringify(sortObject(document), null, 2)}\n`)
await rename(temporaryPath, targetPath)

console.log(`Saved OpenAPI snapshot from ${sourceUrl} to ${targetPath}`)
