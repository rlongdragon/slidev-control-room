# Architecture figure prompt

This specification follows the plan → style → generate → self-critique workflow used by [paperbanana-figprompt](https://github.com/rlongdragon/paperbanana-figprompt).

```text
ROLE — expert scientific figure illustrator for a top-tier systems paper.

TASK — produce one self-contained SVG source for the Slidev Control Room architecture described below. Output only valid SVG source, with no external assets, network requests, scripts, raster images, or commentary.

CANVAS — 1600 × 900 px, 16:9, white #FFFFFF background, 56 px outer margin. The figure must remain legible when displayed at 1000 px wide in a GitHub README. Use a clean left-to-right pipeline with three softly colored zones and no caption or redundant legend inside the figure.

ELEMENTS —

1. Zone authoring, x=50 y=70 w=360 h=760, rounded rectangle radius 18, fill #F5F5DC at high lightness, stroke #D6D3B8 1.5 px. Header label "1  編輯與建置". It contains three vertically aligned process nodes:
   - author-machine: label "A 機器" with detail "標準 Slidev 專案", laptop icon, x=92 y=150 w=276 h=112, white fill, #B8B58F stroke, 10 px radius.
   - deck-source: label "decks/<id>/" with detail "slides.md · public/ · layouts/", folder/document icon, x=92 y=330 w=276 h=112, white fill, #B8B58F stroke, 10 px radius.
   - build-step: label "npm run build" with detail "安全設定 · 靜態建置 · 縮圖", gear icon, x=92 y=510 w=276 h=112, fill #FFF7E6, stroke #EAAA08 1.5 px, 10 px radius.
   - a small output pill under build-step: "上傳或同機器維護", x=128 y=675 w=204 h=38, cream-white fill and no icon.

2. Zone service, x=445 y=70 w=685 h=760, rounded rectangle radius 18, fill #E6F3FF, stroke #A9C7E8 1.5 px. Header label "2  SLIDEV CONTROL ROOM". It contains:
   - control-room: label "Express Control Room" with detail "單一 PM2 主程序", server/rack icon, x=505 y=140 w=565 h=105, white fill, #84ADFF stroke 2 px, 10 px radius.
   - static-build: label "靜態 deck" with detail "dist/slides + thumbnails", stacked documents icon, x=505 y=315 w=245 h=112, white fill, #84ADFF stroke 1.5 px, 10 px radius.
   - publication-state: cylinder label "公開狀態" with detail "data/decks.json", x=825 y=315 w=245 h=112, fill #F4F3FF, stroke #9E77ED 1.5 px.
   - route-switch: label "路由與權限控制" with detail "/release · /slides · /slide/<id>", signpost/router icon, x=505 y=505 w=285 h=125, white fill, #4A90D9 stroke 2 px, 10 px radius.
   - live-child: label "Slidev Live" with detail "最多 1 個子程序", pulse icon, x=825 y=505 w=245 h=125, fill #ECFDF3, stroke #12B76A 2 px, 10 px radius. Add a small green status pill "ON DEMAND" in its top-right corner.
   - export-route: label "Browser Exporter" with detail "瀏覽器渲染 PDF", document-PDF icon, x=665 y=690 w=245 h=88, white fill, #84ADFF stroke 1.5 px, 10 px radius.

3. Zone clients, x=1165 y=70 w=385 h=760, rounded rectangle radius 18, fill #E0F2F1, stroke #A7D7D3 1.5 px. Header label "3  管理與觀看". It contains:
   - admin: label "管理者" with detail "/slides · 公開 / 開始 / 切換", monitor-with-lock icon, x=1210 y=145 w=295 h=105, white fill, #65BEB7 stroke 1.5 px, 10 px radius.
   - presenter: label "Presenter" with detail "登入 session 控制頁碼", presenter-screen icon, x=1210 y=330 w=295 h=105, fill #FFF6ED, stroke #F79009 1.5 px, 10 px radius.
   - audience: label "觀眾畫面 × N" with detail "固定 /slide/<id>/ 連結", three-screen icon, x=1210 y=515 w=295 h=105, white fill, #65BEB7 stroke 1.5 px, 10 px radius.
   - pdf-user: label "PDF" with detail "另存於使用者瀏覽器", file-download icon, x=1210 y=690 w=295 h=88, white fill, #65BEB7 stroke 1.5 px, 10 px radius.

CONNECTIONS —

- author-machine to deck-source: vertical solid #475467 2.5 px arrow, label "編輯".
- deck-source to build-step: vertical solid #475467 2.5 px arrow, label "提交".
- build-step to static-build: left-to-right orthogonal solid #475467 3 px arrow crossing the zone boundary, label "build" in a small white pill.
- control-room to route-switch: vertical solid #475467 2.5 px arrow, label "HTTP".
- static-build to route-switch: orthogonal solid #475467 2.5 px arrow, label "靜態內容".
- publication-state to route-switch: orthogonal dashed #7F56D9 2.5 px arrow, label "可見性". Dashed purple always means auxiliary control/state, never content flow.
- admin to route-switch: right-to-left curved dashed #7F56D9 2.5 px arrow, label "控制".
- route-switch to live-child: horizontal solid #12B76A 3 px arrow, label "Start / Switch".
- route-switch to audience: curved solid #475467 3 px arrow, label "閒置：靜態簡報".
- live-child to presenter: curved bidirectional #F79009 3 px line with arrowheads at both ends, label "切頁".
- live-child to audience: curved solid #175CD3 3.5 px arrow, label "Live WebSocket 同步".
- static-build to export-route: orthogonal solid #475467 2.5 px arrow.
- export-route to pdf-user: left-to-right solid #475467 2.5 px arrow, label "window.print()".

TYPOGRAPHY — use Inter, "Noto Sans TC", "PingFang TC", sans-serif. Zone headers 18 px 750 weight, letter spacing 0.08 em; node titles 21 px 700; details 15 px 450 and #667085; edge labels 13 px 650. Code-like paths use "SFMono-Regular", Consolas, monospace. Never use serif because there are no mathematical variables.

LAYOUT — reading order is left to right. Use 52–68 px internal spacing, precise alignment, and generous whitespace. All process nodes have softened geometry. The publication state alone uses a cylinder because it is persistent storage. The static/live branch is the visual focus: grey leads to static audience delivery, green starts the on-demand process, blue carries synchronized pages, orange carries presenter commands. Use compact line labels on white rounded pills so no connector runs through text. Keep all connectors behind nodes and route curves around boxes.

CONSTRAINTS — no gradients; no heavy black outlines; no 3D perspective; no decorative cartoon objects; no caption in the SVG; no text smaller than 13 px; no text overlap; no clipped labels; no arrow crossing a node; no ambiguous line style; no repeated color legend; no product logos; no content unsupported by the described system. Do not imply one permanent process per deck. Make the single on-demand Live child visually explicit. All Traditional Chinese labels must use the exact text specified above.

VERIFY — render the SVG, inspect it at 100% and at 1000 px width, confirm every label is legible and unclipped, confirm no elements or edge labels overlap, confirm dashed purple appears only on control/state edges, confirm there is exactly one Live child node, fix any issue and re-render before returning. Include <title> and <desc> for accessibility, use role="img", and keep the file valid as a standalone SVG.
```
