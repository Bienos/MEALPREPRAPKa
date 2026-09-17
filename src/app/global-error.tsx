"use client";

import { useEffect } from "react";

/** Last-resort boundary: replaces the whole document, so it ships its own html/body. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[app:global]", error);
  }, [error]);

  return (
    <html lang="pl">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#faf6f0",
          color: "#2a2622",
          fontFamily: "system-ui, sans-serif",
          padding: "1.5rem",
          textAlign: "center",
        }}
      >
        <div>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 800, margin: "0 0 0.5rem" }}>
            Coś poszło nie tak
          </h1>
          <p style={{ color: "#7a716a", margin: "0 0 1.5rem" }}>Spróbuj otworzyć aplikację ponownie.</p>
          <button
            type="button"
            onClick={reset}
            style={{
              minHeight: 48,
              padding: "0 1.5rem",
              borderRadius: 999,
              border: "none",
              background: "#e0803a",
              color: "#fffaf4",
              fontWeight: 700,
              fontSize: "1rem",
            }}
          >
            Spróbuj ponownie
          </button>
        </div>
      </body>
    </html>
  );
}
