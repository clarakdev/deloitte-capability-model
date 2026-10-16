const GREEN = "#86BC25";

/**
 * Inline AI report below a candidate row (product Frame 3 panel).
 *  open:   0..1 expansion
 *  typed:  0..1 how much of the text has been written (0 shows "Generating…")
 */
export const REPORT_H = 44; // native px of the open panel

export default function AiReportPanel({ name, open, typed, caret }) {
  const text = `${name} looks like a great fit for this role! Here's what they would bring...`;
  const n = Math.round(typed * text.length);
  return (
    <div style={{ width: 640, height: REPORT_H * open, overflow: "hidden", opacity: Math.min(1, open * 1.6) }}>
      <div
        style={{
          height: REPORT_H,
          padding: "12px 16px",
          background: "#0f0f0f",
          border: "1px solid #2a2a2a",
          borderTop: "none",
          borderBottomLeftRadius: 8,
          borderBottomRightRadius: 8,
          fontSize: 12,
          lineHeight: 1.5,
          whiteSpace: "nowrap",
        }}
      >
        {typed <= 0 ? (
          <span style={{ color: "#888" }}>Generating AI report…</span>
        ) : (
          <span style={{ color: "#c0c0c0" }}>
            {text.slice(0, n)}
            {caret && (
              <span style={{ display: "inline-block", width: 2, height: "1.05em", marginLeft: 1, background: GREEN, verticalAlign: "text-bottom" }} />
            )}
          </span>
        )}
      </div>
    </div>
  );
}
