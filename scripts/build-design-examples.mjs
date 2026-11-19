import { mkdir, writeFile } from 'node:fs/promises'
import { createDesignDemoProject } from '../src/domain/project/designPatterns.js'
import { serializeProject } from '../src/domain/project/project.js'
const destination = new URL('../public/examples/', import.meta.url)
await mkdir(destination, { recursive: true })
await writeFile(new URL('design-patterns.json', destination), `${serializeProject(createDesignDemoProject())}\n`)
console.log('public/examples/design-patterns.json を生成しました（5意匠・6スライド）。')
