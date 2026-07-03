import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, AreaChart, Area,
} from "recharts";
import {
  RefreshCw, ArrowUp, ArrowDown, Minus, Waves, AlertCircle, Download,
} from "lucide-react";

/* ---------------------------------------------------------------------- */
/*  Config                                                                 */
/* ---------------------------------------------------------------------- */

const COUNTRIES = [
  { code: "SAU", name: "Saudi Arabia",           short: "KSA", color: "#C99A3E" },
  { code: "ARE", name: "United Arab Emirates",   short: "UAE", color: "#3E8E8A" },
  { code: "QAT", name: "Qatar",                  short: "QAT", color: "#A85C3E" },
  { code: "KWT", name: "Kuwait",                 short: "KWT", color: "#7A8A3E" },
  { code: "BHR", name: "Bahrain",                short: "BHR", color: "#4E6B8A" },
  { code: "OMN", name: "Oman",                   short: "OMN", color: "#8A4E7A" },
];

const INDICATOR_GROUPS = [
  {
    id: "output",
    label: "Output & Growth",
    indicators: [
      { code: "NY.GDP.MKTP.CD",    label: "GDP (current US$)",           format: "currency" },
      { code: "NY.GDP.MKTP.KD.ZG", label: "GDP growth (annual %)",       format: "percent" },
      { code: "NY.GDP.PCAP.CD",    label: "GDP per capita (current US$)",format: "currencySmall" },
    ],
  },
  {
    id: "prices",
    label: "Prices & Labor",
    indicators: [
      { code: "FP.CPI.TOTL.ZG", label: "Inflation, consumer prices (annual %)", format: "percent" },
      { code: "SL.UEM.TOTL.ZS", label: "Unemployment (% of labor force)",       format: "percent" },
    ],
  },
  {
    id: "external",
    label: "External Sector",
    indicators: [
      { code: "NE.TRD.GNFS.ZS",       label: "Trade (% of GDP)",                    format: "percent" },
      { code: "BN.CAB.XOKA.GD.ZS",    label: "Current account balance (% of GDP)",  format: "percent" },
      { code: "BX.KLT.DINV.WD.GD.ZS", label: "FDI, net inflows (% of GDP)",         format: "percent" },
    ],
  },
  {
    id: "fiscal",
    label: "Fiscal & Resources",
    indicators: [
      { code: "NY.GDP.PETR.RT.ZS", label: "Oil rents (% of GDP)", format: "percent" },
      { code: "SP.POP.TOTL",       label: "Population, total",    format: "population" },
      { code: "SP.POP.GROW",       label: "Population growth (annual %)", format: "percent" },
    ],
  },
  {
    id: "diversification",
    label: "Diversification",
    indicators: [
      { code: "NV.IND.MANF.ZS",   label: "Manufacturing, value added (% of GDP)", format: "percent" },
      { code: "NV.SRV.TOTL.ZS",   label: "Services, value added (% of GDP)",      format: "percent" },
      { code: "ST.INT.RCPT.XP.ZS",label: "Tourism receipts (% of total exports)", format: "percent" },
    ],
  },
];

const ALL_INDICATORS = INDICATOR_GROUPS.flatMap((g) => g.indicators);
const INDICATOR_MAP = Object.fromEntries(ALL_INDICATORS.map((i) => [i.code, i]));
const DEFAULT_INDICATOR = "NY.GDP.MKTP.KD.ZG";

/* ---------------------------------------------------------------------- */
/*  Helpers                                                                */
/* ---------------------------------------------------------------------- */

