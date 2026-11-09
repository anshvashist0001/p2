import React from "react";

export default function ForecastChart({ forecast }) {
  const values = [
      ...forecast.history.map((p) => p.units),
      ...forecast.forecast.map((p) => p.units),
    ],
    max = Math.max(...values, 1);
  const point = (v, i) =>
    `${8 + (i * 284) / (values.length - 1)},${83 - (v / max) * 66}`;
  return (
    <svg
      className="chart"
      viewBox="0 0 300 100"
      role="img"
      aria-label={`14 days of recorded sales and 14 days of forecast for ${forecast.name}`}
    >
      <line x1="8" x2="292" y1="83" y2="83" stroke="#e7ece9" />
      <line
        x1="8"
        x2="292"
        y1="45"
        y2="45"
        stroke="#edf0ed"
        strokeDasharray="3 4"
      />
      <polyline
        points={forecast.history.map((p, i) => point(p.units, i)).join(" ")}
        fill="none"
        stroke="#4b8e77"
        strokeWidth="2.5"
      />
      <polyline
        points={values
          .slice(13)
          .map((v, i) => point(v, i + 13))
          .join(" ")}
        fill="none"
        stroke="#8a9a63"
        strokeWidth="2.5"
        strokeDasharray="5 4"
      />
    </svg>
  );
}
