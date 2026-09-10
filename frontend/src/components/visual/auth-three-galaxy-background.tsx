"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

type PointCloud = {
  points: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>;
  positions: Float32Array;
};

function between(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function createPointSprite() {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const context = canvas.getContext("2d");
  if (!context) return null;

  const glow = context.createRadialGradient(32, 32, 0, 32, 32, 32);
  glow.addColorStop(0, "rgba(245, 246, 248, 1)");
  glow.addColorStop(0.2, "rgba(230, 247, 245, 0.92)");
  glow.addColorStop(0.55, "rgba(33, 193, 166, 0.22)");
  glow.addColorStop(1, "rgba(33, 193, 166, 0)");
  context.fillStyle = glow;
  context.fillRect(0, 0, 64, 64);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createStarField(count: number, sprite: THREE.Texture): PointCloud {
  const positions = new Float32Array(count * 3);
  for (let index = 0; index < count; index += 1) {
    const offset = index * 3;
    positions[offset] = between(-20, 20);
    positions[offset + 1] = between(-12, 12);
    positions[offset + 2] = between(-14, 7);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({
    color: "#e6f7f5",
    map: sprite,
    size: 0.12,
    transparent: true,
    opacity: 0.74,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
  });
  return { points: new THREE.Points(geometry, material), positions };
}

export function AuthThreeGalaxyBackground() {
  const mount = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = mount.current;
    if (!element) return;

    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const smallScreen = window.matchMedia("(max-width: 700px)").matches;
    const lowPower =
      navigator.hardwareConcurrency > 0 && navigator.hardwareConcurrency <= 4;
    const scale = smallScreen || lowPower ? 0.48 : 1;
    const starCount = Math.floor(4_000 * scale);
    const sprite = createPointSprite();
    if (!sprite) {
      element.classList.add("auth-three-galaxy--fallback");
      return;
    }

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: false,
        powerPreference: "high-performance",
      });
    } catch {
      sprite.dispose();
      element.classList.add("auth-three-galaxy--fallback");
      return;
    }

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(56, 1, 0.1, 100);
    camera.position.set(0, 0.5, 14);
    const starGroup = new THREE.Group();
    const stars = createStarField(starCount, sprite);
    starGroup.add(stars.points);
    scene.add(starGroup);

    const applyTheme = () => {
      const lightTheme = document.documentElement.dataset.theme === "light";
      stars.points.material.color.set(lightTheme ? "#1b4f72" : "#e6f7f5");
      stars.points.material.opacity = lightTheme ? 0.62 : 0.74;
    };

    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.35));
    element.appendChild(renderer.domElement);

    let frame = 0;
    let visible = document.visibilityState === "visible";
    let inViewport = true;
    let lastTime = performance.now();
    const pointer = new THREE.Vector2();
    const targetPointer = new THREE.Vector2();

    const resize = () => {
      const width = element.clientWidth || window.innerWidth;
      const height = element.clientHeight || window.innerHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    };
    const render = (now: number) => {
      if (!visible || !inViewport) {
        frame = window.requestAnimationFrame(render);
        return;
      }
      const delta = Math.min(0.05, (now - lastTime) / 1_000);
      lastTime = now;
      pointer.lerp(targetPointer, 0.045);
      starGroup.rotation.y += delta * 0.012;
      starGroup.rotation.x = THREE.MathUtils.lerp(
        starGroup.rotation.x,
        pointer.y * 0.018,
        0.03,
      );
      starGroup.position.x = THREE.MathUtils.lerp(
        starGroup.position.x,
        pointer.x * 0.34,
        0.025,
      );
      starGroup.position.y = THREE.MathUtils.lerp(
        starGroup.position.y,
        -pointer.y * 0.18,
        0.025,
      );
      const positions = stars.positions;
      for (let index = 2; index < positions.length; index += 3) {
        positions[index] += delta * 0.32;
        if (positions[index] > 7) positions[index] = -14;
      }
      (
        stars.points.geometry.attributes.position as THREE.BufferAttribute
      ).needsUpdate = true;
      renderer.render(scene, camera);
      frame = window.requestAnimationFrame(render);
    };
    const onPointerMove = (event: PointerEvent) => {
      targetPointer.set(
        (event.clientX / window.innerWidth - 0.5) * 2,
        (event.clientY / window.innerHeight - 0.5) * 2,
      );
    };
    const onVisibilityChange = () => {
      visible = document.visibilityState === "visible";
    };
    const observer = new IntersectionObserver(([entry]) => {
      inViewport = entry.isIntersecting;
    });

    resize();
    applyTheme();
    observer.observe(element);
    window.addEventListener("resize", resize, { passive: true });
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("betcco:theme", applyTheme);
    if (!reducedMotion)
      window.addEventListener("pointermove", onPointerMove, { passive: true });

    if (reducedMotion) renderer.render(scene, camera);
    else frame = window.requestAnimationFrame(render);

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", resize);
      if (!reducedMotion)
        window.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("betcco:theme", applyTheme);
      scene.traverse((item) => {
        if (item instanceof THREE.Points) {
          item.geometry.dispose();
          item.material.dispose();
        }
      });
      sprite.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  return <div ref={mount} className="auth-three-galaxy" aria-hidden="true" />;
}
