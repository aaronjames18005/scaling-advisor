import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { ZoomIn, ZoomOut, RotateCcw } from "lucide-react";
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

  // Safety helpers for numeric operations (avoid NaN/Infinity)
  const clampZoom = (z: number) => Math.min(3, Math.max(0.8, Number.isFinite(z) ? z : 1)); // increase minimum to avoid squished proportions
  const safeNum = (n: number, fallback = 0) => (Number.isFinite(n) ? n : fallback);

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

  const onMouseDownNode = (
    e: React.MouseEvent<HTMLDivElement>,
    id: string
  ) => {
    e.stopPropagation();
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
  };

  const onDragStartPalette = (e: React.DragEvent<HTMLDivElement>, type: NodeType) => {
    e.dataTransfer.setData("text/plain", type);
    // Indicate move to user agents
    e.dataTransfer.effectAllowed = "copyMove";
  };

  const onDragOverCanvas = (e: React.DragEvent<HTMLDivElement>) => {
    // Allow drop + visual feedback
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    if (!isDragOver) setIsDragOver(true);
  };

  const onDragLeaveCanvas = () => {
    setIsDragOver(false);
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

  return (
    <div className="space-y-4">
      <Card className="glass">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Canvas</CardTitle>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => addNode("db")} className="transition-transform hover:scale-[1.02]">
              Add DB
            </Button>
            <Button variant="outline" onClick={() => addNode("lb")} className="transition-transform hover:scale-[1.02]">
              Add LB
            </Button>
            <Button variant="outline" onClick={() => addNode("api")} className="transition-transform hover:scale-[1.02]">
              Add API
            </Button>
            {/* Zoom controls */}
            <div className="hidden sm:flex items-center ml-2">
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
            <Button onClick={handleGenerate} className="glow-primary">
              Generate
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="mb-3 flex items-center gap-3">
            <div className="text-xs text-muted-foreground">Drag to create:</div>
            <div
              draggable
              onDragStart={(e) => onDragStartPalette(e, "db")}
              className="px-2 py-1 text-xs rounded-md border bg-card/80 hover:bg-primary/10 hover:text-primary cursor-grab active:cursor-grabbing select-none transition-colors shadow-sm"
              title="Drag to canvas"
              aria-label="Drag to create Database node"
            >
              🗄️ Database
            </div>
            <div
              draggable
              onDragStart={(e) => onDragStartPalette(e, "lb")}
              className="px-2 py-1 text-xs rounded-md border bg-card/80 hover:bg-accent/10 hover:text-accent cursor-grab active:cursor-grabbing select-none transition-colors shadow-sm"
              title="Drag to canvas"
              aria-label="Drag to create Load Balancer node"
            >
              ⚖️ Load Balancer
            </div>
            <div
              draggable
              onDragStart={(e) => onDragStartPalette(e, "api")}
              className="px-2 py-1 text-xs rounded-md border bg-card/80 hover:bg-ring/10 hover:text-ring cursor-grab active:cursor-grabbing select-none transition-colors shadow-sm"
              title="Drag to canvas"
              aria-label="Drag to create API Server node"
            >
              🖥️ API Server
            </div>
          </div>

          <div
            ref={canvasRef}
            className={`relative h-[60vh] md:h-[480px] rounded-md border overflow-hidden transition-colors ${
              isDragOver ? "ring-2 ring-primary/60 bg-primary/5" : "bg-gradient-to-br from-background to-muted/40"
            }`}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseUp}
            onMouseDown={(e) => {
              // start panning only if background is clicked (not a node)
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
          >
            {/* Inner world: pans & zooms together with nodes and grid */}
            <div
              className="absolute inset-0"
              style={{
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                transformOrigin: "0 0",
              }}
            >
              {/* background grid that pans/zooms with content */}
              <div className="absolute inset-0 pointer-events-none [background-image:linear-gradient(to_right,hsl(var(--border))_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--border))_1px,transparent_1px)] [background-size:24px_24px] opacity-20 [mask-image:radial-gradient(ellipse_at_center,black,transparent_70%)]" />
              {/* drop hint */}
              {isDragOver && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="px-3 py-1.5 rounded-md text-xs bg-background/80 border shadow-sm">
                    Release to add node
                  </div>
                </div>
              )}
              {nodes.map((n) => (
                <motion.div
                  key={n.id}
                  data-node
                  initial={{ scale: 0.95, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ duration: 0.15 }}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className={`absolute w-28 select-none rounded-lg border shadow-sm transition-all duration-150 ${
                    selectedId === n.id ? "ring-2 ring-primary glow-primary shadow-lg" : "hover:shadow-md"
                  } ${
                    draggingId === n.id ? "scale-[0.98] cursor-grabbing" : "cursor-move"
                  } backdrop-blur-sm ${
                    n.type === "db"
                      ? "bg-primary/10 border-primary/30 hover:bg-primary/15"
                      : n.type === "lb"
                      ? "bg-accent/10 border-accent/30 hover:bg-accent/15"
                      : "bg-ring/10 border-ring/30 hover:bg-ring/15"
                  }`}
                  style={{ left: n.x, top: n.y }}
                  onMouseDown={(e) => onMouseDownNode(e, n.id)}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedId(n.id);
                  }}
                  title={`${labelForType(n.type)} • Drag to move`}
                  aria-label={`${labelForType(n.type)} node`}
                >
                  <div
                    className={`px-2 py-1 text-[11px] font-semibold flex items-center gap-2 rounded-t-lg tracking-wide ${
                      n.type === "db"
                        ? "bg-primary/15 text-primary"
                        : n.type === "lb"
                        ? "bg-accent/15 text-accent"
                        : "bg-ring/15 text-ring"
                    }`}
                  >
                    <span className="inline-flex items-center justify-center w-1.5 h-1.5 rounded-full bg-current" />
                    <span>{iconForType(n.type)}</span>
                    <span className="truncate uppercase">{labelForType(n.type)}</span>
                  </div>
                  <div className="p-2 text-[10px] text-muted-foreground space-x-1">
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
                </motion.div>
              ))}
            </div>

            {/* Status HUD (does not pan/zoom) */}
            <div className="pointer-events-none absolute bottom-2 right-2 flex items-center gap-2">
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