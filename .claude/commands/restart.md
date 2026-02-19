Kill the backend (port 8000) and frontend (port 5173) processes, then restart both.

Steps:
1. Kill any process on port 8000 (backend) and port 5173 (frontend) using `lsof -i :<port> -t | xargs kill 2>/dev/null`
2. Wait briefly to ensure ports are freed
3. Start the backend in the background: `cd /Users/natashalioe/product-fairy/backend && source venv/bin/activate && uvicorn main:app --reload`
4. Start the frontend in the background: `cd /Users/natashalioe/product-fairy/frontend && npm run dev`
5. Confirm both are running by checking that the ports are listening
