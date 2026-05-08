import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import Navbar from './components/Navbar';
import HomePage from './pages/HomePage';
import ResultPage from './pages/ResultPage';
import SavedTripsPage from './pages/SavedTripsPage';
import AdminHomePage from './pages/AdminHomePage';
import AdminPage from './pages/AdminPage';
import './i18n';
import './index.css';

function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/result" element={<ResultPage />} />
          <Route path="*" element={
            <>
              <Navbar />
              <main className="main-content">
                <Routes>
                  <Route path="/" element={<HomePage />} />
                  <Route path="/saved" element={<SavedTripsPage />} />
                  <Route path="/admin" element={<AdminHomePage />} />
                  <Route path="/admin/cities" element={<AdminPage />} />
                </Routes>
              </main>
            </>
          } />
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  );
}

export default App;
