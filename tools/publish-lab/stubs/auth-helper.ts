// the real one asks Clerk who is logged in; the labs act as the owner of the workspace named in LAB_WORKSPACE_ID (or nobody)
export async function getCurrentWorkspace() {
  const { db } = await import('./db')
  return process.env.LAB_WORKSPACE_ID ? db.workspace.findUnique({ where: { id: process.env.LAB_WORKSPACE_ID } }) : null
}
export async function getAuthUser() { return { userId: process.env.LAB_USER_ID || null } }
