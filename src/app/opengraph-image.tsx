import { ImageResponse } from "next/og";

export const alt = "MealPrep — jedz bez zastanawiania się";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const BG = "#faf6f0";
const INK = "#2a2622";
const MUTED = "#7a716a";
const PRIMARY = "#e0803a";
const ACCENT = "#6f9a5e";
const BORDER = "#e9e1d6";

function Step({ label, tone }: { label: string; tone: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        padding: "14px 28px",
        borderRadius: 999,
        background: "#ffffff",
        border: `2px solid ${BORDER}`,
        color: tone,
        fontSize: 28,
        fontWeight: 700,
        letterSpacing: 1,
      }}
    >
      {label}
    </div>
  );
}

function Arrow() {
  return (
    <div style={{ display: "flex", color: BORDER, fontSize: 32, padding: "0 6px" }}>→</div>
  );
}

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: BG,
          backgroundImage: `radial-gradient(circle at 88% 12%, rgba(224,128,58,0.13), transparent 46%), radial-gradient(circle at 6% 94%, rgba(111,154,94,0.12), transparent 42%)`,
          padding: 72,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <div
            style={{
              display: "flex",
              width: 92,
              height: 92,
              borderRadius: 26,
              background: PRIMARY,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg width="60" height="60" viewBox="0 0 64 64">
              <path d="M14 30h36a18 18 0 0 1-36 0z" fill="#fffaf4" />
              <path d="M12 26h40" stroke="#fffaf4" strokeWidth="4" strokeLinecap="round" />
              <path
                d="M26 14c0 4 4 4 4 8M36 14c0 4 4 4 4 8"
                stroke="#fffaf4"
                strokeWidth="3"
                strokeLinecap="round"
                fill="none"
              />
            </svg>
          </div>
          <div style={{ display: "flex", fontSize: 52, fontWeight: 800, color: INK }}>
            MealPrep
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              fontSize: 86,
              fontWeight: 800,
              color: INK,
              lineHeight: 1.08,
              letterSpacing: -2,
            }}
          >
            {/* Broken by hand so the last line is not a lone "się." */}
            <div style={{ display: "flex" }}>Jedz bez</div>
            <div style={{ display: "flex" }}>zastanawiania się.</div>
          </div>
          <div style={{ display: "flex", fontSize: 34, color: MUTED, lineHeight: 1.35 }}>
            Zaplanuj raz. Ugotuj partiami. Kliknij ZJEDZONE.
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Step label="PLAN" tone={INK} />
            <Arrow />
            <Step label="PREP" tone={INK} />
            <Arrow />
            <Step label="ZJEDZONE" tone={PRIMARY} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
            <div style={{ display: "flex", fontSize: 26, color: ACCENT, fontWeight: 700 }}>
              DT 2460 kcal · 200 g B
            </div>
            <div style={{ display: "flex", fontSize: 26, color: MUTED }}>
              DNT 2360 kcal · 220 g B
            </div>
          </div>
        </div>
      </div>
    ),
    size,
  );
}
