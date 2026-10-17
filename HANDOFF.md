# Handoff — P003 營養衝衝跑（Nutrition Runner）

- 更新時間：2026-10-18T03:25+08:00
- 更新者：Claude（逐檔讀原始碼，撰寫專案交接）
- 倉庫：https://github.com/jackeytw886/install-nutrition-runner（舊名 T2，GitHub 會自動轉址）
- 分支：main
- 本次基準 SHA：`adf1f972d931a2ec8d314736322ac8118ba1bd38`（Codex 管理整理提交）
- 核對層級：已讀全部原始碼；已執行單元測試、語法檢查與無頭瀏覽器載入測試（結果見 docs/VERIFICATION.md）；**未做真人攝影機與展場實測**。

## 1. 這是什麼

3D 城市跑酷遊戲，教小朋友均衡飲食：角色自動往前跑，三條跑道上排著食物（加分）與「垃圾食物」障礙（薯條／甜甜圈／汽水要跳、糖飲橫桿要蹲、點心列車要換道）。可用鍵盤、觸控，或**攝影機體感**（左右移動換道、小跳＝跳、蹲下＝滑行）。遊戲時間 90 秒。

教學原則寫死在設計裡：分數不換算成體脂、角色外型不因吃東西變胖變瘦；營養內容參考國健署「我的餐盤」等來源（README 有出處）。

## 2. 檔案與入口

入口是 **`dist/index.html`**，把 `dist/` 當成靜態網站根目錄。**沒有 GitHub Pages**，要放到 HTTPS 網站或用 localhost 跑（攝影機需要安全來源）：

```bash
python3 -m http.server 8000 -d dist   # 然後開 http://localhost:8000/
```

| 檔案 | 角色 | 對外名稱 |
| --- | --- | --- |
| `dist/core.js` | 純遊戲規則（無 DOM、無 WebGL）：關卡生成、跳躍、碰撞、計分 | `window.NutriCore`／CommonJS（給測試用） |
| `dist/engine.js` | 自寫的極簡 WebGL 渲染器：矩陣、光照、霧、立方體／圓柱／球等幾何 | 內部函式 |
| `dist/game.js` | 場景（三軌道商店街）、角色、食物模型、HUD、選單、音效、輸入 | `window.NutriGame` |
| `dist/pose-core.js` | 體感控制邏輯：鎖定玩家、2 秒校正、換道、跳、蹲 | `window.NutriPose`／CommonJS |
| `dist/pose-worker.js` | 在 Web Worker 執行 MediaPipe Pose Landmarker | 訊息：`init`／`options`／`frame` → `ready`／`pose`／`error` |
| `dist/camera.js`、`camera.css` | 攝影機對話框、骨架預覽、人物去背、離線資源準備 | `window.NutriCamera` |
| `dist/sw.js` | Service Worker：快取遊戲檔與固定版本 MediaPipe 資源（**不快取影像**） | 快取名 `nutri-motion-v2.0.2` |
| `dist/style.css` | 桌機／手機／全螢幕版面 | |
| `tests/core.test.cjs`、`tests/pose.test.cjs` | Node 內建測試（規則與合成骨架） | |

`index.html` 引用各檔時帶 `?v=2.0.2`；**改任何檔案都要一起改版本號**（index.html 的引用、`sw.js` 的 `VERSION` 與 `LOCAL` 清單），否則展場電腦會一直吃到舊快取。

## 3. 程式怎麼運作

