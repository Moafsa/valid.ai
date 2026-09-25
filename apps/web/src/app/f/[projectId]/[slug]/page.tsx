import { notFound } from 'next/navigation'
import { db } from '@funnelai/db'
import Script from 'next/script'
import { QuizStepPlayer } from '@/components/public/quiz-step-player'
import { VslPlayer } from '@/components/public/vsl-player'

export const dynamic = 'force-dynamic'

/**
 * Standard first-party loader snippets for each pixel type. This is the
 * other half of "configure trackings before publishing" — TrackingPanel
 * lets you review/edit/activate what the scan found, but until a published
 * page actually emits these tags, activating a pixel there did nothing.
 */
function renderTrackingScripts(trackings: { type: string; pixelId: string | null }[]) {
  return trackings
    .filter(t => t.pixelId?.trim())
    .map(t => {
      const id = t.pixelId!.trim()
      switch (t.type) {
        case 'META_PIXEL':
          return (
            <Script key={`meta-${id}`} id={`meta-pixel-${id}`} strategy="afterInteractive">
              {`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${id}');fbq('track','PageView');`}
            </Script>
          )
        case 'TIKTOK_PIXEL':
          return (
            <Script key={`ttq-${id}`} id={`tiktok-pixel-${id}`} strategy="afterInteractive">
              {`!function(w,d,t){w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie"],ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.load=function(e){var i="https://analytics.tiktok.com/i18n/pixel/events.js";ttq._i=ttq._i||{},ttq._i[e]=[],ttq._t=ttq._t||{},ttq._t[e]=+new Date;var o=document.createElement("script");o.type="text/javascript",o.async=!0,o.src=i+"?sdkid="+e;var a=document.getElementsByTagName("script")[0];a.parentNode.insertBefore(o,a)};ttq.load('${id}');ttq.page()}(window,document,'ttq');`}
            </Script>
          )
        case 'GOOGLE_ANALYTICS':
        case 'GOOGLE_TAG':
          return (
            <>
              <Script key={`gtag-lib-${id}`} src={`https://www.googletagmanager.com/gtag/js?id=${id}`} strategy="afterInteractive" />
              <Script key={`gtag-init-${id}`} id={`gtag-init-${id}`} strategy="afterInteractive">
                {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${id}');`}
              </Script>
            </>
          )
        case 'GTM':
          return (
            <Script key={`gtm-${id}`} id={`gtm-${id}`} strategy="afterInteractive">
              {`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${id}');`}
            </Script>
          )
        default:
          return null
      }
    })
}

/**
 * The actual public-facing funnel page — what "Publicar" makes real.
 * No auth, no dashboard chrome: this is what an end visitor sees.
 * Renders each block's generated HTML (or its raw screenshot, if AI
 * code-gen hasn't produced anything for it yet) and wires up the real
 * tracking SDK — replacing the fictional t.valid.ai snippet that used
 * to sit in Settings pointing at a service that was never built.
 */
export default async function PublishedFunnelPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string; slug: string }>
  searchParams: Promise<{ done?: string }>
}) {
  const { projectId, slug } = await params
  const { done } = await searchParams

  const project = await db.project.findUnique({
    where: { id: projectId },
    include: { pages: { orderBy: { order: 'asc' } }, trackings: true },
  })

  if (!project || project.status !== 'PUBLISHED') notFound()

  const page = project.pages.find(p => p.slug === slug)
  if (!page) notFound()

  const activeTrackings = project.trackings.filter(t => t.isActive)

  const blocks = Array.isArray(page.blocks) ? (page.blocks as any[]) : []
  const sorted = [...blocks].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  const quizBlock = sorted.length === 1 && sorted[0].type === 'quiz-step' ? sorted[0] : null

  return (
    <>
      {/* Runtime Tailwind: blocks are generated at scan time, their utility
          classes never exist in this app's own build-time CSS, so a
          compiled stylesheet would ship with none of them. The CDN build
          scans the live DOM instead, so it works for HTML injected here.
          "beforeInteractive" only works from the root layout — used here,
          in a nested route, Next.js just queues it (__next_s.push) and
          never actually injects the <script>, so it silently never loads. */}
      <Script src="https://cdn.tailwindcss.com" strategy="afterInteractive" />
      {renderTrackingScripts(activeTrackings)}
      <Script src="/sdk.js" strategy="afterInteractive" />
      {/*
        id is per project+page on purpose. next/script dedupes by id and
        skips re-running a script it already executed once for the whole
        browser session — including across client-side navigations to a
        DIFFERENT project's /f/ page. With a static id, window.vai only
        ever got created for whichever project's page happened to load
        first; every later quiz step (or a different project entirely)
        kept silently posting events under that first project's id. A
        per-page id makes every navigation genuinely re-run this.
      */}
      <Script id={`vai-tracker-init-${project.id}-${page.slug}`} strategy="afterInteractive">
        {`
          (function poll(retriesLeft) {
            // /sdk.js is a separate <script src> tag — even with the same
            // "afterInteractive" strategy, its network fetch can still be
            // in flight when this inline script runs, so window.ValidAI
            // isn't guaranteed to exist yet. Poll briefly instead of
            // assuming load order.
            if (window.ValidAI) {
              window.vai = window.ValidAI.createTracker({ projectId: '${project.id}' });
              window.vai.page('${page.slug}');
            } else if (retriesLeft > 0) {
              setTimeout(function() { poll(retriesLeft - 1); }, 50);
            }
          })(40);
        `}
      </Script>

      {done === '1' ? (
        <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', fontFamily: 'sans-serif', textAlign: 'center', padding: '2rem' }}>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.5rem' }}>Obrigado!</h1>
          <p style={{ color: '#666' }}>Suas respostas foram registradas.</p>
        </main>
      ) : quizBlock ? (
        <QuizStepPlayer
          projectId={project.id}
          stepNumber={page.order + 1}
          totalSteps={project.pages.length}
          question={quizBlock.question}
          subtitle={quizBlock.subtitle}
          progressPercent={quizBlock.progressPercent ?? 0}
          answers={quizBlock.answers ?? []}
          hasLeadCapture={!!quizBlock.hasLeadCapture}
          isLastStep={!!quizBlock.isLastStep}
          backgroundHtml={quizBlock.generatedHtml ?? null}
        />
      ) : (
        <main>
          {sorted.length === 0 && (
            <div style={{ padding: '4rem', textAlign: 'center', fontFamily: 'sans-serif', color: '#888' }}>
              Esta página ainda não tem seções.
            </div>
          )}
          {sorted.map(block =>
            block.type === 'vsl' && block.videoUrl ? (
              <VslPlayer
                key={block.id}
                videoUrl={block.videoUrl}
                videoType={block.videoType ?? 'iframe'}
                posterUrl={block.screenshot ?? null}
              />
            ) : block.generatedHtml ? (
              <div key={block.id} dangerouslySetInnerHTML={{ __html: block.generatedHtml }} />
            ) : block.screenshot ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={block.id} src={block.screenshot} alt="" style={{ width: '100%', display: 'block' }} />
            ) : null
          )}
        </main>
      )}
    </>
  )
}
