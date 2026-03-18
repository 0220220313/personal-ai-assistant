# 🤖 個人 AI 助理 (Personal AI Assistant)

一個基於 **Gemini AI** 的全功能個人助理平台，支援多專案管理、知識庫、任務追蹤、報告生成，並可透過手機遠端控制 Windows 電腦。

## ✨ 功能特色

| 功能 | 說明 |
|------|------|
| 💬 **AI 對話** | 串流式回應，類 Claude 聊天介面 |
| 📚 **知識庫** | 上傳 PDF/DOCX/圖片，AI 自動分析摘要 |
| ✅ **任務看板** | Kanban 三欄式，AI 從文字自動提取任務 |
| 📊 **報告生成** | 進度報告、會議記錄、風險分析、週報 |
| 🖥️ **Windows Agent** | 手機下指令，電腦自動執行（PowerShell / 檔案操作） |
| 📱 **PWA 支援** | 可安裝到手機主畫面，隨時使用 |

## 🏗️ 技術架構

```
personal-ai-assistant/
├── backend/          # FastAPI + SQLAlchemy + Gemini API
│   ├── app/
│   │   ├── api/      # REST API 路由 (projects/chat/files/tasks/reports/agent)
│   │   ├── core/     # Gemini AI 核心邏輯
│   │   └── db/       # 資料庫模型 (SQLite)
│   └── requirements.txt
├── frontend/         # Next.js 14 + TypeScript + Tailwind CSS
│   ├── app/
│   │   ├── page.tsx              # Dashboard
│   │   ├── projects/[id]/
│   │   │   ├── chat/             # AI 對話頁面
│   │   │   ├── knowledge/        # 知識庫頁面
│   │   │   ├── tasks/            # 任務看板
│   │   │   └── reports/          # 報告生成
│   │   └── command/              # Windows Agent 指揮中心
│   ├── components/
│   │   └── layout/ProjectLayout.tsx
│   └── lib/api.ts               # API 客戶端
└── agent/            # Windows Agent (Python)
    ├── agent.py      # WebSocket 連接，執行系統指令
    └── start.bat     # Windows 啟動腳本
```

## 🚀 快速開始

### 前置需求
- Windows + WSL2
- Anaconda（建立 Python 環境）
- Node.js 18+
- Gemini API Key（[取得免費金鑰](https://aistudio.google.com/apikey)）

### 一鍵安裝

```bash
# 在 WSL 終端機執行（只需一個指令！）
bash <(curl -sL https://gist.github.com/0220220313/d1144b8963a701a57468c06a9bb95f74/raw/install.sh)
```

> 安裝完成後請編輯 `~/personal-ai-assistant/backend/.env` 填入 `GEMINI_API_KEY`

### 手動啟動

```bash
# 終端機 1：後端
conda activate ai-assistant
cd ~/personal-ai-assistant/backend
uvicorn app.main:app --reload

# 終端機 2：前端
cd ~/personal-ai-assistant/frontend
npm run dev
```

開啟瀏覽器：http://localhost:3000

### Windows Agent 啟動
在 Windows 上雙擊執行：`agent/start.bat`

（需先在 `agent/.env` 填入 `GEMINI_API_KEY` 和 `AGENT_SECRET_TOKEN`）

## ⚙️ 環境變數

### `backend/.env`
```env
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-2.0-flash
GEMINI_PRO_MODEL=gemini-1.5-pro
DATABASE_URL=sqlite+aiosqlite:///./data/assistant.db
BACKEND_URL=http://localhost:8000
FRONTEND_URL=http://localhost:3000
AGENT_SECRET_TOKEN=your_random_secret_here
```

### `agent/.env`
```env
GEMINI_API_KEY=your_gemini_api_key_here
BACKEND_WS_URL=ws://localhost:8000/api/agent/ws/agent
AGENT_SECRET_TOKEN=your_random_secret_here
```

## 📱 手機安裝（PWA）

1. 在手機 Chrome 開啟 `http://YOUR_WSL_IP:3000`
2. 點選「新增到主畫面」
3. 即可像 App 一樣使用

## 🔌 API 端點

| 方法 | 路徑 | 說明 |
|------|------|------|
| GET | `/api/projects/` | 列出所有專案 |
| POST | `/api/chat/stream` | SSE 串流對話 |
| POST | `/api/files/upload/{id}` | 上傳知識庫檔案 |
| GET | `/api/tasks/{id}` | 取得任務清單 |
| POST | `/api/reports/{id}/generate` | 生成報告 |
| POST | `/api/agent/command` | 發送 Windows 指令 |
| WS | `/api/agent/ws/agent` | Agent WebSocket |
| WS | `/api/agent/ws/monitor` | 前端監控 WebSocket |

## 🛠️ 開發

```bash
# 後端 API 文件
http://localhost:8000/docs

# 資料庫位置
backend/data/assistant.db
```

## 📦 依賴版本

**Backend:** FastAPI 0.115, SQLAlchemy 2.0, google-generativeai 0.8.3, aiosqlite 0.20

**Frontend:** Next.js 14.2, React 18, Tailwind CSS 3.4, lucide-react, react-markdown

**Agent:** websockets 13.1, google-generativeai 0.8.3

---

Made with ❤️ using Google Gemini API
