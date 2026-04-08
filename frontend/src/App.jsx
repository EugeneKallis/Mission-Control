import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import Crons from './pages/Crons'
import Skills from './pages/Skills'
import Kanban from './pages/Kanban'
import Settings from './pages/Settings'
import AgentGuide from './pages/AgentGuide'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/kanban" element={<Kanban />} />
        <Route path="/crons" element={<Crons />} />
        <Route path="/skills" element={<Skills />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/agent-guide" element={<AgentGuide />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
