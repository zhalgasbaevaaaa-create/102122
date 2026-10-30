import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { Nav, Footer } from './components/Nav';
import HomePage from './pages/HomePage';
import GamesPage from './pages/GamesPage';
import GamePage from './pages/GamePage';
import AuthPage from './pages/AuthPage';
import MapPage from './pages/MapPage';
import TimelinePage from './pages/TimelinePage';
import PersonsPage from './pages/PersonsPage';
import PersonPage from './pages/PersonPage';
import EncyclopediaPage from './pages/EncyclopediaPage';
import LeaderboardPage from './pages/LeaderboardPage';
import AchievementsPage from './pages/AchievementsPage';
import ProfilePage from './pages/ProfilePage';
import TeacherPage from './pages/TeacherPage';
import AdminPage from './pages/AdminPage';
import DailyChallengePage from './pages/DailyChallengePage';
import NotFoundPage from './pages/NotFoundPage';
import { useAuth } from './lib/auth';
import { Spinner } from './components/UI';

function ScrollTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, [pathname]);
  return null;
}

function Protected({ children, roles }: { children: React.ReactNode; roles?: string[] }) {
  const { user, loading } = useAuth();
  if (loading) return <Spinner label="Тексерілуде…" />;
  if (!user) return <Navigate to="/kiru" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <div className="min-h-screen flex flex-col">
      <ScrollTop />
      <Nav />
      <main className="flex-1">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/oyyndar" element={<GamesPage />} />
          <Route path="/oyyn/:gameId" element={<GamePage />} />
          <Route path="/kiru" element={<AuthPage />} />
          <Route path="/map" element={<MapPage />} />
          <Route path="/timeline" element={<TimelinePage />} />
          <Route path="/tulgalar" element={<PersonsPage />} />
          <Route path="/tulgalar/:personId" element={<PersonPage />} />
          <Route path="/entsiklopediya" element={<EncyclopediaPage />} />
          <Route path="/reiting" element={<LeaderboardPage />} />
          <Route path="/zhetistikter" element={<AchievementsPage />} />
          <Route path="/profil" element={<Protected><ProfilePage /></Protected>} />
          <Route path="/oqytushy" element={<Protected roles={['teacher', 'admin']}><TeacherPage /></Protected>} />
          <Route path="/admin" element={<Protected roles={['admin']}><AdminPage /></Protected>} />
          <Route path="/maidan/kundelik" element={<Protected><DailyChallengePage /></Protected>} />
          <Route path="/kiru/*" element={<Navigate to="/kiru" replace />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </main>
      <Footer />
    </div>
  );
}
