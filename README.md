# Product Fairy

A full-stack web app that generates professional product images using Google's Gemini AI. Upload a CSV of your product catalog or describe a store from scratch, and Product Fairy generates e-commerce-ready images for every product and color variant.

## Features

- **Two Modes**
  - **CSV Upload** - Bring your own product catalog CSV with prompts and generate images in batch
  - **Store Builder** - Describe a store concept and let Gemini generate a brand, product catalog, and images from scratch (supports reference file uploads: images, PDFs, text)
- **Color Consistency** - Products are grouped by product number; the first color variant becomes a reference image so subsequent variants maintain the same design
- **Per-Image Regeneration** - Hover any image and click regenerate to re-roll a single product without restarting the batch
- **Session Recovery** - If the browser tab closes mid-generation, a resume banner lets you pick up where you left off
- **Cancel Generation** - Stop a running batch at any time
- **IndexedDB Persistence** - Generated images are stored in the browser so they survive page refreshes
- **CSV Export** - Download the generated product catalog as a CSV from the Store Builder review screen
- **Batch Download** - Download all generated images as a ZIP
- **Real-Time Progress** - SSE streaming shows per-image progress with a visual progress bar
- **Retry Logic** - Exponential backoff on API failures (up to 3 attempts per image)

## Project Structure

```
product-fairy/
├── backend/
│   ├── main.py                # FastAPI server (all endpoints)
│   └── requirements.txt       # Python dependencies
├── frontend/
│   ├── src/
│   │   ├── App.jsx            # Main app with state management
│   │   ├── lib/
│   │   │   └── imageDb.js     # IndexedDB persistence layer
│   │   ├── hooks/
│   │   │   └── useLocalStorage.js
│   │   └── components/
│   │       ├── ApiKeyInput.jsx
│   │       ├── CsvUpload.jsx
│   │       ├── ImageGallery.jsx
│   │       ├── ModeSelector.jsx
│   │       ├── PhotoStyleSelector.jsx
│   │       ├── ProductEditor.jsx
│   │       ├── ProductTable.jsx
│   │       ├── ProgressBar.jsx
│   │       └── StoreBuilder.jsx
│   ├── package.json
│   └── vite.config.js
├── pyproject.toml
└── README.md
```

## Prerequisites

- Python 3.9+
- Node.js 18+
- ffmpeg (for PNG-to-JPG conversion)
- A [Google Gemini API key](https://aistudio.google.com/apikey)

### Install ffmpeg

**macOS:**
```bash
brew install ffmpeg
```

**Ubuntu/Debian:**
```bash
sudo apt update && sudo apt install ffmpeg
```

## Setup

### Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### Frontend

```bash
cd frontend
npm install
```

## Running

Start both the backend and frontend:

```bash
# Terminal 1 - Backend (port 8000)
cd backend
source venv/bin/activate
uvicorn main:app --reload --port 8000

# Terminal 2 - Frontend (port 5173)
cd frontend
npm run dev
```

Open http://localhost:5173 in your browser.

## Usage

### CSV Upload Mode

1. Enter your Gemini API key
2. Upload a CSV with these columns:
   - `ProductNumber` - e.g. `CNC-P1000` (must start with `CNC-P`)
   - `GenderCode` - `M`, `F`, or `U`
   - `ColorCode` - Short code like `NAV`, `WHT`, `BLK`
   - `ProductName` - Product display name
   - `ColorName` - Full color name
   - `FlatLayPrompt` - The image generation prompt
3. Click **Generate Images**
4. Download individually or as a ZIP

### Store Builder Mode

1. Enter your Gemini API key
2. Describe the store you want to create (optionally upload reference images/docs)
3. Set the number of products to generate
4. Review and edit the generated brand concept and product catalog
5. Choose a photo style for the images
6. Generate and download

### Filename Format

Output images are named `{ProductNumber}{GenderCode}{ColorCode}.jpg` with dashes stripped from the product number. For example, `CNC-P1000` + `M` + `NAV` becomes `CNCP1000MNAV.jpg`.

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/validate-csv` | Validate a CSV file |
| `POST` | `/api/generate` | Generate images from CSV (SSE stream) |
| `POST` | `/api/generate-store` | Generate brand + catalog from description (SSE stream) |
| `POST` | `/api/generate-from-products` | Generate images from a products array (SSE stream) |
| `POST` | `/api/regenerate-single` | Regenerate one image |
| `GET`  | `/api/download-all` | Download all images as ZIP |
| `GET`  | `/api/download/{filename}` | Download a single image |

## Tech Stack

- **Backend**: FastAPI, Google Gemini AI (`gemini-2.5-flash-image`), pandas, ffmpeg
- **Frontend**: React 19, Vite 7, Tailwind CSS 4, IndexedDB (via `idb`)
