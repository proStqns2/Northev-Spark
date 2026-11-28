'use client';

import { useEffect, useRef, useState } from 'react';
// import explicite : les tests de rendu (tsx) n'appliquent pas le JSX automatique
import React from 'react';
import { PerfectCursor } from 'perfect-cursors';

/**
 * Curseur interpolé par `perfect-cursors` (le moteur utilisé par tldraw) :
 * la position reçue n'est pas appliquée brutalement, elle est lissée par une
 * spline de Bézier de sorte que le mouvement reste fluide même si le réseau
 * livre les points par paquets (SSE à ~10 Hz).
 */
export function InterpolatedCursor({
  point,
  children,
  className,
}: {
  point: [number, number];
  children?: React.ReactNode;
  className?: string;
}) {
  const elementRef = useRef<HTMLDivElement | null>(null);
  const cursorRef = useRef<PerfectCursor | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    const apply = (position: number[]) => {
      element.style.transform = `translate(${position[0]}px, ${position[1]}px)`;
    };

    const cursor = new PerfectCursor((position) => apply(position));
    cursorRef.current = cursor;
    apply([point[0], point[1]]);
    setReady(true);

    return () => {
      cursor.dispose();
      cursorRef.current = null;
    };
    // la position initiale ne doit pas recréer l'animateur
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    cursorRef.current?.addPoint([point[0], point[1]]);
  }, [point[0], point[1]]);

  return (
    <div
      ref={elementRef}
      className={className}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        pointerEvents: 'none',
        willChange: 'transform',
        opacity: ready ? 1 : 0,
        transition: 'opacity .2s ease',
      }}
    >
      {children}
    </div>
  );
}
