import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './lib/auth';
import { ConnectionProvider } from './lib/connection';
// @ts-ignore: allow side-effect CSS import without type declarations
import './styles/index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <ConnectionProvider>
          <App />
        </ConnectionProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
