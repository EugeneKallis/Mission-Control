"use client";

import { useState } from "react";
import type { ScrapeResultView } from "./scraper-types";

interface ScraperCardProps {
  result: ScrapeResultView;
  onDownload: (id: number) => void;
  onHide: (id: number) => void;
}

/**
 * Individual scrape result card. Mirrors the `.scraper-card` markup in
 * scraper.templ: tall image area, title, tag chips, DL + Hide buttons.
 * PornRips gets a side-by-side image layout (up to 2 images).
 */
export function ScraperCard({ result, onDownload, onHide }: ScraperCardProps) {
  const isPornRips = result.source === "pornrips";
  const images = isPornRips ? result.images : [];
  const primaryImage = isPornRips && images.length > 0 ? images[0] : result.image;

  return (
    <div
      className="scraper-card card-snap-area flex flex-col transition-transform hover:-translate-y-1 relative overflow-hidden rounded-none"
      data-tags={result.tags.join(",")}
      data-id={result.id}
      style={{
        background: "#131313",
        border: "1px solid rgba(59, 75, 63, 0.3)",
      }}
    >
      <div
        className="flex-1 min-h-0 max-h-[calc(100dvh-14rem)] md:max-h-[calc(100dvh-10rem)] overflow-hidden relative"
        style={{ background: "#0E0E0E" }}
      >
        {isPornRips ? (
          <div className="flex flex-row h-full gap-[1px]">
            {images.length > 0 ? (
              images.slice(0, 2).map((img, idx) => (
                <div
                  key={idx}
                  className="flex-1 flex items-center justify-center min-h-0 overflow-hidden"
                  style={{ background: "#0E0E0E" }}
                >
                  <a
                    href={img}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block w-full h-full flex items-center justify-center"
                  >
                    <RemoteImage
                      src={img}
                      alt={`${result.title} - ${idx + 1}`}
                    />
                  </a>
                </div>
              ))
            ) : (
              <ImagePlaceholder />
            )}
          </div>
        ) : primaryImage ? (
          <div className="w-full h-full flex items-center justify-center">
            <RemoteImage src={primaryImage} alt={result.title} />
          </div>
        ) : (
          <ImagePlaceholder />
        )}

        {result.is_downloaded && (
          <div
            className="absolute top-2 right-2 px-2.5 py-0.5 text-xs font-bold shadow-md z-10 rounded-none"
            style={{ background: "#00FF9C", color: "#002110" }}
          >
            DOWNLOADED
          </div>
        )}
      </div>

      <div className="p-4 pb-3">
        <h3
          className="text-base font-bold break-words leading-snug line-clamp-2"
          style={{ color: "#E5E2E1" }}
        >
          {result.title}
        </h3>
        {result.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {result.tags.map((tag) => (
              <span
                key={tag}
                className="inline-block text-[10px] px-2 py-0.5 rounded-full border"
                style={{
                  background: "#201F1F",
                  color: "#849587",
                  borderColor: "rgba(59, 75, 63, 0.3)",
                }}
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="px-4 pb-4 flex flex-row gap-2">
        <button
          id={`dl-btn-${result.id}`}
          onClick={() => onDownload(result.id)}
          className="flex-1 inline-flex items-center justify-center py-2.5 text-sm font-semibold rounded-none transition-colors"
          style={{ background: "#f43f5e", color: "#fff" }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = "#e11d48";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = "#f43f5e";
          }}
        >
          DL
        </button>
        <button
          id={`hide-btn-${result.id}`}
          onClick={() => onHide(result.id)}
          className="flex-1 inline-flex items-center justify-center py-2.5 text-xs font-bold uppercase tracking-wider rounded-none transition-all"
          style={{ border: "1px solid rgba(59, 75, 63, 0.3)", color: "#849587" }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = "#2A2A2A";
            (e.currentTarget as HTMLButtonElement).style.color = "#E5E2E1";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = "transparent";
            (e.currentTarget as HTMLButtonElement).style.color = "#849587";
          }}
        >
          <span
            className="material-symbols-outlined text-sm mr-1"
            style={{ fontSize: "14px" }}
          >
            visibility_off
          </span>
          Hide
        </button>
      </div>
    </div>
  );
}

function RemoteImage({ src, alt }: { src: string; alt: string }) {
  const [broken, setBroken] = useState(false);
  if (broken) return <ImagePlaceholder />;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      className="w-full h-full object-contain"
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setBroken(true)}
    />
  );
}

function ImagePlaceholder() {
  return (
    <div
      className="w-full h-full flex items-center justify-center"
      style={{ background: "#1C1B1B" }}
    >
      <span className="material-symbols-outlined text-4xl" style={{ color: "#849587" }}>
        movie
      </span>
    </div>
  );
}
