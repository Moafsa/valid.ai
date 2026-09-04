/**
 * Seed script — popula configs padrão e registra o superadmin.
 * Execute: npx ts-node packages/db/src/seed.ts
 *
 * ANTES DE RODAR:
 * 1. Configure DATABASE_URL no .env
 * 2. Configure SUPERADMIN_CLERK_USER_ID no .env com seu Clerk User ID
 * 3. Configure SUPERADMIN_EMAIL no .env com seu e-mail
 */
import { PrismaClient } from '@prisma/client'
import { setConfig, CONFIG_DEFINITIONS } from './config-store'

const db = new PrismaClient()

async function main() {
  console.log('🌱 Seeding FunnelAI database...')

  // 1. Criar SuperAdmin
  const adminClerkId = process.env.SUPERADMIN_CLERK_USER_ID
  const adminEmail   = process.env.SUPERADMIN_EMAIL

  if (!adminClerkId || !adminEmail) {
    console.warn('⚠️  SUPERADMIN_CLERK_USER_ID e SUPERADMIN_EMAIL não configurados no .env')
    console.warn('   Pule o registro do superadmin e configure manualmente via Prisma Studio.')
  } else {
    const admin = await db.superAdmin.upsert({
      where: { clerkUserId: adminClerkId },
      update: {},
      create: {
        clerkUserId: adminClerkId,
        email: adminEmail,
        name: 'Superadmin',
      },
    })
    console.log(`✅ SuperAdmin registrado: ${admin.email}`)
  }

  // 2. Criar configurações padrão (sem valores — serão preenchidos no painel)
  let created = 0
  for (const def of CONFIG_DEFINITIONS) {
    const existing = await db.systemConfig.findUnique({ where: { key: def.key } })
    if (!existing) {
      await db.systemConfig.create({
        data: {
          key: def.key,
          value: '',
          label: def.label,
          category: def.category as any,
          description: 'description' in def ? (def.description as string | undefined) : undefined,
          isSecret: def.isSecret,
        },
      })
      created++
    }
  }
  console.log(`✅ ${created} configurações criadas (${CONFIG_DEFINITIONS.length - created} já existiam)`)

  // 3. Criar workspace de demonstração
  const demoWorkspace = await db.workspace.upsert({
    where: { slug: 'demo' },
    update: {},
    create: {
      clerkOrgId: 'org_demo',
      name: 'Demo Workspace',
      slug: 'demo',
      plan: 'FREE',
      aiCredits: 50,
    },
  })
  console.log(`✅ Demo workspace: ${demoWorkspace.name}`)

  console.log('\n🚀 Seed completo! Próximos passos:')
  console.log('   1. Acesse http://localhost:3000/superadmin/config')
  console.log('   2. Configure as chaves de IA (OpenAI, Anthropic, Gemini)')
  console.log('   3. Configure AWS S3, Stripe e Resend')
  console.log('   4. Cole um link de LP no dashboard para testar o scanner')
}

main()
  .catch(console.error)
  .finally(() => db.$disconnect())
