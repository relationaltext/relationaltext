import { beforeAll } from 'vitest'
import { init } from '../src/registry.js'

beforeAll(async () => {
  await init()
})
