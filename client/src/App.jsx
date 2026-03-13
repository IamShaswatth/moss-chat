import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Documents from './pages/Documents.jsx';
import Products from './pages/Products.jsx';
import ChatHistory from './pages/ChatHistory.jsx';
import Suggestions from './pages/Suggestions.jsx';
import Charts from './pages/Charts.jsx';
import Telegram from './pages/Telegram.jsx';
import Layout from './components/Layout.jsx';

function App() {
    return (
        <AuthProvider>
            <BrowserRouter>
                <Routes>
                    <Route path="/login" element={<Navigate to="/" />} />
                    <Route path="/" element={<Layout />}>
                        <Route index element={<Dashboard />} />
                        <Route path="documents" element={<Documents />} />
                        <Route path="products" element={<Products />} />
                        <Route path="chat-history" element={<ChatHistory />} />
                        <Route path="suggestions" element={<Suggestions />} />
                        <Route path="charts" element={<Charts />} />
                        <Route path="telegram" element={<Telegram />} />
                    </Route>
                </Routes>
            </BrowserRouter>
        </AuthProvider>
    );
}

export default App;
