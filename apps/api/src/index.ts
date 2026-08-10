import { buildApp } from './app.js'
import { env } from './env.js'

const app = buildApp()

async function main(): Promise<void> {
  try {
    await app.listen({ host: env.HOST, port: env.PORT })
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }
}

void main()
