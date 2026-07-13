import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import process from 'node:process'
import { spawn } from 'node:child_process'

const generatedDirectory = resolve(process.cwd(), 'src/shared/api/generated')

async function directoryDigest(directory) {
  const hash = createHash('sha256')

  async function visit(currentDirectory) {
    const entries = await readdir(currentDirectory, { withFileTypes: true })

    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      const entryPath = resolve(currentDirectory, entry.name)

      if (entry.isDirectory()) {
        await visit(entryPath)
      } else {
        hash.update(entryPath.slice(directory.length))
        hash.update(await readFile(entryPath))
      }
    }
  }

  await visit(directory)
  return hash.digest('hex')
}

function regenerateClient() {
  return new Promise((resolvePromise, reject) => {
    const command = process.platform === 'win32' ? 'npm.cmd' : 'npm'
    const child = spawn(command, ['run', 'api:generate'], { stdio: 'inherit' })

    child.on('error', reject)
    child.on('exit', (code) => {
      if (code === 0) resolvePromise()
      else reject(new Error(`OpenAPI generation failed with exit code ${code}`))
    })
  })
}

const before = await directoryDigest(generatedDirectory)
await regenerateClient()
const after = await directoryDigest(generatedDirectory)

if (before !== after) {
  throw new Error('Generated API client was stale. Commit the output of npm run api:generate.')
}

console.log('Generated API client is up to date')
