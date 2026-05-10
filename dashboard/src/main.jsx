import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import AdminSite from './AdminSite.jsx'
import './index.css'

const isAdminSite = window.location.pathname.startsWith('/admin')
const RootComponent = isAdminSite ? AdminSite : App

ReactDOM.createRoot(document.getElementById('app')).render(
  <React.StrictMode>
    <RootComponent />
  </React.StrictMode>,
)
