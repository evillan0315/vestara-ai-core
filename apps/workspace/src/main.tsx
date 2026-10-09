import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider, installAuthFetch } from './lib/auth';
import { ConnectionProvider } from './lib/connection';
import { loadApiBaseFromStorage } from './lib/clientConfig';
import './styles/index.css';

loadApiBaseFromStorage();
installAuthFetch();

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
