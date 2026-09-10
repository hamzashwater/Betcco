"use client";

import { motionIsReduced } from "@/lib/gsap";
import { useEffect, useRef } from "react";

type Particle = {
  x: number;
  y: number;
  radius: number;
  speed: number;
  alpha: number;
};

export function DeepSpaceBackground() {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const element = canvas.current;
    if (!element) return;

    const context = element.getContext("2d");
    if (!context) return;

    let frame = 0;
    let paused = document.visibilityState === "hidden";
    let width = 0;
    let height = 0;
    let dpr = 1;
    let particles: Particle[] = [];
    let pointer = { x: 0, y: 0 };
    const reducedMotion = motionIsReduced();

    const isLightTheme = () =>
      document.documentElement.dataset.theme === "light";

    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      element.width = Math.floor(width * dpr);
      element.height = Math.floor(height * dpr);
      element.style.width = `${width}px`;
      element.style.height = `${height}px`;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = width < 768 ? 42 : 86;
      particles = Array.from({ length: count }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        radius: Math.random() * 1.25 + 0.35,
        speed: Math.random() * 0.12 + 0.025,
        alpha: Math.random() * 0.55 + 0.15,
      }));
    };

    const render = () => {
      frame = 0;
      context.clearRect(0, 0, width, height);
      const lightTheme = isLightTheme();
      const parallaxX = reducedMotion ? 0 : pointer.x * 0.012;
      const parallaxY = reducedMotion ? 0 : pointer.y * 0.012;

      const background = context.createRadialGradient(
        width * 0.18 + parallaxX,
        height * 0.15 + parallaxY,
        0,
        width * 0.18,
        height * 0.15,
        Math.max(width, height) * 0.72,
      );
      background.addColorStop(
        0,
        lightTheme ? "rgba(33, 193, 166, 0.08)" : "rgba(33, 193, 166, 0.13)",
      );
      background.addColorStop(
        0.36,
        lightTheme ? "rgba(27, 79, 114, 0.035)" : "rgba(27, 79, 114, 0.07)",
      );
      background.addColorStop(1, "rgba(5, 10, 25, 0)");
      context.fillStyle = background;
      context.fillRect(0, 0, width, height);

      context.strokeStyle = lightTheme
        ? "rgba(13, 27, 42, 0.022)"
        : "rgba(184, 209, 214, 0.035)";
      context.lineWidth = 1;
      const grid = 46;
      for (let x = 0; x < width; x += grid) {
        context.beginPath();
        context.moveTo(x, 0);
        context.lineTo(x, height);
        context.stroke();
      }
      for (let y = 0; y < height; y += grid) {
        context.beginPath();
        context.moveTo(0, y);
        context.lineTo(width, y);
        context.stroke();
      }

      for (const particle of particles) {
        context.beginPath();
        context.fillStyle = lightTheme
          ? `rgba(27, 79, 114, ${particle.alpha * 0.38})`
          : `rgba(230, 247, 245, ${particle.alpha})`;
        context.arc(
          particle.x + parallaxX,
          particle.y + parallaxY,
          particle.radius,
          0,
          Math.PI * 2,
        );
        context.fill();
        if (!reducedMotion) {
          particle.y -= particle.speed;
          if (particle.y < -4) {
            particle.y = height + 4;
            particle.x = Math.random() * width;
          }
        }
      }

      const vignette = context.createRadialGradient(
        width / 2,
        height / 2,
        Math.min(width, height) * 0.15,
        width / 2,
        height / 2,
        Math.max(width, height) * 0.75,
      );
      vignette.addColorStop(0, "rgba(2, 6, 23, 0)");
      vignette.addColorStop(
        1,
        lightTheme ? "rgba(13, 27, 42, 0.035)" : "rgba(2, 6, 23, 0.46)",
      );
      context.fillStyle = vignette;
      context.fillRect(0, 0, width, height);

      if (!paused && !reducedMotion)
        frame = window.requestAnimationFrame(render);
    };

    const schedule = () => {
      if (!paused && !frame) frame = window.requestAnimationFrame(render);
    };
    const onResize = () => {
      resize();
      if (reducedMotion) render();
    };
    const onVisibilityChange = () => {
      paused = document.visibilityState === "hidden";
      if (paused && frame) {
        window.cancelAnimationFrame(frame);
        frame = 0;
      }
      schedule();
    };
    const onThemeChanged = () => {
      if (frame) {
        window.cancelAnimationFrame(frame);
        frame = 0;
      }
      render();
      if (!reducedMotion) schedule();
    };
    const onPointerMove = (event: PointerEvent) => {
      pointer = {
        x: event.clientX - width / 2,
        y: event.clientY - height / 2,
      };
    };

    resize();
    render();
    window.addEventListener("resize", onResize, { passive: true });
    if (!reducedMotion)
      window.addEventListener("pointermove", onPointerMove, { passive: true });
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("betcco:theme", onThemeChanged);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", onResize);
      if (!reducedMotion)
        window.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("betcco:theme", onThemeChanged);
    };
  }, []);

  return (
    <canvas ref={canvas} aria-hidden="true" className="deep-space-background" />
  );
}
