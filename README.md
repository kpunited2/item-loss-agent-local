# Item Loss Agent

A web application for documenting and calculating insurance claims for lost, damaged, or stolen items. Uses AI-powered image recognition and web search to estimate replacement values.

NOTE: Google recently changed to custom search API feature to no longer search the full internet. After this change, the performance of this system has been severely degraded. New features from google or other services might fix this issue.

## Table of Contents
- [Quick Start with Docker](#quick-start-with-docker)
- [API Keys and Account Setup](#api-keys-and-account-setup)
- [Environment Configuration](#environment-configuration)
- [Manual Installation (Without Docker)](#manual-installation-without-docker)
- [Usage](#usage)

---

## Quick Start with Docker

### Prerequisites
- [Docker](https://docs.docker.com/get-docker/) and Docker Compose installed
- Git installed

### 1. Clone the Repository
```bash
git clone https://github.com/kpunited2/settlement-calculator.git
cd settlement-calculator
```

### 2. Set Up Environment File
Copy the example environment file and configure it (see [API Keys and Account Setup](#api-keys-and-account-setup) for details):

```bash
cp backend/.example_env backend/.env
```

Edit `backend/.env` with your actual API keys and configuration.

### 3. Run with Docker Compose
```bash
docker-compose up -d
```

This will:
- Build and start both the backend and frontend services
- Backend will be available at `http://localhost:8257`
- Frontend will be available at `http://localhost:5173`

### Docker Management Commands

**View logs:**
```bash
docker-compose logs -f
```

**Stop the application:**
```bash
docker-compose down
```

**Rebuild after code changes:**
```bash
docker-compose up -d --build
```

**Stop and remove containers:**
```bash
docker-compose down -v
```

---

## API Keys and Account Setup

You'll need to set up several Google services to run this application. Follow these steps carefully:

### 1. Google Gemini API Key

The Gemini API is used for AI-powered image recognition and item description generation.

**Steps:**
1. Go to [Google AI Studio](https://aistudio.google.com/apikey)
2. Sign in with your Google account
3. Click **"Get API Key"** or **"Create API Key"**
4. Copy the generated API key
5. Save this as `GEMINI_API_KEY` in your `.env` file

**Note:** The Gemini API has a generous free tier. Check [pricing details](https://ai.google.dev/pricing) if needed.

### 2. Google Custom Search Engine (CX ID)

NOTE: this feature from Google has been discontinued. This section will be changed once a suitable alternative has been identified 

A custom search engine is used to find replacement prices and product information online.

**Steps:**
1. Go to [Google Programmable Search Engine](https://programmablesearchengine.google.com/)
2. Click **"Add"** or **"Create"** to make a new search engine
3. For **"Sites to search"**: Select **"Search the entire web"**
4. Give it a name (e.g., "Item Replacement Search")
5. Click **"Create"**
6. After creation, click on your new search engine
7. In the "Basics" section, find the **"Search engine ID"** (starts with something like `a1b2c3d4e5f6g7h8i`)
8. Copy this ID
9. Save this as `CX` in your `.env` file

### 3. Google Search API Key

NOTE: this feature from Google has been discontinued. This section will be changed once a suitable alternative has been identified 

The Search API key allows programmatic access to Google's search functionality.

**Steps:**
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one:
   - Click the project dropdown at the top
   - Click **"New Project"**
   - Name it (e.g., "Settlement Calculator") and click **"Create"**
3. Enable the Custom Search API:
   - Go to **"APIs & Services"** → **"Library"**
   - Search for **"Custom Search API"**
   - Click on it and press **"Enable"**
4. Create API credentials:
   - Go to **"APIs & Services"** → **"Credentials"**
   - Click **"Create Credentials"** → **"API Key"**
   - Copy the generated API key
   - (Optional) Click **"Restrict Key"** and limit it to "Custom Search API" for security
5. Save this as `SEARCH_API_KEY` in your `.env` file

**Note:** Google Custom Search API has a free quota of 100 queries per day. You may need to enable billing for higher usage.

### 4. Data Directory

Specify where you want to store application data (images, database, etc.).

**For Docker (recommended):**
- The docker-compose file automatically maps `~/item_loss_agent_data` on your host to `/backend/data` in the container
- No configuration needed in `.env` unless you want a different location

**For manual installation:**
- Create a directory for data storage (e.g., `mkdir ~/item_loss_agent_data`)
- Set `DATA_DIR=/path/to/your/data/directory` in `.env`

---

## Environment Configuration

The `backend/.env` file should look like this:

```bash
# Required: Google Gemini API for AI processing
GEMINI_API_KEY=AIzaSy...your-actual-key...

# Required: Google Custom Search API for product searches
SEARCH_API_KEY=AIzaSy...your-search-key...

# Required: Custom Search Engine ID
CX=a1b2c3d4e5f6g7h8i

# Optional: Data directory (auto-configured in Docker)
DATA_DIR=/backend/data

# Optional: Search engine to use (combined, google, or ddgs)
# - combined: Uses both Google and DuckDuckGo (recommended)
# - google: Uses only Google Custom Search
# - ddgs: Uses only DuckDuckGo (free, no API key needed)
SEARCH_ENGINE=ddgs
```

### Configuration Notes:

NOTE: The google custom search API has been discontinued. Use 'ddgs' until a suitable replacement has been identified. 

- **SEARCH_ENGINE options:**
  - `combined` (recommended): Uses both Google Custom Search and DuckDuckGo for best results
  - `google`: Uses only Google Custom Search (requires API key and CX)
  - `ddgs`: Uses only DuckDuckGo (free, doesn't require SEARCH_API_KEY or CX)

- If you want to use only DuckDuckGo to avoid API costs, set `SEARCH_ENGINE=ddgs` and you can leave `SEARCH_API_KEY` and `CX` blank.

---

## Manual Installation (Without Docker)

If you prefer to run the application without Docker:

### Backend Setup

1. **Install Python 3.11+** and [uv](https://github.com/astral-sh/uv) package manager:
   ```bash
   curl -LsSf https://astral.sh/uv/install.sh | sh
   ```

2. **Set up virtual environment:**
   ```bash
   cd backend
   uv venv --python 3.11
   source .venv/bin/activate  # On Windows: .venv\Scripts\activate
   uv pip install -r requirements.lock
   uv pip install -e .
   ```

3. **Configure environment:**
   ```bash
   cp .example_env .env
   # Edit .env with your API keys
   ```

4. **Run the backend:**
   ```bash
   uvicorn app.api:app --host localhost --port 8257
   ```

### Frontend Setup

1. **Install Node.js 18+** and npm

2. **Install dependencies:**
   ```bash
   cd frontend
   npm install
   ```

3. **Run development server:**
   ```bash
   npm run dev
   ```

4. **Or build for production:**
   ```bash
   npm run build
   npm run preview -- --port 5173
   ```

---

## Usage

Once running, access the application:
- **Frontend:** http://localhost:5173
- **Backend API:** http://localhost:8257
- **API Docs:** http://localhost:8257/docs

### Workflow

1. **Create a Claim**: Start a new insurance claim in the web interface
2. **Add Items**: Upload images or manually enter item descriptions
3. **AI Processing**: The system uses Gemini AI to identify items and search for replacement prices
4. **Review & Edit**: Review AI suggestions and make any necessary corrections
5. **Generate Report**: Export your claim documentation

---

## Troubleshooting

### Port Already in Use
If ports 8257 or 5173 are already in use, you can change them in `docker-compose.yml`:
```yaml
ports:
  - "9000:8257"  # Change 8257 to any available port
```

### API Quota Exceeded
If you exceed Google's free API quotas:
- Switch to `SEARCH_ENGINE=ddgs` in `.env` to use free DuckDuckGo search
- Or enable billing in Google Cloud Console for higher limits

### Permission Denied (Data Directory)
Ensure the data directory has proper permissions:
```bash
chmod -R 755 ~/item_loss_agent_data
```

---

## Development

### Viewing Logs
```bash
# All services
docker-compose logs -f

# Backend only
docker-compose logs -f backend

# Frontend only
docker-compose logs -f frontend
```

---

## License

MIT Licensed. See [LICENSE.txt](LICENSE.txt) for details.

---

## Support

For issues and questions, please use the [GitHub Issues](https://github.com/kpunited2/settlement-calculator/issues) page.