- **遊戲狀態**（`core.js` 的 `Game`）：`menu → countdown → running ⇄ paused → result`。模式 `classic`「經典挑戰」（90 秒、3 次碰撞機會）與 `practice`「輕鬆練習」（不扣機會）。30 秒、60 秒後加速。
- **計分**：食物 +10、閃避 +5、連續 10 個食物 +20（碰撞歸零）、首次集滿六類 +50；經典模式完成 90 秒，剩餘機會每次 +10。最佳紀錄存在 `localStorage['nutri-run-best-v1']`（依模式分開）。
- **關卡**：`FOODS`（6 種食物對應六大類＋5 種障礙，各有 `action: jump/slide/lane`）、`LANES=[-2.6,0,2.6]`、`ROW_SPACING=22`。每組障礙至少留一條可走的地面跑道。
- **輸入**：鍵盤／觸控／體感最後都呼叫同一組 `Game` 方法：`move()`、`setLane()`、`jump()`、`slide()`、`fastDrop()`、`setCrouch()`。
- **體感流程**：`camera.js` 取攝影機影格 → `createImageBitmap` 送到 `pose-worker.js` → MediaPipe 回傳骨架 → `pose-core.js` 的 `PoseControl.update()` 產生事件（`lane`／`jump`／`crouch`／`land`／`lost`／`distance`／`calibrated`）→ 呼叫 `NutriGame`。
- **體感判定重點**（`pose-core.js`）：
  - 需要雙肩、雙髖、雙腳踝都看得到（visibility ≥ 0.55），全身入鏡。
  - 校正：站穩 2 秒、至少 10 筆樣本，取中位數當基準（髖部位置、軀幹長、雙腳高度）。
  - 換道：髖部左右偏移超過「軀幹長 × 0.75 ÷ 畫面比例」，有遲滯與 80 ms 確認。
  - 跳：髖部上升超過 `sensitivity`（預設 0.22 軀幹長）、上升速度夠快、雙腳都離地，且距上次跳 > 650 ms。
  - 蹲：髖部下降超過 0.28 軀幹長。
  - 前後距離變化太大（軀幹長比例 < 0.72 或 > 1.38）或追丟 > 1.1 秒會要求重新校正。
  - MediaPipe 的世界座標以髖部為原點，**不能拿來量離地高度**，所以用畫面座標推估。

## 4. 外部依賴

- 鍵盤／觸控玩法：**零外部依賴**，離線可玩（需支援 WebGL）。
- 攝影機玩法：`@mediapipe/tasks-vision@0.10.14`（jsDelivr）＋ `pose_landmarker_lite` 模型（Google Storage），第一次需要連網；之後可用「下載離線資源」存進 Service Worker 快取。Worker 需支援 OffscreenCanvas、WebAssembly。
- 注意：MediaPipe 版本寫死在 `pose-worker.js` 與 `sw.js` 兩處，要升級必須兩處一起改並重測。

## 5. 已知問題與待辦

- ⚠️ **真人體感準確度沒有實測紀錄**；`tests/pose.test.cjs` 只用合成骨架。展場前要實測不同身高、距離、光線。
- ⚠️ 未部署：沒有 GitHub Pages，也沒有記錄展場實際用的網址或電腦。
- 💡 若要換食物或障礙：改 `core.js` 的 `FOODS`／`FOOD_TYPES`，再到 `game.js` 的 `foodModel()` 補 3D 造型，並補測試。

## 6. 測試方式

```bash
node --test tests/core.test.cjs tests/pose.test.cjs   # 規則與體感邏輯（26 項）
node --check dist/engine.js && node --check dist/game.js
```

瀏覽器內可用 `window.NutriGame.state` 看目前狀態。攝影機流程可用 Chromium 的 `--use-fake-device-for-media-stream` 測權限與畫面，但假影像不會辨識出人。

## 7. 修改時注意

- 規則改在 `core.js`（可單元測試），畫面改在 `game.js`，不要把規則寫進繪圖程式。
- 體感參數改在 `pose-core.js`，`tests/pose.test.cjs` 要同步更新。
- 改檔後同步升版本號（見第 2 節），並重跑測試。

## 8. 版本沿革

- v2.0.2：攝影機體感（Worker＋離線快取）＋城市跑酷版（倉庫目前版本）。
- 2026-10-17：Codex 管理整理（代號 P003、由 T2 改名為 install-nutrition-runner、AI 入口文件）。
- 2026-10-18：Claude 補寫本交接（程式架構、體感判定、測試與待辦）。

## 版本定位

基準 SHA 定位本次文件修改前的程式；本次文件提交由此檔所在的 Git 提交與倉庫歷史定位，不預填同一提交自己的 SHA。
