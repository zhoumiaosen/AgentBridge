import { ImageResponse } from "next/og";

export const alt = "AgentBridge connects businesses with personal AI.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "100%", height: "100%", background: "#faf9f6" }}>
      <svg width="480" height="480" viewBox="0 0 64 64">
        <rect width="64" height="64" rx="16" fill="#f0efeb" />
        <path d="M16 44V30a10 10 0 0 1 20 0v14M28 44V30a10 10 0 0 1 20 0v14M12 44h40" fill="none" stroke="#181818" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>,
    size,
  );
}
