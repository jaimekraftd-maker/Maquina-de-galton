"use client";

export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ background: "#0a0910", color: "#ece8f5", fontFamily: "system-ui, sans-serif", display: "grid", placeItems: "center", minHeight: "100vh" }}>
        <div style={{ textAlign: "center" }}>
          <h1 style={{ fontSize: 20 }}>Nocturne hit an unexpected error.</h1>
          <button onClick={reset} style={{ marginTop: 16, padding: "8px 16px", borderRadius: 10, border: 0, background: "#8b65f7", color: "#fff" }}>
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
