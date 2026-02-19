'use client';

import React, { useEffect, useRef, useState } from 'react';

interface BotStats {
  totalTrades: number;
  winRate: number;
  todaysPnL: number;
  patternCount: number;
  lastTrade?: {
    symbol: string;
    direction: 'UP' | 'DOWN';
    timeframe: string;
    result: 'WIN' | 'LOSS';
    pnl: number;
  };
  learningEvent?: string;
  activePatterns: number;
  strategyWeights?: Record<string, number>;
}

export interface NeuralNetwork3DHandle {
  triggerWin: (startX?: number, startY?: number, startZ?: number) => void;
  triggerLoss: (startX?: number, startY?: number, startZ?: number) => void;
  triggerLearning: () => void;
}

interface NeuralNetwork3DProps {
  botStats: BotStats;
}

interface NodeData {
  id: string;
  label: string;
  x: number;
  y: number;
  z: number;
  layer: number;
  color: string;
  radius: number;
  isActive: boolean;
  intensity: number;
}

interface EdgeData {
  from: string;
  to: string;
  intensity: number;
}

interface Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
}

export const NeuralNetwork3D = React.forwardRef<NeuralNetwork3DHandle, NeuralNetwork3DProps>(
  ({ botStats }, ref) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const sceneRef = useRef<any>(null);
    const cameraRef = useRef<any>(null);
    const rendererRef = useRef<any>(null);
    const nodesRef = useRef<Map<string, any>>(new Map());
    const edgesRef = useRef<any[]>([]);
    const particlesRef = useRef<Particle[]>([]);
    const groupRef = useRef<any>(null);
    const animationIdRef = useRef<number | undefined>(undefined);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
      // Load Three.js from CDN if not already loaded
      if (typeof (window as any).THREE === 'undefined') {
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
        script.async = true;
        script.onload = () => {
          initScene();
          setIsLoading(false);
        };
        document.head.appendChild(script);
      } else {
        initScene();
        setIsLoading(false);
      }

      return () => {
        if (animationIdRef.current) {
          cancelAnimationFrame(animationIdRef.current);
        }
        if (rendererRef.current) {
          rendererRef.current.dispose();
        }
      };
    }, []);

    const initScene = () => {
      const THREE = (window as any).THREE;
      if (!canvasRef.current) return;

      const width = canvasRef.current.clientWidth;
      const height = canvasRef.current.clientHeight;

      // Scene setup
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x0f172a);
      scene.fog = new THREE.Fog(0x0f172a, 100, 500);
      sceneRef.current = scene;

      // Camera setup
      const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
      camera.position.set(0, 15, 25);
      camera.lookAt(0, 0, 0);
      cameraRef.current = camera;

      // Renderer setup
      const renderer = new THREE.WebGLRenderer({
        canvas: canvasRef.current,
        antialias: true,
        alpha: true,
        powerPreference: 'high-performance'
      });
      renderer.setSize(width, height);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFShadowShadowMap;
      rendererRef.current = renderer;

      // Lighting
      const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
      scene.add(ambientLight);

      const pointLight1 = new THREE.PointLight(0x00ffff, 1.5, 100);
      pointLight1.position.set(30, 30, 30);
      pointLight1.castShadow = true;
      scene.add(pointLight1);

      const pointLight2 = new THREE.PointLight(0xff00ff, 1, 80);
      pointLight2.position.set(-30, 20, 30);
      scene.add(pointLight2);

      // Main group for all network elements
      const group = new THREE.Group();
      scene.add(group);
      groupRef.current = group;

      // Create neural network
      createNeuralNetwork(THREE, group);

      // Handle window resize
      const handleResize = () => {
        const newWidth = canvasRef.current?.clientWidth || width;
        const newHeight = canvasRef.current?.clientHeight || height;
        camera.aspect = newWidth / newHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(newWidth, newHeight);
      };

      window.addEventListener('resize', handleResize);

      // Mouse interaction
      let mouseX = 0;
      let mouseY = 0;
      const onMouseMove = (event: MouseEvent) => {
        mouseX = (event.clientX / width) * 2 - 1;
        mouseY = -(event.clientY / height) * 2 + 1;
      };

      canvasRef.current.addEventListener('mousemove', onMouseMove);

      // Animation loop
      const clock = new THREE.Clock();
      let autoRotateAngle = 0;

      const animate = () => {
        animationIdRef.current = requestAnimationFrame(animate);

        const delta = clock.getDelta();
        autoRotateAngle += 0.0003;

        // Auto-rotate with mouse influence
        group.rotation.y = autoRotateAngle + mouseX * 0.5;
        group.rotation.x = mouseY * 0.3;

        // Update node intensities based on activity
        updateNodeActivity();

        // Draw edges with pulsing effect
        updateEdges(THREE);

        // Update particles
        updateParticles(THREE);

        // Render
        renderer.render(scene, camera);
      };

      animate();

      // Cleanup
      return () => {
        window.removeEventListener('resize', handleResize);
        if (canvasRef.current) {
          canvasRef.current.removeEventListener('mousemove', onMouseMove);
        }
      };
    };

    const createNeuralNetwork = (THREE: any, group: any) => {
      const nodes: NodeData[] = [
        // Layer 1 - Input (bottom)
        { id: 'btc-feed', label: 'BTC Price', x: -12, y: 0, z: 0, layer: 1, color: '#00ffff', radius: 0.8, isActive: true, intensity: 1 },
        { id: 'sol-feed', label: 'SOL Price', x: -4, y: 0, z: 0, layer: 1, color: '#aa00ff', radius: 0.8, isActive: true, intensity: 1 },
        { id: 'flow-feed', label: 'Order Flow', x: 4, y: 0, z: 0, layer: 1, color: '#ffff00', radius: 0.8, isActive: false, intensity: 0.3 },
        { id: 'sentiment-feed', label: 'News Sentiment', x: 12, y: 0, z: 0, layer: 1, color: '#ffffff', radius: 0.8, isActive: false, intensity: 0.3 },

        // Layer 2 - Indicators
        { id: 'rsi', label: 'RSI', x: -15, y: 8, z: 0, layer: 2, color: '#ff3333', radius: 1, isActive: true, intensity: 0.8 },
        { id: 'macd', label: 'MACD', x: -9, y: 8, z: 0, layer: 2, color: '#0088ff', radius: 1, isActive: true, intensity: 0.7 },
        { id: 'ema', label: 'EMA Stack', x: -3, y: 8, z: 0, layer: 2, color: '#ff8800', radius: 1, isActive: true, intensity: 0.9 },
        { id: 'volume', label: 'Vol Delta', x: 3, y: 8, z: 0, layer: 2, color: '#00ffaa', radius: 1, isActive: false, intensity: 0.4 },
        { id: 'bb', label: 'Bollinger', x: 9, y: 8, z: 0, layer: 2, color: '#ff00ff', radius: 1, isActive: false, intensity: 0.3 },
        { id: 'arb', label: 'Arbitrage', x: 15, y: 8, z: 0, layer: 2, color: '#ffdd00', radius: 1, isActive: true, intensity: 0.6 },

        // Layer 3 - Strategies
        { id: 'ema-cross', label: 'EMA Cross', x: -12, y: 16, z: 0, layer: 3, color: '#0088ff', radius: 0.9, isActive: true, intensity: 0.8 },
        { id: 'rsi-rev', label: 'RSI Reversal', x: -6, y: 16, z: 0, layer: 3, color: '#ff3333', radius: 0.9, isActive: true, intensity: 0.7 },
        { id: 'breakout', label: 'Breakout', x: 0, y: 16, z: 0, layer: 3, color: '#00ff00', radius: 0.9, isActive: false, intensity: 0.5 },
        { id: 'vwap', label: 'VWAP Reversion', x: 6, y: 16, z: 0, layer: 3, color: '#aa00ff', radius: 0.9, isActive: false, intensity: 0.4 },
        { id: 'flow-strat', label: 'Order Flow', x: 12, y: 16, z: 0, layer: 3, color: '#ffff00', radius: 0.9, isActive: true, intensity: 0.6 },

        // Layer 4 - Ensemble/Decision
        { id: 'confidence', label: 'Confidence', x: 0, y: 24, z: 0, layer: 4, color: '#ffffff', radius: 1.5, isActive: true, intensity: 1 },

        // Layer 5 - Output
        { id: 'long-signal', label: 'LONG', x: -8, y: 32, z: 0, layer: 5, color: '#00ff00', radius: 1.2, isActive: true, intensity: 0.9 },
        { id: 'short-signal', label: 'SHORT', x: 0, y: 32, z: 0, layer: 5, color: '#ff3333', radius: 1.2, isActive: false, intensity: 0.3 },
        { id: 'skip-signal', label: 'SKIP', x: 8, y: 32, z: 0, layer: 5, color: '#888888', radius: 1.2, isActive: false, intensity: 0.3 },

        // Layer 6 - Learning
        { id: 'memory', label: 'Pattern Memory', x: -10, y: 40, z: 0, layer: 6, color: '#00ffff', radius: 1, isActive: true, intensity: 0.7 },
        { id: 'wl-tracker', label: 'Win/Loss', x: 0, y: 40, z: 0, layer: 6, color: '#00ff00', radius: 1, isActive: true, intensity: 0.8 },
        { id: 'param-adjust', label: 'Adjuster', x: 10, y: 40, z: 0, layer: 6, color: '#ff8800', radius: 1, isActive: true, intensity: 0.6 },
      ];

      // Create node meshes
      nodes.forEach(nodeData => {
        const geometry = new THREE.IcosahedronGeometry(nodeData.radius, 4);
        const material = new THREE.MeshStandardMaterial({
          color: new THREE.Color(nodeData.color),
          emissive: new THREE.Color(nodeData.color),
          emissiveIntensity: nodeData.intensity * 0.8,
          metalness: 0.7,
          roughness: 0.2,
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(nodeData.x, nodeData.y, nodeData.z);
        mesh.castShadow = true;
        mesh.receiveShadow = true;

        // Add halo effect
        const haloGeometry = new THREE.IcosahedronGeometry(nodeData.radius * 1.8, 4);
        const haloMaterial = new THREE.MeshBasicMaterial({
          color: new THREE.Color(nodeData.color),
          wireframe: true,
          opacity: 0.2 * nodeData.intensity,
          transparent: true,
        });
        const halo = new THREE.Mesh(haloGeometry, haloMaterial);
        halo.position.copy(mesh.position);

        group.add(mesh);
        group.add(halo);

        nodesRef.current.set(nodeData.id, {
          mesh,
          halo,
          originalRadius: nodeData.radius,
          color: nodeData.color,
          baseIntensity: nodeData.intensity,
          intensity: nodeData.intensity,
        });
      });

      // Create edges
      const edges: EdgeData[] = [
        // Input to Indicators
        { from: 'btc-feed', to: 'rsi', intensity: 0.6 },
        { from: 'btc-feed', to: 'macd', intensity: 0.7 },
        { from: 'btc-feed', to: 'ema', intensity: 0.9 },
        { from: 'btc-feed', to: 'arb', intensity: 0.5 },

        { from: 'sol-feed', to: 'rsi', intensity: 0.5 },
        { from: 'sol-feed', to: 'ema', intensity: 0.8 },
        { from: 'sol-feed', to: 'volume', intensity: 0.6 },

        { from: 'flow-feed', to: 'volume', intensity: 0.8 },
        { from: 'flow-feed', to: 'arb', intensity: 0.7 },

        { from: 'sentiment-feed', to: 'macd', intensity: 0.4 },
        { from: 'sentiment-feed', to: 'bb', intensity: 0.3 },

        // Indicators to Strategies
        { from: 'rsi', to: 'rsi-rev', intensity: 0.9 },
        { from: 'rsi', to: 'ema-cross', intensity: 0.6 },

        { from: 'macd', to: 'ema-cross', intensity: 0.8 },
        { from: 'macd', to: 'breakout', intensity: 0.7 },

        { from: 'ema', to: 'ema-cross', intensity: 0.95 },
        { from: 'ema', to: 'vwap', intensity: 0.7 },

        { from: 'volume', to: 'breakout', intensity: 0.6 },
        { from: 'volume', to: 'flow-strat', intensity: 0.8 },

        { from: 'arb', to: 'flow-strat', intensity: 0.7 },
        { from: 'arb', to: 'vwap', intensity: 0.6 },

        // Strategies to Ensemble
        { from: 'ema-cross', to: 'confidence', intensity: 0.9 },
        { from: 'rsi-rev', to: 'confidence', intensity: 0.85 },
        { from: 'breakout', to: 'confidence', intensity: 0.7 },
        { from: 'vwap', to: 'confidence', intensity: 0.75 },
        { from: 'flow-strat', to: 'confidence', intensity: 0.8 },

        // Ensemble to Output
        { from: 'confidence', to: 'long-signal', intensity: 0.9 },
        { from: 'confidence', to: 'short-signal', intensity: 0.7 },
        { from: 'confidence', to: 'skip-signal', intensity: 0.6 },

        // Output to Learning
        { from: 'long-signal', to: 'memory', intensity: 0.8 },
        { from: 'long-signal', to: 'wl-tracker', intensity: 0.85 },

        { from: 'short-signal', to: 'memory', intensity: 0.7 },
        { from: 'short-signal', to: 'wl-tracker', intensity: 0.8 },

        { from: 'wl-tracker', to: 'param-adjust', intensity: 0.9 },
        { from: 'param-adjust', to: 'rsi', intensity: 0.5 },
        { from: 'param-adjust', to: 'ema', intensity: 0.6 },
        { from: 'param-adjust', to: 'macd', intensity: 0.4 },
      ];

      edgesRef.current = edges.map(edge => ({
        ...edge,
        baseIntensity: edge.intensity,
      }));
    };

    const updateNodeActivity = () => {
      const time = Date.now() * 0.001;

      nodesRef.current.forEach((nodeData: any, id: string) => {
        // Pulse effect
        const pulse = Math.sin(time * 2) * 0.3 + 0.7;
        const targetIntensity = nodeData.baseIntensity * pulse;
        nodeData.intensity += (targetIntensity - nodeData.intensity) * 0.05;

        // Update material
        if (nodeData.mesh.material) {
          nodeData.mesh.material.emissiveIntensity = nodeData.intensity * 0.8;
        }

        // Update halo
        if (nodeData.halo.material) {
          nodeData.halo.material.opacity = nodeData.intensity * 0.2;
        }

        // Slight scale pulse for active nodes
        const scalePulse = 1 + Math.sin(time * 3 + id.charCodeAt(0)) * 0.05;
        nodeData.mesh.scale.set(scalePulse, scalePulse, scalePulse);
      });
    };

    const updateEdges = (THREE: any) => {
      const group = groupRef.current;
      if (!group) return;

      // Remove old edge lines
      const linesToRemove = group.children.filter((child: any) => child.isLine);
      linesToRemove.forEach((line: any) => {
        group.remove(line);
        line.geometry.dispose();
        (line as any).material.dispose();
      });

      const time = Date.now() * 0.001;

      // Draw edges
      edgesRef.current.forEach((edge, idx) => {
        const fromNode = nodesRef.current.get(edge.from);
        const toNode = nodesRef.current.get(edge.to);

        if (!fromNode || !toNode) return;

        const points = [
          fromNode.mesh.position.clone(),
          toNode.mesh.position.clone(),
        ];

        const geometry = new THREE.BufferGeometry().setFromPoints(points);

        // Pulsing intensity
        const pulse = Math.sin(time * 2 + idx * 0.5) * 0.4 + 0.6;
        const intensity = edge.baseIntensity * pulse;

        const material = new THREE.LineBasicMaterial({
          color: new THREE.Color(0x00ffff).lerp(new THREE.Color(0xff00ff), Math.sin(time + idx) * 0.5 + 0.5),
          linewidth: 1,
          opacity: intensity,
          transparent: true,
        });

        const line = new THREE.Line(geometry, material);
        (line as any).isLine = true;
        group.add(line);
      });
    };

    const updateParticles = (THREE: any) => {
      const group = groupRef.current;
      if (!group) return;

      // Update existing particles
      for (let i = particlesRef.current.length - 1; i >= 0; i--) {
        const p = particlesRef.current[i];
        p.x += p.vx;
        p.y += p.vy;
        p.z += p.vz;
        p.life -= 1;

        // Apply gravity
        p.vy -= 0.01;

        if (p.life <= 0) {
          particlesRef.current.splice(i, 1);
          // Remove from scene
          const particles = group.children.filter((child: any) => child.isParticle);
          if (particles[i]) {
            group.remove(particles[i]);
          }
        }
      }

      // Render particles
      particlesRef.current.forEach((p, idx) => {
        const opacity = (p.life / p.maxLife) * 0.8;
        const geometry = new THREE.SphereGeometry(p.size, 8, 8);
        const material = new THREE.MeshBasicMaterial({
          color: new THREE.Color(p.color),
          opacity,
          transparent: true,
          emissive: new THREE.Color(p.color),
          emissiveIntensity: opacity,
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(p.x, p.y, p.z);
        (mesh as any).isParticle = true;
        group.add(mesh);
      });
    };

    // Public API methods
    React.useImperativeHandle(ref, () => ({
      triggerWin: (startX = 0, startY = 24, startZ = 0) => {
        for (let i = 0; i < 15; i++) {
          particlesRef.current.push({
            x: startX,
            y: startY,
            z: startZ,
            vx: (Math.random() - 0.5) * 0.4,
            vy: (Math.random() - 0.5) * 0.3 + 0.3,
            vz: (Math.random() - 0.5) * 0.4,
            life: 60,
            maxLife: 60,
            color: '#00ff00',
            size: Math.random() * 0.3 + 0.2,
          });
        }
      },
      triggerLoss: (startX = 0, startY = 24, startZ = 0) => {
        for (let i = 0; i < 15; i++) {
          particlesRef.current.push({
            x: startX,
            y: startY,
            z: startZ,
            vx: (Math.random() - 0.5) * 0.4,
            vy: (Math.random() - 0.5) * 0.3 + 0.3,
            vz: (Math.random() - 0.5) * 0.4,
            life: 60,
            maxLife: 60,
            color: '#ff3333',
            size: Math.random() * 0.3 + 0.2,
          });
        }
      },
      triggerLearning: () => {
        // Ripple effect - create concentric circles of particles
        const centerNode = nodesRef.current.get('confidence');
        if (!centerNode) return;

        for (let i = 0; i < 20; i++) {
          const angle = (i / 20) * Math.PI * 2;
          particlesRef.current.push({
            x: centerNode.mesh.position.x,
            y: centerNode.mesh.position.y,
            z: centerNode.mesh.position.z,
            vx: Math.cos(angle) * 0.5,
            vy: 0.3,
            vz: Math.sin(angle) * 0.5,
            life: 80,
            maxLife: 80,
            color: '#ffaa00',
            size: 0.25,
          });
        }
      },
    }));

    if (isLoading) {
      return (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
          <div style={{ color: '#888', fontSize: '14px' }}>Loading 3D visualization...</div>
        </div>
      );
    }

    return (
      <canvas
        ref={canvasRef}
        style={{
          width: '100%',
          height: '100%',
          display: 'block',
          background: 'linear-gradient(to bottom, #0f172a 0%, #1a1f35 100%)',
        }}
      />
    );
  }
);

NeuralNetwork3D.displayName = 'NeuralNetwork3D';
