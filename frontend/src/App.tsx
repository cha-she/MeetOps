import React from "react";
import { Routes, Route } from "react-router-dom";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import UploadMeeting from "./pages/UploadMeeting";
import Meetings from "./pages/Meetings";
import MeetingDetail from "./pages/MeetingDetail";
import Tasks from "./pages/Tasks";
import Decisions from "./pages/Decisions";
import Risks from "./pages/Risks";
import Insights from "./pages/Insights";
import NotFound from "./pages/NotFound";

export default function App() {
  return React.createElement(
    Layout,
    null,
    React.createElement(
      Routes,
      null,
      React.createElement(Route, { path: "/", element: React.createElement(Dashboard) }),
      React.createElement(Route, { path: "/upload", element: React.createElement(UploadMeeting) }),
      React.createElement(Route, { path: "/meetings", element: React.createElement(Meetings) }),
      React.createElement(Route, { path: "/meetings/:id", element: React.createElement(MeetingDetail) }),
      React.createElement(Route, { path: "/tasks", element: React.createElement(Tasks) }),
      React.createElement(Route, { path: "/decisions", element: React.createElement(Decisions) }),
      React.createElement(Route, { path: "/risks", element: React.createElement(Risks) }),
      React.createElement(Route, { path: "/insights", element: React.createElement(Insights) }),
      React.createElement(Route, { path: "*", element: React.createElement(NotFound) })
    )
  );
}