function formatValue(value, format) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  switch (format) {
    case "currency": {
      const abs = Math.abs(value);
      if (abs >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
      if (abs >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
      return `$${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
    }
    case "currencySmall":
      return `$${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
    case "percent":
      return `${value.toFixed(1)}%`;
    case "population": {
      const abs = Math.abs(value);
      if (abs >= 1e6) return `${(value / 1e6).toFixed(2)}M`;
      if (abs >= 1e3) return `${(value / 1e3).toFixed(1)}K`;
      return value.toLocaleString();
    }
    default:
      return value.toLocaleString();
  }
}

function parseRecords(records) {
  const byCountry = {};
  records.forEach((r) => {
    const cc = r.countryiso3code;
    if (!cc) return;
    if (!byCountry[cc]) byCountry[cc] = [];
    if (r.value !== null && r.value !== undefined) {
      byCountry[cc].push({ year: parseInt(r.date, 10), value: r.value });
    }
  });
  Object.values(byCountry).forEach((arr) => arr.sort((a, b) => a.year - b.year));
  return byCountry;
}

function getLatest(series) {
  if (!series || series.length === 0) return null;
  return series[series.length - 1];
}
function getPrior(series) {
  if (!series || series.length < 2) return null;
  return series[series.length - 2];
}

function formatDelta(delta, format) {
  if (delta === null || delta === undefined || Number.isNaN(delta)) return null;
  const sign = delta >= 0 ? "+" : "−";
  const abs = Math.abs(delta);
  if (format === "percent") return `${sign}${abs.toFixed(1)} pts`;
  return `${sign}${formatValue(abs, format)}`;
}

// Sums summable stocks/flows (GDP, population); averages rates (%, per-capita).
function computeAggregate(selectedData, format) {
  const result = {};
  if (!selectedData) return result;
  const years = new Set();
  Object.values(selectedData).forEach((arr) => arr.forEach((p) => years.add(p.year)));
  Array.from(years).forEach((year) => {
    const vals = COUNTRIES
      .map((c) => (selectedData[c.code] || []).find((p) => p.year === year)?.value)
      .filter((v) => v !== undefined && v !== null);
    if (vals.length === 0) return;
    const sum = vals.reduce((a, b) => a + b, 0);
    result[year] = format === "currency" || format === "population" ? sum : sum / vals.length;
  });
  return result;
}

function generateInsights(selectedData, meta) {
  const rows = COUNTRIES
    .map((c) => ({
      country: c,
      latest: getLatest(selectedData?.[c.code]),
      prior: getPrior(selectedData?.[c.code]),
    }))
    .filter((r) => r.latest);

  if (rows.length < 2) return [];

  const ranked = [...rows].sort((a, b) => b.latest.value - a.latest.value);
  const leader = ranked[0];
  const laggard = ranked[ranked.length - 1];
  const avg = rows.reduce((s, r) => s + r.latest.value, 0) / rows.length;
  const withDelta = rows.filter((r) => r.prior).map((r) => ({ ...r, delta: r.latest.value - r.prior.value }));
  const mostImproved = withDelta.length ? [...withDelta].sort((a, b) => b.delta - a.delta)[0] : null;
  const mostDeclined = withDelta.length ? [...withDelta].sort((a, b) => a.delta - b.delta)[0] : null;

  const insights = [];
  insights.push(
    `${leader.country.name} leads the bloc at ${formatValue(leader.latest.value, meta.format)} ` +
    `(${leader.latest.year}); ${laggard.country.name} is lowest at ${formatValue(laggard.latest.value, meta.format)}.`
  );

  if (meta.format === "percent") {
    insights.push(`That's a spread of ${(leader.latest.value - laggard.latest.value).toFixed(1)} percentage points across the six economies.`);
  } else if (laggard.latest.value > 0) {
    insights.push(`${leader.country.name} is roughly ${(leader.latest.value / laggard.latest.value).toFixed(1)}× ${laggard.country.name} on this measure.`);
  }

  insights.push(`GCC average across reporting countries: ${formatValue(avg, meta.format)}.`);

  if (mostImproved && mostImproved.delta > 0) {
    insights.push(`${mostImproved.country.name} posted the largest year-over-year gain, ${formatDelta(mostImproved.delta, meta.format)}.`);
  }
  if (mostDeclined && mostDeclined.delta < 0 && mostDeclined.country.code !== mostImproved?.country.code) {
    insights.push(`${mostDeclined.country.name} recorded the steepest year-over-year decline, ${formatDelta(mostDeclined.delta, meta.format)}.`);
  }
  return insights;
}

function stdDev(values) {
  if (!values || values.length < 2) return null;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function latestVal(data, code, country) {
  return getLatest(data?.[code]?.[country])?.value ?? null;
}

function computeHeroStats(data, status) {
  const gdp = data["NY.GDP.MKTP.CD"];
  const growth = data["NY.GDP.MKTP.KD.ZG"];
  const inflation = data["FP.CPI.TOTL.ZG"];
  const oil = data["NY.GDP.PETR.RT.ZS"];
  const ready = status["NY.GDP.MKTP.CD"] === "done" && status["NY.GDP.MKTP.KD.ZG"] === "done"
    && status["FP.CPI.TOTL.ZG"] === "done" && status["NY.GDP.PETR.RT.ZS"] === "done";
  if (!ready) return null;

  const gdpVals = COUNTRIES.map((c) => getLatest(gdp?.[c.code])?.value).filter((v) => v != null);
  const gccGDP = gdpVals.length ? gdpVals.reduce((a, b) => a + b, 0) : null;

  const growthRows = COUNTRIES.map((c) => ({ c, v: getLatest(growth?.[c.code])?.value }))
    .filter((r) => r.v != null);
  const avgGrowth = growthRows.length ? growthRows.reduce((s, r) => s + r.v, 0) / growthRows.length : null;
  const bestPerformer = growthRows.length
    ? growthRows.reduce((a, b) => (b.v > a.v ? b : a))
    : null;

  const inflationVals = COUNTRIES.map((c) => getLatest(inflation?.[c.code])?.value).filter((v) => v != null);
  const avgInflation = inflationVals.length ? inflationVals.reduce((a, b) => a + b, 0) / inflationVals.length : null;

  const oilVals = COUNTRIES.map((c) => getLatest(oil?.[c.code])?.value).filter((v) => v != null);
  const avgOil = oilVals.length ? oilVals.reduce((a, b) => a + b, 0) / oilVals.length : null;
  const oilLabel = avgOil == null ? null : avgOil > 20 ? "High" : avgOil > 10 ? "Medium" : "Low";

  const volRows = COUNTRIES.map((c) => {
    const vals = (growth?.[c.code] || []).slice(-10).map((p) => p.value);
    return { c, vol: stdDev(vals) };
  }).filter((r) => r.vol != null);
  const mostVolatile = volRows.length ? volRows.reduce((a, b) => (b.vol > a.vol ? b : a)) : null;

  return { gccGDP, avgGrowth, avgInflation, avgOil, oilLabel, bestPerformer, mostVolatile };
}

// Transparent, disclosed thresholds — see Methodology tab.
const RISK_RULES = [
  { key: "oil", label: "High oil dependence", code: "NY.GDP.PETR.RT.ZS", test: (v) => v > 20 },
  { key: "inflation", label: "Inflation pressure", code: "FP.CPI.TOTL.ZG", test: (v) => v > 5 },
  { key: "growth", label: "Growth slowdown", code: "NY.GDP.MKTP.KD.ZG", test: (v) => v < 1 },
  { key: "fdi", label: "Weak FDI inflows", code: "BX.KLT.DINV.WD.GD.ZS", test: (v) => v < 1 },
  { key: "cab", label: "External deficit", code: "BN.CAB.XOKA.GD.ZS", test: (v) => v < 0 },
  { key: "pop", label: "Slow population growth", code: "SP.POP.GROW", test: (v) => v < 1 },
];

function getRiskFlags(data, countryCode) {
  return RISK_RULES
    .map((rule) => {
      const v = latestVal(data, rule.code, countryCode);
      return v != null && rule.test(v) ? { ...rule, value: v } : null;
    })
    .filter(Boolean);
}

function downloadText(filename, text, mime = "text/csv") {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function buildComparisonCSV(data, status) {
  const rows = [["Indicator", "Indicator code", "Country", "Latest value", "Year"]];
  ALL_INDICATORS.forEach((ind) => {
    if (status[ind.code] !== "done") return;
    COUNTRIES.forEach((c) => {
      const latest = getLatest(data[ind.code]?.[c.code]);
      rows.push([ind.label, ind.code, c.name, latest ? latest.value : "", latest ? latest.year : ""]);
    });
  });
  return rows.map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
}
  const countryCodes = COUNTRIES.map((c) => c.code).join(";");
  const url = `https://api.worldbank.org/v2/country/${countryCodes}/indicator/${code}?format=json&per_page=2000&date=1995:2025`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  if (!Array.isArray(json) || !json[1]) throw new Error("Unexpected response shape");
  return json[1];
}

/* ---------------------------------------------------------------------- */
/*  Small visual pieces                                                    */
/* ---------------------------------------------------------------------- */

function MiniSkyline({ series, color, globalMin, globalMax }) {
  const pts = (series || []).slice(-12);
  const w = 84, h = 34, gap = 2;
  const barW = pts.length ? (w - gap * (pts.length - 1)) / pts.length : w;
  const range = globalMax - globalMin || 1;

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="gcc-skyline">
      {pts.map((p, i) => {
        const ratio = Math.max(0.06, (p.value - globalMin) / range);
        const barH = Math.max(2, ratio * (h - 2));
        const x = i * (barW + gap);
        const y = h - barH;
        return (
          <rect
            key={p.year}
            x={x}
            y={y}
            width={barW}
            height={barH}
            rx={0.6}
            fill={color}
            opacity={0.45 + 0.55 * (i / Math.max(1, pts.length - 1))}
          />
        );
      })}
    </svg>
  );
}

function TrendArrow({ latest, prior }) {
  if (!latest || !prior) return <Minus size={13} className="gcc-trend-flat" />;
  const diff = latest.value - prior.value;
  if (Math.abs(diff) < 1e-9) return <Minus size={13} className="gcc-trend-flat" />;
  return diff > 0
    ? <ArrowUp size={13} className="gcc-trend-up" />
    : <ArrowDown size={13} className="gcc-trend-down" />;
}

function EconomicWeight({ gdpData, gdpStatus }) {
  if (gdpStatus !== "done" || !gdpData) {
    return (
      <div className="gcc-card">
        <div className="gcc-card-head">
          <h2 className="gcc-card-title">Economic weight within the GCC</h2>
          <span className="gcc-card-note">Share of combined GDP</span>
        </div>
        <div className="gcc-weight-loading">Loading regional GDP weights…</div>
      </div>
    );
  }
  const rows = COUNTRIES
    .map((c) => {
      const latest = getLatest(gdpData[c.code]);
      return { country: c, value: latest ? latest.value : 0, year: latest?.year };
    })
    .filter((r) => r.value > 0)
    .sort((a, b) => b.value - a.value);
  const total = rows.reduce((s, r) => s + r.value, 0);
  const year = rows[0]?.year;

  return (
    <div className="gcc-card">
      <div className="gcc-card-head">
        <h2 className="gcc-card-title">Economic weight within the GCC</h2>
        <span className="gcc-card-note">Share of combined GDP · {year}</span>
      </div>
      <div className="gcc-weight-bar">
        {rows.map((r) => (
          <div
            key={r.country.code}
            style={{ width: `${(r.value / total) * 100}%`, background: r.country.color }}
            title={`${r.country.name}: ${((r.value / total) * 100).toFixed(1)}%`}
          />
        ))}
      </div>
      <div className="gcc-weight-legend">
        {rows.map((r) => (
          <div className="gcc-weight-item" key={r.country.code}>
            <span className="gcc-weight-dot" style={{ background: r.country.color }} />
            <span className="gcc-weight-name">{r.country.short}</span>
            <span className="gcc-weight-pct">{((r.value / total) * 100).toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function RegionalRanking({ selectedData, meta }) {
  const rows = COUNTRIES
    .map((c) => ({
      country: c,
      latest: getLatest(selectedData?.[c.code]),
      prior: getPrior(selectedData?.[c.code]),
    }))
    .filter((r) => r.latest)
    .sort((a, b) => b.latest.value - a.latest.value);

  if (rows.length === 0) {
    return <p className="gcc-insight-line gcc-muted">No data reported yet for this indicator.</p>;
  }

  const maxAbs = Math.max(...rows.map((r) => Math.abs(r.latest.value)), 1);

  return (
    <div className="gcc-rank-list">
      {rows.map((r, i) => {
        const pct = Math.min(100, (Math.abs(r.latest.value) / maxAbs) * 100);
        const delta = r.prior ? r.latest.value - r.prior.value : null;
        return (
          <div className="gcc-rank-row" key={r.country.code}>
            <span className="gcc-rank-pos">{i + 1}</span>
            <span className="gcc-rank-name">{r.country.name}</span>
            <div className="gcc-rank-bar-track">
              <div className="gcc-rank-bar-fill" style={{ width: `${pct}%`, background: r.country.color }} />
            </div>
            <span className="gcc-rank-value">{formatValue(r.latest.value, meta.format)}</span>
            {delta !== null && (
              <span className={`gcc-rank-delta ${delta >= 0 ? "up" : "down"}`}>
                {formatDelta(delta, meta.format)}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function HeroSummaryRow({ data, status }) {
  const stats = computeHeroStats(data, status);
  if (!stats) {
    return (
      <div className="gcc-hero-grid">
        {Array.from({ length: 6 }).map((_, i) => (
          <div className="gcc-hero-card gcc-hero-loading" key={i}>Loading…</div>
        ))}
      </div>
    );
  }
  const items = [
    { label: "GCC GDP (combined)", value: formatValue(stats.gccGDP, "currency") },
    { label: "Avg GDP growth", value: stats.avgGrowth != null ? `${stats.avgGrowth.toFixed(1)}%` : "—" },
    { label: "Avg inflation", value: stats.avgInflation != null ? `${stats.avgInflation.toFixed(1)}%` : "—" },
    { label: "Oil dependence index", value: stats.oilLabel || "—", sub: stats.avgOil != null ? `avg ${stats.avgOil.toFixed(1)}% of GDP` : null },
    { label: "Best performer", value: stats.bestPerformer ? stats.bestPerformer.c.short : "—", sub: stats.bestPerformer ? `${stats.bestPerformer.v.toFixed(1)}% growth` : null },
    { label: "Most volatile", value: stats.mostVolatile ? stats.mostVolatile.c.short : "—", sub: "10-yr growth std. dev." },
  ];
  return (
    <div className="gcc-hero-grid">
      {items.map((it) => (
        <div className="gcc-hero-card" key={it.label}>
          <div className="gcc-hero-label">{it.label}</div>
          <div className="gcc-hero-value">{it.value}</div>
          {it.sub && <div className="gcc-hero-sub">{it.sub}</div>}
        </div>
      ))}
    </div>
  );
}

function MiniRankList({ selectedData, meta, statusReady }) {
  if (!statusReady) return <div className="gcc-mini-loading">Loading…</div>;
  const rows = COUNTRIES
    .map((c) => ({ c, latest: getLatest(selectedData?.[c.code]) }))
    .filter((r) => r.latest)
    .sort((a, b) => b.latest.value - a.latest.value);
  if (rows.length === 0) return <div className="gcc-mini-loading">No data reported</div>;
  return (
    <ol className="gcc-mini-rank">
      {rows.map((r, i) => (
        <li key={r.c.code}>
          <span className="gcc-mini-pos">{i + 1}</span>
          <span className="gcc-mini-name" style={{ color: r.c.color }}>{r.c.short}</span>
          <span className="gcc-mini-val">{formatValue(r.latest.value, meta.format)}</span>
        </li>
      ))}
    </ol>
  );
}

const RANKING_OVERVIEW_CODES = [
  "NY.GDP.MKTP.KD.ZG", "NY.GDP.PCAP.CD", "FP.CPI.TOTL.ZG", "SL.UEM.TOTL.ZS",
  "NY.GDP.PETR.RT.ZS", "BX.KLT.DINV.WD.GD.ZS", "NE.TRD.GNFS.ZS", "SP.POP.GROW",
];

function RankingsOverview({ data, status }) {
  return (
    <div className="gcc-card">
      <div className="gcc-card-head">
        <h2 className="gcc-card-title">Rankings at a glance</h2>
        <span className="gcc-card-note">Latest reported value per indicator</span>
      </div>
      <div className="gcc-mini-rank-grid">
        {RANKING_OVERVIEW_CODES.map((code) => (
          <div className="gcc-mini-rank-block" key={code}>
            <div className="gcc-mini-rank-title">{INDICATOR_MAP[code].label}</div>
            <MiniRankList selectedData={data[code]} meta={INDICATOR_MAP[code]} statusReady={status[code] === "done"} />
          </div>
        ))}
      </div>
    </div>
  );
}

function RiskFlagsPanel({ data, status }) {
  const ready = RISK_RULES.every((r) => status[r.code] === "done");
  return (
    <div className="gcc-card">
      <div className="gcc-card-head">
        <h2 className="gcc-card-title">Risk flags</h2>
        <span className="gcc-card-note">Rule-based, from latest reported values — see Methodology</span>
      </div>
      {!ready ? (
        <div className="gcc-mini-loading">Loading…</div>
      ) : (
        <div className="gcc-riskflag-grid">
          {COUNTRIES.map((c) => {
            const flags = getRiskFlags(data, c.code);
            return (
              <div className="gcc-riskflag-card" key={c.code}>
                <div className="gcc-riskflag-name">{c.name}</div>
                {flags.length === 0 ? (
                  <span className="gcc-riskflag-chip gcc-riskflag-clear">No flags triggered</span>
                ) : (
                  <div className="gcc-riskflag-chips">
                    {flags.map((f) => (
                      <span className="gcc-riskflag-chip" key={f.key} title={`${INDICATOR_MAP[f.code]?.label || f.code}: ${formatValue(f.value, "percent")}`}>
                        {f.label}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function DataQualityNote({ selectedData, meta, status }) {
  const st = status[meta.code];
  if (st !== "done") return null;
  const years = COUNTRIES.map((c) => getLatest(selectedData?.[c.code])?.year).filter(Boolean);
  if (years.length === 0) {
    return <p className="gcc-dataquality">No countries currently report this indicator to the World Bank.</p>;
  }
  const mostRecent = Math.max(...years);
  const lagging = COUNTRIES
    .map((c) => ({ c, year: getLatest(selectedData?.[c.code])?.year }))
    .filter((r) => r.year && r.year < mostRecent);
  return (
    <p className="gcc-dataquality">
      <strong>Latest available year:</strong> {mostRecent} · <strong>Source:</strong> World Bank WDI ·{" "}
      <strong>Frequency:</strong> Annual
      {lagging.length > 0 && (
        <> · <strong>Lagging:</strong> {lagging.map((r) => `${r.c.short} (${r.year})`).join(", ")}</>
      )}
    </p>
  );
}

function DiversificationTracker({ data, status }) {
  const codes = ["NY.GDP.PETR.RT.ZS", "NV.IND.MANF.ZS", "NV.SRV.TOTL.ZS", "ST.INT.RCPT.XP.ZS"];
  const ready = codes.every((c) => status[c] === "done");
  const rows = COUNTRIES.map((c) => {
    const oil = latestVal(data, "NY.GDP.PETR.RT.ZS", c.code);
    return {
      country: c,
      oil,
      nonOil: oil != null ? 100 - oil : null,
      manuf: latestVal(data, "NV.IND.MANF.ZS", c.code),
      services: latestVal(data, "NV.SRV.TOTL.ZS", c.code),
      tourism: latestVal(data, "ST.INT.RCPT.XP.ZS", c.code),
    };
  }).sort((a, b) => (b.nonOil ?? -1) - (a.nonOil ?? -1));

  return (
    <div className="gcc-card">
      <div className="gcc-card-head">
        <h2 className="gcc-card-title">Diversification tracker</h2>
        <span className="gcc-card-note">Ranked by non-oil share of GDP (100% − oil rents)</span>
      </div>
      {!ready ? <div className="gcc-mini-loading">Loading…</div> : (
        <div className="gcc-table-wrap">
          <table className="gcc-table">
            <thead>
              <tr>
                <th>Country</th>
                <th>Non-oil share</th>
                <th>Oil rents</th>
                <th>Manufacturing (% GDP)</th>
                <th>Services (% GDP)</th>
                <th>Tourism receipts (% exports)</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.country.code}>
                  <td className="gcc-row-label">{r.country.name}</td>
                  <td className="gcc-num" style={{ color: r.country.color }}>{r.nonOil != null ? `${r.nonOil.toFixed(1)}%` : "—"}</td>
                  <td className="gcc-num">{r.oil != null ? `${r.oil.toFixed(1)}%` : "—"}</td>
                  <td className="gcc-num">{r.manuf != null ? `${r.manuf.toFixed(1)}%` : "—"}</td>
                  <td className="gcc-num">{r.services != null ? `${r.services.toFixed(1)}%` : "—"}</td>
                  <td className="gcc-num">{r.tourism != null ? `${r.tourism.toFixed(1)}%` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function OilExposureCard({ data, status }) {
  const ready = status["NY.GDP.PETR.RT.ZS"] === "done";
  const rows = COUNTRIES.map((c) => ({
    country: c,
    value: latestVal(data, "NY.GDP.PETR.RT.ZS", c.code),
  })).filter((r) => r.value != null).sort((a, b) => b.value - a.value);
  const maxV = Math.max(...rows.map((r) => r.value), 1);

  return (
    <div className="gcc-card">
      <div className="gcc-card-head">
        <h2 className="gcc-card-title">Oil exposure</h2>
        <span className="gcc-card-note">Oil rents as % of GDP · &gt;20% High · 10–20% Medium · &lt;10% Low</span>
      </div>
      {!ready ? <div className="gcc-mini-loading">Loading…</div> : (
        <div className="gcc-rank-list">
          {rows.map((r) => {
            const label = r.value > 20 ? "High" : r.value > 10 ? "Medium" : "Low";
            const pct = (r.value / maxV) * 100;
            return (
              <div className="gcc-oil-row" key={r.country.code}>
                <span className="gcc-rank-name">{r.country.name}</span>
                <div className="gcc-rank-bar-track">
                  <div className="gcc-rank-bar-fill" style={{ width: `${pct}%`, background: r.country.color }} />
                </div>
                <span className="gcc-rank-value">{r.value.toFixed(1)}%</span>
                <span className={`gcc-oil-label gcc-oil-${label.toLowerCase()}`}>{label}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CompareView({ data, status }) {
  const [a, setA] = useState("SAU");
  const [b, setB] = useState("ARE");
  const countryA = COUNTRIES.find((c) => c.code === a);
  const countryB = COUNTRIES.find((c) => c.code === b);

  return (
    <div className="gcc-card">
      <div className="gcc-card-head">
        <h2 className="gcc-card-title">Compare two countries</h2>
        <span className="gcc-card-note">All indicators, latest reported value</span>
      </div>
      <div className="gcc-compare-selectors">
        <select className="gcc-select" value={a} onChange={(e) => setA(e.target.value)}>
          {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
        </select>
        <span className="gcc-compare-vs">vs</span>
        <select className="gcc-select" value={b} onChange={(e) => setB(e.target.value)}>
          {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
        </select>
      </div>
      <div className="gcc-table-wrap">
        <table className="gcc-table">
          <thead>
            <tr>
              <th>Indicator</th>
              <th style={{ color: countryA?.color }}>{countryA?.short}</th>
              <th style={{ color: countryB?.color }}>{countryB?.short}</th>
              <th>Gap</th>
            </tr>
          </thead>
          <tbody>
            {ALL_INDICATORS.map((ind) => {
              const latestA = getLatest(data[ind.code]?.[a]);
              const latestB = getLatest(data[ind.code]?.[b]);
              const st = status[ind.code];
              const gap = latestA && latestB ? latestA.value - latestB.value : null;
              return (
                <tr key={ind.code}>
                  <td className="gcc-row-label">{ind.label}</td>
                  <td className="gcc-num">{st !== "done" ? "···" : latestA ? formatValue(latestA.value, ind.format) : "—"}</td>
                  <td className="gcc-num">{st !== "done" ? "···" : latestB ? formatValue(latestB.value, ind.format) : "—"}</td>
                  <td className="gcc-num">{gap !== null ? formatDelta(gap, ind.format) : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MethodologyPage() {
  return (
    <div className="gcc-card gcc-methodology">
      <h2 className="gcc-card-title" style={{ marginBottom: 16 }}>Methodology</h2>

      <h3>Data sources</h3>
      <p>All figures are fetched live from the World Bank Open Data API (World Development Indicators),
      covering Saudi Arabia, the UAE, Qatar, Kuwait, Bahrain and Oman from 1995 onward where reported.
      No indicator is estimated, interpolated, or invented — a missing value means the country has not
      reported that indicator to the World Bank for that year.</p>

      <h3>Indicator definitions</h3>
      <p>Indicator labels and World Bank codes are shown throughout the dashboard (for example, GDP growth
      is <code>NY.GDP.MKTP.KD.ZG</code>). Full definitions are available on the World Bank's data catalog.</p>

      <h3>Risk flag thresholds</h3>
      <p>Risk flags are simple, disclosed rules applied to each country's latest reported value — not a
      predictive or econometric model:</p>
      <ul>
        {RISK_RULES.map((r) => (
          <li key={r.key}>{r.label}: triggered when {INDICATOR_MAP[r.code]?.label} {r.key === "growth" || r.key === "fdi" || r.key === "pop" ? "is below" : r.key === "cab" ? "is negative" : "exceeds"} the stated threshold.</li>
        ))}
      </ul>

      <h3>Oil dependence index</h3>
      <p>A simple average of oil rents as a share of GDP across countries with data: above 20% is
      labeled High, 10–20% Medium, below 10% Low. This is a descriptive bucket, not a ranking score.</p>

      <h3>Diversification tracker</h3>
      <p>Non-oil share of GDP is calculated as 100% minus oil rents (% of GDP) for the same latest year.
      It is a proxy, not a direct measure of economic complexity or diversification depth.</p>

      <h3>Missing data</h3>
      <p>No gaps are filled or estimated. Charts connect across missing years for readability, but the
      Data Coverage note under each chart discloses which countries are lagging the bloc's most recent
      reporting year.</p>

      <h3>Limitations</h3>
      <p>World Bank statistics for GCC economies typically lag 1–2 years behind the current date. Some
      indicators (notably tourism receipts and services value added) are reported inconsistently across
      GCC countries. All comparisons should be read as descriptive, not causal.</p>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/*  Main component                                                         */
/* ---------------------------------------------------------------------- */

export default function GCCDashboard() {
  const [data, setData] = useState({});
  const [status, setStatus] = useState({});
  const [selectedIndicator, setSelectedIndicator] = useState(DEFAULT_INDICATOR);
  const [activeGroup, setActiveGroup] = useState("output");
  const [tableGroup, setTableGroup] = useState("output");
  const [activeCountries, setActiveCountries] = useState(
    new Set(COUNTRIES.map((c) => c.code))
  );
  const [refreshKey, setRefreshKey] = useState(0);
  const [fetchedAt, setFetchedAt] = useState(null);
  const [showAggregate, setShowAggregate] = useState(true);
  const [activeTab, setActiveTab] = useState("overview");

  const loadAll = useCallback(() => {
    ALL_INDICATORS.forEach((ind) => {
      setStatus((s) => ({ ...s, [ind.code]: "loading" }));
      fetchIndicator(ind.code)
        .then((records) => {
          const parsed = parseRecords(records);
          setData((d) => ({ ...d, [ind.code]: parsed }));
          setStatus((s) => ({ ...s, [ind.code]: "done" }));
          setFetchedAt(new Date());
        })
        .catch(() => {
          setStatus((s) => ({ ...s, [ind.code]: "error" }));
        });
    });
  }, []);

  useEffect(() => { loadAll(); }, [loadAll, refreshKey]);

  const toggleCountry = (code) => {
    setActiveCountries((prev) => {
      const next = new Set(prev);
      if (next.has(code)) {
        if (next.size > 1) next.delete(code);
      } else {
        next.add(code);
      }
      return next;
    });
  };

  const selectedMeta = INDICATOR_MAP[selectedIndicator];
  const selectedData = data[selectedIndicator];
  const selectedStatus = status[selectedIndicator];

  const aggregateMap = useMemo(
    () => computeAggregate(selectedData, selectedMeta.format),
    [selectedData, selectedMeta]
  );
  const aggregateLabel = selectedMeta.format === "currency" || selectedMeta.format === "population"
    ? "GCC total"
    : "GCC average";

  const insights = useMemo(
    () => generateInsights(selectedData, selectedMeta),
    [selectedData, selectedMeta]
  );

  const chartData = useMemo(() => {
    if (!selectedData) return [];
    const years = new Set();
    Object.values(selectedData).forEach((arr) => arr.forEach((p) => years.add(p.year)));
    const sorted = Array.from(years).sort((a, b) => a - b);
    return sorted.map((year) => {
      const row = { year };
      COUNTRIES.forEach((c) => {
        const point = (selectedData[c.code] || []).find((p) => p.year === year);
        row[c.code] = point ? point.value : null;
      });
      row.GCC = aggregateMap[year] !== undefined ? aggregateMap[year] : null;
      return row;
    });
  }, [selectedData, aggregateMap]);

  const globalRange = useMemo(() => {
    if (!selectedData) return { min: 0, max: 1 };
    let min = Infinity, max = -Infinity;
    Object.values(selectedData).forEach((arr) => {
      arr.slice(-12).forEach((p) => {
        if (p.value < min) min = p.value;
        if (p.value > max) max = p.value;
      });
    });
    if (!Number.isFinite(min) || !Number.isFinite(max)) return { min: 0, max: 1 };
    if (min === max) { min -= 1; max += 1; }
    return { min, max };
  }, [selectedData]);

  const loadedCount = ALL_INDICATORS.filter((i) => status[i.code] === "done").length;
  const allLoaded = loadedCount === ALL_INDICATORS.length;

  return (
    <div className="gcc-root">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap');

        .gcc-root {
          --bg: #0A1620;
          --panel: #0F212B;
          --panel-raised: #132833;
          --line: #1E3A44;
          --gold: #C99A3E;
          --teal: #3E8E8A;
          --sand: #EDE6D6;
          --muted: #8CA0A6;
          --coral: #C1583F;
          font-family: 'IBM Plex Sans', sans-serif;
          background: var(--bg);
          color: var(--sand);
          min-height: 100%;
          padding: 28px 20px 40px;
          box-sizing: border-box;
          position: relative;
          overflow-x: hidden;
        }
        .gcc-root *, .gcc-root *::before, .gcc-root *::after { box-sizing: border-box; }
        .gcc-lattice {
          position: absolute; inset: 0; pointer-events: none; opacity: 0.05;
          background-image:
            linear-gradient(45deg, var(--gold) 1px, transparent 1px),
            linear-gradient(-45deg, var(--gold) 1px, transparent 1px);
          background-size: 34px 34px;
          mask-image: linear-gradient(to bottom, black, transparent 340px);
        }
        .gcc-wrap { max-width: 1180px; margin: 0 auto; position: relative; }

        .gcc-header { display: flex; justify-content: space-between; align-items: flex-end; gap: 20px; flex-wrap: wrap; margin-bottom: 22px; }
        .gcc-eyebrow { font-family: 'IBM Plex Mono', monospace; font-size: 11px; letter-spacing: 0.18em; text-transform: uppercase; color: var(--teal); margin: 0 0 8px; display:flex; align-items:center; gap:8px;}
        .gcc-title { font-family: 'Fraunces', serif; font-weight: 500; font-size: 34px; margin: 0; line-height: 1.05; color: var(--sand); }
        .gcc-byline { font-family: 'IBM Plex Mono', monospace; font-size: 11px; letter-spacing: 0.04em; color: var(--gold); margin: 0; }
        .gcc-sub { font-size: 13.5px; color: var(--muted); margin: 8px 0 0; max-width: 560px; line-height: 1.5; }

        .gcc-status { display: flex; align-items: center; gap: 10px; font-family: 'IBM Plex Mono', monospace; font-size: 11px; color: var(--muted); }
        .gcc-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--teal); box-shadow: 0 0 0 3px rgba(62,142,138,0.18); }
        .gcc-dot.loading { background: var(--gold); animation: gcc-pulse 1.4s ease-in-out infinite; }
        @keyframes gcc-pulse { 0%,100% { opacity: 1;} 50% { opacity: 0.35; } }
        .gcc-refresh { display:flex; align-items:center; gap:6px; background: var(--panel-raised); border: 1px solid var(--line); color: var(--sand); font-family: 'IBM Plex Mono', monospace; font-size: 11px; padding: 7px 12px; border-radius: 6px; cursor: pointer; transition: border-color 0.15s ease; }
        .gcc-refresh:hover { border-color: var(--teal); }
        .gcc-refresh:focus-visible { outline: 2px solid var(--teal); outline-offset: 2px; }
        .gcc-refresh svg { animation: none; }
        .gcc-refresh.spinning svg { animation: gcc-spin 1s linear infinite; }
        @keyframes gcc-spin { to { transform: rotate(360deg); } }

        .gcc-ticker { display: flex; gap: 10px; overflow-x: auto; padding: 4px 2px 14px; margin-bottom: 8px; }
        .gcc-tick-btn { flex: 0 0 auto; background: var(--panel); border: 1px solid var(--line); border-radius: 10px; padding: 10px 12px 8px; cursor: pointer; text-align: left; transition: border-color 0.15s ease, opacity 0.15s ease; min-width: 108px; }
        .gcc-tick-btn:hover { border-color: var(--muted); }
        .gcc-tick-btn:focus-visible { outline: 2px solid var(--teal); outline-offset: 2px; }
        .gcc-tick-btn.inactive { opacity: 0.35; }
        .gcc-tick-name { font-family: 'IBM Plex Mono', monospace; font-size: 10.5px; letter-spacing: 0.06em; color: var(--muted); display:block; margin-bottom: 6px; }
        .gcc-tick-flag { color: var(--sand); font-weight: 600; font-size: 12.5px; }

        .gcc-groups { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 10px; }
        .gcc-group-btn { font-family: 'IBM Plex Mono', monospace; font-size: 11px; letter-spacing: 0.05em; text-transform: uppercase; background: transparent; border: 1px solid var(--line); color: var(--muted); padding: 7px 13px; border-radius: 999px; cursor: pointer; transition: all 0.15s ease; }
        .gcc-group-btn:hover { color: var(--sand); border-color: var(--muted); }
        .gcc-group-btn.active { background: var(--teal); border-color: var(--teal); color: #06171a; }
        .gcc-group-btn:focus-visible { outline: 2px solid var(--teal); outline-offset: 2px; }

        .gcc-chips { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 18px; }
        .gcc-chip { font-size: 12.5px; background: var(--panel); border: 1px solid var(--line); color: var(--sand); padding: 7px 13px; border-radius: 8px; cursor: pointer; transition: all 0.15s ease; }
        .gcc-chip:hover { border-color: var(--gold); }
        .gcc-chip.active { background: var(--gold); border-color: var(--gold); color: #241a08; font-weight: 500; }
        .gcc-chip:focus-visible { outline: 2px solid var(--teal); outline-offset: 2px; }

        .gcc-card { background: var(--panel); border: 1px solid var(--line); border-radius: 14px; padding: 20px; margin-bottom: 22px; }
        .gcc-card-head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 14px; flex-wrap: wrap; gap: 8px; }
        .gcc-card-title { font-family: 'Fraunces', serif; font-size: 19px; font-weight: 500; margin: 0; }
        .gcc-card-note { font-size: 11.5px; color: var(--muted); font-family: 'IBM Plex Mono', monospace; }

        .gcc-snapshot-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; margin-bottom: 22px; }
        .gcc-snap { background: var(--panel); border: 1px solid var(--line); border-radius: 12px; padding: 14px 15px; }
        .gcc-snap-name { font-family: 'IBM Plex Mono', monospace; font-size: 10.5px; letter-spacing: 0.06em; color: var(--muted); text-transform: uppercase; margin-bottom: 8px; }
        .gcc-snap-value-row { display: flex; align-items: center; gap: 6px; }
        .gcc-snap-value { font-family: 'IBM Plex Mono', monospace; font-size: 19px; font-weight: 500; color: var(--sand); }
        .gcc-snap-year { font-size: 10.5px; color: var(--muted); margin-top: 2px; }
        .gcc-trend-up { color: var(--teal); }
        .gcc-trend-down { color: var(--coral); }
        .gcc-trend-flat { color: var(--muted); }

        .gcc-table-wrap { overflow-x: auto; }
        table.gcc-table { width: 100%; border-collapse: collapse; font-size: 13px; }
        table.gcc-table th { text-align: left; font-family: 'IBM Plex Mono', monospace; font-size: 10.5px; letter-spacing: 0.05em; text-transform: uppercase; color: var(--muted); font-weight: 500; padding: 8px 10px; border-bottom: 1px solid var(--line); white-space: nowrap; }
        table.gcc-table td { padding: 10px 10px; border-bottom: 1px solid var(--line); font-family: 'IBM Plex Mono', monospace; white-space: nowrap; }
        table.gcc-table td.gcc-row-label { font-family: 'IBM Plex Sans', sans-serif; color: var(--sand); white-space: normal; min-width: 200px; }
        table.gcc-table tr:last-child td { border-bottom: none; }
        table.gcc-table td.gcc-num { color: var(--sand); }
        .gcc-cell-sub { color: var(--muted); font-size: 10.5px; margin-left: 4px; }

        .gcc-footer { margin-top: 26px; padding-top: 18px; border-top: 1px solid var(--line); font-size: 11.5px; color: var(--muted); line-height: 1.6; }
        .gcc-footer strong { color: var(--sand); }

        .gcc-error-banner { display: flex; align-items: center; gap: 8px; background: rgba(193,88,63,0.12); border: 1px solid rgba(193,88,63,0.4); color: #E3A896; border-radius: 8px; padding: 10px 14px; font-size: 12.5px; margin-bottom: 16px; }

        .gcc-weight-bar { display: flex; height: 26px; border-radius: 6px; overflow: hidden; margin-bottom: 14px; }
        .gcc-weight-bar > div { transition: opacity 0.15s ease; }
        .gcc-weight-bar > div:hover { opacity: 0.85; }
        .gcc-weight-legend { display: flex; flex-wrap: wrap; gap: 16px; }
        .gcc-weight-item { display: flex; align-items: center; gap: 6px; font-family: 'IBM Plex Mono', monospace; font-size: 12px; }
        .gcc-weight-dot { width: 8px; height: 8px; border-radius: 2px; flex-shrink: 0; }
        .gcc-weight-name { color: var(--sand); }
        .gcc-weight-pct { color: var(--muted); }
        .gcc-weight-loading { color: var(--muted); font-size: 12.5px; font-family: 'IBM Plex Mono', monospace; padding: 6px 0 2px; }

        .gcc-toggle { display: flex; align-items: center; gap: 6px; font-family: 'IBM Plex Mono', monospace; font-size: 11px; color: var(--muted); cursor: pointer; user-select: none; }
        .gcc-toggle input { accent-color: var(--teal); cursor: pointer; }

        .gcc-analysis-grid { display: grid; grid-template-columns: 1.15fr 0.85fr; gap: 28px; }
        @media (max-width: 760px) { .gcc-analysis-grid { grid-template-columns: 1fr; } }

        .gcc-rank-list { display: flex; flex-direction: column; gap: 11px; }
        .gcc-rank-row { display: grid; grid-template-columns: 16px minmax(90px,150px) 1fr auto auto; align-items: center; gap: 10px; }
        .gcc-rank-pos { font-family: 'IBM Plex Mono', monospace; color: var(--muted); font-size: 12px; }
        .gcc-rank-name { font-size: 12.5px; color: var(--sand); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .gcc-rank-bar-track { background: var(--panel-raised); border-radius: 4px; height: 8px; overflow: hidden; }
        .gcc-rank-bar-fill { height: 100%; border-radius: 4px; }
        .gcc-rank-value { font-family: 'IBM Plex Mono', monospace; font-size: 12px; color: var(--sand); white-space: nowrap; }
        .gcc-rank-delta { font-family: 'IBM Plex Mono', monospace; font-size: 11px; white-space: nowrap; }
        .gcc-rank-delta.up { color: var(--teal); }
        .gcc-rank-delta.down { color: var(--coral); }

        .gcc-insights { display: flex; flex-direction: column; gap: 13px; justify-content: center; }
        .gcc-insight-line { font-size: 13.5px; line-height: 1.55; color: var(--sand); margin: 0; padding-left: 14px; border-left: 2px solid var(--gold); }
        .gcc-insight-line.gcc-muted { color: var(--muted); border-left-color: var(--line); }

        .gcc-tooltip { background: var(--panel-raised); border: 1px solid var(--line); border-radius: 8px; padding: 10px 12px; font-family: 'IBM Plex Mono', monospace; font-size: 12px; }
        .gcc-tooltip-year { color: var(--muted); margin-bottom: 6px; }
        .gcc-tooltip-row { display: flex; align-items: center; gap: 6px; margin: 2px 0; }
        .gcc-tooltip-swatch { width: 8px; height: 8px; border-radius: 2px; }

        .gcc-tabs { display: flex; gap: 6px; margin-bottom: 20px; border-bottom: 1px solid var(--line); }
        .gcc-tab-btn { font-family: 'IBM Plex Mono', monospace; font-size: 12px; letter-spacing: 0.04em; background: transparent; border: none; border-bottom: 2px solid transparent; color: var(--muted); padding: 10px 14px; cursor: pointer; margin-bottom: -1px; transition: color 0.15s ease; }
        .gcc-tab-btn:hover { color: var(--sand); }
        .gcc-tab-btn.active { color: var(--gold); border-bottom-color: var(--gold); }
        .gcc-tab-btn:focus-visible { outline: 2px solid var(--teal); outline-offset: 2px; }

        .gcc-hero-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; margin-bottom: 22px; }
        .gcc-hero-card { background: var(--panel-raised); border: 1px solid var(--line); border-radius: 12px; padding: 14px 15px; }
        .gcc-hero-loading { color: var(--muted); font-family: 'IBM Plex Mono', monospace; font-size: 12px; }
        .gcc-hero-label { font-family: 'IBM Plex Mono', monospace; font-size: 10px; letter-spacing: 0.05em; text-transform: uppercase; color: var(--muted); margin-bottom: 8px; }
        .gcc-hero-value { font-family: 'Fraunces', serif; font-size: 21px; font-weight: 500; color: var(--gold); }
        .gcc-hero-sub { font-size: 10.5px; color: var(--muted); margin-top: 3px; }

        .gcc-mini-rank-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 16px; }
        .gcc-mini-rank-title { font-size: 12px; color: var(--sand); margin-bottom: 8px; }
        .gcc-mini-loading { color: var(--muted); font-family: 'IBM Plex Mono', monospace; font-size: 11.5px; padding: 4px 0; }
        .gcc-mini-rank { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 5px; }
        .gcc-mini-rank li { display: flex; align-items: center; gap: 8px; font-family: 'IBM Plex Mono', monospace; font-size: 11.5px; }
        .gcc-mini-pos { color: var(--muted); width: 12px; }
        .gcc-mini-name { width: 34px; font-weight: 500; }
        .gcc-mini-val { color: var(--sand); margin-left: auto; }

        .gcc-riskflag-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; }
        .gcc-riskflag-card { background: var(--panel-raised); border: 1px solid var(--line); border-radius: 10px; padding: 13px 14px; }
        .gcc-riskflag-name { font-size: 12.5px; color: var(--sand); margin-bottom: 8px; font-weight: 500; }
        .gcc-riskflag-chips { display: flex; flex-wrap: wrap; gap: 6px; }
        .gcc-riskflag-chip { font-family: 'IBM Plex Mono', monospace; font-size: 10.5px; background: rgba(193,88,63,0.14); color: #E3A896; border: 1px solid rgba(193,88,63,0.35); padding: 4px 8px; border-radius: 999px; }
        .gcc-riskflag-clear { font-family: 'IBM Plex Mono', monospace; font-size: 10.5px; background: rgba(62,142,138,0.14); color: var(--teal); border: 1px solid rgba(62,142,138,0.35); padding: 4px 8px; border-radius: 999px; }

        .gcc-dataquality { font-size: 11.5px; color: var(--muted); font-family: 'IBM Plex Mono', monospace; margin: 10px 2px 22px; line-height: 1.6; }
        .gcc-dataquality strong { color: var(--sand); font-family: 'IBM Plex Sans', sans-serif; }

        .gcc-oil-label { font-family: 'IBM Plex Mono', monospace; font-size: 10.5px; padding: 3px 8px; border-radius: 999px; white-space: nowrap; }
        .gcc-oil-high { background: rgba(193,88,63,0.14); color: #E3A896; }
        .gcc-oil-medium { background: rgba(201,154,62,0.16); color: var(--gold); }
        .gcc-oil-low { background: rgba(62,142,138,0.14); color: var(--teal); }
        .gcc-oil-row { display: grid; grid-template-columns: minmax(120px,170px) 1fr auto auto; align-items: center; gap: 10px; margin-bottom: 10px; }

        .gcc-compare-selectors { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; }
        .gcc-select { background: var(--panel-raised); border: 1px solid var(--line); color: var(--sand); font-family: 'IBM Plex Sans', sans-serif; font-size: 13px; padding: 8px 12px; border-radius: 8px; }
        .gcc-select:focus-visible { outline: 2px solid var(--teal); outline-offset: 2px; }
        .gcc-compare-vs { font-family: 'IBM Plex Mono', monospace; font-size: 11px; color: var(--muted); }

        .gcc-methodology h3 { font-family: 'Fraunces', serif; font-size: 15px; font-weight: 500; color: var(--gold); margin: 20px 0 8px; }
        .gcc-methodology h3:first-of-type { margin-top: 0; }
        .gcc-methodology p, .gcc-methodology li { font-size: 13px; color: var(--sand); line-height: 1.65; }
        .gcc-methodology ul { padding-left: 18px; margin: 6px 0; }
        .gcc-methodology code { font-family: 'IBM Plex Mono', monospace; font-size: 12px; background: var(--panel-raised); padding: 1px 5px; border-radius: 4px; color: var(--gold); }

        @media (max-width: 640px) {
          .gcc-title { font-size: 26px; }
          .gcc-header { align-items: flex-start; }
        }
      `}</style>

      <div className="gcc-lattice" />
      <div className="gcc-wrap">

        <div className="gcc-header">
          <div>
            <p className="gcc-eyebrow"><Waves size={13} /> Gulf Cooperation Council</p>
            <h1 className="gcc-title">GCC Economic Monitor</h1>
            <p className="gcc-byline">By Anadel AlRashed</p>
            <p className="gcc-sub">
              Macroeconomic indicators for Saudi Arabia, the UAE, Qatar, Kuwait, Bahrain and Oman,
              pulled live from the World Bank Open Data API.
            </p>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 10 }}>
            <div className="gcc-status">
              <span className={`gcc-dot ${allLoaded ? "" : "loading"}`} />
              {allLoaded
                ? `Live · ${loadedCount}/${ALL_INDICATORS.length} series loaded`
                : `Loading series… ${loadedCount}/${ALL_INDICATORS.length}`}
            </div>
            <button
              className={`gcc-refresh ${!allLoaded ? "spinning" : ""}`}
              onClick={() => setRefreshKey((k) => k + 1)}
            >
              <RefreshCw size={12} /> Refresh data
            </button>
          </div>
        </div>

        {selectedStatus === "error" && (
          <div className="gcc-error-banner">
            <AlertCircle size={15} />
            Couldn't reach the World Bank API for this indicator. Check your connection and try refreshing.
          </div>
        )}

        <div className="gcc-tabs">
          {[
            { id: "overview", label: "Overview" },
            { id: "diversification", label: "Diversification" },
            { id: "compare", label: "Compare" },
            { id: "methodology", label: "Methodology" },
          ].map((t) => (
            <button
              key={t.id}
              className={`gcc-tab-btn ${activeTab === t.id ? "active" : ""}`}
              onClick={() => setActiveTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {activeTab === "overview" && (
        <>
        <HeroSummaryRow data={data} status={status} />

        <EconomicWeight gdpData={data["NY.GDP.MKTP.CD"]} gdpStatus={status["NY.GDP.MKTP.CD"]} />

        <RankingsOverview data={data} status={status} />

        <RiskFlagsPanel data={data} status={status} />

        {/* Skyline ticker — country toggle, bars built from the selected indicator's own data */}
        <div className="gcc-ticker">
          {COUNTRIES.map((c) => {
            const series = selectedData?.[c.code];
            const active = activeCountries.has(c.code);
            return (
              <button
                key={c.code}
                className={`gcc-tick-btn ${active ? "" : "inactive"}`}
                onClick={() => toggleCountry(c.code)}
                title={`Toggle ${c.name}`}
              >
                <span className="gcc-tick-name">{c.short}</span>
                <MiniSkyline
                  series={series}
                  color={c.color}
                  globalMin={globalRange.min}
                  globalMax={globalRange.max}
                />
              </button>
            );
          })}
        </div>

        {/* Indicator group + chip selection */}
        <div className="gcc-groups">
          {INDICATOR_GROUPS.map((g) => (
            <button
              key={g.id}
              className={`gcc-group-btn ${activeGroup === g.id ? "active" : ""}`}
              onClick={() => {
                setActiveGroup(g.id);
                setSelectedIndicator(g.indicators[0].code);
              }}
            >
              {g.label}
            </button>
          ))}
        </div>
        <div className="gcc-chips">
          {INDICATOR_GROUPS.find((g) => g.id === activeGroup).indicators.map((ind) => (
            <button
              key={ind.code}
              className={`gcc-chip ${selectedIndicator === ind.code ? "active" : ""}`}
              onClick={() => setSelectedIndicator(ind.code)}
            >
              {ind.label}
            </button>
          ))}
        </div>

        {/* Main chart */}
        <div className="gcc-card">
          <div className="gcc-card-head">
            <h2 className="gcc-card-title">{selectedMeta.label}</h2>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <label className="gcc-toggle">
                <input
                  type="checkbox"
                  checked={showAggregate}
                  onChange={() => setShowAggregate((v) => !v)}
                />
                Show {aggregateLabel}
              </label>
              <span className="gcc-card-note">World Bank · WDI · {selectedMeta.code}</span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={340}>
            <LineChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid stroke="#1E3A44" strokeDasharray="2 4" vertical={false} />
              <XAxis dataKey="year" stroke="#8CA0A6" fontSize={11} tickLine={false} axisLine={{ stroke: "#1E3A44" }} />
              <YAxis
                stroke="#8CA0A6" fontSize={11} tickLine={false} axisLine={false}
                tickFormatter={(v) => formatValue(v, selectedMeta.format)}
                width={64}
              />
              <Tooltip content={<ChartTooltip format={selectedMeta.format} />} />
              {COUNTRIES.filter((c) => activeCountries.has(c.code)).map((c) => (
                <Line
                  key={c.code}
                  type="monotone"
                  dataKey={c.code}
                  name={c.name}
                  stroke={c.color}
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                  activeDot={{ r: 3.5 }}
                />
              ))}
              {showAggregate && (
                <Line
                  type="monotone"
                  dataKey="GCC"
                  name={aggregateLabel}
                  stroke="#EDE6D6"
                  strokeWidth={2}
                  strokeDasharray="5 4"
                  dot={false}
                  connectNulls
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>

        <DataQualityNote selectedData={selectedData} meta={selectedMeta} status={status} />

        {/* Regional ranking + auto-generated insights */}
        <div className="gcc-card">
          <div className="gcc-card-head">
            <h2 className="gcc-card-title">Regional ranking — {selectedMeta.label}</h2>
            <span className="gcc-card-note">Latest reported value, ranked</span>
          </div>
          <div className="gcc-analysis-grid">
            <RegionalRanking selectedData={selectedData} meta={selectedMeta} />
            <div className="gcc-insights">
              {insights.length > 0
                ? insights.map((line, i) => <p key={i} className="gcc-insight-line">{line}</p>)
                : <p className="gcc-insight-line gcc-muted">Not enough data reported yet to generate insights for this indicator.</p>}
            </div>
          </div>
        </div>

        {/* Snapshot cards */}
        <div className="gcc-snapshot-grid">
          {COUNTRIES.map((c) => {
            const series = selectedData?.[c.code];
            const latest = getLatest(series);
            const prior = getPrior(series);
            return (
              <div className="gcc-snap" key={c.code}>
                <div className="gcc-snap-name">{c.name}</div>
                <div className="gcc-snap-value-row">
                  <span className="gcc-snap-value" style={{ color: c.color }}>
                    {latest ? formatValue(latest.value, selectedMeta.format) : "—"}
                  </span>
                  <TrendArrow latest={latest} prior={prior} />
                </div>
                <div className="gcc-snap-year">{latest ? `as of ${latest.year}` : "no data reported"}</div>
              </div>
            );
          })}
        </div>

        {/* Comparison table */}
        <div className="gcc-card">
          <div className="gcc-card-head">
            <h2 className="gcc-card-title">Country comparison</h2>
            <span className="gcc-card-note">Latest reported value per indicator</span>
          </div>
          <div className="gcc-groups" style={{ marginBottom: 14 }}>
            {INDICATOR_GROUPS.map((g) => (
              <button
                key={g.id}
                className={`gcc-group-btn ${tableGroup === g.id ? "active" : ""}`}
                onClick={() => setTableGroup(g.id)}
              >
                {g.label}
              </button>
            ))}
          </div>
          <div className="gcc-table-wrap">
            <table className="gcc-table">
              <thead>
                <tr>
                  <th>Indicator</th>
                  {COUNTRIES.map((c) => <th key={c.code}>{c.short}</th>)}
                </tr>
              </thead>
              <tbody>
                {INDICATOR_GROUPS.find((g) => g.id === tableGroup).indicators.map((ind) => (
                  <tr key={ind.code}>
                    <td className="gcc-row-label">{ind.label}</td>
                    {COUNTRIES.map((c) => {
                      const series = data[ind.code]?.[c.code];
                      const latest = getLatest(series);
                      const st = status[ind.code];
                      return (
                        <td key={c.code} className="gcc-num">
                          {st !== "done"
                            ? "···"
                            : latest
                              ? <>{formatValue(latest.value, ind.format)}<span className="gcc-cell-sub">{latest.year}</span></>
                              : "—"}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            className="gcc-refresh"
            style={{ marginTop: 14 }}
            onClick={() => downloadText("gcc_economic_data.csv", buildComparisonCSV(data, status))}
          >
            <Download size={12} /> Download comparison as CSV
          </button>
        </div>
        </>
        )}

        {activeTab === "diversification" && (
          <>
            <DiversificationTracker data={data} status={status} />
            <OilExposureCard data={data} status={status} />
          </>
        )}

        {activeTab === "compare" && <CompareView data={data} status={status} />}

        {activeTab === "methodology" && <MethodologyPage />}

        <div className="gcc-footer">
          <strong>Source:</strong> World Bank Open Data (World Development Indicators), fetched live from
          api.worldbank.org.{fetchedAt ? ` Last refreshed ${fetchedAt.toLocaleTimeString()}.` : ""} Official
          statistics for GCC economies commonly lag 1–2 years, and some indicators are not reported every year
          for every country — gaps in the chart reflect gaps in national reporting, not missing chart data.
          Figures for GDP, trade and oil rents are nominal unless otherwise noted.
        </div>
      </div>
    </div>
  );
}

function ChartTooltip({ active, payload, label, format }) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="gcc-tooltip">
      <div className="gcc-tooltip-year">{label}</div>
      {payload
        .filter((p) => p.value !== null && p.value !== undefined)
        .sort((a, b) => b.value - a.value)
        .map((p) => (
          <div className="gcc-tooltip-row" key={p.dataKey}>
            <span className="gcc-tooltip-swatch" style={{ background: p.stroke }} />
            <span style={{ color: "#8CA0A6" }}>{p.name}:</span>
            <span style={{ color: "#EDE6D6" }}>{formatValue(p.value, format)}</span>
          </div>
        ))}
    </div>
  );
}
