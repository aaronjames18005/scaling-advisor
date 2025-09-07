import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { ZoomIn, ZoomOut, RotateCcw, Database, Scale, Server } from "lucide-react";
import { motion } from "framer-motion";

type NodeType = "db" | "lb" | "api";

type CanvasNode = {
  id: string;
  type: NodeType;
  x: number;
  y: number;
  // optional extensible props
  props?: {
    engine?: string; // e.g. "postgres"
    replicas?: number; // for API
  };
};

type Edge = {
  id: string;
  fromId: string;
  toId: string;
};

export function InfraCanvas({
  projectId,
  onGenerated,
  projectName,
}: {
  projectId: string;
  onGenerated?: () => void;
  projectName: string;
}) {
  const generateFromCanvas = useMutation(api.configurations.generateFromCanvas);

  const [nodes, setNodes] = useState<CanvasNode[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const dragOffset = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragOver, setIsDragOver] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef<{ x: number; y: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [edges, setEdges] = useState<Edge[]>([]);
  const [connectingFromId, setConnectingFromId] = useState<string | null>(null);
  const [tempConnectPos, setTempConnectPos] = useState<{ x: number; y: number } | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);

  // Drag UI state for palette highlight + drop pulse
  const [draggingType, setDraggingType] = useState<NodeType | null>(null);
  const [dropPulse, setDropPulse] = useState<{ x: number; y: number; key: number } | null>(null);

  // Safety helpers for numeric operations (avoid NaN/Infinity)
  const clampZoom = (z: number) => Math.min(2, Math.max(0.9, Number.isFinite(z) ? z : 1)); // tighten zoom bounds for better proportions
  const safeNum = (n: number, fallback = 0) => (Number.isFinite(n) ? n : fallback);

  // Helper: estimate node width based on breakpoints for anchoring lines
  const estimateNodeWidth = () => {
    const w = typeof window !== "undefined" ? window.innerWidth : 1024;
    if (w >= 1024) return 144; // md:w-36
    if (w >= 640) return 128;  // sm:w-32
    return 112;                // w-28
  };
  const estimateNodeHeight = () => 72; // approximate; good enough for anchors

  // Compute vertical order index by Y position (top to bottom)
  const verticalOrder = useMemo(() => {
    const sorted = [...nodes].sort((a, b) => a.y - b.y);
    const map: Record<string, number> = {};
    sorted.forEach((n, i) => {
      map[n.id] = i + 1; // 1-based rank
    });
    return map;
  }, [nodes]);

  useEffect(() => {
    // Ensure we don't end up with invalid pan/zoom after re-renders
    setZoom((z) => clampZoom(z));
    setPan((p) => ({ x: safeNum(p.x), y: safeNum(p.y) }));
  }, []);

  // Keyboard shortcuts: Ctrl/Cmd + (+ / - / 0)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const isMod = e.ctrlKey || e.metaKey;
      if (!isMod) return;

      // Prevent browser default zoom
      if (e.key === "=" || e.key === "+" || e.key === "-" || e.key === "0") {
        e.preventDefault();
      }

      if (e.key === "=" || e.key === "+") {
        setZoom((z) => clampZoom(z * 1.1));
      } else if (e.key === "-") {
        setZoom((z) => clampZoom(z * 0.9));
      } else if (e.key === "0") {
        setZoom(1);
        setPan({ x: 0, y: 0 });
      }
    };

    window.addEventListener("keydown", onKeyDown as any, { passive: false } as any);
    return () => window.removeEventListener("keydown", onKeyDown as any);
  }, []);

  // Prevent stuck drag/pan when mouseup happens outside the canvas
  useEffect(() => {
    const handleWindowMouseUp = () => {
      if (draggingId || isPanning) {
        setDraggingId(null);
        setIsPanning(false);
        panStart.current = null;
      }
    };
    window.addEventListener("mouseup", handleWindowMouseUp);
    window.addEventListener("blur", handleWindowMouseUp);
    return () => {
      window.removeEventListener("mouseup", handleWindowMouseUp);
      window.removeEventListener("blur", handleWindowMouseUp);
    };
  }, [draggingId, isPanning]);

  const addNode = (type: NodeType) => {
    const id = `${type}-${Math.random().toString(36).slice(2, 8)}`;
    const defaultProps =
      type === "db"
        ? { engine: "postgres" }
        : type === "api"
        ? { replicas: 2 }
        : undefined;
    setNodes((prev) => [
      ...prev,
      {
        id,
        type,
        x: 40 + prev.length * 24,
        y: 40 + prev.length * 24,
        props: defaultProps,
      },
    ]);
  };

  const addNodeAt = (type: NodeType, x: number, y: number) => {
    const id = `${type}-${Math.random().toString(36).slice(2, 8)}`;
    const defaultProps =
      type === "db"
        ? { engine: "postgres" }
        : type === "api"
        ? { replicas: 2 }
        : undefined;
    setNodes((prev) => [
      ...prev,
      {
        id,
        type,
        x: Math.max(0, Math.floor(x)),
        y: Math.max(0, Math.floor(y)),
        props: defaultProps,
      },
    ]);
  };

  const removeSelected = () => {
    if (!selectedId) return;
    setNodes((prev) => prev.filter((n) => n.id !== selectedId));
    setSelectedId(null);
  };

  // Add: clear all nodes helper
  const clearAll = () => {
    setNodes([]);
    setSelectedId(null);
  };

  const onMouseDownNode = (
    e: React.MouseEvent<HTMLDivElement>,
    id: string
  ) => {
    e.stopPropagation();
    e.preventDefault(); // Prevent text selection and browser drag interference
    const rect = (canvasRef.current as HTMLDivElement)?.getBoundingClientRect();
    const node = nodes.find((n) => n.id === id);
    if (!rect || !node) return;
    setSelectedId(id);
    setDraggingId(id);

    // account for pan & zoom
    const localX = (e.clientX - rect.left - pan.x) / zoom;
    const localY = (e.clientY - rect.top - pan.y) / zoom;

    dragOffset.current = {
      x: localX - node.x,
      y: localY - node.y,
    };
  };

  const canvasRef = useRef<HTMLDivElement>(null);

  const onMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();

    // Update temp connection position if drawing an edge
    if (connectingFromId) {
      const localX = (e.clientX - rect.left - pan.x) / zoom;
      const localY = (e.clientY - rect.top - pan.y) / zoom;
      setTempConnectPos({ x: Math.max(0, Math.floor(safeNum(localX, 0))), y: Math.max(0, Math.floor(safeNum(localY, 0))) });
      // don't return; allow node dragging if user started a drag on node instead of handle
    }

    // Panning
    if (isPanning && panStart.current) {
      try {
        const nextX = safeNum(e.clientX - panStart.current.x, pan.x);
        const nextY = safeNum(e.clientY - panStart.current.y, pan.y);
        setPan({ x: nextX, y: nextY });
      } catch (err) {
        console.warn("Pan error:", err);
      }
      return;
    }

    // Node dragging
    if (!draggingId) return;
    const localX = (e.clientX - rect.left - pan.x) / zoom;
    const localY = (e.clientY - rect.top - pan.y) / zoom;

    const nextX = localX - dragOffset.current.x;
    const nextY = localY - dragOffset.current.y;

    setNodes((prev) =>
      prev.map((n) =>
        n.id === draggingId
          ? {
              ...n,
              x: Math.max(0, Math.floor(safeNum(nextX, n.x))),
              y: Math.max(0, Math.floor(safeNum(nextY, n.y))),
            }
          : n
      )
    );
  };

  const onMouseUp = () => {
    setDraggingId(null);
    setIsPanning(false);
    panStart.current = null;
    // Cancel connection if released on empty canvas
    if (connectingFromId) {
      setConnectingFromId(null);
      setTempConnectPos(null);
    }
  };

  const onDragStartPalette = (e: React.DragEvent<HTMLDivElement>, type: NodeType) => {
    e.dataTransfer.setData("text/plain", type);
    // Indicate move to user agents
    e.dataTransfer.effectAllowed = "copyMove";
    // Add visual state
    setDraggingType(type);
  };

  const onDragOverCanvas = (e: React.DragEvent<HTMLDivElement>) => {
    // Allow drop + visual feedback
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    if (!isDragOver) setIsDragOver(true);
  };

  const onDragLeaveCanvas = () => {
    setIsDragOver(false);
    // If leaving the canvas entirely, remove drag highlight
    setDraggingType(null);
  };

  const onDropCanvas = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const type = e.dataTransfer.getData("text/plain") as NodeType;
    if (!type || !["db", "lb", "api"].includes(type)) return;

    // Convert to inner (zoomed/panned) coordinates
    const localX = (e.clientX - rect.left - pan.x) / zoom;
    const localY = (e.clientY - rect.top - pan.y) / zoom;

    const x = localX - 14;
    const y = localY - 14;

    addNodeAt(type, Math.max(0, Math.floor(x)), Math.max(0, Math.floor(y)));
    setIsDragOver(false);

    // Drop pulse animation (brief ripple at drop point)
    setDropPulse({ x: Math.max(0, Math.floor(localX)), y: Math.max(0, Math.floor(localY)), key: Date.now() });
    setDraggingType(null);

    // Ensure native DnD state is cleared so the ghost doesn't appear "stuck"
    try { e.dataTransfer.clearData(); } catch {}
  };

  // Connect two nodes
  const tryConnectNodes = (fromId: string, toId: string) => {
    if (fromId === toId) return;
    // prevent duplicate (undirected-like) edges
    const exists = edges.some((e) => (e.fromId === fromId && e.toId === toId) || (e.fromId === toId && e.toId === fromId));
    if (exists) return;
    const id = `edge-${Math.random().toString(36).slice(2, 8)}`;
    setEdges((prev) => [...prev, { id, fromId, toId }]);
  };

  // Wheel zoom (Ctrl/Cmd + wheel)
  const onWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    try {
      const delta = -e.deltaY;
      if (!Number.isFinite(delta) || delta === 0) return;

      const factor = delta > 0 ? 1.1 : 0.9;
      const proposedZoom = clampZoom(zoom * factor);

      if (!canvasRef.current) {
        setZoom(proposedZoom);
        return;
      }

      const rect = canvasRef.current.getBoundingClientRect();
      const cursorX = safeNum(e.clientX - rect.left);
      const cursorY = safeNum(e.clientY - rect.top);

      const worldXBefore = (cursorX - pan.x) / zoom;
      const worldYBefore = (cursorY - pan.y) / zoom;

      const newPanX = cursorX - worldXBefore * proposedZoom;
      const newPanY = cursorY - worldYBefore * proposedZoom;

      // Apply clamped/safe values
      setZoom(proposedZoom);
      setPan({ x: safeNum(newPanX, pan.x), y: safeNum(newPanY, pan.y) });
    } catch (err) {
      console.warn("Zoom error:", err);
      // Fallback to safe defaults if something goes wrong
      setZoom((z) => clampZoom(z));
      setPan((p) => ({ x: safeNum(p.x), y: safeNum(p.y) }));
    }
  };

  const iconForType = (type: NodeType) => {
    if (type === "db") return "🗄️";
    if (type === "lb") return "⚖️";
    return "🖥️";
  };

  const labelForType = (type: NodeType) => {
    if (type === "db") return "Database";
    if (type === "lb") return "Load Balancer";
    return "API Server";
  };

  const handleGenerate = async () => {
    if (nodes.length === 0) {
      toast.info("Add some nodes to the canvas first.");
      return;
    }
    try {
      toast("Generating Terraform and Kubernetes from canvas...");
      await generateFromCanvas({
        projectId: projectId as any,
        nodes: nodes.map((n) => ({
          id: n.id,
          type: n.type,
          x: n.x,
          y: n.y,
          props: n.props ?? {},
        })) as any,
      });
      toast.success("Configs generated and saved to the project");
      onGenerated?.();
    } catch (e) {
      console.error("generateFromCanvas error", e);
      toast.error("Failed to generate from canvas");
    }
  };

  const selectedNode = useMemo(
    () => nodes.find((n) => n.id === selectedId) ?? null,
    [nodes, selectedId]
  );

  const updateSelectedProps = (updates: Partial<CanvasNode["props"]>) => {
    if (!selectedId) return;
    setNodes((prev) =>
      prev.map((n) =>
        n.id === selectedId ? { ...n, props: { ...(n.props ?? {}), ...updates } } : n
      )
    );
  };

  const { terraformPreview, k8sPreview } = useMemo(() => {
    const slug =
      projectName?.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "") || "app";
    const hasLB = nodes.some((n) => n.type === "lb");
    const apiNodes = nodes.filter((n) => n.type === "api");
    const dbNode = nodes.find((n) => n.type === "db");
    const dbEngine = dbNode?.props?.engine === "mysql" ? "mysql" : "postgres";

    // Terraform preview (concise)
    const tfHeader = `# Terraform (preview) for ${projectName}\nvariable "aws_region" { default = "us-west-2" }\nprovider "aws" { region = var.aws_region }\n`;
    const tfVPC = `# (preview) minimal VPC + security group omitted for brevity\n# Assume base VPC, subnets, and SG are defined elsewhere in generated output\n`;
    const tfDB =
      dbNode
        ? dbEngine === "postgres"
          ? `resource "aws_db_instance" "app" {\n  identifier = "${slug}-db"\n  engine = "postgres"\n  instance_class = "db.t3.micro"\n  allocated_storage = 20\n  username = "postgres"\n  password = "change-me"\n  skip_final_snapshot = true\n}\n`
          : `resource "aws_db_instance" "app" {\n  identifier = "${slug}-db"\n  engine = "mysql"\n  instance_class = "db.t3.micro"\n  allocated_storage = 20\n  username = "admin"\n  password = "change-me"\n  skip_final_snapshot = true\n}\n`
        : "";
    const tfLB = hasLB
      ? `resource "aws_lb" "main" {\n  name               = "${slug}-alb"\n  internal           = false\n  load_balancer_type = "application"\n}\n`
      : "";
    const tfHint = apiNodes.length
      ? `# Hint: add target group + listener to route traffic to your services\n`
      : "";

    const terraformPreview = `${tfHeader}\n${tfVPC}\n${tfDB}${tfLB}${tfHint}`.trim() + "\n";

    // Kubernetes preview (concise)
    const baseDeployHeader = `# Kubernetes (preview) for ${projectName}\n`;
    const deployments =
      apiNodes.length === 0
        ? `# No API nodes yet. Add an API node to preview deployments.`
        : apiNodes
            .map((n, i) => {
              const replicas = Math.max(1, Math.min(10, Number(n.props?.replicas ?? 2)));
              return `---\napiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: ${slug}-api-${i + 1}\n  labels:\n    app: ${slug}-api\nspec:\n  replicas: ${replicas}\n  selector:\n    matchLabels:\n      app: ${slug}-api\n  template:\n    metadata:\n      labels:\n        app: ${slug}-api\n    spec:\n      containers:\n      - name: api\n        image: ${slug}:latest\n        ports:\n        - containerPort: 3000\n`;
            })
            .join("\n");
    const service =
      apiNodes.length > 0
        ? `---\napiVersion: v1\nkind: Service\nmetadata:\n  name: ${slug}-api-svc\nspec:\n  selector:\n    app: ${slug}-api\n  ports:\n    - protocol: TCP\n      port: 80\n      targetPort: 3000\n  type: ${hasLB ? "LoadBalancer" : "ClusterIP"}\n`
        : "";

    const k8sPreview = `${baseDeployHeader}\n${deployments}\n${service}`.trim() + "\n";

    return { terraformPreview, k8sPreview };
  }, [nodes, projectName]);

  // Add: Delete/Backspace keyboard to remove selected node
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedId) {
          e.preventDefault();
          removeSelected();
        }
      }
    };
    window.addEventListener("keydown", onKeyDown as any);
    return () => window.removeEventListener("keydown", onKeyDown as any);
  }, [selectedId]);

  const isDragging = draggingId !== null;

  return (
    <div className="space-y-4">
      <Card className="glass">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Canvas</CardTitle>
          <div className="flex gap-2">
            {/* Removed: Add DB / Add LB / Add API header buttons */}
            {/* Removed: header zoom controls to prevent layout stretching */}

            {/* Actions */}
            <Button onClick={handleGenerate} className="glow-primary">
              Generate
            </Button>
            <Button variant="outline" onClick={clearAll}>
              Clear Canvas
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="mb-3 flex flex-wrap items-center gap-3 overflow-x-auto">
            <div className="text-xs text-muted-foreground">Drag to create:</div>
            {/* Animate chip while dragging - use wrapper div to receive native HTML drag events */}
            <div
              draggable
              onDragStart={(e) => onDragStartPalette(e, "db")}
              onDragEnd={() => setDraggingType(null)}
              className="inline-block"
            >
              <motion.div
                animate={
                  draggingType === "db"
                    ? { scale: 1.05, y: -2 }
                    : { scale: 1, y: 0 }
                }
                transition={{ type: "spring", stiffness: 350, damping: 22 }}
                className={`inline-flex items-center gap-2 px-3 py-1.5 text-xs rounded-full border bg-card/70 backdrop-blur hover:bg-primary/10 hover:text-primary hover:ring-1 hover:ring-primary/30 cursor-grab active:cursor-grabbing select-none transition-all shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${draggingType === "db" ? "ring-2 ring-primary/60" : ""}`}
                title="Drag to canvas"
                aria-label="Drag to create Database node"
                role="button"
                tabIndex={0}
                data-type="db"
              >
                <Database className="h-4 w-4" />
                <span className="font-medium">Database</span>
              </motion.div>
            </div>
            <div
              draggable
              onDragStart={(e) => onDragStartPalette(e, "lb")}
              onDragEnd={() => setDraggingType(null)}
              className="inline-block"
            >
              <motion.div
                animate={
                  draggingType === "lb"
                    ? { scale: 1.05, y: -2 }
                    : { scale: 1, y: 0 }
                }
                transition={{ type: "spring", stiffness: 350, damping: 22 }}
                className={`inline-flex items-center gap-2 px-3 py-1.5 text-xs rounded-full border bg-card/70 backdrop-blur hover:bg-accent/10 hover:text-accent hover:ring-1 hover:ring-accent/30 cursor-grab active:cursor-grabbing select-none transition-all shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 ${draggingType === "lb" ? "ring-2 ring-accent/60" : ""}`}
                title="Drag to canvas"
                aria-label="Drag to create Load Balancer node"
                role="button"
                tabIndex={0}
                data-type="lb"
              >
                <Scale className="h-4 w-4" />
                <span className="font-medium">Load Balancer</span>
              </motion.div>
            </div>
            <div
              draggable
              onDragStart={(e) => onDragStartPalette(e, "api")}
              onDragEnd={() => setDraggingType(null)}
              className="inline-block"
            >
              <motion.div
                animate={
                  draggingType === "api"
                    ? { scale: 1.05, y: -2 }
                    : { scale: 1, y: 0 }
                }
                transition={{ type: "spring", stiffness: 350, damping: 22 }}
                className={`inline-flex items-center gap-2 px-3 py-1.5 text-xs rounded-full border bg-card/70 backdrop-blur hover:bg-ring/10 hover:text-ring hover:ring-1 hover:ring-ring/30 cursor-grab active:cursor-grabbing select-none transition-all shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 ${draggingType === "api" ? "ring-2 ring-ring/60" : ""}`}
                title="Drag to canvas"
                aria-label="Drag to create API Server node"
                role="button"
                tabIndex={0}
                data-type="api"
              >
                <Server className="h-4 w-4" />
                <span className="font-medium">API Server</span>
              </motion.div>
            </div>
          </div>

          <div
            ref={canvasRef}
            className={`relative h-[55vh] sm:h-[60vh] md:h-[65vh] lg:h-[70vh] rounded-md border overflow-hidden transition-colors ${
              isDragOver ? "ring-2 ring-primary/60 bg-primary/5" : "bg-gradient-to-br from-background to-muted/40"
            } select-none touch-none ${isPanning ? "cursor-grabbing" : "cursor-grab"}`}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseUp}
            onMouseDown={(e) => {
              if ((e.target as HTMLElement).closest("[data-node]")) return;
              setSelectedId(null);
              setIsPanning(true);
              panStart.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
            }}
            onDragOver={onDragOverCanvas}
            onDragEnter={() => setIsDragOver(true)}
            onDragLeave={onDragLeaveCanvas}
            onDrop={onDropCanvas}
            onWheel={onWheel}
            onContextMenu={(e) => e.preventDefault()}
            role="application"
            aria-label="Infrastructure canvas. Drag to pan, mouse wheel with Ctrl or Cmd to zoom, drag items from palette to create nodes."
          >
            {/* Animated glow while dragging over */}
            <motion.div
              className="absolute inset-0 pointer-events-none rounded-md ring-2 ring-primary/60"
              initial={false}
              animate={{ opacity: isDragOver ? 1 : 0 }}
              transition={{ duration: 0.15, ease: "easeOut" }}
            />

            {/* Floating zoom controls inside canvas to avoid stretching layout */}
            <div className="absolute top-2 right-2 z-10 hidden sm:flex items-center">
              <div className="flex items-center gap-1 rounded-full border bg-card/70 backdrop-blur px-1.5 py-1 shadow-sm">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setZoom((z) => clampZoom(z * 0.9))}
                  aria-label="Zoom out"
                  title="Zoom out (Ctrl/Cmd + wheel)"
                  className="h-8 w-8"
                >
                  <ZoomOut className="h-4 w-4" />
                </Button>
                <div className="px-2 text-xs text-muted-foreground tabular-nums min-w-[44px] text-center">
                  {Math.round(zoom * 100)}%
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setZoom((z) => clampZoom(z * 1.1))}
                  aria-label="Zoom in"
                  title="Zoom in (Ctrl/Cmd + wheel)"
                  className="h-8 w-8"
                >
                  <ZoomIn className="h-4 w-4" />
                </Button>
                <div className="mx-1 h-5 w-px bg-border/70" />
                <Button
                  variant="outline"
                  onClick={() => {
                    setZoom(clampZoom(1));
                    setPan({ x: 0, y: 0 });
                  }}
                  aria-label="Reset view"
                  title="Reset view"
                  className="h-8 rounded-full"
                >
                  <RotateCcw className="h-3.5 w-3.5 mr-1" />
                  <span className="text-xs">Reset</span>
                </Button>
              </div>
            </div>

            {/* Inner world */}
            <div
              className="absolute inset-0"
              style={{
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                transformOrigin: "0 0",
                willChange: "transform",
              }}
            >
              {/* background grid with adaptive opacity on interactions */}
              <div
                className={`absolute inset-0 pointer-events-none [background-image:linear-gradient(to_right,hsl(var(--border))_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--border))_1px,transparent_1px)] [background-size:24px_24px] ${isDragging || isPanning ? "opacity-30" : "opacity-20"} [mask-image:radial-gradient(ellipse_at_center,black,transparent_70%)]`}
              />
              {/* drop hint */}
              {isDragOver && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="px-3 py-1.5 rounded-md text-xs bg-background/80 border shadow-sm">
                    Release to add node
                  </div>
                </div>
              )}

              {/* Drop pulse animation marker */}
              {dropPulse && (
                <>
                  {/* inner pulse */}
                  <motion.span
                    key={`${dropPulse.key}-inner`}
                    className="absolute h-10 w-10 -translate-x-1/2 -translate-y-1/2 rounded-full border border-primary/60 bg-primary/20 pointer-events-none"
                    style={{ left: dropPulse.x, top: dropPulse.y }}
                    initial={{ scale: 0.6, opacity: 0.5 }}
                    animate={{ scale: 1.4, opacity: 0 }}
                    transition={{ duration: 0.45, ease: "easeOut" }}
                  />
                  {/* outer subtle ring for a refined finish */}
                  <motion.span
                    key={`${dropPulse.key}-outer`}
                    className="absolute h-14 w-14 -translate-x-1/2 -translate-y-1/2 rounded-full border border-primary/30 bg-transparent pointer-events-none"
                    style={{ left: dropPulse.x, top: dropPulse.y }}
                    initial={{ scale: 0.7, opacity: 0.35 }}
                    animate={{ scale: 1.6, opacity: 0 }}
                    transition={{ duration: 0.65, ease: "easeOut" }}
                  />
                </>
              )}

              {/* Connections layer (SVG in world coordinates) */}
              <svg className="absolute inset-0 overflow-visible pointer-events-none">
                {/* Arrowhead marker definition for direction cues */}
                <defs>
                  <marker
                    id="arrowhead"
                    markerWidth="10"
                    markerHeight="10"
                    refX="8"
                    refY="5"
                    orient="auto"
                    markerUnits="userSpaceOnUse"
                  >
                    {/* Make arrowhead white */}
                    <path d="M0,0 L10,5 L0,10 z" fill="oklch(var(--foreground))" />
                  </marker>

                  {/* New: soft gradient for edges */}
                  <linearGradient id="edgeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="oklch(var(--ring))" stopOpacity="0.9" />
                    <stop offset="100%" stopColor="oklch(var(--primary))" stopOpacity="0.95" />
                  </linearGradient>
                  <linearGradient id="edgeGradientActive" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="oklch(var(--primary))" stopOpacity="0.9" />
                    <stop offset="100%" stopColor="oklch(var(--primary))" stopOpacity="1" />
                  </linearGradient>

                  {/* New: subtle glow for active/hovered edges */}
                  <filter id="edgeGlow" x="-50%" y="-50%" width="200%" height="200%">
                    <feGaussianBlur in="SourceGraphic" stdDeviation="1.2" result="blur" />
                    <feMerge>
                      <feMergeNode in="blur" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                </defs>
                {
                  edges.map((edge) => {
                    const from = nodes.find((n) => n.id === edge.fromId);
                    const to = nodes.find((n) => n.id === edge.toId);
                    if (!from || !to) return null;

                    const W = estimateNodeWidth();
                    const H = estimateNodeHeight();

                    // anchor from: right middle of source, to: left middle of target
                    const sx = from.x + W;
                    const sy = from.y + H / 2;
                    const tx = to.x;
                    const ty = to.y + H / 2;

                    const dx = Math.max(24, Math.abs(tx - sx) * 0.3);
                    const path = `M ${sx} ${sy} C ${sx + dx} ${sy}, ${tx - dx} ${ty}, ${tx} ${ty}`;

                    const isActive =
                      (hoveredNodeId !== null &&
                        (edge.fromId === hoveredNodeId || edge.toId === hoveredNodeId)) ||
                      (selectedId !== null &&
                        (edge.fromId === selectedId || edge.toId === selectedId));

                    // NEW: midpoint for visible "linked" cue
                    const mx = (sx + tx) / 2;
                    const my = (sy + ty) / 2;

                    return (
                      <g key={edge.id} className="pointer-events-none">
                        {/* thicker dark underlay for contrast (border) */}
                        <path
                          d={path}
                          // Change base rail to background to create a border under white line
                          stroke="oklch(var(--background))"
                          strokeWidth={isActive ? 6 : 5}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className={isActive ? "opacity-100" : "opacity-95"}
                          fill="none"
                        />
                        {/* visible white foreground with dash animation */}
                        <path
                          d={path}
                          stroke="oklch(var(--foreground))"
                          strokeWidth={isActive ? 3.2 : 2.6}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className={
                            isActive
                              ? "[stroke-dasharray:4_5] animate-[dash_0.85s_linear_infinite] opacity-100"
                              : "[stroke-dasharray:6_6] animate-[dash_1.15s_linear_infinite] opacity-95"
                          }
                          fill="none"
                          markerEnd="url(#arrowhead)"
                          filter={isActive ? "url(#edgeGlow)" : undefined}
                        />
                        {/* NEW: visible endpoint knots (source + target) */}
                        <circle
                          cx={sx}
                          cy={sy}
                          r={isActive ? 3.8 : 3.2}
                          fill="oklch(var(--foreground))"
                          className={isActive ? "opacity-95" : "opacity-90"}
                        />
                        <circle
                          cx={tx}
                          cy={ty}
                          r={isActive ? 3.8 : 3.2}
                          fill="oklch(var(--foreground))"
                          className={isActive ? "opacity-95" : "opacity-90"}
                        />
                        {/* midpoint "linked" label with larger font and stronger outline */}
                        <g transform={`translate(${mx}, ${my - 8})`}>
                          <text
                            x={0}
                            y={0}
                            textAnchor="middle"
                            alignmentBaseline="middle"
                            fontSize="12"
                            fontWeight={700}
                            fill="oklch(var(--foreground))"
                            className="opacity-100"
                          >
                            linked
                          </text>
                        </g>
                      </g>
                    );
                  })
                }

                {/* Temp connection preview */}
                {
                  connectingFromId && tempConnectPos && (() => {
                    const from = nodes.find((n) => n.id === connectingFromId);
                    if (!from) return null;
                    const W = estimateNodeWidth();
                    const H = estimateNodeHeight();
                    const sx = from.x + W;
                    const sy = from.y + H / 2;
                    const tx = tempConnectPos.x;
                    const ty = tempConnectPos.y;
                    const dx = Math.max(24, Math.abs(tx - sx) * 0.3);
                    const path = `M ${sx} ${sy} C ${sx + dx} ${sy}, ${tx - dx} ${ty}, ${tx} ${ty}`;

                    // NEW: midpoint for "linking" preview label
                    const mx = (sx + tx) / 2;
                    const my = (sy + ty) / 2;

                    return (
                      <g className="pointer-events-none">
                        {/* dark underlay for contrast */}
                        <path
                          d={path}
                          stroke="oklch(var(--background))"
                          strokeWidth={5.5}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="opacity-95"
                          fill="none"
                        />
                        <path
                          d={path}
                          stroke="oklch(var(--foreground))"
                          strokeWidth={3}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="opacity-100 [stroke-dasharray:4_6] animate-[dash_0.8s_linear_infinite]"
                          fill="none"
                          markerEnd="url(#arrowhead)"
                          filter="url(#edgeGlow)"
                        />
                        {/* preview endpoint knot (source): white */}
                        <circle cx={sx} cy={sy} r="3.8" fill="oklch(var(--foreground))" className="opacity-95" />
                        {/* "linking" midpoint cue with larger font and stronger outline */}
                        <g transform={`translate(${mx}, ${my - 8})`}>
                          <text
                            x={0}
                            y={0}
                            textAnchor="middle"
                            alignmentBaseline="middle"
                            fontSize="12"
                            fontWeight={700}
                            fill="oklch(var(--foreground))"
                            className="opacity-100"
                          >
                            linking…
                          </text>
                        </g>
                      </g>
                    );
                  })()
                }
              </svg>

              {nodes.map((n) => (
                <motion.div
                  key={n.id}
                  data-node
                  data-node-id={n.id}
                  draggable={false}
                  initial={{ scale: 0.95, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ duration: 0.15 }}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className={`absolute w-28 sm:w-32 md:w-36 select-none rounded-lg border shadow-sm transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70 ${
                    selectedId === n.id ? "ring-2 ring-primary glow-primary shadow-lg" : "hover:shadow-md"
                  } ${
                    draggingId === n.id ? "scale-[0.98] cursor-grabbing" : "cursor-move"
                  } backdrop-blur-sm ${
                    n.type === "db"
                      ? "bg-primary/10 border-primary/30 hover:bg-primary/15"
                      : n.type === "lb"
                      ? "bg-accent/10 border-accent/30 hover:bg-accent/15"
                      : "bg-ring/10 border-ring/30 hover:bg-ring/15"
                  }${connectingFromId && connectingFromId !== n.id ? " ring-1 ring-primary/40" : ""}`}
                  style={{ left: n.x, top: n.y }}
                  onMouseDown={(e) => onMouseDownNode(e, n.id)}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedId(n.id);
                  }}
                  onMouseEnter={() => setHoveredNodeId(n.id)}
                  onMouseLeave={() => setHoveredNodeId(null)}
                  title={`${labelForType(n.type)} • Drag to move`}
                  aria-label={`${labelForType(n.type)} node`}
                  aria-selected={selectedId === n.id}
                  role="button"
                  tabIndex={0}
                >
                  {/* Inline delete button to quickly remove nodes */}
                  <button
                    type="button"
                    aria-label="Remove node"
                    className="absolute top-1 right-1 h-5 w-5 rounded-full bg-background/70 border text-[10px] leading-none flex items-center justify-center hover:bg-destructive/10 hover:text-destructive transition-colors"
                    onClick={(e) => {
                      e.stopPropagation();
                      setNodes((prev) => prev.filter((x) => x.id !== n.id));
                      if (selectedId === n.id) setSelectedId(null);
                    }}
                  >
                    ×
                  </button>

                  {/* Connection count badge */}
                  {(() => {
                    const count = edges.reduce((acc, e) => acc + ((e.fromId === n.id || e.toId === n.id) ? 1 : 0), 0);
                    if (count === 0) return null;
                    return (
                      <span
                        className="absolute top-1 left-1 px-1.5 py-0.5 rounded text-[10px] leading-none border bg-background/80 text-muted-foreground"
                        title={`${count} connection${count === 1 ? "" : "s"}`}
                        aria-label={`${count} connections`}
                      >
                        {count}
                      </span>
                    );
                  })()}

                  {/* Vertical order badge (top-to-bottom flow index) */}
                  {verticalOrder[n.id] !== undefined && (
                    <span
                      className="absolute top-1 left-10 px-1.5 py-0.5 rounded text-[10px] leading-none border bg-background/80 text-primary"
                      title={`Vertical order: ${verticalOrder[n.id]} (top to bottom)`}
                      aria-label={`Order ${verticalOrder[n.id]}`}
                    >
                      #{verticalOrder[n.id]}
                    </span>
                  )}

                  <div
                    className={`px-2 py-1 text-xs font-semibold flex items-center gap-2 rounded-t-lg tracking-wide ${
                      n.type === "db"
                        ? "bg-primary/15 text-primary"
                        : n.type === "lb"
                        ? "bg-accent/15 text-accent"
                        : "bg-ring/15 text-ring"
                    }`}
                  >
                    <span className="inline-flex items-center justify-center w-1.5 h-1.5 rounded-full bg-current" />
                    <span className="inline-block text-[14px] leading-none"> {iconForType(n.type)}</span>
                    <span className="truncate uppercase">{labelForType(n.type)}</span>
                  </div>
                  <div className="p-2 text-[10px] sm:text-[11px] text-muted-foreground space-x-1">
                    {n.type === "db" && (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
                        engine: {n.props?.engine ?? "postgres"}
                      </span>
                    )}
                    {n.type === "api" && (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-ring/10 text-ring border border-ring/20">
                        replicas: {n.props?.replicas ?? 2}
                      </span>
                    )}
                    {n.type === "lb" && (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-accent/10 text-accent border border-accent/20">
                        public: true
                      </span>
                    )}
                  </div>

                  {/* Connection handle (bottom-center) */}
                  {(() => {
                    const count = edges.reduce((acc, e) => acc + ((e.fromId === n.id || e.toId === n.id) ? 1 : 0), 0);
                    const emphasized = count > 0 || connectingFromId === n.id;
                    return (
                      <div
                        className={`absolute left-1/2 -translate-x-1/2 -bottom-2 h-5 w-5 rounded-full border bg-background/80 shadow-sm flex items-center justify-center cursor-crosshair hover:bg-primary/10 ${emphasized ? "border-primary/60 ring-1 ring-primary/40" : "hover:border-primary/50"}`}
                        title="Drag to connect"
                        role="button"
                        aria-label="Drag to connect to another node"
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          setConnectingFromId(n.id);
                          setTempConnectPos(null);
                        }}
                        onMouseUp={(e) => {
                          // releasing on same handle cancels
                          e.stopPropagation();
                          if (connectingFromId) {
                            setConnectingFromId(null);
                            setTempConnectPos(null);
                          }
                        }}
                      >
                        <span className={`block rounded-full ${emphasized ? "bg-primary h-2 w-2" : "bg-primary h-1.5 w-1.5"}`} />
                      </div>
                    );
                  })()}

                  {/* Allow connecting by dropping onto a node */}
                  <div
                    className="absolute inset-0"
                    onMouseUp={(e) => {
                      // Do not stop propagation, so canvas/window mouseup can clear drag state
                      if (connectingFromId && connectingFromId !== n.id) {
                        tryConnectNodes(connectingFromId, n.id);
                      }
                      setConnectingFromId(null);
                      setTempConnectPos(null);
                    }}
                  />
                </motion.div>
              ))}
            </div>

            {isPanning && (
              <div className="pointer-events-none absolute top-2 left-2 px-2 py-1 rounded-md border bg-card/80 text-[11px] shadow-sm backdrop-blur">
                Panning…
              </div>
            )}

            {isDragging && (
              <div className="pointer-events-none absolute top-2 left-24 px-2 py-1 rounded-md border bg-card/80 text-[11px] shadow-sm backdrop-blur">
                Dragging…
              </div>
            )}

            {/* Status HUD (does not pan/zoom) */}
            <div className="pointer-events-none absolute bottom-2 right-2 flex items-center gap-2" role="status" aria-live="polite">
              <div className="px-2 py-1 rounded-md border bg-card/80 text-[11px] shadow-sm backdrop-blur">
                Zoom: <span className="font-mono">{Math.round(zoom * 100)}%</span>
              </div>
              <div className="px-2 py-1 rounded-md border bg-card/80 text-[11px] shadow-sm backdrop-blur">
                Nodes: <span className="font-mono">{nodes.length}</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="glass">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Live Config Preview</CardTitle>
          <div className="text-xs text-muted-foreground">
            Updates as you drag or edit node properties
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-md border bg-muted/30">
              <div className="px-3 py-2 border-b text-xs font-semibold">Terraform</div>
              <pre className="p-3 text-xs overflow-auto max-h-72 whitespace-pre-wrap">
                {terraformPreview}
              </pre>
            </div>
            <div className="rounded-md border bg-muted/30">
              <div className="px-3 py-2 border-b text-xs font-semibold">Kubernetes</div>
              <pre className="p-3 text-xs overflow-auto max-h-72 whitespace-pre-wrap">
                {k8sPreview}
              </pre>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          Tip: Drag nodes around. Select a node to edit properties.
        </div>
        <div className="flex gap-2">
          <Button variant="destructive" onClick={removeSelected} disabled={!selectedId}>
            Remove Selected
          </Button>
        </div>
      </div>

      {selectedNode && (
        <Card className="glass">
          <CardHeader>
            <CardTitle>Edit Node</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-muted-foreground">ID</div>
                <div className="font-mono">{selectedNode.id}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Type</div>
                <div className="capitalize">{selectedNode.type}</div>
              </div>
            </div>

            {selectedNode.type === "db" && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-muted-foreground mb-1">Engine</div>
                  <select
                    className="w-full bg-background border rounded px-2 py-1"
                    value={selectedNode.props?.engine ?? "postgres"}
                    onChange={(e) => updateSelectedProps({ engine: e.target.value })}
                  >
                    <option value="postgres">Postgres</option>
                    <option value="mysql">MySQL</option>
                  </select>
                </div>
              </div>
            )}

            {selectedNode.type === "api" && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-muted-foreground mb-1">Replicas</div>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    className="w-full bg-background border rounded px-2 py-1"
                    value={selectedNode.props?.replicas ?? 2}
                    onChange={(e) =>
                      updateSelectedProps({ replicas: Math.max(1, Math.min(10, Number(e.target.value) || 1)) })
                    }
                  />
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default InfraCanvas;