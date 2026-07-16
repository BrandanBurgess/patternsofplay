import { useEffect, useState } from "react";

export default function App() {
  const [apiStatus, setApiStatus] = useState("checking");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/health")
      .then((r) => r.json())
      .then((d: { status: string }) => {
        if (!cancelled) setApiStatus(d.status);
      })
      .catch(() => {
        if (!cancelled) setApiStatus("unreachable");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main>
      <h1>Patterns of Play</h1>
      <p>API status: {apiStatus}</p>
    </main>
  );
}
