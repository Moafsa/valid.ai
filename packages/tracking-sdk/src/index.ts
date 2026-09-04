export { createTracker } from './tracker'
export type { EventType, TrackEvent, TrackerConfig, FunnelAITracker } from './types'

// Browser snippet (IIFE) — injected into published funnels as inline script
export const BROWSER_SNIPPET = `
!function(w,d,p,i){
  var s=d.createElement('script');
  s.async=true;
  s.src=p+'/sdk.js';
  s.onload=function(){w.fai=window.FunnelAI.createTracker({projectId:i,endpoint:p})};
  d.head.appendChild(s);
}(window,document,'https://t.funnelai.com','PROJECT_ID');
`.trim()
