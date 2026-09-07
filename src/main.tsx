import './styles.css'
import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { bootstrapDocument } from './bootstrap'
import { initInstall } from './install'

bootstrapDocument()
// חייב לרוץ מוקדם — הדפדפן מציע להתקין פעם אחת, וצריך לתפוס את ההצעה
initInstall()

const el = document.getElementById('root')!
createRoot(el).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
