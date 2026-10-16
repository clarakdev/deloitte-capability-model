import project from "../data/project.sample.json";
import { AVATAR_COLORS } from "../theme.js";
import { Badge, Card, CardHead, PageTitle } from "./ProductPage.jsx";
import { stagger } from "./util.js";

const GREEN = "#86BC25";

const initials = (title) =>
  title
    .split(" ")
    .filter((w) => /[A-Za-z]/.test(w[0]))
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

const GHOST_BTN = {
  border: "1px solid #2a2a2a",
  color: "#888888",
  fontSize: 11,
  padding: "3px 10px",
  borderRadius: 5,
};

/**
 * Simplified Project Overview page (product Frame 1).
 *  typed:  0..1 how much of the description has been typed
 *  caret:  show the blinking text caret
 *  rolesP: 0..1 staggered appearance of the role rows
 */
export default function ProjectOverview({ typed, caret, rolesP }) {
  const text = project.description;
  const n = Math.round(typed * text.length);
  const roles = project.roles;
  const shown = roles.filter((_, i) => stagger(rolesP, i, roles.length, 0.5) > 0.5).length;

  return (
    <>
      <PageTitle title={project.name} sub="Select a role to begin capability matching" />

      <Card>
        <CardHead title="Project overview" />
        <p style={{ margin: 0, fontSize: 13, color: "#cccccc", lineHeight: 1.7, minHeight: 44 }}>
          {text.slice(0, n)}
          {caret && (
            <span
              style={{
                display: "inline-block",
                width: 2,
                height: "1.1em",
                marginLeft: 1,
                background: GREEN,
                verticalAlign: "text-bottom",
              }}
            />
          )}
          <span style={{ color: "transparent" }}>{text.slice(n)}</span>
        </p>
      </Card>

      <Card style={{ marginBottom: 0 }}>
        <CardHead title="Roles required">
          {shown > 0 && <Badge kind="green">{shown} roles</Badge>}
        </CardHead>

        {roles.map((role, i) => {
          const p = stagger(rolesP, i, roles.length, 0.5);
          const c = AVATAR_COLORS[i % AVATAR_COLORS.length];
          return (
            <div
              key={role.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "12px 0",
                borderBottom: i < roles.length - 1 ? "1px solid #1f1f1f" : "none",
                opacity: p,
                transform: `translateY(${(1 - p) * 14}px)`,
              }}
            >
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: "50%",
                  background: c.bg,
                  color: c.color,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 11,
                  fontWeight: 700,
                  flexShrink: 0,
                }}
              >
                {initials(role.title)}
              </div>
              <div style={{ flex: 1, fontSize: 13, fontWeight: 600, color: "#eeeeee" }}>{role.title}</div>
              <span style={GHOST_BTN}>Edit</span>
              <span style={GHOST_BTN}>Duplicate</span>
              <span style={GHOST_BTN}>Remove</span>
              <span style={{ color: "#444", fontSize: 12, width: 14, textAlign: "center" }}>⌄</span>
            </div>
          );
        })}

        <div
          style={{
            marginTop: 14,
            display: "inline-flex",
            border: "1px dashed #2a2a2a",
            borderRadius: 6,
            padding: "7px 14px",
            fontSize: 11,
            color: "#777777",
            opacity: stagger(rolesP, roles.length - 1, roles.length, 0.5),
          }}
        >
          + Add role
        </div>
      </Card>
    </>
  );
}
