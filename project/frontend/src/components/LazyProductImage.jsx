import React, { useState, useEffect, useRef, memo } from "react";
import { Store, ImageOff } from "lucide-react";

// Global in-memory cache to remember already loaded image URLs during current app session
const loadedImageUrls = new Set();

/**
 * High-Performance Lazy-Loading Product Image Component
 * - IntersectionObserver with 250px anticipatory rootMargin for silky-smooth scrolling
 * - decoding="async" prevents frame drops on low-end tablets / Sunmi hardware
 * - In-memory loaded URL cache prevents image flicker during category switching
 * - Graceful fallback on broken image links
 * - Subtle shimmer placeholder during fetch
 */
export const LazyProductImage = memo(function LazyProductImage({
  src,
  alt = "",
  className = "h-full w-full object-cover",
  placeholderIcon: PlaceholderIcon = Store,
  iconSize = 28,
  priority = false, // If true (e.g. quick keys or top items), loads immediately
}) {
  const isCached = src ? loadedImageUrls.has(src) : false;
  const [isIntersecting, setIsIntersecting] = useState(priority || isCached);
  const [isLoaded, setIsLoaded] = useState(isCached);
  const [hasError, setHasError] = useState(false);
  const imgRef = useRef(null);

  useEffect(() => {
    if (!src) {
      setHasError(false);
      setIsLoaded(false);
      return;
    }

    if (loadedImageUrls.has(src)) {
      setIsIntersecting(true);
      setIsLoaded(true);
      setHasError(false);
      return;
    }

    if (priority) {
      setIsIntersecting(true);
      return;
    }

    // Use IntersectionObserver for ultra-efficient deferred loading
    if (typeof IntersectionObserver !== "undefined") {
      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              setIsIntersecting(true);
              if (imgRef.current) {
                observer.unobserve(imgRef.current);
              }
            }
          });
        },
        {
          rootMargin: "250px 0px", // Preload 250px before entering viewport
          threshold: 0.01,
        }
      );

      if (imgRef.current) {
        observer.observe(imgRef.current);
      }

      return () => {
        if (imgRef.current) {
          try {
            observer.unobserve(imgRef.current);
          } catch (e) {}
        }
      };
    } else {
      // Fallback for environments without IntersectionObserver
      setIsIntersecting(true);
    }
  }, [src, priority]);

  if (!src) {
    return (
      <div className="h-full w-full grid place-items-center text-zinc-300 bg-zinc-100/80">
        <PlaceholderIcon size={iconSize} />
      </div>
    );
  }

  if (hasError) {
    return (
      <div className="h-full w-full grid place-items-center text-zinc-300 bg-zinc-100/80" title="Gambar tidak dapat dimuat">
        <ImageOff size={Math.max(18, Math.round(iconSize * 0.75))} />
      </div>
    );
  }

  return (
    <div ref={imgRef} className="relative h-full w-full overflow-hidden bg-zinc-100">
      {/* Placeholder skeleton while loading */}
      {!isLoaded && (
        <div className="absolute inset-0 grid place-items-center text-zinc-300 animate-pulse bg-zinc-100">
          <PlaceholderIcon size={iconSize} />
        </div>
      )}

      {isIntersecting && (
        <img
          src={src}
          alt={alt}
          loading={priority ? "eager" : "lazy"}
          decoding="async"
          fetchPriority={priority ? "high" : "low"}
          onLoad={() => {
            loadedImageUrls.add(src);
            setIsLoaded(true);
          }}
          onError={() => {
            setHasError(true);
          }}
          className={`${className} transition-opacity duration-200 ${
            isLoaded ? "opacity-100" : "opacity-0"
          }`}
        />
      )}
    </div>
  );
});

export default LazyProductImage;
