# Verification — P003 驗證方式

本次已核對：倉庫身分、預設分支、基準 SHA、檔案樹及現有文件。發布或硬體功能需由實際執行結果確認。

## 入口與環境

- 入口：`dist/index.html`。
- 依 README 的使用方式啟動；攝影機、WebSerial、語音與網路條件依該專案既有規格。
- 檢查畫面載入、主要操作、資料保存／重開後狀態，並記錄環境與可重現步驟。
- 使用實體裝置時，另外核對板卡、接線、供電、有效電位及通訊格式。

## 本次驗證結果

- 管理檔案與 JSON 結構：提交前檢查；提交後核對 Git tree 與原檔 blob。
- 功能測試：本次未執行。
- 實機與真人相機測試：本次未執行。

## 既有文件提供的檢查命令

```bash
node --test tests/core.test.cjs tests/pose.test.cjs
node --check dist/engine.js
node --check dist/game.js
```

本次僅整理管理文件，沒有修改測試或遊戲程式，也未重新執行這些檢查。

## 2026-10-18 檢查結果（Claude）

基準：`adf1f97`。環境：Node.js 22、Playwright Chromium（無頭、swiftshader 軟體繪圖）、本機 HTTP 伺服器；對外網址一律攔截。

| 項目 | 結果 |
| --- | --- |
| `<div>` 開關數量 | ✅ 63／63 |
| 重複 id | ✅ 無 |
| 內嵌 `<script>` 解析（`node --check`） | ✅ 通過（入口頁沒有內嵌腳本，各 `dist/*.js` 另行檢查） |
| 無頭瀏覽器載入 | ✅ 約 2.8 秒，無主控台錯誤 |
| 互動冒煙測試 | 按「開始」→ 狀態 `countdown` → 約 9 秒後 `running`（軟體繪圖較慢），WebGL 場景正常繪出 |
| 缺少的本機檔案 | ✅ 無 |
| 外部請求 | 無 |
| 其他 | `node --test tests/core.test.cjs tests/pose.test.cjs`：26 項全部通過；`dist/*.js` 全部 `node --check` 通過 |

未執行：實體裝置、真人相機／麥克風、展場環境與長時間運轉測試。
