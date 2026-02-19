# Frontend Implementation Plan

## Overview

This document outlines the implementation plan for adding a web-based frontend UI to the Product Fairy image generator. The frontend will allow users to generate product images through a browser interface instead of the command line.

## Architecture

```
┌─────────────────────┐     ┌────────────────────┐     ┌─────────────────┐
│   React Frontend    │     │   FastAPI Backend  │     │   Gemini API    │
│   (Vite + Tailwind) │ ──► │   (Python)         │ ──► │   (Google)      │
│   Port 5173         │ ◄── │   Port 8000        │ ◄── │                 │
└─────────────────────┘     └────────────────────┘     └─────────────────┘
```

**Why this architecture?**
- Backend handles Gemini API calls, keeping user API keys secure (not exposed in browser network tab)
- Reuses existing Python image generation logic from `src/generate_images.py`
- React + Vite provides fast development experience and easy extensibility for future pages

---

## User Flow

### Home Page (`/`)

**Step 1: Enter Gemini API Key**
- Text input field for API key
- Link to Google's API key documentation: https://ai.google.dev/gemini-api/docs/api-key
- API key is stored in browser session (not persisted)

**Step 2: Upload CSV**
- Drag-and-drop zone or file picker button
- Displays required CSV columns:
  - `ProductNumber` (must start with "CNC-P")
  - `GenderCode` (M, F, or U)
  - `ColorCode` (e.g., NAV, WHT, BLU)
  - `ProductName`
  - `ColorName`
  - `FlatLayPrompt`
- Shows preview of first 3 rows after upload
- Validates CSV format before allowing generation

**Step 3: Generate Images**
- "Generate Images" button becomes active after valid CSV upload
- Progress bar shows current/total images
- Real-time updates as each image completes (using Server-Sent Events)

**Step 4: View & Download Results**
- Grid display of generated images with product names
- Individual download button for each image
- "Download All as ZIP" button for batch download

---

## Files to Create

### Backend

| File | Purpose |
|------|---------|
| `backend/main.py` | FastAPI server with API endpoints |
| `backend/requirements.txt` | Python dependencies for backend |

### Frontend

| File | Purpose |
|------|---------|
| `frontend/package.json` | Node.js dependencies |
| `frontend/vite.config.js` | Vite configuration |
| `frontend/tailwind.config.js` | Tailwind CSS configuration |
| `frontend/index.html` | HTML entry point |
| `frontend/src/main.jsx` | React entry point |
| `frontend/src/App.jsx` | Main app with routing |
| `frontend/src/App.css` | Global styles |
| `frontend/src/components/ApiKeyInput.jsx` | API key entry component |
| `frontend/src/components/CsvUpload.jsx` | CSV upload with drag-drop |
| `frontend/src/components/ImageGallery.jsx` | Generated images display |
| `frontend/src/components/ProgressBar.jsx` | Generation progress indicator |

---

## API Endpoints

### `POST /api/validate-csv`

Validates uploaded CSV file format.

**Request:**
- Multipart form with CSV file

**Response:**
```json
{
  "valid": true,
  "row_count": 25,
  "columns": ["ProductNumber", "GenderCode", ...],
  "preview": [
    {"ProductNumber": "CNC-P1000", "ProductName": "Performance Polo", ...}
  ],
  "errors": []
}
```

### `POST /api/generate`

Generates images from CSV using provided API key. Uses Server-Sent Events (SSE) for real-time progress.

**Request:**
- Multipart form with CSV file
- Header: `X-Gemini-API-Key`

**SSE Response Stream:**
```
event: progress
data: {"current": 1, "total": 25, "product": "CNC-P1000", "status": "generating"}

event: complete
data: {"current": 1, "total": 25, "product": "CNC-P1000", "image_url": "/api/images/CNCP1000MNAV.jpg"}

event: done
data: {"success": 24, "failed": 1, "total": 25}
```

### `GET /api/images/<filename>`

Serves generated image files.

### `GET /api/download-all`

Downloads all generated images as a ZIP file.

---

## Tech Stack

### Backend
- **FastAPI** - Modern async Python web framework
- **python-multipart** - File upload handling
- **google-genai** - Gemini API client (existing)
- **pandas** - CSV processing (existing)

### Frontend
- **React 18** - UI component library
- **Vite** - Fast build tool and dev server
- **Tailwind CSS** - Utility-first CSS framework
- **axios** - HTTP client for API calls
- **react-dropzone** - Drag-and-drop file upload

---

## Implementation Phases

### Phase 1: Backend Setup
1. Create `backend/` directory structure
2. Set up FastAPI server with CORS configuration
3. Implement CSV validation endpoint
4. Port image generation logic to async endpoint with SSE
5. Add ZIP download endpoint

### Phase 2: Frontend Setup
1. Initialize Vite + React project
2. Configure Tailwind CSS
3. Set up project structure and routing

### Phase 3: Build UI Components
1. `ApiKeyInput` - Input with validation and help link
2. `CsvUpload` - Drag-drop zone with file preview
3. `ProgressBar` - Animated progress indicator
4. `ImageGallery` - Responsive image grid with downloads

### Phase 4: Integration & Testing
1. Connect all components to backend API
2. Implement SSE client for real-time updates
3. End-to-end testing with sample CSV

---

## Running the Application

### Start Backend
```bash
cd backend
pip install -r requirements.txt
python main.py
# Server runs on http://localhost:8000
```

### Start Frontend
```bash
cd frontend
npm install
npm run dev
# App runs on http://localhost:5173
```

---

## Future Enhancements (Out of Scope for V1)

- Additional pages for product management
- CSV template generator/builder
- Prompt customization interface
- Image editing/regeneration
- User accounts and saved sessions
