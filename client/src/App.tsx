import { Route, Routes } from 'react-router'
import { Landing } from './routes/Landing'
import { Login } from './routes/Login'
import { NotFound } from './routes/NotFound'
import { Play } from './routes/Play'
import { Register } from './routes/Register'

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/play" element={<Play />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}
