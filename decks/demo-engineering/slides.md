---
theme: default
title: 工程週報
info: 穩定性、交付進度與下一步
transition: fade-out
colorSchema: light
presenter: dev
editor: false
mcp: false
browserExporter: true
---

<div class="eng-cover">
  <div class="eng-status"><span></span> SYSTEMS NOMINAL</div>
  <h1>工程週報</h1>
  <p>穩定性、交付進度與下一步</p>
  <code>week_41 / platform</code>
</div>

---

# 本週指標

<div class="metric-grid">
  <div><span>99.98%</span><small>API availability</small></div>
  <div><span>184 ms</span><small>p95 latency</small></div>
  <div><span>42</span><small>deployments</small></div>
  <div><span>0</span><small>sev-1 incidents</small></div>
</div>

---

# 交付進度

| 工作項目 | 狀態 | 進度 |
| --- | --- | --- |
| 統一認證流程 | 已上線 | 100% |
| 查詢快取重構 | 驗證中 | 80% |
| 跨區備援 | 開發中 | 55% |

---
layout: center
---

# 下週：把復原時間縮短一半

<div class="eng-command">$ runbook test --region all</div>
