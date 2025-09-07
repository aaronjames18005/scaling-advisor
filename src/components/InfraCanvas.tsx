import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";

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
    const rect = (e.currentTarget.parentElement as HTMLDivElement)?.getBoundingClientRect();
    const node = nodes.find((n) => n.id === id);
    if (!rect || !node) return;
    setSelectedId(id);
    setDraggingId(id);
    dragOffset.current = {
      x: e.clientX - (rect.left + node.x),
      y: e.clientY - (rect.top + node.y),
    };
  };

  const canvasRef = useRef<HTMLDivElement>(null);

  const onMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!draggingId || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const nextX = e.clientX - rect.left - dragOffset.current.x;
    const nextY = e.clientY - rect.top - dragOffset.current.y;

    setNodes((prev) =>
      prev.map((n) =>
        n.id === draggingId
          ? {
              ...n,
              x: Math.max(0, Math.min(nextX, rect.width - 120)),
              y: Math.max(0, Math.min(nextY, rect.height - 60)),
            }
          : n
      )
    );
  };

  const onMouseUp = () => {
    setDraggingId(null);
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

    const x = e.clientX - rect.left - 14; // small offset to center better
    const y = e.clientY - rect.top - 14;
    // Constrain within canvas
    const maxX = rect.width - 120; // node width
    const maxY = rect.height - 60; // node height
    addNodeAt(
      type,
      Math.max(0, Math.min(x, maxX)),
      Math.max(0, Math.min(y, maxY))
    );
    setIsDragOver(false); // add: reset state
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
            className={`relative h-[360px] rounded-md border overflow-hidden transition-colors ${
              isDragOver ? "ring-2 ring-primary/60 bg-primary/5" : "bg-gradient-to-br from-background to-muted/40"
            }`}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseUp}
            onMouseDown={() => setSelectedId(null)}
            onDragOver={onDragOverCanvas}
            onDragEnter={() => setIsDragOver(true)}
            onDragLeave={onDragLeaveCanvas}
            onDrop={onDropCanvas}
          >
            {/* background grid */}
            <div className="absolute inset-0 pointer-events-none [background-image:linear-gradient(to_right,hsl(var(--border))_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--border))_1px,transparent_1px)] [background-size:24px_24px] opacity-30" />
            {/* drop hint */}
            {isDragOver && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="px-3 py-1.5 rounded-md text-xs bg-background/80 border shadow-sm">
                  Release to add node
                </div>
              </div>
            )}
            {nodes.map((n) => (
              <div
                key={n.id}
                className={`absolute w-28 select-none cursor-move rounded-lg border shadow-sm transition-transform active:scale-[0.98] ${
                  selectedId === n.id ? "ring-2 ring-primary shadow-lg" : "hover:shadow-md"
                } ${
                  n.type === "db"
                    ? "bg-primary/5 border-primary/30"
                    : n.type === "lb"
                    ? "bg-accent/5 border-accent/30"
                    : "bg-ring/5 border-ring/30"
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
                  className={`px-2 py-1 text-xs font-medium flex items-center gap-2 rounded-t-lg ${
                    n.type === "db"
                      ? "bg-primary/10 text-primary"
                      : n.type === "lb"
                      ? "bg-accent/10 text-accent"
                      : "bg-ring/10 text-ring"
                  }`}
                >
                  <span>{iconForType(n.type)}</span>
                  <span className="truncate">{labelForType(n.type)}</span>
                </div>
                <div className="p-2 text-[10px] text-muted-foreground">
                  {n.type === "db" && <span>engine: {n.props?.engine ?? "postgres"}</span>}
                  {n.type === "api" && <span>replicas: {n.props?.replicas ?? 2}</span>}
                  {n.type === "lb" && <span>public: true</span>}
                </div>
              </div>
            ))}
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