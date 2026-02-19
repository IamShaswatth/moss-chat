# 🌿 Moss Chat

A modern, AI-powered customer support chatbot platform built with RAG (Retrieval-Augmented Generation) and a sleek admin dashboard. This project includes a backend API, a React-based admin panel, and an embeddable chat widget.



##  Features

- **AI Chatbot**: Uses OpenRouter (Gemini, Claude, GPT) + Pinecone for RAG (Retrieval Augmented Generation).
- **Admin Dashboard**: Manage knowledge base documents (PDF upload), view chat history, and monitor analytics.
- **Embeddable Widget**: A lightweight, customizable chat widget you can add to any website.
- **AG-UI Protocol**: Standardized communication protocol for rich agentic UI experiences.
- **Modern UI**: Clean, responsive design built with React and Vanilla CSS.

---

##  Prerequisites

Before you begin, ensure you have the following installed:

1.  **Node.js**: v18 or higher
2.  **MongoDB**: Installed locally or a cloud URI (Atlas)
3.  **Pinecone Account**: For vector storage (Sign up at pinecone.io)
4.  **OpenRouter 

---

## Installation

1.  **Clone the repository**:
    ```bash
    git clone https://github.com/IamShaswatth/moss-chat.git
    cd moss-chat
    ```

2.  **Install Backend Dependencies**:
    ```bash
    npm install
    ```

3.  **Install Frontend Dependencies**:
    ```bash
    cd client
    npm install
    cd ..
    ```

---

## Environment Configuration

Create a `.env` file in the root directory (based on `.env.example` if available) and add the following keys:

```ini
# Server Configuration
PORT=3000
DATABASE_URL=mongodb://localhost:27017/moss-chat
NODE_ENV=development
JWT_SECRET=your_super_secret_jwt_key

# AI Provider Configuration (OpenRouter)
AI_PROVIDER=openrouter
OPENROUTER_API_KEY=sk-or-your-api-key-here
OPENROUTER_MODEL=google/gemini-2.0-flash-001  # or any other supported model

# Vector Database (Pinecone)
PINECONE_API_KEY=pcsk_your_pinecone_key
PINECONE_INDEX=moss-chat-index

# Embedding Configuration (Jina AI)
JINA_API_KEY=jina_your_api_key
EMBEDDING_DIMENSIONS=1024
```

> **Note:** Ensure your Pinecone index is created with **1024 dimensions** to match the Jina embeddings.

---

##  Running the Project

You need to run both the specific backend server and the frontend client.

### 1. Start the Backend Server
From the root directory:
```bash
npm run dev
# Server runs on http://localhost:3000
```
*The backend handles API requests, serves the widget script, and manages the database connection.*

### 2. Start the Admin Dashboard
Open a new terminal, navigate to `client`, and start Vite:
```bash
cd client
npm run dev
# Admin Panel runs on http://localhost:5173 (or 5174 if port is busy)
```

---

##  Testing

### Chat Widget
You can test the chat widget independently without embedding it on a site.
- Go to: **[http://localhost:3000/widget/test.html](http://localhost:3000/widget/test.html)**
- Click the chat bubble to open the widget and start chatting.

### Admin Panel
- Go to: **[http://localhost:5173](http://localhost:5173)**
- **Login**: Create an account or sign in to access the dashboard.
- **Documents**: Upload PDF files to train the chatbot.
- **Chat History**: View past conversations and analytics.

---

##  Project Structure

- **/server**: Node.js/Express backend API
  - `/routes`: API endpoints (chat, auth, documents)
  - `/services`: Logic for AI (OpenRouter), RAG (Pinecone, Embeddings), and Chunking
  - `/models`: Mongoose database schemas
- **/client**: React Admin Dashboard (Vite)
  - `/src/pages`: Dashboard, Login, Documents, ChatHistory pages
  - `/src/components`: Reusable UI components (Sidebar, StatsCard)
- **/widget**: Vanilla JS Chat Widget code
  - `widget.js`: The embeddable script
  - `test.html`: Local testing page

---

##  Contributing

1.  Fork the repository
2.  Create your feature branch (`git checkout -b feature/AmazingFeature`)
3.  Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4.  Push to the branch (`git push origin feature/AmazingFeature`)
5.  Open a Pull Request
