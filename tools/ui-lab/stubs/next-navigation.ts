export const useRouter = () => ({
  push: (u: string) => { (window as any).__nav = u; console.log('NAV push', u) },
  replace: (u: string) => { (window as any).__nav = u },
  refresh: () => {}, back: () => {}, prefetch: () => {},
})
export const usePathname = () => '/'
export const useSearchParams = () => new URLSearchParams()
export const notFound = () => { throw new Error('notFound') }
