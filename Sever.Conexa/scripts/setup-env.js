import { copyFileSync, existsSync } from 'fs'

if (!existsSync('.env')) {
  copyFileSync('.env.example', '.env')
  console.log('✓ .env creado desde .env.example')
}
