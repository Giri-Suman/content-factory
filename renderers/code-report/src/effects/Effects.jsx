import React from "react";
import { AbsoluteFill, interpolate, random, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { theme } from "../theme.js";

/**
 * MOTION LAB effects.
 *
 * Every effect here is deterministic: seeded `random()` only, no Date.now,
 * no rAF, no Math.random in the frame path — same frame number always
 * produces the same pixels, or distributed rendering tears.
 *
 * Each effect is a plain component taking { text, brand, seed }. They compose:
 * an `ambient` effect can sit behind any existing scene, an `overlay` on top.
 * Nothing here modifies the existing scenes — they opt in.
 */

const t = (brand) => ({ ...theme, ...(brand || {}) });

/* ================================================================== */
/* AMBIENT — sit behind content                                        */
/* ================================================================== */

export const AuroraMesh = ({ brand, seed = 1 }) => {
  const f = useCurrentFrame();
  const c = t(brand);
  const blobs = [
    { col: c.accent, x: 20, y: 25, r: 55, sp: 0.006 },
    { col: c.blue, x: 75, y: 30, r: 48, sp: -0.008 },
    { col: c.green, x: 45, y: 78, r: 52, sp: 0.005 },
    { col: c.red, x: 82, y: 72, r: 40, sp: -0.006 },
  ];
  return (
    <AbsoluteFill style={{ background: c.bg, overflow: "hidden" }}>
      {blobs.map((b, i) => {
        const drift = Math.sin(f * b.sp + i * 1.7) * 12;
        const drift2 = Math.cos(f * b.sp * 1.3 + i) * 9;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: `${b.x + drift}%`,
              top: `${b.y + drift2}%`,
              width: `${b.r}%`,
              height: `${b.r}%`,
              transform: "translate(-50%,-50%)",
              borderRadius: "50%",
              background: `radial-gradient(circle, ${b.col}55 0%, ${b.col}00 68%)`,
              filter: "blur(60px)",
            }}
          />
        );
      })}
      <AbsoluteFill style={{ background: `radial-gradient(ellipse at center, transparent 35%, ${c.bg}cc 100%)` }} />
    </AbsoluteFill>
  );
};

export const ParticleField = ({ brand, seed = 2, count = 46 }) => {
  const f = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const c = t(brand);
  const pts = new Array(count).fill(0).map((_, i) => {
    const bx = random(`px${seed}${i}`) * width;
    const by = random(`py${seed}${i}`) * height;
    // 0.55px/frame measured as visually dead (motionEnergy 0.05) — needs
    // ~6x that to read as drift at 30fps on a 1080-wide frame.
    const sx = (random(`sx${seed}${i}`) - 0.5) * 3.4;
    const sy = (random(`sy${seed}${i}`) - 0.5) * 3.4;
    return {
      x: ((bx + sx * f) % width + width) % width,
      y: ((by + sy * f) % height + height) % height,
      r: 1.4 + random(`r${seed}${i}`) * 2.6,
    };
  });
  const links = [];
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      const d = Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y);
      if (d < width * 0.13) links.push({ a: pts[i], b: pts[j], o: 1 - d / (width * 0.13) });
    }
  }
  return (
    <AbsoluteFill style={{ background: c.bg }}>
      <svg width={width} height={height} style={{ position: "absolute" }}>
        {links.map((l, i) => (
          <line key={i} x1={l.a.x} y1={l.a.y} x2={l.b.x} y2={l.b.y} stroke={c.accent} strokeOpacity={l.o * 0.28} strokeWidth={1} />
        ))}
        {pts.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={p.r} fill={c.accent} fillOpacity={0.75} />
        ))}
      </svg>
    </AbsoluteFill>
  );
};

