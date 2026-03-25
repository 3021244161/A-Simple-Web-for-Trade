# Architecture Migration Plan: "Hybrid SQLite + File Assets"

This plan transitions the project from a file-system scanning architecture to a robust, database-driven system using SQLite and Python for management, while preserving the existing file structure for assets.

## 1. Project Structure & Preparation
- **Create Directories**:
  - `data/`: To store the SQLite database (`products.db`).
  - `tools/`: To store the Python management script.
- **Backend Dependencies**:
  - Install `sqlite3` in `backend/` to allow Node.js to communicate with the database.

## 2. Python Management Tool (`tools/manage_products.py`)
Develop a CLI tool to manage the lifecycle of product data.
- **Database Initialization**: Auto-create `data/products.db` and the `products` table with indices.
- **`sync` Command**:
  - Recursive scan of `scraped_data/`.
  - Read `info.json`.
  - **Stable ID Strategy**: Check if `id` exists in `info.json`. If not, generate a UUID, write it back to `info.json`, and then upsert to SQLite. This ensures IDs persist across folder renames.
  - Image paths stored as relative URLs (e.g., `/images/Category/Product/img.jpg`).
- **CRUD Commands**: `add`, `edit` (update DB fields), `delete` (remove from DB), `search`.

## 3. Backend Refactoring (Node.js)
Switch `backend/index.js` from file scanning to SQL queries.
- **Database Connection**: Open connection to `../data/products.db` on startup.
- **New API Endpoints**:
  - `GET /api/categories`: Query distinct categories.
  - `GET /api/products`: Accept `category`, `keyword` (LIKE query), `page` params.
  - `GET /api/product/:id`: Fetch specific product details.
- **Static Files**: Retain `app.use('/images', ...)` to serve raw files from `scraped_data`.

## 4. Frontend Refactoring (React)
Update `frontend/src/pages/Products.jsx` to consume the new API structure.
- **State Management**: Separate `categories` list and `products` list.
- **Logic Change**:
  - Load categories on mount.
  - Load products when a category is selected or search term is entered.
  - "Load More" or Pagination support (if needed, or just infinite scroll).
- **Search**: Implement server-side search via the new API.

## 5. Migration Steps
1.  **Setup**: Install dependencies and create folder structure.
2.  **Migrate Data**: Run `python tools/manage_products.py sync` to populate the initial database from existing files.
3.  **Switch Backend**: Replace `index.js` logic.
4.  **Update Frontend**: Modify React components.
5.  **Verify**: Test search, filtering, and contact forms.
