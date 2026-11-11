// Copyright (c) 2026 Nishant. All rights reserved. See LICENSE.
import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import './styles.css';

console.info(
  `%cGRIT Interview Scheduling%c\nBuilt by ${__BUILD_AUTHOR__} as a hiring assignment (${__BUILD_TIME__}).\nProprietary code. Copying or reuse without a written licence is not permitted.`,
  'font-weight:700;font-size:13px',
  'color:#666',
);

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
