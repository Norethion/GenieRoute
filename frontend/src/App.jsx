import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import Navbar from './components/Navbar';
import HomePage from './pages/HomePage';
import ResultPage from './pages/ResultPage';
import SavedTripsPage from './pages/SavedTripsPage';
import SavedPlacesPage from './pages/SavedPlacesPage';
import PreferencesPage from './pages/PreferencesPage';
import AdminHomePage from './pages/AdminHomePage';
import AdminPage from './pages/AdminPage';
import UsagePage from './pages/UsagePage';
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
                  <Route path="/saved-places" element={<SavedPlacesPage />} />
                  <Route path="/preferences" element={<PreferencesPage />} />
                  <Route path="/admin" element={<AdminHomePage />} />
                  <Route path="/admin/cities" element={<AdminPage />} />
                  <Route path="/usage" element={<UsagePage />} />
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
