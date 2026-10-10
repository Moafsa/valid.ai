# Responsive / interaction / editing / publishing regression lab

Run after ANY change to the capture engine (`apps/scanner/services/*`), the runtime (`apps/web/public/vai-runtime.js`),
the editor (`apps/web/src/components/editor`, `lib/visual-editor`) or publishing (`lib/publish.ts`, `lib/clone-document.ts`):

    tools/responsive-lab/run_regression.sh quick     # 5 screen sizes
    tools/responsive-lab/run_regression.sh full      # 12 sizes (1920 ... 320, several phones) + publishing test

What it does
1. clones the 15 synthetic pages in `tools/site-lab/www/resp/*.html` (known answers: media queries, script-set inline grids,
   script-sized cards and carousels, art-directed pictures, burger menu, viewport units, sticky/fixed, DOM rebuilt on phones,
   backgrounds, overflow, aspect-ratio, breakpoints, utility classes, FAQ/accordion/tabs/menu presses) with the REAL scanner;
2. `responsive_compare.py`: original vs clone at every width, by geometry (position/size/font/visibility of every text, picture
   and button, sideways scroll, menu button pressed for real);
3. `interactions_check.py`: real mouse presses on the clone (FAQ items, aria accordion, tabs, "ver mais", details, CTA link,
   menu button on a phone);
4. editor UI tests (`tools/ui-lab/tests/editor_guard.py`, `editor_publish.py`): Desktop edits keep the tablet/phone design,
   picture swap drops srcset/sources, publish dialog flow;
5. `regress_edit.py`: the real editor edits each clone (text, Desktop font-size, colour, picture, duplicate, new section), saves,
   and the edited copy is compared with the unedited clone at every width;
6. (full) `tools/publish-lab/run.sh`: edit -> Publicar -> public address, with the real lib code + live HTTP.

Needs: scanner + web + postgres up; fixture server: `cd tools/site-lab/www && python3 -m http.server 8099 --bind 0.0.0.0`.

Real sites: `responsive_compare.py <pairs.tsv> <outdir>` (pairs = idx, original url, clone url; `build_pairs.py` makes it from a batch
result), `resp_report.py <dir> [<dir2>]` summarizes regressions against each site's own 1440 baseline, `pair_sheet.py` makes a
side-by-side screenshot at any width. Debug helpers live in `dbg/`.
