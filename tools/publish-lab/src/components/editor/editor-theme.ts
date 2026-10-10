/**
 * Visual language of the page editor.
 *
 * One neutral palette (graphite + paper, a single blue accent), light by default with a graphite dark mode.
 * Everything in the editor reads these tokens, including GrapesJS's own widgets (layers, toolbar, badge,
 * resizer...), which are re-skinned from its --gjs-* variables and a few overrides instead of being rebuilt.
 *
 * Components use the .ed-* classes below instead of long utility strings, so a button or an input looks
 * the same everywhere in the editor.
 */
export const EDITOR_CSS = `
.vai-ed {
  --ed-bg: #eeeef1;
  --ed-panel: #ffffff;
  --ed-panel-2: #f7f7f9;
  --ed-line: #e7e7eb;
  --ed-line-2: #d8d8de;
  --ed-text: #17171a;
  --ed-text-2: #5a5a64;
  --ed-text-3: #8c8c97;
  --ed-hover: #f1f1f4;
  --ed-active: #e8e8ed;
  --ed-accent: #0a72f5;
  --ed-accent-soft: rgba(10, 114, 245, 0.09);
  --ed-accent-line: rgba(10, 114, 245, 0.38);
  --ed-ink: #17171a;
  --ed-ink-text: #ffffff;
  --ed-danger: #e5484d;
  --ed-ok: #2fa56a;
  --ed-warn: #e5920a;
  --ed-shadow-1: 0 1px 2px rgba(20, 20, 32, 0.06);
  --ed-shadow-2: 0 10px 30px rgba(20, 20, 32, 0.12), 0 1px 3px rgba(20, 20, 32, 0.06);
  --ed-shadow-3: 0 24px 60px rgba(20, 20, 32, 0.2), 0 2px 6px rgba(20, 20, 32, 0.08);
  --ed-dot: rgba(20, 20, 32, 0.09);
  --ed-r-sm: 8px;
  --ed-r-md: 10px;
  --ed-r-lg: 14px;
  --ed-ease: cubic-bezier(0.22, 1, 0.36, 1);
  --ed-ai-a: #7aa7ff;
  --ed-ai-b: #c58bff;
  --ed-ai-c: #ffb48a;
}
.vai-ed[data-theme="dark"] {
  --ed-bg: #0b0b0d;
  --ed-panel: #141416;
  --ed-panel-2: #19191c;
  --ed-line: #26262b;
  --ed-line-2: #34343b;
  --ed-text: #f3f3f6;
  --ed-text-2: #a9a9b4;
  --ed-text-3: #75757f;
  --ed-hover: #1f1f23;
  --ed-active: #2a2a30;
  --ed-accent: #4da3ff;
  --ed-accent-soft: rgba(77, 163, 255, 0.14);
  --ed-accent-line: rgba(77, 163, 255, 0.45);
  --ed-ink: #f3f3f6;
  --ed-ink-text: #111113;
  --ed-shadow-1: 0 1px 2px rgba(0, 0, 0, 0.4);
  --ed-shadow-2: 0 10px 30px rgba(0, 0, 0, 0.5), 0 1px 3px rgba(0, 0, 0, 0.4);
  --ed-shadow-3: 0 24px 60px rgba(0, 0, 0, 0.6), 0 2px 6px rgba(0, 0, 0, 0.4);
  --ed-dot: rgba(255, 255, 255, 0.07);
}

/* GrapesJS reads its whole palette from these. */
.vai-ed.vai-ed {
  --gjs-primary-color: var(--ed-panel);
  --gjs-secondary-color: var(--ed-text-2);
  --gjs-tertiary-color: var(--ed-accent);
  --gjs-quaternary-color: var(--ed-accent);
  --gjs-font-color: var(--ed-text-2);
  --gjs-font-color-active: var(--ed-text);
  --gjs-main-color: var(--ed-panel);
  --gjs-main-dark-color: rgba(20, 20, 32, 0.06);
  --gjs-secondary-dark-color: rgba(20, 20, 32, 0.04);
  --gjs-main-light-color: var(--ed-hover);
  --gjs-secondary-light-color: var(--ed-text-3);
  --gjs-soft-light-color: var(--ed-panel-2);
  --gjs-color-blue: var(--ed-accent);
  --gjs-color-highlight: var(--ed-accent);
  --gjs-light-border: var(--ed-line);
  --gjs-arrow-color: var(--ed-text-3);
  --gjs-main-font: inherit;
  --gjs-font-size: 12px;
}

.vai-ed { font-family: var(--font-inter, Inter), system-ui, -apple-system, "Segoe UI", sans-serif; color: var(--ed-text); background: var(--ed-bg); -webkit-font-smoothing: antialiased; }
.vai-ed *, .vai-ed *::before, .vai-ed *::after { box-sizing: border-box; }
.vai-ed button { font-family: inherit; }
.vai-ed ::-webkit-scrollbar { width: 10px; height: 10px; }
.vai-ed ::-webkit-scrollbar-thumb { background: var(--ed-line-2); border-radius: 8px; border: 3px solid transparent; background-clip: content-box; }
.vai-ed ::-webkit-scrollbar-thumb:hover { background: var(--ed-text-3); background-clip: content-box; border: 3px solid transparent; }
.vai-ed ::-webkit-scrollbar-track { background: transparent; }

/* ───────── shared primitives ───────── */
.ed-btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; height: 32px; padding: 0 12px; border-radius: var(--ed-r-sm); border: 1px solid var(--ed-line-2); background: var(--ed-panel); color: var(--ed-text); font-size: 12.5px; font-weight: 550; cursor: pointer; transition: background .15s, border-color .15s, transform .12s var(--ed-ease), box-shadow .15s; white-space: nowrap; }
.ed-btn:hover:not(:disabled) { background: var(--ed-hover); }
.ed-btn:active:not(:disabled) { transform: scale(.97); }
.ed-btn:disabled { opacity: .45; cursor: default; }
.ed-btn:focus-visible, .ed-ibtn:focus-visible, .ed-input:focus-visible, .ed-select:focus-visible, .ed-tab:focus-visible, .ed-rail-btn:focus-visible { outline: 2px solid var(--ed-accent); outline-offset: 1px; }
.ed-btn-primary { background: var(--ed-ink); color: var(--ed-ink-text); border-color: var(--ed-ink); }
.ed-btn-primary:hover:not(:disabled) { background: var(--ed-ink); filter: brightness(1.12); }
.ed-btn-ghost { border-color: transparent; background: transparent; }
.ed-btn-sm { height: 28px; padding: 0 10px; font-size: 12px; }
.ed-btn-block { width: 100%; }
.ed-ibtn { position: relative; display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; border-radius: var(--ed-r-sm); border: 1px solid transparent; background: transparent; color: var(--ed-text-2); cursor: pointer; transition: background .15s, color .15s, transform .12s var(--ed-ease); }
.ed-ibtn:hover:not(:disabled) { background: var(--ed-hover); color: var(--ed-text); }
.ed-ibtn:active:not(:disabled) { transform: scale(.92); }
.ed-ibtn:disabled { opacity: .35; cursor: default; }
.ed-ibtn[data-active="true"] { background: var(--ed-active); color: var(--ed-text); }
.ed-ibtn-sm { width: 26px; height: 26px; border-radius: 7px; }
.ed-input, .ed-select, .ed-textarea { width: 100%; height: 30px; padding: 0 9px; border-radius: var(--ed-r-sm); border: 1px solid var(--ed-line); background: var(--ed-panel-2); color: var(--ed-text); font-size: 12.5px; transition: border-color .15s, background .15s, box-shadow .15s; }
.ed-textarea { height: auto; padding: 8px 10px; line-height: 1.5; resize: vertical; }
.ed-input::placeholder, .ed-textarea::placeholder { color: var(--ed-text-3); }
.ed-input:hover, .ed-select:hover, .ed-textarea:hover { border-color: var(--ed-line-2); }
.ed-input:focus, .ed-select:focus, .ed-textarea:focus { outline: none; border-color: var(--ed-accent); background: var(--ed-panel); box-shadow: 0 0 0 3px var(--ed-accent-soft); }
.ed-select { appearance: none; padding-right: 26px; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%238c8c97' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 9px center; }
.ed-label { display: block; margin-bottom: 5px; font-size: 11.5px; font-weight: 550; color: var(--ed-text-2); }
.ed-hint { margin-top: 6px; font-size: 11px; line-height: 1.45; color: var(--ed-text-3); }
.ed-card { border: 1px solid var(--ed-line); background: var(--ed-panel); border-radius: var(--ed-r-md); }
.ed-section-title { display: flex; align-items: center; gap: 6px; font-size: 10.5px; font-weight: 650; letter-spacing: .07em; text-transform: uppercase; color: var(--ed-text-3); }
.ed-sep { height: 1px; background: var(--ed-line); border: 0; margin: 0; }
.ed-chip { display: inline-flex; align-items: center; gap: 5px; height: 22px; padding: 0 8px; border-radius: 999px; background: var(--ed-panel-2); border: 1px solid var(--ed-line); font-size: 11px; color: var(--ed-text-2); }
.ed-kbd { display: inline-flex; align-items: center; height: 18px; padding: 0 5px; border-radius: 5px; border: 1px solid var(--ed-line-2); background: var(--ed-panel-2); font-size: 10.5px; color: var(--ed-text-2); font-family: inherit; }

.ed-seg { display: inline-flex; padding: 2px; gap: 2px; border-radius: var(--ed-r-sm); background: var(--ed-panel-2); border: 1px solid var(--ed-line); }
.ed-seg button { display: inline-flex; align-items: center; justify-content: center; gap: 5px; min-width: 28px; height: 24px; padding: 0 8px; border-radius: 6px; border: 0; background: transparent; color: var(--ed-text-2); font-size: 11.5px; font-weight: 550; cursor: pointer; transition: background .15s, color .15s, box-shadow .15s; }
.ed-seg button:hover { color: var(--ed-text); }
.ed-seg button[data-on="true"] { background: var(--ed-panel); color: var(--ed-text); box-shadow: var(--ed-shadow-1), 0 0 0 1px var(--ed-line); }
.ed-seg-full { display: flex; width: 100%; }
.ed-seg-full button { flex: 1; }

[data-tip] { position: relative; }
[data-tip]:hover::after { content: attr(data-tip); position: absolute; z-index: 90; left: 50%; top: calc(100% + 7px); transform: translateX(-50%); padding: 5px 8px; border-radius: 7px; background: var(--ed-ink); color: var(--ed-ink-text); font-size: 11px; font-weight: 550; white-space: nowrap; pointer-events: none; box-shadow: var(--ed-shadow-2); animation: ed-pop .14s var(--ed-ease) both; }
[data-tip][data-tip-side="right"]:hover::after { left: calc(100% + 9px); top: 50%; transform: translateY(-50%); }
[data-tip][data-tip-side="top"]:hover::after { top: auto; bottom: calc(100% + 7px); }
[data-tip][data-tip-side="left"]:hover::after { left: auto; right: calc(100% + 9px); top: 50%; transform: translateY(-50%); }

@keyframes ed-pop { from { opacity: 0; transform: translateX(-50%) translateY(3px) scale(.97); } to { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); } }
@keyframes ed-fade-up { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
@keyframes ed-slide-in { from { opacity: 0; transform: translateX(-8px); } to { opacity: 1; transform: translateX(0); } }
@keyframes ed-sheet-in { from { opacity: 0; transform: translateY(18px) scale(.985); } to { opacity: 1; transform: translateY(0) scale(1); } }
@keyframes ed-spin { to { transform: rotate(360deg); } }
@keyframes ed-orb { 0%, 100% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } }
@keyframes ed-pulse-ring { 0% { box-shadow: 0 0 0 0 rgba(122, 167, 255, .45); } 70% { box-shadow: 0 0 0 12px rgba(122, 167, 255, 0); } 100% { box-shadow: 0 0 0 0 rgba(122, 167, 255, 0); } }
@keyframes ed-shimmer { from { background-position: -200% 0; } to { background-position: 200% 0; } }
.ed-spin { animation: ed-spin .8s linear infinite; }
.ed-enter { animation: ed-fade-up .28s var(--ed-ease) both; }
@media (prefers-reduced-motion: reduce) { .vai-ed *, .vai-ed *::before, .vai-ed *::after { animation-duration: .01ms !important; transition-duration: .01ms !important; } }

/* the app's notifications must not sit on top of the Save / Publish buttons */
[data-sonner-toaster][data-y-position="top"] { top: 64px !important; }

/* ───────── top bar ───────── */
.ed-topbar { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 12px; height: 52px; padding: 0 12px; background: var(--ed-panel); border-bottom: 1px solid var(--ed-line); flex-shrink: 0; position: relative; z-index: 30; }
.ed-topbar-side { display: flex; align-items: center; gap: 6px; min-width: 0; }
.ed-topbar-side.end { justify-content: flex-end; }
.ed-crumb { display: flex; align-items: center; gap: 4px; min-width: 0; }
.ed-crumb-name { max-width: 190px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; font-weight: 600; letter-spacing: -.01em; }
.ed-crumb-page { display: inline-flex; align-items: center; gap: 5px; height: 28px; padding: 0 9px; border-radius: 8px; border: 1px solid transparent; background: transparent; color: var(--ed-text-2); font-size: 12.5px; font-weight: 550; cursor: pointer; transition: background .15s, border-color .15s; }
.ed-crumb-page:hover { background: var(--ed-hover); }
.ed-dirty { display: inline-flex; align-items: center; gap: 6px; font-size: 11.5px; color: var(--ed-text-3); }
.ed-dirty i { width: 7px; height: 7px; border-radius: 50%; background: var(--ed-warn); box-shadow: 0 0 0 3px rgba(229, 146, 10, .16); }
.ed-dirty.saved i { background: var(--ed-ok); box-shadow: 0 0 0 3px rgba(47, 165, 106, .16); }
.ed-menu { position: absolute; top: calc(100% + 6px); left: 0; z-index: 60; min-width: 230px; padding: 5px; border-radius: var(--ed-r-md); border: 1px solid var(--ed-line); background: var(--ed-panel); box-shadow: var(--ed-shadow-2); animation: ed-fade-up .18s var(--ed-ease) both; }
.ed-menu button { display: flex; width: 100%; align-items: center; justify-content: space-between; gap: 10px; padding: 8px 10px; border: 0; border-radius: 7px; background: transparent; color: var(--ed-text); font-size: 12.5px; text-align: left; cursor: pointer; }
.ed-menu button:hover { background: var(--ed-hover); }
.ed-menu button[data-on="true"] { background: var(--ed-accent-soft); color: var(--ed-accent); }
.ed-zoom { display: inline-flex; align-items: center; gap: 2px; margin-left: 8px; font-size: 11.5px; color: var(--ed-text-3); }

/* ───────── left side: rail + panel ───────── */
.ed-side { position: relative; display: flex; flex-shrink: 0; min-height: 0; background: var(--ed-panel); border-right: 1px solid var(--ed-line); z-index: 20; }
.ed-rail { display: flex; flex-direction: column; align-items: center; gap: 4px; width: 64px; padding: 10px 0; border-right: 1px solid var(--ed-line); background: var(--ed-panel-2); }
.ed-rail-btn { position: relative; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px; width: 54px; height: 52px; border-radius: 11px; border: 0; background: transparent; color: var(--ed-text-2); font-size: 9.5px; font-weight: 600; letter-spacing: .01em; cursor: pointer; transition: background .15s, color .15s, transform .12s var(--ed-ease); }
.ed-rail-btn:hover { background: var(--ed-hover); color: var(--ed-text); }
.ed-rail-btn:active { transform: scale(.94); }
.ed-rail-btn[data-on="true"] { background: var(--ed-panel); color: var(--ed-text); box-shadow: var(--ed-shadow-1), 0 0 0 1px var(--ed-line); }
.ed-rail-btn[data-on="true"]::before { content: ""; position: absolute; left: -6px; top: 14px; bottom: 14px; width: 3px; border-radius: 0 3px 3px 0; background: var(--ed-accent); }
.ed-rail-badge { position: absolute; top: 6px; right: 8px; width: 7px; height: 7px; border-radius: 50%; background: var(--ed-accent); box-shadow: 0 0 0 2px var(--ed-panel-2); }
.ed-panel { position: relative; display: flex; flex-direction: column; width: 292px; min-height: 0; animation: ed-slide-in .24s var(--ed-ease) both; }
.ed-panel-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 14px 14px 10px; }
.ed-panel-title { font-size: 13.5px; font-weight: 650; letter-spacing: -.01em; }
.ed-panel-body { flex: 1; min-height: 0; overflow-y: auto; }
.ed-search { position: relative; padding: 0 14px 12px; }
.ed-search svg { position: absolute; left: 24px; top: 8px; color: var(--ed-text-3); pointer-events: none; }
.ed-search input { padding-left: 30px; height: 32px; }

/* element library */
.ed-cat { padding: 4px 14px 14px; }
.ed-cat-title { display: flex; align-items: center; justify-content: space-between; margin: 8px 0 8px; }
.ed-blocks { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.ed-block { display: flex; flex-direction: column; align-items: flex-start; gap: 9px; padding: 11px 11px 10px; border-radius: var(--ed-r-md); border: 1px solid var(--ed-line); background: var(--ed-panel); color: var(--ed-text); cursor: grab; text-align: left; transition: border-color .15s, background .15s, transform .15s var(--ed-ease), box-shadow .15s; }
.ed-block:hover { border-color: var(--ed-line-2); background: var(--ed-panel-2); transform: translateY(-1px); box-shadow: var(--ed-shadow-1); }
.ed-block:active { cursor: grabbing; transform: scale(.98); }
.ed-block-ico { display: flex; align-items: center; justify-content: center; width: 32px; height: 32px; border-radius: 9px; background: var(--ed-panel-2); border: 1px solid var(--ed-line); color: var(--ed-text); transition: background .15s, color .15s, border-color .15s; }
.ed-block:hover .ed-block-ico { background: var(--ed-ink); color: var(--ed-ink-text); border-color: var(--ed-ink); }
.ed-block-name { font-size: 12px; font-weight: 600; line-height: 1.25; }
.ed-empty { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 40px 24px; text-align: center; color: var(--ed-text-3); font-size: 12.5px; }
.ed-empty b { color: var(--ed-text); font-weight: 600; }
.ed-tipbar { margin: 0 14px 14px; padding: 10px 12px; border-radius: var(--ed-r-md); background: var(--ed-panel-2); border: 1px dashed var(--ed-line-2); font-size: 11.5px; line-height: 1.5; color: var(--ed-text-2); }

/* inspector */
.ed-insp-head { display: flex; align-items: center; gap: 10px; padding: 12px 14px; border-bottom: 1px solid var(--ed-line); }
.ed-insp-ico { display: flex; align-items: center; justify-content: center; width: 34px; height: 34px; border-radius: 10px; background: var(--ed-accent-soft); color: var(--ed-accent); flex-shrink: 0; }
.ed-insp-name { font-size: 13.5px; font-weight: 650; letter-spacing: -.01em; line-height: 1.2; }
.ed-insp-tag { font-size: 11px; color: var(--ed-text-3); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.ed-trail { display: flex; align-items: center; gap: 2px; flex-wrap: wrap; padding: 8px 14px 0; font-size: 11px; color: var(--ed-text-3); }
.ed-trail button { border: 0; background: transparent; color: var(--ed-text-2); font-size: 11px; padding: 2px 5px; border-radius: 5px; cursor: pointer; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.ed-trail button:hover { background: var(--ed-hover); color: var(--ed-text); }
.ed-tabs { position: relative; display: flex; gap: 2px; padding: 0 10px; border-bottom: 1px solid var(--ed-line); }
.ed-tab { position: relative; flex: 1; height: 38px; border: 0; background: transparent; color: var(--ed-text-3); font-size: 12px; font-weight: 600; cursor: pointer; transition: color .15s; }
.ed-tab:hover { color: var(--ed-text); }
.ed-tab[data-on="true"] { color: var(--ed-text); }
.ed-tab[data-on="true"]::after { content: ""; position: absolute; left: 10px; right: 10px; bottom: -1px; height: 2px; border-radius: 2px; background: var(--ed-ink); animation: ed-fade-up .2s var(--ed-ease) both; }
.ed-group { border-bottom: 1px solid var(--ed-line); }
.ed-group > summary { display: flex; align-items: center; justify-content: space-between; padding: 13px 14px; cursor: pointer; list-style: none; user-select: none; }
.ed-group > summary::-webkit-details-marker { display: none; }
.ed-group > summary .chev { color: var(--ed-text-3); transition: transform .2s var(--ed-ease); }
.ed-group[open] > summary .chev { transform: rotate(90deg); }
.ed-group-body { display: grid; gap: 12px; padding: 0 14px 16px; animation: ed-fade-up .22s var(--ed-ease) both; }
.ed-row { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.ed-row.three { grid-template-columns: 1fr 1fr 1fr; }
.ed-row.four { grid-template-columns: repeat(4, 1fr); }
.ed-field { min-width: 0; }
.ed-field > .ed-label { margin-bottom: 4px; font-size: 11px; color: var(--ed-text-3); }
.ed-num { position: relative; display: flex; align-items: center; }
.ed-num input { padding-right: 24px; font-variant-numeric: tabular-nums; }
.ed-num span { position: absolute; right: 8px; font-size: 10.5px; color: var(--ed-text-3); pointer-events: none; }
.ed-color { display: flex; align-items: center; gap: 7px; height: 30px; padding: 0 5px 0 5px; border-radius: var(--ed-r-sm); border: 1px solid var(--ed-line); background: var(--ed-panel-2); transition: border-color .15s, box-shadow .15s; }
.ed-color:hover { border-color: var(--ed-line-2); }
.ed-color:focus-within { border-color: var(--ed-accent); box-shadow: 0 0 0 3px var(--ed-accent-soft); }
.ed-color-sw { position: relative; width: 20px; height: 20px; border-radius: 6px; flex-shrink: 0; box-shadow: inset 0 0 0 1px rgba(0,0,0,.14); background-image: linear-gradient(45deg, #d4d4d8 25%, transparent 25%, transparent 75%, #d4d4d8 75%), linear-gradient(45deg, #d4d4d8 25%, #fff 25%, #fff 75%, #d4d4d8 75%); background-size: 8px 8px; background-position: 0 0, 4px 4px; overflow: hidden; }
.ed-color-sw i { position: absolute; inset: 0; }
.ed-color-sw input { position: absolute; inset: -6px; width: 40px; height: 40px; opacity: 0; cursor: pointer; }
.ed-color input[type="text"] { flex: 1; min-width: 0; height: 100%; border: 0; background: transparent; color: var(--ed-text); font-size: 12px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; outline: none; }
.ed-swatches { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 7px; }
.ed-swatches button { width: 18px; height: 18px; border-radius: 6px; border: 0; box-shadow: inset 0 0 0 1px rgba(0,0,0,.14); cursor: pointer; transition: transform .12s var(--ed-ease); }
.ed-swatches button:hover { transform: scale(1.18); }
.ed-range { width: 100%; accent-color: var(--ed-ink); height: 18px; }
.ed-switch { position: relative; width: 34px; height: 20px; border-radius: 999px; border: 0; background: var(--ed-line-2); cursor: pointer; transition: background .2s; flex-shrink: 0; }
.ed-switch::after { content: ""; position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; border-radius: 50%; background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,.25); transition: transform .2s var(--ed-ease); }
.ed-switch[data-on="true"] { background: var(--ed-ink); }
.ed-switch[data-on="true"]::after { transform: translateX(14px); }
.ed-toggle-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; font-size: 12.5px; }
.ed-device-note { display: flex; align-items: center; gap: 8px; margin: 10px 14px 0; padding: 8px 10px; border-radius: var(--ed-r-sm); background: var(--ed-accent-soft); color: var(--ed-accent); font-size: 11.5px; font-weight: 550; }
.ed-media-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; padding: 0 14px 16px; }
.ed-media-card { position: relative; overflow: hidden; border-radius: var(--ed-r-md); border: 1px solid var(--ed-line); background: var(--ed-panel-2); aspect-ratio: 1 / 1; cursor: pointer; transition: border-color .15s, transform .15s var(--ed-ease); }
.ed-media-card:hover { border-color: var(--ed-line-2); transform: translateY(-1px); }
.ed-media-card img, .ed-media-card video, .ed-media-card .bg { width: 100%; height: 100%; object-fit: cover; display: block; background-size: cover; background-position: center; }
.ed-media-card .over { position: absolute; inset: auto 0 0 0; display: flex; align-items: center; justify-content: space-between; gap: 6px; padding: 18px 8px 7px; background: linear-gradient(transparent, rgba(0,0,0,.62)); color: #fff; font-size: 10.5px; opacity: 0; transition: opacity .15s; }
.ed-media-card:hover .over { opacity: 1; }
.ed-media-card label { display: inline-flex; align-items: center; gap: 4px; padding: 3px 7px; border-radius: 6px; background: rgba(255,255,255,.2); backdrop-filter: blur(6px); cursor: pointer; font-weight: 600; }
.ed-media-card .kind { position: absolute; top: 6px; left: 6px; padding: 2px 6px; border-radius: 6px; background: rgba(0,0,0,.55); color: #fff; font-size: 9.5px; font-weight: 600; backdrop-filter: blur(6px); }

/* the native GrapesJS layer tree that stays mounted: tighter rows, quiet icons */
.vai-ed .gjs-layers { background: transparent; }
.vai-ed .gjs-layer { background: transparent; border-bottom: 0; }
.vai-ed .gjs-layer-item { min-height: 0; margin: 1px 8px; padding: 0 6px 0 0; border-radius: 7px; background: transparent; color: var(--ed-text-2); border: 0; transition: background .12s; }
.vai-ed .gjs-layer-item:hover { background: var(--ed-hover); color: var(--ed-text); }
.vai-ed .gjs-layer-title { padding: 6px 0; margin: 0; border: 0; background: transparent; font-size: 12px; color: inherit; }
.vai-ed .gjs-layer-title-inn { padding-left: 6px; min-width: 0; }
.vai-ed .gjs-layer-name { font-weight: 550; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 150px; }
.vai-ed .gjs-layer.gjs-selected > .gjs-layer-item, .vai-ed .gjs-layer--selected > .gjs-layer-item, .vai-ed .gjs-layer.gjs-selected > .gjs-layer-title { background: var(--ed-accent-soft); color: var(--ed-accent); }
.vai-ed .gjs-layer-vis, .vai-ed .gjs-layer-caret, .vai-ed .gjs-layer-move, .vai-ed .gjs-layer-count { color: var(--ed-text-3); }
.vai-ed .gjs-layer-count { background: var(--ed-panel-2); border-radius: 6px; padding: 0 5px; font-size: 10.5px; }
.vai-ed .gjs-layer--hidden, .vai-ed .gjs-layer.gjs-hidden { opacity: .5; }
.vai-ed .gjs-layer-vis { padding: 0 6px; }
.vai-ed .gjs-layer-move { opacity: 0; transition: opacity .12s; cursor: grab; }
.vai-ed .gjs-layer-item:hover .gjs-layer-move { opacity: 1; }
.vai-ed .gjs-layer-insert { background: var(--ed-accent); height: 2px; }
.vai-ed .gjs-sm-sector, .vai-ed .gjs-sm-sectors { background: transparent; }
.vai-ed .gjs-sm-sector-title { padding: 11px 14px; font-size: 12px; font-weight: 600; letter-spacing: 0; border-bottom: 1px solid var(--ed-line); background: transparent; color: var(--ed-text); }
.vai-ed .gjs-sm-sector-caret { color: var(--ed-text-3); }
.vai-ed .gjs-sm-properties { padding: 12px 14px; }
.vai-ed .gjs-sm-label, .vai-ed .gjs-label { color: var(--ed-text-2); font-size: 11px; font-weight: 550; }
.vai-ed .gjs-field { background: var(--ed-panel-2); border: 1px solid var(--ed-line); border-radius: 8px; color: var(--ed-text); box-shadow: none; }
.vai-ed .gjs-field input, .vai-ed .gjs-field select, .vai-ed .gjs-field textarea { color: var(--ed-text); }
.vai-ed .gjs-field:focus-within { border-color: var(--ed-accent); box-shadow: 0 0 0 3px var(--ed-accent-soft); }
.vai-ed .gjs-radio-item-label { color: var(--ed-text-2); }
.vai-ed .gjs-radio-item input:checked + .gjs-radio-item-label { background: var(--ed-active); color: var(--ed-text); }
.vai-ed .gjs-sm-composite { background: var(--ed-panel-2); border-radius: 8px; }
.vai-ed .gjs-sm-clear { color: var(--ed-text-3); }
.vai-ed .gjs-clm-tags, .vai-ed .gjs-clm-tag { color: var(--ed-text); }

/* ───────── canvas ───────── */
.ed-stage { position: relative; min-width: 0; min-height: 0; flex: 1; background-color: var(--ed-bg); background-image: radial-gradient(var(--ed-dot) 1px, transparent 1px); background-size: 18px 18px; }
.vai-ed .gjs-editor { background: transparent; }
.vai-ed .gjs-cv-canvas { background: transparent; top: 0; width: 100%; height: 100%; }
.vai-ed .gjs-frame-wrapper { transition: width .35s var(--ed-ease), transform .35s var(--ed-ease); }
.vai-ed .gjs-frame { box-shadow: 0 0 0 1px var(--ed-line), var(--ed-shadow-2); background: #fff; border-radius: 3px; }
.vai-ed .gjs-cv-canvas__tools { z-index: 3; }
.vai-ed .gjs-badge { padding: 3px 8px; border-radius: 6px 6px 6px 0; background: var(--ed-accent); color: #fff; font-size: 10.5px; font-weight: 600; letter-spacing: .01em; font-family: inherit; box-shadow: var(--ed-shadow-1); }
.vai-ed .gjs-toolbar { background: var(--ed-ink); border-radius: 9px; padding: 3px; box-shadow: var(--ed-shadow-2); gap: 1px; display: flex; }
.vai-ed .gjs-toolbar-item { width: 28px; height: 26px; padding: 0; border-radius: 6px; display: inline-flex; align-items: center; justify-content: center; color: var(--ed-ink-text); opacity: .85; transition: background .12s, opacity .12s; }
.vai-ed .gjs-toolbar-item:hover { background: rgba(127,127,127,.28); opacity: 1; }
.vai-ed .gjs-toolbar-item svg { width: 14px; height: 14px; }
.vai-ed .gjs-resizer-h { border: 2px solid var(--ed-accent); background: #fff; border-radius: 3px; width: 9px; height: 9px; }
.vai-ed .gjs-placeholder-int { background: var(--ed-accent); height: 3px; border-radius: 3px; box-shadow: 0 0 0 3px var(--ed-accent-soft); }
.vai-ed .gjs-highlighter, .vai-ed .gjs-highlighter-sel { outline-color: var(--ed-accent) !important; }
.vai-ed .gjs-selected { outline-color: var(--ed-accent) !important; }
.vai-ed .gjs-dashed *[data-gjs-highlightable] { outline-color: rgba(120,120,135,.35); }
.vai-tlb-ai { display: inline-flex; align-items: center; justify-content: center; }

/* flash on whatever the AI just changed */
@keyframes vai-ai-flash { 0% { box-shadow: 0 0 0 0 rgba(122,167,255,.0); } 18% { box-shadow: 0 0 0 4px rgba(122,167,255,.55), 0 0 36px 6px rgba(197,139,255,.35); } 100% { box-shadow: 0 0 0 0 rgba(122,167,255,0); } }

/* ───────── floating ✨ and the AI sheet ───────── */
.ed-ai-orb { position: absolute; left: 14px; bottom: 16px; z-index: 40; display: inline-flex; align-items: center; gap: 8px; height: 44px; padding: 0 16px 0 12px; border: 0; border-radius: 999px; color: #fff; font-size: 12.5px; font-weight: 650; cursor: pointer; background: linear-gradient(120deg, #3b5bff, #9a5bff 45%, #ff8a5b); background-size: 200% 200%; animation: ed-orb 7s ease-in-out infinite, ed-pulse-ring 3.2s ease-out infinite; box-shadow: 0 10px 28px rgba(80, 90, 255, .35), 0 2px 6px rgba(0,0,0,.18), inset 0 0 0 1px rgba(255,255,255,.22); transition: transform .18s var(--ed-ease), box-shadow .2s, padding .2s var(--ed-ease); }
.ed-ai-orb:hover { transform: translateY(-2px) scale(1.03); box-shadow: 0 16px 36px rgba(80, 90, 255, .45), 0 2px 6px rgba(0,0,0,.2), inset 0 0 0 1px rgba(255,255,255,.3); }
.ed-ai-orb:active { transform: scale(.96); }
.ed-ai-orb .spark { display: inline-flex; line-height: 1; }
.ed-ai-sheet { position: absolute; left: 8px; width: 350px; bottom: 8px; z-index: 45; display: flex; flex-direction: column; max-height: calc(100% - 16px); height: min(640px, calc(100% - 16px)); border-radius: 18px; border: 1px solid var(--ed-line); background: var(--ed-panel); box-shadow: var(--ed-shadow-3); overflow: hidden; animation: ed-sheet-in .34s var(--ed-ease) both; transition: height .3s var(--ed-ease); }
.ed-ai-sheet.full { height: calc(100% - 16px); }
.ed-ai-sheet::before { content: ""; position: absolute; inset: 0 0 auto 0; height: 3px; background: linear-gradient(90deg, var(--ed-ai-a), var(--ed-ai-b), var(--ed-ai-c)); opacity: .9; }
.ed-ai-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 14px 12px 10px 14px; }
.ed-ai-title { display: flex; align-items: center; gap: 9px; font-size: 13.5px; font-weight: 650; letter-spacing: -.01em; }
.ed-ai-mark { display: flex; align-items: center; justify-content: center; width: 28px; height: 28px; border-radius: 9px; background: linear-gradient(135deg, #3b5bff, #9a5bff 55%, #ff8a5b); box-shadow: 0 2px 8px rgba(80,90,255,.35), inset 0 0 0 1px rgba(255,255,255,.25); }
.ed-ai-scope { display: flex; align-items: center; gap: 8px; margin: 0 14px 8px; padding: 5px 6px 5px 9px; border-radius: 10px; background: var(--ed-panel-2); border: 1px solid var(--ed-line); font-size: 11.5px; color: var(--ed-text-2); min-height: 34px; }
.ed-ai-scope .who { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--ed-text); font-weight: 600; text-align: right; }
.ed-ai-scope b { color: var(--ed-text); font-weight: 600; }
.ed-ai-feed { flex: 1; min-height: 0; overflow-y: auto; padding: 4px 14px 12px; display: flex; flex-direction: column; gap: 14px; }
.ed-ai-hello { display: flex; flex-direction: column; gap: 6px; padding: 6px 0 2px; }
.ed-ai-hello h4 { margin: 0; font-size: 18px; line-height: 1.2; font-weight: 700; letter-spacing: -.02em; }
.ed-ai-hello p { margin: 0; font-size: 12.5px; line-height: 1.55; color: var(--ed-text-2); }
.ed-ai-sugs { display: flex; flex-direction: column; gap: 6px; }
.ed-ai-sug { display: flex; align-items: center; gap: 9px; padding: 9px 11px; border-radius: 11px; border: 1px solid var(--ed-line); background: var(--ed-panel); color: var(--ed-text); font-size: 12.5px; text-align: left; cursor: pointer; transition: border-color .15s, background .15s, transform .15s var(--ed-ease); }
.ed-ai-sug:hover { border-color: var(--ed-line-2); background: var(--ed-panel-2); transform: translateX(2px); }
.ed-ai-sug span.ic { display: flex; width: 22px; height: 22px; align-items: center; justify-content: center; border-radius: 7px; background: var(--ed-panel-2); border: 1px solid var(--ed-line); font-size: 12px; flex-shrink: 0; }
.ed-ai-you { align-self: flex-end; max-width: 92%; padding: 8px 12px; border-radius: 14px 14px 4px 14px; background: var(--ed-ink); color: var(--ed-ink-text); font-size: 12.5px; line-height: 1.45; animation: ed-fade-up .25s var(--ed-ease) both; }
.ed-ai-you small { display: block; margin-top: 3px; opacity: .6; font-size: 10.5px; }
.ed-ai-reply { display: flex; flex-direction: column; gap: 9px; animation: ed-fade-up .3s var(--ed-ease) both; }
.ed-ai-reply p { margin: 0; font-size: 12.5px; line-height: 1.55; color: var(--ed-text); }
.ed-ai-changes { border: 1px solid var(--ed-line); border-radius: 12px; background: var(--ed-panel-2); overflow: hidden; }
.ed-ai-changes-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 8px 10px; border-bottom: 1px solid var(--ed-line); font-size: 11px; font-weight: 650; letter-spacing: .05em; text-transform: uppercase; color: var(--ed-text-3); }
.ed-ai-change { display: flex; align-items: flex-start; gap: 9px; width: 100%; padding: 8px 10px; border: 0; border-bottom: 1px solid var(--ed-line); background: transparent; color: var(--ed-text); font-size: 12px; line-height: 1.4; text-align: left; cursor: pointer; transition: background .12s; animation: ed-fade-up .3s var(--ed-ease) both; }
.ed-ai-change:last-child { border-bottom: 0; }
.ed-ai-change:hover { background: var(--ed-hover); }
.ed-ai-change i { flex-shrink: 0; margin-top: 1px; display: inline-flex; width: 18px; height: 18px; align-items: center; justify-content: center; border-radius: 6px; background: var(--ed-accent-soft); color: var(--ed-accent); font-style: normal; font-size: 10px; }
.ed-ai-change em { display: block; font-style: normal; color: var(--ed-text-3); font-size: 11px; margin-top: 1px; }
.ed-ai-swatch { display: inline-block; width: 11px; height: 11px; border-radius: 4px; vertical-align: -1px; margin: 0 2px; box-shadow: inset 0 0 0 1px rgba(0,0,0,.18); }
.ed-ai-actions { display: flex; gap: 6px; }
.ed-ai-think { display: flex; flex-direction: column; gap: 7px; padding: 10px 12px; border-radius: 12px; border: 1px solid var(--ed-line); background: var(--ed-panel-2); }
.ed-ai-think .bar { height: 7px; border-radius: 6px; background: linear-gradient(90deg, var(--ed-line) 20%, var(--ed-line-2) 50%, var(--ed-line) 80%); background-size: 200% 100%; animation: ed-shimmer 1.4s linear infinite; }
.ed-ai-think .step { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--ed-text-2); }
.ed-ai-think .step.done { color: var(--ed-text-3); }
.ed-ai-composer { margin: 0 10px 10px; padding: 8px; border-radius: 15px; border: 1px solid var(--ed-line-2); background: var(--ed-panel); box-shadow: var(--ed-shadow-1); transition: border-color .15s, box-shadow .15s; }
.ed-ai-composer:focus-within { border-color: var(--ed-accent); box-shadow: 0 0 0 3px var(--ed-accent-soft); }
.ed-ai-composer textarea { display: block; width: 100%; min-height: 40px; max-height: 120px; padding: 4px 6px; border: 0; outline: none; resize: none; background: transparent; color: var(--ed-text); font-family: inherit; font-size: 12.5px; line-height: 1.5; }
.ed-ai-composer textarea::placeholder { color: var(--ed-text-3); }
.ed-ai-composer-bar { display: flex; align-items: center; justify-content: space-between; gap: 6px; margin-top: 4px; }
.ed-ai-send { display: inline-flex; align-items: center; justify-content: center; width: 30px; height: 30px; border: 0; border-radius: 10px; background: var(--ed-ink); color: var(--ed-ink-text); cursor: pointer; transition: transform .12s var(--ed-ease), opacity .15s; }
.ed-ai-send:disabled { opacity: .3; cursor: default; }
.ed-ai-send:active:not(:disabled) { transform: scale(.92); }
.ed-ai-ref { display: flex; align-items: center; gap: 8px; margin: 0 4px 6px; padding: 5px; border-radius: 10px; background: var(--ed-panel-2); border: 1px solid var(--ed-line); font-size: 11px; color: var(--ed-text-2); }
.ed-ai-ref img { width: 34px; height: 34px; border-radius: 7px; object-fit: cover; }

/* preview mode */
.ed-preview-pill { position: absolute; top: 14px; left: 50%; transform: translateX(-50%); z-index: 70; display: flex; align-items: center; gap: 8px; padding: 6px 8px 6px 14px; border-radius: 999px; background: var(--ed-ink); color: var(--ed-ink-text); font-size: 12px; font-weight: 600; box-shadow: var(--ed-shadow-3); animation: ed-fade-up .3s var(--ed-ease) both; }
.ed-preview-pill .ed-seg { background: rgba(127,127,127,.2); border-color: transparent; }
.ed-preview-pill .ed-seg button { color: inherit; opacity: .75; }
.ed-preview-pill .ed-seg button[data-on="true"] { background: rgba(255,255,255,.95); color: #111; opacity: 1; box-shadow: none; }
.ed-preview-pill .ed-btn { height: 26px; background: rgba(127,127,127,.25); border-color: transparent; color: inherit; }

/* modal (publish) */
.ed-overlay { position: fixed; inset: 0; z-index: 100; background: rgba(12, 12, 16, .42); backdrop-filter: blur(6px); animation: ed-fade-up .2s ease both; }
.ed-modal { position: fixed; left: 50%; top: 50%; z-index: 101; width: min(440px, calc(100vw - 32px)); transform: translate(-50%, -50%); padding: 22px; border-radius: 20px; border: 1px solid var(--ed-line); background: var(--ed-panel); color: var(--ed-text); box-shadow: var(--ed-shadow-3); animation: ed-sheet-in .3s var(--ed-ease) both; }
`
