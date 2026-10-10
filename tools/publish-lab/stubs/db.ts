import { PrismaClient } from '@prisma/client'
export * from '@prisma/client'
export const db = new PrismaClient()
export async function getAiCredentials() { return {} }
export async function getConfig(_k: string) { return null }
