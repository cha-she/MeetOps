import { lazy, Suspense } from "react";
import { Routes, Route } from "react-router-dom";
import Layout from "./components/Layout";
import { ListSkeleton } from "./components/ui";

// Pages are code-split so the initial bundle stays small.
const Dashboard = lazy(() => import("./pages/Dashboard"));
const UploadMeeting = lazy(() => import("./pages/UploadMeeting"));
const Meetings = lazy(() => import("./pages/Meetings"));
const MeetingDetail = lazy(() => import("./pages/MeetingDetail"));
const Tasks = lazy(() => import("./pages/Tasks"));
const Decisions = lazy(() => import("./pages/Decisions"));
const Risks = lazy(() => import("./pages/Risks"));
const Insights = lazy(() => import("./pages/Insights"));
const SearchPage = lazy(() => import("./pages/Search"));
const NotFound = lazy(() => import("./pages/NotFound"));

export default function App() {
  return (
    <Layout>
      <Suspense fallback={<ListSkeleton rows={3} />}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/upload" element={<UploadMeeting />} />
          <Route path="/meetings" element={<Meetings />} />
          <Route path="/meetings/:id" element={<MeetingDetail />} />
          <Route path="/tasks" element={<Tasks />} />
          <Route path="/decisions" element={<Decisions />} />
          <Route path="/risks" element={<Risks />} />
          <Route path="/insights" element={<Insights />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </Layout>
  );
}
