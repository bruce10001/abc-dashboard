import { Routes, Route, NavLink } from 'react-router-dom'
import StatsPage from './pages/StatsPage'
import TeslaPage from './pages/TeslaPage'

function App() {
  return (
    <div>
      <nav className="nav">
        <NavLink to="/" className={({ isActive }) => isActive ? 'active' : ''}>
          ABC Stats
        </NavLink>
        <NavLink to="/tesla" className={({ isActive }) => isActive ? 'active' : ''}>
          Tesla Voting
        </NavLink>
      </nav>
      <div className="container">
        <Routes>
          <Route path="/" element={<StatsPage />} />
          <Route path="/tesla" element={<TeslaPage />} />
        </Routes>
      </div>
    </div>
  )
}

export default App