export const CodeRain = ({ brand, seed = 3 }) => {
  const f = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const c = t(brand);
  const CH = "01{}[]()<>/*+=;$#@&_".split("");
  const cols = Math.floor(width / 26);
  return (
    <AbsoluteFill style={{ background: c.bg, overflow: "hidden" }}>
      {new Array(cols).fill(0).map((_, i) => {
        const speed = 2.5 + random(`sp${seed}${i}`) * 5;
        const len = 9 + Math.floor(random(`ln${seed}${i}`) * 12);
        const head = ((f * speed + random(`of${seed}${i}`) * height) % (height + len * 26)) - len * 26;
        return (
          <div key={i} style={{ position: "absolute", left: i * 26, top: 0 }}>
            {new Array(len).fill(0).map((__, j) => {
              const y = head - j * 26;
              if (y < -30 || y > height) return null;
              const glyph = CH[Math.floor(random(`g${seed}${i}${j}${Math.floor(f / 4)}`) * CH.length)];
              return (
                <span
                  key={j}
                  style={{
                    position: "absolute",
                    top: y,
                    fontFamily: c.fonts.mono,
                    fontSize: 20,
                    color: j === 0 ? "#d7ffe8" : c.green,
                    opacity: j === 0 ? 1 : Math.max(0, 1 - j / len) * 0.72,
                  }}
                >
                  {glyph}
                </span>
              );
            })}
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

export const GrainNoise = ({ brand, seed = 4, warm = true }) => {
  const f = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const c = t(brand);
  const step = Math.floor(f / 2); // grain re-rolls every 2 frames, like real film
  // 320 dots @ 0.16 opacity measured as visually dead on a 1080x1920 frame.
  // Real film grain covers the plate; this needs density, not brightness.
  const dots = new Array(1400).fill(0).map((_, i) => ({
    x: random(`gx${seed}${i}${step}`) * width,
    y: random(`gy${seed}${i}${step}`) * height,
    o: 0.05 + random(`go${seed}${i}${step}`) * 0.3,
  }));
  return (
    <AbsoluteFill
      style={{
        background: warm
          ? `linear-gradient(160deg, #2a1f1a 0%, ${c.bg} 55%, #1a1512 100%)`
          : c.bg,
      }}
    >
      <svg width={width} height={height} style={{ position: "absolute" }}>
        {dots.map((d, i) => (
          <rect key={i} x={d.x} y={d.y} width={2} height={2} fill="#fff" fillOpacity={d.o} />
        ))}
      </svg>
      <AbsoluteFill style={{ boxShadow: "inset 0 0 220px rgba(0,0,0,0.75)" }} />
    </AbsoluteFill>
  );
};

export const GradientBlob = ({ brand, seed = 5 }) => {
  const f = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const c = t(brand);
  const N = 7;
  const R = Math.min(width, height) * 0.3;
  const pts = new Array(N).fill(0).map((_, i) => {
    const a = (i / N) * Math.PI * 2;
    const wob = 1 + Math.sin(f * 0.03 + i * 1.9) * 0.17 + Math.cos(f * 0.021 + i) * 0.1;
    return [width / 2 + Math.cos(a) * R * wob, height / 2 + Math.sin(a) * R * wob];
  });
  // closed catmull-rom-ish path via quadratic midpoints
  let d = `M ${(pts[0][0] + pts[N - 1][0]) / 2} ${(pts[0][1] + pts[N - 1][1]) / 2}`;
  for (let i = 0; i < N; i++) {
    const nx = pts[(i + 1) % N];
    d += ` Q ${pts[i][0]} ${pts[i][1]} ${(pts[i][0] + nx[0]) / 2} ${(pts[i][1] + nx[1]) / 2}`;
  }
  d += " Z";
  return (
    <AbsoluteFill style={{ background: c.bg }}>
      <svg width={width} height={height}>
        <defs>
          <linearGradient id="bl" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={c.accent} />
            <stop offset="100%" stopColor={c.red} />
          </linearGradient>
          <filter id="sb"><feGaussianBlur stdDeviation="26" /></filter>
        </defs>
        <path d={d} fill="url(#bl)" opacity={0.5} filter="url(#sb)" />
        <path d={d} fill="none" stroke={c.accent} strokeOpacity={0.4} strokeWidth={2} />
      </svg>
    </AbsoluteFill>
  );
};

/* ================================================================== */
/* TYPE — the highest-retention family                                 */
/* ================================================================== */

export const WordPunch = ({ text = "one word at a time", brand, holdFrames = 11 }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const c = t(brand);
  const words = String(text).split(/\s+/).filter(Boolean);
  const i = Math.min(words.length - 1, Math.floor(f / holdFrames));
  const local = f - i * holdFrames;
  const s = spring({ frame: local, fps, config: { damping: 12, mass: 0.5 } });
  return (
    <AbsoluteFill style={{ background: c.bg, alignItems: "center", justifyContent: "center" }}>
      <div
        style={{
          fontFamily: c.fonts.display,
          fontSize: 128,
          fontWeight: 900,
          color: i % 2 ? c.accent : c.text,
          transform: `scale(${0.72 + s * 0.28})`,
          opacity: Math.min(1, s * 1.6),
          letterSpacing: -3,
          textAlign: "center",
          padding: "0 6%",
        }}
      >
        {words[i]}
      </div>
    </AbsoluteFill>
  );
};

export const TextMask = ({ text = "REVEAL", brand }) => {
  const f = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const c = t(brand);
  const scale = interpolate(f, [0, 60], [1.18, 1], { extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ background: c.bg }}>
      <svg width={width} height={height}>
        <defs>
          <mask id="tm">
            <rect width={width} height={height} fill="black" />
            <text
              x="50%" y="50%" textAnchor="middle" dominantBaseline="central"
              fontFamily={c.fonts.display} fontSize={Math.min(width / (String(text).length * 0.62), height * 0.42)}
              fontWeight="900" fill="white"
            >
              {text}
            </text>
          </mask>
          <linearGradient id="tg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={c.accent}>
              <animate attributeName="stop-color" values={`${c.accent};${c.blue};${c.accent}`} dur="4s" repeatCount="indefinite" />
            </stop>
            <stop offset="100%" stopColor={c.blue} />
          </linearGradient>
        </defs>
        <g mask="url(#tm)" transform={`translate(${width / 2} ${height / 2}) scale(${scale}) translate(${-width / 2} ${-height / 2})`}>
          <rect width={width} height={height} fill="url(#tg)" />
          {new Array(16).fill(0).map((_, i) => (
            <rect key={i} x={((f * 6 + i * 140) % (width + 200)) - 100} y={0} width={40} height={height} fill="#fff" fillOpacity={0.14} />
          ))}
        </g>
      </svg>
    </AbsoluteFill>
  );
};

export const GlitchText = ({ text = "SYSTEM ERROR", brand, seed = 7 }) => {
  const f = useCurrentFrame();
  const c = t(brand);
  const burst = random(`b${seed}${Math.floor(f / 5)}`) > 0.62;
  const dx = burst ? (random(`d${seed}${f}`) - 0.5) * 22 : 0;
  const base = {
    position: "absolute",
    fontFamily: c.fonts.display,
    fontSize: 104,
    fontWeight: 900,
    letterSpacing: -2,
    whiteSpace: "nowrap",
  };
  return (
    <AbsoluteFill style={{ background: c.bg, alignItems: "center", justifyContent: "center" }}>
      <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ ...base, color: "#ff2d55", transform: `translate(${-4 - dx}px, 0)`, mixBlendMode: "screen" }}>{text}</div>
        <div style={{ ...base, color: "#00fff0", transform: `translate(${4 + dx}px, 0)`, mixBlendMode: "screen" }}>{text}</div>
        <div style={{ ...base, color: c.text, position: "relative" }}>{text}</div>
        {burst && (
          <div style={{ position: "absolute", inset: -30, background: `repeating-linear-gradient(0deg, transparent 0 3px, ${c.bg}aa 3px 5px)`, opacity: 0.5 }} />
        )}
      </div>
    </AbsoluteFill>
  );
};

export const Odometer = ({ text = "10000", label = "", brand }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const c = t(brand);
  const target = Number(String(text).replace(/[^\d.]/g, "")) || 0;
  const s = spring({ frame: f, fps, config: { damping: 26, mass: 1.1 } });
  const val = Math.round(target * s);
  return (
    <AbsoluteFill style={{ background: c.bg, alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 18 }}>
      <div style={{ fontFamily: c.fonts.mono, fontSize: 168, fontWeight: 900, color: c.accent, letterSpacing: -6, fontVariantNumeric: "tabular-nums" }}>
        {val.toLocaleString()}
      </div>
      {label ? <div style={{ fontFamily: c.fonts.display, fontSize: 34, color: c.muted, letterSpacing: 2, textTransform: "uppercase" }}>{label}</div> : null}
    </AbsoluteFill>
  );
};

/* ================================================================== */
/* TRANSITIONS — wrap any child                                        */
/* ================================================================== */

export const ZoomPunch = ({ children, brand, at = 0, strength = 0.3 }) => {
  const f = useCurrentFrame() - at;
  const { fps } = useVideoConfig();
  const s = f < 0 ? 0 : spring({ frame: f, fps, config: { damping: 14, mass: 0.4 } });
  return (
    <AbsoluteFill style={{ background: t(brand).bg, transform: `scale(${1 + strength * (1 - s)})`, opacity: Math.min(1, 0.2 + s * 1.4) }}>
      {children}
    </AbsoluteFill>
  );
};

export const WhipPan = ({ children, brand, at = 0, frames = 10 }) => {
  const f = useCurrentFrame() - at;
  const { width } = useVideoConfig();
  const p = Math.max(0, Math.min(1, f / frames));
  const x = interpolate(p, [0, 1], [width * 0.55, 0]);
  const blur = interpolate(p, [0, 0.55, 1], [26, 12, 0], { extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ background: t(brand).bg, transform: `translateX(${x}px)`, filter: `blur(${blur}px)` }}>
      {children}
    </AbsoluteFill>
  );
};

export const LightSweep = ({ children, brand, period = 90 }) => {
  const f = useCurrentFrame();
  const c = t(brand);
  const p = (f % period) / period;
  return (
    <AbsoluteFill style={{ background: c.bg, overflow: "hidden" }}>
      {children}
      <AbsoluteFill
        style={{
          background: `linear-gradient(105deg, transparent 38%, ${c.accent}2e 47%, #ffffff40 50%, ${c.accent}2e 53%, transparent 62%)`,
          transform: `translateX(${interpolate(p, [0, 1], [-120, 120])}%)`,
          pointerEvents: "none",
        }}
      />
    </AbsoluteFill>
  );
};

/* ================================================================== */
/* DIMENSIONAL + COMPARE + OVERLAY                                     */
/* ================================================================== */

export const TiltParallax = ({ children, brand, amount = 9 }) => {
  const f = useCurrentFrame();
  const c = t(brand);
  const rx = Math.sin(f * 0.019) * amount;
  const ry = Math.cos(f * 0.014) * amount;
  return (
    <AbsoluteFill style={{ background: c.bg, perspective: 1400, alignItems: "center", justifyContent: "center" }}>
      <div
        style={{
          width: "82%",
          height: "72%",
          transformStyle: "preserve-3d",
          transform: `rotateX(${rx}deg) rotateY(${ry}deg)`,
          borderRadius: 22,
          overflow: "hidden",
          background: c.panel,
          border: `1px solid ${c.panelBorder}`,
          boxShadow: `0 50px 110px rgba(0,0,0,.6), 0 0 0 1px ${c.accent}22`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {children}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: `linear-gradient(${125 + ry * 3}deg, #ffffff14 0%, transparent 45%)`,
          }}
        />
      </div>
    </AbsoluteFill>
  );
};

export const SplitBeforeAfter = ({ before, after, brand, labels = ["BEFORE", "AFTER"] }) => {
  const f = useCurrentFrame();
  const c = t(brand);
  const p = interpolate(f, [10, 55], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const Panel = ({ node, label, side }) => (
    <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: c.panel }}>
      {node || (
        <div style={{ fontFamily: c.fonts.display, fontSize: 74, fontWeight: 800, color: side ? c.accent : c.muted }}>{label}</div>
      )}
      <div
        style={{
          position: "absolute", top: 34, [side ? "right" : "left"]: 34,
          fontFamily: c.fonts.display, fontSize: 24, fontWeight: 800, letterSpacing: 3,
          color: c.bg, background: side ? c.accent : c.muted, padding: "7px 16px", borderRadius: 999,
        }}
      >
        {label}
      </div>
    </div>
  );
  return (
    <AbsoluteFill style={{ background: c.bg, overflow: "hidden" }}>
      <Panel node={before} label={labels[0]} side={0} />
      <div style={{ position: "absolute", inset: 0, clipPath: `inset(0 0 0 ${(1 - p) * 100}%)` }}>
        <Panel node={after} label={labels[1]} side={1} />
      </div>
      <div style={{ position: "absolute", top: 0, bottom: 0, left: `${(1 - p) * 100}%`, width: 4, background: c.accent, boxShadow: `0 0 26px ${c.accent}` }} />
    </AbsoluteFill>
  );
};

export const MacroVignette = ({ children, brand, pulse = true }) => {
  const f = useCurrentFrame();
  const c = t(brand);
  const k = pulse ? 1 + Math.sin(f * 0.028) * 0.035 : 1;
  return (
    <AbsoluteFill style={{ background: c.bg, overflow: "hidden" }}>
      <AbsoluteFill style={{ transform: `scale(${k})`, alignItems: "center", justifyContent: "center" }}>{children}</AbsoluteFill>
      <AbsoluteFill style={{ background: "radial-gradient(ellipse at 50% 48%, transparent 22%, rgba(0,0,0,.55) 62%, rgba(0,0,0,.9) 100%)" }} />
    </AbsoluteFill>
  );
};

export const StepChip = ({ step = 2, total = 5, label = "", brand }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const c = t(brand);
  const s = spring({ frame: f, fps, config: { damping: 15, mass: 0.5 } });
  return (
    <div
      style={{
        position: "absolute", top: "7%", left: "50%",
        transform: `translateX(-50%) translateY(${(1 - s) * -50}px)`,
        opacity: s,
        display: "flex", alignItems: "center", gap: 12,
        background: c.accent, color: c.bg, borderRadius: 999,
        padding: "12px 26px", fontFamily: c.fonts.display, fontWeight: 900, fontSize: 32, letterSpacing: 1,
        boxShadow: "0 14px 40px rgba(0,0,0,.45)",
      }}
    >
      <span>STEP {step}/{total}</span>
      {label ? <span style={{ fontWeight: 600, opacity: 0.82, fontSize: 26 }}>{label}</span> : null}
    </div>
  );
};

/* ================================================================== */
/* registry — motionLab.js effect ids map here                         */
/* ================================================================== */

export const EFFECT_COMPONENTS = {
  "aurora-mesh": AuroraMesh,
  "particle-field": ParticleField,
  "code-rain": CodeRain,
  "grain-noise": GrainNoise,
  "gradient-blob": GradientBlob,
  "word-punch": WordPunch,
  "text-mask": TextMask,
  "glitch-text": GlitchText,
  odometer: Odometer,
  "zoom-punch": ZoomPunch,
  "whip-pan": WhipPan,
  "light-sweep": LightSweep,
  "tilt-parallax": TiltParallax,
  "split-before-after": SplitBeforeAfter,
  "macro-vignette": MacroVignette,
  "step-chip": StepChip,
};

/** Preview harness: renders one effect, giving wrappers something to wrap. */
export const EffectLab = ({ effect = "aurora-mesh", text = "Motion Lab", brand }) => {
  const c = t(brand);
  const Comp = EFFECT_COMPONENTS[effect];
  if (!Comp) {
    return (
      <AbsoluteFill style={{ background: c.bg, alignItems: "center", justifyContent: "center", color: c.red, fontFamily: c.fonts.mono, fontSize: 40 }}>
        unknown effect: {effect}
      </AbsoluteFill>
    );
  }
  const WRAPS = ["zoom-punch", "whip-pan", "light-sweep", "tilt-parallax", "macro-vignette"];
  if (WRAPS.includes(effect)) {
    return (
      <Comp brand={brand}>
        <div style={{ fontFamily: c.fonts.display, fontSize: 88, fontWeight: 900, color: c.text, textAlign: "center", padding: "0 8%" }}>
          {text}
        </div>
      </Comp>
    );
  }
  if (effect === "step-chip") {
    return (
      <AbsoluteFill style={{ background: c.panel }}>
        <Comp brand={brand} step={2} total={5} label={text} />
      </AbsoluteFill>
    );
  }
  return <Comp brand={brand} text={text} />;
};
