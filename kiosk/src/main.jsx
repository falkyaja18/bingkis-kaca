import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './styles.css'

// Sengaja tanpa <StrictMode> agar kamera tidak diminta dua kali saat dev
createRoot(document.getElementById('root')).render(<App />)
