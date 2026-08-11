type WeatherConditionArtworkProps = {
  className?: string;
  conditions?: string;
  icon?: string;
  monochrome?: boolean;
};

export function WeatherConditionArtwork({ className = "", conditions = "", icon = "☀", monochrome = false }: WeatherConditionArtworkProps) {
  const sunny = /(?:☀|sun|clear)/i.test(`${icon} ${conditions}`);
  return <span className={`${className} weather-condition-artwork ${monochrome ? "monochrome" : ""}`.trim()} aria-hidden="true">
    {sunny
      ? <svg className="weather-sun-artwork" viewBox="0 0 100 100" focusable="false">
        <g className="weather-sun-rays">
          {Array.from({ length: 8 }, (_, index) =>
            <path d="M50 1 43.5 20.5 56.5 20.5Z" key={index} transform={`rotate(${index * 45} 50 50)`} />)}
        </g>
        <circle className="weather-sun-rim" cx="50" cy="50" r="27" />
        <circle className="weather-sun-face" cx="50" cy="50" r="23.5" />
        <ellipse className="weather-sun-highlight" cx="42" cy="39" rx="9" ry="7" />
      </svg>
      : <span className="weather-condition-emoji">{icon || "●"}</span>}
  </span>;
}

export function WeatherDropArtwork({ className = "" }: { className?: string }) {
  return <svg className={`${className} weather-drop-artwork`.trim()} viewBox="0 0 24 30" aria-hidden="true" focusable="false">
    <path d="M12 1.2C10.1 6.1 3.2 13.1 3.2 19.1a8.8 8.8 0 0 0 17.6 0c0-6-6.9-13-8.8-17.9Z" />
    <path className="weather-drop-highlight" d="M8.1 18.1c0 3 1.7 5.2 4.7 6.3-4.5.5-7.1-1.9-7.1-5.7 0-2.1 1.3-4.8 3.8-8.1-1 3.1-1.4 5.6-1.4 7.5Z" />
  </svg>;
}

export function WeatherWindArtwork({ className = "" }: { className?: string }) {
  return <svg className={`${className} weather-wind-artwork`.trim()} viewBox="0 0 36 28" aria-hidden="true" focusable="false">
    <path d="M2 8h20.2c4.2 0 4.2-5.8.2-5.8-1.8 0-3.1.8-3.9 2" />
    <path d="M2 14h28.1c4.6 0 4.8 6.4.1 6.4-2.1 0-3.7-1-4.5-2.4" />
    <path d="M2 20h15.8" />
  </svg>;
}
