/**
 * The analytics center speaks the editor's visual language (graphite + paper, one blue accent, light and dark) but is
 * laid out as a reading surface: wide, calm, numbers first. Everything sits under .vai-an (on the same root as .vai-ed,
 * which provides the --ed-* tokens and the .ed-btn / .ed-seg / .ed-input pieces reused here).
 */
export const ANALYTICS_CSS = `
.vai-an {
  --an-s1: #3b82f6; --an-s2: #8b5cf6; --an-s3: #14b8a6; --an-s4: #f59e0b; --an-s5: #ec4899; --an-s6: #64748b;
  --an-good: var(--ed-ok); --an-bad: var(--ed-danger); --an-warn: var(--ed-warn);
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  background: var(--ed-bg); color: var(--ed-text); font-size: 13px; line-height: 1.45; -webkit-font-smoothing: antialiased;
  font-feature-settings: "tnum" 1, "cv11" 1;
}
.vai-an[data-theme="dark"] { --an-s1: #60a5fa; --an-s2: #a78bfa; --an-s3: #2dd4bf; --an-s4: #fbbf24; --an-s5: #f472b6; --an-s6: #94a3b8; }
.vai-an * { box-sizing: border-box; }
.vai-an button { font-family: inherit; }

.an-top { display: flex; align-items: center; gap: 14px; height: 52px; padding: 0 14px; background: var(--ed-panel); border-bottom: 1px solid var(--ed-line); flex-shrink: 0; }
.an-brand { display: flex; align-items: center; gap: 10px; min-width: 0; }
.an-logo { width: 30px; height: 30px; border-radius: 9px; background: var(--ed-ink); color: var(--ed-ink-text); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.an-brand b { font-size: 14px; letter-spacing: -.01em; white-space: nowrap; }
.an-brand span { color: var(--ed-text-3); font-size: 12px; max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.an-spacer { flex: 1; }
.an-live { white-space: nowrap; flex-shrink: 0; display: inline-flex; align-items: center; gap: 7px; height: 28px; padding: 0 11px; border-radius: 999px; border: 1px solid var(--ed-line); background: var(--ed-panel-2); font-size: 12px; font-weight: 600; color: var(--ed-text-2); }
.an-live i { width: 7px; height: 7px; border-radius: 50%; background: var(--ed-text-3); }
.an-live[data-on="true"] i { background: var(--ed-ok); box-shadow: 0 0 0 0 rgba(47,165,106,.5); animation: an-pulse 1.8s infinite; }
@keyframes an-pulse { 70% { box-shadow: 0 0 0 7px rgba(47,165,106,0); } 100% { box-shadow: 0 0 0 0 rgba(47,165,106,0); } }

.an-filters { display: flex; align-items: center; gap: 8px; padding: 9px 16px; background: var(--ed-panel); border-bottom: 1px solid var(--ed-line); flex-shrink: 0; flex-wrap: wrap; }
.an-fsel { position: relative; }
.an-fchip { display: inline-flex; align-items: center; gap: 6px; height: 28px; padding: 0 10px; border-radius: 8px; border: 1px solid var(--ed-line-2); background: var(--ed-panel); color: var(--ed-text-2); font-size: 12px; font-weight: 550; cursor: pointer; transition: background .15s, border-color .15s; max-width: 220px; }
.an-fchip:hover { background: var(--ed-hover); }
.an-fchip[data-on="true"] { background: var(--ed-accent-soft); border-color: var(--ed-accent-line); color: var(--ed-accent); }
.an-fchip span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.an-fmenu { position: absolute; top: calc(100% + 6px); left: 0; z-index: 70; min-width: 210px; max-height: 320px; overflow: auto; padding: 5px; border-radius: var(--ed-r-md); border: 1px solid var(--ed-line); background: var(--ed-panel); box-shadow: var(--ed-shadow-2); animation: ed-fade-up .16s var(--ed-ease) both; }
.an-fmenu button { display: flex; width: 100%; align-items: center; justify-content: space-between; gap: 10px; padding: 7px 10px; border: 0; border-radius: 7px; background: transparent; color: var(--ed-text); font-size: 12.5px; text-align: left; cursor: pointer; }
.an-fmenu button:hover { background: var(--ed-hover); }
.an-fmenu button[data-on="true"] { background: var(--ed-accent-soft); color: var(--ed-accent); font-weight: 600; }
.an-fmenu .sep { height: 1px; background: var(--ed-line); margin: 5px 4px; }
.an-date { display: flex; align-items: center; gap: 6px; padding: 8px 6px 4px; }
.an-date input { height: 28px; padding: 0 6px; border-radius: 7px; border: 1px solid var(--ed-line); background: var(--ed-panel-2); color: var(--ed-text); font-size: 12px; }

.an-body { display: flex; flex: 1; min-height: 0; }
.an-rail { display: flex; flex-direction: column; gap: 3px; width: 76px; padding: 12px 8px; background: var(--ed-panel); border-right: 1px solid var(--ed-line); overflow-y: auto; flex-shrink: 0; }
.an-rail button { position: relative; display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 9px 2px 7px; border: 0; border-radius: 11px; background: transparent; color: var(--ed-text-2); font-size: 10.5px; font-weight: 600; cursor: pointer; transition: background .15s, color .15s, transform .12s var(--ed-ease); }
.an-rail button:hover { background: var(--ed-hover); color: var(--ed-text); }
.an-rail button:active { transform: scale(.95); }
.an-rail button[data-on="true"] { background: var(--ed-active); color: var(--ed-text); }
.an-rail button[data-on="true"]::before { content: ""; position: absolute; left: -8px; top: 12px; bottom: 12px; width: 3px; border-radius: 0 3px 3px 0; background: var(--ed-accent); }
.an-rail .badge { position: absolute; top: 5px; right: 12px; min-width: 15px; height: 15px; padding: 0 4px; border-radius: 8px; background: var(--ed-accent); color: #fff; font-size: 9.5px; display: flex; align-items: center; justify-content: center; }
.an-main { flex: 1; min-width: 0; overflow-y: auto; scroll-behavior: smooth; }
.an-page { max-width: 1360px; margin: 0 auto; padding: 22px 28px 90px; }
.an-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; margin-bottom: 18px; flex-wrap: wrap; }
.an-h1 { font-size: 21px; font-weight: 700; letter-spacing: -.02em; margin: 0; }
.an-sub { margin: 3px 0 0; color: var(--ed-text-3); font-size: 12.5px; max-width: 720px; }

.an-grid { display: grid; gap: 14px; margin-bottom: 14px; }
.an-grid.c2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.an-grid.c3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.an-grid.c4 { grid-template-columns: repeat(4, minmax(0, 1fr)); }
.an-grid.c5 { grid-template-columns: repeat(5, minmax(0, 1fr)); }
.an-grid.c6 { grid-template-columns: repeat(6, minmax(0, 1fr)); }
.an-grid.s2 { grid-template-columns: minmax(0, 2fr) minmax(0, 1fr); }
.an-grid.s3 { grid-template-columns: minmax(0, 1fr) 340px; }
@media (max-width: 1180px) { .an-grid.c6 { grid-template-columns: repeat(3, minmax(0, 1fr)); } .an-grid.c5 { grid-template-columns: repeat(3, minmax(0, 1fr)); } .an-grid.c4 { grid-template-columns: repeat(2, minmax(0, 1fr)); } .an-grid.s2, .an-grid.s3 { grid-template-columns: minmax(0, 1fr); } }
@media (max-width: 760px) { .an-filters .ed-seg button, .an-fchip { white-space: nowrap; } .an-top .ed-btn span, .an-top .ed-btn { font-size: 0; gap: 0; padding: 0 9px; } .an-top .ed-btn svg { width: 15px; height: 15px; } .an-brand { min-width: 0; flex: 0 1 auto; } .an-top { gap: 8px; } .an-page { padding: 16px 14px 80px; } .an-grid.c6, .an-grid.c5, .an-grid.c4, .an-grid.c3, .an-grid.c2 { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); } .an-grid.c3 { grid-template-columns: minmax(0, 1fr); } .an-rail { width: 58px; } .an-rail button { font-size: 0; gap: 0; } .an-brand span { display: none; } }

.an-card { position: relative; border: 1px solid var(--ed-line); background: var(--ed-panel); border-radius: var(--ed-r-lg); padding: 16px 18px; min-width: 0; }
.an-card.flush { padding: 0; overflow: hidden; }
.an-card-h { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 12px; min-height: 26px; }
.an-card-t { font-size: 13px; font-weight: 650; letter-spacing: -.005em; margin: 0; }
.an-card-s { margin: 2px 0 0; font-size: 11.5px; color: var(--ed-text-3); }
.an-card.flush .an-card-h { padding: 14px 18px 0; margin-bottom: 10px; }

.an-kpi { display: flex; flex-direction: column; gap: 6px; padding: 14px 16px 12px; overflow: hidden; }
.an-kpi-l { font-size: 11.5px; font-weight: 600; color: var(--ed-text-2); display: flex; align-items: center; gap: 6px; }
.an-kpi-v { font-size: 27px; font-weight: 700; letter-spacing: -.03em; line-height: 1.1; font-variant-numeric: tabular-nums; }
.an-kpi-v small { font-size: 13px; font-weight: 600; color: var(--ed-text-3); margin-left: 3px; letter-spacing: 0; }
.an-kpi-f { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-height: 22px; }
.an-kpi.hero { background: linear-gradient(160deg, var(--ed-panel), var(--ed-panel-2)); }
.an-delta { display: inline-flex; align-items: center; gap: 3px; height: 20px; padding: 0 6px; border-radius: 6px; font-size: 11px; font-weight: 650; font-variant-numeric: tabular-nums; background: var(--ed-panel-2); color: var(--ed-text-3); }
.an-delta.up { color: var(--an-good); background: rgba(47,165,106,.12); }
.an-delta.down { color: var(--an-bad); background: rgba(229,72,77,.11); }
.an-delta.inv.up { color: var(--an-bad); background: rgba(229,72,77,.11); }
.an-delta.inv.down { color: var(--an-good); background: rgba(47,165,106,.12); }

.an-list { display: flex; flex-direction: column; gap: 2px; }
.an-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 10px; padding: 7px 8px; margin: 0 -8px; border-radius: 8px; position: relative; cursor: default; }
.an-row.click { cursor: pointer; }
.an-row.click:hover { background: var(--ed-hover); }
.an-row .fill { position: absolute; left: 0; top: 3px; bottom: 3px; border-radius: 6px; background: var(--ed-accent-soft); z-index: 0; transition: width .5s var(--ed-ease); }
.an-row .l { position: relative; z-index: 1; display: flex; align-items: center; gap: 8px; min-width: 0; padding-left: 6px; }
.an-row .l span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.an-row .r { position: relative; z-index: 1; display: flex; align-items: center; gap: 10px; font-variant-numeric: tabular-nums; color: var(--ed-text-2); }
.an-row .r b { color: var(--ed-text); font-weight: 650; min-width: 38px; text-align: right; }
.an-row .r em { font-style: normal; font-size: 11px; min-width: 44px; text-align: right; color: var(--ed-text-3); }
.an-dot { width: 8px; height: 8px; border-radius: 3px; flex-shrink: 0; }

.an-table { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
.an-table th { text-align: right; font-size: 10.5px; font-weight: 650; letter-spacing: .05em; text-transform: uppercase; color: var(--ed-text-3); padding: 8px 10px; border-bottom: 1px solid var(--ed-line); white-space: nowrap; position: sticky; top: 0; background: var(--ed-panel); }
.an-table th:first-child, .an-table td:first-child { text-align: left; }
.an-table td { text-align: right; padding: 9px 10px; border-bottom: 1px solid var(--ed-line); }
.an-table tr:last-child td { border-bottom: 0; }
.an-table tbody tr.click { cursor: pointer; }
.an-table tbody tr.click:hover td { background: var(--ed-hover); }
.an-table td.name { font-weight: 550; max-width: 280px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.an-scroll-x { overflow-x: auto; }
.an-mini { display: inline-block; width: 54px; height: 6px; border-radius: 3px; background: var(--ed-active); vertical-align: middle; margin-right: 7px; overflow: hidden; }
.an-mini i { display: block; height: 100%; border-radius: 3px; background: var(--ed-accent); }
.an-good { color: var(--an-good); } .an-bad { color: var(--an-bad); } .an-warn { color: var(--an-warn); } .an-dim { color: var(--ed-text-3); }

.an-pill { display: inline-flex; align-items: center; gap: 5px; height: 21px; padding: 0 8px; border-radius: 999px; font-size: 11px; font-weight: 650; background: var(--ed-panel-2); color: var(--ed-text-2); border: 1px solid var(--ed-line); white-space: nowrap; }
.an-pill.bad { background: rgba(229,72,77,.1); color: var(--an-bad); border-color: rgba(229,72,77,.25); }
.an-pill.good { background: rgba(47,165,106,.12); color: var(--an-good); border-color: rgba(47,165,106,.28); }
.an-pill.warn { background: rgba(229,146,10,.12); color: var(--an-warn); border-color: rgba(229,146,10,.3); }
.an-pill.blue { background: var(--ed-accent-soft); color: var(--ed-accent); border-color: var(--ed-accent-line); }

.an-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; padding: 46px 20px; text-align: center; color: var(--ed-text-3); font-size: 12.5px; }
.an-empty b { color: var(--ed-text); font-size: 14px; }
.an-empty svg { color: var(--ed-text-3); }
.an-skel { border-radius: 8px; background: linear-gradient(90deg, var(--ed-panel-2), var(--ed-active), var(--ed-panel-2)); background-size: 200% 100%; animation: an-shimmer 1.3s infinite; }
@keyframes an-shimmer { to { background-position: -200% 0; } }
.an-err { padding: 12px 14px; border-radius: 10px; background: rgba(229,72,77,.08); border: 1px solid rgba(229,72,77,.25); color: var(--an-bad); font-size: 12.5px; }
.an-fade { animation: ed-fade-up .3s var(--ed-ease) both; }
.an-busy { opacity: .55; transition: opacity .2s; pointer-events: none; }

.an-chart { width: 100%; display: block; overflow: visible; }
.an-chart text { fill: var(--ed-text-3); font-size: 10.5px; font-family: inherit; font-variant-numeric: tabular-nums; }
.an-chart .grid { stroke: var(--ed-line); stroke-width: 1; }
.an-chart .axis { stroke: var(--ed-line-2); }
.an-tip { position: absolute; z-index: 20; pointer-events: none; min-width: 130px; padding: 8px 10px; border-radius: 10px; background: var(--ed-ink); color: var(--ed-ink-text); font-size: 11.5px; box-shadow: var(--ed-shadow-2); transform: translate(-50%, -100%); }
.an-tip b { display: block; margin-bottom: 4px; font-size: 11px; opacity: .75; font-weight: 600; }
.an-tip div { display: flex; align-items: center; justify-content: space-between; gap: 14px; }
.an-tip i { width: 8px; height: 8px; border-radius: 3px; display: inline-block; margin-right: 6px; }
.an-legend { display: flex; flex-wrap: wrap; gap: 14px; font-size: 11.5px; color: var(--ed-text-2); }
.an-legend span { display: inline-flex; align-items: center; gap: 6px; }

.an-funnel { display: flex; flex-direction: column; gap: 0; }
.an-fstep { position: relative; display: grid; grid-template-columns: 210px minmax(0, 1fr) 150px; align-items: center; gap: 16px; padding: 10px 0; }
.an-fstep .name { font-weight: 600; font-size: 13px; }
.an-fstep .name small { display: block; font-weight: 400; font-size: 11px; color: var(--ed-text-3); margin-top: 1px; }
.an-fbar { position: relative; height: 38px; border-radius: 9px; background: var(--ed-panel-2); border: 1px solid var(--ed-line); overflow: hidden; }
.an-fbar i { position: absolute; left: 0; top: 0; bottom: 0; border-radius: 8px; background: linear-gradient(90deg, var(--ed-accent), color-mix(in srgb, var(--ed-accent) 70%, var(--an-s2))); transition: width .7s var(--ed-ease); }
.an-fbar span { position: absolute; left: 12px; top: 0; bottom: 0; display: flex; align-items: center; font-weight: 700; font-size: 14px; color: #fff; mix-blend-mode: normal; text-shadow: 0 1px 2px rgba(0,0,0,.25); font-variant-numeric: tabular-nums; }
.an-fnum { text-align: right; font-variant-numeric: tabular-nums; }
.an-fnum b { font-size: 15px; }
.an-fnum small { display: block; color: var(--ed-text-3); font-size: 11px; }
.an-floss { display: flex; align-items: center; gap: 10px; margin: -2px 0 0 226px; padding: 0 0 8px; font-size: 11.5px; color: var(--an-bad); }
.an-floss::before { content: ""; width: 1px; height: 14px; background: var(--ed-line-2); margin-left: 6px; }
@media (max-width: 900px) { .an-fstep { grid-template-columns: minmax(0, 1fr); gap: 6px; } .an-floss { margin-left: 0; } }

.an-hm-wrap { position: relative; background: var(--ed-panel-2); border-radius: var(--ed-r-lg); border: 1px solid var(--ed-line); overflow: auto; max-height: 78vh; display: flex; justify-content: center; padding: 16px; }
.an-hm-stage { position: relative; background: #fff; box-shadow: var(--ed-shadow-2); flex-shrink: 0; transform-origin: top center; }
.an-hm-stage iframe { display: block; border: 0; background: #fff; }
.an-hm-stage canvas, .an-hm-over { position: absolute; inset: 0; pointer-events: none; }
.an-hm-band { position: absolute; left: 0; right: 0; display: flex; align-items: center; justify-content: flex-end; padding-right: 10px; font-size: 11px; font-weight: 700; color: #fff; text-shadow: 0 1px 2px rgba(0,0,0,.5); }
.an-hm-pin { position: absolute; transform: translate(-50%, -50%); min-width: 22px; height: 22px; padding: 0 6px; border-radius: 11px; background: var(--ed-ink); color: var(--ed-ink-text); font-size: 11px; font-weight: 700; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 8px rgba(0,0,0,.35); border: 2px solid #fff; }

.an-drawer-bg { position: fixed; inset: 0; z-index: 80; background: rgba(10,10,14,.35); backdrop-filter: blur(2px); animation: an-fade .18s both; }
.an-drawer { position: fixed; top: 0; right: 0; bottom: 0; z-index: 81; width: min(560px, 100vw); background: var(--ed-panel); border-left: 1px solid var(--ed-line); box-shadow: var(--ed-shadow-3); display: flex; flex-direction: column; animation: an-slide .26s var(--ed-ease) both; }
@keyframes an-fade { from { opacity: 0; } }
@keyframes an-slide { from { transform: translateX(40px); opacity: 0; } }
.an-drawer-h { display: flex; align-items: center; justify-content: space-between; padding: 14px 18px; border-bottom: 1px solid var(--ed-line); }
.an-drawer-b { flex: 1; overflow-y: auto; padding: 16px 18px 40px; }
.an-tl { position: relative; display: flex; flex-direction: column; gap: 0; padding-left: 4px; }
.an-tl-i { position: relative; display: grid; grid-template-columns: 54px 22px minmax(0, 1fr); gap: 8px; padding: 6px 0; align-items: start; }
.an-tl-i .t { font-size: 11px; color: var(--ed-text-3); text-align: right; padding-top: 2px; font-variant-numeric: tabular-nums; }
.an-tl-i .d { position: relative; display: flex; justify-content: center; }
.an-tl-i .d::before { content: ""; position: absolute; top: 24px; bottom: -8px; width: 1px; background: var(--ed-line-2); }
.an-tl-i:last-child .d::before { display: none; }
.an-tl-i .d i { width: 22px; height: 22px; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: var(--ed-panel-2); border: 1px solid var(--ed-line-2); color: var(--ed-text-2); z-index: 1; }
.an-tl-i .d i.k-page { background: var(--ed-ink); color: var(--ed-ink-text); border-color: var(--ed-ink); }
.an-tl-i .d i.k-lead, .an-tl-i .d i.k-goal, .an-tl-i .d i.k-checkout { background: var(--ed-ok); color: #fff; border-color: var(--ed-ok); }
.an-tl-i .d i.k-rage, .an-tl-i .d i.k-dead, .an-tl-i .d i.k-exit { background: rgba(229,72,77,.12); color: var(--an-bad); border-color: rgba(229,72,77,.3); }
.an-tl-i .d i.k-video { background: var(--ed-accent-soft); color: var(--ed-accent); border-color: var(--ed-accent-line); }
.an-tl-i .x { font-size: 12.5px; padding-top: 2px; min-width: 0; }
.an-tl-i .x small { display: block; color: var(--ed-text-3); font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.an-ins { display: grid; grid-template-columns: 34px minmax(0, 1fr); gap: 12px; padding: 14px 0; border-bottom: 1px solid var(--ed-line); }
.an-ins:last-child { border-bottom: 0; }
.an-ins-ico { width: 34px; height: 34px; border-radius: 10px; display: flex; align-items: center; justify-content: center; background: var(--ed-panel-2); border: 1px solid var(--ed-line); color: var(--ed-text-2); }
.an-ins-ico.problema { background: rgba(229,72,77,.1); color: var(--an-bad); border-color: rgba(229,72,77,.25); }
.an-ins-ico.oportunidade { background: rgba(47,165,106,.12); color: var(--an-good); border-color: rgba(47,165,106,.28); }
.an-ins-ico.sugestao { background: var(--ed-accent-soft); color: var(--ed-accent); border-color: var(--ed-accent-line); }
.an-ins-ico.teste { background: rgba(139,92,246,.12); color: var(--an-s2); border-color: rgba(139,92,246,.3); }
.an-ins h4 { margin: 0 0 3px; font-size: 13.5px; font-weight: 650; letter-spacing: -.01em; }
.an-ins p { margin: 0; color: var(--ed-text-2); font-size: 12.5px; line-height: 1.55; }
.an-ins ul { margin: 7px 0 0; padding: 0; list-style: none; display: flex; flex-wrap: wrap; gap: 6px; }
.an-ins li { font-size: 11px; padding: 3px 8px; border-radius: 6px; background: var(--ed-panel-2); border: 1px solid var(--ed-line); color: var(--ed-text-2); }
.an-ai { position: relative; overflow: hidden; border-radius: var(--ed-r-lg); border: 1px solid var(--ed-line); background: var(--ed-panel); padding: 20px 22px; }
.an-ai::before { content: ""; position: absolute; inset: -1px; border-radius: inherit; padding: 1px; background: linear-gradient(120deg, var(--ed-ai-a), var(--ed-ai-b), var(--ed-ai-c)); -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); -webkit-mask-composite: xor; mask-composite: exclude; opacity: .55; pointer-events: none; }
.an-ai-sum { font-size: 15px; line-height: 1.6; letter-spacing: -.005em; margin: 0 0 14px; }
.an-form { display: grid; gap: 12px; }
.an-field label { display: block; margin-bottom: 5px; font-size: 11.5px; font-weight: 600; color: var(--ed-text-2); }
.an-twocol { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.an-vcard { display: flex; align-items: center; gap: 12px; padding: 10px 12px; border: 1px solid var(--ed-line); border-radius: 12px; background: var(--ed-panel); cursor: pointer; text-align: left; width: 100%; transition: border-color .15s, background .15s; }
.an-vcard:hover { background: var(--ed-panel-2); }
.an-vcard[data-on="true"] { border-color: var(--ed-accent-line); background: var(--ed-accent-soft); }
.an-rec { display: grid; grid-template-columns: 340px minmax(0, 1fr); gap: 14px; align-items: start; }
@media (max-width: 1100px) { .an-rec { grid-template-columns: minmax(0, 1fr); } }
.an-rec-list { display: flex; flex-direction: column; gap: 7px; max-height: calc(100vh - 250px); overflow-y: auto; padding-right: 4px; }
.an-rec-item { display: flex; flex-direction: column; gap: 5px; padding: 11px 12px; border: 1px solid var(--ed-line); border-radius: 12px; background: var(--ed-panel); cursor: pointer; text-align: left; transition: border-color .15s, background .15s; }
.an-rec-item:hover { background: var(--ed-panel-2); }
.an-rec-item[data-on="true"] { border-color: var(--ed-accent-line); background: var(--ed-accent-soft); }
.an-player { border-radius: var(--ed-r-lg); border: 1px solid var(--ed-line); background: var(--ed-panel-2); overflow: hidden; }
.an-player-view { position: relative; display: flex; justify-content: center; align-items: flex-start; padding: 14px; background: repeating-conic-gradient(var(--ed-panel-2) 0% 25%, var(--ed-panel) 0% 50%) 0 0 / 18px 18px; min-height: 360px; overflow: hidden; }
.an-player-ctl { display: flex; align-items: center; gap: 10px; padding: 10px 14px; background: var(--ed-panel); border-top: 1px solid var(--ed-line); }
.an-scrub { flex: 1; position: relative; height: 22px; display: flex; align-items: center; cursor: pointer; }
.an-scrub::before { content: ""; position: absolute; left: 0; right: 0; height: 5px; border-radius: 3px; background: var(--ed-active); }
.an-scrub i { position: absolute; left: 0; height: 5px; border-radius: 3px; background: var(--ed-accent); }
.an-scrub b { position: absolute; width: 13px; height: 13px; border-radius: 50%; background: var(--ed-panel); border: 2px solid var(--ed-accent); transform: translateX(-50%); box-shadow: var(--ed-shadow-1); }
.an-switch-row { display: flex; align-items: center; justify-content: space-between; gap: 14px; padding: 12px 0; border-bottom: 1px solid var(--ed-line); }
.an-switch-row:last-child { border-bottom: 0; }
.an-switch-row p { margin: 2px 0 0; font-size: 11.5px; color: var(--ed-text-3); }
`
