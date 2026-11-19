import React from "react";
import { createRoot } from "react-dom/client";
import DeliveryClient from "../../app/delivery/delivery-client";
import "../../app/globals.css";

// Same original delivery React UI, served as a static Cloudflare asset.
// /api/delivery remains on the existing protected D1 Worker.
createRoot(document.getElementById("root")!).render(
  <React.StrictMode><DeliveryClient /></React.StrictMode>,
);
