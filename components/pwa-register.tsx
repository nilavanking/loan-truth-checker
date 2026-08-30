"use client";

import { useEffect, useState } from "react";

export function PwaRegister() {
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    return () => { window.removeEventListener("online", update); window.removeEventListener("offline", update); };
  }, []);
  return offline ? <div className="offline-status" role="status">Offline mode — saved pages and local loan calculations remain available.</div> : null;
}
