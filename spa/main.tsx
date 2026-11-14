import React from "react";
import { createRoot } from "react-dom/client";
import PosApp from "../app/pos-app";
import { PwaManager } from "../app/pwa-manager";
import "../app/globals.css";

// Client-only shell: the full, original POS user interface is reused unchanged.
// Authentication, role checks and data protection remain on the existing API.
// The browser never receives database secrets or privileged credentials.
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <PosApp signedInUser={{
      id: "",
      name: "",
      email: "",
      signOutUrl: "/api/auth/logout",
    }} />
    <PwaManager />
  </React.StrictMode>,
);
