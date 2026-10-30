import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./auth/AuthContext";
import Layout from "./components/Layout";
import { ToastProvider } from "./components/toast";
import { RowsSkeleton } from "./components/ui";
import { useTheme } from "./hooks/useTheme";
import { LoginScreen, OfflineScreen, SetupScreen, SplashScreen } from "./pages/AuthScreens";

// Pages are code-split so the initial bundle stays small.
const Home = lazy(() => import("./pages/Home"));
const Review = lazy(() => import("./pages/Review"));
const UploadMeeting = lazy(() => import("./pages/UploadMeeting"));
const Meetings = lazy(() => import("./pages/Meetings"));
const MeetingDetail = lazy(() => import("./pages/MeetingDetail"));
const Tasks = lazy(() => import("./pages/Tasks"));
const Decisions = lazy(() => import("./pages/Decisions"));
const Risks = lazy(() => import("./pages/Risks"));
const Insights = lazy(() => import("./pages/Insights"));
const Team = lazy(() => import("./pages/Team"));
const SearchPage = lazy(() => import("./pages/Search"));
const NotFound = lazy(() => import("./pages/NotFound"));

function Gate() {
  const { phase } = useAuth();
  useTheme(); // applies the saved light/dark theme

  if (phase === "loading") return <SplashScreen />;
  if (phase === "offline") return <OfflineScreen />;
  if (phase === "setup") return <SetupScreen />;
  if (phase === "signed-out") return <LoginScreen />;

  return (
    <Layout>
      <Suspense fallback={<div className="panel"><RowsSkeleton rows={5} /></div>}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/review" element={<Review />} />
          <Route path="/upload" element={<UploadMeeting />} />
          <Route path="/meetings" element={<Meetings />} />
          <Route path="/meetings/:id" element={<MeetingDetail />} />
          <Route path="/tasks" element={<Tasks />} />
          <Route path="/decisions" element={<Decisions />} />
          <Route path="/risks" element={<Risks />} />
          <Route path="/insights" element={<Insights />} />
          <Route path="/team" element={<Team />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </Layout>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <Gate />
      </ToastProvider>
    </AuthProvider>
  );
}
